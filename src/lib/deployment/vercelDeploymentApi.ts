import type {
  VercelConnectionTestResult,
  VercelDeploymentFlowResult,
  VercelProjectPrepareResult,
} from '@/lib/deployment/vercelDeploymentFlow';
import type { VercelDeploymentDryRunSummary } from '@/lib/deployment/vercelDeploymentRequest';
import type {
  VercelServerAction,
  VercelServerActionResponse,
} from '@/lib/deployment/vercelServerActions';
import { getAuthenticatedRequestHeaders } from '@/lib/supabase';
import { createOperationId } from '@/lib/operations/operationId';

async function postVercelAction<T>(
  action: VercelServerAction,
  dryRun?: VercelDeploymentDryRunSummary
): Promise<T> {
  const response = await fetch('/api/deployment/vercel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-operation-id': createOperationId('deploy'),
      ...(await getAuthenticatedRequestHeaders()),
    },
    body: JSON.stringify({ action, dryRun }),
  });
  const payload = (await response.json()) as VercelServerActionResponse;
  if (payload.result) {
    return payload.result as T;
  }
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? 'Vercel deployment request failed.');
  }
  throw new Error('Vercel deployment request returned no result.');
}

export function testVercelConnectionViaServer(
  _legacyToken?: string
): Promise<VercelConnectionTestResult> {
  return postVercelAction<VercelConnectionTestResult>('test-connection');
}

export function createOrFindVercelProjectViaServer(
  dryRunOrLegacyToken: VercelDeploymentDryRunSummary | string,
  legacyDryRun?: VercelDeploymentDryRunSummary
): Promise<VercelProjectPrepareResult> {
  const dryRun =
    typeof dryRunOrLegacyToken === 'string' ? legacyDryRun : dryRunOrLegacyToken;
  if (!dryRun) {
    return Promise.reject(new Error('Vercel deployment dry run is required.'));
  }
  return postVercelAction<VercelProjectPrepareResult>(
    'prepare-project',
    dryRun
  );
}

export function deployToVercelViaServer(
  dryRunOrLegacyToken: VercelDeploymentDryRunSummary | string,
  legacyDryRun?: VercelDeploymentDryRunSummary
): Promise<VercelDeploymentFlowResult> {
  const dryRun =
    typeof dryRunOrLegacyToken === 'string' ? legacyDryRun : dryRunOrLegacyToken;
  if (!dryRun) {
    return Promise.reject(new Error('Vercel deployment dry run is required.'));
  }
  return postVercelAction<VercelDeploymentFlowResult>('deploy', dryRun);
}
