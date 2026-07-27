'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
  useCallback,
} from 'react';
import { User } from '@supabase/supabase-js';
import {
  supabase,
  getCurrentUser,
  getCurrentAuthSession,
  signUpUser,
  signInUser,
  signOutUser,
  getUserSessions,
  createSession,
  renameSession,
  deleteSessionCascade,
} from '@/lib/supabase';
import {
  resolveAuthenticatedUser,
  resolveSignUpOutcome,
  type AuthActionResult,
  type AuthStatus,
} from '@/lib/auth/authFlow';
import {
  getStoredActiveSessionId,
  setStoredActiveSessionId,
  clearStoredActiveSessionId,
  clearStoredActiveFilePath,
} from '@/lib/storage/persistence';
import { logToTerminal } from '@/lib/terminal/store';
import {
  clearActiveStorageUserId,
  getUserScopedStorageKey,
  setActiveStorageUserId,
} from '@/lib/storage/userScope';

const ARCHIVED_WORKSPACES_KEY = 'matrix-coder:archived-workspace-ids';
const AUTH_OPERATION_TIMEOUT_MS = 15000;
const SESSION_OPERATION_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function sanitizeAuthenticationError(
  error: unknown,
  fallback = 'Authentication could not be completed.'
): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/invalid login credentials/i.test(message)) {
    return 'The email or password is incorrect.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Confirm your email address before signing in.';
  }
  if (/timed out|fetch failed|network|offline/i.test(message)) {
    return 'Authentication service is temporarily unavailable. Please try again.';
  }
  if (/already registered|user already exists/i.test(message)) {
    return 'An account already exists for this email address.';
  }
  if (/jwt|token|refresh|session.*expired/i.test(message)) {
    return 'Your session expired. Please sign in again.';
  }
  return fallback;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  authStatus: AuthStatus;
  verificationEmail: string | null;
  session: Session | null;
  sessions: Session[];
  archivedWorkspaceIds: string[];
  error: string | null;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  createNewSession: (title: string) => Promise<Session>;
  renameWorkspace: (sessionId: string, title: string) => Promise<void>;
  archiveWorkspace: (sessionId: string) => Promise<void>;
  restoreWorkspace: (sessionId: string) => Promise<void>;
  deleteWorkspace: (sessionId: string) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  retryWorkspaceRestoration: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('restoring');
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [archivedWorkspaceIds, setArchivedWorkspaceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const authEpochRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const verificationEmailRef = useRef<string | null>(null);

  const persistArchivedWorkspaceIds = useCallback((ids: string[], ownerId?: string) => {
    const unique = Array.from(new Set(ids));
    setArchivedWorkspaceIds(unique);
    const scopedOwner = ownerId ?? activeUserIdRef.current ?? undefined;
    if (typeof window !== 'undefined' && scopedOwner) {
      window.localStorage.setItem(
        getUserScopedStorageKey(
          ARCHIVED_WORKSPACES_KEY,
          scopedOwner,
          window.localStorage
        ),
        JSON.stringify(unique)
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user?.id) {
      setArchivedWorkspaceIds([]);
      return;
    }
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(
          getUserScopedStorageKey(
            ARCHIVED_WORKSPACES_KEY,
            user.id,
            window.localStorage
          )
        ) ?? '[]'
      );
      if (Array.isArray(parsed)) {
        setArchivedWorkspaceIds(parsed.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      setArchivedWorkspaceIds([]);
    }
  }, [user?.id]);

  /**
   * Set the active session AND persist its ID to localStorage so the
   * choice survives a refresh. Pass `null` to clear (e.g. on sign-out).
   * (Milestone B — session persistence.)
   */
  const persistAndSetSession = useCallback((s: Session | null, ownerId?: string) => {
    setSession(s);
    const scopedOwner = ownerId ?? activeUserIdRef.current ?? undefined;
    if (s?.id) {
      setStoredActiveSessionId(s.id, scopedOwner);
    } else if (scopedOwner) {
      clearStoredActiveSessionId(scopedOwner);
    }
  }, []);

  /**
   * Pick which session to make active after a fresh load:
   *   1. The one whose ID is stored in localStorage (if still valid).
   *   2. Otherwise the first one returned by the backend.
   */
  const pickRestoredSession = (
    userSessions: Session[],
    ownerId?: string
  ): Session | null => {
    if (userSessions.length === 0) return null;
    const storedId = getStoredActiveSessionId(ownerId);
    if (storedId) {
      const found = userSessions.find((s) => s.id === storedId);
      if (found) return found;
    }
    return userSessions[0];
  };

  const createLocalWorkspaceSession = useCallback((title = 'Local Workspace'): Session => {
    const now = new Date().toISOString();
    return {
      id: `demo-session-${Date.now()}`,
      title,
      created_at: now,
      updated_at: now,
    };
  }, []);

  const useLocalWorkspaceFallback = useCallback(
    (reason: unknown, title = 'Local Workspace') => {
      const message = sanitizeAuthenticationError(
        reason,
        'Cloud workspaces are temporarily unavailable.'
      );
      console.warn('Workspace session fallback:', message);
      logToTerminal('[auth] using user-scoped local-only workspace fallback', 'warn');
      const localSession = createLocalWorkspaceSession(`${title} (local-only)`);
      persistAndSetSession(localSession, activeUserIdRef.current ?? undefined);
      setSessions([localSession]);
      setError(`${message} Changes will remain local until cloud sync returns.`);
      setAuthStatus('recoverable-error');
      return localSession;
    },
    [createLocalWorkspaceSession, persistAndSetSession]
  );

  const restoreUserWorkspace = useCallback(
    async (authUser: User, source: string, epoch = authEpochRef.current) => {
      const isCurrent = () =>
        epoch === authEpochRef.current &&
        activeUserIdRef.current === authUser.id;
      try {
        console.log(`Loading workspaces from ${source}.`);
        const userSessions = await withTimeout(
          getUserSessions(authUser.id),
          SESSION_OPERATION_TIMEOUT_MS,
          'Loading workspaces'
        );
        if (!isCurrent()) return;
        setSessions(userSessions);

        if (userSessions.length > 0) {
          persistAndSetSession(
            pickRestoredSession(userSessions, authUser.id),
            authUser.id
          );
          setAuthStatus('authenticated');
          return 'cloud' as const;
        }

        try {
          const newSession = await withTimeout(
            createSession(authUser.id, 'Main Workspace'),
            SESSION_OPERATION_TIMEOUT_MS,
            'Creating workspace'
          );
          if (!isCurrent()) return;
          persistAndSetSession(newSession, authUser.id);
          setSessions([newSession]);
          setAuthStatus('authenticated');
          return 'cloud' as const;
        } catch (createErr) {
          if (isCurrent()) {
            useLocalWorkspaceFallback(createErr, 'Main Workspace');
            return 'local-fallback' as const;
          }
        }
      } catch (loadErr) {
        if (isCurrent()) {
          useLocalWorkspaceFallback(loadErr, 'Main Workspace');
          return 'local-fallback' as const;
        }
      }
      return 'stale' as const;
    },
    [persistAndSetSession, useLocalWorkspaceFallback]
  );

  // Initialize auth on mount
  useEffect(() => {
    let disposed = false;
    const initAuth = async () => {
      const epoch = ++authEpochRef.current;
      try {
        // Get current user
        const currentUser = await withTimeout(
          getCurrentUser(),
          AUTH_OPERATION_TIMEOUT_MS,
          'Restoring auth session'
        );
        if (disposed || epoch !== authEpochRef.current) return;
        console.log('Auth session restore completed.');
        activeUserIdRef.current = currentUser?.id ?? null;
        if (currentUser) setActiveStorageUserId(currentUser.id);
        else clearActiveStorageUserId();
        setUser(currentUser ?? null);

        if (currentUser) {
          setAuthStatus('restoring');
          await restoreUserWorkspace(currentUser, 'initial-auth', epoch);
        } else {
          setAuthStatus('unauthenticated');
        }
      } catch (err) {
        if (disposed || epoch !== authEpochRef.current) return;
        activeUserIdRef.current = null;
        clearActiveStorageUserId();
        setUser(null);
        setSessions([]);
        setSession(null);
        setError(sanitizeAuthenticationError(err));
        setAuthStatus('unauthenticated');
      } finally {
        if (!disposed && epoch === authEpochRef.current) setIsLoading(false);
      }
    };

    initAuth();

    if (!supabase) {
      return;
    }

    // Set up auth state listener. Supabase warns against awaiting more
    // Supabase calls inside this callback, so defer workspace restoration.
    const pendingAuthTimers = new Set<ReturnType<typeof setTimeout>>();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (authSession?.user) {
        const epoch = ++authEpochRef.current;
        activeUserIdRef.current = authSession.user.id;
        setActiveStorageUserId(authSession.user.id);
        setUser(authSession.user);
        setError(null);
        setVerificationEmail(null);
        setAuthStatus('restoring');
        const timer = setTimeout(() => {
          pendingAuthTimers.delete(timer);
          if (disposed) return;
          void restoreUserWorkspace(authSession.user, 'auth-state', epoch).catch((err) => {
            if (!disposed && epoch === authEpochRef.current) {
              useLocalWorkspaceFallback(err, 'Main Workspace');
            }
          });
        }, 0);
        pendingAuthTimers.add(timer);
      } else {
        const previousUserId = activeUserIdRef.current ?? undefined;
        authEpochRef.current += 1;
        activeUserIdRef.current = null;
        setUser(null);
        persistAndSetSession(null, previousUserId);
        setSessions([]);
        setArchivedWorkspaceIds([]);
        clearActiveStorageUserId();
        setAuthStatus(
          verificationEmailRef.current
            ? 'verification-required'
            : 'unauthenticated'
        );
        setIsLoading(false);
      }
    });

    return () => {
      disposed = true;
      authEpochRef.current += 1;
      for (const timer of pendingAuthTimers) clearTimeout(timer);
      pendingAuthTimers.clear();
      authListener?.subscription.unsubscribe();
    };
  }, [persistAndSetSession, restoreUserWorkspace, useLocalWorkspaceFallback]);

  const signUp = async (
    email: string,
    password: string
  ): Promise<AuthActionResult> => {
    try {
      setError(null);
      verificationEmailRef.current = null;
      setVerificationEmail(null);
      const signUpData = await withTimeout(
        signUpUser(email, password),
        AUTH_OPERATION_TIMEOUT_MS,
        'Sign up'
      );
      const outcome = resolveSignUpOutcome({
        user: signUpData.user,
        session: signUpData.session,
        email,
      });
      if (outcome.status === 'verification-required') {
        const previousUserId = activeUserIdRef.current ?? undefined;
        authEpochRef.current += 1;
        activeUserIdRef.current = null;
        clearActiveStorageUserId();
        setUser(null);
        setSessions([]);
        persistAndSetSession(null, previousUserId);
        setVerificationEmail(email);
        verificationEmailRef.current = email;
        setAuthStatus('verification-required');
        setIsLoading(false);
        return outcome;
      }

      if (signUpData.user) {
        const epoch = ++authEpochRef.current;
        activeUserIdRef.current = signUpData.user.id;
        setActiveStorageUserId(signUpData.user.id);
        setUser(signUpData.user);
        setAuthStatus('restoring');
        const restoreResult = await restoreUserWorkspace(
          signUpData.user,
          'sign-up',
          epoch
        );
        return {
          status:
            restoreResult === 'local-fallback'
              ? 'recoverable-error'
              : 'authenticated',
        };
      }
      return outcome;
    } catch (err) {
      const message = sanitizeAuthenticationError(err, 'Sign up failed.');
      setError(message);
      throw err;
    }
  };

  const signIn = async (
    email: string,
    password: string
  ): Promise<AuthActionResult> => {
    try {
      setError(null);
      verificationEmailRef.current = null;
      setVerificationEmail(null);
      const signInData = await withTimeout(
        signInUser(email, password),
        AUTH_OPERATION_TIMEOUT_MS,
        'Sign in'
      );
      const currentAuthSession = await withTimeout(
        getCurrentAuthSession(),
        AUTH_OPERATION_TIMEOUT_MS,
        'Verifying sign in'
      );
      const authUser = resolveAuthenticatedUser({
        returnedUser: signInData.user,
        currentSession: currentAuthSession,
      });
      if (authUser) {
        const epoch = ++authEpochRef.current;
        activeUserIdRef.current = authUser.id;
        setActiveStorageUserId(authUser.id);
        setUser(authUser);
        setAuthStatus('restoring');
        const restoreResult = await restoreUserWorkspace(
          authUser,
          'sign-in',
          epoch
        );
        return {
          status:
            restoreResult === 'local-fallback'
              ? 'recoverable-error'
              : 'authenticated',
        };
      }
      return { status: 'authenticated' };
    } catch (err) {
      const message = sanitizeAuthenticationError(err, 'Sign in failed.');
      setError(message);
      throw err;
    }
  };

  const signOut = async () => {
    const previousUserId = activeUserIdRef.current ?? undefined;
    authEpochRef.current += 1;
    try {
      setError(null);
      await signOutUser();
    } catch (err) {
      setError(
        sanitizeAuthenticationError(
          err,
          'Signed out locally. The remote session could not be confirmed.'
        )
      );
    } finally {
      activeUserIdRef.current = null;
      setUser(null);
      persistAndSetSession(null, previousUserId);
      setSessions([]);
      setArchivedWorkspaceIds([]);
      clearActiveStorageUserId();
      setVerificationEmail(null);
      verificationEmailRef.current = null;
      setAuthStatus('unauthenticated');
      setIsLoading(false);
    }
  };

  const retryWorkspaceRestoration = useCallback(async () => {
    if (!user) return;
    const epoch = ++authEpochRef.current;
    setError(null);
    setAuthStatus('restoring');
    await restoreUserWorkspace(user, 'manual-retry', epoch);
  }, [restoreUserWorkspace, user]);

  const createNewSession = async (title: string): Promise<Session> => {
    if (!user) throw new Error('Not authenticated');
    try {
      logToTerminal(`[workspace] create start title="${title}"`);
      const newSession = await createSession(user.id, title);
      setSessions((prev) => [newSession, ...prev]);
      persistAndSetSession(newSession);
      logToTerminal(`[workspace] create ok id=${newSession.id} title="${newSession.title}"`);
      return newSession;
    } catch (err) {
      const message = sanitizeAuthenticationError(
        err,
        'Failed to create workspace.'
      );
      logToTerminal(`[workspace] create failed title="${title}" reason="${message}"`, 'error');
      setError(message);
      throw err;
    }
  };

  const renameWorkspace = async (sessionId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) throw new Error('Workspace name is required');
    try {
      logToTerminal(`[workspace] rename start id=${sessionId} title="${nextTitle}"`);
      const current = sessions.find((s) => s.id === sessionId);
      const renamed =
        sessionId.startsWith('demo-')
          ? current
            ? { ...current, title: nextTitle, updated_at: new Date().toISOString() }
            : null
          : await renameSession(sessionId, nextTitle);
      if (!renamed) throw new Error('Workspace could not be renamed');
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: renamed.title, updated_at: renamed.updated_at } : s))
      );
      if (session?.id === sessionId) {
        persistAndSetSession({ ...session, title: renamed.title, updated_at: renamed.updated_at });
      }
      logToTerminal(`[workspace] rename ok id=${sessionId} title="${renamed.title}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename workspace';
      logToTerminal(`[workspace] rename failed id=${sessionId} reason="${message}"`, 'error');
      setError(message);
      throw err;
    }
  };

  const deleteWorkspace = async (sessionId: string) => {
    if (!sessionId) throw new Error('Workspace id is required');
    try {
      logToTerminal(`[workspace] delete start id=${sessionId}`);
      const summary = await deleteSessionCascade(sessionId);
      clearStoredActiveFilePath(sessionId, user?.id);

      const remaining = sessions.filter((s) => s.id !== sessionId);
      const nextActive = session?.id === sessionId ? pickRestoredSession(remaining) : session;
      setSessions(remaining);
      persistArchivedWorkspaceIds(archivedWorkspaceIds.filter((id) => id !== sessionId));

      if (session?.id === sessionId) {
        persistAndSetSession(nextActive);
      }

      logToTerminal(
        `[workspace] delete ok id=${sessionId} messages=${summary.messages} files=${summary.files} session=${summary.session}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete workspace';
      logToTerminal(`[workspace] delete failed id=${sessionId} reason="${message}"`, 'error');
      setError(message);
      throw err;
    }
  };

  const archiveWorkspace = async (sessionId: string) => {
    if (!sessionId) throw new Error('Workspace id is required');
    try {
      logToTerminal(`[workspace] archive start id=${sessionId}`);
      const nextArchived = Array.from(new Set([...archivedWorkspaceIds, sessionId]));
      persistArchivedWorkspaceIds(nextArchived);
      if (session?.id === sessionId) {
        const nextActive = pickRestoredSession(
          sessions.filter((s) => s.id !== sessionId && !nextArchived.includes(s.id))
        );
        persistAndSetSession(nextActive);
      }
      logToTerminal(`[workspace] archive ok id=${sessionId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive workspace';
      logToTerminal(`[workspace] archive failed id=${sessionId} reason="${message}"`, 'error');
      setError(message);
      throw err;
    }
  };

  const restoreWorkspace = async (sessionId: string) => {
    if (!sessionId) throw new Error('Workspace id is required');
    try {
      logToTerminal(`[workspace] restore start id=${sessionId}`);
      persistArchivedWorkspaceIds(archivedWorkspaceIds.filter((id) => id !== sessionId));
      logToTerminal(`[workspace] restore ok id=${sessionId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore workspace';
      logToTerminal(`[workspace] restore failed id=${sessionId} reason="${message}"`, 'error');
      setError(message);
      throw err;
    }
  };

  const switchSession = async (sessionId: string) => {
    const selectedSession = sessions.find(s => s.id === sessionId);
    if (selectedSession) {
      persistAndSetSession(selectedSession);
    }
  };

  const loadSessions = async () => {
    if (!user) return;
    try {
      const userSessions = await getUserSessions(user.id);
      setSessions(userSessions);
      if (userSessions.length > 0 && !session) {
        persistAndSetSession(pickRestoredSession(userSessions));
      }
    } catch (err) {
      setError(
        sanitizeAuthenticationError(err, 'Cloud workspaces could not be refreshed.')
      );
      setAuthStatus('recoverable-error');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        authStatus,
        verificationEmail,
        session,
        sessions,
        archivedWorkspaceIds,
        error,
        signUp,
        signIn,
        signOut,
        createNewSession,
        renameWorkspace,
        archiveWorkspace,
        restoreWorkspace,
        deleteWorkspace,
        switchSession,
        loadSessions,
        retryWorkspaceRestoration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
