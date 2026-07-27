import { NextResponse } from 'next/server';
import { authenticateCostlyRequest } from '@/lib/auth/serverAuth';
import { authorizeUsage } from '@/lib/billing/usage';
import type { UsageCategory } from '@/lib/billing/types';
import { assertKillSwitchOpen, type KillSwitch } from '@/lib/operations/killSwitches';
import { operationIdFromRequest } from '@/lib/operations/operationId';
import { consumeRateLimit, type RateLimitPolicy } from '@/lib/operations/rateLimit';

export interface CostGuardSuccess {
  ok: true;
  operationId: string;
  userId: string;
  internal: boolean;
}

export interface CostGuardFailure {
  ok: false;
  response: NextResponse;
}

export async function guardCostlyOperation(
  request: Request,
  input: {
    category: UsageCategory;
    killSwitch?: KillSwitch;
    ratePolicy?: RateLimitPolicy;
    rateScope?: string;
  }
): Promise<CostGuardSuccess | CostGuardFailure> {
  try {
    if (input.killSwitch) assertKillSwitchOpen(input.killSwitch);
    const user = await authenticateCostlyRequest(request);
    const operationId = operationIdFromRequest(request, input.category);
    const rate = consumeRateLimit(
      `${input.rateScope ?? input.category}:${user.id}`,
      input.ratePolicy ?? { limit: 30, windowMs: 60_000 }
    );
    if (!rate.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Request rate limit reached.', retryAfterMs: rate.retryAfterMs },
          { status: 429 }
        ),
      };
    }
    const usage = await authorizeUsage({
      userId: user.id,
      isInternal: user.isInternal,
      category: input.category,
      operationId,
    });
    if (!usage.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: usage.message, usage },
          { status: usage.decision === 'temporarily-unavailable' ? 503 : 402 }
        ),
      };
    }
    return {
      ok: true,
      operationId,
      userId: user.id,
      internal: user.isInternal,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation unavailable.';
    return {
      ok: false,
      response: NextResponse.json(
        { error: /auth/i.test(message) ? 'Authentication required.' : message },
        { status: /auth/i.test(message) ? 401 : 503 }
      ),
    };
  }
}
