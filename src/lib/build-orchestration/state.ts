import {
  BUILD_ORCHESTRATION_METADATA_VERSION,
  BUILD_ORCHESTRATION_SCHEMA_VERSION,
  type BuildOrchestrationState,
  type BuildOrchestrationStatus,
} from './types';

const VALID_STATUSES = new Set<BuildOrchestrationStatus>([
  'idle',
  'preparing',
  'running',
  'paused',
  'validating',
  'reviewing',
  'completed',
  'recoverable-failure',
  'blocked',
  'failed',
  'cancelled',
  'stale',
]);

export function createBuildOrchestrationState(options: {
  projectId: string;
  contractId: string;
  contractVersion: number;
  totalTaskCount: number;
  completedTaskCount?: number;
  maximumContractRepairRounds?: number;
  now?: Date;
}): BuildOrchestrationState {
  const now = options.now ?? new Date();
  return {
    schemaVersion: BUILD_ORCHESTRATION_SCHEMA_VERSION,
    metadataVersion: BUILD_ORCHESTRATION_METADATA_VERSION,
    projectId: options.projectId,
    contractId: options.contractId,
    contractVersion: options.contractVersion,
    status: 'idle',
    completedTaskCount: options.completedTaskCount ?? 0,
    totalTaskCount: options.totalTaskCount,
    contractRepairRound: 0,
    maximumContractRepairRounds: options.maximumContractRepairRounds ?? 2,
    updatedAt: now.toISOString(),
    warnings: [],
    errors: [],
  };
}

export function serializeBuildOrchestrationState(
  state: BuildOrchestrationState
): string {
  return JSON.stringify(state);
}

export function deserializeBuildOrchestrationState(
  raw: string
): BuildOrchestrationState | null {
  try {
    const value = JSON.parse(raw) as Partial<BuildOrchestrationState>;
    if (
      value.schemaVersion !== BUILD_ORCHESTRATION_SCHEMA_VERSION ||
      value.metadataVersion !== BUILD_ORCHESTRATION_METADATA_VERSION ||
      typeof value.projectId !== 'string' ||
      typeof value.contractId !== 'string' ||
      typeof value.contractVersion !== 'number' ||
      typeof value.status !== 'string' ||
      !VALID_STATUSES.has(value.status as BuildOrchestrationStatus) ||
      typeof value.updatedAt !== 'string'
    ) {
      return null;
    }

    return {
      schemaVersion: BUILD_ORCHESTRATION_SCHEMA_VERSION,
      metadataVersion: BUILD_ORCHESTRATION_METADATA_VERSION,
      projectId: value.projectId,
      contractId: value.contractId,
      contractVersion: value.contractVersion,
      runId: typeof value.runId === 'string' ? value.runId : undefined,
      operationId:
        typeof value.operationId === 'string' ? value.operationId : undefined,
      status: value.status as BuildOrchestrationStatus,
      activeTaskId:
        typeof value.activeTaskId === 'string' ? value.activeTaskId : undefined,
      completedTaskCount:
        typeof value.completedTaskCount === 'number'
          ? value.completedTaskCount
          : 0,
      totalTaskCount:
        typeof value.totalTaskCount === 'number' ? value.totalTaskCount : 0,
      contractRepairRound:
        typeof value.contractRepairRound === 'number'
          ? value.contractRepairRound
          : 0,
      maximumContractRepairRounds:
        typeof value.maximumContractRepairRounds === 'number'
          ? value.maximumContractRepairRounds
          : 2,
      startedAt:
        typeof value.startedAt === 'string' ? value.startedAt : undefined,
      updatedAt: value.updatedAt,
      finishedAt:
        typeof value.finishedAt === 'string' ? value.finishedAt : undefined,
      repositoryFingerprint:
        typeof value.repositoryFingerprint === 'string'
          ? value.repositoryFingerprint
          : undefined,
      lastValidationSummary:
        typeof value.lastValidationSummary === 'string'
          ? value.lastValidationSummary
          : undefined,
      stopReason: value.stopReason,
      warnings: Array.isArray(value.warnings)
        ? value.warnings.filter((item): item is string => typeof item === 'string')
        : [],
      errors: Array.isArray(value.errors)
        ? value.errors.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export function restoreBuildOrchestrationState(
  state: BuildOrchestrationState,
  now = new Date()
): BuildOrchestrationState {
  if (!['running', 'preparing', 'validating', 'reviewing'].includes(state.status)) {
    return state;
  }
  return {
    ...state,
    status: 'recoverable-failure',
    activeTaskId: undefined,
    finishedAt: undefined,
    updatedAt: now.toISOString(),
    stopReason: 'recoverable-task-failure',
    warnings: [
      ...state.warnings,
      'The previous build was interrupted and can be resumed safely.',
    ],
  };
}
