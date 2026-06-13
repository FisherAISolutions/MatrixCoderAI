'use client';
/**
 * Preview Panel — Matrix Coder AI (2026-01).
 *
 * Embedded preview that surfaces whatever HTTP server the WebContainer
 * dev process (e.g. `next dev`, `vite`, `npm run dev`) exposes on its
 * internal port. The URL is delivered via the `server-ready` event
 * which we already register in `webcontainer/manager.ts` — no new
 * backend, no new dependencies.
 *
 * Layout rules:
 *   - The panel is OPT-IN. Closed by default. Toggled from the topbar.
 *   - When open, it lives in a fixed right-side column inside the
 *     workspace flex row (its parent decides the width). The file
 *     tree + chat + editor are untouched.
 *   - Buttons: Refresh (reload iframe), Expand (fullscreen overlay),
 *     Open in new tab, Close.
 *   - No automatic popups. Nothing opens in a new window unless the
 *     user clicks "open in new tab".
 *
 * Inspired by Cursor/Replit/StackBlitz embedded preview panes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ExternalLink,
  RotateCw,
  Maximize2,
  Minimize2,
  X,
  Loader2,
  Play,
  Download,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  subscribeToServerReady,
  getLastPreviewInfo,
  detectWebContainerSupport,
  runCommand,
  type PreviewServerInfo,
} from '@/lib/webcontainer/manager';
import {
  subscribeSandboxStatus,
  type SandboxStatus,
} from '@/lib/webcontainer/sandboxStatus';
import {
  beginPreviewStage,
  completePreviewStage,
  failPreviewStage,
  usePreviewDiagnostics,
  type PreviewDiagnosticRecord,
} from '@/lib/preview/diagnostics';
import { exportProjectAsZip } from '@/lib/zip/zipExport';
import type { FileNode } from './types';
import { pushTerminalLog } from '@/lib/terminal/store';

interface Props {
  /** Controlled visibility from the parent (workspace). */
  open: boolean;
  onClose: () => void;
  /** Current file tree — used by the local-run fallback ZIP download. */
  files?: FileNode[];
  /** Session/project title for the ZIP filename. */
  projectName?: string;
}

function statusSymbol(status: PreviewDiagnosticRecord['status']): string {
  if (status === 'ok') return '✓';
  if (status === 'running') return '...';
  if (status === 'failed') return '×';
  if (status === 'skipped') return '-';
  return '○';
}

function PreviewDiagnosticsReport({
  records,
}: {
  records: PreviewDiagnosticRecord[];
}) {
  const failed = records.find((record) => record.status === 'failed');
  return (
    <div
      className="border-b border-matrix-border bg-matrix-surface px-3 py-2 flex-shrink-0"
      data-testid="preview-diagnostics-report"
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-matrix-green-muted">
        {records.map((record) => (
          <span
            key={record.stage}
            title={[
              `start: ${record.startedAt ?? '-'}`,
              `end: ${record.endedAt ?? '-'}`,
              record.reason ? `reason: ${record.reason}` : '',
            ]
              .filter(Boolean)
              .join('\n')}
            data-testid={`preview-diagnostics-${record.stage}`}
          >
            {record.label} {statusSymbol(record.status)}
          </span>
        ))}
      </div>
      {failed ? (
        <p
          className="mt-1 text-xs font-mono text-matrix-red"
          data-testid="preview-diagnostics-failure"
        >
          Failed at {failed.label}: {failed.reason ?? 'No reason reported.'}
        </p>
      ) : null}
    </div>
  );
}

