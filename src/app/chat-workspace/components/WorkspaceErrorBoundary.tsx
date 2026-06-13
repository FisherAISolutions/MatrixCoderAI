'use client';
/**
 * WorkspaceErrorBoundary — top-level guard for the chat-workspace route.
 *
 * Hardening pass #1.
 *
 * Renders a Matrix-styled fallback UI when any child component throws
 * during render, lifecycle, or constructors. Does NOT catch errors from:
 *   - event handlers (we handle those via toast in handlers themselves)
 *   - async code (handled per-call-site with try/catch + toast)
 *   - server-rendered code (this is a client-only file)
 *
 * Errors are logged to the console with a clear `[WorkspaceErrorBoundary]`
 * prefix so they're easy to find in production logs. The fallback exposes
 * a "Reload workspace" button that calls window.location.reload() — the
 * simplest reliable way to recover from a corrupted React tree.
 */

import React from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class WorkspaceErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[WorkspaceErrorBoundary] caught render error:', error);
    if (errorInfo?.componentStack) {
      console.error('[WorkspaceErrorBoundary] component stack:', errorInfo.componentStack);
    }
    this.setState({ errorInfo });
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    const message = this.state.error.message || 'Unknown error';

    return (
      <div
        className="flex flex-col items-center justify-center h-screen w-screen bg-matrix-bg text-matrix-green font-mono p-6 gap-4"
        data-testid="workspace-error-boundary"
      >
        <div className="flex items-center gap-2 text-matrix-red">
          <AlertOctagon size={20} />
          <span className="text-sm tracking-widest uppercase">// workspace crashed</span>
        </div>

        <div className="max-w-2xl w-full border border-matrix-border bg-matrix-surface rounded-sm p-4 space-y-3">
          <p className="text-xs text-matrix-green-muted">
            A component error stopped the workspace from rendering. Your data on the
            server is safe — this is a UI-layer crash. Reload to recover.
          </p>

          <pre
            className="text-xs text-matrix-amber bg-matrix-bg border border-matrix-border rounded-sm px-3 py-2 overflow-auto max-h-40 whitespace-pre-wrap break-words"
            data-testid="workspace-error-message"
          >
            {message}
          </pre>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-sm bg-matrix-green text-matrix-bg hover:bg-matrix-green-dim transition-all tracking-widest uppercase shadow-neon-sm"
              data-testid="workspace-error-reload-btn"
            >
              <RefreshCw size={12} />
              Reload workspace
            </button>
            <span className="text-xs text-matrix-green-muted">
              // press Ctrl/Cmd+R if this button fails
            </span>
          </div>
        </div>

        <p className="text-xs text-matrix-green-muted opacity-60">
          // full stack written to browser console
        </p>
      </div>
    );
  }
}
