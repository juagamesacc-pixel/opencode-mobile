export type Protocol = 'v1' | 'v2';

export interface ServerProfile {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  password: string | null;
  protocol: Protocol;
}

export interface ServerInfo {
  version?: string;
  pid?: number;
  urls?: string[];
  healthy?: boolean;
}

export interface ProbeResult {
  protocol: Protocol;
  info: ServerInfo;
}

export interface Project {
  id: string;
  name?: string;
  worktree?: string;
  directory?: string;
  canonical?: string;
  vcs?: { branch?: string; provider?: string };
  time?: { created?: number; updated?: number };
}

export interface SessionTime {
  created?: number;
  updated?: number;
  archived?: number;
  idle?: number;
}

export interface Session {
  id: string;
  title: string;
  slug?: string;
  projectID?: string;
  directory?: string;
  parentID?: string | null;
  version?: string;
  cost?: number;
  tokens?: TokenUsage;
  time?: SessionTime;
  summary?: { additions?: number; deletions?: number; files?: number };
  revert?: { messageID?: string; partID?: string } | null;
  raw?: any;
}

export interface TokenUsage {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}

export interface ModelRef {
  providerID: string;
  modelID: string;
  variant?: string | null;
}

export interface ChatModel extends ModelRef {
  name?: string;
  family?: string;
  context?: number;
  output?: number;
  cost?: any;
  variants?: string[];
}

export interface AgentInfo {
  name: string;
  description?: string;
  mode?: string;
  model?: ModelRef;
  color?: string;
  hidden?: boolean;
}

export type PartType =
  | 'text'
  | 'reasoning'
  | 'tool'
  | 'file'
  | 'patch'
  | 'snapshot'
  | 'agent'
  | 'step-start'
  | 'step-finish'
  | 'compaction'
  | 'subtask'
  | 'unknown';

export interface ToolState {
  status?: 'pending' | 'running' | 'streaming' | 'completed' | 'error';
  title?: string;
  input?: any;
  output?: string;
  error?: string;
  metadata?: any;
  time?: { start?: number; end?: number };
  content?: any[];
}

export interface ChatPart {
  id: string;
  type: PartType;
  text?: string;
  reasoning?: string;
  tool?: string;
  callID?: string;
  state?: ToolState;
  mime?: string;
  url?: string;
  filename?: string;
  source?: any;
  agent?: string;
  model?: ModelRef;
  synthetic?: boolean;
  raw?: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'synthetic';
  created?: number;
  completed?: number;
  agent?: string;
  model?: ModelRef;
  cost?: number;
  tokens?: TokenUsage;
  error?: any;
  parts: ChatPart[];
  pending?: boolean;
  delivery?: string;
  raw?: any;
}

export interface PermissionRequest {
  id: string;
  sessionID?: string;
  action?: string;
  resources?: string[];
  message?: string;
  metadata?: any;
  source?: any;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionInfo {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID?: string;
  questions?: QuestionInfo[];
}

export interface FormFieldOption {
  value: string;
  label?: string;
  description?: string;
}

export interface FormField {
  key: string;
  type?: string;
  title?: string;
  description?: string;
  required?: boolean;
  options?: FormFieldOption[];
  placeholder?: string;
  hidden?: boolean;
  default?: any;
}

export interface FormInfo {
  id: string;
  sessionID?: string;
  title?: string;
  fields?: FormField[];
  metadata?: any;
}

export interface Todo {
  id?: string;
  content?: string;
  status?: string;
  priority?: string;
}

export interface FileDiff {
  file: string;
  patch?: string;
  additions?: number;
  deletions?: number;
  status?: 'added' | 'deleted' | 'modified';
}

export interface VcsInfo {
  branch?: string;
  provider?: string;
}

export interface FileStatus {
  file: string;
  additions?: number;
  deletions?: number;
  status?: string;
}

export interface FileNode {
  name: string;
  path: string;
  absolute?: string;
  type: 'file' | 'directory';
  ignored?: boolean;
}

export interface Pty {
  id: string;
  title?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  status?: 'running' | 'exited';
  pid?: number;
  exitCode?: number;
}

export interface InboxItem {
  id: string;
  sessionID?: string;
  type?: string;
  payload?: any;
  delivery?: string;
  time?: number;
}

export interface Attachment {
  uri: string;
  name: string;
  mime: string;
  dataUrl?: string;
}

export interface PromptInput {
  text: string;
  files?: Attachment[];
  agents?: { name: string; mention?: string }[];
  model?: ModelRef | null;
  variant?: string | null;
  agent?: string | null;
  delivery?: 'queue' | 'steer';
}
