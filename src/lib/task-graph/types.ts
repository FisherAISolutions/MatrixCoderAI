import type { BuildContract } from '@/lib/build-contract';
import type { CapabilityResolutionResult } from '@/lib/capabilities';

export const TASK_GRAPH_SCHEMA_VERSION = 1;
export const TASK_GRAPH_METADATA_VERSION = '2026-07-20';

export type TaskGraphStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'validating'
  | 'passed'
  | 'recoverable-failure'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type TaskGraphCategory =
  | 'foundation'
  | 'environment'
  | 'data'
  | 'authentication'
  | 'backend'
  | 'frontend'
  | 'AI'
  | 'storage'
  | 'testing'
  | 'review'
  | 'deployment';

export type EngineeringDiscipline =
  | 'foundation'
  | 'architecture'
  | 'database'
  | 'authentication'
  | 'backend'
  | 'frontend'
  | 'AI integration'
  | 'storage/media'
  | 'testing'
  | 'review'
  | 'deployment';

export type TaskGraphPriority = 'critical' | 'high' | 'medium' | 'low';

export type TaskFailureClassification =
  | 'none'
  | 'syntax'
  | 'type-check'
  | 'build'
  | 'runtime'
  | 'validation'
  | 'integration'
  | 'timeout'
  | 'unknown';

export interface TaskGraphEvidenceReference {
  kind: 'file' | 'route' | 'command' | 'requirement' | 'note';
  ref: string;
  description?: string;
}

export interface TaskGraphTask {
  id: string;
  title: string;
  description: string;
  category: TaskGraphCategory;
  capabilityIds: string[];
  sourceRequirementIds: string[];
  dependencies: string[];
  status: TaskGraphStatus;
  priority: TaskGraphPriority;
  allowedFileScope: string[];
  expectedFiles: string[];
  expectedOutputs: string[];
  acceptanceChecks: string[];
  validationCommands: string[];
  retryCount: number;
  maximumRetryCount: number;
  failureClassification: TaskFailureClassification;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  assignedDiscipline: EngineeringDiscipline;
  resultEvidence: TaskGraphEvidenceReference[];
  blockedReason?: string;
  resumable: boolean;
  fingerprint: string;
}

export interface TaskGraphWarning {
  code:
    | 'dependency-cycle'
    | 'missing-contract'
    | 'missing-capability-resolution'
    | 'unknown-custom-app';
  message: string;
  taskIds?: string[];
}

export interface TaskGraph {
  schemaVersion: typeof TASK_GRAPH_SCHEMA_VERSION;
  metadataVersion: typeof TASK_GRAPH_METADATA_VERSION;
  id: string;
  projectId?: string;
  projectName: string;
  contractId: string;
  contractVersion: number;
  capabilityResolutionCreatedAt?: string;
  sourceBuildContractUpdatedAt: string;
  sourceCapabilityRegistryVersion?: string;
  tasks: TaskGraphTask[];
  warnings: TaskGraphWarning[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskGraphOptions {
  contract: BuildContract;
  capabilityResolution?: CapabilityResolutionResult | null;
  existingGraph?: TaskGraph | null;
  now?: Date;
}

export interface TaskGraphCycle {
  taskIds: string[];
}

export interface TaskGraphProgress {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  cancelled: number;
  skipped: number;
  active: number;
  remaining: number;
  percentComplete: number;
}
