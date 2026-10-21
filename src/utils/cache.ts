import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage, Session } from '../api/types';

const sessionsKey = (serverId: string) => `opencode_mobile_sessions_v1.${serverId}`;
const messagesKey = (serverId: string, sessionId: string) => `opencode_mobile_messages_v1.${serverId}.${sessionId}`;

export async function cacheSessions(serverId: string, byDir: Record<string, Session[]>): Promise<void> {
  try { await AsyncStorage.setItem(sessionsKey(serverId), JSON.stringify(byDir)); } catch {}
}

export async function readCachedSessions(serverId: string): Promise<Record<string, Session[]>> {
  try {
    const raw = await AsyncStorage.getItem(sessionsKey(serverId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export async function cacheMessages(serverId: string, sessionId: string, messages: ChatMessage[]): Promise<void> {
  try { await AsyncStorage.setItem(messagesKey(serverId, sessionId), JSON.stringify(messages.slice(-120))); } catch {}
}

export async function readCachedMessages(serverId: string, sessionId: string): Promise<ChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(messagesKey(serverId, sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function clearSessionCaches(serverId?: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const targets = keys.filter((k) => k.startsWith('opencode_mobile_sessions_v1') || k.startsWith('opencode_mobile_messages_v1'));
    await AsyncStorage.multiRemove(serverId ? targets.filter((k) => k.includes(serverId)) : targets);
  } catch {}
}
