import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { Screen, SwitchRow, TopBar } from '../components/ui';
import { SettingsSection } from '../components/settings';

type Props = NativeStackScreenProps<RootStackParamList, 'FeatureFlags'>;

const FLAGS: { key: 'session_chat_chip_timeline'; label: string; description: string; risk?: string }[] = [
  {
    key: 'session_chat_chip_timeline',
    label: 'Session timeline chips',
    description: 'Show inline chips for model changes, reverts, forks and compactions in the chat timeline.',
    risk: 'Stable on servers that expose session.updated and message events.',
  },
];

export function FeatureFlagsScreen({ navigation }: Props) {
  const { settings, update, theme } = useSettings();

  return (
    <Screen>
      <TopBar title="Feature flags" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: theme.colors.textWeak, fontSize: 12, lineHeight: 18, padding: 16 }}>
          These switches change client behavior and are applied immediately. They are intended for testing new chat presentation features.
        </Text>
        <SettingsSection title="Chat">
          {FLAGS.map((flag, i) => (
            <View key={flag.key}>
              <SwitchRow
                label={flag.label}
                description={flag.description}
                value={settings.featureFlags[flag.key]}
                onValueChange={(v) => update({ featureFlags: { ...settings.featureFlags, [flag.key]: v } })}
              />
              {flag.risk ? <Text style={{ color: theme.colors.textWeaker, fontSize: 11, paddingHorizontal: 16, paddingBottom: 10 }}>{flag.risk}</Text> : null}
              {i < FLAGS.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.borderWeaker }} /> : null}
            </View>
          ))}
        </SettingsSection>
        <View style={{ padding: 16 }}>
          <Text style={{ color: theme.colors.textWeaker, fontSize: 11, lineHeight: 16 }}>
            Flags are client-side only and stored with your other preferences. The server is never modified.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
