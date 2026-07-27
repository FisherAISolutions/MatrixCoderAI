import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { estimateLargeBuild } from '@/lib/billing/buildEstimate';
import {
  getUsageLimit,
  planIdForStripePrice,
  stripePriceForPlan,
} from '@/lib/billing/plans';
import { verifyStripeWebhook } from '@/lib/billing/webhook';

describe('private beta billing foundation', () => {
  it('keeps plan limits centralized and resolves configured Stripe prices', () => {
    const source = {
      STRIPE_PRICE_STARTER: 'price_starter',
      STRIPE_PRICE_PRO: 'price_pro',
    };

    expect(getUsageLimit('free-beta', 'task-execution')).toBe(30);
    expect(planIdForStripePrice('price_pro', source)).toBe('pro');
    expect(stripePriceForPlan('starter', source)).toBe('price_starter');
    expect(planIdForStripePrice('price_unknown', source)).toBeUndefined();
  });

  it('blocks oversized builds before execution and offers bounded choices', () => {
    const estimate = estimateLargeBuild('free-beta', {
      tasks: 15,
      expectedAiRequests: 31,
      repairAllowance: 11,
      generatedFiles: 81,
      generatedBytes: 450_001,
      durationMinutes: 31,
    });

    expect(estimate.allowed).toBe(false);
    expect(estimate.blockingReasons).toHaveLength(6);
    expect(estimate.options).toEqual(
      expect.arrayContaining(['simplify', 'build-foundation-first', 'upgrade', 'cancel'])
    );
  });

  it('allows a bounded build and reports near-limit warnings', () => {
    const estimate = estimateLargeBuild('free-beta', {
      tasks: 12,
      expectedAiRequests: 20,
      repairAllowance: 5,
      generatedFiles: 60,
      generatedBytes: 400_000,
      durationMinutes: 20,
    });

    expect(estimate.allowed).toBe(true);
    expect(estimate.warnings).toEqual(
      expect.arrayContaining([
        'This build is close to the plan task limit.',
        'This build is close to the plan output-size limit.',
      ])
    );
  });

  it('verifies a signed Stripe webhook and rejects tampering', () => {
    const secret = 'whsec_test_secret';
    const timestamp = 1_800_000_000;
    const rawBody = JSON.stringify({
      id: 'evt_123',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_123' } },
    });
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    expect(
      verifyStripeWebhook(
        rawBody,
        `t=${timestamp},v1=${signature}`,
        secret,
        timestamp
      )
    ).toMatchObject({ id: 'evt_123' });
    expect(() =>
      verifyStripeWebhook(
        `${rawBody} `,
        `t=${timestamp},v1=${signature}`,
        secret,
        timestamp
      )
    ).toThrow('Invalid Stripe signature.');
  });
});
