import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { useServers } from '../state/servers';
import { Screen, TopBar } from '../components/ui';
import { SettingsRow, SettingsSection } from '../components/settings';
import { APP_VERSION } from './SettingsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

export function AboutScreen({ navigation }: Props) {
  const { theme, settings } = useSettings();
  const { active } = useServers();

  return (
    <Screen>
      <TopBar title="About" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', paddingTop: 30, paddingBottom: 22 }}>
          <View style={{ width: 68, height: 68, borderRadius: 16, backgroundColor: theme.colors.buttonPrimary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="terminal" size={34} color={theme.colors.iconInvert} />
          </View>
          <Text style={{ color: theme.colors.text, fontSize: 21, fontWeight: '700', marginTop: 14 }}>OpenCode Mobile</Text>
          <Text style={{ color: theme.colors.textWeak, fontSize: 12.5, marginTop: 4 }}>Version {APP_VERSION}</Text>
          <Text style={{ color: theme.colors.textWeak, fontSize: 12.5, marginTop: 10, textAlign: 'center', paddingHorizontal: 40, lineHeight: 18 }}>
            A native client for your opencode server. Chat with agents, review changes, run shells and switch themes from your phone.
          </Text>
        </View>

        <SettingsSection title="Connection">
          <SettingsRow icon="server-outline" label="Server" value={active?.name || 'Not configured'} detail={active?.baseUrl} onPress={() => navigation.navigate('Servers')} />
          <SettingsRow icon="git-branch-outline" label="Protocol" value={active?.protocol?.toUpperCase() || '—'} last />
        </SettingsSection>

        <SettingsSection title="Project">
          <SettingsRow icon="logo-github" label="opencode on GitHub" onPress={() => Linking.openURL('https://github.com/sst/opencode').catch(() => {})} />
          <SettingsRow icon="globe-outline" label="opencode.ai" onPress={() => Linking.openURL('https://opencode.ai').catch(() => {})} />
          <SettingsRow icon="document-text-outline" label="Documentation" onPress={() => Linking.openURL('https://opencode.ai/docs').catch(() => {})} last />
        </SettingsSection>

        <SettingsSection>
          <Pressable onPress={() => navigation.navigate('Settings')} style={({ pressed }) => ({ padding: 16, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: theme.colors.interactive, fontSize: 14, textAlign: 'center' }}>Back to settings</Text>
          </Pressable>
        </SettingsSection>

        <Text style={{ color: theme.colors.textWeaker, fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 16 }}>
          Built with React Native.{'\n'}Theme: {settings.selectedThemeID} · Syntax: {settings.selectedSyntaxID}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({});
