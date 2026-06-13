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

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Get current user
        const currentUser = await getCurrentUser();
        console.log('Auth init - currentUser:', currentUser?.email || 'not logged in');
        setUser(currentUser || null);

        if (currentUser) {
          try {
            // Load user's sessions
            console.log('Loading sessions for user:', currentUser.id);
            const userSessions = await getUserSessions(currentUser.id);
            console.log('Loaded sessions:', userSessions.length);
            setSessions(userSessions);

            // Set to first session or create new one
            if (userSessions.length > 0) {
              const restored = pickRestoredSession(userSessions);
              console.log(
                'Setting active session:',
                restored?.id,
                restored?.id === userSessions[0].id ? '(first)' : '(restored from localStorage)'
              );
              persistAndSetSession(restored);
            } else {
              // Create default session for new user
              console.log('Creating default session for new user');
              const newSession = await createSession(currentUser.id, 'Main Workspace');
              console.log('Created session:', newSession?.id);
              persistAndSetSession(newSession);
              setSessions([newSession]);
            }
          } catch (dbErr) {
            console.warn('Database connection issue - using demo session:', dbErr instanceof Error ? dbErr.message : String(dbErr));
            // Create a temporary demo session if DB fails
            const demoSession: Session = {
              id: 'demo-' + Date.now(),
              title: 'Demo Session',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            persistAndSetSession(demoSession);
          }
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

    // Set up auth state listener
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (authSession?.user) {
        setUser(authSession.user);
        // Load sessions for this user
        try {
          const userSessions = await getUserSessions(authSession.user.id);
          setSessions(userSessions);
          if (userSessions.length > 0) {
            persistAndSetSession(pickRestoredSession(userSessions));
          } else {
            const newSession = await createSession(authSession.user.id, 'Main Workspace');
            persistAndSetSession(newSession);
            setSessions([newSession]);
          }
        } catch (err) {
          console.error('Failed to load sessions:', err);
        }
      } else {
        setUser(null);
        persistAndSetSession(null);
        setSessions([]);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      setError(null);
      const { user: newUser } = await signUpUser(email, password);
      if (newUser) {
        setUser(newUser);
        // Create default session
        const newSession = await createSession(newUser.id, 'Main Workspace');
        persistAndSetSession(newSession);
        setSessions([newSession]);
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
      const { user: authUser } = await signInUser(email, password);
      if (authUser) {
        setUser(authUser);
        // Load sessions
        const userSessions = await getUserSessions(authUser.id);
        setSessions(userSessions);
        if (userSessions.length > 0) {
          persistAndSetSession(pickRestoredSession(userSessions));
        } else {
          const newSession = await createSession(authUser.id, 'Main Workspace');
          persistAndSetSession(newSession);
          setSessions([newSession]);
        }
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
