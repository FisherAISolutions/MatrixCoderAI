import {
  createOrFindVercelProjectForDryRun,
  runVercelDeploymentFlow,
  testVercelConnection,
  type VercelDeploymentClient,
} from '@/lib/deployment/vercelDeploymentFlow';
import type { VercelDeploymentDryRunSummary } from '@/lib/deployment/vercelDeploymentRequest';
import { redactTokenFromText } from '@/lib/deployment/vercelApiClient';
import { requireServerEnv, getOptionalServerEnv } from '@/lib/env';
import { inspectDeploymentProject } from './projectInspection';
import { normalizeOperationId } from '@/lib/operations/operationId';

export type VercelServerAction =
  | 'test-connection'
  | 'prepare-project'
  | 'deploy';

export interface VercelServerActionRequest {
  action: VercelServerAction;
  /** Legacy input accepted for compatibility but never used by the server. */
  token?: string;
  dryRun?: VercelDeploymentDryRunSummary;
  operationId?: string;
}

export interface VercelServerActionResponse {
  success: boolean;
  action: VercelServerAction;
  result?: unknown;
  error?: string;
}

export interface RunVercelServerActionOptions {
  createClient?: (token: string) => VercelDeploymentClient;
  signal?: AbortSignal;
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
    const token =
      options.createClient && request.token
        ? request.token
        : requireServerEnv('VERCEL_TOKEN');
    const operationId = normalizeOperationId(request.operationId, 'deploy');

    if (request.action === 'test-connection') {
      const result = await testVercelConnection({
        token,
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
    const inspection = inspectDeploymentProject(
      request.dryRun.request?.files ?? [],
      request.dryRun.inspection?.projectRoot
    );
    if (!inspection.supported) {
      throw new Error(inspection.blockingReasons.join(' '));
    }
    const submittedFingerprint =
      request.dryRun.repositoryFingerprint ?? inspection.fingerprint;
    const reviewedFingerprint =
      request.dryRun.reviewedFingerprint ?? submittedFingerprint;
    if (
      inspection.fingerprint !== submittedFingerprint ||
      reviewedFingerprint !== submittedFingerprint
    ) {
      throw new Error('Repository fingerprint is stale; run Production Build Check again.');
    }
    if (request.dryRun.request) {
      (
        request.dryRun.request.project as typeof request.dryRun.request.project & {
          teamId?: string;
        }
      ).teamId = getOptionalServerEnv('VERCEL_TEAM_ID') || undefined;
      request.dryRun.request.project.rootDirectory =
        inspection.projectRoot || undefined;
      request.dryRun.request.project.buildCommand = inspection.buildCommand;
    }

    if (request.action === 'prepare-project') {
      const result = await createOrFindVercelProjectForDryRun({
        dryRun: request.dryRun,
        token,
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
      token,
      createClient: options.createClient,
      signal: options.signal,
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
      error: cleanError(error),
    };
  }
}
