/**
 * SSR-safe localStorage helpers for CodePilot persistence (Milestone B).
 *
 * Responsibilities:
 *   - Active session ID  (single key, global)
 *   - Active file path   (per-session key, scoped)
 *
 * All operations are wrapped in try/catch + typeof window guards so
 *   - server-side rendering / Next.js static build won't crash,
 *   - private browsing modes (where localStorage throws on write) won't crash,
 *   - quota-exceeded errors are silently ignored.
 */

const ACTIVE_SESSION_KEY = 'codepilot:active-session-id';
const ACTIVE_FILE_KEY_PREFIX = 'codepilot:active-file-path:';

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

// ─── Active session ─────────────────────────────────────────────────────────

export function getStoredActiveSessionId(): string | null {
  if (!isClient()) return null;
  try {
    return window.localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStoredActiveSessionId(sessionId: string): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  } catch {
    // ignore quota / private-mode errors
  }
}

export function clearStoredActiveSessionId(): void {
  if (!isClient()) return;
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // ignore
  }
}

// ─── Active file (per session) ──────────────────────────────────────────────

function activeFileKey(sessionId: string): string {
  return `${ACTIVE_FILE_KEY_PREFIX}${sessionId}`;
}

export function getStoredActiveFilePath(sessionId: string): string | null {
  if (!isClient() || !sessionId) return null;
  try {
    return window.localStorage.getItem(activeFileKey(sessionId));
  } catch {
    return null;
  }
}

export function setStoredActiveFilePath(sessionId: string, path: string): void {
  if (!isClient() || !sessionId || !path) return;
  try {
    window.localStorage.setItem(activeFileKey(sessionId), path);
  } catch {
    // ignore
  }
}

export function clearStoredActiveFilePath(sessionId: string): void {
  if (!isClient() || !sessionId) return;
  try {
    window.localStorage.removeItem(activeFileKey(sessionId));
  } catch {
    // ignore
  }
}
