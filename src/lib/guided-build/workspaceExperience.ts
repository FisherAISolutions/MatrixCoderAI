import type { EngineeringMemory } from '@/lib/engineering-memory';
import type { RepositoryModel } from '@/lib/repository-model';

import type {
  GuidedBuildState,
  GuidedBuildTechnicalDetail,
} from './types';

export const WORKSPACE_EXPERIENCE_MODE_KEY =
  'matrix-coder.workspace-experience-mode.v1';

export type WorkspaceExperienceMode = 'guided' | 'advanced';

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void;
}

export interface GuidedBuildOperationalSummary {
  currentTask: string;
  currentValidation: string;
  currentRepair: string;
  repositoryStatus: string;
  repositoryDetail: string;
  estimatedTime: string;
  completedTasks: number;
  remainingTasks: number;
}

export function readWorkspaceExperienceMode(
  storage?: StorageReader | null
): WorkspaceExperienceMode {
  const stored = storage?.getItem(WORKSPACE_EXPERIENCE_MODE_KEY);
  return stored === 'advanced' ? 'advanced' : 'guided';
}

export function writeWorkspaceExperienceMode(
  storage: StorageWriter,
  mode: WorkspaceExperienceMode
): void {
  storage.setItem(WORKSPACE_EXPERIENCE_MODE_KEY, mode);
}

export function estimateGuidedBuildTime(
  remainingTasks: number,
  active = false
): string {
  if (remainingTasks <= 0) return 'Complete';

  const lowMinutes = Math.max(2, remainingTasks * 2 - (active ? 1 : 0));
  const highMinutes = Math.max(lowMinutes + 2, remainingTasks * 6);
  return `About ${lowMinutes}-${highMinutes} min`;
}

function validationSummary(
  current: GuidedBuildTechnicalDetail | undefined,
  memory?: EngineeringMemory | null
): string {
  if (!current) return 'Waiting for the first engineering task';
  if (current.status === 'validating') return 'Validation is running';
  if (current.status === 'passed') return 'Current task checks passed';

  const latestEvidence = [...(memory?.taskExecutionHistory ?? [])]
    .reverse()
    .find((entry) => entry.taskId === current.taskId)
    ?.validationEvidence.at(-1);

  if (latestEvidence?.status === 'failed') {
    return latestEvidence.description || `${latestEvidence.ref} failed`;
  }
  if (latestEvidence?.status === 'passed') {
    return latestEvidence.description || `${latestEvidence.ref} passed`;
  }
  if (current.validationCommands.length > 0) {
    return `Next check: ${current.validationCommands[0]}`;
  }
  return 'Task-specific checks will run after changes are applied';
}

function repairSummary(
  current: GuidedBuildTechnicalDetail | undefined
): string {
  if (!current) return 'No repair in progress';
  if (
    current.status === 'recoverable-failure' ||
    current.status === 'failed' ||
    current.status === 'blocked'
  ) {
    return current.retries.exhausted
      ? 'Repair limit reached; review required'
      : `Targeted retry available (${current.retries.current}/${current.retries.maximum})`;
  }
  if (current.retries.current > 0) {
    return `Targeted repair attempt ${current.retries.current}/${current.retries.maximum}`;
  }
  return 'No repair needed';
}

function repositorySummary(repository?: RepositoryModel | null): {
  status: string;
  detail: string;
} {
  if (!repository) {
    return {
      status: 'Repository scan pending',
      detail: 'Matrix will inspect the repository before the next task.',
    };
  }

  if (repository.stale) {
    return {
      status: 'Repository refresh required',
      detail: `${repository.files.length} files tracked; repository fingerprint is stale.`,
    };
  }

  const issueCount =
    repository.currentValidationErrors.length +
    repository.unresolvedImports.length +
    repository.duplicateScaffoldRisks.length;

  return {
    status: issueCount > 0 ? 'Repository needs attention' : 'Repository is current',
    detail: `${repository.files.length} files, ${repository.routes.filter((route) => route.kind === 'page').length} routes, ${issueCount} known issue${issueCount === 1 ? '' : 's'}.`,
  };
}

export function createGuidedBuildOperationalSummary(options: {
  guidedState: GuidedBuildState;
  repositoryModel?: RepositoryModel | null;
  engineeringMemory?: EngineeringMemory | null;
  active?: boolean;
}): GuidedBuildOperationalSummary {
  const currentMilestone = options.guidedState.milestones.find(
    (milestone) => milestone.id === options.guidedState.currentMilestoneId
  );
  const currentTechnical = currentMilestone?.primaryTaskId
    ? options.guidedState.technicalDetails.find(
        (detail) => detail.taskId === currentMilestone.primaryTaskId
      )
    : undefined;
  const repository = repositorySummary(options.repositoryModel);

  return {
    currentTask:
      currentMilestone?.currentAction ??
      'Waiting for an approved plan and engineering tasks',
    currentValidation: validationSummary(
      currentTechnical,
      options.engineeringMemory
    ),
    currentRepair: repairSummary(currentTechnical),
    repositoryStatus: repository.status,
    repositoryDetail: repository.detail,
    estimatedTime: estimateGuidedBuildTime(
      options.guidedState.progress.remaining,
      options.active
    ),
    completedTasks: options.guidedState.progress.completed,
    remainingTasks: options.guidedState.progress.remaining,
  };
}
