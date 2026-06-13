'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Copy, Check, Download, FileCode, Maximize2, Minimize2, ChevronDown, Save, Trash2, Edit3 } from 'lucide-react';
import { FileNode } from './types';
import { toast } from 'sonner';
import MatrixMonacoEditor from './MatrixMonacoEditor';

interface Props {
  file: FileNode;
  onClose: () => void;
  onUpdate?: (file: FileNode) => void;
  onDelete?: (fileId: string) => void;
  /**
   * Milestone C — lightweight rename.
   * If provided, a pencil icon appears next to the file path. When the
   * user submits a new basename, the parent updates the file in-tree and
   * persists the rename (path + name + parent_path) to the DB.
   * Same-folder renames only — slashes are rejected at the input level.
   */
  onRename?: (file: FileNode, newPath: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FileViewer({ file, onClose, onUpdate, onDelete, onRename }: Props) {
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(file.content || '');

  // 2026-01 usability pass — resizable + minimizable.
  //
  // The viewer now defaults to ~40% viewport height (was 60%) and can be
  // resized by dragging the top edge. Min 18vh (~180px on a 1000px
  // viewport, the spec calls for ≥180px), max 65vh (so the chat below
  // is always reachable). The user can also COLLAPSE the viewer into a
  // 32px-tall bar without losing the active file — clicking restore
  // re-opens at the last resized height.
  //
  // Both view mode AND Monaco edit mode share these controls. Fullscreen
  // bypasses the height state entirely (renders `fixed inset-0`).
  const HEIGHT_KEY = 'matrix-coder:fileviewer-height-pct';
  const MIN_PCT = 18;
  const MAX_PCT = 65;
  const DEFAULT_PCT = 40;
  const [heightPct, setHeightPctState] = useState<number>(DEFAULT_PCT);
  const [minimized, setMinimized] = useState(false);
  // Hydrate persisted height once on mount (avoids SSR/CSR mismatch
  // — same pattern used by TerminalPanel).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(HEIGHT_KEY);
    if (!raw) return;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= MIN_PCT && n <= MAX_PCT) {
      setHeightPctState(n);
    }
  }, []);
  const setHeightPct = useCallback((n: number) => {
    const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, n));
    setHeightPctState(clamped);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HEIGHT_KEY, String(clamped));
    }
  }, []);

  const onResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startPct = heightPct;
      const vh = window.innerHeight;
      const onMove = (ev: MouseEvent) => {
        // Dragging UP increases viewer height. Convert px delta → pct.
        const dy = ev.clientY - startY;
        const next = startPct - (dy / vh) * 100;
        setHeightPct(next);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [heightPct, setHeightPct]
  );

  // Inline rename state (Milestone C)
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(file.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Phase 3: keep the viewer in sync when the file content changes externally
  // (e.g. the AI patched the file we're currently viewing).
  // Only re-sync while NOT editing, so we never blow away in-progress edits.
  // PATCH BUG FIX — also depend on lastModified so successive AI patches
  // to the same file (without an intervening manual edit) reliably push
  // the new content into the editor state.
  useEffect(() => {
    if (!isEditing) {
      console.info(
        `[FileViewer] syncing editContent from prop path=${file.path} ` +
          `size=${(file.content || '').length} lastModified=${file.lastModified ?? '-'}`
      );
      setEditContent(file.content || '');
    }
  }, [file.content, file.id, file.path, file.lastModified, isEditing]);

  // Sync rename draft if the underlying file changes while not renaming.
  useEffect(() => {
    if (!isRenaming) setRenameDraft(file.name);
  }, [file.name, isRenaming]);

  // Auto-focus + select-stem when entering rename mode.
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      const input = renameInputRef.current;
      input.focus();
      // Select just the stem (everything before the last "."), so the
      // user can immediately type a new name without clobbering the ext.
      const dotIdx = input.value.lastIndexOf('.');
      if (dotIdx > 0) input.setSelectionRange(0, dotIdx);
      else input.select();
    }
  }, [isRenaming]);

  const handleCopy = async () => {
    if (!file.content) return;
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const handleSave = useCallback(() => {
    if (!onUpdate) return;
    const updated = { ...file, content: editContent, size: editContent.length };
    onUpdate(updated);
    setIsEditing(false);
    toast.success('File saved');
  }, [editContent, file, onUpdate]);

  const handleDelete = useCallback(() => {
    if (!onDelete) return;
    if (confirm(`Delete ${file.name}?`)) {
      onDelete(file.id);
      onClose();
    }
  }, [file, onDelete, onClose]);

  const handleDownload = () => {
    const content = isEditing ? editContent : file.content;
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Rename helpers ──────────────────────────────────────────────────────
  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameDraft(file.name);
  }, [file.name]);

  const commitRename = useCallback(() => {
    const newName = renameDraft.trim();
    if (!newName || newName === file.name) {
      cancelRename();
      return;
    }
    if (newName.includes('/') || newName.includes('\\')) {
      toast.error('Slashes are not allowed — rename is same-folder only');
      return;
    }
    if (!onRename) {
      cancelRename();
      return;
    }
    const parts = file.path.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');
    onRename(file, newPath);
    setIsRenaming(false);
  }, [renameDraft, file, onRename, cancelRename]);

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  };

  // ----- Minimized collapsed bar -----
  // When the user clicks "minimize", we keep the FileViewer mounted but
  // render only a slim 32px bottom bar — that way the active file is
  // not lost and a single click restores the previous height.
  if (minimized) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-40 h-8 bg-matrix-bg border-t border-matrix-border flex items-center justify-between px-3"
        data-testid="file-viewer-minimized-bar"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCode size={12} className="text-matrix-blue flex-shrink-0" />
          <span
            className="text-xs font-mono text-matrix-green truncate"
            data-testid="file-viewer-minimized-path"
          >
            {file.path}
          </span>
          {isEditing && (
            <span className="text-xs font-mono text-matrix-amber flex-shrink-0">
              · editing
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setMinimized(false)}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label="Restore file viewer"
            title="Restore"
            data-testid="file-viewer-restore-btn"
          >
            <Maximize2 size={12} />
          </button>
          <button
            onClick={() => {
              setMinimized(false);
              setFullscreen(true);
            }}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label="Open fullscreen"
            title="Fullscreen"
            data-testid="file-viewer-min-fullscreen-btn"
          >
            <Maximize2 size={12} />
          </button>
          <button
            onClick={onClose}
            className="text-matrix-green-muted hover:text-matrix-red transition-colors p-1"
            aria-label="Close file viewer"
            title="Close"
            data-testid="file-viewer-min-close-btn"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        fullscreen
          ? 'fixed inset-0 z-50'
          : 'fixed inset-x-0 bottom-0 z-40'
      } bg-matrix-bg border-t border-matrix-border flex flex-col`}
      style={
        fullscreen
          ? undefined
          : {
              height: `${heightPct}vh`,
              minHeight: '180px',
              maxHeight: `${MAX_PCT}vh`,
            }
      }
      data-testid="file-viewer"
    >
      {/* Top-edge resize handle — only in non-fullscreen mode.
       *  3px tall, full width, dotted accent on hover; cursor row-resize. */}
      {!fullscreen && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize file viewer"
          onMouseDown={onResizeStart}
          className="absolute top-0 left-0 right-0 h-1 -mt-0.5 cursor-row-resize bg-matrix-border-bright opacity-0 hover:opacity-60 transition-opacity z-10"
          data-testid="file-viewer-resize-handle"
        />
      )}
      {/* A second, slightly thicker invisible grab strip so the handle
       *  is comfortable to grab (3px is too narrow on most mice). */}
      {!fullscreen && (
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 left-0 right-0 h-2 -mt-1 cursor-row-resize z-10"
          aria-hidden="true"
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-matrix-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode size={13} className="text-matrix-blue flex-shrink-0" />
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              className="bg-matrix-surface border border-matrix-green text-xs font-mono text-matrix-green px-1.5 py-0.5 rounded-sm outline-none shadow-neon-input min-w-0 flex-shrink"
              data-testid="file-rename-input"
              aria-label="New file name"
              spellCheck={false}
            />
          ) : (
            <span className="text-xs font-mono text-matrix-green truncate" data-testid="file-path-label">
              {file.path}
            </span>
          )}
          {onRename && !isRenaming && (
            <button
              onClick={() => {
                setRenameDraft(file.name);
                setIsRenaming(true);
              }}
              className="text-matrix-green-muted hover:text-matrix-green transition-colors p-0.5 flex-shrink-0"
              aria-label="Rename file"
              title="Rename file"
              data-testid="file-rename-btn"
            >
              <Edit3 size={11} />
            </button>
          )}
          {file.size && !isRenaming && (
            <span className="text-xs font-mono text-matrix-green-muted flex-shrink-0">
              {formatBytes(file.size)}
            </span>
          )}
          {file.lastModified && !isRenaming && (
            <span className="text-xs font-mono text-matrix-green-muted flex-shrink-0 hidden sm:inline">
              {formatDate(file.lastModified)}
            </span>
          )}
          {file.isNew && !isRenaming && (
            <span className="text-xs font-mono text-matrix-green bg-matrix-green-ghost px-1.5 py-0.5 rounded-sm flex-shrink-0">
              NEW
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isEditing && (
            <button
              onClick={handleSave}
              className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
              aria-label="Save file"
              title="Save (Ctrl+S)"
              data-testid="file-save-btn"
            >
              <Save size={16} />
            </button>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label="Edit file"
            title={isEditing ? 'Cancel edit' : 'Edit file'}
            data-testid="file-edit-toggle-btn"
          >
            {isEditing ? <X size={16} /> : <FileCode size={16} />}
          </button>
          {onDelete && (
            <button
              onClick={handleDelete}
              className="text-matrix-green-muted hover:text-red-500 transition-colors p-1"
              aria-label="Delete file"
              title="Delete file"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label="Copy file content"
          >
            {copied ? <Check size={13} className="text-matrix-green" /> : <Copy size={13} />}
          </button>
          <button
            onClick={handleDownload}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label="Download file"
          >
            <Download size={13} />
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label="Minimize file viewer"
            title="Minimize"
            data-testid="file-viewer-minimize-btn"
          >
            <ChevronDown size={13} />
          </button>
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label={fullscreen ? 'Exit fullscreen' : 'Toggle fullscreen'}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            data-testid="file-viewer-fullscreen-btn"
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onClose}
            className="text-matrix-green-muted hover:text-matrix-red transition-colors p-1"
            aria-label="Close file viewer"
            data-testid="file-viewer-close-btn"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Code content or editor */}
      <div className="flex-1 overflow-auto">
        {isEditing ? (
          <MatrixMonacoEditor
            value={editContent}
            language={file.language}
            path={file.path}
            onChange={setEditContent}
            onSave={handleSave}
          />
        ) : file.content ? (
          <table className="w-full text-xs font-mono">
            <tbody>
              {(file.content || '').split('\n').map((line, i) => (
                <tr
                  key={`line-${file.id}-${i + 1}`}
                  className="hover:bg-matrix-green-ghost transition-colors group"
                >
                  <td className="select-none text-right pr-4 pl-3 py-0.5 text-matrix-green-muted w-10 border-r border-matrix-green-ghost group-hover:text-matrix-green-muted">
                    {i + 1}
                  </td>
                  <td className="pl-4 pr-4 py-0.5 text-matrix-green whitespace-pre leading-relaxed">
                    {line || ' '}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs font-mono text-matrix-green-muted">No content available</p>
          </div>
        )}
      </div>
    </div>
  );
}
