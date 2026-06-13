'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AuthPage from './components/AuthPage';

/**
 * Sign-up / login page wrapper (2026-01 stability pass).
 *
 * Auto-redirects to /chat-workspace once Supabase has rehydrated a
 * valid session, so a refresh on the auth route never strands a
 * logged-in user here. While auth is still loading we render the
 * AuthPage normally — its own forms will no-op if the user submits
 * during the rehydration window because `signIn` is idempotent.
 */
export default function SignUpLoginPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/chat-workspace');
    }
  }, [isLoading, user, router]);

  return <AuthPage />;
}
