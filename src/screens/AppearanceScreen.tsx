import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { Screen, Segmented, SwitchRow, TopBar } from '../components/ui';
import { SettingsRow, SettingsSection } from '../components/settings';
import { buildTheme, SYNTAX_MANIFEST, THEME_MANIFEST } from '../theme/themes';

type Props = NativeStackScreenProps<RootStackParamList, 'Appearance'>;

export function AppearanceScreen({ navigation }: Props) {
  const { settings, update, theme } = useSettings();
  const themeName = THEME_MANIFEST.find((t) => t.id === settings.selectedThemeID)?.name || settings.selectedThemeID;
  const syntaxName = SYNTAX_MANIFEST.find((s) => s.id === settings.selectedSyntaxID)?.name || settings.selectedSyntaxID;
  const preview = buildTheme(settings.selectedThemeID, theme.mode, settings.selectedSyntaxID);
  const c = preview.colors;

  return (
    <Screen>
      <TopBar title="Appearance" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <View style={[styles.preview, { backgroundColor: c.background, borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <View style={[styles.dot, { backgroundColor: c.diffAdd }]} />
              <View style={[styles.dot, { backgroundColor: c.warning }]} />
              <View style={[styles.dot, { backgroundColor: c.diffDelete }]} />
              <Text style={{ color: c.textWeak, fontSize: 10, marginLeft: 4 }}>preview · {theme.mode}</Text>
            </View>
            <View style={[styles.bubble, { backgroundColor: c.surfaceRaised, borderColor: c.borderWeaker }]}>
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>Implement the settings screen</Text>
              <Text style={{ color: c.textWeak, fontSize: 11.5, marginTop: 4 }}>I&apos;ll wire the appearance controls and verify them.</Text>
            </View>
            <View style={[styles.code, { backgroundColor: c.codeBg }]}>
              <Text style={{ color: preview.syntax.keyword, fontSize: 11.5, fontFamily: 'monospace' }}>const</Text>
              <Text style={{ color: preview.syntax.variable, fontSize: 11.5, fontFamily: 'monospace' }}> theme </Text>
              <Text style={{ color: preview.syntax.operator, fontSize: 11.5, fontFamily: 'monospace' }}>= </Text>
              <Text style={{ color: preview.syntax.string, fontSize: 11.5, fontFamily: 'monospace' }}>&apos;porcelain&apos;</Text>
            </View>
          </View>
        </View>

        <SettingsSection title="Mode">
          <View style={{ padding: 14 }}>
            <Segmented
              value={settings.themeMode}
              onChange={(mode) => update({ themeMode: mode })}
              options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
            />
          </View>
        </SettingsSection>

        <SettingsSection title="Colors">
          <SettingsRow icon="color-palette-outline" label="Theme" value={themeName} onPress={() => navigation.navigate('ThemePicker')} last />
        </SettingsSection>

        <SettingsSection title="Code">
          <SettingsRow icon="code-slash-outline" label="Syntax palette" value={syntaxName} onPress={() => navigation.navigate('SyntaxPicker')} />
          <SwitchRow
            label="Highlight fenced code"
            description="Use syntax colors for code blocks in chat."
            value={settings.markdownHighlight}
            onValueChange={(v) => update({ markdownHighlight: v })}
          />
          <SwitchRow
            label="TextMate grammars"
            description="Use TextMate grammars for accurate tokenization when available."
            value={settings.textMateEnabled}
            onValueChange={(v) => update({ textMateEnabled: v })}
          />
        </SettingsSection>

        <Text style={{ color: theme.colors.textWeak, fontSize: 11.5, lineHeight: 16, paddingHorizontal: 16, marginTop: 12 }}>
          Theme presets come from the desktop app. Syntax palettes change code colors without changing the interface.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  bubble: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 10, marginBottom: 8 },
  code: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', flexWrap: 'wrap' },
});
