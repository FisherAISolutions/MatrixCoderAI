import type { ProjectExportFile } from '@/lib/deployment/projectZip';
import {
  createVercelApiClient,
  redactTokenFromText,
  type VercelDeploymentStatus,
  type VercelProject,
  type VercelUploadedFile,
  type VercelUser,
} from '@/lib/deployment/vercelApiClient';
import type { VercelDeploymentDryRunSummary } from '@/lib/deployment/vercelDeploymentRequest';
import type {
  VercelDeploymentResult,
  VercelProjectConfig,
} from '@/lib/deployment/vercelIntegration';

export type VercelFlowLogLevel = 'info' | 'warning' | 'error';
export type VercelFlowTerminalStatus = 'ready' | 'failed' | 'timeout';

export interface VercelFlowLogEntry {
  timestamp: string;
  level: VercelFlowLogLevel;
  message: string;
}

export interface VercelDeploymentClient {
  validateToken(): Promise<VercelUser>;
  createOrFindProject(
    config: VercelProjectConfig & { teamId?: string }
  ): Promise<VercelProject>;
  uploadDeploymentFiles(
    files: ProjectExportFile[],
    teamId?: string
  ): Promise<VercelUploadedFile[]>;
  createDeployment(input: {
    project: VercelProjectConfig;
    files: ProjectExportFile[];
    target: 'preview' | 'production';
    teamId?: string;
  }): Promise<VercelDeploymentResult>;
  pollDeploymentStatus(
    deploymentId: string,
    teamId?: string
  ): Promise<VercelDeploymentStatus>;
}

export interface VercelDeploymentFlowResult {
  success: boolean;
  status: VercelFlowTerminalStatus;
  projectId?: string;
  projectName: string;
  deploymentId?: string;
  deploymentUrl?: string;
  productionUrl?: string;
  lastDeploymentTime: string;
  logs: VercelFlowLogEntry[];
  error?: string;
}

export interface VercelDeploymentFlowInput {
  dryRun: VercelDeploymentDryRunSummary;
  token: string;
  createClient?: (token: string) => VercelDeploymentClient;
  maxPolls?: number;
  pollIntervalMs?: number;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
  onLog?: (entry: VercelFlowLogEntry) => void;
}

export interface VercelConnectionTestResult {
  success: boolean;
  user?: VercelUser;
  logs: VercelFlowLogEntry[];
  error?: string;
}

export interface VercelProjectPrepareResult {
  success: boolean;
  project?: VercelProject;
  logs: VercelFlowLogEntry[];
  error?: string;
}

