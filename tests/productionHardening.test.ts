import { describe, expect, it } from 'vitest';
import {
  getOptionalServerEnv,
  getPublicEnv,
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
    expect(() => getPublicEnv('OPENAI_API_KEY', source)).toThrow(
      'server-only'
    );
    expect(() => getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL', source)).toThrow(
      'public'
    );
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
});
