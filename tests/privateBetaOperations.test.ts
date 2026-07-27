import { beforeEach, describe, expect, it } from 'vitest';
import { classifyFailure } from '@/lib/operations/failureClassification';
import {
  assertKillSwitchOpen,
  isKillSwitchActive,
} from '@/lib/operations/killSwitches';
import {
  createOperationId,
  normalizeOperationId,
} from '@/lib/operations/operationId';
import {
  clearRateLimitsForTests,
  consumeRateLimit,
} from '@/lib/operations/rateLimit';
import { redactSecrets } from '@/lib/logger';

describe('private beta operational controls', () => {
  beforeEach(() => {
    clearRateLimitsForTests();
  });

  it('creates stable operation identifiers and rejects malformed inbound values', () => {
    const operationId = createOperationId('build');
    expect(operationId).toMatch(/^build-/);
    expect(normalizeOperationId('request-valid_123')).toBe('request-valid_123');
    expect(normalizeOperationId('../unsafe')).not.toBe('../unsafe');
  });

  it('enforces bounded per-key rate limits', () => {
    const policy = { limit: 2, windowMs: 1_000 };

    expect(consumeRateLimit('user:one', policy, 100).allowed).toBe(true);
    expect(consumeRateLimit('user:one', policy, 101).allowed).toBe(true);
    expect(consumeRateLimit('user:one', policy, 102)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterMs: 998,
    });
    expect(consumeRateLimit('user:two', policy, 102).allowed).toBe(true);
    expect(consumeRateLimit('user:one', policy, 1_101).allowed).toBe(true);
  });

  it('honors operator kill switches without treating disabled text as enabled', () => {
    expect(isKillSwitchActive('ai', { MATRIX_DISABLE_AI: 'true' })).toBe(true);
    expect(isKillSwitchActive('ai', { MATRIX_DISABLE_AI: 'false' })).toBe(false);
    expect(() =>
      assertKillSwitchOpen('deployment', { MATRIX_DISABLE_DEPLOYMENT: '1' })
    ).toThrow('deployment is temporarily unavailable');
  });

  it('classifies provider, quota, cancellation, and deployment failures', () => {
    expect(classifyFailure(new Error('Provider request timed out'))).toBe(
      'provider-timeout'
    );
    expect(classifyFailure(new Error('Monthly quota limit reached'))).toBe('quota');
    expect(classifyFailure(new Error('Cancelled by user'))).toBe('cancelled');
    expect(classifyFailure(new Error('Vercel deploy failed'))).toBe('deployment');
  });

  it('redacts server credentials from nested operational metadata', () => {
    const redacted = redactSecrets({
      operationId: 'operation-safe_123',
      token: 'vercel-secret-token',
      details: 'STRIPE_SECRET_KEY=sk_test_123456789012345',
    });

    expect(JSON.stringify(redacted)).not.toContain('vercel-secret-token');
    expect(JSON.stringify(redacted)).not.toContain('sk_test_123456789012345');
    expect(redacted).toMatchObject({ operationId: 'operation-safe_123' });
  });
});
