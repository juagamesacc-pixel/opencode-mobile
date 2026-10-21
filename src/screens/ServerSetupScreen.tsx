import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import { Button, ErrorBanner, Screen, TextField, TopBar } from '../components/ui';

export function ServerSetupScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'ServerSetup'>) {
  const { theme } = useSettings();
  const { servers, addServer, updateServer } = useServers();
  const editing = route.params?.mode === 'edit' ? servers.find((s) => s.id === route.params?.id) : undefined;

  const [name, setName] = useState(editing?.name || '');
  const [url, setUrl] = useState(editing?.baseUrl || '');
  const [username, setUsername] = useState(editing?.username || 'opencode');
  const [password, setPassword] = useState(editing?.password || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (route.params?.pairUrl) {
      setUrl(route.params.pairUrl);
      if (route.params.pairUser) setUsername(route.params.pairUser);
      if (route.params.pairPass) setPassword(route.params.pairPass);
    }
  }, [route.params?.pairUrl]);

  const save = async () => {
    setError(null);
    if (!url.trim()) {
      setError('Enter the address of your opencode server.');
      return;
    }
    setBusy(true);
    try {
      const input = { name: name.trim() || url.trim(), baseUrl: url.trim(), username: username.trim() || 'opencode', password: password || null };
      if (editing) {
        await updateServer(editing.id, input);
        navigation.goBack();
      } else {
        await addServer(input);
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title={editing ? 'Edit server' : 'Connect to server'} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: theme.colors.text, fontSize: 25, fontWeight: '700', letterSpacing: -0.3 }}>
            {editing ? 'Edit connection' : 'Add server'}
          </Text>
          <Text style={{ color: theme.colors.textBase, fontSize: 13.5, lineHeight: 20, marginTop: 8, marginBottom: 22 }}>
            Point the app at an opencode server on your machine. This app talks to your server directly; it does not create a relay.
          </Text>

          {error ? <View style={{ marginBottom: 14 }}><ErrorBanner message={error} /></View> : null}

          <TextField label="Server URL" value={url} onChangeText={setUrl} placeholder="http://100.64.0.2:4096" autoFocus={!editing} hint="http or https, with the port your server is listening on." />
          <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="My laptop" />
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="opencode"
            hint="Default user is opencode. Password from OPENCODE_SERVER_PASSWORD."
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Optional"
            secureTextEntry={!showPassword}
            right={<Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.colors.textWeak} /></Pressable>}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button label={editing ? 'Save changes' : 'Connect'} variant="primary" onPress={save} loading={busy} disabled={busy} style={{ flex: 1 }} />
          </View>

          {!editing ? (
            <>
              <Pressable onPress={() => navigation.navigate('PairQR')} style={{ marginTop: 12 }}>
                <View style={[styles.qrRow, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
                  <Ionicons name="qr-code-outline" size={20} color={theme.colors.iconStrong} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>Connect with a QR code</Text>
                    <Text style={{ color: theme.colors.textWeak, fontSize: 11.5, marginTop: 2 }}>From opencode2 pair on a v2 server. Classic serve has no QR.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textWeaker} />
                </View>
              </Pressable>
              <Pressable onPress={() => Linking.openURL('https://opencode.ai/docs/server').catch(() => {})} style={{ marginTop: 18, alignSelf: 'center' }}>
                <Text style={{ color: theme.colors.textInteractive, fontSize: 12.5 }}>Open server docs</Text>
              </Pressable>
            </>
          ) : null}

          <View style={{ marginTop: 26 }}>
            <Text style={{ color: theme.colors.textWeak, fontSize: 11.5, lineHeight: 18 }}>
              Recommended: Tailscale. Also fine: same LAN, VPN, HTTPS, or another tunnel you manage. The app does not create a relay for you.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
});
