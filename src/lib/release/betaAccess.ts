import { getOptionalServerEnv } from '@/lib/env';

export type BetaAccessMode = 'open' | 'controlled' | 'closed';

export interface BetaAccessDecision {
  allowed: boolean;
  mode: BetaAccessMode;
  reason?: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getBetaAccessMode(
  source: Record<string, string | undefined> = process.env
): BetaAccessMode {
  const configured = getOptionalServerEnv('MATRIX_BETA_ACCESS_MODE', source)
    ?.trim()
    .toLowerCase();
  if (configured === 'open' || configured === 'controlled' || configured === 'closed') {
    return configured;
  }
  return source.NODE_ENV === 'production' ? 'controlled' : 'open';
}

export function getBetaAllowedEmails(
  source: Record<string, string | undefined> = process.env
): Set<string> {
  return new Set(
    (getOptionalServerEnv('MATRIX_BETA_ALLOWED_EMAILS', source) ?? '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export function evaluateBetaSignupAccess(options: {
  email: string;
  source?: Record<string, string | undefined>;
}): BetaAccessDecision {
  const source = options.source ?? process.env;
  const mode = getBetaAccessMode(source);
  const email = normalizeEmail(options.email);

  if (mode === 'open') return { allowed: true, mode };
  if (mode === 'closed') {
    return {
      allowed: false,
      mode,
      reason: 'New registrations are temporarily paused.',
    };
  }
  if (email && getBetaAllowedEmails(source).has(email)) {
    return { allowed: true, mode };
  }
  return {
    allowed: false,
    mode,
    reason:
      'This private beta currently requires an invitation. Existing users can still sign in.',
  };
}

export function getBetaReleaseConfiguration(
  source: Record<string, string | undefined> = process.env
) {
  return {
    accessMode: getBetaAccessMode(source),
    feedbackUrl: getOptionalServerEnv('MATRIX_BETA_FEEDBACK_URL', source) ?? '/support',
    statusPageUrl: getOptionalServerEnv('MATRIX_STATUS_PAGE_URL', source),
  };
}
