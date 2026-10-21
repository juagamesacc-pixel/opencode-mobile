import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { EmptyState, Screen, TopBar } from '../components/ui';
import { clockTime } from '../utils/time';
import { LANGUAGES } from './TextMateLanguagesScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'TextMateLogbook'>;

export function TextMateLogbookScreen({ navigation }: Props) {
  const { settings, theme, diagnostics } = useSettings();
  const logs = useMemo(() => diagnostics.filter((d) => d.tag.toLowerCase().includes('textmate')), [diagnostics]);
  const disabled = settings.textMateDisabledLanguages.length;
  const forced = settings.textMateForceEnabledLanguages.length;

  return (
    <Screen>
      <TopBar title="TextMate logbook" subtitle="Grammar activity" onBack={() => navigation.goBack()} />
      <View style={{ padding: 14 }}>
        <View style={{ backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderWeaker, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>
            {settings.textMateEnabled ? 'Grammars enabled' : 'Grammars disabled'}
          </Text>
          <Text style={{ color: theme.colors.textWeak, fontSize: 11.5, marginTop: 4, lineHeight: 17 }}>
            {LANGUAGES.length} known languages · {LANGUAGES.length - disabled} active · {forced} forced · {disabled} disabled
          </Text>
          <Text style={{ color: theme.colors.textWeaker, fontSize: 10.5, marginTop: 5 }}>
            Bundled grammars load on demand. Unavailable grammars fall back to the built-in highlighter.
          </Text>
        </View>
      </View>
      <FlatList
        data={logs}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30 }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderWeaker }}>
            <Text style={{ color: theme.colors.textWeaker, fontFamily: 'monospace', fontSize: 10 }}>{clockTime(item.time)}</Text>
            <Text style={{ color: item.level === 'error' ? theme.colors.error : item.level === 'warn' ? theme.colors.warning : theme.colors.textWeak, fontFamily: 'monospace', fontSize: 10, width: 38 }}>{item.level}</Text>
            <Text style={{ color: theme.colors.text, fontSize: 11.5, flex: 1, lineHeight: 16 }}>{item.message}</Text>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="library-outline"
            title="Nothing logged yet"
            body="Grammar load failures and fallbacks appear here while you browse highlighted files and code blocks."
          />
        }
      />
    </Screen>
  );
}
