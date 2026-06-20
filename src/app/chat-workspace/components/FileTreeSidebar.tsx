'use client';
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  FileJson,
  FileText,
  File,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  Download,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { FileNode, FileLanguage } from './types';
import FileViewer from './FileViewer';
import UploadZipButton from './UploadZipButton';
import ImportGithubButton from './ImportGithubButton';
import { exportProjectAsZip } from '@/lib/zip/zipExport';

interface Props {
  fileTree: FileNode[];
  activeFile: FileNode | null;
  onSelectFile: (file: FileNode) => void;
  onUpdateFile?: (file: FileNode) => void;
  onDeleteFile?: (fileId: string) => void;
  onCreateFile?: (name: string) => void;
  onRenameFile?: (file: FileNode, newPath: string) => void;
  onImportZip?: (file: File) => void;
  /**
   * Secondary feature — GitHub repo import. Delegates the actual fetch
   * + ingestion to the parent (ChatWorkspacePage.runGithubImport) so the
   * existing import-progress UI is reused unchanged.
   */
  onImportGithub?: (repoUrl: string, ref?: string) => Promise<void>;
  isImporting?: boolean;
  /** Display name used to derive the downloaded zip's filename. */
  projectName?: string;
  width: number;
}

const LANG_COLORS: Record<FileLanguage, string> = {
  typescript: 'text-matrix-blue',
  javascript: 'text-matrix-amber',
  python: 'text-matrix-green',
  css: 'text-[#f472b6]',
  html: 'text-matrix-amber',
  json: 'text-matrix-green-muted',
  markdown: 'text-matrix-green-muted',
  bash: 'text-matrix-green',
  sql: 'text-matrix-blue',
  yaml: 'text-matrix-amber',
  unknown: 'text-matrix-green-muted',
};

const LANG_EXT_MAP: Record<string, FileLanguage> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', css: 'css', html: 'html', json: 'json',
  md: 'markdown', sh: 'bash', sql: 'sql', yaml: 'yaml', yml: 'yaml',
};

function getLanguage(filename: string): FileLanguage {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANG_EXT_MAP[ext] ?? 'unknown';
}

function getLangLabel(lang: FileLanguage): string {
  const MAP: Record<FileLanguage, string> = {
    typescript: 'TS', javascript: 'JS', python: 'PY', css: 'CSS',
    html: 'HTML', json: 'JSON', markdown: 'MD', bash: 'SH',
    sql: 'SQL', yaml: 'YML', unknown: '?',
  };
  return MAP[lang];
}

function buildNestedFileTree(nodes: FileNode[]): FileNode[] {
  const hasFolders = nodes.some((node) => node.type === 'folder');
  if (hasFolders) return nodes;

  const root: FileNode[] = [];
  const folderMap = new Map<string, FileNode>();

  nodes.forEach((node) => {
    if (node.type !== 'file' || !node.path.includes('/')) {
      root.push(node);
      return;
    }

    const parts = node.path.split('/');
    let currentChildren = root;
    let currentPath = '';

    parts.slice(0, -1).forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let folder = folderMap.get(currentPath);

      if (!folder) {
        folder = {
          id: currentPath.replace(/\//g, '-'),
          name: part,
          path: currentPath,
          type: 'folder',
          parentPath: currentPath.split('/').slice(0, -1).join('/') || undefined,
          children: [],
        };
        folderMap.set(currentPath, folder);
        currentChildren.push(folder);
      }

      if (!folder.children) folder.children = [];
      currentChildren = folder.children;
    });

    currentChildren.push({
      ...node,
      name: parts[parts.length - 1],
      parentPath: parts.slice(0, -1).join('/'),
    });
  });

  return root;
}

function FileIcon({ language }: { language?: FileLanguage }) {
  if (language === 'typescript' || language === 'javascript') return <FileCode size={13} />;
  if (language === 'json') return <FileJson size={13} />;
  if (language === 'markdown') return <FileText size={13} />;
  return <File size={13} />;
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  activeFileId: string | null;
  onSelectFile: (file: FileNode) => void;
  onDeleteFile?: (fileId: string) => void;
}

