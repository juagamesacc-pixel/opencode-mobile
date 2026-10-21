import { ApiClient, ApiError, normalizeBaseUrl } from './client';
import type { ProbeResult, ServerProfile } from './types';

export class ServerProbeError extends Error {
  kind: 'http' | 'unhealthy' | 'transport';
  status?: number;
  constructor(kind: 'http' | 'unhealthy' | 'transport', message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export function profileForProbe(baseUrl: string, username = 'opencode', password: string | null = null, protocol: 'v1' | 'v2' = 'v2'): ServerProfile {
  return {
    id: 'probe',
    name: 'Probe',
    baseUrl: normalizeBaseUrl(baseUrl),
    username,
    password,
    protocol,
  };
}

async function attempt(profile: ServerProfile, path: string): Promise<any> {
  const client = new ApiClient(profile);
  try {
    return await client.request<any>(path, { timeoutMs: 7000 });
  } catch (err) {
    if (err instanceof ApiError) throw new ServerProbeError('http', `HTTP ${err.status}`, err.status);
    if (err instanceof Error && err.name === 'AbortError') throw new ServerProbeError('transport', 'Timed out');
    throw new ServerProbeError('transport', err instanceof Error ? err.message : String(err));
  }
}

function looksHealthy(info: any): boolean {
  if (!info) return true;
  if (info.healthy === false) return false;
  if (info.health === 'unhealthy') return false;
  return true;
}

interface ProbeFailure {
  label: string;
  message: string;
  kind: ServerProbeError['kind'];
  status?: number;
}

/**
 * Mirrors the Android app's probing order. V2 servers expose /api/info (newer)
 * or /api/health (older opencode 2 previews); classic servers expose
 * /global/health.
 */
export async function probeServer(profile: ServerProfile): Promise<ProbeResult> {
  const base = { ...profile, baseUrl: normalizeBaseUrl(profile.baseUrl) };
  const failures: ProbeFailure[] = [];

  const record = (label: string, e: unknown) => {
    const err = e as ServerProbeError;
    failures.push({
      label,
      message: err?.message ?? String(e),
      kind: err && err.kind ? err.kind : 'transport',
      status: err?.status,
    });
  };

  try {
    const info = await attempt({ ...base, protocol: 'v2' }, 'api/info');
    return { protocol: 'v2', info: info || {} };
  } catch (e) {
    record('api/info', e);
  }

  try {
    const health = await attempt({ ...base, protocol: 'v2' }, 'api/health');
    if (!looksHealthy(health)) throw new ServerProbeError('unhealthy', 'Server reported unhealthy');
    return { protocol: 'v2', info: health || {} };
  } catch (e) {
    record('api/health', e);
  }

  try {
    const health = await attempt({ ...base, protocol: 'v1' }, 'global/health');
    if (!looksHealthy(health)) throw new ServerProbeError('unhealthy', 'Server reported unhealthy');
    return { protocol: 'v1', info: health || {} };
  } catch (e) {
    record('global/health', e);
  }

  // The kind of the first failure decides what the user is told: an HTTP 401
  // is a credential problem, not a missing health endpoint.
  const first = failures[0];
  const kind: ServerProbeError['kind'] = first ? first.kind : 'transport';
  const status = first?.status;
  const detail = failures.map((f) => `${f.label}: ${f.message}`).join(' · ');
  if (kind === 'http' && (status === 401 || status === 403)) {
    throw new ServerProbeError('http', `Authentication failed (HTTP ${status}). ${detail}`, status);
  }
  if (kind === 'http') {
    throw new ServerProbeError('http', `Server responded with HTTP ${status}. ${detail}`, status);
  }
  if (kind === 'unhealthy') {
    throw new ServerProbeError('unhealthy', `Server reported unhealthy. ${detail}`, status);
  }
  throw new ServerProbeError('transport', `No health endpoint. ${detail}`, status);
}
