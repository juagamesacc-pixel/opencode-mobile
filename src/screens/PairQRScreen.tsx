import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { Button, Screen, TopBar } from '../components/ui';

function parsePairing(data: string): { url?: string; user?: string; pass?: string } {
  const trimmed = data.trim();
  if (/^https?:\/\//i.test(trimmed)) return { url: trimmed };
  try {
    const json = JSON.parse(trimmed);
    const urls: string[] = Array.isArray(json.urls) ? json.urls : json.url ? [json.url] : [];
    return {
      url: urls.find((u) => /^https:\/\//i.test(u)) || urls[0],
      user: json.username || json.user,
      pass: json.password || json.token,
    };
  } catch {
    return {};
  }
}

export function PairQRScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'PairQR'>) {
  const { theme } = useSettings();
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onScan = (result: { data: string }) => {
    if (handled || !result?.data) return;
    const parsed = parsePairing(result.data);
    if (!parsed.url) {
      setError('This QR code is not an opencode pairing code.');
      return;
    }
    setHandled(true);
    navigation.navigate({
      name: 'ServerSetup',
      params: { mode: 'add', pairUrl: parsed.url, pairUser: parsed.user, pairPass: parsed.pass },
      merge: true,
    });
  };

  return (
    <Screen>
      <TopBar title="Scan pairing QR" onBack={() => navigation.goBack()} />
      {!permission ? (
        <View style={{ flex: 1 }} />
      ) : !permission.granted ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Ionicons name="camera-outline" size={34} color={theme.colors.icon} />
          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600', marginTop: 12 }}>Allow camera access to scan the pairing QR</Text>
          <Text style={{ color: theme.colors.textWeak, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
            The camera is only used while this screen is open.
          </Text>
          <Button label="Allow camera" variant="primary" onPress={requestPermission} style={{ marginTop: 18 }} />
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handled ? undefined : onScan}
          />
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={[styles.frame, { borderColor: '#fff' }]} />
            <Text style={{ color: '#fff', textAlign: 'center', marginTop: 16, fontSize: 13 }}>
              Point at the pairing QR shown by opencode2
            </Text>
            {error ? <Text style={{ color: '#ffb4a8', textAlign: 'center', marginTop: 8, fontSize: 12 }}>{error}</Text> : null}
          </View>
          <Pressable onPress={() => navigation.goBack()} style={styles.close}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frameWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: 20, borderWidth: 2 },
  close: {
    position: 'absolute', top: 14, right: 14, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
});
