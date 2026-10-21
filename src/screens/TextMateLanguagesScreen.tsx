import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { Screen, TopBar } from '../components/ui';
import { SettingsSection } from '../components/settings';

type Props = NativeStackScreenProps<RootStackParamList, 'TextMateLanguages'>;

export const LANGUAGES: { id: string; name: string; ext: string }[] = [
  { id: 'typescript', name: 'TypeScript', ext: 'ts, tsx' },
  { id: 'javascript', name: 'JavaScript', ext: 'js, jsx, mjs' },
  { id: 'tsx', name: 'TSX', ext: 'tsx' },
  { id: 'json', name: 'JSON', ext: 'json, jsonc' },
  { id: 'html', name: 'HTML', ext: 'html, htm' },
  { id: 'css', name: 'CSS', ext: 'css, scss, less' },
  { id: 'markdown', name: 'Markdown', ext: 'md, mdx' },
  { id: 'python', name: 'Python', ext: 'py' },
  { id: 'rust', name: 'Rust', ext: 'rs' },
  { id: 'go', name: 'Go', ext: 'go' },
  { id: 'java', name: 'Java', ext: 'java' },
  { id: 'kotlin', name: 'Kotlin', ext: 'kt, kts' },
  { id: 'swift', name: 'Swift', ext: 'swift' },
  { id: 'c', name: 'C', ext: 'c, h' },
  { id: 'cpp', name: 'C++', ext: 'cpp, cc, hpp' },
  { id: 'csharp', name: 'C#', ext: 'cs' },
  { id: 'ruby', name: 'Ruby', ext: 'rb' },
  { id: 'php', name: 'PHP', ext: 'php' },
  { id: 'shell', name: 'Shell', ext: 'sh, bash, zsh' },
  { id: 'yaml', name: 'YAML', ext: 'yml, yaml' },
  { id: 'toml', name: 'TOML', ext: 'toml' },
  { id: 'sql', name: 'SQL', ext: 'sql' },
  { id: 'dockerfile', name: 'Dockerfile', ext: 'Dockerfile' },
  { id: 'diff', name: 'Diff', ext: 'diff, patch' },
];

type Mode = 'auto' | 'force' | 'off';

export function TextMateLanguagesScreen({ navigation }: Props) {
  const { settings, update, theme } = useSettings();
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => LANGUAGES.filter((l) => (l.name + l.id + l.ext).toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  const modeFor = (id: string): Mode =>
    settings.textMateForceEnabledLanguages.includes(id) ? 'force'
      : settings.textMateDisabledLanguages.includes(id) ? 'off' : 'auto';

  const cycle = (id: string) => {
    const mode = modeFor(id);
    const force = settings.textMateForceEnabledLanguages.filter((x) => x !== id);
    const off = settings.textMateDisabledLanguages.filter((x) => x !== id);
    if (mode === 'auto') force.push(id);
    else if (mode === 'force') off.push(id);
    update({ textMateForceEnabledLanguages: force, textMateDisabledLanguages: off });
  };

  return (
    <Screen>
      <TopBar title="TextMate languages" subtitle="Tokenization overrides" onBack={() => navigation.goBack()} />
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderWeaker, paddingHorizontal: 10 }}>
          <Ionicons name="search" size={16} color={theme.colors.icon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search languages"
            placeholderTextColor={theme.colors.textWeaker}
            style={{ flex: 1, color: theme.colors.text, paddingVertical: 9, marginLeft: 7, fontSize: 14 }}
          />
        </View>
        <Text style={{ color: theme.colors.textWeak, fontSize: 11.5, lineHeight: 16, marginTop: 8 }}>
          Tap a language to cycle Automatic → Force TextMate → Disabled. Overrides apply when the client has a matching grammar.
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SettingsSection>
          {filtered.map((lang, i) => {
            const mode = modeFor(lang.id);
            const color = mode === 'off' ? theme.colors.textWeaker : mode === 'force' ? theme.colors.success : theme.colors.textWeak;
            return (
              <Pressable
                key={lang.id}
                onPress={() => cycle(lang.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11,
                  backgroundColor: pressed ? theme.colors.surface : 'transparent',
                  borderBottomWidth: i === filtered.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: theme.colors.borderWeaker,
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 14 }}>{lang.name}</Text>
                  <Text style={{ color: theme.colors.textWeak, fontSize: 11, marginTop: 2 }}>{lang.ext}</Text>
                </View>
                <Text style={{ color, fontSize: 11, fontWeight: '600', marginRight: 8 }}>
                  {mode === 'auto' ? 'Auto' : mode === 'force' ? 'Force' : 'Off'}
                </Text>
                <Ionicons name={mode === 'auto' ? 'ellipse-outline' : mode === 'force' ? 'checkmark-circle' : 'close-circle-outline'} size={18} color={color} />
              </Pressable>
            );
          })}
        </SettingsSection>
        {!settings.textMateEnabled ? (
          <Text style={{ color: theme.colors.warning, fontSize: 11.5, padding: 16 }}>
            TextMate grammars are disabled globally in Appearance. These overrides are saved but inactive.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
