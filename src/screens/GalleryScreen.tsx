import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { Screen, TopBar } from '../components/ui';
import { buildTheme, SYNTAX_MANIFEST, THEME_MANIFEST, type ThemeID } from '../theme/themes';

type Props = NativeStackScreenProps<RootStackParamList, 'Gallery'>;

export function GalleryScreen({ navigation }: Props) {
  const { settings, update, theme } = useSettings();

  const choose = (id: ThemeID) => {
    update({ selectedThemeID: id });
    navigation.navigate('ThemePicker');
  };

  return (
    <Screen>
      <TopBar title="Theme gallery" subtitle="Every preset, light and dark" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {THEME_MANIFEST.map((item) => {
          const light = buildTheme(item.id, 'light', settings.selectedSyntaxID);
          const dark = buildTheme(item.id, 'dark', settings.selectedSyntaxID);
          return (
            <Pressable key={item.id} onPress={() => choose(item.id)}>
              <View style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 7 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{item.name}</Text>
                  <Text style={{ color: theme.colors.textWeak, fontSize: 11 }}>{settings.selectedThemeID === item.id ? 'Current' : 'Tap to use'}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[light, dark].map((p) => (
                    <View key={p.mode} style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderWeaker, backgroundColor: p.colors.background }}>
                      <View style={{ padding: 10 }}>
                        <Text style={{ color: p.colors.textWeak, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.7 }}>{p.mode}</Text>
                        <Text style={{ color: p.colors.text, fontSize: 14, fontWeight: '600', marginTop: 5 }}>Good morning</Text>
                        <Text style={{ color: p.colors.textWeak, fontSize: 11, marginTop: 3 }}>Pick up where you left off.</Text>
                        <View style={{ flexDirection: 'row', gap: 5, marginTop: 9 }}>
                          <View style={{ height: 24, flex: 1, borderRadius: 6, backgroundColor: p.colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: p.colors.borderWeaker }} />
                          <View style={{ width: 38, borderRadius: 6, backgroundColor: p.colors.buttonPrimary }} />
                        </View>
                        <View style={{ marginTop: 9, backgroundColor: p.colors.codeBg, borderRadius: 6, padding: 7 }}>
                          <Text style={{ color: p.syntax.keyword, fontFamily: 'monospace', fontSize: 9.5 }}>const</Text>
                          <Text style={{ color: p.syntax.string, fontFamily: 'monospace', fontSize: 9.5 }}> session = await open()</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', height: 6 }}>
                        <View style={{ flex: 1, backgroundColor: p.colors.interactive }} />
                        <View style={{ flex: 1, backgroundColor: p.colors.success }} />
                        <View style={{ flex: 1, backgroundColor: p.colors.warning }} />
                        <View style={{ flex: 1, backgroundColor: p.colors.error }} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}
        <Text style={{ color: theme.colors.textWeak, fontSize: 12, lineHeight: 18, marginTop: 2 }}>
          Syntax: {SYNTAX_MANIFEST.find((s) => s.id === settings.selectedSyntaxID)?.name}. Change the syntax palette in Appearance → Code highlighting.
        </Text>
      </ScrollView>
    </Screen>
  );
}
