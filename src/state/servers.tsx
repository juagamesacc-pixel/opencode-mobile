import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { normalizeBaseUrl } from '../api/client';
import { probeServer } from '../api/probe';
import type { Protocol, ServerProfile } from '../api/types';

const SERVERS_KEY = 'opencode_mobile_servers_v1';
const DIRS_KEY = 'opencode_mobile_dirs_v1';
const secretKey = (id: string) => `opencode.mobile.server.${id}.password`;

export interface ServerInput {
  name: string;
  baseUrl: string;
  username: string;
  password: string | null;
}

interface ServersContextValue {
  servers: ServerProfile[];
  active: ServerProfile | null;
  ready: boolean;
  error: string | null;
  directories: string[];
  addServer: (input: ServerInput) => Promise<{ profile: ServerProfile; protocol: Protocol }>;
  updateServer: (id: string, input: ServerInput) => Promise<ServerProfile>;
  removeServer: (id: string) => Promise<void>;
  setActive: (id: string) => void;
  refreshActive: (id?: string) => Promise<ServerProfile | null>;
  setDirectories: (serverId: string, dirs: string[]) => void;
  addDirectory: (dir: string) => void;
  removeDirectory: (dir: string) => void;
}

const ServersContext = createContext<ServersContextValue | null>(null);

function uid() {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ServersProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<ServerProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirsMap, setDirsMap] = useState<Record<string, string[]>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rawServers, rawDirs] = await Promise.all([
          AsyncStorage.getItem(SERVERS_KEY),
          AsyncStorage.getItem(DIRS_KEY),
        ]);
        let loaded: ServerProfile[] = [];
        let loadedActive: string | null = null;
        if (rawServers) {
          const parsed = JSON.parse(rawServers);
          loaded = parsed.profiles || [];
          loadedActive = parsed.activeId || null;
        }
        if (rawDirs) setDirsMap(JSON.parse(rawDirs));
        const hydrated = await Promise.all(loaded.map(async (p) => {
          const password = await SecureStore.getItemAsync(secretKey(p.id)).catch(() => null);
          return { ...p, password: password ?? p.password ?? null };
        }));
        setProfiles(hydrated);
        setActiveId(loadedActive && hydrated.some((p) => p.id === loadedActive) ? loadedActive : hydrated[0]?.id ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (nextProfiles: ServerProfile[], nextActive: string | null, nextDirs: Record<string, string[]>) => {
    const clean = nextProfiles.map(({ password, ...rest }) => ({ ...rest, password: null }));
    await AsyncStorage.multiSet([
      [SERVERS_KEY, JSON.stringify({ profiles: clean, activeId: nextActive })],
      [DIRS_KEY, JSON.stringify(nextDirs)],
    ]);
  }, []);

  const addServer = useCallback(async (input: ServerInput) => {
    setError(null);
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const probeProfile: ServerProfile = {
      id: uid(), name: input.name || baseUrl, baseUrl,
      username: input.username || 'opencode', password: input.password, protocol: 'v2',
    };
    const { protocol } = await probeServer(probeProfile);
    const profile: ServerProfile = { ...probeProfile, protocol };
    const hydratedPassword = input.password;
    if (hydratedPassword) await SecureStore.setItemAsync(secretKey(profile.id), hydratedPassword).catch(() => {});
    const nextProfiles = [...profiles, { ...profile, password: hydratedPassword }];
    const nextActive = activeId || profile.id;
    setProfiles(nextProfiles);
    setActiveId(nextActive);
    const nextDirs = { ...dirsMap };
    await persist(nextProfiles, nextActive, nextDirs);
    return { profile, protocol };
  }, [profiles, activeId, dirsMap, persist]);

  const updateServer = useCallback(async (id: string, input: ServerInput) => {
    setError(null);
    const existing = profiles.find((p) => p.id === id);
    if (!existing) throw new Error('Server not found');
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const { protocol } = await probeServer({
      ...existing, baseUrl, username: input.username || 'opencode', password: input.password,
    });
    const updated: ServerProfile = {
      ...existing, name: input.name || baseUrl, baseUrl,
      username: input.username || 'opencode', password: input.password, protocol,
    };
    if (input.password) await SecureStore.setItemAsync(secretKey(id), input.password).catch(() => {});
    else await SecureStore.deleteItemAsync(secretKey(id)).catch(() => {});
    const nextProfiles = profiles.map((p) => (p.id === id ? updated : p));
    setProfiles(nextProfiles);
    await persist(nextProfiles, activeId, dirsMap);
    return updated;
  }, [profiles, activeId, dirsMap, persist]);

  const removeServer = useCallback(async (id: string) => {
    const nextProfiles = profiles.filter((p) => p.id !== id);
    const nextActive = activeId === id ? nextProfiles[0]?.id ?? null : activeId;
    const nextDirs = { ...dirsMap };
    delete nextDirs[id];
    setProfiles(nextProfiles);
    setActiveId(nextActive);
    setDirsMap(nextDirs);
    await SecureStore.deleteItemAsync(secretKey(id)).catch(() => {});
    await persist(nextProfiles, nextActive, nextDirs);
  }, [profiles, activeId, dirsMap, persist]);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    persist(profiles, id, dirsMap).catch(() => {});
  }, [profiles, dirsMap, persist]);

  // Optional `id` lets callers health-check a specific profile (e.g. the Test
  // button on a non-active server) instead of whichever server is active.
  // With no argument the behaviour is unchanged: refresh the active server.
  const refreshActive = useCallback(async (id?: string) => {
    const profile = profiles.find((p) => p.id === (id ?? activeId)) || null;
    if (!profile) return null;
    try {
      const { protocol, info } = await probeServer(profile);
      const updated = { ...profile, protocol, name: profile.name || info.version || profile.name };
      const next = profiles.map((p) => (p.id === profile.id ? updated : p));
      setProfiles(next);
      await persist(next, activeId, dirsMap);
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [profiles, activeId, dirsMap, persist]);

  const setDirectories = useCallback((serverId: string, dirs: string[]) => {
    const next = { ...dirsMap, [serverId]: dirs };
    setDirsMap(next);
    persist(profiles, activeId, next).catch(() => {});
  }, [dirsMap, profiles, activeId, persist]);

  const addDirectory = useCallback((dir: string) => {
    if (!activeId || !dir) return;
    const current = dirsMap[activeId] || [];
    if (current.includes(dir)) return;
    setDirectories(activeId, [...current, dir]);
  }, [activeId, dirsMap, setDirectories]);

  const removeDirectory = useCallback((dir: string) => {
    if (!activeId) return;
    setDirectories(activeId, (dirsMap[activeId] || []).filter((d) => d !== dir));
  }, [activeId, dirsMap, setDirectories]);

  const active = useMemo(() => profiles.find((p) => p.id === activeId) || null, [profiles, activeId]);
  const directories = useMemo(() => (activeId ? dirsMap[activeId] || [] : []), [activeId, dirsMap]);

  const value = useMemo(() => ({
    servers: profiles, active, ready, error, directories,
    addServer, updateServer, removeServer, setActive, refreshActive,
    setDirectories, addDirectory, removeDirectory,
  }), [profiles, active, ready, error, directories, addServer, updateServer, removeServer, setActive, refreshActive, setDirectories, addDirectory, removeDirectory]);

  return <ServersContext.Provider value={value}>{children}</ServersContext.Provider>;
}

export function useServers() {
  const ctx = useContext(ServersContext);
  if (!ctx) throw new Error('useServers must be used inside ServersProvider');
  return ctx;
}
