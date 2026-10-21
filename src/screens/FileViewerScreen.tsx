import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import { ApiClient } from '../api/client';
import type { FileDiff } from '../api/types';
import { CodeBlock } from '../components/CodeBlock';
import { DiffView } from '../components/Diff';
import { ErrorBanner, Loading, Screen, Segmented, TopBar } from '../components/ui';
import { languageFromPath } from '../utils/language';

type Props = NativeStackScreenProps<RootStackParamList, 'FileViewer'>;

export function FileViewerScreen({ navigation, route }: Props) {
  const { path, directory, sessionId } = route.params;
  const { active } = useServers();
  const { theme } = useSettings();
  const [tab, setTab] = useState<'diff' | 'file'>('diff');
  const [content, setContent] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true); setError(null);
    const client = new ApiClient(active, directory);
    const [fileRes, diffRes] = await Promise.allSettled([
      client.readFile(path),
      sessionId ? client.sessionDiff(sessionId) : client.vcsDiff('working', 3),
    ]);
    if (fileRes.status === 'fulfilled') setContent(fileRes.value || '');
    else setContent(null);
    if (diffRes.status === 'fulfilled') {
      const found = (diffRes.value || []).find((f) => f.file === path || f.file.endsWith('/' + path) || path.endsWith('/' + f.file));
      setDiff(found || null);
    }
    if (fileRes.status === 'rejected' && diffRes.status === 'rejected') {
      setError(String((fileRes.reason as any)?.message || fileRes.reason));
    }
    setLoading(false);
  }, [active, directory, path, sessionId]);

  // Reload whenever the underlying keys change; `load` is reached through a
  // ref kept fresh every render, so the effect body holds no reactive values.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => { loadRef.current(); }, [active, directory, path, sessionId]);

  // Auto-select the tab when the loaded data supports it: diff-only data
  // (unreadable file) switches to Diff, plain file content without a patch
  // switches to File. Anything ambiguous keeps the user's chosen tab.
  // Implemented as state adjusted during render (react.dev's endorsed
  // pattern) instead of an effect, so the tab never lags a render.
  const [autoKey, setAutoKey] = useState<{ content: string | null; hasPatch: boolean } | null>(null);
  const autoNext = content == null && diff?.patch
    ? 'diff'
    : content != null && !diff?.patch
      ? 'file' as const
      : null;
  if (autoNext && (autoKey?.content !== content || autoKey.hasPatch !== !!diff?.patch)) {
    setAutoKey({ content, hasPatch: !!diff?.patch });
    setTab(autoNext);
  }

  const language = useMemo(() => languageFromPath(path), [path]);

  return (
    <Screen>
      <TopBar title={path.split('/').pop() || path} subtitle={path} onBack={() => navigation.goBack()} />
      <View style={{ padding: 12 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'diff', label: `Diff${diff ? ` +${diff.additions || 0} −${diff.deletions || 0}` : ''}` }, { value: 'file', label: 'File' }]} />
      </View>
      {error ? <View style={{ paddingHorizontal: 14 }}><ErrorBanner message={error} onRetry={load} /></View> : null}
      {loading ? <Loading label="Loading file…" /> : tab === 'diff' ? (
        diff?.patch ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }}>
            <DiffView patch={diff.patch} />
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
            <Text style={{ color: theme.colors.textWeak, fontSize: 13, marginBottom: 10 }}>No diff is available for this file. Showing the file instead.</Text>
            {content ? <CodeBlock code={content} language={language} showLines /> : <Text style={{ color: theme.colors.textWeak, fontSize: 13 }}>File content is unavailable on this server.</Text>}
          </ScrollView>
        )
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
          {content ? <CodeBlock code={content} language={language} showLines /> : <Text style={{ color: theme.colors.textWeak, fontSize: 13 }}>File content is unavailable on this server.</Text>}
        </ScrollView>
      )}
    </Screen>
  );
}
