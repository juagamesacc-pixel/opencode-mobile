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

/**
 * Mirrors the Android app's probing order. V2 servers expose /api/info (newer)
 * or /api/health (older opencode 2 previews); classic servers expose
 * /global/health.
 */
export async function probeServer(profile: ServerProfile): Promise<ProbeResult> {
  const base = { ...profile, baseUrl: normalizeBaseUrl(profile.baseUrl) };
  const failures: string[] = [];

  try {
    const info = await attempt({ ...base, protocol: 'v2' }, 'api/info');
    return { protocol: 'v2', info: info || {} };
  } catch (e) {
    failures.push(`api/info: ${(e as Error).message}`);
  }

  try {
    const health = await attempt({ ...base, protocol: 'v2' }, 'api/health');
    if (!looksHealthy(health)) throw new ServerProbeError('unhealthy', 'Server reported unhealthy');
    return { protocol: 'v2', info: health || {} };
  } catch (e) {
    failures.push(`api/health: ${(e as Error).message}`);
  }

  try {
    const health = await attempt({ ...base, protocol: 'v1' }, 'global/health');
    if (!looksHealthy(health)) throw new ServerProbeError('unhealthy', 'Server reported unhealthy');
    return { protocol: 'v1', info: health || {} };
  } catch (e) {
    failures.push(`global/health: ${(e as Error).message}`);
  }

  throw new ServerProbeError('transport', `No health endpoint. ${failures.join(' · ')}`);
}
