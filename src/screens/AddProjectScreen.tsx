import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import { ApiClient } from '../api/client';
import type { FileNode } from '../api/types';
import { Button, EmptyState, ErrorBanner, Loading, Screen, TopBar } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'AddProject'>;

function parentOf(path: string): string | null {
  if (!path || path === '/') return null;
  const clean = path.replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  if (idx <= 0) return '/';
  return clean.slice(0, idx);
}

export function AddProjectScreen({ navigation, route }: Props) {
  const { active, directories, addDirectory } = useServers();
  const { theme } = useSettings();
  const c = theme.colors;
  const [path, setPath] = useState<string>(route.params?.startPath || '');
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    if (!active) return;
    setLoading(true); setError(null);
    try {
      let dir = target;
      if (!dir) {
        const loc = await new ApiClient(active).location().catch(() => null);
        dir = loc?.directory || loc?.worktree || loc?.path || '';
        if (dir) setPath(dir);
      }
      const client = new ApiClient(active, dir || undefined);
      const list = await client.listFiles('.');
      const dirs = list
        .filter((n) => n.type === 'directory' && !n.ignored)
        .sort((a, b) => a.name.localeCompare(b.name));
      setNodes(dirs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [active]);

  useEffect(() => { load(path); }, [load]); // initial + server changes only; folder taps pass explicit paths

  const open = (node: FileNode) => {
    setPath(node.path);
    load(node.path);
  };

  const up = () => {
    const parent = parentOf(path);
    if (parent == null) return;
    setPath(parent);
    load(parent);
  };

  const useFolder = () => {
    if (!path) return;
    addDirectory(path);
    navigation.popToTop();
  };

  const recent = directories.filter((d) => !nodes.some((n) => n.path === d));

  return (
    <Screen>
      <TopBar
        title="Add project"
        subtitle={path || 'Choose a folder on the server'}
        onBack={() => navigation.goBack()}
        actions={<Pressable onPress={up} hitSlop={10} style={styles.icon} disabled={!parentOf(path)}><Ionicons name="arrow-up" size={20} color={parentOf(path) ? c.iconStrong : c.textWeaker} /></Pressable>}
      />
      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceRaised, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderWeaker, padding: 10 }}>
          <Ionicons name="folder-open-outline" size={16} color={c.icon} />
          <Text numberOfLines={1} style={{ color: c.text, fontSize: 12.5, marginLeft: 7, flex: 1 }}>{path || 'Default project directory'}</Text>
        </View>
      </View>
      {error ? <View style={{ padding: 14, paddingBottom: 0 }}><ErrorBanner message={error} onRetry={() => load(path)} /></View> : null}
      {loading ? <Loading label="Reading folders…" /> : (
        <FlatList
          data={nodes}
          keyExtractor={(n) => n.path}
          contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderWeaker }}>
                <Ionicons name="folder-outline" size={18} color={c.warning} />
                <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, flex: 1, marginLeft: 10 }}>{item.name}</Text>
                <Ionicons name="chevron-forward" size={15} color={c.textWeaker} />
              </View>
            </Pressable>
          )}
          ListHeaderComponent={recent.length ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ color: c.textWeak, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7 }}>Recent projects</Text>
              {recent.slice(0, 5).map((dir) => (
                <Pressable key={dir} onPress={() => { setPath(dir); load(dir); }} style={{ paddingVertical: 8 }}>
                  <Text numberOfLines={1} style={{ color: c.interactive, fontSize: 12.5 }}>{dir}</Text>
                </Pressable>
              ))}
            </View>
          ) : undefined}
          ListEmptyComponent={<EmptyState icon="folder-outline" title="No folders visible" body="The server returned no subfolders here. Use the up arrow to browse elsewhere." />}
        />
      )}
      <View style={[styles.footer, { borderTopColor: c.borderWeaker, backgroundColor: c.background }]}>
        <Button label={`Use ${path.split('/').filter(Boolean).pop() || 'this folder'}`} variant="primary" icon="checkmark" onPress={useFolder} disabled={!path || loading} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { padding: 8 },
  footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
