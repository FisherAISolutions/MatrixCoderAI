export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now()
): RateLimitResult {
  const current = buckets.get(key);
  const bucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : current;
  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= policy.limit,
    remaining: Math.max(0, policy.limit - bucket.count),
    retryAfterMs: Math.max(0, bucket.resetAt - now),
  };
}

export function clearRateLimitsForTests(): void {
  buckets.clear();
}
