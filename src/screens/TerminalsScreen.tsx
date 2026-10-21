import { appAlert } from '../components/dialog';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import { ApiClient } from '../api/client';
import type { Pty } from '../api/types';
import { Button, Card, EmptyState, ErrorBanner, Loading, Screen, TopBar } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminals'>;

export function TerminalsScreen({ navigation, route }: Props) {
  const directory = route.params?.directory;
  const { active } = useServers();
  const { theme } = useSettings();
  const c = theme.colors;
  const [ptys, setPtys] = useState<Pty[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    setError(null);
    try { setPtys(await new ApiClient(active, directory).ptys()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [active, directory]);

  // Load on mount and refocus. `load` is reached through a ref refreshed
  // every render, so the focus callback always calls the freshest version
  // without the effect having to resubscribe on every load identity change.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    loadRef.current();
    const unsub = navigation.addListener('focus', () => loadRef.current());
    return unsub;
  }, [navigation, load]);

  const create = async () => {
    if (!active || creating) return;
    setCreating(true);
    try {
      const pty = await new ApiClient(active, directory).createPty(directory);
      setPtys((prev) => [pty, ...prev]);
      navigation.navigate('Terminal', { ptyId: pty.id, title: pty.title, directory });
    } catch (e) {
      appAlert('Could not open terminal', e instanceof Error ? e.message : String(e));
    } finally { setCreating(false); }
  };

  const remove = (pty: Pty) => {
    appAlert('Close terminal?', 'The shell process will be stopped on the server.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close', style: 'destructive', onPress: async () => {
          if (!active) return;
          try {
            await new ApiClient(active, directory).removePty(pty.id);
            setPtys((prev) => prev.filter((p) => p.id !== pty.id));
          } catch (e) {
            appAlert('Could not close terminal', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <TopBar
        title="Terminals"
        subtitle={directory || undefined}
        onBack={() => navigation.goBack()}
        actions={<Pressable onPress={load} hitSlop={10} style={styles.icon}><Ionicons name="refresh" size={19} color={c.iconStrong} /></Pressable>}
      />
      {error ? <View style={{ padding: 14, paddingBottom: 0 }}><ErrorBanner message={error} onRetry={load} /></View> : null}
      {loading ? <Loading label="Loading terminals…" /> : (
        <FlatList
          data={ptys}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
          renderItem={({ item }) => {
            const running = item.status !== 'exited';
            return (
              <Pressable
                onPress={() => navigation.navigate('Terminal', { ptyId: item.id, title: item.title, directory })}
                onLongPress={() => remove(item)}
              >
                <Card style={{ marginBottom: 8, padding: 13 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.iconWrap, { backgroundColor: c.surfaceRaised }]}>
                      <Ionicons name="terminal-outline" size={17} color={running ? c.success : c.textWeak} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '500' }}>{item.title || item.id}</Text>
                      <Text numberOfLines={1} style={{ color: c.textWeak, fontSize: 11.5, marginTop: 3 }}>
                        {running ? 'Running' : 'Exited'}{item.pid ? ` · pid ${item.pid}` : ''}{item.exitCode != null ? ` · code ${item.exitCode}` : ''} · tap to open
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={c.textWeaker} />
                  </View>
                </Card>
              </Pressable>
            );
          }}
          ListEmptyComponent={<EmptyState icon="terminal-outline" title="No terminals" body="Start a shell in this project. Long-press a terminal to close it." />}
        />
      )}
      <View style={[styles.footer, { borderTopColor: c.borderWeaker, backgroundColor: c.background }]}>
        <Button label={creating ? 'Starting…' : 'New terminal'} icon="add" onPress={create} disabled={creating} />
        {creating ? <ActivityIndicator size="small" color={c.textWeak} style={{ marginLeft: 8 }} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { padding: 9 },
  iconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