function TreeNode({ node, depth, activeFileId, onSelectFile, onDeleteFile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const lang = node.language ?? (node.type === 'file' ? getLanguage(node.name) : undefined);
  const isActive = node.id === activeFileId;

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`file-tree-item w-full flex items-center gap-1.5 py-1 pr-2 text-xs font-mono transition-colors cursor-pointer`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {expanded ? (
            <ChevronDown size={11} className="text-matrix-green-muted flex-shrink-0" />
          ) : (
            <ChevronRight size={11} className="text-matrix-green-muted flex-shrink-0" />
          )}
          {expanded ? (
            <FolderOpen size={13} className="text-matrix-amber flex-shrink-0" />
          ) : (
            <Folder size={13} className="text-matrix-amber flex-shrink-0" />
          )}
          <span className="text-matrix-green-muted truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                onSelectFile={onSelectFile}
                onDeleteFile={onDeleteFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile({ ...node, language: lang })}
      className={`file-tree-item w-full flex items-center gap-1.5 py-1 pr-2 text-xs font-mono transition-colors cursor-pointer ${
        isActive ? 'active' : ''
      }`}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <span className="w-3 flex-shrink-0" />
      <span className={`flex-shrink-0 ${lang ? LANG_COLORS[lang] : 'text-matrix-green-muted'}`}>
        <FileIcon language={lang} />
      </span>
      <span className={`truncate flex-1 text-left ${isActive ? 'text-matrix-green' : 'text-matrix-green-muted hover:text-matrix-green'}`}>
        {node.name}
      </span>
      {node.isNew && (
        <span className="flex-shrink-0 flex items-center gap-0.5 text-matrix-green text-xs">
          <Sparkles size={9} />
        </span>
      )}
      {onDeleteFile && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteFile(node.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onDeleteFile(node.id);
            }
          }}
          className="flex-shrink-0 text-matrix-green-muted hover:text-matrix-red transition-colors p-0.5"
          aria-label={`Delete ${node.name}`}
          title={`Delete ${node.name}`}
        >
          <Trash2 size={12} />
        </span>
      )}
      {lang && (
        <span className={`flex-shrink-0 text-xs font-mono ${LANG_COLORS[lang]} opacity-60`}>
          {getLangLabel(lang)}
        </span>
      )}
    </button>
  );
}

function countFiles(nodes: FileNode[]): number {
  return nodes.reduce((acc, n) => {
    if (n.type === 'file') return acc + 1;
    return acc + countFiles(n.children ?? []);
  }, 0);
}

