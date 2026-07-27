import { NextResponse } from 'next/server';
import { createCheckoutForRequest } from '@/lib/billing/serverActions';
import type { PlanId } from '@/lib/billing/types';
import { publicErrorMessage } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { planId?: PlanId; operationId?: string };
    if (!body.planId) return NextResponse.json({ error: 'planId is required.' }, { status: 400 });
    return NextResponse.json(
      await createCheckoutForRequest(request, {
        planId: body.planId,
        operationId: body.operationId,
      })
    );
  } catch (error) {
    const message = publicErrorMessage('Checkout could not be created.', error, {
      exposeInDevelopment: true,
    });
    const status = /auth/i.test(String(message)) ? 401 : /rate limit/i.test(String(message)) ? 429 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
