import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage, ChatPart } from '../api/types';
import { useSettings } from '../state/settings';
import { Markdown } from './Markdown';
import { CodeBlock } from './CodeBlock';
import { formatCost, formatDuration, formatTokens } from '../utils/time';

export function MessageView({
  message, onRevert, onFork, onCopy, onOpenFile, onOpenSession, compact,
}: {
  message: ChatMessage;
  onRevert?: () => void;
  onFork?: () => void;
  onCopy?: () => void;
  onOpenFile?: (path: string) => void;
  onOpenSession?: (sessionId: string) => void;
  compact?: boolean;
}) {
  const { theme } = useSettings();
  const c = theme.colors;
  const [menu, setMenu] = useState(false);
  const isUser = message.role === 'user';
  const visibleParts = message.parts.filter((p) => p.type !== 'snapshot' && p.type !== 'step-start' && p.type !== 'step-finish');
  const textParts = visibleParts.filter((p) => p.type === 'text');
  const reasoning = visibleParts.filter((p) => p.type === 'reasoning');
  const tools = visibleParts.filter((p) => p.type === 'tool');
  const files = visibleParts.filter((p) => p.type === 'file');
  const hasContent = textParts.some((p) => (p.text || '').trim()) || tools.length || files.length || reasoning.length;

  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 7 }}>
      {!isUser ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 }}>
          <View style={[styles.avatar, { backgroundColor: c.surfaceRaised }]}>
            <Ionicons name="sparkles" size={12} color={c.textInteractive} />
          </View>
          <Text style={{ color: c.textBase, fontSize: 12, fontWeight: '600' }}>{message.agent || 'assistant'}</Text>
          {message.model ? (
            <Text style={{ color: c.textWeaker, fontSize: 11 }}>{message.model.modelID}</Text>
          ) : null}
          {message.pending ? <ActivityIndicator size="small" color={c.textWeaker} style={{ transform: [{ scale: 0.6 }] }} /> : null}
        </View>
      ) : null}

      <Pressable
        onLongPress={() => setMenu((v) => !v)}
        delayLongPress={350}
        style={[
          isUser ? styles.userBubble : styles.assistantBubble,
          isUser ? { backgroundColor: c.surfaceRaised, borderColor: c.borderWeaker } : null,
        ]}
      >
        {!hasContent && message.pending ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={c.textWeak} />
            <Text style={{ color: c.textWeak, fontSize: 13 }}>Thinking…</Text>
          </View>
        ) : null}
        {reasoning.map((p) => <ReasoningView key={p.id} part={p} />)}
        {textParts.map((p) => (
          p.text?.trim() ? <Markdown key={p.id} compact={compact}>{p.text}</Markdown> : null
        ))}
        {tools.map((p) => <ToolView key={p.id} part={p} onOpenFile={onOpenFile} onOpenSession={onOpenSession} />)}
        {files.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 }}>
            <Ionicons name={p.mime?.startsWith('image/') ? 'image-outline' : 'document-outline'} size={15} color={c.textBase} />
            <Text numberOfLines={1} style={{ color: c.textBase, fontSize: 12, flex: 1 }}>{p.filename || p.url || 'Attachment'}</Text>
          </View>
        ))}
        {visibleParts.filter((p) => p.type === 'compaction').map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 }}>
            <Ionicons name="archive-outline" size={14} color={c.textWeak} />
            <Text style={{ color: c.textWeak, fontSize: 12, fontStyle: 'italic' }}>{p.text || 'Context compacted'}</Text>
          </View>
        ))}
        {message.error ? (
          <Text style={{ color: c.error, fontSize: 12, marginTop: 6 }}>{typeof message.error === 'string' ? message.error : message.error?.message || JSON.stringify(message.error)}</Text>
        ) : null}
      </Pressable>

      {!isUser && (message.cost || message.tokens) ? (
        <Text style={{ color: c.textWeaker, fontSize: 10, marginTop: 3, marginLeft: 2 }}>
          {message.cost ? formatCost(message.cost) : ''}
          {message.tokens?.output ? ` · ${formatTokens(message.tokens.output)} out` : ''}
          {message.completed && message.created ? ` · ${formatDuration(message.created, message.completed)}` : ''}
        </Text>
      ) : null}

      {menu ? (
        <View style={[styles.menu, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
          {onCopy ? <MenuBtn icon="copy-outline" label="Copy" onPress={() => { setMenu(false); onCopy(); }} /> : null}
          {onFork ? <MenuBtn icon="git-branch-outline" label="Fork from here" onPress={() => { setMenu(false); onFork(); }} /> : null}
          {onRevert ? <MenuBtn icon="arrow-undo-outline" label="Revert to here" danger onPress={() => { setMenu(false); onRevert(); }} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function MenuBtn({ icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
  const { theme } = useSettings();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={15} color={danger ? theme.colors.error : theme.colors.iconStrong} />
      <Text style={{ color: danger ? theme.colors.error : theme.colors.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function ReasoningView({ part }: { part: ChatPart }) {
  const { theme } = useSettings();
  const [open, setOpen] = useState(false);
  const text = part.text || part.reasoning || '';
  if (!text) return null;
  return (
    <View style={{ marginBottom: 6 }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={theme.colors.textWeak} />
        <Text style={{ color: theme.colors.textWeak, fontSize: 12, fontWeight: '600' }}>Thinking</Text>
        {!open ? <Text numberOfLines={1} style={{ color: theme.colors.textWeaker, fontSize: 11, flex: 1 }}>{text.slice(0, 80)}</Text> : null}
      </Pressable>
      {open ? (
        <View style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: 9, marginTop: 6 }}>
          <Text style={{ color: theme.colors.textWeak, fontSize: 13, lineHeight: 19 }}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ToolView({ part, onOpenFile, onOpenSession }: { part: ChatPart; onOpenFile?: (path: string) => void; onOpenSession?: (sessionId: string) => void }) {
  const { theme } = useSettings();
  const [open, setOpen] = useState(false);
  const c = theme.colors;
  const st = part.state;
  const status = st?.status || 'running';
  const color = status === 'completed' ? c.success : status === 'error' ? c.error : c.warning;
  const icon = part.tool === 'bash' ? 'terminal-outline'
    : part.tool === 'edit' || part.tool === 'write' ? 'create-outline'
      : part.tool === 'read' ? 'document-text-outline'
        : part.tool === 'grep' || part.tool === 'glob' ? 'search-outline'
          : 'construct-outline';
  const title = st?.title || part.tool || 'Tool';
  const input = st?.input;
  const output = st?.output;
  const filePath = input?.filePath || input?.path || input?.file;
  // An agent spawning a subagent (the "task" tool) reports the child session
  // in the tool metadata; link to it so subagent sessions are reachable from
  // inside the chat and from nowhere else.
  const subagentId = st?.metadata?.sessionID || st?.metadata?.sessionId;
  return (
    <View style={[styles.tool, { backgroundColor: c.surface, borderColor: c.borderWeaker }]}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, padding: 9 }}>
        <Ionicons name={icon as any} size={15} color={c.textBase} />
        <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{title}</Text>
        {status === 'running' || status === 'pending' ? (
          <ActivityIndicator size="small" color={color} style={{ transform: [{ scale: 0.65 }] }} />
        ) : (
          <Ionicons name={status === 'error' ? 'close-circle' : 'checkmark-circle'} size={14} color={color} />
        )}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={c.textWeak} />
      </Pressable>
      {filePath && onOpenFile ? (
        <Pressable onPress={() => onOpenFile(String(filePath))} style={{ paddingHorizontal: 9, paddingBottom: 7 }}>
          <Text numberOfLines={1} style={{ color: c.textInteractive, fontSize: 11 }}>{String(filePath)}</Text>
        </Pressable>
      ) : null}
      {subagentId && onOpenSession ? (
        <Pressable onPress={() => onOpenSession(String(subagentId))} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingBottom: 7 }}>
          <Ionicons name="git-branch-outline" size={12} color={c.textInteractive} />
          <Text numberOfLines={1} style={{ color: c.textInteractive, fontSize: 11 }}>Open subagent session</Text>
        </Pressable>
      ) : null}
      {open ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderWeaker, padding: 9 }}>
          {input && Object.keys(input).length ? (
            <CodeBlock code={typeof input === 'string' ? input : JSON.stringify(input, null, 2)} language="json" />
          ) : null}
          {output ? (
            <CodeBlock code={output} language={part.tool === 'bash' ? 'bash' : 'text'} />
          ) : null}
          {st?.error ? (
            <Text style={{ color: c.error, fontSize: 12, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) }}>{st.error}</Text>
          ) : null}
        </View>
      ) : output ? (
        <Text numberOfLines={2} style={{ color: c.textWeak, fontSize: 11, paddingHorizontal: 9, paddingBottom: 8 }}>{output}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  userBubble: {
    alignSelf: 'flex-end', maxWidth: '90%', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  assistantBubble: { alignSelf: 'stretch' },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tool: { borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, marginVertical: 6, overflow: 'hidden' },
  menu: {
    position: 'absolute', right: 18, top: 30, zIndex: 20, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
});
