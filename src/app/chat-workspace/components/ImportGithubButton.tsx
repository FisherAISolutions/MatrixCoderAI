'use client';
/**
 * GitHub import button + modal.
 *
 * Matches the Matrix aesthetic of the rest of the workspace and mirrors
 * the structure of UploadZipButton so the two import flows feel like
 * siblings (small icon-only header button that opens a focused dialog).
 *
 * Public repositories only for now — see PROBLEM_STATEMENT scope. The
 * input accepts any of:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo/tree/<branch>
 *   - owner/repo
 *   - git@github.com:owner/repo.git
 *
 * Submitting hands off to the parent (`onSubmit`) which is wired to the
 * same shared ingestion pipeline used by zip import.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GitBranch, X, Loader2 } from 'lucide-react';

interface Props {
  onSubmit: (repoUrl: string, ref?: string) => Promise<void> | void;
  disabled?: boolean;
}

export default function ImportGithubButton({ onSubmit, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Defer focus to the next tick so the modal is in the DOM first.
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Close on Esc when the modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const reset = useCallback(() => {
    setUrl('');
    setRef('');
    setError(null);
    setSubmitting(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) {
      setError('Repo URL is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(url.trim(), ref.trim() || undefined);
      setOpen(false);
      reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [url, ref, onSubmit, reset]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Import GitHub repository"
        title="Import GitHub repository (public)"
        data-testid="import-github-button"
      >
        <GitBranch size={12} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            // Close when clicking the dimmed backdrop, but not when
            // clicking the modal itself.
            if (e.target === e.currentTarget && !submitting) {
              setOpen(false);
              reset();
            }
          }}
          data-testid="import-github-modal"
        >
          <div className="w-[min(520px,92vw)] bg-matrix-surface border border-matrix-green rounded-sm shadow-neon-input">
            <div className="flex items-center justify-between px-4 py-3 border-b border-matrix-border">
              <div className="flex items-center gap-2 text-matrix-green">
                <GitBranch size={14} />
                <span className="text-xs font-mono tracking-widest uppercase">
                  Import GitHub Repo
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!submitting) {
                    setOpen(false);
                    reset();
                  }
                }}
                disabled={submitting}
                className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1 disabled:opacity-40"
                aria-label="Close"
                data-testid="import-github-close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              <label className="block">
                <span className="block text-[10px] font-mono text-matrix-green-muted uppercase tracking-widest mb-1">
                  Repository URL
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="https://github.com/owner/repo  or  owner/repo"
                  disabled={submitting}
                  className="w-full bg-matrix-bg border border-matrix-border focus:border-matrix-green focus:shadow-neon-input text-xs font-mono text-matrix-green px-2 py-1.5 rounded-sm outline-none placeholder-matrix-green-muted/60 disabled:opacity-50"
                  spellCheck={false}
                  data-testid="import-github-url-input"
                />
              </label>

              <label className="block">
                <span className="block text-[10px] font-mono text-matrix-green-muted uppercase tracking-widest mb-1">
                  Branch <span className="opacity-60 normal-case">(optional — defaults to repo&apos;s default branch)</span>
                </span>
                <input
                  type="text"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="main"
                  disabled={submitting}
                  className="w-full bg-matrix-bg border border-matrix-border focus:border-matrix-green focus:shadow-neon-input text-xs font-mono text-matrix-green px-2 py-1.5 rounded-sm outline-none placeholder-matrix-green-muted/60 disabled:opacity-50"
                  spellCheck={false}
                  data-testid="import-github-ref-input"
                />
              </label>

              <p className="text-[10px] font-mono text-matrix-green-muted leading-relaxed">
                Public repos only. <span className="text-matrix-amber">node_modules</span>, <span className="text-matrix-amber">.git</span>, build outputs and binary assets are ignored automatically.
              </p>

              {error && (
                <div
                  className="text-xs font-mono text-matrix-red border border-matrix-red/40 bg-matrix-red/10 rounded-sm px-2 py-1.5"
                  data-testid="import-github-error"
                >
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-matrix-border">
              <button
                type="button"
                onClick={() => {
                  if (!submitting) {
                    setOpen(false);
                    reset();
                  }
                }}
                disabled={submitting}
                className="text-xs font-mono text-matrix-green-muted hover:text-matrix-green px-3 py-1.5 transition-colors disabled:opacity-40"
                data-testid="import-github-cancel"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !url.trim()}
                className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest bg-matrix-green text-matrix-bg hover:bg-matrix-green-bright px-3 py-1.5 rounded-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                data-testid="import-github-submit"
              >
                {submitting ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Importing
                  </>
                ) : (
                  <>
                    <GitBranch size={12} />
                    Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
