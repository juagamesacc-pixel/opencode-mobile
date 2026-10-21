import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../state/settings';

export function SettingsSection({ title, footer, children, style }: {
  title?: string; footer?: string; children: React.ReactNode; style?: ViewStyle;
}) {
  const { theme } = useSettings();
  return (
    <View style={[{ marginTop: 22 }, style]}>
      {title ? (
        <Text style={{ color: theme.colors.textWeak, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', paddingHorizontal: 16, marginBottom: 7 }}>
          {title}
        </Text>
      ) : null}
      <View style={{ backgroundColor: theme.colors.surfaceRaised, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderWeaker }}>
        {children}
      </View>
      {footer ? <Text style={{ color: theme.colors.textWeak, fontSize: 11.5, lineHeight: 16, paddingHorizontal: 16, marginTop: 7 }}>{footer}</Text> : null}
    </View>
  );
}

export function SettingsRow({ icon, label, value, detail, onPress, accent, last, right }: {
  icon?: any; label: string; value?: string; detail?: string; onPress?: () => void;
  accent?: string; last?: boolean; right?: React.ReactNode;
}) {
  const { theme } = useSettings();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.borderWeaker,
        backgroundColor: pressed ? c.surface : 'transparent',
      })}
    >
      {icon ? (
        <View style={{ width: 27, alignItems: 'flex-start' }}>
          <Ionicons name={icon} size={18} color={accent || c.iconStrong} />
        </View>
      ) : null}
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ color: accent || c.text, fontSize: 15 }}>{label}</Text>
        {detail ? <Text style={{ color: c.textWeak, fontSize: 11.5, marginTop: 2, lineHeight: 15 }}>{detail}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} style={{ color: c.textWeak, fontSize: 13, maxWidth: '45%', marginRight: 4 }}>{value}</Text> : null}
      {right || (onPress ? <Ionicons name="chevron-forward" size={16} color={c.textWeaker} /> : null)}
    </Pressable>
  );
}

export function SettingsValue({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  const { theme } = useSettings();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, minHeight: 48,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderWeaker,
    }}>
      <Text style={{ color: theme.colors.text, fontSize: 15, flex: 1 }}>{label}</Text>
      {children}
    </View>
  );
}
