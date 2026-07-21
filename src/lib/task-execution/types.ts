import type { FileNode } from '@/app/chat-workspace/components/types';
import type { ExtractedResponse } from '@/lib/repo/extractors';
import type { RepositoryModel, RepositoryTaskContext } from '@/lib/repository-model';
import type { TaskGraph, TaskGraphTask } from '@/lib/task-graph';

export const TASK_EXECUTION_SCHEMA_VERSION = 1;
export const TASK_EXECUTION_METADATA_VERSION = '2026-07-20';

export type TaskExecutionStatus =
  | 'idle'
  | 'running'
  | 'validating'
  | 'passed'
  | 'recoverable-failure'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'stale';

export interface TaskExecutionGuard {
  projectId?: string;
  taskId: string;
  runId: string;
  operationId: string;
}

export interface TaskExecutionAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TaskExecutionAiResponse {
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface TaskExecutionAiClient {
  complete: (
    messages: TaskExecutionAiMessage[],
    options: {
      signal?: AbortSignal;
      task: TaskGraphTask;
      context: RepositoryTaskContext;
      runId: string;
      operationId: string;
    }
  ) => Promise<TaskExecutionAiResponse>;
}

export interface TaskValidationResult {
  ok: boolean;
  outcome?: TaskValidationOutcome;
  summary: string;
  commands: Array<{
    command: string;
    status: 'passed' | 'failed' | 'skipped';
    output?: string;
  }>;
  errors: string[];
  warnings: string[];
  evidence?: TaskValidationEvidence[];
}

export interface TaskExecutionValidationRunner {
  validate: (
    files: FileNode[],
    task: TaskGraphTask,
    repositoryModel: RepositoryModel,
    options: { signal?: AbortSignal; runId: string; operationId: string }
  ) => Promise<TaskValidationResult>;
}

export type TaskValidationOutcome =
  | 'passed'
  | 'failed'
  | 'recoverable'
  | 'blocked by environment'
  | 'cancelled'
  | 'manual review required';

export type TaskValidationKind =
  | 'required-files'
  | 'package-manifest'
  | 'typescript-config'
  | 'import-integrity'
  | 'schema'
  | 'server-only-env'
  | 'type-check'
  | 'build'
  | 'runtime-smoke'
  | 'generated-quality'
  | 'style-audit'
  | 'contract-acceptance';

export interface TaskValidationEvidence {
  kind: TaskValidationKind | 'command' | 'error';
  status: 'passed' | 'failed' | 'skipped' | 'blocked';
  message: string;
  file?: string;
  raw?: string;
}

export interface TaskValidationPlan {
  taskId: string;
  kinds: TaskValidationKind[];
  typeCheckOnly: boolean;
  build: boolean;
  runtimeSmoke: boolean;
  generatedQuality: boolean;
  styleAudit: boolean;
  milestone: boolean;
}

export interface TaskExecutionState {
  schemaVersion: typeof TASK_EXECUTION_SCHEMA_VERSION;
  metadataVersion: typeof TASK_EXECUTION_METADATA_VERSION;
  projectId?: string;
  activeTaskId?: string;
  activeRunId?: string;
  activeOperationId?: string;
  status: TaskExecutionStatus;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  repositoryFingerprint?: string;
  validationSummary?: string;
  warnings: string[];
  errors: string[];
}

export interface TaskExecutionOptions {
  enabled: boolean;
  projectId?: string;
  graph: TaskGraph;
  files: FileNode[];
  repositoryModel?: RepositoryModel | null;
  aiClient?: TaskExecutionAiClient;
  validationRunner?: TaskExecutionValidationRunner;
  targetedRepair?: TaskExecutionRepairOptions;
  signal?: AbortSignal;
  runId?: string;
  operationId?: string;
  now?: Date;
  generatedFilePaths?: string[];
  userEditedFilePaths?: string[];
  protectedPaths?: string[];
  shouldAcceptResult?: (guard: TaskExecutionGuard) => boolean;
}

export interface TaskExecutionRepairOptions {
  enabled: boolean;
  maxAttempts?: number;
  aiClient?: TaskExecutionAiClient;
}

export interface AppliedTaskChange {
  path: string;
  kind: 'create' | 'update' | 'edit' | 'skip';
  description: string;
}

export interface RejectedTaskChange {
  path: string;
  reason: string;
}

export interface TaskExecutionResult {
  status: TaskExecutionStatus;
  task?: TaskGraphTask;
  graph: TaskGraph;
  files: FileNode[];
  repositoryModel: RepositoryModel;
  state: TaskExecutionState;
  extracted?: ExtractedResponse;
  validation?: TaskValidationResult;
  appliedChanges: AppliedTaskChange[];
  rejectedChanges: RejectedTaskChange[];
  warnings: string[];
  errors: string[];
}
