import { NextResponse } from 'next/server';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { getBillingSummary } from '@/lib/billing/usage';

export async function GET(request: Request) {
  try {
    const user = await authenticateServerRequest(request);
    return NextResponse.json(await getBillingSummary(user.id, user.isInternal));
  } catch {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
}