export default function FileTreeSidebar({ fileTree, activeFile, onSelectFile, onUpdateFile, onDeleteFile, onCreateFile, onRenameFile, onImportZip, onImportGithub, isImporting, projectName, width }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewedFile, setViewedFile] = useState<FileNode | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Milestone C — inline "new file" mini-input toggled by the `+` button.
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileDraft, setNewFileDraft] = useState('');
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const displayTree = buildNestedFileTree(fileTree);
  const totalFiles = countFiles(displayTree);

  useEffect(() => {
    if (isCreatingFile) newFileInputRef.current?.focus();
  }, [isCreatingFile]);

  // 2026-01 regression fix — restored. The previous "consolidation" pass
  // removed THIS FileViewer because the workspace-level one was assumed
  // to be the canonical render. In fact the workspace-level one is
  // wrapped in a `<div className="relative">` with 0 intrinsic height,
  // so its `absolute inset-x-0 bottom-0 h-[60%]` styling rendered into
  // a 0×0 box (invisible). The viewport-bottom overlay you see when
  // clicking a file ALWAYS came from this in-sidebar instance, which
  // has no positioned ancestor and therefore docks to the viewport.
  // Restoring it cleanly restores the open/edit/Monaco workflow.

  // Keep the sidebar's local <FileViewer/> bound state in sync with the
  // canonical `activeFile` whenever it points to the same underlying
  // file. Without this, AI-applied SEARCH/REPLACE patches updated
  // `activeFile` and the tree, but the FileViewer still showed the
  // stale `viewedFile` captured at click-time. Match on id OR path so
  // renames + patches both work.
  useEffect(() => {
    if (!viewerOpen || !viewedFile || !activeFile) return;
    const samePath = viewedFile.path === activeFile.path;
    const sameId = viewedFile.id === activeFile.id;
    if (samePath || sameId) {
      if (
        viewedFile.content !== activeFile.content ||
        viewedFile.lastModified !== activeFile.lastModified ||
        viewedFile.name !== activeFile.name ||
        viewedFile.path !== activeFile.path
      ) {
        console.info(
          `[FileTreeSidebar] re-syncing viewedFile from activeFile path=${activeFile.path}`
        );
        setViewedFile(activeFile);
      }
    }
  }, [activeFile, viewerOpen, viewedFile]);

  const handleSelect = (file: FileNode) => {
    onSelectFile(file);
    setViewedFile(file);
    setViewerOpen(true);
  };

  const submitNewFile = () => {
    const name = newFileDraft.trim();
    if (!name) {
      setIsCreatingFile(false);
      return;
    }
    onCreateFile?.(name);
    setNewFileDraft('');
    setIsCreatingFile(false);
  };

  const cancelNewFile = () => {
    setNewFileDraft('');
    setIsCreatingFile(false);
  };

  const handleDownloadZip = async () => {
    if (isExporting) return;
    if (totalFiles === 0) {
      toast.error('No files to download — import a project first');
      return;
    }
    setIsExporting(true);
    const loadingId = toast.loading(`Packaging ${totalFiles} file${totalFiles === 1 ? '' : 's'}…`);
    try {
      const result = await exportProjectAsZip(fileTree, projectName ?? 'codepilot-export');
      toast.dismiss(loadingId);
      const kb = Math.max(1, Math.round(result.byteSize / 1024));
      toast.success(`Downloaded ${result.filename} (${result.fileCount} files, ${kb} KB)`);
    } catch (err) {
      toast.dismiss(loadingId);
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ZipExport] failed:', err);
      toast.error(`Zip export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="workspace-file-tree flex flex-col h-full bg-matrix-bg" style={{ width }}>
      {/* Header */}
      <div className="workspace-zone-header flex items-center justify-between px-3 py-2 border-b border-matrix-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-matrix-green-muted tracking-widest uppercase">
            Files
          </span>
          <span className="workspace-status-badge text-xs font-mono px-1.5 py-0.5 rounded-sm">
            {totalFiles}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onImportZip && (
            <UploadZipButton onFileSelected={onImportZip} disabled={isImporting} />
          )}
          {onImportGithub && (
            <ImportGithubButton
              onSubmit={(repoUrl, ref) => onImportGithub(repoUrl, ref)}
              disabled={isImporting}
            />
          )}
          <button
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label="Refresh file tree"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={handleDownloadZip}
            disabled={isExporting || totalFiles === 0}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Download all files as zip"
            title={totalFiles === 0 ? 'No files to download' : `Download ${totalFiles} file${totalFiles === 1 ? '' : 's'} as .zip`}
            data-testid="download-zip-btn"
          >
            <Download size={12} className={isExporting ? 'animate-pulse' : ''} />
          </button>
          <button
            onClick={() => {
              if (isCreatingFile) cancelNewFile();
              else setIsCreatingFile(true);
            }}
            className={`transition-colors p-1 ${
              isCreatingFile
                ? 'text-matrix-green'
                : 'text-matrix-green-muted hover:text-matrix-green'
            }`}
            aria-label="New file"
            title="New file"
            data-testid="new-file-btn"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Inline new-file mini-input (toggled by the + button above). */}
      {isCreatingFile && (
        <div
          className="workspace-zone-header flex items-center gap-1.5 px-3 py-1.5 border-b border-matrix-border bg-matrix-surface flex-shrink-0"
          data-testid="new-file-row"
        >
          <FileCode size={11} className="text-matrix-green-muted flex-shrink-0" />
          <input
            ref={newFileInputRef}
            type="text"
            value={newFileDraft}
            placeholder="filename.ts"
            onChange={(e) => setNewFileDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitNewFile();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelNewFile();
              }
            }}
            onBlur={submitNewFile}
            className="flex-1 min-w-0 bg-transparent border border-matrix-green text-xs font-mono text-matrix-green px-1.5 py-0.5 rounded-sm outline-none shadow-neon-input placeholder-matrix-green-muted"
            data-testid="new-file-input"
            aria-label="New file name"
            spellCheck={false}
          />
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {displayTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-4">
            <FileCode size={24} className="text-matrix-green-muted opacity-40" />
            <p className="text-xs font-mono text-matrix-green-muted text-center">
              No files yet. Ask the Coding Agent to generate your project.
            </p>
          </div>
        ) : (
          displayTree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              activeFileId={activeFile?.id ?? null}
              onSelectFile={handleSelect}
              onDeleteFile={onDeleteFile}
            />
          ))
        )}
      </div>

      {/* File viewer overlay — viewport-bottom docked (no positioned
       *  ancestor here, so its `absolute inset-x-0 bottom-0 h-[60%]`
       *  resolves against the viewport). This is the canonical viewer
       *  for the workspace; ChatWorkspacePage no longer renders its
       *  own duplicate (which was always broken in a 0-height
       *  wrapper). */}
      {viewerOpen && viewedFile && (
        <FileViewer
          file={viewedFile}
          onClose={() => setViewerOpen(false)}
          onUpdate={onUpdateFile}
          onDelete={onDeleteFile}
          onRename={onRenameFile}
        />
      )}
    </div>
  );
}
