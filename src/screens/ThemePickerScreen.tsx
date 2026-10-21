import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { Screen, TopBar } from '../components/ui';
import { buildTheme, THEME_MANIFEST, type ThemeID } from '../theme/themes';

type Props = NativeStackScreenProps<RootStackParamList, 'ThemePicker'>;

export function ThemePickerScreen({ navigation }: Props) {
  const { settings, update, theme } = useSettings();

  const select = (id: ThemeID) => {
    update({ selectedThemeID: id });
    navigation.goBack();
  };

  return (
    <Screen>
      <TopBar title="Theme" subtitle="Interface colors" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {THEME_MANIFEST.map((item) => {
          const light = buildTheme(item.id, 'light', settings.selectedSyntaxID);
          const dark = buildTheme(item.id, 'dark', settings.selectedSyntaxID);
          const selected = settings.selectedThemeID === item.id;
          return (
            <Pressable key={item.id} onPress={() => select(item.id)}>
              <View style={[styles.card, { borderColor: selected ? theme.colors.interactive : theme.colors.borderWeaker }]}>
                <View style={{ flexDirection: 'row' }}>
                  <View style={[styles.half, { backgroundColor: light.colors.background, borderRightColor: light.colors.border }]}>
                    <Text style={{ color: light.colors.text, fontSize: 12, fontWeight: '600' }}>Aa</Text>
                    <View style={[styles.bar, { backgroundColor: light.colors.textWeak, width: '72%' }]} />
                    <View style={[styles.bar, { backgroundColor: light.colors.textWeaker, width: '48%' }]} />
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                      <View style={[styles.swatch, { backgroundColor: light.colors.interactive }]} />
                      <View style={[styles.swatch, { backgroundColor: light.colors.success }]} />
                      <View style={[styles.swatch, { backgroundColor: light.colors.warning }]} />
                    </View>
                  </View>
                  <View style={[styles.half, { backgroundColor: dark.colors.background }]}>
                    <Text style={{ color: dark.colors.text, fontSize: 12, fontWeight: '600' }}>Aa</Text>
                    <View style={[styles.bar, { backgroundColor: dark.colors.textWeak, width: '72%' }]} />
                    <View style={[styles.bar, { backgroundColor: dark.colors.textWeaker, width: '48%' }]} />
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                      <View style={[styles.swatch, { backgroundColor: dark.colors.interactive }]} />
                      <View style={[styles.swatch, { backgroundColor: dark.colors.success }]} />
                      <View style={[styles.swatch, { backgroundColor: dark.colors.warning }]} />
                    </View>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>{item.name}</Text>
                    <Text style={{ color: theme.colors.textWeak, fontSize: 11.5, marginTop: 2 }}>{item.blurb}</Text>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={21} color={theme.colors.interactive} /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1.5, overflow: 'hidden', marginBottom: 12 },
  half: { flex: 1, padding: 12, minHeight: 88, borderRightWidth: StyleSheet.hairlineWidth },
  bar: { height: 4, borderRadius: 2, marginTop: 7 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
});
