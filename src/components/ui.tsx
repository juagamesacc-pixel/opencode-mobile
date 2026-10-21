import React from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text,
  TextInput, View, ViewStyle, TextStyle, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../state/settings';

export function useUI() {
  const { theme } = useSettings();
  return theme;
}

export function Screen({ children, style, edges }: { children: React.ReactNode; style?: ViewStyle; edges?: any }) {
  const t = useUI();
  return (
    <SafeAreaView edges={edges || ['top', 'bottom']} style={[{ flex: 1, backgroundColor: t.colors.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function TopBar({
  title, subtitle, onBack, left, actions, large,
}: {
  title: string; subtitle?: string; onBack?: () => void;
  left?: React.ReactNode; actions?: React.ReactNode; large?: boolean;
}) {
  const t = useUI();
  return (
    <View style={[styles.topBar, { borderBottomColor: t.colors.borderWeaker }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={t.colors.iconStrong} />
        </Pressable>
      ) : left}
      <View style={{ flex: 1, marginLeft: onBack ? 2 : 0 }}>
        <Text numberOfLines={1} style={{ color: t.colors.text, fontSize: large ? 22 : 17, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ color: t.colors.textWeak, fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label, onPress, variant = 'secondary', icon, disabled, loading, style, compact,
}: {
  label: string; onPress?: () => void; variant?: ButtonVariant; icon?: any;
  disabled?: boolean; loading?: boolean; style?: ViewStyle; compact?: boolean;
}) {
  const t = useUI();
  const bg = variant === 'primary' ? t.colors.buttonPrimary
    : variant === 'danger' ? t.colors.surfaceCritical
      : variant === 'ghost' ? 'transparent' : t.colors.surfaceRaised;
  const fg = variant === 'primary' ? t.colors.iconInvert
    : variant === 'danger' ? t.colors.error : t.colors.text;
  const border = variant === 'secondary' ? t.colors.border : 'transparent';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
        compact && { paddingVertical: 7, paddingHorizontal: 12 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: compact ? 13 : 14 }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color, size = 22, disabled }: {
  icon: any; onPress?: () => void; color?: string; size?: number; disabled?: boolean;
}) {
  const t = useUI();
  return (
    <Pressable onPress={disabled ? undefined : onPress} hitSlop={10} style={[styles.iconBtn, { opacity: disabled ? 0.4 : 1 }]}>
      <Ionicons name={icon} size={size} color={color || t.colors.iconStrong} />
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const t = useUI();
  const body = (
    <View style={[styles.card, { backgroundColor: t.colors.surfaceRaised, borderColor: t.colors.borderWeaker }, style]}>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>{body}</Pressable> : body;
}

export function Row({ children, style, onPress, disabled }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; disabled?: boolean }) {
  const t = useUI();
  const content = (
    <View style={[styles.row, { borderBottomColor: t.colors.borderWeaker }, style]}>{children}</View>
  );
  return onPress ? <Pressable disabled={disabled} onPress={onPress}>{content}</Pressable> : content;
}

export function Pill({ label, color, bg, icon }: { label: string; color?: string; bg?: string; icon?: any }) {
  const t = useUI();
  return (
    <View style={[styles.pill, { backgroundColor: bg || t.colors.surfaceInteractive }]}>
      {icon ? <Ionicons name={icon} size={11} color={color || t.colors.textInteractive} /> : null}
      <Text style={{ color: color || t.colors.textInteractive, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const t = useUI();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }, style]} />;
}

export function EmptyState({ icon = 'ellipse-outline', title, body, action }: {
  icon?: any; title: string; body?: string; action?: React.ReactNode;
}) {
  const t = useUI();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.colors.surfaceRaised, borderColor: t.colors.borderWeaker }]}>
        <Ionicons name={icon} size={26} color={t.colors.icon} />
      </View>
      <Text style={{ color: t.colors.text, fontSize: 17, fontWeight: '600', marginTop: 14 }}>{title}</Text>
      {body ? <Text style={{ color: t.colors.textWeak, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 300 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 18 }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useUI();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={t.colors.textWeak} />
      {label ? <Text style={{ color: t.colors.textWeak, marginTop: 10, fontSize: 13 }}>{label}</Text> : null}
    </View>
  );
}

export function TextField({
  label, value, onChangeText, placeholder, secureTextEntry, autoCapitalize, keyboardType, multiline, hint, right, autoFocus,
}: {
  label?: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  secureTextEntry?: boolean; autoCapitalize?: any; keyboardType?: any; multiline?: boolean;
  hint?: string; right?: React.ReactNode; autoFocus?: boolean;
}) {
  const t = useUI();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={{ color: t.colors.textBase, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>{label}</Text> : null}
      <View style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: t.colors.surfaceRaised,
        borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, borderRadius: 10, paddingHorizontal: 12,
      }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.colors.textWeaker}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoCorrect={false}
          keyboardType={keyboardType}
          multiline={multiline}
          autoFocus={autoFocus}
          style={{
            flex: 1, color: t.colors.text, fontSize: 15, paddingVertical: multiline ? 12 : 11,
            minHeight: multiline ? 88 : undefined, textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {right}
      </View>
      {hint ? <Text style={{ color: t.colors.textWeak, fontSize: 11, marginTop: 5, lineHeight: 15 }}>{hint}</Text> : null}
    </View>
  );
}

export function SwitchRow({ label, description, value, onValueChange }: {
  label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void;
}) {
  const t = useUI();
  return (
    <Row style={{ paddingVertical: 13 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: t.colors.text, fontSize: 15 }}>{label}</Text>
        {description ? <Text style={{ color: t.colors.textWeak, fontSize: 12, marginTop: 3, lineHeight: 16 }}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: t.colors.border, true: t.colors.interactive }}
        thumbColor="#fff"
      />
    </Row>
  );
}

export function Sheet({ visible, onClose, title, children, full }: {
  visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; full?: boolean;
}) {
  const t = useUI();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: t.colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18,
          maxHeight: full ? '92%' : '78%', borderColor: t.colors.border, borderWidth: StyleSheet.hairlineWidth,
        }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.colors.border }} />
          </View>
          {title ? (
            <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: t.colors.text, fontSize: 17, fontWeight: '600', flex: 1 }}>{title}</Text>
              <IconButton icon="close" onPress={onClose} size={20} />
            </View>
          ) : null}
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useUI();
  return (
    <View style={{ backgroundColor: t.colors.surfaceCritical, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name="alert-circle" size={18} color={t.colors.error} />
      <Text style={{ color: t.colors.error, flex: 1, fontSize: 13, lineHeight: 18 }}>{message}</Text>
      {onRetry ? <Pressable onPress={onRetry}><Text style={{ color: t.colors.error, fontWeight: '700', fontSize: 12 }}>Retry</Text></Pressable> : null}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const t = useUI();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.colors.surfaceRaised, borderRadius: 9, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.borderWeaker }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={{
          flex: 1, paddingVertical: 7, borderRadius: 7, alignItems: 'center',
          backgroundColor: value === o.value ? t.colors.surfaceInteractive : 'transparent',
        }}>
          <Text style={{ color: value === o.value ? t.colors.textInteractive : t.colors.textBase, fontSize: 13, fontWeight: '600' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const textStyles: Record<string, TextStyle> = {
  base: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) as string, fontSize: 12, lineHeight: 17 },
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)' },
});
