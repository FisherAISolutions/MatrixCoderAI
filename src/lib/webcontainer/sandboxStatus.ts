/**
 * Sandbox status store (June 2026 reliability pass).
 *
 * Tiny module-level pub/sub — same pattern as the terminal store —
 * that lets the validation engine tell the Preview panel "the browser
 * sandbox cannot install/build this project for environment reasons".
 *
 * The Preview panel renders a local-run fallback card (Download ZIP +
 * `npm install` / `npm run dev` instructions) instead of a blank
 * iframe or an endless spinner.
 */

export type SandboxStatus =
  | { kind: 'ok' }
  | {
      kind: 'env-failure';
      /** Human-readable explanation for the user. */
      reason: string;
      /** Classification from classifyInstallFailure. */
      failureKind: string;
    };

let current: SandboxStatus = { kind: 'ok' };
const subscribers = new Set<(s: SandboxStatus) => void>();

export function setSandboxStatus(next: SandboxStatus): void {
  current = next;
  for (const cb of subscribers) {
    try {
      cb(current);
    } catch {
      /* subscriber errors must not break the publisher */
    }
  }
}

export function getSandboxStatus(): SandboxStatus {
  return current;
}

/** Subscribe; the current value is replayed immediately. */
export function subscribeSandboxStatus(
  cb: (s: SandboxStatus) => void
): () => void {
  subscribers.add(cb);
  try {
    cb(current);
  } catch {
    /* swallow */
  }
  return () => {
    subscribers.delete(cb);
  };
}

/** Reset — for tests. */
export function __resetSandboxStatusForTests(): void {
  current = { kind: 'ok' };
  subscribers.clear();
}
