import type { FailureCategory } from './types';

export function classifyFailure(error: unknown): FailureCategory {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (/abort|cancel/.test(message)) return 'cancelled';
  if (/quota|limit reached|upgrade required/.test(message)) return 'quota';
  if (/401|403|unauthor|forbidden|invalid api key/.test(message)) {
    return /provider|openai|stripe|vercel/.test(message)
      ? 'provider-authentication'
      : 'authentication';
  }
  if (/429|rate.?limit/.test(message)) return 'provider-rate-limit';
  if (/timeout|timed out/.test(message)) return 'provider-timeout';
  if (/not configured|missing .*key|configuration/.test(message)) {
    return 'provider-configuration';
  }
  if (/malformed|invalid json|parse/.test(message)) return 'malformed-output';
  if (/scope|path traversal|protected file|patch/.test(message)) return 'patch-scope';
  if (/fingerprint|stale|conflict/.test(message)) return 'repository-conflict';
  if (/type.?check|validation/.test(message)) return 'validation';
  if (/build/.test(message)) return 'build';
  if (/runtime|smoke/.test(message)) return 'runtime';
  if (/persist|save|database|supabase/.test(message)) return 'persistence';
  if (/stripe|billing|subscription|invoice/.test(message)) return 'billing';
  if (/vercel|deploy/.test(message)) return 'deployment';
  if (/manual|user action|required action/.test(message)) return 'user-action-required';
  return 'unknown';
}
