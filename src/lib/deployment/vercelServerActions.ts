import {
  createOrFindVercelProjectForDryRun,
  runVercelDeploymentFlow,
  testVercelConnection,
  type VercelDeploymentClient,
} from '@/lib/deployment/vercelDeploymentFlow';
import type { VercelDeploymentDryRunSummary } from '@/lib/deployment/vercelDeploymentRequest';
import { redactTokenFromText } from '@/lib/deployment/vercelApiClient';

export type VercelServerAction =
  | 'test-connection'
  | 'prepare-project'
  | 'deploy';

export interface VercelServerActionRequest {
  action: VercelServerAction;
  token?: string;
  dryRun?: VercelDeploymentDryRunSummary;
}

export interface VercelServerActionResponse {
  success: boolean;
  action: VercelServerAction;
  result?: unknown;
  error?: string;
}

export interface RunVercelServerActionOptions {
  createClient?: (token: string) => VercelDeploymentClient;
}

function cleanError(error: unknown, token?: string): string {
  const message =
    error instanceof Error ? error.message : 'Vercel deployment request failed.';
  return redactTokenFromText(message, token);
}

function assertAction(value: unknown): asserts value is VercelServerAction {
  if (
    value !== 'test-connection' &&
    value !== 'prepare-project' &&
    value !== 'deploy'
  ) {
    throw new Error('Unsupported Vercel deployment action.');
  }
}

function assertToken(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Vercel token is required for this action.');
  }
}

function assertDryRun(
  value: unknown
): asserts value is VercelDeploymentDryRunSummary {
  if (!value || typeof value !== 'object') {
    throw new Error('Vercel deployment dry run is required for this action.');
  }
}

export async function runVercelServerAction(
  request: VercelServerActionRequest,
  options: RunVercelServerActionOptions = {}
): Promise<VercelServerActionResponse> {
  try {
    assertAction(request.action);
    assertToken(request.token);

    if (request.action === 'test-connection') {
      const result = await testVercelConnection({
        token: request.token,
        createClient: options.createClient,
      });
      return {
        success: result.success,
        action: request.action,
        result,
        error: result.error,
      };
    }

    assertDryRun(request.dryRun);

    if (request.action === 'prepare-project') {
      const result = await createOrFindVercelProjectForDryRun({
        dryRun: request.dryRun,
        token: request.token,
        createClient: options.createClient,
      });
      return {
        success: result.success,
        action: request.action,
        result,
        error: result.error,
      };
    }

    const result = await runVercelDeploymentFlow({
      dryRun: request.dryRun,
      token: request.token,
      createClient: options.createClient,
    });
    return {
      success: result.success,
      action: request.action,
      result,
      error: result.error,
    };
  } catch (error) {
    const action =
      request.action === 'test-connection' ||
      request.action === 'prepare-project' ||
      request.action === 'deploy'
        ? request.action
        : 'test-connection';
    return {
      success: false,
      action,
      error: cleanError(error, request.token),
    };
  }
}
