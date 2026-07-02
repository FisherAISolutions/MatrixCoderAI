import type {
  VercelFlowLogEntry,
  VercelFlowTerminalStatus,
} from '@/lib/deployment/vercelDeploymentFlow';

export const VERCEL_DEPLOYMENT_METADATA_KEY =
  'matrix-coder-ai:vercel-deployment-metadata';

export interface VercelDeploymentMetadata {
  projectName: string;
  projectId?: string;
  deploymentId?: string;
  deploymentUrl?: string;
  productionUrl?: string;
  status: VercelFlowTerminalStatus;
  lastDeploymentTime: string;
  logs: VercelFlowLogEntry[];
}

type MetadataStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getLocalStorage(): MetadataStorage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function isTerminalStatus(value: unknown): value is VercelFlowTerminalStatus {
  return value === 'ready' || value === 'failed' || value === 'timeout';
}

function cleanOptional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseVercelDeploymentMetadata(
  raw: string | null
): VercelDeploymentMetadata | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VercelDeploymentMetadata>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.projectName || !isTerminalStatus(parsed.status)) return null;
    if (typeof parsed.lastDeploymentTime !== 'string') return null;
    return {
      projectName: parsed.projectName,
      projectId: cleanOptional(parsed.projectId),
      deploymentId: cleanOptional(parsed.deploymentId),
      deploymentUrl: cleanOptional(parsed.deploymentUrl),
      productionUrl: cleanOptional(parsed.productionUrl),
      status: parsed.status,
      lastDeploymentTime: parsed.lastDeploymentTime,
      logs: Array.isArray(parsed.logs) ? parsed.logs.slice(-20) : [],
    };
  } catch {
    return null;
  }
}

export function loadVercelDeploymentMetadata(
  projectName: string,
  storage: MetadataStorage | null = getLocalStorage()
): VercelDeploymentMetadata | null {
  if (!storage) return null;
  const metadata = parseVercelDeploymentMetadata(
    storage.getItem(`${VERCEL_DEPLOYMENT_METADATA_KEY}:${projectName}`)
  );
  return metadata?.projectName === projectName ? metadata : null;
}

export function saveVercelDeploymentMetadata(
  metadata: VercelDeploymentMetadata,
  storage: MetadataStorage | null = getLocalStorage()
): VercelDeploymentMetadata {
  const safeMetadata = {
    ...metadata,
    logs: metadata.logs.slice(-20),
  };
  storage?.setItem(
    `${VERCEL_DEPLOYMENT_METADATA_KEY}:${metadata.projectName}`,
    JSON.stringify(safeMetadata)
  );
  return safeMetadata;
}

export function clearVercelDeploymentMetadata(
  projectName: string,
  storage: MetadataStorage | null = getLocalStorage()
): void {
  storage?.removeItem(`${VERCEL_DEPLOYMENT_METADATA_KEY}:${projectName}`);
}
