import { NextResponse } from 'next/server';
import { requireServerEnv } from '@/lib/env';
import { processStripeWebhookEvent } from '@/lib/billing/serverActions';
import { verifyStripeWebhook } from '@/lib/billing/webhook';
import { logError } from '@/lib/logger';

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const event = verifyStripeWebhook(
      rawBody,
      request.headers.get('stripe-signature'),
      requireServerEnv('STRIPE_WEBHOOK_SECRET')
    );
    return NextResponse.json(await processStripeWebhookEvent(event));
  } catch (error) {
    logError('stripe webhook failed', error, { operation: 'stripe-webhook' });
    return NextResponse.json({ error: 'Webhook verification or processing failed.' }, { status: 400 });
  }
}
