import { authenticateServerRequest, createSupabaseServiceClient } from '@/lib/auth/serverAuth';
import { getOptionalServerEnv, requireServerEnv } from '@/lib/env';
import { normalizeOperationId } from '@/lib/operations/operationId';
import { recordOperationEvent } from '@/lib/operations/events';
import { assertKillSwitchOpen } from '@/lib/operations/killSwitches';
import { consumeRateLimit } from '@/lib/operations/rateLimit';
import { stripePriceForPlan, planIdForStripePrice } from './plans';
import { StripeServerClient } from './stripeClient';
import type { PlanId, SubscriptionStatus } from './types';
import type { StripeWebhookEvent } from './webhook';

function trustedAppOrigin(source = process.env): string {
  const raw = requireServerEnv('MATRIX_APP_BASE_URL', source);
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('MATRIX_APP_BASE_URL must be a credential-free http(s) origin.');
  }
  return url.origin;
}

async function billingAccountForUser(userId: string) {
  const client = createSupabaseServiceClient();
  const { data, error } = await client
    .from('matrix_billing_accounts')
    .select('stripe_customer_id,plan_id,subscription_status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Billing account lookup failed: ${error.message}`);
  return { client, data };
}

export async function createCheckoutForRequest(
  request: Request,
  input: { planId: PlanId; operationId?: string },
  options: { stripe?: StripeServerClient } = {}
): Promise<{ operationId: string; url: string }> {
  assertKillSwitchOpen('checkout');
  const user = await authenticateServerRequest(request);
  const operationId = normalizeOperationId(input.operationId, 'checkout');
  const rate = consumeRateLimit(`checkout:${user.id}`, { limit: 5, windowMs: 60_000 });
  if (!rate.allowed) throw new Error('Checkout rate limit reached. Please wait and retry.');
  if (!['starter', 'pro'].includes(input.planId)) throw new Error('Selected plan is not available for checkout.');

  const priceId = stripePriceForPlan(input.planId);
  if (!priceId) throw new Error(`Stripe price for ${input.planId} is not configured.`);
  const stripe = options.stripe ?? new StripeServerClient();
  const { client, data } = await billingAccountForUser(user.id);
  let customerId = data?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    if (!user.email) throw new Error('An email address is required for checkout.');
    customerId = (await stripe.createCustomer(user.email, user.id)).id;
    const { error } = await client.from('matrix_billing_accounts').upsert({
      user_id: user.id,
      stripe_customer_id: customerId,
      plan_id: data?.plan_id ?? 'free-beta',
      subscription_status: data?.subscription_status ?? 'none',
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Unable to save Stripe customer mapping: ${error.message}`);
  }

  const origin = trustedAppOrigin();
  const session = await stripe.createCheckoutSession({
    customerId,
    priceId,
    userId: user.id,
    successUrl: `${origin}/deployment-center?billing=success`,
    cancelUrl: `${origin}/deployment-center?billing=cancelled`,
  });
  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  recordOperationEvent({
    operationId,
    domain: 'billing',
    action: 'checkout-created',
    status: 'succeeded',
    metadata: { userId: user.id, planId: input.planId },
  });
  return { operationId, url: session.url };
}

export async function createPortalForRequest(
  request: Request,
  input: { operationId?: string },
  options: { stripe?: StripeServerClient } = {}
): Promise<{ operationId: string; url: string }> {
  const user = await authenticateServerRequest(request);
  const operationId = normalizeOperationId(input.operationId, 'portal');
  const rate = consumeRateLimit(`portal:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) throw new Error('Portal rate limit reached. Please wait and retry.');
  const { data } = await billingAccountForUser(user.id);
  const customerId = data?.stripe_customer_id as string | null | undefined;
  if (!customerId) throw new Error('No Stripe customer belongs to this account.');
  const origin = trustedAppOrigin();
  const session = await (options.stripe ?? new StripeServerClient()).createPortalSession(
    customerId,
    `${origin}/deployment-center`
  );
  recordOperationEvent({
    operationId,
    domain: 'billing',
    action: 'portal-created',
    status: 'succeeded',
    metadata: { userId: user.id },
  });
  return { operationId, url: session.url };
}

function normalizedSubscriptionStatus(value: unknown): SubscriptionStatus {
  const status = String(value ?? 'none');
  if (status === 'canceled') return 'cancelled';
  return ['trialing', 'active', 'past_due', 'unpaid', 'cancelled'].includes(status)
    ? (status as SubscriptionStatus)
    : 'none';
}

async function applyStripeWebhookEvent(
  event: StripeWebhookEvent,
  client: ReturnType<typeof createSupabaseServiceClient>,
  options: { stripe?: StripeServerClient } = {}
): Promise<{ duplicate: boolean; handled: boolean }> {
  const object = event.data.object;
  let userId = String(
    (object.metadata as Record<string, unknown> | undefined)?.matrix_user_id ??
      object.client_reference_id ??
      ''
  );
  let customerId = String(object.customer ?? '');
  let subscriptionId = String(object.subscription ?? object.id ?? '');
  let status = normalizedSubscriptionStatus(object.status);
  let periodEnd =
    typeof object.current_period_end === 'number'
      ? new Date(object.current_period_end * 1000).toISOString()
      : null;
  let priceId = String(
    ((object.items as { data?: Array<{ price?: { id?: string } }> } | undefined)
      ?.data?.[0]?.price?.id ?? '')
  );

  if (
    event.type === 'checkout.session.completed' &&
    subscriptionId &&
    subscriptionId !== String(object.id)
  ) {
    const subscription = await (options.stripe ?? new StripeServerClient()).retrieveSubscription(subscriptionId);
    userId ||= subscription.metadata?.matrix_user_id ?? '';
    customerId ||= subscription.customer;
    status = normalizedSubscriptionStatus(subscription.status);
    priceId = subscription.items?.data?.[0]?.price?.id ?? '';
    periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;
  }

  const subscriptionEvent =
    event.type === 'checkout.session.completed' ||
    event.type.startsWith('customer.subscription.') ||
    event.type === 'invoice.paid' ||
    event.type === 'invoice.payment_failed';
  if (!subscriptionEvent) return { duplicate: false, handled: false };

  if (!userId && customerId) {
    const { data } = await client
      .from('matrix_billing_accounts')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    userId = data?.user_id ?? '';
  }
  if (!userId) throw new Error('Stripe event could not be mapped to a Matrix user.');

  if (event.type === 'invoice.payment_failed') status = 'past_due';
  if (event.type === 'invoice.paid' && status === 'none') status = 'active';
  if (event.type === 'customer.subscription.deleted') status = 'cancelled';
  const planId = planIdForStripePrice(priceId) ?? (status === 'cancelled' ? 'free-beta' : undefined);

  const update: Record<string, unknown> = {
    user_id: userId,
    stripe_customer_id: customerId || null,
    stripe_subscription_id: subscriptionId || null,
    subscription_status: status,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  };
  if (planId) update.plan_id = planId;
  const { error } = await client.from('matrix_billing_accounts').upsert(update);
  if (error) throw new Error(`Subscription state update failed: ${error.message}`);
  return { duplicate: false, handled: true };
}

export async function processStripeWebhookEvent(
  event: StripeWebhookEvent,
  options: { stripe?: StripeServerClient } = {}
): Promise<{ duplicate: boolean; handled: boolean }> {
  const client = createSupabaseServiceClient();
  const { data: claimed, error: claimError } = await client.rpc(
    'claim_matrix_webhook_event',
    { p_event_id: event.id, p_event_type: event.type }
  );
  if (claimError) {
    throw new Error(`Webhook idempotency check failed: ${claimError.message}`);
  }
  if (!claimed) return { duplicate: true, handled: true };

  try {
    const result = await applyStripeWebhookEvent(event, client, options);
    const { error } = await client.rpc('complete_matrix_webhook_event', {
      p_event_id: event.id,
      p_error: null,
    });
    if (error) throw new Error(`Webhook completion could not be recorded: ${error.message}`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.';
    await client.rpc('complete_matrix_webhook_event', {
      p_event_id: event.id,
      p_error: message,
    });
    throw error;
  }
}

export function stripeConfigurationStatus(source = process.env) {
  return {
    secretKey: !!getOptionalServerEnv('STRIPE_SECRET_KEY', source),
    webhookSecret: !!getOptionalServerEnv('STRIPE_WEBHOOK_SECRET', source),
    starterPrice: !!getOptionalServerEnv('STRIPE_PRICE_STARTER', source),
    proPrice: !!getOptionalServerEnv('STRIPE_PRICE_PRO', source),
  };
}
