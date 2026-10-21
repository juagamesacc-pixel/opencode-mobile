import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdownLang from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';
import ini from 'highlight.js/lib/languages/ini';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import { useSettings } from '../state/settings';

const LANGS: Record<string, any> = {
  javascript, typescript, xml, css, json, bash, python, go, rust, java, kotlin,
  swift, c, cpp, csharp, php, ruby, sql, yaml, markdown: markdownLang, diff, ini, dockerfile,
  js: javascript, ts: typescript, tsx: typescript, jsx: javascript, html: xml, sh: bash,
  shell: bash, zsh: bash, py: python, rs: rust, yml: yaml, md: markdownLang, docker: dockerfile,
  'c++': cpp, cs: csharp, kt: kotlin,
};

for (const [name, lang] of Object.entries(LANGS)) {
  try { hljs.registerLanguage(name, lang); } catch {}
}

const CLASS_MAP: Record<string, string> = {
  keyword: 'keyword', built_in: 'type', type: 'type', literal: 'constant',
  number: 'constant', string: 'string', 'string-literal': 'string', regexp: 'string',
  comment: 'comment', doctag: 'comment', meta: 'comment', 'meta-keyword': 'keyword',
  'meta-string': 'string', title: 'property', 'title.class': 'type', 'title.function': 'property',
  attr: 'property', attribute: 'property', property: 'property', variable: 'variable',
  'variable.language': 'keyword', 'variable.constant': 'constant', params: 'variable',
  operator: 'operator', punctuation: 'punctuation', symbol: 'constant', tag: 'keyword',
  name: 'keyword', selector: 'keyword', 'selector-tag': 'keyword', 'selector-class': 'property',
  'selector-id': 'constant', addition: 'string', deletion: 'variable', section: 'type',
  bullet: 'punctuation', link: 'property', emphasis: 'punctuation', strong: 'keyword',
};

function decode(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

interface Segment { text: string; cls?: string }

function parseHighlighted(html: string): Segment[] {
  const out: Segment[] = [];
  const re = /<span class="hljs-([^"]+)">|<\/span>|([^<]+)/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) stack.push(m[1]);
    else if (m[0] === '</span>') stack.pop();
    else if (m[2]) {
      const text = decode(m[2]);
      if (!text) continue;
      const cls = stack[stack.length - 1];
      out.push({ text, cls });
    }
  }
  return out;
}

export function CodeBlock({ code, language, showLines }: { code: string; language?: string; showLines?: boolean }) {
  const { theme } = useSettings();
  const [copied, setCopied] = useState(false);
  const lang = (language || '').toLowerCase().trim();
  const segments = useMemo(() => {
    const source = code.replace(/\n$/, '');
    if (!lang || lang === 'text' || lang === 'plaintext' || !hljs.getLanguage(lang)) {
      return source.split('\n').map((line) => [{ text: line }] as Segment[]);
    }
    try {
      const html = hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
      const flat = parseHighlighted(html);
      // split segments by newline, keeping per-character classes
      const lines: Segment[][] = [[]];
      for (const seg of flat) {
        const pieces = seg.text.split('\n');
        pieces.forEach((piece, idx) => {
          if (idx > 0) lines.push([]);
          if (piece) lines[lines.length - 1].push({ text: piece, cls: seg.cls });
        });
      }
      return lines;
    } catch {
      return source.split('\n').map((line) => [{ text: line }] as Segment[]);
    }
  }, [code, lang]);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.codeBg, borderColor: theme.colors.borderWeaker }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.borderWeaker }]}>
        <Text style={{ color: theme.colors.textWeak, fontSize: 11, fontFamily: mono, textTransform: 'lowercase' }}>{lang || 'text'}</Text>
        <Pressable onPress={copy} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={theme.colors.textWeak} />
          <Text style={{ color: theme.colors.textWeak, fontSize: 11 }}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10 }}>
        <View>
          {segments.map((line, i) => (
            <View key={i} style={{ flexDirection: 'row' }}>
              {showLines ? (
                <Text style={[styles.lineNo, { color: theme.colors.textWeaker }]}>{String(i + 1).padStart(2, ' ')}</Text>
              ) : null}
              <Text style={{ fontFamily: mono, fontSize: 12, lineHeight: 18, color: theme.colors.text }}>
                {line.length ? line.map((seg, j) => (
                  <Text key={j} style={{ color: seg.cls ? colorFor(seg.cls, theme.syntax, theme.colors.text) : theme.colors.text }}>
                    {seg.text}
                  </Text>
                )) : ' '}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function colorFor(cls: string, syntax: Record<string, string>, fallback: string) {
  const base = cls.split(' ')[0];
  const mapped = CLASS_MAP[base] || CLASS_MAP[cls] || '';
  return syntax[mapped] || fallback;
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace' }) as string;

const styles = StyleSheet.create({
  wrap: { borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, marginVertical: 8, overflow: 'hidden' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lineNo: { fontFamily: mono, fontSize: 12, lineHeight: 18, marginRight: 10, textAlign: 'right' },
});
