import EventSource from 'react-native-sse';
import { ApiClient, normalizeBaseUrl } from './client';
import { encodeBase64 } from '../utils/base64';

export interface ServerEvent {
  type: string;
  properties: any;
  directory?: string;
}

export interface EventSubscription {
  close: () => void;
}

const EVENT_TYPES = [
  'server.connected', 'server.heartbeat', 'session.idle', 'session.status',
  'session.updated', 'session.created', 'session.error', 'session.renamed',
  'session.revert.committed', 'session.usage.updated', 'session.command',
  'message.updated', 'message.part.updated', 'message.part.delta',
  'message.part.removed', 'message.removed', 'message.context',
  'permission.asked', 'permission.replied', 'question.asked', 'question.replied',
  'question.rejected', 'question.v2.replied', 'question.v2.rejected', 'vcs.branch.updated',
  'session.deleted', 'session.diff', 'session.agent.selected', 'session.model.selected',
  'session.moved', 'session.renamed', 'session.retry.scheduled', 'session.usage.updated',
  'session.text.started', 'session.text.delta', 'session.text.ended',
  'session.reasoning.started', 'session.reasoning.delta', 'session.reasoning.ended',
  'session.tool.called', 'session.tool.success', 'session.tool.failed', 'session.tool.progress',
  'session.shell.started', 'session.shell.ended', 'session.step.started', 'session.step.ended',
  'session.step.failed', 'session.inbox.enqueued', 'session.inbox.delivered',
  'session.inbox.cancelled', 'session.inbox.delivery.changed',
  'session.compaction.started', 'session.compaction.delta', 'session.compaction.ended',
  'session.compaction.failed',
  'session.next.agent.switched', 'session.next.model.switched', 'session.next.moved',
  'session.next.prompt.admitted', 'session.next.prompted', 'session.next.retried',
  'session.next.text.started', 'session.next.text.delta', 'session.next.text.ended',
  'session.next.reasoning.started', 'session.next.reasoning.delta', 'session.next.reasoning.ended',
  'session.next.tool.called', 'session.next.tool.success', 'session.next.tool.failed',
  'session.next.tool.progress', 'session.next.tool.input.started', 'session.next.tool.input.delta',
  'session.next.tool.input.ended', 'session.next.step.started', 'session.next.step.ended',
  'session.next.step.failed', 'session.next.shell.started', 'session.next.shell.ended',
  'session.next.usage.updated', 'session.next.compaction.started', 'session.next.compaction.delta',
  'session.next.compaction.ended', 'session.next.compaction.failed',
];

function unwrap(raw: any, directory?: string, fallbackType?: string): ServerEvent | null {
  if (!raw) return null;
  let payload = raw;
  if (raw.payload && typeof raw.payload === 'object') {
    payload = raw.payload;
    directory = raw.directory || directory;
  }
  if (raw.data && typeof raw.data === 'object' && !raw.type) payload = raw.data;
  const type = payload.type || payload.event || fallbackType;
  if (!type) return null;
  return { type, properties: payload.properties ?? payload.data ?? {}, directory: payload.directory || directory };
}

// react-native-sse has no reconnect option: when the stream errors the source
// stays dead (status ERROR, no re-poll). The app re-opens it itself.
const RECONNECT_INITIAL_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const POLLING_INTERVAL_MS = 5000;

interface Channel {
  path: string;
  query: string;
  source: EventSource | null;
  timer: ReturnType<typeof setTimeout> | null;
  backoff: number;
}

export function subscribeEvents(
  client: ApiClient,
  onEvent: (e: ServerEvent) => void,
  onStatus?: (status: 'open' | 'error' | 'closed') => void,
): EventSubscription {
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (client.profile.password) {
    headers.Authorization = `Basic ${encodeBase64(`${client.profile.username || 'opencode'}:${client.profile.password}`)}`;
  }
  const base = normalizeBaseUrl(client.profile.baseUrl);
  const directory = client.directory || '';
  const channels: Channel[] = [];
  let closed = false;

  const handle = (evt: any, fallbackType?: string) => {
    if (!evt?.data || evt.data === '[DONE]') return;
    let parsed: any;
    try { parsed = JSON.parse(evt.data); } catch { return; }
    const e = unwrap(parsed, directory, fallbackType);
    if (e) onEvent(e);
  };

  function closeSource(ch: Channel) {
    const s = ch.source;
    ch.source = null;
    if (!s) return;
    try { s.removeAllEventListeners(); s.close(); } catch {}
  }

  function openChannel(ch: Channel) {
    if (closed) return;
    const es = new EventSource(`${base}${ch.path}${ch.query}` as any, {
      headers,
      pollingInterval: POLLING_INTERVAL_MS,
      lineEndingCharacter: '\n',
    } as any);
    ch.source = es;
    es.addEventListener('open' as any, () => {
      ch.backoff = RECONNECT_INITIAL_MS;
      onStatus?.('open');
    });
    es.addEventListener('error' as any, () => {
      onStatus?.('error');
      scheduleReconnect(ch);
    });
    es.addEventListener('message' as any, (evt: any) => handle(evt));
    // V2 servers use named SSE events (event: session.next.text.delta).
    for (const type of EVENT_TYPES) es.addEventListener(type as any, (evt: any) => handle(evt, type));
  }

  function scheduleReconnect(ch: Channel) {
    if (closed || ch.timer) return;
    const delay = ch.backoff;
    ch.backoff = Math.min(ch.backoff * 2, RECONNECT_MAX_MS);
    ch.timer = setTimeout(() => {
      ch.timer = null;
      if (closed) return;
      // The dead source may have queued its own poll — close it first so the
      // replacement is the only live connection.
      closeSource(ch);
      openChannel(ch);
    }, delay);
  }

  const addChannel = (path: string, query: string) => {
    const ch: Channel = { path, query, source: null, timer: null, backoff: RECONNECT_INITIAL_MS };
    channels.push(ch);
    openChannel(ch);
  };

  const enc = encodeURIComponent(directory);
  if (client.isV2) {
    addChannel('api/event', directory ? `?location%5Bdirectory%5D=${enc}` : '');
  } else {
    // Classic servers broadcast globally; per-directory events carry directory scoping.
    addChannel('global/event', '');
    if (directory) addChannel('event', `?directory=${enc}`);
  }

  return {
    close: () => {
      closed = true;
      for (const ch of channels) {
        if (ch.timer) { clearTimeout(ch.timer); ch.timer = null; }
        closeSource(ch);
      }
      onStatus?.('closed');
    },
  };
}

export { EVENT_TYPES };
