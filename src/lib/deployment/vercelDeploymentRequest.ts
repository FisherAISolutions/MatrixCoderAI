import type { DeploymentWorkspaceSnapshot } from '@/lib/deployment/workspaceStatus';
import type { ProductionCheckOverallStatus } from '@/lib/deployment/productionCheck';
import type { VercelLocalConfig } from '@/lib/deployment/vercelConfig';
import type {
  VercelDeploymentRequest,
  VercelProjectConfig,
} from '@/lib/deployment/vercelIntegration';
import { inspectDeploymentProject, type DeploymentProjectInspection } from './projectInspection';

export interface BuildVercelDeploymentDryRunInput {
  snapshot: DeploymentWorkspaceSnapshot;
  config: VercelLocalConfig | null;
  productionStatus: ProductionCheckOverallStatus;
  requestedAt?: string;
}

export interface VercelDeploymentDryRunSummary {
  projectName: string;
  fileCount: number;
  routeCount: number;
  framework: 'Next.js' | 'Unknown';
  productionCheckStatus: ProductionCheckOverallStatus;
  deploymentAllowed: boolean;
  blockingReasons: string[];
  request: VercelDeploymentRequest | null;
  projectId?: string;
  repositoryFingerprint?: string;
  reviewedFingerprint?: string;
  inspection?: DeploymentProjectInspection;
  environmentChecklist?: Array<{
    name: string;
    visibility: 'public' | 'server-only';
    status: 'manual-setup';
  }>;
}

function cleanOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function hasNextFramework(snapshot: DeploymentWorkspaceSnapshot): boolean {
  return snapshot.framework === 'Next.js';
}

function createProjectConfig(projectName: string): VercelProjectConfig {
  return {
    projectName,
    framework: 'nextjs',
    buildCommand: 'npm run build',
  };
}

export function buildVercelDeploymentDryRun({
  snapshot,
  config,
  productionStatus,
  requestedAt = new Date().toISOString(),
}: BuildVercelDeploymentDryRunInput): VercelDeploymentDryRunSummary {
  const projectName = cleanOptional(config?.projectName);
  const fileCount = snapshot.exportFiles.length;
  const blockingReasons: string[] = [];

  if (!projectName) {
    blockingReasons.push('Vercel project name is required.');
  }

  if (fileCount === 0) {
    blockingReasons.push('No generated project files are available.');
  }

  if (!hasNextFramework(snapshot)) {
    blockingReasons.push('Only generated Next.js projects are supported.');
  }

  if (productionStatus !== 'Passed') {
    blockingReasons.push('Production Build Check must pass before deployment.');
  }

  const inspection = inspectDeploymentProject(
    snapshot.exportFiles,
    cleanOptional((config as VercelLocalConfig & { rootDirectory?: string } | null)?.rootDirectory)
  );
  blockingReasons.push(...inspection.blockingReasons);
  const repositoryFingerprint = inspection.fingerprint;
  const reviewedFingerprint =
    (snapshot as DeploymentWorkspaceSnapshot & { reviewedFingerprint?: string })
      .reviewedFingerprint ?? repositoryFingerprint;
  if (reviewedFingerprint !== repositoryFingerprint) {
    blockingReasons.push('The repository changed after the reviewed production check.');
  }
  const deploymentAllowed = blockingReasons.length === 0;
  const request =
    deploymentAllowed && projectName
      ? {
          project: {
            ...createProjectConfig(projectName),
            rootDirectory: inspection.projectRoot || undefined,
            buildCommand: inspection.buildCommand,
          },
          files: snapshot.exportFiles,
          target: 'production' as const,
          requestedAt,
        }
      : null;

  return {
    projectName: projectName ?? snapshot.projectName,
    fileCount,
    routeCount: snapshot.routeCount,
    framework: hasNextFramework(snapshot) ? 'Next.js' : 'Unknown',
    productionCheckStatus: productionStatus,
    deploymentAllowed,
    blockingReasons,
    request,
    projectId: snapshot.sessionId,
    repositoryFingerprint,
    reviewedFingerprint,
    inspection,
    environmentChecklist: inspection.environmentVariables.map((name) => ({
      name,
      visibility: name.startsWith('NEXT_PUBLIC_') ? 'public' : 'server-only',
      status: 'manual-setup',
    })),
  };
}
