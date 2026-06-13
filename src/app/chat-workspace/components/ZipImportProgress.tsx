'use client';
import { Loader2, FolderUp, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ZipImportProgress as Progress } from '@/lib/zip/zipImport';

export type ImportPhase = 'reading' | 'parsing' | 'saving' | 'done' | 'error';

interface Props {
  visible: boolean;
  phase: ImportPhase;
  progress: Progress | null;
  savedCount?: number;
  totalToSave?: number;
  error?: string | null;
  summary?: string | null;
}

export default function ZipImportProgress({
  visible,
  phase,
  progress,
  savedCount = 0,
  totalToSave = 0,
  error,
  summary,
}: Props) {
  if (!visible) return null;

  const parsePct =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;
  const savePct =
    totalToSave > 0 ? Math.round((savedCount / totalToSave) * 100) : 0;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-72 bg-matrix-card border border-matrix-border rounded-sm shadow-neon-sm p-3 font-mono text-xs"
      data-testid="zip-import-progress"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-2">
        {phase === 'error' && (
          <AlertTriangle size={12} className="text-matrix-red flex-shrink-0" />
        )}
        {phase === 'done' && (
          <CheckCircle2 size={12} className="text-matrix-green flex-shrink-0" />
        )}
        {(phase === 'reading' || phase === 'parsing' || phase === 'saving') && (
          <Loader2 size={12} className="text-matrix-green animate-spin flex-shrink-0" />
        )}
        <span className="tracking-widest uppercase text-matrix-green">
          {phase === 'reading' && 'Reading zip'}
          {phase === 'parsing' && 'Parsing files'}
          {phase === 'saving' && 'Saving to memory'}
          {phase === 'done' && 'Import complete'}
          {phase === 'error' && 'Import failed'}
        </span>
      </div>

      {phase === 'parsing' && progress && (
        <>
          <div className="flex justify-between text-matrix-green-muted mb-1">
            <span>
              {progress.processed}/{progress.total}
            </span>
            <span>{parsePct}%</span>
          </div>
          <div className="w-full h-1 bg-matrix-green-ghost rounded-full overflow-hidden">
            <div
              className="h-full bg-matrix-green transition-all duration-150"
              style={{ width: `${parsePct}%` }}
            />
          </div>
          {progress.currentPath && (
            <div
              className="mt-2 text-matrix-green-muted truncate"
              title={progress.currentPath}
            >
              {progress.currentPath}
            </div>
          )}
        </>
      )}

      {phase === 'saving' && (
        <>
          <div className="flex justify-between text-matrix-green-muted mb-1">
            <span>
              {savedCount}/{totalToSave}
            </span>
            <span>{savePct}%</span>
          </div>
          <div className="w-full h-1 bg-matrix-green-ghost rounded-full overflow-hidden">
            <div
              className="h-full bg-matrix-green transition-all duration-150"
              style={{ width: `${savePct}%` }}
            />
          </div>
        </>
      )}

      {phase === 'done' && summary && (
        <div className="text-matrix-green-muted">{summary}</div>
      )}

      {phase === 'error' && error && (
        <div className="text-matrix-red mt-1 break-words">{error}</div>
      )}
    </div>
  );
}

interface DropOverlayProps {
  visible: boolean;
}

export function ZipDropOverlay({ visible }: DropOverlayProps) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none bg-matrix-bg/70 backdrop-blur-sm flex items-center justify-center"
      data-testid="zip-drop-overlay"
    >
      <div className="border border-matrix-green rounded-sm shadow-neon-md px-8 py-6 flex flex-col items-center gap-3 bg-matrix-card">
        <FolderUp size={32} className="text-matrix-green" />
        <span className="font-mono text-sm tracking-widest uppercase text-matrix-green">
          Drop zip to import project
        </span>
        <span className="font-mono text-xs text-matrix-green-muted">
          A new workspace session will be created
        </span>
      </div>
    </div>
  );
}
