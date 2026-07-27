import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus =
  | 'restoring'
  | 'authenticated'
  | 'unauthenticated'
  | 'verification-required'
  | 'recoverable-error';

export type AuthActionResult =
  | { status: 'authenticated' | 'recoverable-error' }
  | { status: 'verification-required'; email: string };

export function resolveSignUpOutcome(input: {
  user: User | null;
  session: Session | null;
  email: string;
}): AuthActionResult {
  if (input.user && input.session?.user.id === input.user.id) {
    return { status: 'authenticated' };
  }
  return { status: 'verification-required', email: input.email };
}

export function resolveAuthenticatedUser(input: {
  returnedUser: User | null;
  currentSession: Session | null;
}): User {
  const sessionUser = input.currentSession?.user;
  if (
    !input.returnedUser ||
    !sessionUser ||
    input.returnedUser.id !== sessionUser.id
  ) {
    throw new Error('A valid authenticated session could not be verified.');
  }
  return sessionUser;
}
