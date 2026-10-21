import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServers } from '../state/servers';
import { useSettings } from '../state/settings';
import { ApiClient } from '../api/client';
import { subscribeEvents } from '../api/events';
import {
  applyPartDelta, normalizeMessageV1, normalizeMessageV2, normalizePartV1, normalizePartV2, stringify, upsertPart,
} from '../api/normalize';
import type {
  AgentInfo, Attachment, ChatMessage, ChatModel, ChatPart, FormInfo, InboxItem, ModelRef,
  PermissionRequest, QuestionRequest, Session, Todo,
} from '../api/types';
import { cacheMessages, readCachedMessages } from '../utils/cache';
import { clockTime, formatCost, formatTokens } from '../utils/time';
import { MessageView } from '../components/Message';
import { Button, ErrorBanner, IconButton, Loading, Screen, Sheet, TextField } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;
const LAST_MODEL_KEY = 'opencode_mobile_last_model_v1';

function flattenModels(providers: any[]): ChatModel[] {
  const out: ChatModel[] = [];
  for (const p of providers || []) {
    const models = p.models;
    if (Array.isArray(models)) {
      for (const m of models) {
        out.push({
          providerID: m.providerID || p.id, modelID: m.modelID || m.id,
          name: m.name || m.modelID || m.id, family: m.family,
          context: m.limit?.context, output: m.limit?.output,
          variants: (m.variants || []).map((v: any) => v.id || v.name).filter(Boolean),
        });
      }
    } else if (models && typeof models === 'object') {
      for (const [id, m] of Object.entries<any>(models)) {
        out.push({
          providerID: p.id, modelID: m.id || id, name: m.name || id,
          context: m.limit?.context, output: m.limit?.output,
          variants: (m.variants || []).map((v: any) => v.id || v.name).filter(Boolean),
        });
      }
    }
  }
  return out;
}

function messageTime(m: ChatMessage) { return m.created || 0; }

