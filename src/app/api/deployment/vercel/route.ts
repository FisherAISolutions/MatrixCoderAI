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
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import { authorizeUsage } from '@/lib/billing/usage';
import { assertKillSwitchOpen } from '@/lib/operations/killSwitches';
import { operationIdFromRequest } from '@/lib/operations/operationId';
import { consumeRateLimit } from '@/lib/operations/rateLimit';
import {
  acquireVercelDeploymentLock,
  releaseVercelDeploymentLock,
} from '@/lib/deployment/vercelDeploymentState';

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
    assertKillSwitchOpen('deployment');
    const user = await authenticateServerRequest(request);
    const operationId = operationIdFromRequest(request, 'deploy');
    const rate = consumeRateLimit(`deployment:${user.id}`, {
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Deployment rate limit reached.' }, { status: 429 });
    }
    const projectKey =
      parsed.body.dryRun?.projectId || parsed.body.dryRun?.projectName || 'unknown';
    if (parsed.body.action === 'deploy') {
      if (!acquireVercelDeploymentLock(projectKey, operationId)) {
        return NextResponse.json(
          { error: 'A deployment is already active for this project.' },
          { status: 409 }
        );
      }
      let usage;
      try {
        usage = await authorizeUsage({
          userId: user.id,
          isInternal: user.isInternal,
          category: 'deployment',
          operationId,
        });
      } catch (error) {
        releaseVercelDeploymentLock(projectKey, operationId);
        throw error;
      }
      if (!usage.allowed) {
        releaseVercelDeploymentLock(projectKey, operationId);
        return NextResponse.json({ error: usage.message, usage }, { status: 402 });
      }
    }
    try {
      const result = await runVercelServerAction({
        ...parsed.body,
        operationId,
      }, { signal: request.signal });
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    } finally {
      if (parsed.body.action === 'deploy') {
        releaseVercelDeploymentLock(projectKey, operationId);
      }
    }
  } catch (error) {
    return safeApiErrorResponse(error, {
      fallback: 'Vercel deployment request failed.',
      status: 400,
      operation: 'vercel-server-action',
      exposeInDevelopment: true,
    });
  }
}
