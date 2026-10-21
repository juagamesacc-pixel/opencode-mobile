import React, { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../state/settings';

interface Line { text: string; kind: 'add' | 'del' | 'context' | 'hunk' | 'meta' }

export function DiffView({ patch }: { patch: string }) {
  const { theme } = useSettings();
  const c = theme.colors;
  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    for (const raw of (patch || '').split('\n')) {
      if (raw.startsWith('@@')) out.push({ text: raw, kind: 'hunk' });
      else if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('diff ') || raw.startsWith('index ')) out.push({ text: raw, kind: 'meta' });
      else if (raw.startsWith('+')) out.push({ text: raw, kind: 'add' });
      else if (raw.startsWith('-')) out.push({ text: raw, kind: 'del' });
      else out.push({ text: raw, kind: 'context' });
    }
    return out;
  }, [patch]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ minWidth: '100%' }}>
        {lines.map((line, i) => {
          const bg = line.kind === 'add' ? `${c.diffAdd}18` : line.kind === 'del' ? `${c.diffDelete}18` : line.kind === 'hunk' ? c.surfaceRaised : 'transparent';
          const color = line.kind === 'add' ? c.diffAdd : line.kind === 'del' ? c.diffDelete : line.kind === 'hunk' ? c.textInteractive : line.kind === 'meta' ? c.textWeaker : c.textBase;
          return (
            <View key={i} style={{ flexDirection: 'row', backgroundColor: bg }}>
              <Text style={[styles.no, { color: c.textWeaker, borderRightColor: c.borderWeaker }]}>{String(i + 1).padStart(3, ' ')}</Text>
              <Text style={[styles.line, { color }]}>{line.text || ' '}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace' }) as string;

const styles = StyleSheet.create({
  no: { fontFamily: mono, fontSize: 11, lineHeight: 18, paddingHorizontal: 6, borderRightWidth: StyleSheet.hairlineWidth, textAlign: 'right' },
  line: { fontFamily: mono, fontSize: 11.5, lineHeight: 18, paddingHorizontal: 8 },
});