export function ChatScreen({ navigation, route }: Props) {
  const { sessionId, directory } = route.params;
  const { active } = useServers();
  const { theme, settings, update, logDiag } = useSettings();
  const c = theme.colors;
  const client = useMemo(() => (active ? new ApiClient(active, directory) : null), [active, directory]);

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [question, setQuestion] = useState<QuestionRequest | null>(null);
  const [form, setForm] = useState<FormInfo | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<ModelRef | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelRef | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [commands, setCommands] = useState<any[]>([]);
  const [picker, setPicker] = useState<null | 'menu' | 'model' | 'agent' | 'commands' | 'attach' | 'info' | 'todos' | 'inbox' | 'rename'>(null);
  const [modelFilter, setModelFilter] = useState('');
  const [renameText, setRenameText] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[][]>([]);
  const [custom, setCustom] = useState('');
  const [customOn, setCustomOn] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [children, setChildren] = useState<Session[]>([]);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const refreshTimer = useRef<any>(null);
  const currentSession = useRef<string>(sessionId);

  const scrollToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

  const appendStreamDelta = useCallback((kind: 'text' | 'reasoning', props: any) => {
    const delta = props?.delta ?? props?.text ?? '';
    if (!delta) return;
    const messageID = props?.messageID || props?.messageId;
    setMessages((prev) => {
      let idx = messageID ? prev.findIndex((m) => m.id === messageID) : -1;
      if (idx < 0 && !messageID) {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant' && (prev[i].pending || !prev[i].completed)) { idx = i; break; }
        }
      }
      if (idx < 0) {
        const id = messageID || `stream-${sessionId}`;
        return [...prev, {
          id, role: 'assistant', created: Date.now(), pending: true,
          parts: [{ id: `${id}:${kind}`, type: kind, [kind]: delta, text: kind === 'text' ? delta : undefined } as ChatPart],
        }];
      }
      const next = prev.slice();
      const msg = next[idx];
      const partIdx = msg.parts.findIndex((p) => p.type === kind);
      const parts = msg.parts.slice();
      if (partIdx >= 0) {
        parts[partIdx] = kind === 'text'
          ? { ...parts[partIdx], text: (parts[partIdx].text || '') + delta }
          : { ...parts[partIdx], reasoning: (parts[partIdx].reasoning || '') + delta };
      } else {
        parts.push({ id: `${msg.id}:${kind}`, type: kind, text: kind === 'text' ? delta : undefined, reasoning: kind === 'reasoning' ? delta : undefined });
      }
      next[idx] = { ...msg, parts, pending: true };
      return next;
    });
    setStreaming(true);
  }, [sessionId]);

  // Shared v1/v2 part-event appliers. V2 stream events are converted into the
  // same shapes (verified against the original app's event transform and the
  // opencode server's own state transitions).
  const applyDeltaProps = useCallback((d: { messageID?: string; partID?: string; field?: string; delta?: string }) => {
    const { messageID, partID, field, delta } = d;
    if (!delta) return;
    setMessages((prev) => {
      let idx = messageID ? prev.findIndex((m) => m.id === messageID) : -1;
      if (idx < 0 && !messageID) {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant' && (prev[i].pending || !prev[i].completed)) { idx = i; break; }
        }
      }
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = applyPartDelta(next[idx], partID || `${messageID}:${field || 'text'}`, field || 'text', delta);
      return next;
    });
    setStreaming(true);
  }, []);

  const applyPartUpdate = useCallback((messageID: string | undefined, part: ChatPart | null) => {
    if (!messageID || !part) return;
    const normalized = client?.isV2 ? normalizePartV2(part) : normalizePartV1(part);
    setMessages((prev) => prev.map((m) => (m.id === messageID ? upsertPart(m, normalized) : m)));
    setStreaming(true);
  }, [client]);

  // V2 *.started events create the assistant message placeholder with an empty
  // part, mirroring the server's own handlers.
  const ensureStreamPart = useCallback((props: any, kind: 'text' | 'reasoning', idField: 'textID' | 'reasoningID') => {
    const messageID = props?.assistantMessageID;
    if (!messageID) return;
    const partID = props?.[idField] || `${messageID}:${kind}`;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageID);
      if (idx >= 0) {
        if (prev[idx].parts.some((p) => p.id === partID)) return prev;
        const next = prev.slice();
        next[idx] = {
          ...next[idx],
          parts: [...next[idx].parts, { id: partID, type: kind, text: kind === 'text' ? '' : undefined, reasoning: kind === 'reasoning' ? '' : undefined } as ChatPart],
        };
        return next;
      }
      return [...prev, {
        id: messageID, role: 'assistant', created: Date.now(), pending: true,
        parts: [{ id: partID, type: kind, text: kind === 'text' ? '' : undefined, reasoning: kind === 'reasoning' ? '' : undefined } as ChatPart],
      }];
    });
    setStreaming(true);
  }, []);

  const upsertMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx === -1) return [...prev, msg];
      const next = prev.slice();
      next[idx] = { ...next[idx], ...msg, parts: msg.parts.length ? msg.parts : next[idx].parts };
      return next.sort((a, b) => (messageTime(a) - messageTime(b)));
    });
  }, []);

  const refresh = useCallback(async (spin = false) => {
    if (!client) return;
    if (spin) setRefreshing(true);
    try {
      const [sess, msgs, perms, questions, forms, inb] = await Promise.all([
        client.getSession(sessionId).catch(() => null),
        client.messages(sessionId, 200),
        client.permissions().catch(() => []),
        client.questions().catch(() => []),
        client.forms().catch(() => []),
        client.inbox(sessionId).catch(() => []),
      ]);
      if (sess) {
        setSession(sess);
        if (!route.params.title) navigation.setParams({ title: sess.title, parentId: sess.parentID });
        if (sess.raw?.model) {
          const rawModel = sess.raw.model as any;
          const m: ModelRef = { providerID: rawModel.providerID, modelID: rawModel.modelID || rawModel.id, variant: rawModel.variant };
          // Server state is authoritative: if the session's actual model differs
          // from the label (e.g. a switch that failed), the label must follow it.
          setSelectedModel((prev) => (prev && prev.providerID === m.providerID && prev.modelID === m.modelID ? prev : m));
          setSelectedVariant((prev) => (prev === (m.variant || null) ? prev : (m.variant || null)));
        }
        if (sess.raw?.agent) setSelectedAgent((prev) => prev || sess.raw.agent);
      }
      setMessages(msgs);
      if (active) cacheMessages(active.id, sessionId, msgs);
      setPermission(perms.find((p) => !p.sessionID || p.sessionID === sessionId) || null);
      setQuestion(questions.find((q) => !q.sessionID || q.sessionID === sessionId) || null);
      setForm(forms.find((f) => !f.sessionID || f.sessionID === sessionId) || null);
      setInbox(inb || []);
      setStreaming(msgs.some((m) => m.pending));
      if (sess && active) client.todos(sessionId).then(setTodos).catch(() => {});
      if (sess && active) client.childSessions(sessionId).then(setChildren).catch(() => {});
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      logDiag('error', 'chat', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client, sessionId, active, route.params.title, navigation, logDiag]);

  useEffect(() => {
    currentSession.current = sessionId;
    setMessages([]);
    setSession(null);
    setLoading(true);
    if (active) readCachedMessages(active.id, sessionId).then((cached) => {
      if (cached.length && currentSession.current === sessionId) {
        setMessages(cached);
        setLoading(false);
      }
    });
    refresh();
  }, [sessionId, active?.id]);

  useEffect(() => {
    if (!client) return;
    const sub = subscribeEvents(client, (evt) => {
      if (currentSession.current !== sessionId) return;
      const props = evt.properties || {};
      switch (evt.type) {
        case 'message.updated': {
          const info = props.info || props.message || props;
          if (info?.sessionID && info.sessionID !== sessionId) return;
          if (info?.id) {
            const normalized = client.isV2 ? normalizeMessageV2(info, sessionId) : normalizeMessageV1({ info }, sessionId);
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === normalized.id);
              return existing
                ? prev.map((m) => (m.id === normalized.id ? { ...m, ...normalized, parts: normalized.parts.length ? normalized.parts : m.parts } : m))
                : [...prev, normalized];
            });
          }
          break;
        }
        case 'message.part.updated': {
          const part = props.part || props;
          applyPartUpdate(props.messageID || part?.messageID, part);
          break;
        }
        case 'message.part.delta': {
          if (props.messageID !== undefined && props.messageID !== sessionId && props.sessionID && props.sessionID !== sessionId) return;
          applyDeltaProps(props);
          break;
        }
        case 'message.part.removed': {
          const { messageID, partID } = props;
          setMessages((prev) => prev.map((m) => (m.id === messageID ? { ...m, parts: m.parts.filter((p) => p.id !== partID) } : m)));
          break;
        }
        case 'message.removed': {
          setMessages((prev) => prev.filter((m) => m.id !== props.messageID));
          break;
        }
        case 'session.idle': {
          if (props.sessionID && props.sessionID !== sessionId) return;
          setStreaming(false);
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => refresh(), 500);
          break;
        }
        case 'session.updated': {
          const info = props.info || props;
          if (info?.id === sessionId) setSession((prev) => (prev ? { ...prev, ...info } : prev));
          break;
        }
        case 'session.next.text.started': {
          ensureStreamPart(props, 'text', 'textID');
          break;
        }
        case 'session.next.reasoning.started': {
          ensureStreamPart(props, 'reasoning', 'reasoningID');
          break;
        }
        case 'session.next.text.delta': {
          // {sessionID, assistantMessageID, textID, delta} -> incremental append
          applyDeltaProps({ messageID: props.assistantMessageID, partID: props.textID, field: 'text', delta: props.delta });
          break;
        }
        case 'session.next.text.ended': {
          // {sessionID, assistantMessageID, textID, text} -> full final text
          applyPartUpdate(props.assistantMessageID, { id: props.textID, type: 'text', text: props.text });
          break;
        }
        case 'session.next.reasoning.delta': {
          applyDeltaProps({ messageID: props.assistantMessageID, partID: props.reasoningID, field: 'reasoning', delta: props.delta });
          break;
        }
        case 'session.next.reasoning.ended': {
          applyPartUpdate(props.assistantMessageID, { id: props.reasoningID, type: 'reasoning', text: props.text, reasoning: props.text });
          break;
        }
        case 'session.next.tool.input.started': {
          // {sessionID, assistantMessageID, callID, name, timestamp}
          applyPartUpdate(props.assistantMessageID, {
            id: props.callID, type: 'tool', tool: props.name, callID: props.callID,
            state: { status: 'pending', input: '' },
          });
          break;
        }
        case 'session.next.tool.input.delta': {
          applyDeltaProps({ messageID: props.assistantMessageID, partID: props.callID, field: 'input', delta: props.delta });
          break;
        }
        case 'session.next.tool.input.ended': {
          applyPartUpdate(props.assistantMessageID, {
            id: props.callID, type: 'tool', callID: props.callID,
            state: { status: 'pending', input: props.text },
          });
          break;
        }
        case 'session.next.tool.called': {
          // {sessionID, assistantMessageID, callID, tool, input, provider, timestamp}
          applyPartUpdate(props.assistantMessageID, {
            id: props.callID, type: 'tool', tool: props.tool, callID: props.callID,
            state: { status: 'running', input: props.input, metadata: props.structured ?? props.provider?.metadata },
          });
          break;
        }
        case 'session.next.tool.progress': {
          applyPartUpdate(props.assistantMessageID, {
            id: props.callID, type: 'tool', callID: props.callID,
            state: { status: 'running', metadata: props.structured, content: props.content },
          });
          break;
        }
        case 'session.next.tool.success': {
          applyPartUpdate(props.assistantMessageID, {
            id: props.callID, type: 'tool', callID: props.callID,
            state: {
              status: 'completed',
              output: typeof props.result === 'string' ? props.result : stringify(props.result),
              metadata: props.structured,
              content: props.content,
            },
          });
          break;
        }
        case 'session.next.tool.failed': {
          applyPartUpdate(props.assistantMessageID, {
            id: props.callID, type: 'tool', callID: props.callID,
            state: {
              status: 'error',
              error: typeof props.error === 'string' ? props.error : stringify(props.error),
              output: typeof props.result === 'string' ? props.result : stringify(props.result),
            },
          });
          break;
        }
        case 'session.text.started':
        case 'session.reasoning.started':
        case 'session.next.step.started':
        case 'session.step.started': {
          setStreaming(true);
          break;
        }
        case 'session.text.delta': {
          appendStreamDelta('text', props);
          break;
        }
        case 'session.reasoning.delta': {
          appendStreamDelta('reasoning', props);
          break;
        }
        case 'session.next.step.ended':
        case 'session.step.ended':
        case 'session.next.step.failed':
        case 'session.step.failed': {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => refresh(), 350);
          break;
        }
        case 'session.next.prompted':
        case 'session.next.prompt.admitted': {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => refresh(), 400);
          break;
        }
        case 'session.status': {
          const id = props.sessionID || props.id;
          if (id && id !== sessionId) return;
          const status = props.status?.type || props.status || props.type;
          setStreaming(status === 'busy' || status === 'running' || status === 'retry');
          break;
        }
        case 'permission.asked': {
          const info = props.info || props.request || props;
          if (!info?.sessionID || info.sessionID === sessionId) setPermission(info);
          break;
        }
        case 'permission.replied': {
          const id = props.permissionID || props.id || props.info?.id;
          setPermission((prev) => (prev && (!id || prev.id === id) ? null : prev));
          break;
        }
        case 'question.asked': {
          const info = props.info || props.request || props;
          if (!info?.sessionID || info.sessionID === sessionId) {
            setQuestion(info);
            setQuestionIndex(0);
            setAnswers([]);
            setCustom('');
            setCustomOn(false);
          }
          break;
        }
        case 'question.replied':
        case 'question.rejected': {
          const id = props.questionID || props.id || props.info?.id;
          setQuestion((prev) => (prev && (!id || prev.id === id) ? null : prev));
          break;
        }
        default:
          break;
      }
    }, (status) => { if (status === 'open') logDiag('info', 'events', `connected ${sessionId}`); });
    return () => { sub.close(); if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [client, sessionId, refresh, logDiag]);

  // Catalogs
  useEffect(() => {
    if (!client) return;
    (async () => {
      try {
        const [prov, agentList, cmds] = await Promise.all([
          client.providers(), client.agents().catch(() => []), client.commands().catch(() => []),
        ]);
        const list = flattenModels(prov.providers || []);
        setModels(list);
        setAgents(agentList);
        setCommands(cmds || []);
        const d = prov.default || {};
        const def = d.providerID && d.modelID ? { providerID: d.providerID, modelID: d.modelID, variant: d.variant } : null;
        setDefaultModel(def);
        const saved = await AsyncStorage.getItem(LAST_MODEL_KEY);
        if (!selectedModel) {
          if (saved) { try { setSelectedModel(JSON.parse(saved)); } catch { setSelectedModel(def); } }
          else setSelectedModel(def);
        }
      } catch (e) {
        logDiag('warn', 'catalog', e instanceof Error ? e.message : String(e));
      }
    })();
  }, [client, active?.id]);

  useEffect(() => {
    if (selectedModel) AsyncStorage.setItem(LAST_MODEL_KEY, JSON.stringify(selectedModel)).catch(() => {});
  }, [selectedModel?.providerID, selectedModel?.modelID, selectedVariant]);

  const modelLabel = useMemo(() => {
    const m = models.find((x) => x.providerID === selectedModel?.providerID && x.modelID === selectedModel?.modelID);
    return m?.name || selectedModel?.modelID || 'Model';
  }, [models, selectedModel]);

  const promptModel = useMemo<ModelRef | null>(() => {
    if (!selectedModel) return null;
    return { ...selectedModel, variant: selectedVariant || selectedModel.variant || null };
  }, [selectedModel, selectedVariant]);

  const variants = useMemo(() => {
    const m = models.find((x) => x.providerID === selectedModel?.providerID && x.modelID === selectedModel?.modelID);
    return m?.variants || [];
  }, [models, selectedModel]);

  const send = async (delivery?: 'queue' | 'steer') => {
    if (!client || sending || (!composer.trim() && attachments.length === 0)) return;
    const text = composer.trim();
    setSending(true);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      created: Date.now(),
      parts: [
        ...(text ? [{ id: `local-${Date.now()}-text`, type: 'text' as const, text }] : []),
        ...attachments.map((f, i) => ({ id: `local-${Date.now()}-f${i}`, type: 'file' as const, mime: f.mime, url: f.uri, filename: f.name })),
      ],
    };
    setMessages((prev) => [...prev, optimistic]);
    setComposer('');
    const filesToSend = attachments;
    setAttachments([]);
    setStreaming(true);
    scrollToEnd();
    try {
      if (client.isV2) {
        const selections: Promise<any>[] = [];
        let modelErr: unknown = null;
        if (promptModel) selections.push(client.selectModel(sessionId, promptModel).catch((e) => { modelErr = e; }));
        if (selectedAgent) selections.push(client.selectAgent(sessionId, selectedAgent).catch((e) => {
          logDiag('warn', 'agent', e instanceof Error ? e.message : String(e));
        }));
        await Promise.all(selections);
        if (modelErr) {
          const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
          setError(`Could not switch model: ${msg}`);
          logDiag('error', 'model', msg);
        }
      }
      await client.prompt(sessionId, {
        text,
        files: filesToSend,
        model: promptModel,
        variant: selectedVariant,
        agent: selectedAgent,
        delivery: delivery || (streaming || inbox.length ? settings.followUpDelivery : undefined),
      });
      if (selectedAgent && client.isV2) client.selectAgent(sessionId, selectedAgent).catch(() => {});
      setTimeout(() => refresh(), 350);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError(e instanceof Error ? e.message : String(e));
      setComposer(text);
      setAttachments(filesToSend);
    } finally {
      setSending(false);
    }
  };

  const abort = async () => {
    if (!client) return;
    try {
      await client.abort(sessionId);
      setStreaming(false);
    } catch (e) {
      Alert.alert('Abort failed', e instanceof Error ? e.message : String(e));
    }
  };

  const attach = async () => {
    setPicker(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      const next: Attachment[] = [];
      for (const a of res.assets) {
        const mime = a.mimeType || 'application/octet-stream';
        let dataUrl = a.uri;
        try {
          const info = await FileSystem.getInfoAsync(a.uri);
          if (info.exists && 'size' in info && info.size && info.size < 5 * 1024 * 1024) {
            const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
            dataUrl = `data:${mime};base64,${b64}`;
          }
        } catch {}
        next.push({ uri: a.uri, name: a.name, mime, dataUrl });
      }
      setAttachments((prev) => [...prev, ...next]);
    } catch (e) {
      Alert.alert('Could not attach file', e instanceof Error ? e.message : String(e));
    }
  };

  const replyPermission = async (response: 'once' | 'always' | 'reject') => {
    if (!client || !permission) return;
    setPermissionBusy(true);
    try {
      await client.replyPermission(permission.sessionID || sessionId, permission.id, response);
      setPermission(null);
    } catch (e) {
      Alert.alert('Permission failed', e instanceof Error ? e.message : String(e));
    } finally {
      setPermissionBusy(false);
    }
  };

  const currentQuestion = question?.questions?.[questionIndex];
  const submitQuestion = async () => {
    if (!client || !question) return;
    const all = answers.slice();
    if (!all[questionIndex]) all[questionIndex] = [];
    if (currentQuestion?.custom && customOn && custom.trim()) all[questionIndex] = [...all[questionIndex], custom.trim()];
    try {
      await client.replyQuestion(question.sessionID || sessionId, question.id, all);
      setQuestion(null); setQuestionIndex(0); setAnswers([]); setCustom(''); setCustomOn(false);
    } catch (e) {
      Alert.alert('Could not reply', e instanceof Error ? e.message : String(e));
    }
  };

  const toggleAnswer = (label: string) => {
    const all = answers.slice();
    const cur = all[questionIndex] || [];
    if (currentQuestion?.multiple) {
      all[questionIndex] = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
    } else {
      all[questionIndex] = [label];
    }
    setAnswers(all);
  };

  const revert = (m: ChatMessage) => {
    Alert.alert('Revert message?', 'This stages the session back to this message. OpenCode will show it as a revert until you unrevert.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revert', style: 'destructive', onPress: async () => {
          if (!client) return;
          try { await client.revert(sessionId, m.id); refresh(); }
          catch (e) { Alert.alert('Revert failed', e instanceof Error ? e.message : String(e)); }
        },
      },
    ]);
  };

  const fork = async (m?: ChatMessage) => {
    if (!client) return;
    try {
      const s = await client.fork(sessionId, m?.id);
      setPicker(null);
      navigation.push('Chat', { sessionId: s.id, title: s.title, directory });
    } catch (e) {
      Alert.alert('Fork failed', e instanceof Error ? e.message : String(e));
    }
  };

  const rename = async () => {
    if (!client || !renameText.trim()) return;
    try {
      await client.updateSession(sessionId, { title: renameText.trim() });
      setSession((prev) => (prev ? { ...prev, title: renameText.trim() } : prev));
      navigation.setParams({ title: renameText.trim() });
      setPicker(null);
    } catch (e) {
      Alert.alert('Rename failed!', e instanceof Error ? e.message : String(e));
    }
  };

  const del = () => {
    Alert.alert('Delete session?', 'This removes the session and its messages from the server.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          if (!client) return;
          try { await client.deleteSession(sessionId); navigation.popToTop(); }
          catch (e) { Alert.alert('Delete failed', e instanceof Error ? e.message : String(e)); }
        },
      },
    ]);
  };

  const completeTodos = todos.filter((t) => t.status === 'completed').length;
  const isChild = !!session?.parentID;
  const changesFiles = session?.summary?.files || 0;
  const additions = session?.summary?.additions || 0;
  const deletions = session?.summary?.deletions || 0;
  const tokenTotal = (session?.tokens?.input || 0) + (session?.tokens?.output || 0) + (session?.tokens?.reasoning || 0);
  const showChipTimeline = settings.featureFlags.session_chat_chip_timeline && settings.chipTimeline && messages.length > 2;
  const userChips = messages.filter((m) => m.role === 'user').slice(-8);

  if (!active) {
    return <Screen><Loading label="No server selected" /></Screen>;
  }

  return (
    <Screen>
      <View style={[styles.header, { borderBottomColor: c.borderWeaker }]}>
        <IconButton icon="chevron-back" onPress={() => navigation.goBack()} />
        <Pressable style={{ flex: 1 }} onPress={() => setPicker('info')}>
          <Text numberOfLines={1} style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{session?.title || route.params.title || 'Session'}</Text>
          <Text numberOfLines={1} style={{ color: c.textWeak, fontSize: 11, marginTop: 1 }}>
            {streaming ? 'Working…' : 'Ready'}{directory ? `  ·  ${directory.replace(/\/+$/, '').slice(directory.replace(/\/+$/, '').lastIndexOf('/') + 1)}` : ''}
          </Text>
        </Pressable>
        <IconButton icon="git-compare-outline" onPress={() => navigation.navigate('Changes', { sessionId, directory, messageId: messages.filter((m) => m.role === 'user').slice(-1)[0]?.id })} />
        <IconButton icon="ellipsis-horizontal" onPress={() => setPicker('menu')} />
      </View>

      {isChild ? (
        <Pressable onPress={() => session?.parentID && navigation.replace('Chat', { sessionId: session.parentID, title: 'Parent session', directory })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: c.surfaceRaised, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderWeaker }}>
          <Ionicons name="git-branch-outline" size={13} color={c.textBase} />
          <Text style={{ color: c.textBase, fontSize: 12, flex: 1 }}>Back to main session</Text>
          <Text style={{ color: c.textWeaker, fontSize: 11 }}>Child session</Text>
        </Pressable>
      ) : null}

      {error ? <View style={{ padding: 10 }}><ErrorBanner message={error} onRetry={() => refresh(true)} /></View> : null}

      {loading && !messages.length ? <Loading label="Loading conversation…" /> : (
        <FlatList
          ref={listRef}
          data={messages.filter((m) => m.parts.length > 0 || m.pending || m.error)}
          keyExtractor={(m) => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 14, flexGrow: 1 }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            setAtBottom(contentSize.height - contentOffset.y - layoutMeasurement.height < 90);
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => { if (atBottom) scrollToEnd(false); }}
          renderItem={({ item, index }) => {
            const prev = messages[index - 1];
            const compact = prev && item.role === 'assistant' && prev.role === 'assistant' && settings.collapseConsecutiveToolCalls;
            return (
              <MessageView
                message={item}
                compact={compact}
                onCopy={() => Clipboard.setStringAsync(item.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n\n'))}
                onFork={() => fork(item)}
                onRevert={() => revert(item)}
                onOpenFile={(path) => navigation.navigate('FileViewer', { path, directory, sessionId })}
              />
            );
          }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
              <Ionicons name="chatbubbles-outline" size={30} color={c.icon} />
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', marginTop: 12 }}>Start a new session</Text>
              <Text style={{ color: c.textWeak, fontSize: 13, marginTop: 5, textAlign: 'center' }}>Ask a question, describe a change, or type / for commands.</Text>
            </View>
          }
          ListFooterComponent={streaming ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
              <ActivityIndicator size="small" color={c.textWeak} />
              <Text style={{ color: c.textWeak, fontSize: 12 }}>Waiting for assistant…</Text>
            </View>
          ) : undefined}
        />
      )}

      {!atBottom ? (
        <Pressable onPress={() => scrollToEnd()} style={[styles.jump, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
          <Ionicons name="arrow-down" size={17} color={c.text} />
        </Pressable>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        {todos.length ? (
          <Pressable onPress={() => setPicker('todos')} style={[styles.todoBar, { borderTopColor: c.borderWeaker }]}>
            <Ionicons name="checkbox-outline" size={14} color={c.textBase} />
            <Text style={{ color: c.textBase, fontSize: 12, flex: 1 }}>{completeTodos}/{todos.length} tasks</Text>
            <Text numberOfLines={1} style={{ color: c.textWeak, fontSize: 11, maxWidth: '60%' }}>
              {todos.find((t) => t.status !== 'completed')?.content || 'All done'}
            </Text>
          </Pressable>
        ) : null}

        {inbox.length ? (
          <Pressable onPress={() => setPicker('inbox')} style={[styles.todoBar, { borderTopColor: c.borderWeaker }]}>
            <Ionicons name="layers-outline" size={14} color={c.warning} />
            <Text style={{ color: c.textBase, fontSize: 12, flex: 1 }}>{inbox.length} queued prompt{inbox.length === 1 ? '' : 's'}</Text>
            <Ionicons name="chevron-forward" size={13} color={c.textWeaker} />
          </Pressable>
        ) : null}

        {showChipTimeline ? (
          <View style={[styles.chipStrip, { borderTopColor: c.borderWeaker }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 10 }}>
              {userChips.map((m) => {
                const text = m.parts.find((p) => p.type === 'text')?.text || '';
                return (
                  <Pressable key={m.id} onPress={() => {
                    const idx = messages.findIndex((x) => x.id === m.id);
                    if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
                  }} style={[styles.timelineChip, { backgroundColor: c.surfaceRaised, borderColor: c.borderWeaker }]}>
                    <Text numberOfLines={1} style={{ color: c.textWeak, fontSize: 11, maxWidth: 160 }}>{clockTime(m.created)} · {text.slice(0, 48) || 'Message'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {!settings.chipTimelineIntroDone ? (
              <Pressable onPress={() => update({ chipTimelineIntroDone: true })} style={{ position: 'absolute', right: 8, top: -42 }}>
                <Text style={{ color: c.textWeaker, fontSize: 10 }}>Timeline · tap to dismiss</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {isChild ? (
          <View style={{ padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.borderWeaker }}>
            <Text style={{ color: c.textWeak, fontSize: 12.5, textAlign: 'center' }}>Child sessions cannot be prompted.</Text>
          </View>
        ) : (
          <View style={[styles.composer, { borderTopColor: c.borderWeaker, backgroundColor: c.background }]}>
            {attachments.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 8 }}>
                {attachments.map((a, i) => (
                  <View key={`${a.uri}-${i}`} style={[styles.attachChip, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
                    <Ionicons name={a.mime.startsWith('image/') ? 'image-outline' : 'document-outline'} size={13} color={c.textBase} />
                    <Text numberOfLines={1} style={{ color: c.textBase, fontSize: 11, maxWidth: 150 }}>{a.name}</Text>
                    <Pressable onPress={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} hitSlop={6}>
                      <Ionicons name="close" size={13} color={c.textWeak} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={[styles.inputWrap, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
              <TextInput
                value={composer}
                onChangeText={setComposer}
                placeholder="Ask anything..."
                placeholderTextColor={c.textWeaker}
                multiline
                style={{ color: c.text, fontSize: 15, lineHeight: 20, maxHeight: 140, minHeight: 24, paddingVertical: 0, flex: 1 }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 }}>
                <IconButton icon="add" size={20} onPress={() => setPicker('attach')} color={c.textBase} />
                <Pressable onPress={() => setPicker('model')} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 3 }}>
                  <Text numberOfLines={1} style={{ color: c.textWeak, fontSize: 11, maxWidth: 130 }}>{modelLabel}</Text>
                  <Ionicons name="chevron-down" size={11} color={c.textWeaker} />
                </Pressable>
                <Pressable onPress={() => setPicker('agent')} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 3 }}>
                  <Ionicons name="person-outline" size={11} color={c.textWeak} />
                  <Text style={{ color: c.textWeak, fontSize: 11, maxWidth: 90 }} numberOfLines={1}>{selectedAgent || 'Agent'}</Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                {streaming ? (
                  <Pressable onPress={abort} style={[styles.sendBtn, { backgroundColor: c.surfaceCritical }]}>
                    <Ionicons name="stop" size={15} color={c.error} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => send()}
                    disabled={sending || (!composer.trim() && !attachments.length)}
                    style={[styles.sendBtn, { backgroundColor: composer.trim() || attachments.length ? c.buttonPrimary : c.border }]}
                  >
                    {sending ? <ActivityIndicator size="small" color={c.iconInvert} /> : <Ionicons name="arrow-up" size={16} color={composer.trim() || attachments.length ? c.iconInvert : c.textWeaker} />}
                  </Pressable>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingHorizontal: 2 }}>
              <Pressable onPress={() => setPicker('commands')}><Text style={{ color: c.textWeaker, fontSize: 10.5 }}>/ commands</Text></Pressable>
              {(streaming || inbox.length) ? (
                <Pressable onPress={() => send(settings.followUpDelivery === 'steer' ? 'steer' : 'queue')} disabled={!composer.trim()}>
                  <Text style={{ color: composer.trim() ? c.textInteractive : c.textWeaker, fontSize: 10.5 }}>
                    Send as {settings.followUpDelivery === 'steer' ? 'Steer' : 'Queue'}
                  </Text>
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }} />
              <Text style={{ color: c.textWeaker, fontSize: 10 }}>{tokenTotal ? `${formatTokens(tokenTotal)} tokens` : ''}</Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <PermissionSheet
        permission={permission}
        busy={permissionBusy}
        onClose={() => setPermission(null)}
        onReply={replyPermission}
      />

      <Sheet visible={!!question} onClose={() => { setQuestion(null); setQuestionIndex(0); setAnswers([]); }} title="Question" full>
        {question && currentQuestion ? (
          <View>
            <Text style={{ color: c.textWeak, fontSize: 11, marginBottom: 6 }}>
              {question.questions && question.questions.length > 1 ? `Question ${questionIndex + 1} of ${question.questions.length}` : 'The assistant needs an answer'}
            </Text>
            {currentQuestion.header ? <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 4 }}>{currentQuestion.header}</Text> : null}
            <Text style={{ color: c.text, fontSize: 17, lineHeight: 23, fontWeight: '600' }}>{currentQuestion.question}</Text>
            <Text style={{ color: c.textWeak, fontSize: 11.5, marginTop: 5 }}>
              {currentQuestion.multiple ? 'Select all that apply' : 'Select one'}
            </Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              {(currentQuestion.options || []).map((o) => {
                const selected = (answers[questionIndex] || []).includes(o.label);
                return (
                  <Pressable key={o.label} onPress={() => toggleAnswer(o.label)} style={[styles.option, { borderColor: selected ? c.textInteractive : c.border, backgroundColor: selected ? c.surfaceInteractive : c.surfaceRaised }]}>
                    <Ionicons name={selected ? (currentQuestion.multiple ? 'checkbox' : 'radio-button-on') : (currentQuestion.multiple ? 'square-outline' : 'radio-button-off')} size={17} color={selected ? c.textInteractive : c.textWeaker} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14 }}>{o.label}</Text>
                      {o.description ? <Text style={{ color: c.textWeak, fontSize: 11.5, marginTop: 2 }}>{o.description}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
              {currentQuestion.custom !== false ? (
                <Pressable onPress={() => setCustomOn((v) => !v)} style={[styles.option, { borderColor: customOn ? c.textInteractive : c.border, backgroundColor: c.surfaceRaised }]}>
                  <Ionicons name={customOn ? 'checkbox' : 'square-outline'} size={17} color={customOn ? c.textInteractive : c.textWeaker} />
                  <Text style={{ color: c.text, fontSize: 14 }}>Something else</Text>
                </Pressable>
              ) : null}
              {customOn ? (
                <TextInput
                  value={custom}
                  onChangeText={setCustom}
                  placeholder="Type your answer"
                  placeholderTextColor={c.textWeaker}
                  multiline
                  style={{ color: c.text, fontSize: 14, backgroundColor: c.surfaceRaised, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, padding: 10, minHeight: 60, textAlignVertical: 'top' }}
                />
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 16 }}>
              <Button label="Reject" variant="secondary" onPress={async () => {
                if (!client || !question) return;
                try { await client.rejectQuestion(question.sessionID || sessionId, question.id); setQuestion(null); }
                catch (e) { Alert.alert('Could not reject', e instanceof Error ? e.message : String(e)); }
              }} style={{ flex: 1 }} />
              {questionIndex < (question.questions?.length || 1) - 1 ? (
                <Button label="Next" variant="primary" onPress={() => { setQuestionIndex((i) => i + 1); setCustom(''); setCustomOn(false); }} style={{ flex: 1 }} />
              ) : (
                <Button label="Submit" variant="primary" onPress={submitQuestion} style={{ flex: 1 }} />
              )}
            </View>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!form} onClose={() => setForm(null)} title={form?.title || 'Form'} full>
        {form ? <FormSheet form={form} onSubmit={async (answersMap) => {
          if (!client || !form) return;
          try {
            await client.replyForm(form.sessionID || sessionId, form.id, answersMap);
            setForm(null);
          } catch (e) { Alert.alert('Could not submit form', e instanceof Error ? e.message : String(e)); }
        }} /> : null}
      </Sheet>

      <Sheet visible={picker === 'menu'} onClose={() => setPicker(null)} title={session?.title}>
        <MenuItem icon="pencil-outline" label="Rename session" onPress={() => { setRenameText(session?.title || ''); setPicker('rename'); }} />
        <MenuItem icon="git-branch-outline" label="Fork session" onPress={() => fork()} />
        <MenuItem icon="git-compare-outline" label="Review changes" onPress={() => { setPicker(null); navigation.navigate('Changes', { sessionId, directory, messageId: messages.filter((m) => m.role === 'user').slice(-1)[0]?.id }); }} />
        <MenuItem icon="copy-outline" label="Copy session ID" onPress={() => { Clipboard.setStringAsync(sessionId); setPicker(null); }} />
        <MenuItem icon="information-circle-outline" label="Session info" onPress={() => setPicker('info')} />
        <MenuItem icon="archive-outline" label="Compact context" onPress={async () => {
          if (!client) return;
          setPicker(null);
          try { await client.compact(sessionId); Alert.alert('Compaction started', 'The session context is being compacted.'); }
          catch (e) { Alert.alert('Compact failed', e instanceof Error ? e.message : String(e)); }
        }} />
        <MenuItem icon="trash-outline" label="Delete session" danger onPress={() => { setPicker(null); del(); }} />
      </Sheet>

      <Sheet visible={picker === 'info'} onClose={() => setPicker(null)} title="Session info" full>
        <InfoRow label="Session ID" value={sessionId} onCopy={() => Clipboard.setStringAsync(sessionId)} />
        <InfoRow label="Project" value={session?.directory || directory || '—'} />
        <InfoRow label="Created" value={session?.time?.created ? new Date(session.time.created).toLocaleString() : '—'} />
        <InfoRow label="Updated" value={session?.time?.updated ? new Date(session.time.updated).toLocaleString() : '—'} />
        <InfoRow label="Model" value={modelLabel} />
        <InfoRow label="Agent" value={selectedAgent || 'default'} />
        <InfoRow label="Cost" value={formatCost(session?.cost)} />
        <InfoRow label="Input tokens" value={String(session?.tokens?.input || 0)} />
        <InfoRow label="Output tokens" value={String(session?.tokens?.output || 0)} />
        <InfoRow label="Reasoning tokens" value={String(session?.tokens?.reasoning || 0)} />
        <InfoRow label="Cache tokens (read/write)" value={`${session?.tokens?.cache?.read || 0} / ${session?.tokens?.cache?.write || 0}`} />
        {session?.revert ? (
          <Button label="Undo revert" variant="secondary" onPress={async () => { if (!client) return; await client.unrevert(sessionId).catch(() => {}); setPicker(null); refresh(); }} style={{ marginTop: 12 }} />
        ) : null}
        {children.length ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: c.textWeak, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 }}>Child sessions</Text>
            {children.map((ch) => (
              <Pressable key={ch.id} onPress={() => { setPicker(null); navigation.push('Chat', { sessionId: ch.id, title: ch.title, directory }); }} style={{ paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="git-branch-outline" size={14} color={c.textBase} />
                <Text style={{ color: c.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{ch.title}</Text>
                <Ionicons name="chevron-forward" size={13} color={c.textWeaker} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={picker === 'rename'} onClose={() => setPicker(null)} title="Rename session">
        <TextField label="Title" value={renameText} onChangeText={setRenameText} autoFocus />
        <Button label="Save" variant="primary" onPress={rename} />
      </Sheet>

      <Sheet visible={picker === 'model'} onClose={() => setPicker(null)} title="Select model" full>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surfaceRaised, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, marginBottom: 10 }}>
          <Ionicons name="search" size={15} color={c.textWeak} />
          <TextInput value={modelFilter} onChangeText={setModelFilter} placeholder="Filter models" placeholderTextColor={c.textWeaker} style={{ color: c.text, flex: 1, paddingVertical: 9 }} />
        </View>
        <ScrollView style={{ maxHeight: 520 }}>
          {models.filter((m) => `${m.name || ''} ${m.providerID} ${m.modelID}`.toLowerCase().includes(modelFilter.toLowerCase())).map((m) => {
            const on = m.providerID === selectedModel?.providerID && m.modelID === selectedModel?.modelID;
            return (
              <Pressable key={`${m.providerID}/${m.modelID}`} onPress={() => {
                setSelectedModel({ providerID: m.providerID, modelID: m.modelID });
                setSelectedVariant(null);
                if (client?.isV2) {
                  client.selectModel(sessionId, { providerID: m.providerID, modelID: m.modelID })
                    .then(() => refresh())
                    .catch((e) => {
                      const msg = e instanceof Error ? e.message : String(e);
                      setError(`Could not switch model: ${msg}`);
                      logDiag('error', 'model', msg);
                      refresh();
                    });
                }
              }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderWeaker }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: on ? c.textInteractive : c.text, fontSize: 14, fontWeight: on ? '600' : '400' }}>{m.name || m.modelID}</Text>
                  <Text style={{ color: c.textWeak, fontSize: 11, marginTop: 1 }}>{m.providerID}{m.context ? ` · ${formatTokens(m.context)} context` : ''}</Text>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={18} color={c.textInteractive} /> : null}
              </Pressable>
            );
          })}
          {!models.length ? <Text style={{ color: c.textWeak, fontSize: 13, paddingVertical: 12 }}>No usable models are available. Tap Model to retry.</Text> : null}
          {variants.length ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: c.textWeak, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 }}>Variant</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                <Pressable onPress={() => setSelectedVariant(null)} style={[styles.variant, { borderColor: !selectedVariant ? c.textInteractive : c.border, backgroundColor: !selectedVariant ? c.surfaceInteractive : 'transparent' }]}>
                  <Text style={{ color: !selectedVariant ? c.textInteractive : c.textBase, fontSize: 12 }}>Default</Text>
                </Pressable>
                {variants.map((v) => (
                  <Pressable key={v} onPress={() => setSelectedVariant(v)} style={[styles.variant, { borderColor: selectedVariant === v ? c.textInteractive : c.border, backgroundColor: selectedVariant === v ? c.surfaceInteractive : 'transparent' }]}>
                    <Text style={{ color: selectedVariant === v ? c.textInteractive : c.textBase, fontSize: 12 }}>{v}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
        <Button label="Done" variant="primary" onPress={() => setPicker(null)} style={{ marginTop: 12 }} />
      </Sheet>

      <Sheet visible={picker === 'agent'} onClose={() => setPicker(null)} title="Select agent">
        {agents.filter((a) => !a.hidden).map((a) => {
          const on = (selectedAgent || '') === a.name;
          return (
            <Pressable key={a.name} onPress={() => { setSelectedAgent(a.name); setPicker(null); if (client?.isV2) client.selectAgent(sessionId, a.name).catch(() => {}); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderWeaker }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: on ? c.textInteractive : c.text, fontSize: 14, fontWeight: on ? '600' : '400' }}>{a.name}</Text>
                {a.description ? <Text style={{ color: c.textWeak, fontSize: 11.5, marginTop: 2 }}>{a.description}</Text> : null}
              </View>
              {on ? <Ionicons name="checkmark-circle" size={18} color={c.textInteractive} /> : null}
            </Pressable>
          );
        })}
        {!agents.length ? <Text style={{ color: c.textWeak, fontSize: 13 }}>No agents available.</Text> : null}
      </Sheet>

      <Sheet visible={picker === 'commands'} onClose={() => setPicker(null)} title="Commands">
        {commands.map((cmd) => (
          <Pressable key={cmd.name} onPress={() => { setComposer((prev) => `${prev}${prev ? ' ' : ''}/${cmd.name} `); setPicker(null); }} style={{ paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderWeaker }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>/{cmd.name}</Text>
            {cmd.description ? <Text style={{ color: c.textWeak, fontSize: 11.5, marginTop: 2 }}>{cmd.description}</Text> : null}
          </Pressable>
        ))}
        {!commands.length ? <Text style={{ color: c.textWeak, fontSize: 13 }}>No commands available.</Text> : null}
      </Sheet>

      <Sheet visible={picker === 'attach'} onClose={() => setPicker(null)} title="Add attachment">
        <MenuItem icon="document-outline" label="Choose a file" onPress={attach} />
        <MenuItem icon="images-outline" label="Choose a photo or PDF" onPress={attach} />
        <Text style={{ color: c.textWeak, fontSize: 11, marginTop: 8, lineHeight: 16 }}>Only images, PDFs, or text files can be attached here.</Text>
      </Sheet>

      <Sheet visible={picker === 'todos'} onClose={() => setPicker(null)} title="Session todos">
        {todos.map((t, i) => (
          <View key={t.id || `${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 8 }}>
            <Ionicons name={t.status === 'completed' ? 'checkmark-circle' : t.status === 'in_progress' ? 'time-outline' : 'ellipse-outline'} size={16} color={t.status === 'completed' ? c.success : c.textWeak} />
            <Text style={{ color: t.status === 'completed' ? c.textWeak : c.text, fontSize: 13.5, flex: 1, textDecorationLine: t.status === 'completed' ? 'line-through' : 'none' }}>{t.content}</Text>
          </View>
        ))}
        {!todos.length ? <Text style={{ color: c.textWeak, fontSize: 13 }}>No todos for this session.</Text> : null}
      </Sheet>

      <Sheet visible={picker === 'inbox'} onClose={() => setPicker(null)} title="Pending prompts">
        {inbox.map((item) => (
          <View key={item.id} style={{ paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderWeaker }}>
            <Text style={{ color: c.text, fontSize: 13 }} numberOfLines={3}>{item.payload?.text || item.payload?.prompt || item.type || 'Queued prompt'}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button compact label="Steer now" variant="secondary" onPress={async () => { await client?.inboxMove(sessionId, item.id, 'steer'); refresh(); }} />
              <Button compact label="Move to queue" variant="secondary" onPress={async () => { await client?.inboxMove(sessionId, item.id, 'queue'); refresh(); }} />
              <Button compact label="Remove" variant="ghost" onPress={async () => { await client?.inboxRemove(sessionId, item.id); refresh(); }} />
            </View>
          </View>
        ))}
        {!inbox.length ? <Text style={{ color: c.textWeak, fontSize: 13 }}>No queued prompts.</Text> : null}
      </Sheet>
    </Screen>
  );
}

function PermissionSheet({ permission, busy, onClose, onReply }: {
  permission: PermissionRequest | null; busy: boolean; onClose: () => void;
  onReply: (r: 'once' | 'always' | 'reject') => void;
}) {
  const { theme } = useSettings();
  const c = theme.colors;
  return (
    <Sheet visible={!!permission} onClose={onClose} title="Permission request">
      {permission ? (
        <View>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{permission.action || 'Approve request'}</Text>
          {permission.message ? <Text style={{ color: c.textBase, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{permission.message}</Text> : null}
          {permission.resources?.length ? (
            <View style={{ marginTop: 10, backgroundColor: c.surfaceRaised, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10 }}>
              {permission.resources.map((r, i) => <Text key={i} style={{ color: c.textBase, fontSize: 12, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), paddingVertical: 2 }}>{r}</Text>)}
            </View>
          ) : null}
          <Text style={{ color: c.textWeak, fontSize: 11, marginTop: 10 }}>Allow once to permit this action, or always to save the rule for this server.</Text>
          <View style={{ gap: 8, marginTop: 14 }}>
            <Button label="Allow once" variant="primary" onPress={() => onReply('once')} loading={busy} />
            <Button label="Always allow" variant="secondary" onPress={() => onReply('always')} disabled={busy} />
            <Button label="Deny" variant="danger" onPress={() => onReply('reject')} disabled={busy} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

function FormSheet({ form, onSubmit }: { form: FormInfo; onSubmit: (answers: Record<string, any>) => void }) {
  const { theme } = useSettings();
  const c = theme.colors;
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const f of form.fields || []) {
      if ((f as any).default !== undefined) init[f.key] = (f as any).default;
    }
    return init;
  });
  return (
    <View>
      {(form.fields || []).filter((f) => !f.hidden).map((f) => (
        <View key={f.key} style={{ marginBottom: 14 }}>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', marginBottom: 5 }}>{f.title || f.key}{f.required ? ' *' : ''}</Text>
          {f.description ? <Text style={{ color: c.textWeak, fontSize: 11.5, marginBottom: 6 }}>{f.description}</Text> : null}
          {f.type === 'boolean' ? (
            <Pressable onPress={() => setValues((v) => ({ ...v, [f.key]: !v[f.key] }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={values[f.key] ? 'checkbox' : 'square-outline'} size={18} color={c.textInteractive} />
              <Text style={{ color: c.textBase, fontSize: 13 }}>{values[f.key] ? 'Yes' : 'No'}</Text>
            </Pressable>
          ) : f.options?.length ? (
            <View style={{ gap: 7 }}>
              {f.options.map((o) => {
                const multi = f.type === 'multiselect';
                const arr: string[] = Array.isArray(values[f.key]) ? values[f.key] : [];
                const on = multi ? arr.includes(o.value) : values[f.key] === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => setValues((v) => {
                      if (!multi) return { ...v, [f.key]: o.value };
                      const cur: string[] = Array.isArray(v[f.key]) ? v[f.key] : [];
                      return { ...v, [f.key]: cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value] };
                    })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Ionicons name={on ? (multi ? 'checkbox' : 'radio-button-on') : (multi ? 'square-outline' : 'radio-button-off')} size={17} color={on ? c.textInteractive : c.textWeaker} />
                    <Text style={{ color: c.textBase, fontSize: 13 }}>{o.label || o.value}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <TextInput
              value={values[f.key] == null ? '' : String(values[f.key])}
              onChangeText={(text) => setValues((v) => ({ ...v, [f.key]: f.type === 'number' || f.type === 'integer' ? Number(text) : text }))}
              placeholder={f.placeholder}
              placeholderTextColor={c.textWeaker}
              keyboardType={f.type === 'number' || f.type === 'integer' ? 'numeric' : 'default'}
              style={{ color: c.text, backgroundColor: c.surfaceRaised, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, fontSize: 13 }}
            />
          )}
        </View>
      ))}
      <Button label="Submit" variant="primary" onPress={() => onSubmit(values)} />
    </View>
  );
}

function InfoRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  const { theme } = useSettings();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderWeaker }}>
      <Text style={{ color: theme.colors.textWeak, fontSize: 12, width: 145 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) }} selectable>{value}</Text>
      {onCopy ? <Pressable onPress={onCopy}><Ionicons name="copy-outline" size={14} color={theme.colors.textWeak} /></Pressable> : null}
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
  const { theme } = useSettings();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={18} color={danger ? theme.colors.error : theme.colors.iconStrong} />
      <Text style={{ color: danger ? theme.colors.error : theme.colors.text, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  composer: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  inputWrap: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 6 },
  sendBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7, paddingVertical: 5 },
  jump: { position: 'absolute', right: 14, bottom: 150, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, elevation: 3 },
  todoBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  chipStrip: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  timelineChip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 9, paddingVertical: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, padding: 10 },
  variant: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
});
