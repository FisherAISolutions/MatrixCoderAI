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

async function postVercelAction<T>(
  action: VercelServerAction,
  token: string,
  dryRun?: VercelDeploymentDryRunSummary
): Promise<T> {
  const response = await fetch('/api/deployment/vercel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, token, dryRun }),
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
  token: string
): Promise<VercelConnectionTestResult> {
  return postVercelAction<VercelConnectionTestResult>('test-connection', token);
}

export function createOrFindVercelProjectViaServer(
  token: string,
  dryRun: VercelDeploymentDryRunSummary
): Promise<VercelProjectPrepareResult> {
  return postVercelAction<VercelProjectPrepareResult>(
    'prepare-project',
    token,
    dryRun
  );
}

export function deployToVercelViaServer(
  token: string,
  dryRun: VercelDeploymentDryRunSummary
): Promise<VercelDeploymentFlowResult> {
  return postVercelAction<VercelDeploymentFlowResult>('deploy', token, dryRun);
}
