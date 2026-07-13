import { NextRequest, NextResponse } from 'next/server';
import { logError, publicErrorMessage } from '@/lib/logger';

export interface JsonParseResult<T> {
  ok: boolean;
  body?: T;
  response?: NextResponse;
}

export function rejectIfRequestTooLarge(
  request: NextRequest,
  maxBytes: number
): NextResponse | null {
  const rawLength = request.headers.get('content-length');
  if (!rawLength) return null;
  const length = Number(rawLength);
  if (!Number.isFinite(length)) return null;
  if (length <= maxBytes) return null;

  return NextResponse.json(
    {
      error: 'Request body is too large.',
      details: `Maximum request size is ${maxBytes} bytes.`,
    },
    { status: 413 }
  );
}

export async function parseJsonBody<T>(
  request: NextRequest
): Promise<JsonParseResult<T>> {
  try {
    return { ok: true, body: (await request.json()) as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }),
    };
  }
}

export function requireBearerAuthorization(
  request: NextRequest
): NextResponse | null {
  const authHeader = request.headers.get('authorization') ?? '';
  if (/^Bearer\s+\S+/i.test(authHeader)) return null;
  return NextResponse.json(
    { error: 'Authorization bearer token is required.' },
    { status: 401 }
  );
}

export function safeApiErrorResponse(
  error: unknown,
  options: {
    fallback: string;
    status?: number;
    operation?: string;
    exposeInDevelopment?: boolean;
  }
) {
  logError(options.fallback, error, { operation: options.operation });
  return NextResponse.json(
    {
      error: options.fallback,
      details: publicErrorMessage(options.fallback, error, {
        exposeInDevelopment: options.exposeInDevelopment,
      }),
    },
    { status: options.status ?? 500 }
  );
}
