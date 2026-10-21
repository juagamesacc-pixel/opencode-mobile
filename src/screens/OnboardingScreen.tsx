import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { useServers } from '../state/servers';
import { Button } from '../components/ui';

type Page = { id: string; icon: any; title: string; body?: string; note?: string; rows?: { icon: any; title: string; detail: string }[] };

const PAGES: Page[] = [
  {
    id: 'unofficial',
    icon: 'terminal-outline' as const,
    title: 'An unofficial\nopencode client',
    body: 'OpenCode Mobile is a native client for opencode sessions — work in progress. It is not an official OpenCode product.',
  },
  {
    id: 'connect',
    icon: 'git-network-outline' as const,
    title: 'Connect to\nyour servers',
    body: 'Point the app at an opencode server on your machine. We recommend Tailscale so your phone can reach it securely from anywhere.',
    note: 'Recommended: Tailscale\nAlso fine: same LAN, VPN, HTTPS, or another tunnel you manage. The app does not create a relay for you.',
  },
  {
    id: 'features',
    icon: 'sparkles-outline' as const,
    title: 'What you can\ndo from here',
    rows: [
      { icon: 'list-outline' as const, title: 'Sessions', detail: 'List, open, create, rename, fork, archive, delete' },
      { icon: 'chatbubble-ellipses-outline' as const, title: 'Chat & abort', detail: 'Send prompts and stop work in flight' },
      { icon: 'shield-checkmark-outline' as const, title: 'Permissions', detail: 'Approve or deny requests (no lasting remember)' },
      { icon: 'git-compare-outline' as const, title: 'Changes', detail: 'Inspect session diffs' },
      { icon: 'pulse-outline' as const, title: 'Live while open', detail: 'Foreground event stream; refresh after reconnect' },
    ],
  },
];

export function OnboardingScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Onboarding'>) {
  const { theme, update } = useSettings();
  const { servers } = useServers();
  const insets = useSafeAreaInsets();
  // Live dimensions: a module-level Dimensions.get('window') snapshot goes
  // stale after rotation, breaking the pager item width and the
  // momentum-to-index math below.
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const last = index === PAGES.length - 1;

  const finish = () => {
    update({ onboardingCompleted: true });
    navigation.reset({ index: 0, routes: [{ name: servers.length ? 'Home' : 'ServerSetup' }] });
  };

  const next = () => {
    if (last) finish();
    else {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      setIndex(index + 1);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <View style={styles.top}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.logo, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
            <Ionicons name="terminal" size={15} color={theme.colors.iconStrong} />
          </View>
          <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 15 }}>OpenCode Mobile</Text>
        </View>
        <Pressable onPress={finish} hitSlop={10}>
          <Text style={{ color: theme.colors.textWeak, fontSize: 13 }}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={PAGES}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 28, paddingTop: 30 }}>
            <View style={[styles.hero, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
              <Ionicons name={item.icon} size={36} color={theme.colors.iconStrong} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -0.6, marginTop: 28 }}>{item.title}</Text>
            {item.body ? (
              <Text style={{ color: theme.colors.textBase, fontSize: 15, lineHeight: 23, marginTop: 14 }}>{item.body}</Text>
            ) : null}
            {item.note ? (
              <Text style={{ color: theme.colors.textWeak, fontSize: 12.5, lineHeight: 19, marginTop: 16 }}>{item.note}</Text>
            ) : null}
            {item.rows ? (
              <View style={{ marginTop: 20, gap: 12 }}>
                {item.rows.map((r: { icon: any; title: string; detail: string }) => (
                  <View key={r.title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <View style={[styles.rowIcon, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderWeaker }]}>
                      <Ionicons name={r.icon} size={16} color={theme.colors.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>{r.title}</Text>
                      <Text style={{ color: theme.colors.textWeak, fontSize: 12.5, lineHeight: 18, marginTop: 1 }}>{r.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      />

      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 20 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
          {PAGES.map((p, i) => (
            <View key={p.id} style={{
              height: 5, width: i === index ? 20 : 5, borderRadius: 3,
              backgroundColor: i === index ? theme.colors.text : theme.colors.border,
            }} />
          ))}
        </View>
        <Button label={last ? 'Get started' : 'Continue'} variant="primary" onPress={next} />
        {last ? (
          <Text style={{ color: theme.colors.textWeak, fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 16 }}>
            OpenCode Mobile is not affiliated with OpenCode.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 8 },
  logo: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  hero: { width: 84, height: 84, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
