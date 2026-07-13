import { NextRequest, NextResponse } from 'next/server';
import {
  runVercelServerAction,
  type VercelServerActionRequest,
} from '@/lib/deployment/vercelServerActions';
import {
  parseJsonBody,
  rejectIfRequestTooLarge,
  safeApiErrorResponse,
} from '@/lib/api/hardening';

const MAX_VERCEL_ACTION_BODY_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const tooLarge = rejectIfRequestTooLarge(
    request,
    MAX_VERCEL_ACTION_BODY_BYTES
  );
  if (tooLarge) return tooLarge;

  const parsed = await parseJsonBody<VercelServerActionRequest>(request);
  if (!parsed.ok || !parsed.body) return parsed.response!;

  try {
    const result = await runVercelServerAction(parsed.body);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    return safeApiErrorResponse(error, {
      fallback: 'Vercel deployment request failed.',
      status: 400,
      operation: 'vercel-server-action',
      exposeInDevelopment: true,
    });
  }
}
