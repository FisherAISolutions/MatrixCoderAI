'use client';
/**
 * Terminal/Runtime panel (Phase 3).
 *
 * Collapsible bottom panel that streams WebContainer logs live.
 * Matrix-styled to match the rest of the workspace. Survives across
 * sessions because the underlying log store is process-global.
 *
 * Design constraints (per problem statement):
 *   - Does NOT replace existing layout — sits at the bottom of the
 *     chat-workspace flex column, collapsible to a 32px header strip.
 *   - Does NOT block UI responsiveness — only the last MAX_RENDER
 *     lines are rendered; older lines remain in the store but aren't
 *     mounted.
 *   - Streams real logs from the running WebContainer (validation +
 *     auto-fix + manual runs). No fake output.
 *
 * What it can do right now:
 *   - Live tail of every line pushed by the validation engine.
 *   - Manual command input: `yarn install`, `yarn build`, `yarn dev`,
 *     `npm test`, any shell command. The command runs inside the same
 *     WebContainer that the auto-fix loop uses, so file edits are
 *     immediately visible.
 *   - Clear log buffer.
 *   - Collapse / expand. Persists state to localStorage.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  TerminalSquare,
  ChevronUp,
  ChevronDown,
  Trash2,
  Play,
  Loader2,
  Square,
  Clipboard,
} from 'lucide-react';
import {
  clearTerminalLogs,
  logToTerminal,
  pushTerminalLog,
  useTerminalLogs,
  type TerminalLine,
} from '@/lib/terminal/store';
import { cleanControlCodes } from '@/lib/terminal/ansi';
import {
  runCommand,
  detectWebContainerSupport,
} from '@/lib/webcontainer/manager';

// Render at most this many lines for perf — older lines stay in the
// store (subject to its own cap) but aren't mounted. The user can
// scroll up to see history once we go down THIS path, but for now
// keeping it simple — most users only care about the latest output.
const MAX_RENDER = 800;

const COLLAPSED_KEY = 'codepilot.terminal.collapsed';
const HEIGHT_KEY = 'codepilot.terminal.height';

// ANSI → tailwind colour class map (very small subset — enough for
// the colours that `tsc`, `next`, and `npm` actually emit).
const ANSI_TO_CLASS: Record<string, string> = {
  '30': 'text-matrix-green-muted',
  '31': 'text-red-400',
  '32': 'text-matrix-green',
  '33': 'text-matrix-amber',
  '34': 'text-matrix-blue',
  '35': 'text-fuchsia-400',
  '36': 'text-cyan-400',
  '37': 'text-matrix-green',
  '90': 'text-matrix-green-muted',
  '91': 'text-red-400',
  '92': 'text-matrix-green',
  '93': 'text-matrix-amber',
  '94': 'text-matrix-blue',
  '95': 'text-fuchsia-400',
  '96': 'text-cyan-400',
  '97': 'text-matrix-green',
};

interface Segment {
  className: string;
  text: string;
}

function tokenizeAnsi(text: string): Segment[] {
  // Strip non-SGR control codes (cursor moves, clears, OSC titles, bell,
  // backspace, CR-based spinner frames). See `@/lib/terminal/ansi`.
  const cleaned = cleanControlCodes(text);
  const segments: Segment[] = [];
  let currentClass = '';
  let lastIndex = 0;
  // SGR-only regex (final char `m`), applied to the already-cleaned text
  // so we never see a stray non-SGR escape here.
  // eslint-disable-next-line no-control-regex
  const SGR_REGEX = /\x1B\[([0-9;]*)m/g;
  let m: RegExpExecArray | null;
  while ((m = SGR_REGEX.exec(cleaned)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ className: currentClass, text: cleaned.slice(lastIndex, m.index) });
    }
    const codes = m[1].split(';').filter(Boolean);
    if (codes.length === 0 || codes.includes('0')) {
      currentClass = '';
    } else {
      for (const code of codes) {
        const cls = ANSI_TO_CLASS[code];
        if (cls) currentClass = cls;
      }
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < cleaned.length) {
    segments.push({ className: currentClass, text: cleaned.slice(lastIndex) });
  }
  return segments;
}

function levelClass(level: TerminalLine['level']): string {
  switch (level) {
    case 'error':
    case 'stderr':
      return 'text-red-400';
    case 'warn':
      return 'text-matrix-amber';
    case 'info':
      return 'text-matrix-blue';
    default:
      return 'text-matrix-green';
  }
}

interface Props {
  /** External toggle (e.g. from a topbar button). When undefined, the
   *  panel manages its own collapsed state. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function TerminalPanel({ collapsed: collapsedProp, onCollapsedChange }: Props) {
  const lines = useTerminalLogs();

  // ----- Collapsed state (controlled OR localStorage-persisted) -----
  // Hydration fix (2026-01) — the initial state MUST match between
  // server and client renders. We seed with the deterministic default
  // (collapsed=false) and load from localStorage in a post-mount
  // effect. Previously the useState initializer read localStorage,
  // which produced "[1G"-style hydration errors on refresh whenever
  // the user had collapsed the terminal in a prior session.
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(COLLAPSED_KEY) === '1') {
      setInternalCollapsed(true);
    }
  }, []);
  const collapsed = collapsedProp ?? internalCollapsed;
  const setCollapsed = useCallback(
    (next: boolean) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      }
      setInternalCollapsed(next);
      onCollapsedChange?.(next);
    },
    [onCollapsedChange]
  );

  // ----- Panel height (resizable; persisted) -----
  // Same hydration concern as `collapsed` — seed with the default and
  // hydrate from localStorage after mount.
  const [height, setHeight] = useState<number>(240);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(HEIGHT_KEY);
    if (!raw) return;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 80) setHeight(n);
  }, []);

  // ----- Auto-scroll to bottom -----
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  useEffect(() => {
    if (!autoScroll || collapsed) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll, collapsed]);

  // ----- Command execution -----
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const activeKill = useRef<(() => void) | null>(null);

  const runUserCommand = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || running) return;

    const support = detectWebContainerSupport();
    if (!support.supported) {
      pushTerminalLog({
        level: 'error',
        text: `[terminal] WebContainer not available: ${support.reason}\n`,
        timestamp: Date.now(),
      });
      return;
    }

    // ---- Command parsing ----
    //
    // WebContainer ships `npm`, `yarn`, `npx`, `pnpm` as Node-script
    // shims that live on the `jsh` PATH but are NOT directly spawnable
    // via `wc.spawn('npm', ...)` in all builds — direct spawn returns
    // exit 127 ("command not found") or the WebContainer internal
    // "abnormal exit" code 4294967294. The reliable path is to compose
    // the command through `jsh -c`, which always resolves these shims.
    //
    // We also still route through `jsh` whenever the user typed any
    // shell metacharacter (&&, ||, |, ;, >, <, *, ?) so command
    // composition works as expected.
    //
    // Direct spawn is preserved for everything else (e.g. `node -v`,
    // `ls`, `cat`) because it skips shell parsing overhead.
    const NEEDS_SHELL = /[&|;<>*?]/;
    const SHIM_COMMANDS = new Set(['npm', 'yarn', 'npx', 'pnpm', 'node']);
    let program: string;
    let args: string[];
    const firstToken = cmd.split(/\s+/)[0] ?? '';
    if (NEEDS_SHELL.test(cmd) || SHIM_COMMANDS.has(firstToken)) {
      program = 'jsh';
      args = ['-c', cmd];
    } else {
      const tokens = (cmd.match(/"[^"]+"|'[^']+'|\S+/g) ?? []).map((t) =>
        t.replace(/^["']|["']$/g, '')
      );
      if (tokens.length === 0) return;
      [program, ...args] = tokens;
    }

    setInput('');
    setHistory((prev) => [cmd, ...prev.filter((item) => item !== cmd)].slice(0, 25));
    setHistoryIndex(null);
    setRunning(true);

    try {
      const result = await runCommand(program, args, {
        onLog: (entry) => pushTerminalLog(entry),
        onProcess: ({ kill }) => {
          activeKill.current = kill;
        },
      });

      // Surface meaningful exit-code messages so the user isn't left
      // staring at opaque numbers like 4294967294 (WebContainer's
      // unsigned -2 "abnormal exit"). Also detect the common case
      // where a Node-script shim (npm/yarn/npx/pnpm) was invoked via
      // direct spawn before the SHIM_COMMANDS fallback added below.
      if (result.infrastructureError) {
        pushTerminalLog({
          level: 'error',
          text: `[terminal] ${result.infrastructureError}\n`,
          timestamp: Date.now(),
        });
      } else if (result.exitCode === 127) {
        pushTerminalLog({
          level: 'error',
          text:
            `[terminal] exit 127 — "${program}" was not found on the WebContainer PATH. ` +
            `If you typed a Node script (npm/yarn/npx/pnpm), it will be routed through ` +
            `jsh automatically on the next run.\n`,
          timestamp: Date.now(),
        });
      } else if (result.exitCode === -2 || result.exitCode === 4294967294) {
        pushTerminalLog({
          level: 'error',
          text:
            `[terminal] exit ${result.exitCode} — the WebContainer process aborted ` +
            `before producing a clean exit code. This usually means an out-of-memory ` +
            `kill, a missing filesystem entry, or the command being unsupported in ` +
            `this browser sandbox. Try a smaller scope (e.g. \`npm install <one-package>\`) ` +
            `or run the command in your local terminal instead.\n`,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      pushTerminalLog({
        level: 'error',
        text: `[terminal] command crashed: ${err instanceof Error ? err.message : String(err)}\n`,
        timestamp: Date.now(),
      });
    } finally {
      setRunning(false);
      activeKill.current = null;
    }
  }, [input, running]);

  const killRunningCommand = useCallback(() => {
    const kill = activeKill.current;
    if (!kill) return;
    pushTerminalLog({
      level: 'warn',
      text: '[terminal] sending SIGTERM…\n',
      timestamp: Date.now(),
    });
    try {
      kill();
    } catch (err) {
      pushTerminalLog({
        level: 'error',
        text: `[terminal] kill failed: ${err instanceof Error ? err.message : String(err)}\n`,
        timestamp: Date.now(),
      });
    }
  }, []);

  const copyLogs = useCallback(async () => {
    const text = lines.map((line) => cleanControlCodes(line.text)).join('');
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      logToTerminal('[terminal] logs copied to clipboard\n', 'info');
    } catch (err) {
      pushTerminalLog({
        level: 'error',
        text: `[terminal] copy failed: ${err instanceof Error ? err.message : String(err)}\n`,
        timestamp: Date.now(),
      });
    }
  }, [lines]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void runUserCommand();
      return;
    }
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const next = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setInput(history[next] ?? '');
      return;
    }
    if (e.key === 'ArrowDown' && history.length > 0) {
      e.preventDefault();
      if (historyIndex === null) return;
      const next = historyIndex - 1;
      if (next < 0) {
        setHistoryIndex(null);
        setInput('');
      } else {
        setHistoryIndex(next);
        setInput(history[next] ?? '');
      }
    }
  };

  // ----- Resize handle -----
  const beginResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = height;
      const onMove = (ev: MouseEvent) => {
        const next = Math.max(120, Math.min(window.innerHeight - 200, startH - (ev.clientY - startY)));
        setHeight(next);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [height]
  );

  // ----- Render only the tail to keep large flood lists snappy -----
  const visible = useMemo<TerminalLine[]>(() => {
    return lines.length > MAX_RENDER ? lines.slice(-MAX_RENDER) : lines;
  }, [lines]);

  const headerSummary = useMemo(() => {
    const errors = lines.filter((l) => l.level === 'error' || l.level === 'stderr').length;
    return `${lines.length} line${lines.length === 1 ? '' : 's'}${errors ? ` · ${errors} error${errors === 1 ? '' : 's'}` : ''}`;
  }, [lines]);

  return (
    <div
      className="flex-shrink-0 border-t border-matrix-border bg-matrix-bg font-mono"
      data-testid="terminal-panel"
      style={{ height: collapsed ? 32 : height }}
    >
      {/* Resize grab strip (only when expanded) */}
      {!collapsed && (
        <div
          onMouseDown={beginResize}
          className="h-1 cursor-row-resize hover:bg-matrix-green-ghost transition-colors"
          aria-label="Resize terminal"
          data-testid="terminal-resize-handle"
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between h-8 px-3 border-b border-matrix-border bg-matrix-surface select-none cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
        data-testid="terminal-header"
      >
        <div className="flex items-center gap-2 text-xs">
          <TerminalSquare size={12} className="text-matrix-green" />
          <span className="tracking-widest uppercase text-matrix-green">Terminal</span>
          <span className="text-matrix-green-muted">·</span>
          <span className="text-matrix-green-muted">{headerSummary}</span>
          {running && (
            <>
              <span className="text-matrix-green-muted">·</span>
              <span className="flex items-center gap-1 text-matrix-amber">
                <Loader2 size={11} className="animate-spin" />
                running
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!collapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void copyLogs();
              }}
              disabled={lines.length === 0}
              className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Copy terminal logs"
              title="Copy logs"
              data-testid="terminal-copy-btn"
            >
              <Clipboard size={12} />
            </button>
          )}
          {!collapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearTerminalLogs();
                logToTerminal('[terminal] log cleared\n', 'info');
              }}
              className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
              aria-label="Clear terminal"
              title="Clear logs"
              data-testid="terminal-clear-btn"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
            aria-label={collapsed ? 'Expand terminal' : 'Collapse terminal'}
            data-testid="terminal-toggle-btn"
          >
            {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Body (only when expanded) */}
      {!collapsed && (
        <>
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
              setAutoScroll(atBottom);
            }}
            className="overflow-auto text-xs leading-5 px-3 py-2 bg-matrix-bg"
            style={{ height: height - 32 - 1 - 32 - 1 /* header + resize + command-row */ }}
            data-testid="terminal-log-body"
          >
            {visible.length === 0 ? (
              <div className="text-matrix-green-muted italic">
                // no output yet — run a command below or trigger a build
                from the chat.
              </div>
            ) : (
              visible.map((line) => {
                const segs = tokenizeAnsi(line.text);
                // BUG FIX (2026-01) — when cleanControlCodes strips a
                // chunk that was ONLY control codes (e.g. `\x1B[1G`,
                // `\x1B[0K`, `\x1B[?25l`, spinner frames), `segs` is
                // empty. The OLD code fell back to rendering the RAW
                // `line.text`, which displayed as `[1G`, `[0K`, etc.
                // because the leading ESC byte is invisible.
                // Now: render NOTHING for fully-stripped chunks so the
                // user doesn't see naked control-code artefacts.
                if (segs.length === 0) return null;
                const lvl = levelClass(line.level);
                return (
                  <div key={line.id} className="whitespace-pre-wrap break-words">
                    {segs.map((s, i) => (
                      <span
                        key={`${line.id}-${i}`}
                        className={s.className || lvl}
                      >
                        {s.text}
                      </span>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Command input row */}
          <div className="flex items-center gap-2 h-8 px-3 border-t border-matrix-border bg-matrix-surface">
            <span className="text-matrix-green-muted text-xs">$</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={running}
              placeholder={
                running
                  ? 'command running…'
                  : 'try: yarn install · yarn build · yarn dev · npm test'
              }
              className="flex-1 bg-transparent text-xs font-mono text-matrix-green placeholder-matrix-green-muted outline-none disabled:opacity-50"
              aria-label="Terminal command input"
              data-testid="terminal-command-input"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              onClick={running ? killRunningCommand : runUserCommand}
              disabled={running ? false : !input.trim()}
              className={`flex items-center gap-1 text-xs ${
                running
                  ? 'text-red-400 hover:text-red-300'
                  : 'text-matrix-green hover:text-matrix-green-bright'
              } disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
              aria-label={running ? 'Kill running command' : 'Run command'}
              title={running ? 'Kill running command' : 'Run command'}
              data-testid={running ? 'terminal-kill-btn' : 'terminal-run-btn'}
            >
              {running ? <Square size={11} /> : <Play size={11} />}
              <span className="tracking-widest uppercase">{running ? 'kill' : 'run'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
