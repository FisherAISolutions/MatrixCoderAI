import type { CapabilityApplicability } from '@/lib/capabilities';
import type { RepositoryModel } from '@/lib/repository-model';
import type {
  EngineeringDiscipline,
  TaskFailureClassification,
  TaskGraph,
  TaskGraphCategory,
  TaskGraphStatus,
  TaskGraphTask,
} from '@/lib/task-graph';

export const ENGINEERING_MEMORY_SCHEMA_VERSION = 1;
export const ENGINEERING_MEMORY_METADATA_VERSION = '2026-07-20';

export type EngineeringMemoryBuildStatus =
  | 'not-started'
  | 'planning'
  | 'in-progress'
  | 'recoverable'
  | 'blocked'
  | 'passed'
  | 'failed'
  | 'cancelled';

export type EngineeringMemoryRestoreAction = 'resume' | 'retry' | 'review';

export type EngineeringMemoryIssueSeverity = 'info' | 'warning' | 'error';

export interface EngineeringMemoryCapabilitySnapshot {
  capabilityId: string;
  status: CapabilityApplicability;
  source: 'contract' | 'dependency' | 'domain-pack';
  sourceRequirementIds: string[];
}

export interface EngineeringMemoryValidationEvidence {
  kind: 'file' | 'route' | 'command' | 'requirement' | 'validation' | 'note';
  ref: string;
  status: 'passed' | 'failed' | 'skipped' | 'blocked' | 'unknown';
  description?: string;
}

export interface EngineeringMemoryIssue {
  id: string;
  severity: EngineeringMemoryIssueSeverity;
  title: string;
  description: string;
  taskId?: string;
  requirementId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface EngineeringMemoryFileOwnership {
  path: string;
  ownerTaskId?: string;
  capabilityIds: string[];
  generated: boolean;
  userEdited: boolean;
  protected: boolean;
  lastChangedAt?: string;
}

export interface EngineeringMemoryTaskHistoryEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  category: TaskGraphCategory;
  assignedDiscipline: EngineeringDiscipline;
  status: TaskGraphStatus;
  failureClassification: TaskFailureClassification;
  retryCount: number;
  runId?: string;
  operationId?: string;
  changedFiles: string[];
  validationEvidence: EngineeringMemoryValidationEvidence[];
  warnings: string[];
  errors: string[];
  createdAt: string;
}

export interface EngineeringMemoryCheckpoint {
  id: string;
  label: string;
  createdAt: string;
  taskId?: string;
  repositoryFingerprint?: string;
  taskGraph?: TaskGraph;
  fileOwnership: EngineeringMemoryFileOwnership[];
  completedRequirementIds: string[];
  validationEvidence: EngineeringMemoryValidationEvidence[];
}

export interface EngineeringMemory {
  schemaVersion: typeof ENGINEERING_MEMORY_SCHEMA_VERSION;
  metadataVersion: typeof ENGINEERING_MEMORY_METADATA_VERSION;
  id: string;
  projectId?: string;
  buildContractId?: string;
  buildContractVersion?: number;
  capabilityRegistryVersion?: string;
  capabilities: EngineeringMemoryCapabilitySnapshot[];
  requiredCapabilityIds: string[];
  optionalCapabilityIds: string[];
  taskGraph?: TaskGraph;
  taskExecutionHistory: EngineeringMemoryTaskHistoryEntry[];
  completedRequirementIds: string[];
  validationEvidence: EngineeringMemoryValidationEvidence[];
  unresolvedIssues: EngineeringMemoryIssue[];
  userApprovedWarningIds: string[];
  latestRepositoryFingerprint?: string;
  generatedFileOwnership: EngineeringMemoryFileOwnership[];
  lastSafeCheckpoint?: EngineeringMemoryCheckpoint;
  resumableTaskId?: string;
  overallBuildStatus: EngineeringMemoryBuildStatus;
  restoreOptions: EngineeringMemoryRestoreAction[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEngineeringMemoryOptions {
  projectId?: string;
  buildContract?: import('@/lib/build-contract').BuildContract | null;
  capabilityResolution?: import('@/lib/capabilities').CapabilityResolutionResult | null;
  taskGraph?: TaskGraph | null;
  repositoryModel?: RepositoryModel | null;
  existingMemory?: EngineeringMemory | null;
  now?: Date;
}

export interface RecordTaskExecutionOptions {
  task: TaskGraphTask;
  runId?: string;
  operationId?: string;
  changedFiles?: string[];
  validationEvidence?: EngineeringMemoryValidationEvidence[];
  warnings?: string[];
  errors?: string[];
  repositoryModel?: RepositoryModel | null;
  taskGraph?: TaskGraph | null;
  checkpointOnSuccess?: boolean | string;
  now?: Date;
}

export interface RestoreEngineeringMemoryOptions {
  repositoryModel?: RepositoryModel | null;
  now?: Date;
}

export interface EngineeringMemorySummary {
  overallBuildStatus: EngineeringMemoryBuildStatus;
  completedTaskCount: number;
  totalTaskCount: number;
  completedRequirementCount: number;
  unresolvedIssueCount: number;
  latestRepositoryFingerprint?: string;
  lastSafeCheckpointLabel?: string;
  resumableTaskId?: string;
  restoreOptions: EngineeringMemoryRestoreAction[];
  remainingTaskIds: string[];
  warnings: string[];
}
