import type { TaskExecutionState, TaskExecutionStatus } from './types';
import {
  TASK_EXECUTION_METADATA_VERSION,
  TASK_EXECUTION_SCHEMA_VERSION,
} from './types';

export function createTaskExecutionState(
  status: TaskExecutionStatus = 'idle',
  now = new Date(),
  overrides: Partial<TaskExecutionState> = {}
): TaskExecutionState {
  const nowIso = now.toISOString();
  return {
    schemaVersion: TASK_EXECUTION_SCHEMA_VERSION,
    metadataVersion: TASK_EXECUTION_METADATA_VERSION,
    status,
    updatedAt: nowIso,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

export function serializeTaskExecutionState(state: TaskExecutionState): string {
  return JSON.stringify(state);
}

export function deserializeTaskExecutionState(raw: string): TaskExecutionState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TaskExecutionState>;
    if (
      parsed.schemaVersion !== TASK_EXECUTION_SCHEMA_VERSION ||
      parsed.metadataVersion !== TASK_EXECUTION_METADATA_VERSION ||
      typeof parsed.status !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }
    return {
      schemaVersion: TASK_EXECUTION_SCHEMA_VERSION,
      metadataVersion: TASK_EXECUTION_METADATA_VERSION,
      projectId:
        typeof parsed.projectId === 'string' ? parsed.projectId : undefined,
      activeTaskId:
        typeof parsed.activeTaskId === 'string' ? parsed.activeTaskId : undefined,
      activeRunId:
        typeof parsed.activeRunId === 'string' ? parsed.activeRunId : undefined,
      activeOperationId:
        typeof parsed.activeOperationId === 'string'
          ? parsed.activeOperationId
          : undefined,
      status: parsed.status as TaskExecutionState['status'],
      startedAt:
        typeof parsed.startedAt === 'string' ? parsed.startedAt : undefined,
      updatedAt: parsed.updatedAt,
      finishedAt:
        typeof parsed.finishedAt === 'string' ? parsed.finishedAt : undefined,
      repositoryFingerprint:
        typeof parsed.repositoryFingerprint === 'string'
          ? parsed.repositoryFingerprint
          : undefined,
      validationSummary:
        typeof parsed.validationSummary === 'string'
          ? parsed.validationSummary
          : undefined,
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter((item): item is string => typeof item === 'string')
        : [],
      errors: Array.isArray(parsed.errors)
        ? parsed.errors.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export function createRunId(now = new Date()): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `task-run-${crypto.randomUUID()}`;
  }
  return `task-run-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createOperationId(now = new Date()): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `task-op-${crypto.randomUUID()}`;
  }
  return `task-op-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
}

