import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StripeWebhookEvent {
  id: string;
  type: string;
  created?: number;
  data: { object: Record<string, unknown> };
}

export function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300
): StripeWebhookEvent {
  if (!signatureHeader) throw new Error('Missing Stripe signature.');
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) throw new Error('Malformed Stripe signature.');
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Expired Stripe signature.');
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const expectedBytes = Buffer.from(expected);
  const valid = signatures.some((signature) => {
    const actual = Buffer.from(signature);
    return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
  });
  if (!valid) throw new Error('Invalid Stripe signature.');

  const parsed = JSON.parse(rawBody) as StripeWebhookEvent;
  if (!parsed.id || !parsed.type || !parsed.data?.object) {
    throw new Error('Malformed Stripe webhook event.');
  }
  return parsed;
}
