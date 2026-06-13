/**
 * Terminal log store (Phase 3 — Terminal/Runtime Panel).
 *
 * Process-wide singleton that buffers WebContainer log lines and lets
 * the UI subscribe to live updates. Decoupled from React so the
 * validation engine, auto-fix loop, and any future "run shell command"
 * action can all push without holding a React reference.
 *
 * Design notes:
 *   - Hard cap on the buffer (DEFAULT_MAX_LINES) — log floods from
 *     `npm install` would otherwise OOM the tab.
 *   - Subscriber callback fires AFTER the buffer mutates, so listeners
 *     read the current state on every push.
 *   - `useTerminalLogs()` React hook subscribes safely with cleanup.
 */

import { useEffect, useState } from 'react';
import type { LogEntry, LogLevel } from '@/lib/webcontainer/manager';

const DEFAULT_MAX_LINES = 4000;

export interface TerminalLine extends LogEntry {
  /** Stable id for React keying. */
  id: number;
}

type Listener = (lines: TerminalLine[]) => void;

interface StoreState {
  lines: TerminalLine[];
  listeners: Set<Listener>;
  nextId: number;
  maxLines: number;
}

const state: StoreState = {
  lines: [],
  listeners: new Set(),
  nextId: 1,
  maxLines: DEFAULT_MAX_LINES,
};

function notify() {
  for (const l of state.listeners) {
    try {
      l(state.lines);
    } catch (err) {
      console.warn('[terminal-store] listener threw:', err);
    }
  }
}

/** Push a single LogEntry into the buffer. */
export function pushTerminalLog(entry: LogEntry): void {
  const id = state.nextId++;
  state.lines = [...state.lines, { ...entry, id }];
  if (state.lines.length > state.maxLines) {
    state.lines = state.lines.slice(-state.maxLines);
  }
  notify();
}

/** Push an arbitrary string with a chosen level — convenience helper. */
export function logToTerminal(text: string, level: LogLevel = 'info'): void {
  pushTerminalLog({ level, text: text.endsWith('\n') ? text : text + '\n', timestamp: Date.now() });
}

/** Clear the entire buffer. */
export function clearTerminalLogs(): void {
  state.lines = [];
  notify();
}

/** Current snapshot — for callers that don't want a subscription. */
export function getTerminalLogs(): TerminalLine[] {
  return state.lines;
}

/** Subscribe to live updates. Returns an unsubscribe fn. */
export function subscribeTerminalLogs(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/** React hook — re-renders the consumer on every push. */
export function useTerminalLogs(): TerminalLine[] {
  const [lines, setLines] = useState<TerminalLine[]>(state.lines);
  useEffect(() => {
    return subscribeTerminalLogs(setLines);
  }, []);
  return lines;
}
