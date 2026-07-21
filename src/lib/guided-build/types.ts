import type { EngineeringMemoryBuildStatus } from '@/lib/engineering-memory';
import type {
  EngineeringDiscipline,
  TaskGraphPriority,
  TaskGraphStatus,
} from '@/lib/task-graph';

export type GuidedBuildMilestoneStatus =
  | 'not-started'
  | 'ready'
  | 'running'
  | 'validating'
  | 'passed'
  | 'recoverable'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type GuidedBuildOverallStatus =
  | 'not-started'
  | 'in-progress'
  | 'needs-attention'
  | 'paused'
  | 'passed'
  | 'cancelled';

export interface GuidedBuildActionState {
  retryableTaskIds: string[];
  resumableTaskIds: string[];
  skippableTaskIds: string[];
  cancellableTaskIds: string[];
}

export interface GuidedBuildMilestone {
  id: string;
  taskIds: string[];
  primaryTaskId?: string;
  title: string;
  status: GuidedBuildMilestoneStatus;
  progress: number;
  explanation: string;
  currentAction: string;
  importantWarning?: string;
  priority: TaskGraphPriority;
  canRetry: boolean;
  canResume: boolean;
  canSkip: boolean;
  canCancel: boolean;
}

export interface GuidedBuildTechnicalDetail {
  taskId: string;
  title: string;
  status: TaskGraphStatus;
  discipline: EngineeringDiscipline;
  category: string;
  filesChanged: string[];
  validationCommands: string[];
  exactErrors: string[];
  retries: {
    current: number;
    maximum: number;
    exhausted: boolean;
  };
  repositoryContext: {
    allowedFileScope: string[];
    expectedFiles: string[];
    capabilityIds: string[];
    sourceRequirementIds: string[];
  };
  acceptanceCriteria: string[];
  evidence: string[];
}

export interface GuidedBuildState {
  projectId?: string;
  projectName: string;
  overallStatus: GuidedBuildOverallStatus;
  memoryStatus?: EngineeringMemoryBuildStatus;
  progress: {
    total: number;
    completed: number;
    failed: number;
    blocked: number;
    cancelled: number;
    remaining: number;
    percentComplete: number;
  };
  currentMilestoneId?: string;
  milestones: GuidedBuildMilestone[];
  technicalDetails: GuidedBuildTechnicalDetail[];
  actions: GuidedBuildActionState;
  warnings: string[];
  updatedAt?: string;
}
