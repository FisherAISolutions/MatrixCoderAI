export type AgentType = 'planning' | 'coding' | 'reviewing' | 'orchestrator';
export type MemoryStage = 'context' | 'sql' | 'storage';
export type FileLanguage =
  | 'typescript' |'javascript' |'python' |'css' |'html' |'json' |'markdown' |'bash' |'sql' |'yaml' |'unknown';

export interface FileNode {
  id: string;
  name: string;
  path: string;
  parentPath?: string;
  type: 'file' | 'folder';
  language?: FileLanguage;
  content?: string;
  size?: number;
  lastModified?: string;
  children?: FileNode[];
  isNew?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  agent?: AgentType;
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  files?: string[];
  codeBlocks?: CodeBlock[];
  memoryStage?: MemoryStage;
  tokenCount?: number;
  thinkingSteps?: string[];
}

export interface CodeBlock {
  id: string;
  language: string;
  filename?: string;
  code: string;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  fileCount: number;
  memoryStage: MemoryStage;
}