import { NextResponse } from 'next/server';
import { createPortalForRequest } from '@/lib/billing/serverActions';
import { publicErrorMessage } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { operationId?: string };
    return NextResponse.json(await createPortalForRequest(request, body));
  } catch (error) {
    const message = publicErrorMessage('Billing portal could not be opened.', error, {
      exposeInDevelopment: true,
    });
    return NextResponse.json({ error: message }, { status: /auth/i.test(String(message)) ? 401 : 400 });
  }
}
