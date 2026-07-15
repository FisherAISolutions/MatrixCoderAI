import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getOptionalServerEnv,
  getPublicEnv,
  PUBLIC_ENV_MAP,
  requireServerEnv,
  validateEnvironment,
} from '@/lib/env';
import { redactSecrets } from '@/lib/logger';
import { rejectIfRequestTooLarge } from '@/lib/api/hardening';

describe('production hardening helpers', () => {
  it('validates required and optional environment variables without exposing values', () => {
    const result = validateEnvironment({
      source: {
        OPENAI_API_KEY: '',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        key: 'OPENAI_API_KEY',
        requirement: 'required',
        visibility: 'server',
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('https://example.supabase.co');
  });

  it('distinguishes public and server-only environment access', () => {
    const source = {
      OPENAI_API_KEY: 'server-secret',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    };

    expect(getPublicEnv('NEXT_PUBLIC_SUPABASE_URL', source)).toBe(
      'https://example.supabase.co'
    );
    expect(getOptionalServerEnv('OPENAI_API_KEY', source)).toBe('server-secret');
    expect(requireServerEnv('OPENAI_API_KEY', source)).toBe('server-secret');
    // @ts-expect-error Server-only keys must not be accepted by getPublicEnv.
    expect(() => getPublicEnv('OPENAI_API_KEY', source)).toThrow(
      'server-only'
    );
    // @ts-expect-error Public keys must not be accepted by server env helpers.
    expect(() => getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL', source)).toThrow(
      'public'
    );
  });

  it('maps only browser-safe public env values with static keys', () => {
    expect(Object.keys(PUBLIC_ENV_MAP).sort()).toEqual([
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED',
    ]);
    expect(JSON.stringify(PUBLIC_ENV_MAP)).not.toContain('OPENAI_API_KEY');
    expect(JSON.stringify(PUBLIC_ENV_MAP)).not.toContain('VERCEL_TOKEN');
    expect(JSON.stringify(PUBLIC_ENV_MAP).toLowerCase()).not.toContain('service_role');
  });

  it('does not report configured Supabase public values as missing with injected sources', () => {
    const result = validateEnvironment({
      source: {
        OPENAI_API_KEY: 'server-secret',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
      includeOptionalWarnings: true,
    });

    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.key)).not.toContain(
      'NEXT_PUBLIC_SUPABASE_URL'
    );
    expect(result.issues.map((issue) => issue.key)).not.toContain(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  });

  it('handles missing public values gracefully', () => {
    expect(getPublicEnv('NEXT_PUBLIC_SUPABASE_URL', {})).toBeUndefined();
    expect(getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', {})).toBeUndefined();
  });

  it('redacts likely secrets from strings and objects', () => {
    const redacted = redactSecrets({
      token: 'vercel-token-value',
      message: 'Bearer abcdefghijklmnop and OPENAI_API_KEY=sk-sensitive-value',
    });

    expect(JSON.stringify(redacted)).not.toContain('vercel-token-value');
    expect(JSON.stringify(redacted)).not.toContain('sk-sensitive-value');
    expect(JSON.stringify(redacted)).toContain('[redacted-secret]');
  });

  it('rejects requests that declare an oversized content length', async () => {
    const request = new Request('https://matrix.test/api/demo', {
      method: 'POST',
      headers: { 'content-length': '1025' },
    });

    const response = rejectIfRequestTooLarge(request as any, 1024);
    expect(response?.status).toBe(413);
    await expect(response?.json()).resolves.toMatchObject({
      error: 'Request body is too large.',
    });
  });

  it('keeps auth credentials out of URL query fallback submissions', () => {
    const loginForm = readFileSync(
      join(process.cwd(), 'src/app/sign-up-login-screen/components/LoginForm.tsx'),
      'utf8'
    );
    const signUpForm = readFileSync(
      join(process.cwd(), 'src/app/sign-up-login-screen/components/SignUpForm.tsx'),
      'utf8'
    );

    for (const source of [loginForm, signUpForm]) {
      expect(source).toContain('method="post"');
      expect(source).toContain('action="/sign-up-login-screen"');
      expect(source).not.toMatch(/router\.(?:push|replace)\([^)]*(?:email|password)/i);
      expect(source).not.toMatch(/(?:localStorage|sessionStorage)\.[^(]+\([^)]*(?:email|password)/i);
    }
  });
});