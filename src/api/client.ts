import type {
  AgentInfo, ChatMessage, FileDiff, FileNode, FileStatus, FormInfo, InboxItem,
  ModelRef, PermissionRequest, Project, Protocol, Pty, QuestionRequest, ServerInfo,
  ServerProfile, Session, Todo, VcsInfo,
} from './types';
import { encodeBase64 } from '../utils/base64';
import { normalizeMessageV1, normalizeMessageV2 } from './normalize';

export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!url.endsWith('/')) url += '/';
  return url;
}

export function originOf(baseUrl: string): string {
  return normalizeBaseUrl(baseUrl).replace(/\/+$/, '');
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`HTTP ${status}${body ? `: ${body.slice(0, 400)}` : ''}`);
    this.status = status;
    this.body = body;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildQuery(params?: Query): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export interface RequestOptions {
  method?: string;
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

// The global session scan walks every page of every session on the server.
// HomeScreen asks for it once per configured directory, so the result is
// cached briefly per client instance to avoid N identical full scans.
const GLOBAL_SCAN_TTL_MS = 2000;

export class ApiClient {
  profile: ServerProfile;
  protocol: Protocol;
  directory?: string;
  private globalCache?: { at: number; sessions: Session[] };
  private globalPending?: { at: number; promise: Promise<Session[]> };

  constructor(profile: ServerProfile, directory?: string) {
    this.profile = profile;
    this.protocol = profile.protocol;
    this.directory = directory || undefined;
  }

  get isV2() {
    return this.protocol === 'v2';
  }

  private authHeader(): Record<string, string> {
    const { username, password } = this.profile;
    if (password && username) {
      return { Authorization: `Basic ${encodeBase64(`${username}:${password}`)}` };
    }
    return {};
  }

  url(path: string, query?: Query): string {
    const base = normalizeBaseUrl(this.profile.baseUrl);
    return `${base}${path.replace(/^\/+/, '')}${buildQuery(query)}`;
  }

  // A route that does not exist answers 404/405/501 — or, on v2 servers that
  // fall back to the SPA, 200 with an HTML document ("Not a JSON endpoint").
  // Only those mean "this build has no such route"; every other status is a
  // real error and must not be swallowed by a fallback.
  private isRouteMissing(e: unknown): boolean {
    if (!(e instanceof ApiError)) return false;
    if (e.status === 404 || e.status === 405 || e.status === 501) return true;
    return e.status === 200 && e.body.includes('Not a JSON endpoint');
  }

  private minimalSession(id: string, input: { title?: string }): Session {
    return {
      id,
      title: input.title || 'Untitled session',
      directory: this.directory,
      raw: { id, title: input.title },
    };
  }

  async raw(path: string, opts: RequestOptions = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...this.authHeader(),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      };
      const res = await fetch(this.url(path, opts.query), {
        method: opts.method || 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.raw(path, opts);
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text);
    if (!text) return undefined as T;
    const contentType = res.headers.get('content-type') || '';
    // The web UI serves index.html for unknown routes; never treat that as JSON.
    if (contentType.includes('text/html') && text.trimStart().startsWith('<')) {
      throw new ApiError(200, `Not a JSON endpoint: ${path}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  // ---- server ----
  async info(): Promise<ServerInfo> {
    try {
      return await this.request<ServerInfo>('api/info', { timeoutMs: 8000 });
    } catch {
      // v2 serves the SPA HTML at /api/info; health is the real endpoint.
      return this.health();
    }
  }

  async health(): Promise<ServerInfo> {
    if (this.isV2) {
      try {
        return await this.request<ServerInfo>('api/health', { timeoutMs: 6000 });
      } catch {
        return this.request<ServerInfo>('api/info', { timeoutMs: 6000 });
      }
    }
    return this.request<ServerInfo>('global/health', { timeoutMs: 6000 });
  }

  // ---- sessions ----
  private async fetchSessionPage(queryDir?: string): Promise<Session[]> {
    const out: Session[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await this.request<any>('api/session', {
        query: { directory: queryDir, cursor },
      });
      const items = Array.isArray(res) ? res : res?.data ?? res?.items ?? res?.sessions ?? [];
      out.push(...items.map(normalizeSessionV2));
      const next = res?.cursor?.next ?? res?.nextCursor;
      cursor = typeof next === 'string' ? next : undefined;
      if (!cursor) break;
    }
    return out;
  }

  // The global scan (all locations) is identical for every directory, so it is
  // cached for a short while. The directory-scoped scan is never cached.
  private globalSessions(): Promise<Session[]> {
    const now = Date.now();
    const cached = this.globalCache;
    if (cached && now - cached.at < GLOBAL_SCAN_TTL_MS) return Promise.resolve(cached.sessions);
    const pending = this.globalPending;
    if (pending && now - pending.at < GLOBAL_SCAN_TTL_MS) return pending.promise;
    const promise = this.fetchSessionPage(undefined).then(
      (sessions) => {
        this.globalCache = { at: Date.now(), sessions };
        this.globalPending = undefined;
        return sessions;
      },
      (e) => {
        this.globalPending = undefined;
        throw e;
      },
    );
    this.globalPending = { at: now, promise };
    return promise;
  }

  async listSessions(directory?: string): Promise<Session[]> {
    const dir = directory ?? this.directory;
    if (!this.isV2) {
      const list = await this.request<any[]>('session', { query: { directory: dir } });
      // Child sessions (parentID set) are subagent sessions spawned inside a
      // parent conversation; they belong on the parent's "Child sessions"
      // list, not the top-level listing.
      return (list || []).map(normalizeSessionV1).filter((s) => !s.parentID);
    }
    // The directory-scoped endpoint returns [] for unknown/stale paths instead
    // of an error, which would blank the whole list. Always fetch the global
    // list (all locations) and filter client-side for the requested directory.
    const global = await this.globalSessions();
    if (!dir) return global.filter((s) => !s.parentID);
    const scoped = await this.fetchSessionPage(dir).catch(() => [] as Session[]);
    const seen = new Set<string>();
    const out: Session[] = [];
    for (const s of [...scoped, ...global.filter((x) => x.directory === dir)]) {
      // Drop subagent (child) sessions as above, including mid-page duplicates
      // with different parent info.
      if (!s.id || seen.has(s.id) || s.parentID) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }

  async childSessions(parentID: string): Promise<Session[]> {
    if (!this.isV2) {
      const list = await this.request<any[]>('session', { query: { directory: this.directory, parentID } });
      return (list || []).map(normalizeSessionV1).filter((s) => s.parentID === parentID);
    }
    const res = await this.request<any>('api/session', {
      query: { directory: this.directory, parentID },
    });
    const items = Array.isArray(res) ? res : res?.data ?? res?.items ?? [];
    return items.map(normalizeSessionV2);
  }

  async getSession(id: string): Promise<Session> {
    if (!this.isV2) {
      return normalizeSessionV1(await this.request('session/' + id, { query: { directory: this.directory } }));
    }
    const res = await this.request<any>('api/session/' + id);
    return normalizeSessionV2(res?.data ?? res);
  }

  async createSession(input: { parentID?: string; title?: string }): Promise<Session> {
    if (!this.isV2) {
      return normalizeSessionV1(await this.request('session', {
        method: 'POST', query: { directory: this.directory }, body: input,
      }));
    }
    const body = { ...input, location: this.directory ? { directory: this.directory } : undefined };
    const res = await this.request<any>('api/session', { method: 'POST', body });
    return normalizeSessionV2(res?.data ?? res);
  }

  async updateSession(id: string, input: { title?: string; archived?: boolean; time?: any }): Promise<Session> {
    if (this.isV2) {
      // The spec route only accepts title/metadata/permissions/archived.
      const v2Body: any = {};
      if (input.title !== undefined) v2Body.title = input.title;
      if (input.archived !== undefined) v2Body.archived = input.archived;
      try {
        const res = await this.request<any>('api/session/' + id, { method: 'PATCH', body: v2Body });
        // A successful PATCH answers 204 (no body) — re-read the session so
        // the caller sees the new title instead of nothing.
        if (res === undefined || res === null) {
          return await this.getSession(id).catch(() => this.minimalSession(id, input));
        }
        return normalizeSessionV2(res?.data ?? res);
      } catch (e) {
        // Route absent on this build — fall back to the v1 compat route.
        if (!this.isRouteMissing(e)) throw e;
      }
    }
    const body: any = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.archived !== undefined) body.archived = input.archived;
    if (input.time !== undefined) body.time = input.time;
    const res = await this.request('session/' + id, {
      method: 'PATCH', query: { directory: this.directory }, body,
    });
    return res ? normalizeSessionV1(res) : this.minimalSession(id, input);
  }

  async deleteSession(id: string): Promise<void> {
    if (this.isV2) {
      try {
        await this.request('api/session/' + id, { method: 'DELETE' });
        return;
      } catch (e) {
        // Route absent on this build — fall back to the v1 compat route.
        if (!this.isRouteMissing(e)) throw e;
      }
    }
    await this.request('session/' + id, { method: 'DELETE', query: { directory: this.directory } });
  }

  async messages(sessionID: string, limit = 200): Promise<ChatMessage[]> {
    if (!this.isV2) {
      const list = await this.request<any[]>('session/' + sessionID + '/message', {
        query: { directory: this.directory, limit: Math.max(limit, 1000) },
      });
      return (list || []).map((m) => normalizeMessageV1(m, sessionID))
        .sort((a, b) => (a.created || 0) - (b.created || 0));
    }
    // v2 /api/session/:id/message only serves messages stored in the new format;
    // sessions created before the storage migration are readable only through
    // the v1 endpoint (and new-format sessions return [] on v1). Ask v2 first
    // and only fall back to the legacy route when it yields nothing, so the
    // expensive legacy request is not paid for on every load.
    let v2items: any[] = [];
    let v2error: unknown = null;
    try {
      const res = await this.request<any>('api/session/' + sessionID + '/message', { query: { limit, order: 'desc' } });
      const items = Array.isArray(res) ? res : res?.data ?? res?.items ?? res?.messages ?? [];
      v2items = Array.isArray(items) ? items : [];
    } catch (e) {
      v2error = e;
    }
    let v1items: any[] = [];
    let v1error: unknown = null;
    if (v2items.length === 0) {
      try {
        const res = await this.request<any[]>('session/' + sessionID + '/message', {
          query: { directory: this.directory, limit: 1000 },
        });
        v1items = Array.isArray(res) ? res : [];
      } catch (e) {
        v1error = e;
      }
    }
    if (v2error && v1error) throw v2error;
    const merged = new Map<string, ChatMessage>();
    for (const m of v2items) {
      const n = normalizeMessageV2(m, sessionID);
      if (n.id) merged.set(n.id, n);
    }
    for (const m of v1items) {
      const n = normalizeMessageV1(m, sessionID);
      if (n.id && !merged.has(n.id)) merged.set(n.id, n);
    }
    return [...merged.values()].sort((a, b) => (a.created || 0) - (b.created || 0));
  }

  async prompt(sessionID: string, input: {
    text: string;
    files?: any[];
    agents?: any[];
    model?: ModelRef | null;
    variant?: string | null;
    agent?: string | null;
    delivery?: 'queue' | 'steer';
  }): Promise<any> {
    if (!this.isV2) {
      const parts: any[] = [];
      if (input.text) parts.push({ type: 'text', text: input.text });
      for (const f of input.files || []) {
        parts.push({ type: 'file', mime: f.mime, url: f.dataUrl || f.uri, filename: f.name });
      }
      return this.request('session/' + sessionID + '/prompt_async', {
        method: 'POST',
        query: { directory: this.directory },
        body: {
          parts,
          model: input.model ? { providerID: input.model.providerID, modelID: input.model.modelID } : undefined,
          variant: input.variant || input.model?.variant || undefined,
          agent: input.agent || undefined,
          delivery: input.delivery,
        },
      });
    }
    const files = (input.files || []).map((f) => ({ uri: f.dataUrl || f.uri, name: f.name }));
    const agents = input.agents?.length ? input.agents : undefined;
    const delivery = input.delivery ? { delivery: input.delivery } : {};
    try {
      // The spec body is flat: { text, files, agents, ...delivery }.
      return await this.request('api/session/' + sessionID + '/prompt', {
        method: 'POST',
        body: { text: input.text, files, agents, ...delivery },
      });
    } catch (e) {
      // Builds that expect the wrapped shape { prompt: {...}, delivery }.
      if (e instanceof ApiError && e.status === 400) {
        return await this.request('api/session/' + sessionID + '/prompt', {
          method: 'POST',
          body: { prompt: { text: input.text, files, agents }, ...delivery },
        });
      }
      throw e;
    }
  }

  async abort(sessionID: string): Promise<void> {
    if (!this.isV2) {
      await this.request('session/' + sessionID + '/abort', {
        method: 'POST', query: { directory: this.directory },
      });
    } else {
      await this.request('api/session/' + sessionID + '/interrupt', { method: 'POST' });
    }
  }

  async selectAgent(sessionID: string, agent: string): Promise<void> {
    if (!this.isV2) return;
    await this.request('api/session/' + sessionID + '/agent', { method: 'POST', body: { agent } });
  }

  async selectModel(sessionID: string, model: ModelRef): Promise<void> {
    if (!this.isV2) return;
    await this.request('api/session/' + sessionID + '/model', {
      method: 'POST',
      body: { model: { id: model.modelID, providerID: model.providerID, ...(model.variant ? { variant: model.variant } : {}) } },
    });
    // The prompt endpoint ignores per-prompt model fields on v2 servers — the
    // session model is the only thing that counts. Verify the POST actually
    // applied it so the UI never shows a model the server is not using.
    try {
      const sess = await this.getSession(sessionID);
      const m: any = sess?.raw?.model ?? (sess as any)?.model;
      const applied = m && (m.modelID || m.id) === model.modelID && m.providerID === model.providerID;
      if (!applied) {
        throw new Error(`Server did not switch model (still ${m?.providerID || '?'}/${m?.id || m?.modelID || '?'})`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Server did not switch')) throw e;
      // Verification lookup itself failed — don't mask a successful POST.
    }
  }

  async fork(id: string, messageID?: string): Promise<Session> {
    if (this.isV2) {
      try {
        // The spec body prop is "before" (the message to fork from).
        const res = await this.request<any>('api/session/' + id + '/fork', {
          method: 'POST',
          body: messageID ? { before: messageID } : {},
        });
        return normalizeSessionV2(res?.data ?? res);
      } catch (e) {
        // Route absent on this build — fall back to the v1 compat route.
        if (!this.isRouteMissing(e)) throw e;
      }
    }
    const res = await this.request('session/' + id + '/fork', {
      method: 'POST', query: { directory: this.directory }, body: messageID ? { messageID } : {},
    });
    return res ? normalizeSessionV1(res) : this.minimalSession(id, {});
  }

  async revert(id: string, messageID: string, partID?: string): Promise<any> {
    if (!this.isV2) {
      return this.request('session/' + id + '/revert', {
        method: 'POST', query: { directory: this.directory }, body: { messageID, partID },
      });
    }
    // v2 splits revert into stage + commit; staging alone changes nothing.
    await this.request('api/session/' + id + '/revert/stage', {
      method: 'POST', body: { messageID },
    });
    return this.request('api/session/' + id + '/revert/commit', { method: 'POST' });
  }

  async unrevert(id: string): Promise<any> {
    if (!this.isV2) {
      try {
        return await this.request('session/' + id + '/unrevert', {
          method: 'POST', query: { directory: this.directory },
        });
      } catch (e) {
        // Some v1 builds only expose the spec DELETE route.
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
          return this.request('session/' + id + '/revert', {
            method: 'DELETE', query: { directory: this.directory },
          });
        }
        throw e;
      }
    }
    // v2 clears a staged revert with DELETE /api/session/:id/revert.
    return this.request('api/session/' + id + '/revert', { method: 'DELETE' });
  }

  async summarize(id: string, model?: ModelRef): Promise<any> {
    return this.request('session/' + id + '/summarize', {
      method: 'POST',
      query: { directory: this.directory },
      body: model ? { providerID: model.providerID, modelID: model.modelID } : {},
    });
  }

  async compact(id: string): Promise<any> {
    // The request body is required (it may be empty).
    if (this.isV2) {
      try {
        return await this.request('api/session/' + id + '/compact', { method: 'POST', body: {} });
      } catch (e) {
        // Route absent on this build — fall back to the v1 compat route.
        if (!this.isRouteMissing(e)) throw e;
      }
    }
    return this.request('session/' + id + '/compact', { method: 'POST', body: {} });
  }

  // ---- prompts / inbox ----
  async inbox(sessionID: string): Promise<InboxItem[]> {
    if (!this.isV2) return [];
    try {
      const res = await this.request<any>('api/session/' + sessionID + '/inbox');
      return res?.data ?? res?.items ?? [];
    } catch {
      return []; // route absent on some v2 builds; queued prompts still deliver
    }
  }

  async inboxMove(sessionID: string, itemID: string, action: 'queue' | 'steer'): Promise<void> {
    try {
      await this.request(`api/session/${sessionID}/inbox/${itemID}`, {
        method: 'PATCH', body: { delivery: action },
      });
    } catch {
      await this.request(`api/session/${sessionID}/inbox/${itemID}/${action}`, {
        method: 'POST', body: { delivery: action },
      });
    }
  }

  async inboxRemove(sessionID: string, itemID: string): Promise<void> {
    await this.request(`api/session/${sessionID}/inbox/${itemID}`, { method: 'DELETE' });
  }

  // ---- catalog ----
  async agents(): Promise<AgentInfo[]> {
    if (!this.isV2) {
      const list = await this.request<any[]>('agent', { query: { directory: this.directory } });
      return (list || []).map((a) => ({ name: a.name || a.id, description: a.description, mode: a.mode, model: a.model, color: a.color, hidden: a.hidden, raw: a } as any));
    }
    const res = await this.request<any>('api/agent', { query: { 'location[directory]': this.directory } });
    const items = res?.data ?? res?.items ?? res ?? [];
    return (Array.isArray(items) ? items : []).map((a: any) => ({
      name: a.name || a.id, description: a.description, mode: a.mode, model: a.model, color: a.color, hidden: a.hidden, raw: a,
    }));
  }

  async commands(): Promise<any[]> {
    if (!this.isV2) {
      return (await this.request<any[]>('command', { query: { directory: this.directory } })) || [];
    }
    const res = await this.request<any>('api/command', { query: { 'location[directory]': this.directory } });
    return res?.data ?? res?.items ?? res ?? [];
  }

  async skills(): Promise<any[]> {
    if (!this.isV2) return [];
    const res = await this.request<any>('api/skill', { query: { 'location[directory]': this.directory } });
    return res?.data ?? res?.items ?? res ?? [];
  }

  async providers(): Promise<{ providers: any[]; default: Record<string, string> }> {
    if (!this.isV2) {
      const res = await this.request<any>('config/providers', { query: { directory: this.directory } });
      return { providers: res?.providers ?? [], default: res?.default ?? {} };
    }
    const [modelsRes, providersRes, defaultRes] = await Promise.all([
      this.request<any>('api/model', { query: { 'location[directory]': this.directory } }),
      this.request<any>('api/provider', { query: { 'location[directory]': this.directory } }),
      this.request<any>('api/model/default', { query: { 'location[directory]': this.directory } }).catch(() => null),
    ]);
    const providers = providersRes?.data ?? providersRes?.items ?? providersRes ?? [];
    const modelList = modelsRes?.data ?? modelsRes?.items ?? modelsRes ?? [];
    const defRaw = defaultRes?.data ?? defaultRes;
    const fallback = modelList.find((m: any) => m?.providerID && (m.id || m.modelID));
    return {
      providers: (Array.isArray(providers) ? providers : []).map((p: any) => ({
        ...p,
        models: (Array.isArray(modelList) ? modelList : []).filter((m: any) => (m.providerID || m.canonical) === p.id),
      })),
      default: defRaw && typeof defRaw === 'object'
        ? defRaw
        : fallback ? { providerID: fallback.providerID, modelID: fallback.modelID || fallback.id, variant: fallback.variant } : {},
    };
  }

  async mcp(): Promise<any[]> {
    if (!this.isV2) {
      return (await this.request<any[]>('mcp', { query: { directory: this.directory } })) || [];
    }
    try {
      const res = await this.request<any>('api/mcp', { query: { 'location[directory]': this.directory } });
      return res?.data ?? res?.items ?? res ?? [];
    } catch {
      return []; // route absent on some v2 builds
    }
  }

  // ---- project / fs ----
  async currentProject(): Promise<Project> {
    if (!this.isV2) {
      return this.request<Project>('project/current', { query: { directory: this.directory } });
    }
    const res = await this.request<any>('api/location', { query: { 'location[directory]': this.directory } });
    return res?.data ?? res;
  }

  async location(): Promise<any> {
    if (!this.isV2) {
      return this.request<any>('path', { query: { directory: this.directory } });
    }
    return this.request<any>('api/location', { query: { 'location[directory]': this.directory } });
  }

  async listFiles(path = '.'): Promise<FileNode[]> {
    if (!this.isV2) {
      return (await this.request<FileNode[]>('file', { query: { path, directory: this.directory } })) || [];
    }
    const res = await this.request<any>('api/fs/list', {
      query: { path, 'location[directory]': this.directory },
    });
    const items = res?.data ?? res?.items ?? res ?? [];
    return (Array.isArray(items) ? items : []).map((e: any) => ({
      name: e.name || e.path?.split('/').pop() || e.path,
      path: e.path,
      type: e.type === 'directory' || e.type === 'dir' ? 'directory' : 'file',
      ignored: e.ignored,
    }));
  }

  // ---- changes ----
  async sessionDiff(sessionID: string, messageID?: string): Promise<FileDiff[]> {
    if (!this.isV2) {
      return (await this.request<FileDiff[]>('session/' + sessionID + '/diff', {
        query: { directory: this.directory, messageID },
      })) || [];
    }
    try {
      const res = await this.request<any>('api/session/' + sessionID + '/diff', {
        query: { from: messageID, context: 3 },
      });
      return res?.data ?? res?.items ?? res ?? [];
    } catch {
      // Older v2 builds omit this route; the classic diff endpoint still works.
      return (await this.request<FileDiff[]>('session/' + sessionID + '/diff', {
        query: { directory: this.directory, messageID },
      })) || [];
    }
  }

  async vcs(): Promise<VcsInfo> {
    if (!this.isV2) {
      return this.request<VcsInfo>('vcs', { query: { directory: this.directory } });
    }
    try {
      const res = await this.request<any>('api/vcs', { query: { 'location[directory]': this.directory } });
      return res?.data ?? res ?? {};
    } catch {
      return this.request<VcsInfo>('vcs', { query: { directory: this.directory } });
    }
  }

  async vcsStatus(): Promise<FileStatus[]> {
    if (!this.isV2) {
      return (await this.request<FileStatus[]>('vcs/status', { query: { directory: this.directory } })) || [];
    }
    try {
      const res = await this.request<any>('api/vcs/status', { query: { 'location[directory]': this.directory } });
      return res?.data ?? res?.items ?? res ?? [];
    } catch {
      return (await this.request<FileStatus[]>('vcs/status', { query: { directory: this.directory } })) || [];
    }
  }

  async vcsDiff(mode?: string, context?: number): Promise<FileDiff[]> {
    // The diff API only accepts mode "working" | "branch" | "committed"; UI
    // modes like "working" map to the working-tree diff.
    const m = mode === 'branch' ? 'branch' : 'working';
    if (!this.isV2) {
      return (await this.request<FileDiff[]>('vcs/diff', {
        query: { directory: this.directory, mode: m, context },
      })) || [];
    }
    try {
      const res = await this.request<any>('api/vcs/diff', {
        query: { 'location[directory]': this.directory, mode: m, context },
      });
      return res?.data ?? res?.items ?? res ?? [];
    } catch {
      return (await this.request<FileDiff[]>('vcs/diff', {
        query: { directory: this.directory, mode: m, context },
      })) || [];
    }
  }

  // ---- todos / permissions / questions / forms ----
  async activeSessions(): Promise<string[]> {
    if (!this.isV2) {
      const map = await this.request<Record<string, any>>('session/status', {
        query: { directory: this.directory },
      }).catch(() => ({} as Record<string, any>));
      return Object.entries(map || {})
        .filter(([, v]) => v && (v.type === 'busy' || v.type === 'retry' || v.status === 'running'))
        .map(([id]) => id);
    }
    const res = await this.request<any>('api/session/active', {
      query: { directory: this.directory },
    }).catch(() => null);
    const data = res?.data ?? res?.items ?? res?.sessions ?? res ?? [];
    if (data && !Array.isArray(data) && typeof data === 'object') {
      return Object.entries(data)
        .filter(([, v]: any) => !v || v.type === 'running' || v.type === 'busy' || v.type === 'retry' || v.status === 'running')
        .map(([id]) => id)
        .filter(Boolean);
    }
    return (Array.isArray(data) ? data : []).map((s: any) => (typeof s === 'string' ? s : s.id)).filter(Boolean);
  }

  async readFile(path: string): Promise<string> {
    if (!this.isV2) {
      const res = await this.raw('file', { query: { path, directory: this.directory } });
      const text = await res.text();
      if (!res.ok) throw new ApiError(res.status, text);
      try {
        const parsed = JSON.parse(text);
        return typeof parsed === 'string' ? parsed : parsed?.content ?? parsed?.text ?? text;
      } catch { return text; }
    }
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const res = await this.raw(`api/fs/read/${encoded}`, {
      query: { 'location[directory]': this.directory },
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text);
    return text;
  }

  async todos(sessionID: string): Promise<Todo[]> {
    if (!this.isV2) {
      return (await this.request<Todo[]>('session/' + sessionID + '/todo', {
        query: { directory: this.directory },
      })) || [];
    }
    return [];
  }

  async permissions(): Promise<PermissionRequest[]> {
    if (!this.isV2) {
      const res = await this.request<any[]>('permission', { query: { directory: this.directory } });
      return res || [];
    }
    const res = await this.request<any>('api/permission/request', {
      query: { 'location[directory]': this.directory },
    });
    return res?.data ?? res?.items ?? res ?? [];
  }

  async replyPermission(sessionID: string, permissionID: string, response: 'once' | 'always' | 'reject'): Promise<void> {
    if (!this.isV2) {
      await this.request(`session/${sessionID}/permissions/${permissionID}`, {
        method: 'POST', query: { directory: this.directory }, body: { response },
      });
    } else {
      await this.request(`api/session/${sessionID}/permission/${permissionID}/reply`, {
        method: 'POST', body: { decision: response },
      });
    }
  }

  async questions(): Promise<QuestionRequest[]> {
    if (!this.isV2) {
      const res = await this.request<any[]>('question', { query: { directory: this.directory } });
      return res || [];
    }
    const res = await this.request<any>('api/question/request', {
      query: { 'location[directory]': this.directory },
    });
    return res?.data ?? res?.items ?? res ?? [];
  }

  async replyQuestion(sessionID: string, questionID: string, answers: string[][]): Promise<void> {
    if (!this.isV2) {
      await this.request(`question/${questionID}/reply`, {
        method: 'POST', query: { directory: this.directory }, body: { answers },
      });
    } else {
      await this.request(`api/session/${sessionID}/question/${questionID}/reply`, {
        method: 'POST', body: { answers },
      });
    }
  }

  async rejectQuestion(sessionID: string, questionID: string): Promise<void> {
    if (!this.isV2) {
      await this.request(`question/${questionID}/reject`, {
        method: 'POST', query: { directory: this.directory },
      });
    } else {
      await this.request(`api/session/${sessionID}/question/${questionID}/reject`, { method: 'POST' });
    }
  }

  async forms(): Promise<FormInfo[]> {
    if (!this.isV2) return [];
    try {
      const res = await this.request<any>('api/form', { query: { 'location[directory]': this.directory } });
      const items = res?.data ?? res?.items ?? res ?? [];
      return (Array.isArray(items) ? items : []) as FormInfo[];
    } catch {
      return []; // route absent on some v2 builds
    }
  }

  async replyForm(sessionID: string, formID: string, answers: Record<string, any>): Promise<void> {
    await this.request(`api/session/${sessionID}/form/${formID}/reply`, {
      method: 'POST', body: { answer: answers },
    });
  }

  // ---- terminals ----
  async ptys(): Promise<Pty[]> {
    if (!this.isV2) {
      return (await this.request<Pty[]>('pty', { query: { directory: this.directory } })) || [];
    }
    const res = await this.request<any>('api/pty', { query: { 'location[directory]': this.directory } });
    return res?.data ?? res?.items ?? res ?? [];
  }

  async createPty(cwd?: string): Promise<Pty> {
    if (!this.isV2) {
      return this.request<Pty>('pty', { method: 'POST', query: { directory: this.directory }, body: { cwd } });
    }
    const res = await this.request<any>('api/pty', {
      method: 'POST', query: { 'location[directory]': this.directory }, body: { args: [], title: 'Terminal', env: {}, cwd },
    });
    return res?.data ?? res;
  }

  async removePty(id: string): Promise<void> {
    if (!this.isV2) {
      await this.request('pty/' + id, { method: 'DELETE', query: { directory: this.directory } });
    } else {
      await this.request('api/pty/' + id, { method: 'DELETE', query: { 'location[directory]': this.directory } });
    }
  }

  async resizePty(id: string, cols: number, rows: number): Promise<void> {
    const body = { size: { cols, rows } };
    if (!this.isV2) {
      await this.request('pty/' + id, { method: 'PUT', query: { directory: this.directory }, body });
    } else {
      await this.request('api/pty/' + id, { method: 'PUT', query: { 'location[directory]': this.directory }, body });
    }
  }

  async ptyTicket(id: string): Promise<string | null> {
    if (!this.isV2) return null;
    // Some v2 builds reject token requests outright (403); the WS connect
    // endpoint accepts Basic auth / auth_token directly, so a ticket is
    // optional — never let this throw.
    try {
      const res = await this.request<any>('api/pty/' + id + '/connect-token', {
        method: 'POST', query: { 'location[directory]': this.directory },
      });
      return res?.data?.ticket ?? res?.ticket ?? null;
    } catch {
      return null;
    }
  }

  ptySocketUrl(id: string, cursor = '0', ticket?: string | null): { url: string; headers: Record<string, string> } {
    const origin = originOf(this.profile.baseUrl).replace(/^http/, 'ws');
    const base = this.isV2 ? 'api/pty/' : 'pty/';
    const params = new URLSearchParams();
    if (this.directory) {
      if (this.isV2) params.set('location[directory]', this.directory);
      else params.set('directory', this.directory);
    }
    params.set('cursor', cursor);
    if (ticket) params.set('ticket', ticket);
    let headers: Record<string, string> = {};
    if (this.profile.password) {
      const token = encodeBase64(`${this.profile.username || 'opencode'}:${this.profile.password}`);
      // The original client passes auth_token as a query param on both server
      // generations (WS handshakes cannot always set headers).
      params.set('auth_token', token);
      headers = { Authorization: `Basic ${token}` };
    }
    return {
      url: `${origin}/${base}${id}/connect?${params.toString()}`,
      headers,
    };
  }
}

export function normalizeSessionV1(s: any): Session {
  return {
    id: s.id,
    title: s.title || 'Untitled session',
    slug: s.slug,
    projectID: s.projectID,
    directory: s.directory,
    parentID: s.parentID ?? null,
    version: s.version,
    cost: s.cost,
    tokens: s.tokens,
    time: s.time,
    summary: s.summary,
    revert: s.revert,
    raw: s,
  };
}

export function normalizeSessionV2(s: any): Session {
  return {
    id: s.id,
    title: s.title || 'Untitled session',
    projectID: s.projectID,
    directory: s.location?.directory ?? s.directory,
    parentID: s.parentID ?? null,
    cost: s.cost,
    tokens: s.tokens,
    time: s.time,
    summary: s.summary,
    revert: s.revert,
    raw: s,
  };
}
