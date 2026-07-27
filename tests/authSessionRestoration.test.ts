import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import {
  createOwnedApplicationSession,
} from '@/lib/auth/applicationSession';
import {
  resolveAuthenticatedUser,
  resolveSignUpOutcome,
} from '@/lib/auth/authFlow';

const user = { id: 'user-1' } as User;
const authSession = { user } as Session;

describe('authenticated application sessions', () => {
  it('creates a session with the authenticated owner identity', async () => {
    const insertSession = vi.fn(async (input) => ({
      data: { id: 'session-1', user_id: input.userId, title: input.title },
      error: null,
    }));

    const result = await createOwnedApplicationSession(
      {
        getAuthenticatedUserId: async () => 'user-1',
        insertSession,
      },
      { requestedUserId: 'user-1', title: 'Main Workspace' }
    );

    expect(result.user_id).toBe('user-1');
    expect(insertSession).toHaveBeenCalledWith({
      userId: 'user-1',
      title: 'Main Workspace',
    });
  });

  it('rejects unauthenticated and cross-user session creation before insert', async () => {
    const insertSession = vi.fn();
    await expect(
      createOwnedApplicationSession({
        getAuthenticatedUserId: async () => null,
        insertSession,
      })
    ).rejects.toMatchObject({ code: 'not-authenticated' });
    await expect(
      createOwnedApplicationSession(
        {
          getAuthenticatedUserId: async () => 'user-1',
          insertSession,
        },
        { requestedUserId: 'user-2' }
      )
    ).rejects.toMatchObject({ code: 'user-mismatch' });
    expect(insertSession).not.toHaveBeenCalled();
  });

  it('returns a typed recoverable RLS error without leaking raw database text', async () => {
    await expect(
      createOwnedApplicationSession({
        getAuthenticatedUserId: async () => 'user-1',
        insertSession: async () => ({
          data: null,
          error: {
            code: '42501',
            message:
              'new row violates row-level security policy for table "sessions"',
          },
        }),
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'row-level-security',
        recoverable: true,
      })
    );
  });

  it('requires verification when signup has a user but no auth session', () => {
    expect(
      resolveSignUpOutcome({ user, session: null, email: 'user@example.com' })
    ).toEqual({
      status: 'verification-required',
      email: 'user@example.com',
    });
    expect(
      resolveSignUpOutcome({
        user,
        session: authSession,
        email: 'user@example.com',
      })
    ).toEqual({ status: 'authenticated' });
  });

  it('verifies restored login identity against getSession state', () => {
    expect(
      resolveAuthenticatedUser({ returnedUser: user, currentSession: authSession })
    ).toBe(user);
    expect(() =>
      resolveAuthenticatedUser({
        returnedUser: user,
        currentSession: { user: { id: 'other-user' } } as Session,
      })
    ).toThrow(/valid authenticated session/i);
  });

  it('defines explicit owner-only CRUD policies and profile bootstrap SQL', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260727_sessions_rls_auth_restore.sql'
      ),
      'utf8'
    );
    expect(migration).toContain('for select');
    expect(migration).toContain('for insert');
    expect(migration).toContain('for update');
    expect(migration).toContain('for delete');
    expect(migration.match(/\(select auth\.uid\(\)\) = user_id/g)).toHaveLength(5);
    expect(migration).toContain('to authenticated');
    expect(migration).toContain('revoke all on table public.sessions from anon');
    expect(migration).toContain('ensure_matrix_user_profile');
    expect(migration).toContain('on conflict (id) do update');
  });

  it('keeps password data out of URL and browser storage flows', () => {
    const files = [
      'src/app/sign-up-login-screen/components/LoginForm.tsx',
      'src/app/sign-up-login-screen/components/SignUpForm.tsx',
      'src/contexts/AuthContext.tsx',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'));
    const combined = files.join('\n');
    expect(combined).not.toMatch(
      /(?:router\.(?:push|replace)|URLSearchParams|localStorage|sessionStorage)[\s\S]{0,120}password/i
    );
  });
});
