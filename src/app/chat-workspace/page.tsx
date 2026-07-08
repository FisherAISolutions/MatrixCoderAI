'use client';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/app-shell';
import ChatWorkspacePage from './components/ChatWorkspacePage';
import WorkspaceErrorBoundary from './components/WorkspaceErrorBoundary';

/**
 * Auth gate (2026-01 stability pass).
 *
 * Prevents the hydration-mismatch / "kicked back to login" bug reported
 * on refresh. Behaviour:
 *
 *   - While Supabase is rehydrating (`isLoading`), render a small Matrix
 *     spinner. We deliberately render the SAME markup on the server and
 *     on the first client paint to avoid hydration mismatches.
 *   - Once auth has settled and we still have no user, redirect to
 *     `/sign-up-login-screen`.
 *   - Otherwise mount the existing workspace (untouched architecture).
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/sign-up-login-screen');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-matrix-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-matrix-border border-t-matrix-green" />
          <p className="text-matrix-green font-mono text-xs tracking-widest uppercase neon-text-glow">
            // restoring session…
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function ChatWorkspace() {
  return (
    <AuthGate>
      <AppShell
        title="Workspace"
        breadcrumbs={[{ label: 'Matrix Coder AI', href: '/' }, { label: 'Workspace' }]}
        showHeader={false}
        contentClassName="h-full overflow-hidden p-0 [&_.workspace-shell]:h-full [&_.workspace-shell]:w-full"
      >
        <WorkspaceErrorBoundary>
          <ChatWorkspacePage />
        </WorkspaceErrorBoundary>
      </AppShell>
    </AuthGate>
  );
}
