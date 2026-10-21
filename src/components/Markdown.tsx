import React from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import MarkdownDisplay from 'react-native-markdown-display';
import { CodeBlock } from './CodeBlock';
import { useSettings } from '../state/settings';

export function Markdown({ children, compact }: { children: string; compact?: boolean }) {
  const { theme } = useSettings();
  const mono = Platform.select({ ios: 'Menlo', android: 'monospace' }) as string;
  const c = theme.colors;

  const rules = {
    fence: (node: any) => (
      <CodeBlock key={node.key} code={node.content || ''} language={node.sourceInfo || ''} />
    ),
    code_block: (node: any) => (
      <CodeBlock key={node.key} code={node.content || ''} language={node.sourceInfo || ''} />
    ),
    code_inline: (node: any) => (
      <Text
        key={node.key}
        style={{
          fontFamily: mono, fontSize: 12.5, color: theme.syntax.string,
          backgroundColor: c.codeBg, paddingHorizontal: 4, borderRadius: 4,
        }}
      >
        {node.content}
      </Text>
    ),
    link: (node: any, _children: any, _parent: any, styles: any) => (
      <Text
        key={node.key}
        style={styles.link}
        onPress={() => {
          const href = node.attributes?.href;
          if (href) Linking.openURL(href).catch(() => {});
        }}
      >
        {node.content}
      </Text>
    ),
    image: (node: any) => (
      <Text key={node.key} style={{ color: c.textWeak, fontSize: 12 }}>
        [image: {node.attributes?.alt || node.attributes?.src || ''}]
      </Text>
    ),
    table: (node: any, children: any) => (
      <View key={node.key} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, borderRadius: 8, marginVertical: 8, overflow: 'hidden' }}>
        {children}
      </View>
    ),
    th: (node: any, children: any) => (
      <View key={node.key} style={{ flex: 1, backgroundColor: c.surfaceRaised, padding: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{children}</Text>
      </View>
    ),
    td: (node: any, children: any) => (
      <View key={node.key} style={{ flex: 1, padding: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.borderWeaker }}>
        <Text style={{ color: c.textBase, fontSize: 12 }}>{children}</Text>
      </View>
    ),
    tr: (node: any, children: any) => (
      <View key={node.key} style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.borderWeaker }}>
        {children}
      </View>
    ),
  };

  return (
    <MarkdownDisplay
      rules={rules as any}
      style={{
        body: { color: c.text, fontSize: compact ? 14 : 15, lineHeight: compact ? 20 : 23 },
        paragraph: { marginTop: 0, marginBottom: 8, flexWrap: 'wrap' },
        heading1: { color: c.text, fontSize: 22, fontWeight: '700', marginTop: 8, marginBottom: 8 },
        heading2: { color: c.text, fontSize: 19, fontWeight: '700', marginTop: 8, marginBottom: 7 },
        heading3: { color: c.text, fontSize: 17, fontWeight: '600', marginTop: 7, marginBottom: 6 },
        heading4: { color: c.text, fontSize: 15, fontWeight: '600', marginTop: 6, marginBottom: 5 },
        heading5: { color: c.text, fontSize: 14, fontWeight: '600' },
        heading6: { color: c.textWeak, fontSize: 13, fontWeight: '600' },
        strong: { fontWeight: '700', color: c.text },
        em: { fontStyle: 'italic' },
        link: { color: c.textInteractive, textDecorationLine: 'underline' },
        blockquote: {
          backgroundColor: c.surfaceRaised, borderLeftColor: c.border, borderLeftWidth: 3,
          paddingHorizontal: 10, paddingVertical: 6, marginVertical: 6, borderRadius: 4,
        },
        bullet_list: { marginVertical: 3 },
        ordered_list: { marginVertical: 3 },
        list_item: { marginVertical: 2 },
        bullet_list_icon: { color: c.textWeak, marginRight: 6 },
        ordered_list_icon: { color: c.textWeak, marginRight: 6 },
        hr: { backgroundColor: c.border, height: StyleSheet.hairlineWidth, marginVertical: 12 },
        code_inline: { fontFamily: mono, fontSize: 12.5, color: theme.syntax.string, backgroundColor: c.codeBg },
        code_block: { fontFamily: mono, fontSize: 12, color: c.text, backgroundColor: c.codeBg, padding: 10, borderRadius: 8 },
        fence: { fontFamily: mono, fontSize: 12, color: c.text, backgroundColor: c.codeBg, padding: 10, borderRadius: 8 },
        table: { borderColor: c.border },
        text: { color: c.text },
      }}
    >
      {children}
    </MarkdownDisplay>
  );
}