export default function PreviewPanel({ open, onClose, files, projectName }: Props) {
  const [info, setInfo] = useState<PreviewServerInfo | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sandbox, setSandbox] = useState<SandboxStatus>({ kind: 'ok' });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewConnectionTimerRef = useRef<number | null>(null);
  const diagnostics = usePreviewDiagnostics();

  // 2026-01 quality-upgrade pass — only accept absolute http(s) URLs
  // from WebContainer's `server-ready` event. Relative URLs (`/`,
  // `localhost:3000` without scheme) get resolved against THIS app's
  // origin by the iframe and the preview lands on Matrix Coder AI's
  // 404 page. Filtering at the boundary keeps the panel honest.
  const isValidPreviewUrl = useCallback((u: string | undefined | null): u is string => {
    if (!u) return false;
    return /^https?:\/\//i.test(u);
  }, []);

  // Subscribe once on mount. Cached info is replayed by the subscriber
  // so opening this panel AFTER a dev server has already started will
  // still pick up the URL.
  useEffect(() => {
    const cached = getLastPreviewInfo();
    if (cached && isValidPreviewUrl(cached.url)) {
      setInfo(cached);
      beginPreviewStage('preview-connected', `Preview iframe received cached URL ${cached.url}.`);
    }
    const unsub = subscribeToServerReady((next) => {
      if (!isValidPreviewUrl(next.url)) {
        console.warn('[preview] ignoring non-http server-ready URL:', next.url);
        failPreviewStage(
          'preview-connected',
          `Preview received a non-http server URL: ${next.url || '(empty)'}`
        );
        return;
      }
      beginPreviewStage('preview-connected', `Preview iframe received URL ${next.url}.`);
      setInfo(next);
      // Reset the iframe so it actually loads the new URL.
      setIframeKey((k) => k + 1);
      setIframeLoading(true);
    });
    return () => {
      unsub();
      if (previewConnectionTimerRef.current !== null) {
        window.clearTimeout(previewConnectionTimerRef.current);
        previewConnectionTimerRef.current = null;
      }
    };
  }, [isValidPreviewUrl]);

  useEffect(() => {
    if (!info?.url || !iframeLoading) return;
    if (previewConnectionTimerRef.current !== null) {
      window.clearTimeout(previewConnectionTimerRef.current);
    }
    previewConnectionTimerRef.current = window.setTimeout(() => {
      failPreviewStage(
        'preview-connected',
        `Preview iframe did not finish loading ${info.url} within 30s.`
      );
      previewConnectionTimerRef.current = null;
    }, 30_000);
    return () => {
      if (previewConnectionTimerRef.current !== null) {
        window.clearTimeout(previewConnectionTimerRef.current);
        previewConnectionTimerRef.current = null;
      }
    };
  }, [info?.url, iframeLoading]);

  // Sandbox health — the validation engine publishes env-failure when
  // `npm install` aborts for WebContainer/environment reasons (exit
  // 4294967294, OOM, network). We show a local-run fallback card
  // instead of a blank preview.
  useEffect(() => subscribeSandboxStatus(setSandbox), []);

  const downloadZip = useCallback(async () => {
    if (!files || files.length === 0) {
      toast.error('No project files to export yet.');
      return;
    }
    try {
      const res = await exportProjectAsZip(files, projectName ?? 'matrix-coder-project');
      toast.success(`Downloaded ${res.filename} (${res.fileCount} files)`);
    } catch (err) {
      toast.error(
        `ZIP export failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [files, projectName]);

  const support = typeof window === 'undefined'
    ? { supported: true as const, reason: undefined as string | undefined }
    : detectWebContainerSupport();

  const refresh = useCallback(() => {
    setIframeKey((k) => k + 1);
    setIframeLoading(true);
  }, []);

  const openInNewTab = useCallback(() => {
    if (!info?.url) return;
    window.open(info.url, '_blank', 'noopener,noreferrer');
  }, [info]);

  // One-click "Run dev server" — Matrix Coder AI quality-upgrade pass.
  //
  // The terminal already supports npm/yarn through jsh (see TerminalPanel
  // fix). This button composes the standard "install + dev" recipe into
  // a single background WebContainer process, streams its logs into the
  // shared terminal store, and surfaces the dev URL via the existing
  // `server-ready` subscription. Failure modes (no support, already
  // running, network errors) are toasted explicitly so the user is
  // never left guessing.
  const startDevServer = useCallback(async () => {
    if (starting) return;
    if (!support.supported) {
      failPreviewStage(
        'dev-server',
        support.reason ?? 'WebContainer requires a modern, cross-origin-isolated tab.'
      );
      toast.error(
        `Dev server cannot start: ${support.reason ?? 'WebContainer requires a modern, cross-origin-isolated tab.'}`
      );
      return;
    }
    setStarting(true);
    beginPreviewStage(
      'dev-server',
      'Manual preview launch started: npm install && npm run dev.'
    );
    pushTerminalLog({
      level: 'info',
      text: '[preview] $ npm install && npm run dev\n',
      timestamp: Date.now(),
    });
    try {
      // The standard recipe is install-then-dev. We route through `jsh
      // -c` so the `&&` composition resolves correctly. `runCommand`
      // streams stdout/stderr into the same terminal store the
      // TerminalPanel reads from, so the user sees live progress.
      // We deliberately do NOT await this — `next dev` is a
      // long-running process and would block the button forever. The
      // `server-ready` subscription above picks up the URL when it
      // binds; `starting` resets after a short grace window so the
      // user can re-trigger on failure.
      runCommand('jsh', ['-c', 'npm install && npm run dev'], {
        onLog: (entry) => pushTerminalLog(entry),
      }).catch((err) => {
        failPreviewStage(
          'dev-server',
          err instanceof Error ? err.message : String(err)
        );
        pushTerminalLog({
          level: 'error',
          text: `[preview] dev server failed: ${err instanceof Error ? err.message : String(err)}\n`,
          timestamp: Date.now(),
        });
      });
      // Reset the busy state after a few seconds so the button is
      // usable again if the user wants to retry.
      window.setTimeout(() => setStarting(false), 8000);
    } catch (err) {
      setStarting(false);
      failPreviewStage(
        'dev-server',
        err instanceof Error ? err.message : String(err)
      );
      toast.error(
        `Failed to start dev server: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [starting, support.supported, support.reason]);

  if (!open) return null;

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-matrix-bg border border-matrix-border'
    : 'flex flex-col h-full w-full bg-matrix-bg border-l border-matrix-border';

  return (
    <div className={containerClass} data-testid="preview-panel">
      {/* Header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-matrix-border bg-matrix-surface flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Eye size={13} className="text-matrix-green flex-shrink-0" />
          <span className="text-xs font-mono text-matrix-green tracking-widest uppercase neon-text-glow">
            Preview
          </span>
          <span className="text-matrix-green-muted">·</span>
          {info?.url ? (
            <span
              className="text-xs font-mono text-matrix-green-muted truncate"
              title={info.url}
              data-testid="preview-url-label"
            >
              {info.url.replace(/^https?:\/\//, '')}
            </span>
          ) : (
            <span className="text-xs font-mono text-matrix-green-muted">
              no dev server detected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={refresh}
            disabled={!info?.url}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Refresh preview"
            title="Refresh preview"
            data-testid="preview-refresh-btn"
          >
            <RotateCw size={13} />
          </button>
          <button
            onClick={openInNewTab}
            disabled={!info?.url}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Open preview in new tab"
            title="Open in new tab"
            data-testid="preview-newtab-btn"
          >
            <ExternalLink size={13} />
          </button>
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label={fullscreen ? 'Exit fullscreen' : 'Expand preview'}
            title={fullscreen ? 'Exit fullscreen' : 'Expand'}
            data-testid="preview-fullscreen-btn"
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onClose}
            className="text-matrix-green-muted hover:text-matrix-red transition-colors p-1"
            aria-label="Close preview"
            title="Close preview"
            data-testid="preview-close-btn"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <PreviewDiagnosticsReport records={diagnostics} />

      {/* Body */}
      <div className="flex-1 min-h-0 relative bg-black">
        {!support.supported ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-2">
              <EyeOff size={28} className="mx-auto text-matrix-green-muted" />
              <p className="text-sm font-mono text-matrix-green">
                Preview unavailable in this browser
              </p>
              <p className="text-xs font-mono text-matrix-green-muted leading-relaxed">
                {support.reason ??
                  'WebContainer requires a cross-origin-isolated, modern browser tab.'}
              </p>
            </div>
          </div>
        ) : sandbox.kind === 'env-failure' && !info?.url ? (
          <div
            className="absolute inset-0 flex items-center justify-center p-6 overflow-y-auto"
            data-testid="preview-sandbox-fallback"
          >
            <div className="max-w-md text-center space-y-3">
              <AlertTriangle size={28} className="mx-auto text-matrix-green" />
              <p className="text-sm font-mono text-matrix-green">
                Browser sandbox install failed
              </p>
              <p className="text-xs font-mono text-matrix-green-muted leading-relaxed">
                This may be a WebContainer limitation, not an app code
                failure. Download the project and run npm install locally.
              </p>
              <div className="text-xs font-mono text-matrix-green-muted leading-relaxed text-left bg-matrix-surface border border-matrix-border rounded-sm p-3">
                <p className="mb-2">Run locally:</p>
                <pre className="text-matrix-green">
                  $ npm install{'\n'}$ npm run dev
                </pre>
                <p className="mt-2">
                  Local installs often succeed even when the browser
                  sandbox cannot.
                </p>
              </div>
              <p
                className="text-xs font-mono text-matrix-green-muted opacity-80 leading-relaxed"
                data-testid="preview-sandbox-fallback-reason"
              >
                {sandbox.reason}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={downloadZip}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-matrix-green text-black text-xs font-mono uppercase tracking-widest hover:opacity-90 transition-opacity"
                  data-testid="preview-download-zip-btn"
                >
                  <Download size={12} />
                  Download ZIP
                </button>
                <button
                  onClick={startDevServer}
                  disabled={starting}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-matrix-green text-matrix-green text-xs font-mono uppercase tracking-widest hover:bg-matrix-green-ghost transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="preview-sandbox-retry-btn"
                >
                  {starting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCw size={12} />
                  )}
                  Retry in sandbox
                </button>
              </div>
            </div>
          </div>
        ) : info?.url ? (
          <>
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-xs font-mono text-matrix-green-muted">
                  <Loader2 size={12} className="animate-spin" />
                  loading preview…
                </div>
              </div>
            )}
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={info.url}
              title="Matrix Coder AI preview"
              className="w-full h-full bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              onLoad={() => {
                setIframeLoading(false);
                if (previewConnectionTimerRef.current !== null) {
                  window.clearTimeout(previewConnectionTimerRef.current);
                  previewConnectionTimerRef.current = null;
                }
                completePreviewStage(
                  'preview-connected',
                  `Preview iframe loaded ${info.url}.`
                );
              }}
              onError={() => {
                setIframeLoading(false);
                failPreviewStage(
                  'preview-connected',
                  `Preview iframe failed to load ${info.url}.`
                );
              }}
              data-testid="preview-iframe"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <Eye size={28} className="mx-auto text-matrix-green-muted" />
              <p className="text-sm font-mono text-matrix-green">
                No dev server running yet
              </p>
              <div className="text-xs font-mono text-matrix-green-muted leading-relaxed text-left bg-matrix-surface border border-matrix-border rounded-sm p-3">
                <p className="mb-2">
                  Start a dev server inside the workspace terminal:
                </p>
                <pre className="text-matrix-green">
                  $ npm install{'\n'}$ npm run dev
                </pre>
                <p className="mt-2 text-matrix-green-muted">
                  Once it binds to a port, this panel will load automatically.
                </p>
              </div>
              <button
                onClick={startDevServer}
                disabled={starting}
                className="inline-flex items-center gap-2 px-4 py-2 border border-matrix-green text-matrix-green text-xs font-mono uppercase tracking-widest hover:bg-matrix-green-ghost transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="preview-run-dev-btn"
              >
                {starting ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    <Play size={12} />
                    Run dev server
                  </>
                )}
              </button>
              <p className="text-xs font-mono text-matrix-green-muted opacity-70">
                Streams to the terminal panel below.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
