import type { DeploymentWorkspaceSnapshot } from '@/lib/deployment/workspaceStatus';
import type { ProductionCheckOverallStatus } from '@/lib/deployment/productionCheck';
import type { VercelLocalConfig } from '@/lib/deployment/vercelConfig';
import type {
  VercelDeploymentRequest,
  VercelProjectConfig,
} from '@/lib/deployment/vercelIntegration';

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
}

function cleanOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function hasNextFramework(snapshot: DeploymentWorkspaceSnapshot): boolean {
  return snapshot.framework === 'Next.js';
}

function createProjectConfig(
  projectName: string,
  teamId?: string
): VercelProjectConfig & { teamId?: string } {
  return {
    projectName,
    framework: 'nextjs',
    buildCommand: 'npm run build',
    teamId,
  };
}

export function buildVercelDeploymentDryRun({
  snapshot,
  config,
  productionStatus,
  requestedAt = new Date().toISOString(),
}: BuildVercelDeploymentDryRunInput): VercelDeploymentDryRunSummary {
  const projectName = cleanOptional(config?.projectName);
  const teamId = cleanOptional(config?.teamId);
  const fileCount = snapshot.exportFiles.length;
  const blockingReasons: string[] = [];

  if (!config?.tokenConfigured) {
    blockingReasons.push('Vercel token is not configured locally.');
  }

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

  const deploymentAllowed = blockingReasons.length === 0;
  const request =
    deploymentAllowed && projectName
      ? {
          project: createProjectConfig(projectName, teamId),
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
  };
}
