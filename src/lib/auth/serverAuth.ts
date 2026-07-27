import { createClient } from '@supabase/supabase-js';
import { getPublicEnv, getOptionalServerEnv } from '@/lib/env';

export interface AuthenticatedServerUser {
  id: string;
  email?: string;
  isInternal: boolean;
  accessToken: string;
}

function internalUserIds(
  source: Record<string, string | undefined> = process.env
): Set<string> {
  return new Set(
    (source.MATRIX_INTERNAL_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function isInternalUserId(
  userId: string,
  source?: Record<string, string | undefined>
): boolean {
  return internalUserIds(source).has(userId);
}

export async function authenticateServerRequest(
  request: Request
): Promise<AuthenticatedServerUser> {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Authentication required.');

  const url = getPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('Supabase authentication is not configured.');

  const accessToken = match[1];
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('Authentication failed.');

  return {
    id: data.user.id,
    email: data.user.email,
    isInternal: isInternalUserId(data.user.id),
    accessToken,
  };
}

export async function authenticateCostlyRequest(
  request: Request
): Promise<AuthenticatedServerUser> {
  const hasBearer = /^Bearer\s+/i.test(request.headers.get('authorization') ?? '');
  if (
    !hasBearer &&
    process.env.NODE_ENV !== 'production' &&
    /^(disabled|internal)$/i.test(process.env.MATRIX_BILLING_MODE ?? 'disabled')
  ) {
    return {
      id: 'local-development',
      isInternal: process.env.MATRIX_BILLING_MODE === 'internal',
      accessToken: '',
    };
  }
  return authenticateServerRequest(request);
}

export function createSupabaseServiceClient() {
  const url = getPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getOptionalServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('Trusted Supabase server access is not configured.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
