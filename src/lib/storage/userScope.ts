export const MATRIX_ACTIVE_USER_SCOPE_KEY = 'matrix-coder:active-user-scope';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>;

function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getActiveStorageUserId(
  storage: ReadableStorage | null = browserLocalStorage()
): string | undefined {
  const fallbackStorage = browserLocalStorage();
  if (!storage && !fallbackStorage) return undefined;
  try {
    const value = storage?.getItem(MATRIX_ACTIVE_USER_SCOPE_KEY)?.trim();
    if (value) return value;
    if (fallbackStorage && fallbackStorage !== storage) {
      return (
        fallbackStorage.getItem(MATRIX_ACTIVE_USER_SCOPE_KEY)?.trim() ||
        undefined
      );
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function setActiveStorageUserId(
  userId: string,
  storage: WritableStorage | null = browserLocalStorage()
): void {
  const value = userId.trim();
  if (!storage || !value) return;
  try {
    storage.setItem(MATRIX_ACTIVE_USER_SCOPE_KEY, value);
  } catch {
    // A failed scope write must not crash authentication.
  }
}

export function clearActiveStorageUserId(
  storage: WritableStorage | null = browserLocalStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(MATRIX_ACTIVE_USER_SCOPE_KEY);
  } catch {
    // Best-effort cleanup for unavailable browser storage.
  }
}

export function getUserScopedStorageKey(
  baseKey: string,
  userId?: string,
  storage?: ReadableStorage | null
): string {
  const scope = userId?.trim() || getActiveStorageUserId(storage);
  return scope
    ? `${baseKey}:user:${encodeURIComponent(scope)}`
    : baseKey;
}