function defaultCreateClient(token: string): VercelDeploymentClient {
  return createVercelApiClient({ token });
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getDeploymentId(result: VercelDeploymentResult): string | undefined {
  const extended = result as VercelDeploymentResult & { id?: string };
  return result.deploymentId ?? extended.id;
}

function getDeploymentUrl(
  result: VercelDeploymentResult,
  status?: VercelDeploymentStatus
): string | undefined {
  const extended = result as VercelDeploymentResult & {
    url?: string;
    deploymentUrl?: string;
  };
  return normalizeUrl(
    result.productionUrl ?? extended.deploymentUrl ?? status?.url ?? extended.url
  );
}

function getProjectTeamId(project: VercelProjectConfig): string | undefined {
  return (project as VercelProjectConfig & { teamId?: string }).teamId;
}

function cleanError(error: unknown, token: string): string {
  const message =
    error instanceof Error ? error.message : 'Vercel deployment step failed.';
  const details =
    error && typeof error === 'object' && 'details' in error
      ? ` ${(error as { details?: string }).details ?? ''}`
      : '';
  return redactTokenFromText(`${message}${details}`.trim(), token);
}

function createLogger(
  logs: VercelFlowLogEntry[],
  token: string,
  now: () => string,
  onLog?: (entry: VercelFlowLogEntry) => void
) {
  return (level: VercelFlowLogLevel, message: string) => {
    const entry = {
      timestamp: now(),
      level,
      message: redactTokenFromText(message, token),
    };
    logs.push(entry);
    onLog?.(entry);
  };
}

function assertRunnableDryRun(
  dryRun: VercelDeploymentDryRunSummary
): asserts dryRun is VercelDeploymentDryRunSummary & {
  request: NonNullable<VercelDeploymentDryRunSummary['request']>;
} {
  if (!dryRun.deploymentAllowed || !dryRun.request) {
    throw new Error(
      dryRun.blockingReasons.join(' ') || 'Vercel deployment dry run is blocked.'
    );
  }
}

export async function testVercelConnection({
  token,
  createClient = defaultCreateClient,
  now = defaultNow,
}: {
  token: string;
  createClient?: (token: string) => Pick<VercelDeploymentClient, 'validateToken'>;
  now?: () => string;
}): Promise<VercelConnectionTestResult> {
  const logs: VercelFlowLogEntry[] = [];
  const log = createLogger(logs, token, now);
  try {
    log('info', 'Testing Vercel token with the current user endpoint.');
    const user = await createClient(token).validateToken();
    log('info', `Vercel connection OK for ${user.email ?? user.username ?? user.id}.`);
    return { success: true, user, logs };
  } catch (error) {
    const message = cleanError(error, token);
    log('error', message);
    return { success: false, logs, error: message };
  }
}

export async function createOrFindVercelProjectForDryRun({
  dryRun,
  token,
  createClient = defaultCreateClient,
  now = defaultNow,
}: {
  dryRun: VercelDeploymentDryRunSummary;
  token: string;
  createClient?: (token: string) => Pick<VercelDeploymentClient, 'createOrFindProject'>;
  now?: () => string;
}): Promise<VercelProjectPrepareResult> {
  const logs: VercelFlowLogEntry[] = [];
  const log = createLogger(logs, token, now);
  try {
    assertRunnableDryRun(dryRun);
    log('info', `Creating or finding Vercel project ${dryRun.request.project.projectName}.`);
    const project = await createClient(token).createOrFindProject(dryRun.request.project);
    log('info', `Vercel project ready: ${project.name}.`);
    return { success: true, project, logs };
  } catch (error) {
    const message = cleanError(error, token);
    log('error', message);
    return { success: false, logs, error: message };
  }
}

export async function runVercelDeploymentFlow({
  dryRun,
  token,
  createClient = defaultCreateClient,
  maxPolls = 20,
  pollIntervalMs = 2500,
  now = defaultNow,
  sleep = defaultSleep,
  onLog,
}: VercelDeploymentFlowInput): Promise<VercelDeploymentFlowResult> {
  const logs: VercelFlowLogEntry[] = [];
  const log = createLogger(logs, token, now, onLog);
  const projectName = dryRun.projectName;
  const completedAt = () => now();

  try {
    if (!token.trim()) {
      throw new Error('Vercel token is required for deployment.');
    }
    assertRunnableDryRun(dryRun);

    const client = createClient(token);
    log('info', 'Validating Vercel connection before deployment.');
    await client.validateToken();

    log('info', `Creating or finding Vercel project ${dryRun.request.project.projectName}.`);
    const project = await client.createOrFindProject(dryRun.request.project);
    const teamId = getProjectTeamId(dryRun.request.project);
    const projectConfig = {
      ...dryRun.request.project,
      projectId: project.id,
    };

    log('info', `Uploading ${dryRun.request.files.length} generated project files.`);
    await client.uploadDeploymentFiles(dryRun.request.files, teamId);

    log('info', 'Creating Vercel production deployment.');
    const deployment = await client.createDeployment({
      project: projectConfig,
      files: dryRun.request.files,
      target: dryRun.request.target,
      teamId,
    });
    const deploymentId = getDeploymentId(deployment);
    if (!deploymentId) {
      throw new Error('Vercel did not return a deployment id.');
    }
    log('info', `Vercel deployment created: ${deploymentId}.`);

    let latestStatus: VercelDeploymentStatus | undefined;
    for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
      latestStatus = await client.pollDeploymentStatus(
        deploymentId,
        teamId
      );
      log('info', `Deployment status ${latestStatus.state} (${attempt}/${maxPolls}).`);

      if (latestStatus.state === 'READY') {
        const deploymentUrl = getDeploymentUrl(deployment, latestStatus);
        return {
          success: true,
          status: 'ready',
          projectId: project.id,
          projectName: project.name,
          deploymentId,
          deploymentUrl,
          productionUrl: deploymentUrl,
          lastDeploymentTime: completedAt(),
          logs,
        };
      }

      if (latestStatus.state === 'ERROR' || latestStatus.state === 'CANCELED') {
        throw new Error(`Vercel deployment ended with status ${latestStatus.state}.`);
      }

      if (attempt < maxPolls) {
        await sleep(pollIntervalMs);
      }
    }

    const deploymentUrl = getDeploymentUrl(deployment, latestStatus);
    log('warning', 'Timed out while waiting for Vercel deployment readiness.');
    return {
      success: false,
      status: 'timeout',
      projectId: project.id,
      projectName: project.name,
      deploymentId,
      deploymentUrl,
      productionUrl: deploymentUrl,
      lastDeploymentTime: completedAt(),
      logs,
      error: 'Timed out while waiting for Vercel deployment readiness.',
    };
  } catch (error) {
    const message = cleanError(error, token);
    log('error', message);
    return {
      success: false,
      status: 'failed',
      projectName,
      lastDeploymentTime: completedAt(),
      logs,
      error: message,
    };
  }
}
