/**
 * Safe UUID generator.
 *
 * Prefers crypto.randomUUID() (available in all modern browsers + Node 19+).
 * Falls back to a Math.random()-based v4-shaped string when unavailable
 * (e.g. older Safari, insecure context).
 *
 * Used to replace the legacy `Date.now() + Math.floor(Math.random()*9999)`
 * scheme which produced duplicate React keys when multiple IDs were created
 * inside the same millisecond (very common in tight loops / setTimeout fans).
 */
export function safeUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore — fall through to Math.random fallback
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Prefixed UUID for human-readable debugging in logs / dev tools.
 * Still collision-safe because the suffix comes from safeUUID().
 */
export function prefixedId(prefix: string): string {
  return `${prefix}-${safeUUID()}`;
}
