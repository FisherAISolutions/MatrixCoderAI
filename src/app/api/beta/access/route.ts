import { NextResponse } from 'next/server';
import { evaluateBetaSignupAccess } from '@/lib/release/betaAccess';
import { consumeRateLimit } from '@/lib/operations/rateLimit';

export async function POST(request: Request) {
  const client =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip')?.trim() ??
    'unknown';
  const rate = consumeRateLimit(`beta-access:${client}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { allowed: false, reason: 'Too many access checks. Please wait and retry.' },
      { status: 429 }
    );
  }

  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email : '';
  } catch {
    return NextResponse.json(
      { allowed: false, reason: 'A valid email address is required.' },
      { status: 400 }
    );
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json(
      { allowed: false, reason: 'A valid email address is required.' },
      { status: 400 }
    );
  }

  const decision = evaluateBetaSignupAccess({ email });
  return NextResponse.json(decision, { status: decision.allowed ? 200 : 403 });
}
