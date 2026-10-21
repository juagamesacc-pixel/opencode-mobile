import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { useServers } from '../state/servers';
import { EmptyState, Screen, TopBar } from '../components/ui';
import { clockTime } from '../utils/time';

type Props = NativeStackScreenProps<RootStackParamList, 'Diagnostics'>;

export function DiagnosticsScreen({ navigation }: Props) {
  const { settings, theme, diagnostics, clearDiagnostics, logDiag } = useSettings();
  const { active } = useServers();

  const copy = async () => {
    const text = [
      `opencode mobile diagnostics`,
      `time: ${new Date().toISOString()}`,
      `server: ${active?.baseUrl || 'none'} (${active?.protocol || '-'})`,
      `theme: ${settings.selectedThemeID}/${settings.themeMode}/syntax:${settings.selectedSyntaxID}`,
      '',
      ...diagnostics.map((d) => `${new Date(d.time).toISOString()} ${d.level.toUpperCase()} [${d.tag}] ${d.message}`),
    ].join('\n');
    await Clipboard.setStringAsync(text);
    logDiag('info', 'diagnostics', 'Copied diagnostics to clipboard');
    Alert.alert('Copied', 'The diagnostics log was copied to the clipboard.');
  };

  return (
    <Screen>
      <TopBar
        title="Diagnostics"
        subtitle={`${diagnostics.length} event${diagnostics.length === 1 ? '' : 's'}`}
        onBack={() => navigation.goBack()}
        actions={
          <>
            <Pressable onPress={copy} hitSlop={10} style={styles.icon}><Ionicons name="copy-outline" size={19} color={theme.colors.iconStrong} /></Pressable>
            <Pressable
              onPress={() => Alert.alert('Clear diagnostics?', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearDiagnostics },
              ])}
              hitSlop={10}
              style={styles.icon}
            >
              <Ionicons name="trash-outline" size={18} color={theme.colors.iconStrong} />
            </Pressable>
          </>
        }
      />
      <View style={{ padding: 14 }}>
        <View style={{ backgroundColor: theme.colors.surfaceRaised, borderRadius: 10, padding: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderWeaker }}>
          <Text style={{ color: theme.colors.textWeak, fontSize: 11, lineHeight: 17 }}>
            Server: {active?.baseUrl || 'not configured'} · {active?.protocol?.toUpperCase() || '—'}{'\n'}
            Theme: {settings.selectedThemeID} · {settings.themeMode} · {settings.selectedSyntaxID}
          </Text>
        </View>
      </View>
      <FlatList
        data={[...diagnostics].reverse()}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30 }}
        renderItem={({ item }) => {
          const color = item.level === 'error' ? theme.colors.error : item.level === 'warn' ? theme.colors.warning : theme.colors.textWeak;
          return (
            <View style={{ paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderWeaker }}>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <Text style={{ color: theme.colors.textWeaker, fontSize: 10, fontFamily: 'monospace' }}>{clockTime(item.time)}</Text>
                <Text style={{ color, fontSize: 10, fontWeight: '700', fontFamily: 'monospace' }}>{item.level.toUpperCase()}</Text>
                <Text style={{ color: theme.colors.textWeaker, fontSize: 10, fontFamily: 'monospace' }}>{item.tag}</Text>
              </View>
              <Text style={{ color: theme.colors.text, fontSize: 11.5, marginTop: 3, lineHeight: 16 }}>{item.message}</Text>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="pulse-outline" title="No diagnostics" body="Connection probes, SSE errors and protocol fallbacks appear here." />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { padding: 9 },
});
