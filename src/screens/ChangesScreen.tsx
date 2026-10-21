import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import { ApiClient } from '../api/client';
import type { FileDiff } from '../api/types';
import { Card, EmptyState, ErrorBanner, Loading, Screen, Segmented, TopBar } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Changes'>;

export function ChangesScreen({ navigation, route }: Props) {
  const { sessionId, directory, messageId } = route.params;
  const { active } = useServers();
  const { theme } = useSettings();
  const c = theme.colors;
  const [source, setSource] = useState<'session' | 'worktree'>('session');
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true); setError(null);
    try {
      const client = new ApiClient(active, directory);
      const list = source === 'session'
        ? await client.sessionDiff(sessionId, messageId)
        : await client.vcsDiff('working', 3);
      setFiles(list || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [active, directory, sessionId, messageId, source]);

  // Reload whenever the underlying keys change. The live `load` is reached
  // through a ref (refreshed every render), so the effect body itself holds no
  // reactive values and the fetch cannot capture a stale closure.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => { loadRef.current(); }, [active, directory, sessionId, messageId, source]);

  const additions = files.reduce((n, f) => n + (f.additions || 0), 0);
  const deletions = files.reduce((n, f) => n + (f.deletions || 0), 0);

  return (
    <Screen>
      <TopBar title="Review changes" subtitle={`+${additions}  −${deletions}`} onBack={() => navigation.goBack()} />
      <View style={{ padding: 14 }}>
        <Segmented
          value={source}
          onChange={setSource}
          options={[{ value: 'session', label: 'Session' }, { value: 'worktree', label: 'Working tree' }]}
        />
        <Text style={{ color: c.textWeak, fontSize: 11, marginTop: 8 }}>
          {source === 'session' ? 'Files changed by the latest completed turn.' : 'Uncommitted changes in the project.'}
        </Text>
      </View>
      {error ? <View style={{ paddingHorizontal: 14 }}><ErrorBanner message={error} onRetry={load} /></View> : null}
      {loading ? <Loading label="Loading changes…" /> : (
        <FlatList
          data={files}
          keyExtractor={(f) => f.file}
          contentContainerStyle={{ padding: 14, paddingTop: 4 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('FileViewer', { path: item.file, directory, sessionId })}>
              <Card style={{ marginBottom: 8, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.status, {
                    backgroundColor: item.status === 'added' ? c.surfaceSuccess : item.status === 'deleted' ? c.surfaceCritical : c.surfaceInteractive,
                  }]}>
                    <Text style={{ color: item.status === 'added' ? c.success : item.status === 'deleted' ? c.error : c.interactive, fontSize: 10, fontWeight: '700' }}>
                      {(item.status || 'modified').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 13.5, flex: 1 }}>{item.file}</Text>
                  <Text style={{ color: c.diffAdd, fontSize: 11 }}>+{item.additions || 0}</Text>
                  <Text style={{ color: c.diffDelete, fontSize: 11 }}>−{item.deletions || 0}</Text>
                  <Ionicons name="chevron-forward" size={14} color={c.textWeaker} />
                </View>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState icon="git-compare-outline" title="No changes" body={source === 'session' ? 'No files changed in this session yet.' : 'The working tree is clean.'} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
});
