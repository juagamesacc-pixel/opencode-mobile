import { appAlert } from '../components/dialog';
import React from 'react';
import { ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { useServers } from '../state/servers';
import { Screen, SwitchRow, TopBar } from '../components/ui';
import { SettingsRow, SettingsSection } from '../components/settings';
import { SYNTAX_MANIFEST, THEME_MANIFEST } from '../theme/themes';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export const APP_VERSION = '1.1.0';

export function SettingsScreen({ navigation }: Props) {
  const { settings, update, reset, theme } = useSettings();
  const { active } = useServers();
  const themeName = THEME_MANIFEST.find((t) => t.id === settings.selectedThemeID)?.name || settings.selectedThemeID;
  const syntaxName = SYNTAX_MANIFEST.find((s) => s.id === settings.selectedSyntaxID)?.name || settings.selectedSyntaxID;

  const resetAll = () => {
    appAlert('Reset all settings?', 'Appearance, chat and developer preferences return to their defaults. Server connections are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => reset() },
    ]);
  };

  return (
    <Screen>
      <TopBar title="Settings" onBack={() => navigation.goBack()} large />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SettingsSection title="Appearance">
          <SettingsRow icon="color-palette-outline" label="Theme" value={themeName} onPress={() => navigation.navigate('Appearance')} />
          <SettingsRow icon="code-slash-outline" label="Code highlighting" value={syntaxName} onPress={() => navigation.navigate('SyntaxPicker')} last />
        </SettingsSection>

        <SettingsSection title="Chat">
          <SwitchRow
            label="Collapse consecutive tool calls"
            description="Group back-to-back tool invocations into one expandable card."
            value={settings.collapseConsecutiveToolCalls}
            onValueChange={(v) => update({ collapseConsecutiveToolCalls: v })}
          />
          <SwitchRow
            label="Hide project directory"
            description="Strip the active directory prefix from file paths in messages."
            value={settings.hideUserDirectoryPrefix}
            onValueChange={(v) => update({ hideUserDirectoryPrefix: v })}
          />
          <SettingsRow
            icon="send-outline"
            label="Follow-up delivery"
            value={settings.followUpDelivery === 'queue' ? 'Queue' : 'Steer'}
            detail="What happens when you send while a turn is running."
            onPress={() => update({ followUpDelivery: settings.followUpDelivery === 'queue' ? 'steer' : 'queue' })}
            last
          />
        </SettingsSection>

        <SettingsSection title="Connection">
          <SettingsRow
            icon="server-outline"
            label="Servers"
            value={active?.name}
            detail={active?.baseUrl}
            onPress={() => navigation.navigate('Servers')}
            last
          />
        </SettingsSection>

        <SettingsSection title="Developer" footer="Developer tools expose low-level server diagnostics and experimental switches.">
          <SwitchRow
            label="Developer tools"
            value={settings.developerTools}
            onValueChange={(v) => update({ developerTools: v })}
          />
          {settings.developerTools ? (
            <>
              <SettingsRow icon="pulse-outline" label="Diagnostics" onPress={() => navigation.navigate('Diagnostics')} />
              <SettingsRow icon="flag-outline" label="Feature flags" onPress={() => navigation.navigate('FeatureFlags')} />
              <SettingsRow icon="library-outline" label="TextMate languages" onPress={() => navigation.navigate('TextMateLanguages')} />
              <SettingsRow icon="list-outline" label="TextMate logbook" onPress={() => navigation.navigate('TextMateLogbook')} last />
            </>
          ) : null}
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow icon="images-outline" label="Theme gallery" onPress={() => navigation.navigate('Gallery')} />
          <SettingsRow icon="information-circle-outline" label="About OpenCode Mobile" value={`v${APP_VERSION}`} onPress={() => navigation.navigate('About')} last />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow icon="refresh-outline" label="Reset settings" accent={theme.colors.error} onPress={resetAll} last />
        </SettingsSection>

        <Text style={{ color: theme.colors.textWeaker, fontSize: 11, textAlign: 'center', marginTop: 26 }}>
          OpenCode Mobile {APP_VERSION}
        </Text>
      </ScrollView>
    </Screen>
  );
}
