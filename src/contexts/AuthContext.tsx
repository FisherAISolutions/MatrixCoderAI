'use client';
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import {
  supabase,
  getCurrentUser,
  signUpUser,
  signInUser,
  signOutUser,
  getUserSessions,
  createSession,
  renameSession,
  deleteSessionCascade,
} from '@/lib/supabase';
import {
  getStoredActiveSessionId,
  setStoredActiveSessionId,
  clearStoredActiveSessionId,
  clearStoredActiveFilePath,
} from '@/lib/storage/persistence';
import { logToTerminal } from '@/lib/terminal/store';

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

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  session: Session | null;
  sessions: Session[];
  archivedWorkspaceIds: string[];
  error: string | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  createNewSession: (title: string) => Promise<Session>;
  renameWorkspace: (sessionId: string, title: string) => Promise<void>;
  archiveWorkspace: (sessionId: string) => Promise<void>;
  restoreWorkspace: (sessionId: string) => Promise<void>;
  deleteWorkspace: (sessionId: string) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  loadSessions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [archivedWorkspaceIds, setArchivedWorkspaceIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const persistArchivedWorkspaceIds = useCallback((ids: string[]) => {
    const unique = Array.from(new Set(ids));
    setArchivedWorkspaceIds(unique);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ARCHIVED_WORKSPACES_KEY, JSON.stringify(unique));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ARCHIVED_WORKSPACES_KEY) ?? '[]');
      if (Array.isArray(parsed)) {
        setArchivedWorkspaceIds(parsed.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      setArchivedWorkspaceIds([]);
    }
  }, []);

  /**
   * Set the active session AND persist its ID to localStorage so the
   * choice survives a refresh. Pass `null` to clear (e.g. on sign-out).
   * (Milestone B — session persistence.)
   */
  const persistAndSetSession = useCallback((s: Session | null) => {
    setSession(s);
    if (s?.id) {
      setStoredActiveSessionId(s.id);
    } else {
      clearStoredActiveSessionId();
    }
  }, []);

  /**
   * Pick which session to make active after a fresh load:
   *   1. The one whose ID is stored in localStorage (if still valid).
   *   2. Otherwise the first one returned by the backend.
   */
  const pickRestoredSession = (userSessions: Session[]): Session | null => {
    if (userSessions.length === 0) return null;
    const storedId = getStoredActiveSessionId();
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
      const message = reason instanceof Error ? reason.message : String(reason);
      console.warn('Workspace session fallback:', message);
      logToTerminal(`[auth] using local workspace fallback reason="${message}"`, 'warn');
      const localSession = createLocalWorkspaceSession(title);
      persistAndSetSession(localSession);
      setSessions([localSession]);
      return localSession;
    },
    [createLocalWorkspaceSession, persistAndSetSession]
  );

  const restoreUserWorkspace = useCallback(
    async (authUser: User, source: string) => {
      try {
        console.log(`Loading sessions for user from ${source}:`, authUser.id);
        const userSessions = await withTimeout(
          getUserSessions(authUser.id),
          SESSION_OPERATION_TIMEOUT_MS,
          'Loading workspaces'
        );
        setSessions(userSessions);

        if (userSessions.length > 0) {
          persistAndSetSession(pickRestoredSession(userSessions));
          return;
        }

        try {
          const newSession = await withTimeout(
            createSession(authUser.id, 'Main Workspace'),
            SESSION_OPERATION_TIMEOUT_MS,
            'Creating workspace'
          );
          persistAndSetSession(newSession);
          setSessions([newSession]);
        } catch (createErr) {
          useLocalWorkspaceFallback(createErr, 'Main Workspace');
        }
      } catch (loadErr) {
        useLocalWorkspaceFallback(loadErr, 'Main Workspace');
      }
    },
    [persistAndSetSession, useLocalWorkspaceFallback]
  );

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Get current user
        const currentUser = await withTimeout(
          getCurrentUser(),
          AUTH_OPERATION_TIMEOUT_MS,
          'Restoring auth session'
        );
        console.log('Auth init - currentUser:', currentUser?.email || 'not logged in');
        setUser(currentUser || null);

        if (currentUser) {
          await restoreUserWorkspace(currentUser, 'initial-auth');
        }
      } catch (err) {
        console.error('Auth init error:', err);
        setError(err instanceof Error ? err.message : 'Auth error');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    if (!supabase) {
      return;
    }

    // Set up auth state listener. Supabase warns against awaiting more
    // Supabase calls inside this callback, so defer workspace restoration.
    let disposed = false;
    const pendingAuthTimers = new Set<ReturnType<typeof setTimeout>>();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (authSession?.user) {
        setUser(authSession.user);
        const timer = setTimeout(() => {
          pendingAuthTimers.delete(timer);
          if (disposed) return;
          void restoreUserWorkspace(authSession.user, 'auth-state').catch((err) => {
            if (!disposed) useLocalWorkspaceFallback(err, 'Main Workspace');
          });
        }, 0);
        pendingAuthTimers.add(timer);
      } else {
        setUser(null);
        persistAndSetSession(null);
        setSessions([]);
      }
    });

    return () => {
      disposed = true;
      for (const timer of pendingAuthTimers) clearTimeout(timer);
      pendingAuthTimers.clear();
      authListener?.subscription.unsubscribe();
    };
  }, [persistAndSetSession, restoreUserWorkspace, useLocalWorkspaceFallback]);

  const signUp = async (email: string, password: string) => {
    try {
      setError(null);
      const { user: newUser } = await withTimeout(
        signUpUser(email, password),
        AUTH_OPERATION_TIMEOUT_MS,
        'Sign up'
      );
      if (newUser) {
        setUser(newUser);
        await restoreUserWorkspace(newUser, 'sign-up');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      const { user: authUser } = await withTimeout(
        signInUser(email, password),
        AUTH_OPERATION_TIMEOUT_MS,
        'Sign in'
      );
      if (authUser) {
        setUser(authUser);
        void restoreUserWorkspace(authUser, 'sign-in').catch((err) => {
          useLocalWorkspaceFallback(err, 'Main Workspace');
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      await signOutUser();
      setUser(null);
      persistAndSetSession(null);
      setSessions([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setError(message);
      throw err;
    }
  };

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
      const message = err instanceof Error ? err.message : 'Failed to create session';
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
      clearStoredActiveFilePath(sessionId);

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
      console.error('Failed to load sessions:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
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
