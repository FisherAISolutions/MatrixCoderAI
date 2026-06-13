import { ChatMessage, FileNode, MemoryStage } from '@/app/chat-workspace/components/types';
import { supabase, loadSessionMessages, loadSessionFiles } from './supabase';

/**
 * Three-tier memory system for CodePilot
 * 
 * context: In-memory state for active session (fast, limited)
 * sql: Supabase persistent storage (scalable, indexed)
 * storage: Future long-term memory (embeddings, semantic search)
 */

export interface MemoryState {
  stage: MemoryStage;
  messages: ChatMessage[];
  files: FileNode[];
  sessionId: string;
  lastUpdated: number;
}

class MemoryManager {
  private contextMemory: Map<string, MemoryState> = new Map();
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Load memory from all stages into context
   */
  async loadMemory(sessionId: string): Promise<MemoryState> {
    try {
      // Load from SQL (primary source)
      const messages = await loadSessionMessages(sessionId);
      const files = await loadSessionFiles(sessionId);

      // Build file tree from flat list
      const fileTree = this.buildFileTree(files);

      // Convert DB messages to ChatMessage format
      const chatMessages: ChatMessage[] = messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        agent: msg.agent,
        content: msg.content,
        timestamp: msg.created_at,
        files: msg.files || [],
        thinkingSteps: msg.thinking_steps || [],
        tokenCount: msg.token_count || 0,
        isStreaming: msg.is_streaming || false,
      }));

      // Determine memory stage based on size
      const messageCount = chatMessages.length;
      const stage: MemoryStage =
        messageCount > 100
          ? 'storage'
          : messageCount > 30
          ? 'sql'
          : 'context';

      const state: MemoryState = {
        stage,
        messages: chatMessages,
        files: fileTree,
        sessionId,
        lastUpdated: Date.now(),
      };

      // Cache in context memory
      this.contextMemory.set(sessionId, state);

      return state;
    } catch (error) {
      console.error('Failed to load memory:', error);
      return {
        stage: 'context',
        messages: [],
        files: [],
        sessionId,
        lastUpdated: Date.now(),
      };
    }
  }

  /**
   * Get memory from context (fast)
   */
  getContextMemory(sessionId: string): MemoryState | undefined {
    return this.contextMemory.get(sessionId);
  }

  /**
   * Save memory to SQL layer
   */
  async saveMemory(sessionId: string, state: MemoryState) {
    // Context memory already in RAM
    this.contextMemory.set(sessionId, state);

    // SQL layer saves are handled by individual save functions
    // (saveMessage, saveFile) called from components
  }

  /**
   * Clear memory (on logout or session end)
   */
  clearMemory(sessionId: string) {
    this.contextMemory.delete(sessionId);
  }

  /**
   * Get memory stage recommendation based on conversation size
   */
  getMemoryStageRecommendation(messageCount: number): MemoryStage {
    if (messageCount > 100) return 'storage';
    if (messageCount > 30) return 'sql';
    return 'context';
  }

  /**
   * Build file tree from flat file list
   */
  private buildFileTree(files: any[]): FileNode[] {
    const tree: FileNode[] = [];
    const nodeMap = new Map<string, FileNode>();

    // Create all file nodes
    files.forEach(file => {
      const node: FileNode = {
        id: file.id,
        name: file.file_name,
        path: file.file_path,
        type: 'file',
        language: file.language as any,
        content: file.content,
        size: file.size,
        lastModified: file.updated_at,
        isNew: file.is_new,
      };
      nodeMap.set(file.file_path, node);
    });

    // Create folder nodes
    const folderSet = new Set<string>();
    files.forEach(file => {
      const parts = file.file_path.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join('/');
        folderSet.add(folderPath);
      }
    });

    folderSet.forEach(folderPath => {
      if (!nodeMap.has(folderPath)) {
        const folderName = folderPath.split('/').pop()!;
        const parentPath = folderPath.split('/').slice(0, -1).join('/') || undefined;
        const node: FileNode = {
          id: folderPath.replace(/\//g, '-'),
          name: folderName,
          path: folderPath,
          type: 'folder',
          parentPath,
          children: [],
        };
        nodeMap.set(folderPath, node);
      }
    });

    // Link children to parents
    const allNodes = Array.from(nodeMap.values());
    allNodes.forEach(node => {
      if (node.parentPath) {
        const parent = nodeMap.get(node.parentPath);
        if (parent && parent.type === 'folder') {
          if (!parent.children) parent.children = [];
          parent.children.push(node);
        }
      } else {
        tree.push(node);
      }
    });

    return tree;
  }
}

// Singleton instance
let instance: MemoryManager | null = null;

export function initMemoryManager(sessionId: string): MemoryManager {
  if (!instance) {
    instance = new MemoryManager(sessionId);
  }
  return instance;
}

export function getMemoryManager(): MemoryManager {
  if (!instance) {
    throw new Error('MemoryManager not initialized. Call initMemoryManager first.');
  }
  return instance;
}

export function resetMemoryManager() {
  instance = null;
}
