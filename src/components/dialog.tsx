import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../state/settings';

// Drop-in replacement for react-native's Alert.alert(): the same
// (title, message?, buttons?) call shape, but rendered as the app's own
// themed modal (no OS chrome), tinted by the active theme.
//
// A module-level queue keeps this imperative: any screen (or callback,
// or event handler) can call appAlert() without prop drilling, and the
// <DialogHost /> mounted once under the theme providers renders the
// queue, one dialog at a time, popping only when a button is pressed.

export interface DialogButton {
  text: string;
  /** 'cancel' renders as the dismissive action, 'destructive' in the error color. */
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface QueuedDialog {
  title: string;
  message?: string;
  buttons: DialogButton[];
}

const listeners = new Set<(d: QueuedDialog) => void>();

export function appAlert(title: string, message?: string, buttons?: DialogButton[]): void {
  const d: QueuedDialog = {
    title,
    message,
    buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }],
  };
  for (const l of listeners) l(d);
}

export function DialogHost() {
  const { theme } = useSettings();
  const c = theme.colors;
  const [queue, setQueue] = useState<QueuedDialog[]>([]);
  const visible = queue.length > 0;
  const current = visible ? queue[0] : undefined;

  useEffect(() => {
    const enqueue = (d: QueuedDialog) => setQueue((q) => [...q, d]);
    listeners.add(enqueue);
    return () => { listeners.delete(enqueue); };
  }, []);

  // Left/right: dismissive action first, primary action last — mirrors the
  // platform dialogs it replaces.
  const ordered = (current?.buttons.slice() || [])
    .sort((a, b) => (a.style === 'cancel' ? -1 : b.style === 'cancel' ? 1 : 0));

  const tap = (b: DialogButton) => {
    try { b.onPress?.(); } finally { setQueue((q) => q.slice(1)); }
  };
  const dismiss = () => {
    const cancel = ordered.find((b) => b.style === 'cancel');
    tap(cancel || ordered[ordered.length - 1] || { text: 'OK' });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdropWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <KeyboardAvoidingView behavior="padding" style={styles.centerWrap} pointerEvents="box-none">
          <View style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 16 }]}>
            <Text style={{ color: c.text, fontSize: 16.5, fontWeight: '700', letterSpacing: -0.1 }}>{current?.title || ''}</Text>
            {current?.message ? (
              <Text style={{ color: c.textBase, fontSize: 13.5, lineHeight: 19.5, marginTop: 7 }}>{current.message}</Text>
            ) : null}
            {ordered.length > 1 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                {ordered.map((b) => (
                  <Pressable
                    key={`${b.text}-${b.style || 'default'}`}
                    onPress={() => tap(b)}
                    style={({ pressed }) => [
                      styles.dialogBtn,
                      b.style === 'destructive' && { borderColor: c.border, backgroundColor: pressed ? c.surfaceCritical : 'transparent' },
                      b.style !== 'destructive' && { backgroundColor: pressed ? c.surface : 'transparent' },
                    ]}
                  >
                    <Text style={{
                      color: b.style === 'destructive' ? c.error : b.style === 'cancel' ? c.textWeak : c.text,
                      fontSize: 13.5, fontWeight: b.style === 'cancel' ? '400' : '600',
                    }}>{b.text}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Pressable onPress={() => tap(ordered[0])} hitSlop={8} style={{ alignSelf: 'flex-end', marginTop: 16 }}>
                <Text style={{ color: c.text, fontSize: 14.5, fontWeight: '600' }}>{ordered[0]?.text || 'OK'}</Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  centerWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  dialogBtn: {
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
});
