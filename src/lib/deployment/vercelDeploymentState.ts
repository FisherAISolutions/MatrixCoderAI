export type VercelDeploymentPhase =
  | 'readiness-check'
  | 'configuration-required'
  | 'preparing-files'
  | 'creating-or-finding-project'
  | 'uploading'
  | 'building'
  | 'deployed'
  | 'failed'
  | 'cancelled';

const ALLOWED_TRANSITIONS: Record<VercelDeploymentPhase, VercelDeploymentPhase[]> = {
  'readiness-check': ['configuration-required', 'preparing-files', 'failed', 'cancelled'],
  'configuration-required': ['readiness-check', 'cancelled'],
  'preparing-files': ['creating-or-finding-project', 'failed', 'cancelled'],
  'creating-or-finding-project': ['uploading', 'failed', 'cancelled'],
  uploading: ['building', 'failed', 'cancelled'],
  building: ['deployed', 'failed', 'cancelled'],
  deployed: ['readiness-check'],
  failed: ['readiness-check', 'cancelled'],
  cancelled: ['readiness-check'],
};

export function canTransitionVercelDeployment(
  from: VercelDeploymentPhase,
  to: VercelDeploymentPhase
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertVercelDeploymentTransition(
  from: VercelDeploymentPhase,
  to: VercelDeploymentPhase
): void {
  if (!canTransitionVercelDeployment(from, to)) {
    throw new Error(`Invalid Vercel deployment transition: ${from} -> ${to}.`);
  }
}

const activeProjects = new Map<string, string>();

export function acquireVercelDeploymentLock(
  projectId: string,
  operationId: string
): boolean {
  if (activeProjects.has(projectId)) return false;
  activeProjects.set(projectId, operationId);
  return true;
}

export function releaseVercelDeploymentLock(
  projectId: string,
  operationId: string
): void {
  if (activeProjects.get(projectId) === operationId) {
    activeProjects.delete(projectId);
  }
}

export function hasActiveVercelDeployment(projectId: string): boolean {
  return activeProjects.has(projectId);
}

export function resetVercelDeploymentLocksForTests(): void {
  activeProjects.clear();
}
