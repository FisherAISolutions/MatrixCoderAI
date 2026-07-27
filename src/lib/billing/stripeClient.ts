import { getOptionalServerEnv, requireServerEnv } from '@/lib/env';
import { redactSecrets } from '@/lib/logger';

export interface StripeClientOptions {
  fetchImpl?: typeof fetch;
  source?: Record<string, string | undefined>;
}

export class StripeServerClient {
  private readonly fetchImpl: typeof fetch;
  private readonly source: Record<string, string | undefined>;

  constructor(options: StripeClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.source = options.source ?? process.env;
  }

  private async request<T>(
    path: string,
    body?: URLSearchParams,
    method = 'POST'
  ): Promise<T> {
    const key = requireServerEnv('STRIPE_SECRET_KEY', this.source);
    const response = await this.fetchImpl(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body,
    });
    const payload = (await response.json()) as T & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        String(redactSecrets(payload.error?.message ?? `Stripe request failed (${response.status}).`))
      );
    }
    return payload;
  }

  createCustomer(email: string, userId: string) {
    return this.request<{ id: string }>(
      'customers',
      new URLSearchParams({ email, 'metadata[matrix_user_id]': userId })
    );
  }

  createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    userId: string;
  }) {
    return this.request<{ id: string; url: string | null }>(
      'checkout/sessions',
      new URLSearchParams({
        mode: 'subscription',
        customer: input.customerId,
        'line_items[0][price]': input.priceId,
        'line_items[0][quantity]': '1',
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.userId,
        'subscription_data[metadata][matrix_user_id]': input.userId,
      })
    );
  }

  createPortalSession(customerId: string, returnUrl: string) {
    return this.request<{ id: string; url: string }>(
      'billing_portal/sessions',
      new URLSearchParams({ customer: customerId, return_url: returnUrl })
    );
  }

  retrieveSubscription(subscriptionId: string) {
    return this.request<{
      id: string;
      customer: string;
      status: string;
      current_period_end?: number;
      cancel_at_period_end?: boolean;
      items?: { data?: Array<{ price?: { id?: string } }> };
      metadata?: Record<string, string>;
    }>(`subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, 'GET');
  }

  isConfigured(): boolean {
    return !!getOptionalServerEnv('STRIPE_SECRET_KEY', this.source);
  }
}
