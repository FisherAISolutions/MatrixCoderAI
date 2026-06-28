'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Toaster } from 'sonner';
import toast from 'react-hot-toast';
import FileTreeSidebar from './FileTreeSidebar';
import ChatPanel from './ChatPanel';
import WorkspaceTopbar from './WorkspaceTopbar';
import TerminalPanel from './TerminalPanel';
import PreviewPanel from './PreviewPanel';
import ZipImportProgress, { ZipDropOverlay } from './ZipImportProgress';
import type { ImportPhase } from './ZipImportProgress';
import { FileNode, ChatMessage, AgentType, MemoryStage } from './types';
import { loadSessionMessages, loadSessionFiles, saveMessage, saveFile, deleteFile as deleteFileFromDb, bulkSaveFiles, renameFile as renameFileInDb } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { initMemoryManager, getMemoryManager } from '@/lib/memory';
import { parseZipFile } from '@/lib/zip/zipImport';
import type { ZipImportProgress as ZipProgressT } from '@/lib/zip/zipImport';
import { importGithubRepo } from '@/lib/zip/githubImport';
import { indexProject, indexFile as indexFileEmbedding } from '@/lib/repo/indexer';
import { safeUUID } from '@/lib/uuid';
import {
  getStoredActiveFilePath,
  setStoredActiveFilePath,
  clearStoredActiveFilePath,
} from '@/lib/storage/persistence';
import { clearTerminalLogs, pushTerminalLog } from '@/lib/terminal/store';
import { consumeStylePromptForWorkspace } from '@/lib/styleInspiration';
import {
  buildDeploymentWorkspaceSnapshot,
  saveDeploymentWorkspaceSnapshot,
} from '@/lib/deployment/workspaceStatus';

