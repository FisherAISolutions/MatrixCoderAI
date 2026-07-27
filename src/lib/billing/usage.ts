import { createSupabaseServiceClient } from '@/lib/auth/serverAuth';
import { getUsageLimit } from './plans';
import type {
  BillingSummary,
  PlanId,
  SubscriptionStatus,
  UsageAuthorization,
  UsageCategory,
} from './types';

function billingMode(source = process.env): 'enforced' | 'disabled' | 'internal' {
  const value = source.MATRIX_BILLING_MODE?.trim().toLowerCase();
  if (value === 'disabled' || value === 'internal' || value === 'enforced') {
    return value;
  }
  return process.env.NODE_ENV === 'production' ? 'enforced' : 'disabled';
}

export async function getBillingSummary(
  userId: string,
  isInternal = false
): Promise<BillingSummary> {
  if (isInternal || billingMode() === 'internal') {
    const { getPlan } = await import('./plans');
    return {
      planId: 'internal-admin',
      subscriptionStatus: 'active',
      stripeCustomerConfigured: false,
      entitlements: getPlan('internal-admin').entitlements,
    };
  }
  if (billingMode() === 'disabled') {
    const { getPlan } = await import('./plans');
    return {
      planId: 'free-beta',
      subscriptionStatus: 'active',
      stripeCustomerConfigured: false,
      entitlements: getPlan('free-beta').entitlements,
    };
  }

  const client = createSupabaseServiceClient();
  const { data, error } = await client
    .from('matrix_billing_accounts')
    .select('plan_id,subscription_status,stripe_customer_id,current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Billing summary unavailable: ${error.message}`);

  const { getPlan } = await import('./plans');
  const planId = (data?.plan_id ?? 'free-beta') as PlanId;
  return {
    planId,
    subscriptionStatus: (data?.subscription_status ?? 'none') as SubscriptionStatus,
    stripeCustomerConfigured: !!data?.stripe_customer_id,
    currentPeriodEnd: data?.current_period_end ?? undefined,
    entitlements: getPlan(planId).entitlements,
  };
}

export async function authorizeUsage(input: {
  userId: string;
  isInternal?: boolean;
  category: UsageCategory;
  operationId: string;
  units?: number;
}): Promise<UsageAuthorization> {
  const units = Math.max(1, Math.floor(input.units ?? 1));
  const summary = await getBillingSummary(input.userId, input.isInternal);
  const limit = getUsageLimit(summary.planId, input.category);

  if (summary.planId === 'internal-admin') {
    return {
      decision: 'internal-override',
      allowed: true,
      planId: summary.planId,
      category: input.category,
      operationId: input.operationId,
      used: 0,
      limit,
      remaining: limit,
      duplicate: false,
      message: 'Internal operator access.',
    };
  }
  if (['past_due', 'unpaid'].includes(summary.subscriptionStatus)) {
    return {
      decision: 'billing-past-due',
      allowed: false,
      planId: summary.planId,
      category: input.category,
      operationId: input.operationId,
      used: 0,
      limit,
      remaining: 0,
      duplicate: false,
      message: 'Billing requires attention before starting another costly operation.',
    };
  }
  if (billingMode() === 'disabled') {
    return {
      decision: 'allowed',
      allowed: true,
      planId: summary.planId,
      category: input.category,
      operationId: input.operationId,
      used: 0,
      limit,
      remaining: limit,
      duplicate: false,
      message: 'Billing enforcement is explicitly disabled.',
    };
  }

  const client = createSupabaseServiceClient();
  const { data, error } = await client.rpc('consume_matrix_usage', {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_category: input.category,
    p_units: units,
    p_limit: limit,
  });
  if (error) throw new Error(`Usage authorization unavailable: ${error.message}`);
  const result = (Array.isArray(data) ? data[0] : data) as {
    allowed: boolean;
    used: number;
    remaining: number;
    duplicate: boolean;
  };
  return {
    decision: result.allowed ? (result.remaining <= Math.max(1, limit * 0.1) ? 'warning' : 'allowed') : 'limit-reached',
    allowed: result.allowed,
    planId: summary.planId,
    category: input.category,
    operationId: input.operationId,
    used: result.used,
    limit,
    remaining: result.remaining,
    duplicate: result.duplicate,
    message: result.allowed
      ? 'Operation is within the current plan limit.'
      : 'This plan limit has been reached.',
  };
}

export async function recordUsageOutcome(input: {
  operationId: string;
  userId: string;
  status: 'cancelled' | 'completed' | 'failed';
}): Promise<void> {
  const client = createSupabaseServiceClient();
  const { error } = await client
    .from('matrix_usage_operations')
    .update({ status: input.status })
    .eq('operation_id', input.operationId)
    .eq('user_id', input.userId);
  if (error) throw new Error(`Usage outcome could not be recorded: ${error.message}`);
}
