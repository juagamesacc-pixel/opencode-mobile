import { appAlert } from '../components/dialog';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import { ApiClient } from '../api/client';
import { Screen, TopBar } from '../components/ui';
import { TERMINAL_HTML } from '../assets_terminal';

type Props = NativeStackScreenProps<RootStackParamList, 'Terminal'>;

function decodeData(data: any): string {
  if (typeof data === 'string') return data;
  try {
    const bytes = new Uint8Array(data);
    const Decoder = (globalThis as any).TextDecoder;
    if (Decoder) return new Decoder('utf-8').decode(bytes);
    // Minimal UTF-8 fallback for runtimes without TextDecoder.
    let out = '';
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i++];
      if (b < 0x80) out += String.fromCharCode(b);
      else if (b >= 0xc0 && b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
      else if (b >= 0xe0 && b < 0xf0) out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
      else if (b >= 0xf0) {
        const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        const v = cp - 0x10000;
        out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
      }
    }
    return out;
  } catch { return ''; }
}

export function TerminalScreen({ navigation, route }: Props) {
  const { ptyId, title, directory } = route.params;
  const { active } = useServers();
  const { theme } = useSettings();
  const webRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [attempt, setAttempt] = useState(0);

  const write = useCallback((text: string) => {
    webRef.current?.injectJavaScript(`window.terminalWrite(${JSON.stringify(text)}); true;`);
  }, []);

  const connect = useCallback(() => {
    if (!active) return;
    const client = new ApiClient(active, directory);
    let closed = false;
    let socket: WebSocket | null = null;
    setStatus('connecting');
    (async () => {
      let ticket: string | null = null;
      try { ticket = await client.ptyTicket(ptyId); } catch {}
      if (closed) return;
      const { url, headers } = client.ptySocketUrl(ptyId, '0', ticket);
      let ws: WebSocket;
      try {
        ws = new (WebSocket as any)(url, [], { headers });
        ws.binaryType = 'arraybuffer';
        socket = ws;
      } catch (e) {
        setStatus('error');
        write(`\r\n\x1b[31mCould not open terminal socket: ${String(e)}\x1b[0m\r\n`);
        return;
      }
      socketRef.current = ws;
      ws.onopen = () => {
        if (closed) return;
        setStatus('open');
        setTimeout(() => webRef.current?.injectJavaScript('window.terminalFit(); true;'), 100);
      };
      ws.onmessage = (evt) => {
        const data = decodeData((evt as any).data);
        if (data) write(data);
      };
      ws.onerror = () => {
        if (!closed) setStatus('error');
      };
      ws.onclose = (e) => {
        if (closed) return;
        setStatus('closed');
        write(`\r\n\x1b[33m[disconnected${e.code ? ` ${e.code}` : ''}]\x1b[0m\r\n`);
      };
    })();
    return () => {
      closed = true;
      try { socket?.close(); } catch {}
      socketRef.current = null;
    };
  }, [active, ptyId, directory, write]);

  // The connection setup must run whenever its keys change (server, PTY,
  // directory, or a manual reconnect). The live `connect` is reached through a
  // ref refreshed every render, so the effect body holds no reactive values
  // and reconnects do not depend on callback identity.
  const connectRef = useRef(connect);
  useEffect(() => { connectRef.current = connect; });
  useEffect(() => {
    const cleanup = connectRef.current();
    return cleanup;
  }, [active?.id, ptyId, directory, attempt, write]);

  const onMessage = (event: any) => {
    let msg: any;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type === 'ready') {
      webRef.current?.injectJavaScript(`window.terminalSetTheme(${JSON.stringify({
        background: theme.colors.background,
        foreground: theme.colors.text,
        cursor: theme.colors.text,
        selectionBackground: theme.colors.surfaceInteractive,
        // ANSI black must not be the background colour: output using colour 30
        // would otherwise be painted in exactly the page background (invisible
        // in both light and dark mode).
        black: theme.colors.textWeak,
        brightBlack: theme.colors.textWeak,
        white: theme.colors.text,
        brightWhite: theme.colors.text,
        blue: theme.syntax.primitive,
        green: theme.syntax.string,
        yellow: theme.syntax.type,
        red: theme.syntax.variable,
        magenta: theme.syntax.keyword,
        cyan: theme.syntax.property,
      })}); true;`);
      setTimeout(() => webRef.current?.injectJavaScript('window.terminalFit(); true;'), 150);
    } else if (msg.type === 'data' && typeof msg.data === 'string') {
      socketRef.current?.send(msg.data);
    } else if (msg.type === 'resize' && msg.cols && msg.rows && active) {
      new ApiClient(active, directory).resizePty(ptyId, msg.cols, msg.rows).catch(() => {});
    }
  };

  const reconnect = () => {
    try { socketRef.current?.close(); } catch {}
    setAttempt((n) => n + 1);
  };

  const kill = () => {
    appAlert('Close terminal?', 'The shell process will be stopped on the server.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close', style: 'destructive', onPress: async () => {
          if (!active) return;
          await new ApiClient(active, directory).removePty(ptyId).catch(() => {});
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <TopBar
        title={title || 'Terminal'}
        subtitle={status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Connection error' : 'Disconnected'}
        onBack={() => navigation.goBack()}
        actions={
          <>
            {status !== 'open' ? <Pressable onPress={reconnect} hitSlop={10} style={styles.icon}><Ionicons name="refresh" size={19} color={theme.colors.iconStrong} /></Pressable> : null}
            <Pressable onPress={kill} hitSlop={10} style={styles.icon}><Ionicons name="trash-outline" size={18} color={theme.colors.iconStrong} /></Pressable>
          </>
        }
      />
      {status === 'connecting' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: theme.colors.surfaceRaised }}>
          <ActivityIndicator size="small" color={theme.colors.textWeak} />
          <Text style={{ color: theme.colors.textWeak, fontSize: 11 }}>Opening PTY stream…</Text>
        </View>
      ) : null}
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: TERMINAL_HTML }}
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        containerStyle={{ backgroundColor: theme.colors.background }}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        overScrollMode="never"
        scrollEnabled={false}
        bounces={false}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { padding: 9 },
});
