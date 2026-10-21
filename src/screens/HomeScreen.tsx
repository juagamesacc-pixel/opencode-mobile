import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import { ApiClient } from '../api/client';
import { subscribeEvents } from '../api/events';
import type { Session } from '../api/types';
import { cacheSessions, readCachedSessions } from '../utils/cache';
import { relativeTime, formatCost } from '../utils/time';
import { Button, Card, EmptyState, ErrorBanner, IconButton, Loading, Screen, Sheet, TextField, TopBar } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

function basename(path?: string) {
  if (!path) return '';
  const clean = path.replace(/\/+$/, '');
  return clean.slice(clean.lastIndexOf('/') + 1) || clean;
}

export function HomeScreen({ navigation }: Props) {
  const { theme, settings, logDiag } = useSettings();
  const { active, servers, directories, addDirectory, removeDirectory } = useServers();
  const [selected, setSelected] = useState<string | 'all'>('all');
  const [byDir, setByDir] = useState<Record<string, Session[]>>({});
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuSession, setMenuSession] = useState<Session | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [creating, setCreating] = useState(false);
  const refreshTimer = useRef<any>(null);

  const clientFor = useCallback((dir?: string) => (active ? new ApiClient(active, dir) : null), [active]);

  useEffect(() => {
    setSelected('all');
    setByDir({});
  }, [active?.id]);

  // Seed from cache, then discover a default directory.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const cached = await readCachedSessions(active.id);
      if (!cancelled && Object.keys(cached).length) setByDir(cached);
      if (directories.length === 0) {
        try {
          const proj = await new ApiClient(active).currentProject();
          const dir = (proj as any)?.worktree || (proj as any)?.canonical || (proj as any)?.directory;
          if (dir && !cancelled) addDirectory(dir);
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [active?.id, directories.length]);

  const dirs = useMemo(() => {
    if (selected === 'all') return directories;
    return directories.includes(selected) ? [selected] : [selected];
  }, [selected, directories]);

  const load = useCallback(async (spin = false) => {
    if (!active) return;
    if (spin) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const next: Record<string, Session[]> = { ...byDir };
      const targets = dirs.length ? dirs : [undefined as any];
      await Promise.all(targets.map(async (dir: string | undefined) => {
        const client = new ApiClient(active, dir);
        const [list, ids] = await Promise.all([
          client.listSessions(dir),
          client.activeSessions().catch(() => [] as string[]),
        ]);
        next[dir || ''] = list;
        if (ids.length) setActiveIds((prev) => Array.from(new Set([...prev, ...ids])));
      }));
      setByDir(next);
      cacheSessions(active.id, next);
      logDiag('info', 'home', `loaded ${Object.values(next).flat().length} sessions`);
      // Discover projects from the sessions themselves: api/location only
      // reports the server's default directory, so projects could otherwise
      // stay empty even though sessions exist.
      const discovered = new Set<string>();
      for (const list of Object.values(next)) {
        for (const s of list) if ((s as any).directory) discovered.add((s as any).directory);
      }
      for (const d of discovered) if (!directories.includes(d)) addDirectory(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      logDiag('error', 'home', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [active, dirs, byDir, directories, addDirectory, logDiag]);

  useEffect(() => { load(); }, [active?.id, selected, directories.join('|')]);

  useEffect(() => {
    if (!active) return;
    const client = new ApiClient(active, selected === 'all' ? undefined : selected);
    const sub = subscribeEvents(client, (evt) => {
      if (/^(message|session|permission|question)\./.test(evt.type)) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => load(), 700);
      }
    }, (status) => { if (status === 'open') load(); });
    return () => { sub.close(); if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [active?.id, selected]);

  const allSessions = useMemo(() => {
    const list: (Session & { _dir?: string })[] = [];
    for (const [dir, sessions] of Object.entries(byDir)) {
      for (const s of sessions) list.push({ ...s, _dir: s.directory || dir || undefined });
    }
    const seen = new Set<string>();
    return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .sort((a, b) => (b.time?.updated || b.time?.created || 0) - (a.time?.updated || a.time?.created || 0));
  }, [byDir]);

  const running = allSessions.filter((s) => activeIds.includes(s.id) || (s as any).status === 'busy');
  const ready = allSessions.filter((s) => !running.some((r) => r.id === s.id));
  const cutoff = Date.now() - Math.max(1, settings.recentWindowHours) * 3600_000;
  const recent = ready.filter((s) => {
    const t = s.time?.updated || s.time?.created || 0;
    return running.some((r) => r.id === s.id) || t >= cutoff;
  });
  const list = selected === 'all' ? [...running, ...recent] : recent;

  const createSession = async () => {
    if (!active) return;
    setCreating(true);
    try {
      const dir = selected === 'all' ? directories[0] : selected;
      const client = new ApiClient(active, dir);
      const session = await client.createSession({ title: undefined });
      navigation.navigate('Chat', { sessionId: session.id, title: session.title, directory: dir });
      load();
    } catch (e) {
      Alert.alert('Could not create session', e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const doRename = async () => {
    if (!active || !menuSession || !renameText.trim()) return;
    try {
      await new ApiClient(active, menuSession.directory || (menuSession as any)._dir).updateSession(menuSession.id, { title: renameText.trim() });
      setRenameOpen(false);
      setMenuSession(null);
      load();
    } catch (e) {
      Alert.alert('Rename failed!', e instanceof Error ? e.message : String(e));
    }
  };

  const doFork = async () => {
    if (!active || !menuSession) return;
    try {
      const s = await new ApiClient(active, menuSession.directory || (menuSession as any)._dir).fork(menuSession.id);
      setMenuSession(null);
      navigation.navigate('Chat', { sessionId: s.id, title: s.title, directory: menuSession.directory || (menuSession as any)._dir });
    } catch (e) {
      Alert.alert('Fork failed', e instanceof Error ? e.message : String(e));
    }
  };

  const doArchive = async () => {
    if (!active || !menuSession) return;
    try {
      await new ApiClient(active, menuSession.directory || (menuSession as any)._dir).updateSession(menuSession.id, { archived: true });
      setMenuSession(null);
      load();
    } catch (e) {
      Alert.alert('Archive failed', e instanceof Error ? e.message : String(e));
    }
  };

  const doDelete = () => {
    if (!active || !menuSession) return;
    const target = menuSession;
    Alert.alert('Delete session?', `“${target.title}” will be removed from the server.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await new ApiClient(active, target.directory || (target as any)._dir).deleteSession(target.id);
            setMenuSession(null);
            load();
          } catch (e) {
            Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  if (!active) {
    return (
      <Screen>
        <TopBar title="OpenCode Mobile" />
        <EmptyState
          icon="server-outline"
          title={servers.length ? 'No server selected' : 'No servers saved'}
          body="Add the address of an opencode server to list sessions and start chatting."
          action={<Button label="Add server" variant="primary" onPress={() => navigation.navigate('ServerSetup')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar
        title={active.name === active.baseUrl ? 'Projects' : active.name}
        subtitle={active.baseUrl.replace(/^https?:\/\//, '')}
        left={<IconButton icon="server-outline" onPress={() => navigation.navigate('Servers')} />}
        actions={
          <>
            <IconButton icon="terminal-outline" onPress={() => navigation.navigate('Terminals', { directory: selected === 'all' ? directories[0] : selected })} />
            <IconButton icon="settings-outline" onPress={() => navigation.navigate('Settings')} />
            <IconButton icon="add" onPress={createSession} disabled={creating} />
          </>
        }
      />

      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          <Pressable onPress={() => setSelected('all')} style={[styles.chip, { borderColor: selected === 'all' ? theme.colors.text : theme.colors.border, backgroundColor: selected === 'all' ? theme.colors.text : 'transparent' }]}>
            <Text style={{ color: selected === 'all' ? theme.colors.background : theme.colors.textBase, fontSize: 12.5, fontWeight: '600' }}>All projects</Text>
          </Pressable>
          {directories.map((dir) => {
            const on = selected === dir;
            return (
              <Pressable
                key={dir}
                onPress={() => setSelected(dir)}
                onLongPress={() => Alert.alert('Remove from home?', dir, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => { removeDirectory(dir); if (selected === dir) setSelected('all'); } },
                ])}
                style={[styles.chip, { borderColor: on ? theme.colors.text : theme.colors.border, backgroundColor: on ? theme.colors.text : 'transparent' }]}
              >
                <Ionicons name="folder-outline" size={12} color={on ? theme.colors.background : theme.colors.textBase} />
                <Text style={{ color: on ? theme.colors.background : theme.colors.textBase, fontSize: 12.5, fontWeight: '600' }}>{basename(dir)}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => navigation.navigate('AddProject', { startPath: selected === 'all' ? undefined : selected })} style={[styles.chip, { borderColor: theme.colors.border, borderStyle: 'dashed' }]}>
            <Ionicons name="add" size={13} color={theme.colors.textWeak} />
            <Text style={{ color: theme.colors.textWeak, fontSize: 12.5 }}>Add project</Text>
          </Pressable>
        </ScrollView>
      </View>

      {error ? <View style={{ paddingHorizontal: 14, marginBottom: 6 }}><ErrorBanner message={error} onRetry={() => load(true)} /></View> : null}

      {loading ? <Loading label="Loading sessions…" /> : (
        <FlatList
          data={list}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 110, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.textWeak} />}
          ListHeaderComponent={
            running.length && selected !== 'all' ? <SectionLabel label={`Running · ${running.length}`} /> : undefined
          }
          renderItem={({ item, index }) => {
            const isRunning = running.some((r) => r.id === item.id);
            const showSection = selected === 'all' && (index === 0 || isRunning !== running.some((r) => r.id === list[index - 1]?.id));
            const project = (item as any)._dir || item.directory;
            return (
              <>
                {showSection ? <SectionLabel label={isRunning ? `Running · ${running.length}` : 'Recent'} /> : null}
                <Pressable
                  onPress={() => navigation.navigate('Chat', { sessionId: item.id, title: item.title, directory: project })}
                  onLongPress={() => { setMenuSession(item); setRenameText(item.title); }}
                  delayLongPress={300}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Card style={{ marginBottom: 9, padding: 13 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[styles.statusDot, { backgroundColor: isRunning ? theme.colors.success : theme.colors.border }]} />
                      <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{item.title}</Text>
                      <Text style={{ color: theme.colors.textWeaker, fontSize: 11 }}>{relativeTime(item.time?.updated || item.time?.created)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <Text numberOfLines={1} style={{ color: theme.colors.textWeak, fontSize: 11.5, flex: 1 }}>
                        {isRunning ? 'Running' : 'Ready'}
                        {project ? `  ·  ${basename(project)}` : ''}
                      </Text>
                      {item.summary?.additions || item.summary?.deletions ? (
                        <Text style={{ color: theme.colors.textWeaker, fontSize: 11 }}>
                          +{item.summary?.additions || 0} −{item.summary?.deletions || 0}
                        </Text>
                      ) : null}
                      {item.cost ? <Text style={{ color: theme.colors.textWeaker, fontSize: 11 }}>{formatCost(item.cost)}</Text> : null}
                      {item.parentID ? <Ionicons name="git-branch-outline" size={12} color={theme.colors.textWeaker} /> : null}
                    </View>
                  </Card>
                </Pressable>
              </>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title={selected === 'all' ? 'No projects yet' : 'No sessions yet'}
              body={selected === 'all'
                ? 'Add a project folder on the server, or start a session in the default project.'
                : 'Start a new session in this project.'}
              action={<Button label="New session" variant="primary" onPress={createSession} loading={creating} />}
            />
          }
          ListFooterComponent={
            list.length ? (
              <Text style={{ color: theme.colors.textWeaker, fontSize: 10.5, textAlign: 'center', marginTop: 14, paddingHorizontal: 24, lineHeight: 15 }}>
                Sessions stay in Recent while Running or Ready, or when updated within this window.
              </Text>
            ) : undefined
          }
        />
      )}

      <Sheet visible={!!menuSession && !renameOpen} onClose={() => setMenuSession(null)} title={menuSession?.title}>
        <MenuRow icon="pencil-outline" label="Rename session" onPress={() => setRenameOpen(true)} />
        <MenuRow icon="git-branch-outline" label="Fork session" onPress={doFork} />
        <MenuRow icon="copy-outline" label="Copy session ID" onPress={() => { if (menuSession) Clipboard.setStringAsync(menuSession.id); setMenuSession(null); }} />
        <MenuRow icon="archive-outline" label="Archive session" onPress={doArchive} />
        <MenuRow icon="trash-outline" label="Delete session" danger onPress={doDelete} />
      </Sheet>

      <Sheet visible={renameOpen} onClose={() => setRenameOpen(false)} title="Rename session">
        <TextField label="Title" value={renameText} onChangeText={setRenameText} autoFocus />
        <Button label="Save" variant="primary" onPress={doRename} />
      </Sheet>
    </Screen>
  );
}

function SectionLabel({ label }: { label: string }) {
  const { theme } = useSettings();
  return <Text style={{ color: theme.colors.textWeak, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 6, marginBottom: 8 }}>{label}</Text>;
}

function MenuRow({ icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
  const { theme } = useSettings();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={18} color={danger ? theme.colors.error : theme.colors.iconStrong} />
      <Text style={{ color: danger ? theme.colors.error : theme.colors.text, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
});
