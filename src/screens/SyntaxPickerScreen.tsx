import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { Screen, TopBar } from '../components/ui';
import { buildTheme, SYNTAX_MANIFEST, type SyntaxID } from '../theme/themes';

type Props = NativeStackScreenProps<RootStackParamList, 'SyntaxPicker'>;

export function SyntaxPickerScreen({ navigation }: Props) {
  const { settings, update, theme } = useSettings();

  const select = (id: SyntaxID) => {
    update({ selectedSyntaxID: id });
    navigation.goBack();
  };

  return (
    <Screen>
      <TopBar title="Code highlighting" subtitle="Syntax palette" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {SYNTAX_MANIFEST.map((item) => {
          const p = buildTheme(settings.selectedThemeID, theme.mode, item.id);
          const s = p.syntax;
          const selected = settings.selectedSyntaxID === item.id;
          return (
            <Pressable key={item.id} onPress={() => select(item.id)}>
              <View style={[styles.card, { backgroundColor: p.colors.codeBg, borderColor: selected ? theme.colors.interactive : theme.colors.borderWeaker }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 9 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: p.colors.text, fontSize: 14, fontWeight: '600' }}>{item.name}</Text>
                    <Text style={{ color: p.colors.textWeak, fontSize: 11.5, marginTop: 2 }}>{item.blurb}</Text>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.interactive} /> : <View style={{ width: 20 }} />}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6 }}>
                  <Text style={{ color: s.keyword, fontFamily: 'monospace', fontSize: 11.5 }}>export</Text>
                  <Text style={{ color: s.keyword, fontFamily: 'monospace', fontSize: 11.5 }}>function</Text>
                  <Text style={{ color: s.type, fontFamily: 'monospace', fontSize: 11.5 }}>Session</Text>
                  <Text style={{ color: s.punctuation, fontFamily: 'monospace', fontSize: 11.5 }}>(</Text>
                  <Text style={{ color: s.property, fontFamily: 'monospace', fontSize: 11.5 }}>id</Text>
                  <Text style={{ color: s.punctuation, fontFamily: 'monospace', fontSize: 11.5 }}>: </Text>
                  <Text style={{ color: s.primitive, fontFamily: 'monospace', fontSize: 11.5 }}>string</Text>
                  <Text style={{ color: s.punctuation, fontFamily: 'monospace', fontSize: 11.5 }}>) {'{'}</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, marginTop: 3 }}>
                  <Text style={{ color: s.comment, fontFamily: 'monospace', fontSize: 11.5 }}>{'// '}</Text>
                  <Text style={{ color: s.string, fontFamily: 'monospace', fontSize: 11.5 }}>&apos;hello, world&apos;</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, marginTop: 3 }}>
                  <Text style={{ color: s.constant, fontFamily: 'monospace', fontSize: 11.5 }}>const</Text>
                  <Text style={{ color: s.variable, fontFamily: 'monospace', fontSize: 11.5 }}> answer</Text>
                  <Text style={{ color: s.operator, fontFamily: 'monospace', fontSize: 11.5 }}> = </Text>
                  <Text style={{ color: s.primitive, fontFamily: 'monospace', fontSize: 11.5 }}>42</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
                  {['comment', 'keyword', 'string', 'primitive', 'property', 'type', 'variable', 'operator'].map((k) => (
                    <View key={k} style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: s[k] || p.colors.textWeak }} />
                  ))}
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
  card: { borderRadius: 12, borderWidth: 1.5, padding: 13, marginBottom: 12 },
});
