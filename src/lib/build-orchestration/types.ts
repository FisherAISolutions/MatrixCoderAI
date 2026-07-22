import type { FileNode } from '@/app/chat-workspace/components/types';
import type { BuildContract } from '@/lib/build-contract';
import type { CapabilityResolutionResult } from '@/lib/capabilities';
import type { ContractReviewReport } from '@/lib/contract-review';
import type { EngineeringMemory } from '@/lib/engineering-memory';
import type { RepositoryModel } from '@/lib/repository-model';
import type { TaskExecutionResult, TaskExecutionState } from '@/lib/task-execution';
import type { TaskGraph, TaskGraphTask } from '@/lib/task-graph';
import type { ValidationResult } from '@/lib/validation';

export const BUILD_ORCHESTRATION_SCHEMA_VERSION = 1;
export const BUILD_ORCHESTRATION_METADATA_VERSION = '2026-07-22';

export type BuildOrchestrationStatus =
  | 'idle'
  | 'preparing'
  | 'running'
  | 'paused'
  | 'validating'
  | 'reviewing'
  | 'completed'
  | 'recoverable-failure'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'stale';

export type BuildOrchestrationStopReason =
  | 'completed'
  | 'cancelled-by-user'
  | 'recoverable-task-failure'
  | 'critical-task-failure'
  | 'environment-blocked'
  | 'contract-incomplete'
  | 'manual-review-required'
  | 'stale-run'
  | 'safety-limit'
  | 'no-ready-task';

export interface BuildOrchestrationState {
  schemaVersion: typeof BUILD_ORCHESTRATION_SCHEMA_VERSION;
  metadataVersion: typeof BUILD_ORCHESTRATION_METADATA_VERSION;
  projectId: string;
  contractId: string;
  contractVersion: number;
  runId?: string;
  operationId?: string;
  status: BuildOrchestrationStatus;
  activeTaskId?: string;
  completedTaskCount: number;
  totalTaskCount: number;
  contractRepairRound: number;
  maximumContractRepairRounds: number;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  repositoryFingerprint?: string;
  lastValidationSummary?: string;
  stopReason?: BuildOrchestrationStopReason;
  warnings: string[];
  errors: string[];
}

export interface InitializedTaskDrivenBuild {
  state: BuildOrchestrationState;
  graph: TaskGraph;
  repositoryModel: RepositoryModel;
  engineeringMemory: EngineeringMemory;
  files: FileNode[];
}

export type BuildOrchestrationEventType =
  | 'initialized'
  | 'task-started'
  | 'task-finished'
  | 'checkpoint'
  | 'final-validation-started'
  | 'contract-review-started'
  | 'repair-tasks-added'
  | 'completed'
  | 'stopped';

export interface BuildOrchestrationSnapshot {
  state: BuildOrchestrationState;
  graph: TaskGraph;
  repositoryModel: RepositoryModel;
  engineeringMemory: EngineeringMemory;
  files: FileNode[];
  taskExecutionState?: TaskExecutionState;
  contractReviewReport?: ContractReviewReport;
  finalValidationResult?: ValidationResult;
}

export interface BuildOrchestrationEvent extends BuildOrchestrationSnapshot {
  type: BuildOrchestrationEventType;
  task?: TaskGraphTask;
  taskResult?: TaskExecutionResult;
  message: string;
}

export interface InitializeTaskDrivenBuildOptions {
  projectId: string;
  contract: BuildContract;
  capabilityResolution: CapabilityResolutionResult;
  files: FileNode[];
  existingGraph?: TaskGraph | null;
  existingRepositoryModel?: RepositoryModel | null;
  existingEngineeringMemory?: EngineeringMemory | null;
  existingState?: BuildOrchestrationState | null;
  generatedFilePaths?: string[];
  userEditedFilePaths?: string[];
  protectedPaths?: string[];
  maximumContractRepairRounds?: number;
  now?: Date;
}

export interface TaskDrivenBuildDependencies {
  executeTask?: (
    options: import('@/lib/task-execution').TaskExecutionOptions
  ) => Promise<TaskExecutionResult>;
  runFinalValidation?: (
    files: FileNode[],
    options: import('@/lib/validation').ValidationOptions
  ) => Promise<ValidationResult>;
  createReviewReport?: (
    options: import('@/lib/contract-review').CreateContractReviewOptions
  ) => ContractReviewReport;
}

export interface RunTaskDrivenBuildOptions extends InitializedTaskDrivenBuild {
  projectId: string;
  contract: BuildContract;
  capabilityResolution: CapabilityResolutionResult;
  signal?: AbortSignal;
  generatedFilePaths?: string[];
  userEditedFilePaths?: string[];
  protectedPaths?: string[];
  contractReviewReport?: ContractReviewReport;
  finalValidationResult?: ValidationResult;
  maxTaskExecutions?: number;
  shouldAcceptResult?: (guard: {
    projectId: string;
    runId: string;
    operationId: string;
  }) => boolean;
  onEvent?: (event: BuildOrchestrationEvent) => void | Promise<void>;
  dependencies?: TaskDrivenBuildDependencies;
}

export interface TaskDrivenBuildResult extends BuildOrchestrationSnapshot {
  stopReason: BuildOrchestrationStopReason;
}
