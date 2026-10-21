import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import type { ServerProfile } from '../api/types';
import { Button, Card, EmptyState, Screen, TopBar } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Servers'>;

export function ServersScreen({ navigation }: Props) {
  const { servers, active, setActive, removeServer, refreshActive } = useServers();
  const { theme } = useSettings();
  const c = theme.colors;
  const [busy, setBusy] = useState<string | null>(null);

  const test = async (server: ServerProfile) => {
    if (server.id !== active?.id) setActive(server.id);
    setBusy(server.id);
    const updated = await refreshActive();
    setBusy(null);
    if (updated) Alert.alert('Connected', `${updated.name}\n${updated.baseUrl}\nProtocol ${updated.protocol.toUpperCase()}`);
    else Alert.alert('Connection failed', 'The server did not answer the health check. Check the URL and credentials.');
  };

  const confirmRemove = (server: ServerProfile) => {
    Alert.alert('Remove server?', `${server.name}\n${server.baseUrl}\n\nIts saved password and project list will be removed from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try { await removeServer(server.id); }
          catch (e) { Alert.alert('Could not remove server', e instanceof Error ? e.message : String(e)); }
        },
      },
    ]);
  };

  return (
    <Screen>
      <TopBar
        title="Servers"
        subtitle={`${servers.length} saved`}
        onBack={() => navigation.goBack()}
        actions={<Pressable onPress={() => navigation.navigate('ServerSetup', { mode: 'add' })} hitSlop={10} style={styles.icon}><Ionicons name="add" size={24} color={c.iconStrong} /></Pressable>}
      />
      <FlatList
        data={servers}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
        renderItem={({ item }) => {
          const isActive = item.id === active?.id;
          return (
            <Card style={{ marginBottom: 10, padding: 0 }}>
              <Pressable onPress={() => setActive(item.id)} style={({ pressed }) => ({ padding: 14, opacity: pressed ? 0.75 : 1 })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <View style={[styles.badge, { backgroundColor: isActive ? c.surfaceSuccess : c.surfaceRaised }]}>
                    <Ionicons name="server-outline" size={19} color={isActive ? c.success : c.icon} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }}>{item.name}</Text>
                      {isActive ? <View style={[styles.activeDot, { backgroundColor: c.success }]} /> : null}
                    </View>
                    <Text numberOfLines={1} style={{ color: c.textWeak, fontSize: 11.5, marginTop: 3 }}>{item.baseUrl}</Text>
                    <Text style={{ color: c.textWeaker, fontSize: 10.5, marginTop: 3 }}>
                      {item.protocol.toUpperCase()} · user {item.username || 'opencode'} · {item.password ? 'password saved' : 'no password'}
                    </Text>
                  </View>
                  {busy === item.id ? <ActivityIndicator size="small" color={c.textWeak} /> : null}
                </View>
              </Pressable>
              <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderWeaker }}>
                <Pressable onPress={() => test(item)} style={styles.action}><Ionicons name="pulse-outline" size={15} color={c.textWeak} /><Text style={{ color: c.textWeak, fontSize: 12, marginLeft: 5 }}>Test</Text></Pressable>
                <Pressable onPress={() => navigation.navigate('ServerSetup', { mode: 'edit', id: item.id })} style={styles.action}><Ionicons name="create-outline" size={15} color={c.textWeak} /><Text style={{ color: c.textWeak, fontSize: 12, marginLeft: 5 }}>Edit</Text></Pressable>
                <Pressable onPress={() => confirmRemove(item)} style={styles.action}><Ionicons name="trash-outline" size={15} color={c.error} /><Text style={{ color: c.error, fontSize: 12, marginLeft: 5 }}>Remove</Text></Pressable>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={<EmptyState icon="server-outline" title="No servers yet" body="Add an opencode server URL, or scan the pairing QR code from the desktop app." />}
      />
      <View style={[styles.footer, { borderTopColor: c.borderWeaker, backgroundColor: c.background }]}>
        <Button label="Add server" icon="add" variant="primary" onPress={() => navigation.navigate('ServerSetup', { mode: 'add' })} />
        <View style={{ height: 8 }} />
        <Button label="Scan pairing QR" icon="qr-code-outline" onPress={() => navigation.navigate('PairQR')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { padding: 8 },
  badge: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