// Helper function to build file tree from flat file list
function buildFileTree(files: any[]): FileNode[] {
  const tree: FileNode[] = [];
  const nodeMap = new Map<string, FileNode>();

  // Create all file nodes
  files.forEach(file => {
  const parentPath =
    file.file_path.split('/').slice(0, -1).join('/') || undefined;

  const node: FileNode = {
    id: file.id,
    name: file.file_name,
    path: file.file_path,
    type: 'file',
    parentPath,
    language: file.language as any,
    content: file.content,
    size: file.size,
    lastModified: file.updated_at,
    isNew: file.is_new,
  };

  nodeMap.set(file.file_path, node);
});

  // Create folder nodes and build tree
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

/**
 * Recursively locate a FileNode by its `path`. Used to restore the active
 * file after a refresh, since localStorage only stores the path (the in-DB
 * IDs are stable but feel more brittle to depend on for UX continuity).
 * Returns null if not found.
 */
function findFileByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === path) return node;
    if (node.type === 'folder' && node.children?.length) {
      const found = findFileByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

// Placeholder session ID — only used when no auth session is available.
// Uses crypto.randomUUID-backed safeUUID to avoid collisions across mounts.
const SESSION_ID = 'demo-session-' + safeUUID();

export default function ChatWorkspacePage() {
  const {
  user,
  session,
  sessions,
  archivedWorkspaceIds,
  isLoading: authLoading,
  signOut,
  createNewSession,
  renameWorkspace,
  archiveWorkspace,
  restoreWorkspace,
  deleteWorkspace,
  switchSession,
} = useAuth();
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Matrix Coder AI — preview panel state. Default closed.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(420);
  const [activeAgent, setActiveAgent] = useState<AgentType | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [memoryStage, setMemoryStage] = useState<MemoryStage>('context');
  const [sessionTokens, setSessionTokens] = useState(0);
  // Lightweight activity feedback (e.g. "Building repo context…",
  // "Searching embeddings…", "Streaming response…"). Owned here; passed
  // down to ChatPanel → AgentStatusBar for display. Cleared on finish/error.
  const [activityStatus, setActivityStatus] = useState<string | null>(null);
  const [initialStylePrompt, setInitialStylePrompt] = useState<string | null>(null);

  // --- Zip import state (Phase 1) ---
  const [importPhase, setImportPhase] = useState<ImportPhase>('done');
  const [importProgress, setImportProgress] = useState<ZipProgressT | null>(null);
  const [importSavedCount, setImportSavedCount] = useState(0);
  const [importTotalToSave, setImportTotalToSave] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [showImportProgress, setShowImportProgress] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);

  // Determine session ID to use
  const effectiveSessionId = session?.id || '';

  useEffect(() => {
    if (isLoadingData) return;
    const snapshot = buildDeploymentWorkspaceSnapshot({
      sessionId: effectiveSessionId || undefined,
      projectName: session?.title,
      files: fileTree,
      messages,
      isGenerating: isStreaming,
    });
    saveDeploymentWorkspaceSnapshot(snapshot);
  }, [
    effectiveSessionId,
    fileTree,
    isLoadingData,
    isStreaming,
    messages,
    session?.title,
  ]);

  // Initialize memory manager
  useEffect(() => {
    if (effectiveSessionId) {
      initMemoryManager(effectiveSessionId);
    }
  }, [effectiveSessionId]);

  useEffect(() => {
    const prompt = consumeStylePromptForWorkspace();
    if (!prompt) return;
    setInitialStylePrompt(prompt);
    toast.success('Style inspiration prompt loaded');
  }, []);

  // Load initial data from Supabase
  useEffect(() => {
    const loadData = async () => {
      if (authLoading) {
        return;
      }

      if (!effectiveSessionId) {
        console.warn('No session ID - loading empty session');
        setIsLoadingData(false);
        return;
      }

      try {
        console.log('Loading session data:', effectiveSessionId);
        setIsLoadingData(true);
        
        // Try to load messages - if fails, use empty arrays
        try {
          console.log('Fetching messages from DB...');
          const messagesData = await loadSessionMessages(effectiveSessionId);
          console.log('Received messages:', messagesData?.length || 0);
          const convertedMessages: ChatMessage[] = (messagesData || []).map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant' | 'system',
            agent: msg.agent as AgentType | undefined,
            content: msg.content,
            timestamp: msg.created_at,
            files: msg.files || [],
            thinkingSteps: msg.thinking_steps || [],
            tokenCount: msg.token_count || 0,
            isStreaming: false,
          }));
          setMessages(convertedMessages);
          const stage = getMemoryStageRecommendation(convertedMessages.length);
          setMemoryStage(stage);
        } catch (msgErr) {
          const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
          console.warn('Could not load messages (DB connection issue):', errMsg);
          setMessages([]);
        }

        // Try to load files - if fails, use empty array
        try {
          console.log('Fetching files from DB...');
          const filesData = await loadSessionFiles(effectiveSessionId);
          console.log('Received files:', filesData?.length || 0);
          const tree = buildFileTree(filesData || []);
          setFileTree(tree);

          // Milestone B — restore active file from localStorage.
          // The stored path is keyed by session, so each session retains
          // its own "last viewed" file independently.
          const storedPath = getStoredActiveFilePath(effectiveSessionId);
          if (storedPath) {
            const restored = findFileByPath(tree, storedPath);
            if (restored) {
              console.log('Restoring active file from localStorage:', storedPath);
              setActiveFile(restored);
            } else {
              console.log('Stored active file no longer exists:', storedPath);
              clearStoredActiveFilePath(effectiveSessionId);
            }
          }
        } catch (fileErr) {
          const errMsg = fileErr instanceof Error ? fileErr.message : String(fileErr);
          console.warn('Could not load files (DB connection issue):', errMsg);
          setFileTree([]);
        }

        setIsLoadingData(false);
      } catch (error) {
        console.error('Failed to load session data:', error);
        toast.error('Session loaded (demo mode)');
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [effectiveSessionId, authLoading]);

  // Milestone B — persist active file path per session, so a refresh
  // re-opens the same file inside the same session.
  //
  // IMPORTANT: When the session itself changes (e.g. user clicks "New
  // Workspace" or "Switch Session"), the parent component synchronously
  // resets activeFile → null. Because React batches both updates, this
  // effect would otherwise run once with (NEW sessionId, null activeFile)
  // and *clobber* whatever stored path the new session had — breaking the
  // very thing we're trying to persist. We guard against that with a ref
  // that tracks which session the current activeFile *belongs* to.
  const activeFileSessionRef = useRef<string>('');
  useEffect(() => {
    if (!effectiveSessionId) return;
    if (activeFileSessionRef.current !== effectiveSessionId) {
      // Session just changed — skip this run; loadData will restore the
      // correct activeFile for the new session shortly.
      activeFileSessionRef.current = effectiveSessionId;
      return;
    }
    if (activeFile?.path) {
      setStoredActiveFilePath(effectiveSessionId, activeFile.path);
    } else {
      clearStoredActiveFilePath(effectiveSessionId);
    }
  }, [activeFile, effectiveSessionId]);

  // ------------------------------------------------------------------
  // Message helpers — split into THREE distinct operations to prevent the
  // duplicate-assistant-message bug:
  //
  //   1. addMessage              → UI append + DB persist (user msgs,
  //                                orchestrator routing msgs, etc.)
  //   2. appendMessageToUI       → UI append ONLY  (streaming placeholder —
  //                                we don't want to save an empty content
  //                                row to the DB and then later save the
  //                                final content as a *different* row)
  //   3. persistAssistantMessage → DB persist ONLY (called after streaming
  //                                completes — the message already lives in
  //                                UI state and has been updated in-place
  //                                via updateLastMessage)
  // ------------------------------------------------------------------
  const persistMessageToDb = useCallback(
    (msg: ChatMessage) => {
      if (!effectiveSessionId || effectiveSessionId.startsWith('demo-')) {
        console.log('Not persisting message (demo session or no session ID)');
        return;
      }
      saveMessage(
        effectiveSessionId,
        msg.role,
        msg.content,
        msg.agent,
        msg.files,
        msg.thinkingSteps
      )
        .then((result) => {
          if (result) {
            console.log('Message saved successfully');
          } else {
            console.warn('Message save returned null - DB may be unavailable');
          }
        })
        .catch((err) => {
          // Silently fail for DB issues - app continues working
          console.debug(
            'Message save error (non-blocking):',
            err instanceof Error ? err.message : String(err)
          );
        });
    },
    [effectiveSessionId]
  );

  const appendMessageToUI = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      appendMessageToUI(msg);
      persistMessageToDb(msg);
    },
    [appendMessageToUI, persistMessageToDb]
  );

  // Called by ChatComposer once the streaming response is complete. The
  // message is ALREADY in the UI state (we updated it in-place via
  // updateLastMessage during streaming). We only need to persist it now.
  const persistAssistantMessage = useCallback(
    (msg: ChatMessage) => {
      persistMessageToDb(msg);
    },
    [persistMessageToDb]
  );

  const updateLastMessage = useCallback((updater: (prev: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const updated = updater(last);
      if (updated === last) return prev;
      const next = [...prev];
      next[next.length - 1] = updated;
      return next;
    });
  }, []);

  // File management callbacks
  //
  // PATCH PIPELINE NOTE — this is the SINGLE point where AI-applied
  // patches re-enter React state. Two state slices must update
  // immutably in lock-step for the file viewer to reflect the patch:
  //
  //   1. fileTree   (used by the sidebar + by ChatComposer for the next
  //                  context-build pass — so EVERY patch must update it,
  //                  not just the currently-open file)
  //   2. activeFile (used by both <FileViewer/> instances — the one in
  //                  ChatWorkspacePage AND the one inside FileTreeSidebar
  //                  which keys its local state off activeFile)
  //
  // We preserve the original `id` so tree-node identity and React keys
  // stay stable across patches. Without this, the destructuring spread
  // `{...n, ...file}` could clobber `n.id` when an edit was matched by
  // path-only (e.g. AI emitted "src/foo.ts" without knowing the row id).
  const updateFile = useCallback((file: FileNode) => {
  setFileTree((prev) => {
    const updateInTree = (nodes: FileNode[]): FileNode[] => {
      return nodes.map((n) => {
        // Match by BOTH id and path to avoid patch-path mismatches
        if (
          n.id === file.id ||
          n.path === file.path
        ) {
          // Preserve original id / path / name / parentPath so that
          // tree identity is stable. Only content + meta come from `file`.
          const merged: FileNode = {
            ...n,
            ...file,
            id: n.id,
            path: n.path,
            name: n.name,
            parentPath: n.parentPath,
          };
          console.info(
            `[updateFile] tree node patched id=${n.id} path=${n.path} ` +
              `size=${(file.content ?? n.content ?? '').length}`
          );
          return merged;
        }

        if (n.children) {
          return {
            ...n,
            children: updateInTree(n.children),
          };
        }

        return n;
      });
    };

    return updateInTree(prev);
  });

  // CRITICAL FIX:
  // keep currently-open viewer synchronized.
  // Returning a brand-new object reference guarantees React re-renders
  // every consumer that has `activeFile` in its dependency array
  // (FileViewer, FileTreeSidebar, ChatComposer, etc.).
  setActiveFile((prev) => {
    if (!prev) return prev;

    if (
      prev.id === file.id ||
      prev.path === file.path
    ) {
      const merged: FileNode = {
        ...prev,
        ...file,
        // Same identity preservation as above.
        id: prev.id,
        path: prev.path,
        name: prev.name,
        parentPath: prev.parentPath,
      };
      console.info(`[updateFile] activeFile patched id=${prev.id} path=${prev.path}`);
      return merged;
    }

    return prev;
  });

  // Save to Supabase
  if (file.id && file.content) {
    saveFile(
      effectiveSessionId,
      file.path,
      file.name,
      file.content,
      file.language
    )
      .then((result) => {
        if (
          !result &&
          effectiveSessionId &&
          !effectiveSessionId.startsWith('demo-')
        ) {
          pushTerminalLog({
            level: 'error',
            text: `[persist-consistency] update failed path=${file.path} reason=save returned null\n`,
            timestamp: Date.now(),
          });
          console.error('[updateFile] save returned null for', file.path);
          toast.error(`Could not save ${file.name} — DB unavailable`);
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        pushTerminalLog({
          level: 'error',
          text: `[persist-consistency] update threw path=${file.path} reason=${msg}\n`,
          timestamp: Date.now(),
        });
        console.error('[updateFile] save threw:', msg);
        toast.error(`Failed to save ${file.name}: ${msg}`);
      });

    indexFileEmbedding(
      effectiveSessionId,
      file.path,
      file.content
    );
  }
}, [effectiveSessionId]);

  const deleteFile = useCallback((fileId: string) => {
  setFileTree((prev) => {
    const deleteFromTree = (nodes: FileNode[]): FileNode[] => {
      return nodes
        .filter(n => n.id !== fileId)
        .map(n => {
          if (n.children) {
            return {
              ...n,
              children: deleteFromTree(n.children),
            };
          }
          return n;
        });
    };

    return deleteFromTree(prev);
  });

  if (activeFile?.id === fileId) {
    setActiveFile(null);
  }

  deleteFileFromDb(fileId).catch((err) => {
    console.error('Failed to delete file from DB:', err);
    toast.error('Failed to delete file from database');
  });

  toast.success('File deleted');
}, [activeFile]);

  const addFile = useCallback((file: FileNode) => {
    // Hardening pass #3: collision protection. If a file already lives
    // at this path, refuse to add a duplicate (whether triggered by the
    // user via the `+` button or by an AI-generated "create" block).
    let collided = false;
    setFileTree((prev) => {
      if (findFileByPath(prev, file.path)) {
        collided = true;
        return prev; // no-op
      }
      const addToTree = (nodes: FileNode[]): FileNode[] => {
        return nodes.map((n) => {
          if (n.type === 'folder' && n.path === file.parentPath) {
            return { ...n, children: [...(n.children || []), file] };
          }
          if (n.children) return { ...n, children: addToTree(n.children) };
          return n;
        });
      };
      if (!file.parentPath) return [...prev, file];
      return addToTree(prev);
    });

    if (collided) {
      console.warn('[addFile] path collision — refusing to duplicate', file.path);
      toast.error(`A file already exists at ${file.path}`);
      return;
    }

    // Save to Supabase — hardening pass #7: visible diagnostics on failure.
    console.log('Saving file to DB:', { sessionId: effectiveSessionId, path: file.path });
    saveFile(effectiveSessionId, file.path, file.name, file.content || '', file.language).then(result => {
      if (result) {
        pushTerminalLog({
          level: 'info',
          text: `[persist-consistency] add saved path=${file.path}\n`,
          timestamp: Date.now(),
        });
        console.log('File saved successfully:', file.path);
        // Phase 2B — embed in background after successful save
        if (file.content) {
          indexFileEmbedding(effectiveSessionId, file.path, file.content);
        }
      } else if (effectiveSessionId && !effectiveSessionId.startsWith('demo-')) {
        pushTerminalLog({
          level: 'error',
          text: `[persist-consistency] add failed path=${file.path} reason=save returned null\n`,
          timestamp: Date.now(),
        });
        console.error('[addFile] save returned null for', file.path);
        toast.error(`Could not save ${file.name} — DB unavailable`);
      }
    }).catch(err => {
      const errMsg = err instanceof Error ? err.message : String(err);
      pushTerminalLog({
        level: 'error',
        text: `[persist-consistency] add threw path=${file.path} reason=${errMsg}\n`,
        timestamp: Date.now(),
      });
      console.error('[addFile] save threw:', errMsg);
      toast.error(`Failed to save ${file.name}: ${errMsg}`);
    });
  }, [effectiveSessionId]);

  const createNewFile = useCallback((name: string) => {
    if (!name.trim()) {
      toast.error('File name required');
      return;
    }
    const fileName = name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx') 
      ? name 
      : name + '.ts';
    const filePath = `src/${fileName}`;

    // Hardening pass #3: collision check at the user-input layer so we
    // never get to the `+ button → addFile → toast error` round-trip.
    if (findFileByPath(fileTree, filePath)) {
      toast.error(`A file already exists at ${filePath}`);
      return;
    }

    const newFile: FileNode = {
      id: `file-${safeUUID()}`,
      name: fileName,
      path: filePath,
      type: 'file',
      language: 'typescript',
      content: `// ${fileName}\n\nexport default function ${fileName.replace(/\.[^.]+$/, '')}() {\n  // Your code here\n}`,
      isNew: true,
      lastModified: new Date().toISOString(),
      size: 0,
    };
    addFile(newFile);
    setActiveFile(newFile);
    toast.success(`Created ${fileName}`);
  }, [addFile, fileTree]);

  /**
   * Milestone C — lightweight, same-folder rename.
   *
   * - Updates the in-memory tree node (path / name / parentPath, content
   *   and ID preserved).
   * - Persists the rename to Supabase via `renameFileInDb`, which patches
   *   file_path / file_name / parent_path on the existing row.
   * - If the currently active file is the one being renamed, the
   *   activeFile reference is updated so the open viewer keeps pointing
   *   at the renamed node (and the localStorage persistence layer
   *   automatically writes the new path).
   *
   * Cross-folder moves are intentionally NOT supported here — the input
   * layer rejects "/" / "\" before we get this far. That keeps tree
   * mutation logic trivial: same parent, just swap basename.
   */
  const renameFile = useCallback(
    (file: FileNode, newPath: string) => {
      if (!file || !newPath || newPath === file.path) return;
      const newName = newPath.split('/').pop() ?? file.name;

      // Hardening pass #3: collision protection. Refuse to rename onto
      // an existing path (would otherwise leave duplicates in the tree
      // and/or trigger a DB unique-constraint error).
      if (findFileByPath(fileTree, newPath)) {
        toast.error(`A file already exists at ${newPath}`);
        return;
      }

      // Update in-memory tree.
      setFileTree((prev) => {
        const update = (nodes: FileNode[]): FileNode[] =>
          nodes.map((n) => {
            if (n.id === file.id) {
              return { ...n, path: newPath, name: newName, isNew: false };
            }
            if (n.children) return { ...n, children: update(n.children) };
            return n;
          });
        return update(prev);
      });

      // Keep active file pointing at the same node.
      if (activeFile?.id === file.id) {
        setActiveFile({ ...file, path: newPath, name: newName, isNew: false });
      }

      // Persist to DB (non-blocking).
      const parentPath = newPath.split('/').slice(0, -1).join('/') || null;
      renameFileInDb(file.id, newPath, newName, parentPath)
        .then((result) => {
          if (result) {
            toast.success(`Renamed to ${newName}`);
            // Re-embed at the new path so semantic search reflects the
            // rename (best-effort, swallowed on failure).
            if (file.content) {
              indexFileEmbedding(effectiveSessionId, newPath, file.content);
            }
          } else {
            console.warn('renameFile returned null — DB may be unavailable');
            toast.success(`Renamed to ${newName} (local only)`);
          }
        })
        .catch((err) => {
          console.error('Failed to rename file in DB:', err);
          toast.error('Failed to persist rename to database');
        });
    },
    [activeFile, effectiveSessionId, fileTree]
  );

  // Get memory stage recommendation
  const getMemoryStageRecommendation = (messageCount: number): MemoryStage => {
    if (messageCount > 100) return 'storage';
    if (messageCount > 30) return 'sql';
    return 'context';
  };

  // --- Zip import flow (Phase 1) ---
  // Parses zip → creates a new session named after the project → bulk-saves files → switches session.
  const runZipImport = useCallback(async (zipFile: File) => {
    if (isImporting) return;
    setIsImporting(true);
    setImportError(null);
    setImportSummary(null);
    setImportSavedCount(0);
    setImportTotalToSave(0);
    setImportProgress(null);
    setShowImportProgress(true);

    try {
      // Phase: reading + parsing
      setImportPhase('reading');
      // Small delay so users see the "reading" state on large zips
      await new Promise((r) => setTimeout(r, 50));
      setImportPhase('parsing');

      const result = await parseZipFile(zipFile, (p) => setImportProgress(p));

      if (result.files.length === 0) {
        throw new Error('No importable files found (all skipped as binaries / ignored / oversized)');
      }

      // Create a new session named after the project
      const projectTitle = result.projectName.slice(0, 80);
      let newSession;
      try {
        newSession = await createNewSession(projectTitle);
      } catch (sessErr) {
        const msg = sessErr instanceof Error ? sessErr.message : String(sessErr);
        throw new Error(`Could not create session: ${msg}`);
      }

      // Clear current view immediately
      setMessages([]);
      setFileTree([]);
      setActiveFile(null);

      // Bulk save all files
      setImportPhase('saving');
      setImportTotalToSave(result.files.length);

      const { saved, failed } = await bulkSaveFiles(
        newSession.id,
        result.files,
        (savedSoFar) => setImportSavedCount(savedSoFar)
      );

      // Switch session (will re-trigger loadData) and also set tree directly so UI is instant
      try {
        await switchSession(newSession.id);
      } catch (swErr) {
        console.warn('switchSession warning:', swErr);
      }

      // Reload tree from DB to get canonical ids
      try {
        const filesData = await loadSessionFiles(newSession.id);
        const tree = buildFileTree(filesData || []);
        setFileTree(tree);
      } catch (loadErr) {
        // Fallback: build tree directly from parsed files so user still sees them
        const fallbackTree = buildFileTree(
          result.files.map((f, idx) => ({
            id: `imported-${idx}`,
            file_name: f.name,
            file_path: f.path,
            language: f.language,
            content: f.content,
            size: f.size,
            updated_at: new Date().toISOString(),
            is_new: true,
          }))
        );
        setFileTree(fallbackTree);
        console.warn('Could not reload files after import; using in-memory tree:', loadErr);
      }

      const summaryParts = [`${saved} files imported`];
      if (failed > 0) summaryParts.push(`${failed} failed`);
      if (result.skipped > 0) summaryParts.push(`${result.skipped} skipped`);
      setImportSummary(summaryParts.join(' · '));
      setImportPhase('done');

      toast.success(`Imported "${projectTitle}" — ${saved} files`);
      if (failed > 0) toast.error(`${failed} files failed to save`);

      // Hide progress popup shortly after success
      setTimeout(() => setShowImportProgress(false), 2000);

      // Phase 2B — background embeddings indexing (fire-and-forget).
      // Failures are swallowed; first 503 (pgvector unavailable) disables
      // the indexer for the rest of the session so the app falls back to
      // heuristic-only retrieval automatically.
      if (saved > 0) {
        const indexInputs = result.files.map((f) => ({
          filePath: f.path,
          content: f.content,
        }));
        indexProject(newSession.id, indexInputs)
          .then((r) => {
            if (r.disabled) {
              console.info('[indexer] pgvector unavailable — using heuristic-only context');
            } else {
              console.info(`[indexer] indexed=${r.indexed} failed=${r.failed} of ${indexInputs.length}`);
            }
          })
          .catch((e) => console.warn('[indexer] background indexing error:', e));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Zip import failed:', msg);
      setImportError(msg);
      setImportPhase('error');
      toast.error(`Import failed: ${msg}`);
      setTimeout(() => setShowImportProgress(false), 4000);
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, createNewSession, switchSession]);

  // --- GitHub repo import (secondary feature) ---
  // Mirrors runZipImport but pulls files from GitHub instead of a .zip.
  // Reuses the EXACT same downstream pipeline (bulkSaveFiles → reload →
  // tree build → background indexing) so behaviour and UI feedback are
  // identical. Public repos only for now.
  const runGithubImport = useCallback(async (repoUrl: string, ref?: string) => {
    if (isImporting) return;
    setIsImporting(true);
    setImportError(null);
    setImportSummary(null);
    setImportSavedCount(0);
    setImportTotalToSave(0);
    setImportProgress(null);
    setShowImportProgress(true);

    try {
      // Phase: connecting + listing tree. The ZipImportProgress UI
      // reuses these phase names; "reading" → talking to GitHub,
      // "parsing" → walking the tree and pre-screening blobs.
      setImportPhase('reading');
      await new Promise((r) => setTimeout(r, 50));
      setImportPhase('parsing');

      const result = await importGithubRepo(repoUrl, {
        ref,
        onProgress: (p) =>
          setImportProgress({
            total: p.total,
            processed: p.processed,
            skipped: p.skipped,
            currentPath: p.currentPath,
          }),
      });

      if (result.files.length === 0) {
        throw new Error(
          'No importable files found (all skipped as binaries / ignored / oversized)'
        );
      }

      const projectTitle = `${result.repoOwner}/${result.repoName}`.slice(0, 80);

      let newSession;
      try {
        newSession = await createNewSession(projectTitle);
      } catch (sessErr) {
        const msg = sessErr instanceof Error ? sessErr.message : String(sessErr);
        throw new Error(`Could not create session: ${msg}`);
      }

      setMessages([]);
      setFileTree([]);
      setActiveFile(null);

      setImportPhase('saving');
      setImportTotalToSave(result.files.length);

      const { saved, failed } = await bulkSaveFiles(
        newSession.id,
        result.files,
        (savedSoFar) => setImportSavedCount(savedSoFar)
      );

      try {
        await switchSession(newSession.id);
      } catch (swErr) {
        console.warn('switchSession warning (github):', swErr);
      }

      try {
        const filesData = await loadSessionFiles(newSession.id);
        const tree = buildFileTree(filesData || []);
        setFileTree(tree);
      } catch (loadErr) {
        const fallbackTree = buildFileTree(
          result.files.map((f, idx) => ({
            id: `gh-${idx}`,
            file_name: f.name,
            file_path: f.path,
            language: f.language,
            content: f.content,
            size: f.size,
            updated_at: new Date().toISOString(),
            is_new: true,
          }))
        );
        setFileTree(fallbackTree);
        console.warn(
          'Could not reload files after GitHub import; using in-memory tree:',
          loadErr
        );
      }

      const summaryParts = [`${saved} files imported from ${result.repoOwner}/${result.repoName}@${result.ref}`];
      if (failed > 0) summaryParts.push(`${failed} failed`);
      if (result.skipped > 0) summaryParts.push(`${result.skipped} skipped`);
      if (result.truncated) summaryParts.push(`tree truncated by GitHub`);
      setImportSummary(summaryParts.join(' · '));
      setImportPhase('done');

      toast.success(`Imported ${projectTitle} — ${saved} files`);
      if (failed > 0) toast.error(`${failed} files failed to save`);

      setTimeout(() => setShowImportProgress(false), 2000);

      if (saved > 0) {
        const indexInputs = result.files.map((f) => ({
          filePath: f.path,
          content: f.content,
        }));
        indexProject(newSession.id, indexInputs)
          .then((r) => {
            if (r.disabled) {
              console.info('[indexer] pgvector unavailable — using heuristic-only context');
            } else {
              console.info(
                `[indexer] indexed=${r.indexed} failed=${r.failed} of ${indexInputs.length}`
              );
            }
          })
          .catch((e) => console.warn('[indexer] background indexing error:', e));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('GitHub import failed:', msg);
      setImportError(msg);
      setImportPhase('error');
      toast.error(`GitHub import failed: ${msg}`);
      setTimeout(() => setShowImportProgress(false), 4000);
      // Re-throw so the modal's submit handler can surface the same
      // error inline (better UX than only the toast).
      throw err;
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, createNewSession, switchSession]);

  // --- Drag-and-drop (native, no extra dep) ---
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    setIsDraggingFile(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingFile(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingFile(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Only .zip project archives are supported');
      return;
    }
    runZipImport(file);
  }, [runZipImport]);

  return (
    <div
      className="workspace-shell flex flex-col h-screen w-screen bg-matrix-bg overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Toaster position="bottom-right" />

      {/* Zip import: drag overlay + progress popup (Phase 1) */}
      <ZipDropOverlay visible={isDraggingFile} />
      <ZipImportProgress
        visible={showImportProgress}
        phase={importPhase}
        progress={importProgress}
        savedCount={importSavedCount}
        totalToSave={importTotalToSave}
        error={importError}
        summary={importSummary}
      />
      
      {isLoadingData && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-matrix-green mx-auto mb-4" />
            <p className="text-matrix-green">Loading session...</p>
          </div>
        </div>
      )}
      
            <WorkspaceTopbar
        activeAgent={activeAgent}
        isStreaming={isStreaming}
        memoryStage={memoryStage}
        sessionTokens={sessionTokens}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        currentSession={session}
        sessions={sessions}
        archivedSessionIds={archivedWorkspaceIds}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen((v) => !v)}
        onCreateNewSession={async () => {
          const newSession = await createNewSession(`Workspace ${sessions.length + 1}`);
          await switchSession(newSession.id);

          setMessages([]);
          setFileTree([]);
          setActiveFile(null);

          toast.success('New workspace session created');
        }}
        onSwitchSession={async (sessionId: string) => {
          await switchSession(sessionId);

          setActiveFile(null);

          toast.success('Workspace session loaded');
        }}
        onRenameSession={async (sessionId: string, title: string) => {
          await renameWorkspace(sessionId, title);
          toast.success('Workspace renamed');
        }}
        onArchiveSession={async (sessionId: string) => {
          const wasActive = session?.id === sessionId;
          await archiveWorkspace(sessionId);
          if (wasActive) {
            setMessages([]);
            setFileTree([]);
            setActiveFile(null);
            setSessionTokens(0);
            setMemoryStage('context');
          }
          toast.success('Workspace archived');
        }}
        onRestoreSession={async (sessionId: string) => {
          await restoreWorkspace(sessionId);
          toast.success('Workspace restored');
        }}
        onDeleteSession={async (sessionId: string) => {
          const wasActive = session?.id === sessionId;
          if (wasActive) {
            clearTerminalLogs();
          }
          await deleteWorkspace(sessionId);

          if (wasActive) {
            setMessages([]);
            setFileTree([]);
            setActiveFile(null);
            setSessionTokens(0);
            setMemoryStage('context');
          }

          toast.success('Workspace deleted');
        }}
        onLogout={signOut}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* File tree sidebar */}
        <div
          className={`workspace-zone workspace-zone-files workspace-zone-frame flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden border-r border-matrix-border`}
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          <FileTreeSidebar
            fileTree={fileTree}
            activeFile={activeFile}
            onSelectFile={setActiveFile}
            onUpdateFile={updateFile}
            onDeleteFile={deleteFile}
            onCreateFile={createNewFile}
            onRenameFile={renameFile}
            onImportZip={runZipImport}
            onImportGithub={runGithubImport}
            isImporting={isImporting}
            projectName={session?.title}
            width={sidebarWidth}
          />
        </div>

        {/* Resize handle */}
        {!sidebarCollapsed && (
          <div
            className="resize-handle flex-shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = sidebarWidth;
              const onMove = (ev: MouseEvent) => {
                const newW = Math.max(200, Math.min(480, startW + ev.clientX - startX));
                setSidebarWidth(newW);
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />
        )}

        {/* Chat panel */}
        <div className="workspace-zone workspace-zone-chat flex-1 min-w-0 flex flex-col overflow-hidden">
          <ChatPanel
  messages={messages}
  activeFile={activeFile}
  fileTree={fileTree}
  sessionId={effectiveSessionId}
  isStreaming={isStreaming}
  activeAgent={activeAgent}
  activityStatus={activityStatus}
  onAddMessage={addMessage}
  onAppendMessageToUI={appendMessageToUI}
  onUpdateLastMessage={updateLastMessage}
  onSetActiveAgent={setActiveAgent}
  onSetIsStreaming={setIsStreaming}
  onSetMemoryStage={setMemoryStage}
  onSetSessionTokens={setSessionTokens}
  onSetActivityStatus={setActivityStatus}
  onAddFile={addFile}
  onUpdateFile={updateFile}
  onDeleteFile={deleteFile}
  onSelectFile={setActiveFile}
  onSaveFinalAssistantMessage={persistAssistantMessage}
  initialPrompt={initialStylePrompt}
/>
          {/* 2026-01 regression fix — workspace-level <FileViewer/>
           *  removed. It was wrapped in `<div className="relative">` with
           *  0 intrinsic height, so its `absolute … h-[60%]` rendered to
           *  a 0×0 box (invisible). The canonical viewer is rendered by
           *  FileTreeSidebar where its absolute positioning falls
           *  through to the viewport (intended bottom-60% overlay). */}
        </div>

        {/* Preview panel — Matrix Coder AI (2026-01).
         *  Opt-in (closed by default). Sits to the right of the chat
         *  column with its own resize handle. Mirrors the file-tree
         *  resize behaviour so the layout feels consistent. */}
        {previewOpen && (
          <>
            <div
              className="resize-handle flex-shrink-0"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startW = previewWidth;
                const onMove = (ev: MouseEvent) => {
                  // Dragging LEFT increases width; dragging RIGHT shrinks it.
                  const newW = Math.max(280, Math.min(900, startW - (ev.clientX - startX)));
                  setPreviewWidth(newW);
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            />
            <div
              className="workspace-zone workspace-zone-preview workspace-zone-frame flex-shrink-0 overflow-hidden"
              style={{ width: previewWidth }}
            >
              <PreviewPanel
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                files={fileTree}
                projectName={session?.title}
              />
            </div>
          </>
        )}
      </div>

      {/* Phase 3 — Terminal/Runtime Panel.
       *  Sits at the bottom of the workspace, collapsible. Streams
       *  live logs from validation, auto-fix, and user-run commands.
       *  Persists collapsed state + height to localStorage.
       */}
      <TerminalPanel />
    </div>
  );
}
