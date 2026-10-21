import type { ChatMessage, ChatPart, PartType, ToolState } from './types';

const KNOWN_TYPES: PartType[] = [
  'text', 'reasoning', 'tool', 'file', 'patch', 'snapshot', 'agent',
  'step-start', 'step-finish', 'compaction', 'subtask',
];

function partType(t: string | undefined): PartType {
  return (KNOWN_TYPES as string[]).includes(t || '') ? (t as PartType) : 'unknown';
}

function normalizeToolState(state: any, part: any): ToolState | undefined {
  if (!state && !part?.state) return undefined;
  const s = state || part.state || {};
  return {
    status: s.status || (part?.state?.status ?? undefined),
    title: s.title,
    input: s.input ?? s.raw,
    output: typeof s.output === 'string' ? s.output : stringify(s.output ?? s.content),
    error: typeof s.error === 'string' ? s.error : s.error ? stringify(s.error) : undefined,
    metadata: s.metadata,
    time: s.time,
    content: s.content,
  };
}

export function stringify(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function normalizePartV1(p: any): ChatPart {
  const type = partType(p?.type);
  return {
    id: p?.id || p?.callID || `${p?.messageID || 'part'}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    text: p?.text,
    reasoning: type === 'reasoning' ? p?.text : undefined,
    tool: p?.tool,
    callID: p?.callID,
    state: normalizeToolState(p?.state, p),
    mime: p?.mime,
    url: p?.url,
    filename: p?.filename,
    source: p?.source,
    agent: p?.agent,
    synthetic: p?.synthetic,
    raw: p,
  };
}

export function normalizePartV2(p: any): ChatPart {
  const type = partType(p?.type);
  const state = p?.state;
  return {
    id: p?.id || p?.callID || `${Math.random().toString(36).slice(2, 10)}`,
    type,
    text: p?.text ?? (typeof p?.content === 'string' ? p.content : undefined),
    reasoning: type === 'reasoning' ? (p?.text ?? p?.reasoning) : undefined,
    tool: p?.name || p?.tool,
    callID: p?.callID || p?.id,
    state: normalizeToolState(state, p),
    mime: p?.mime,
    url: p?.url || p?.uri,
    filename: p?.filename || p?.name,
    agent: p?.agent,
    model: p?.model,
    synthetic: p?.synthetic,
    raw: p,
  };
}

export function normalizeMessageV1(m: any, sessionID: string): ChatMessage {
  const info = m?.info || m || {};
  const parts = Array.isArray(m?.parts) ? m.parts.map(normalizePartV1) : [];
  return {
    id: info.id,
    role: info.role === 'assistant' ? 'assistant' : info.role === 'system' ? 'system' : 'user',
    created: info.time?.created,
    completed: info.time?.completed,
    agent: info.agent || info.mode,
    model: info.model || (info.providerID ? { providerID: info.providerID, modelID: info.modelID, variant: info.variant } : undefined),
    cost: info.cost,
    tokens: info.tokens,
    error: info.error,
    parts,
    pending: !info.time?.completed && info.role === 'assistant',
    delivery: info.delivery,
    raw: { ...m, sessionID },
  };
}

export function normalizeMessageV2(m: any, sessionID: string): ChatMessage {
  const type = m?.type;
  const role: ChatMessage['role'] = type === 'assistant' ? 'assistant'
    : type === 'system' ? 'system'
      : type === 'synthetic' ? 'synthetic'
        : 'user';
  let parts: ChatPart[] = [];
  if (Array.isArray(m?.content)) parts = m.content.map(normalizePartV2);
  if (m?.text && !parts.some((p) => p.type === 'text' || p.type === 'reasoning')) {
    parts.unshift({ id: `${m.id}:text:0`, type: 'text', text: m.text });
  }
  for (const f of m?.files || []) {
    parts.push({
      id: `${m.id}:file:${f.name || f.uri}`,
      type: 'file', mime: f.mime, url: f.uri || f.url, filename: f.name, raw: f,
    });
  }
  for (const a of m?.agents || []) {
    parts.push({ id: `${m.id}:agent:${a.name}`, type: 'agent', agent: a.name, raw: a });
  }
  if (type === 'shell' && m?.command) {
    parts = [
      { id: `${m.id}:text:0`, type: 'text', text: `$ ${m.command}` },
      ...(m.output ? [{ id: `${m.id}:tool`, type: 'tool' as PartType, tool: 'bash', state: { status: m.status, output: m.output } }] : []),
    ];
  }
  if (type === 'compaction') {
    parts = [{ id: `${m.id}:compaction`, type: 'compaction', text: m.summary || m.reason || 'Compacting conversation', raw: m }];
  }
  const rawModel = m?.model;
  const model = rawModel && typeof rawModel === 'object'
    ? { providerID: rawModel.providerID, modelID: rawModel.modelID || rawModel.id, variant: rawModel.variant }
    : rawModel;
  return {
    id: m?.id,
    role,
    created: m?.time?.created ?? m?.time?.completed,
    completed: m?.time?.completed,
    agent: m?.agent,
    model,
    cost: m?.cost,
    tokens: m?.tokens,
    error: m?.error,
    parts,
    pending: type === 'assistant' && !m?.time?.completed && !m?.finish,
    delivery: m?.delivery,
    raw: { ...m, sessionID },
  };
}

export function applyPartDelta(msg: ChatMessage, partID: string, field: string, delta: string): ChatMessage {
  const existing = msg.parts.find((p) => p.id === partID);
  if (!existing) {
    // V2 delta for a part we haven't seen yet (e.g. missed the *.started event):
    // create it, mirroring the server's started handlers.
    if (field === 'input') {
      return upsertPart(msg, { id: partID, type: 'tool', callID: partID, state: { status: 'pending', input: delta } });
    }
    if (field === 'reasoning') {
      return upsertPart(msg, { id: partID, type: 'reasoning', reasoning: delta, text: delta });
    }
    return upsertPart(msg, { id: partID, type: 'text', text: delta });
  }
  const parts = msg.parts.map((p) => {
    if (p.id !== partID) return p;
    if (field === 'text') {
      return { ...p, text: (p.text || '') + delta, reasoning: p.type === 'reasoning' ? (p.reasoning || '') + delta : p.reasoning };
    }
    if (field === 'reasoning') return { ...p, reasoning: (p.reasoning || '') + delta };
    if (field === 'input') {
      return { ...p, state: { ...(p.state || {}), input: (typeof p.state?.input === 'string' ? p.state.input : '') + delta } };
    }
    return p;
  });
  return { ...msg, parts };
}

export function upsertPart(msg: ChatMessage, part: ChatPart): ChatMessage {
  const existing = msg.parts.findIndex((p) => p.id === part.id);
  if (existing === -1) return { ...msg, parts: [...msg.parts, part] };
  const parts = msg.parts.slice();
  const prev = parts[existing];
  // Shallow-merge tool state so partial updates (progress/success/failed) keep
  // fields like `input`, matching the server's own state transitions.
  const state = part.state ? { ...prev.state, ...part.state } : prev.state;
  parts[existing] = { ...prev, ...part, state };
  return { ...msg, parts };
}
