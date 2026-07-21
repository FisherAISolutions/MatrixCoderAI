import type {
  EngineeringDiscipline,
  TaskFailureClassification,
  TaskGraph,
  TaskGraphCategory,
  TaskGraphPriority,
  TaskGraphStatus,
  TaskGraphTask,
  TaskGraphWarning,
} from './types';
import {
  TASK_GRAPH_METADATA_VERSION,
  TASK_GRAPH_SCHEMA_VERSION,
} from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function safeStatus(value: unknown): TaskGraphStatus {
  return [
    'pending',
    'ready',
    'running',
    'validating',
    'passed',
    'recoverable-failure',
    'blocked',
    'failed',
    'cancelled',
    'skipped',
  ].includes(String(value))
    ? (value as TaskGraphStatus)
    : 'pending';
}

function safeCategory(value: unknown): TaskGraphCategory {
  return [
    'foundation',
    'environment',
    'data',
    'authentication',
    'backend',
    'frontend',
    'AI',
    'storage',
    'testing',
    'review',
    'deployment',
  ].includes(String(value))
    ? (value as TaskGraphCategory)
    : 'foundation';
}

function safeDiscipline(value: unknown): EngineeringDiscipline {
  return [
    'foundation',
    'architecture',
    'database',
    'authentication',
    'backend',
    'frontend',
    'AI integration',
    'storage/media',
    'testing',
    'review',
    'deployment',
  ].includes(String(value))
    ? (value as EngineeringDiscipline)
    : 'architecture';
}

function safePriority(value: unknown): TaskGraphPriority {
  return ['critical', 'high', 'medium', 'low'].includes(String(value))
    ? (value as TaskGraphPriority)
    : 'medium';
}

function safeFailureClassification(value: unknown): TaskFailureClassification {
  return [
    'none',
    'syntax',
    'type-check',
    'build',
    'runtime',
    'validation',
    'integration',
    'timeout',
    'unknown',
  ].includes(String(value))
    ? (value as TaskFailureClassification)
    : 'none';
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeWarnings(value: unknown): TaskGraphWarning[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TaskGraphWarning => {
    return (
      isObject(item) &&
      typeof item.code === 'string' &&
      typeof item.message === 'string'
    );
  });
}

function safeTask(value: unknown): TaskGraphTask | null {
  if (!isObject(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    category: safeCategory(value.category),
    capabilityIds: stringArray(value.capabilityIds),
    sourceRequirementIds: stringArray(value.sourceRequirementIds),
    dependencies: stringArray(value.dependencies),
    status: safeStatus(value.status),
    priority: safePriority(value.priority),
    allowedFileScope: stringArray(value.allowedFileScope),
    expectedFiles: stringArray(value.expectedFiles),
    expectedOutputs: stringArray(value.expectedOutputs),
    acceptanceChecks: stringArray(value.acceptanceChecks),
    validationCommands: stringArray(value.validationCommands),
    retryCount: safeNumber(value.retryCount, 0),
    maximumRetryCount: safeNumber(value.maximumRetryCount, 2),
    failureClassification: safeFailureClassification(value.failureClassification),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : undefined,
    completedAt:
      typeof value.completedAt === 'string' ? value.completedAt : undefined,
    assignedDiscipline: safeDiscipline(value.assignedDiscipline),
    resultEvidence: Array.isArray(value.resultEvidence)
      ? value.resultEvidence.filter(
          (item) =>
            isObject(item) &&
            typeof item.kind === 'string' &&
            typeof item.ref === 'string'
        ) as TaskGraphTask['resultEvidence']
      : [],
    blockedReason:
      typeof value.blockedReason === 'string' ? value.blockedReason : undefined,
    resumable: value.resumable !== false,
    fingerprint:
      typeof value.fingerprint === 'string' ? value.fingerprint : value.id,
  };
}

export function serializeTaskGraph(graph: TaskGraph): string {
  return JSON.stringify(graph);
}

export function deserializeTaskGraph(raw: string): TaskGraph | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TaskGraph>;
    if (
      parsed.schemaVersion !== TASK_GRAPH_SCHEMA_VERSION ||
      parsed.metadataVersion !== TASK_GRAPH_METADATA_VERSION ||
      typeof parsed.id !== 'string' ||
      typeof parsed.projectName !== 'string' ||
      typeof parsed.contractId !== 'string' ||
      typeof parsed.contractVersion !== 'number' ||
      typeof parsed.sourceBuildContractUpdatedAt !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string' ||
      !Array.isArray(parsed.tasks)
    ) {
      return null;
    }

    return {
      schemaVersion: TASK_GRAPH_SCHEMA_VERSION,
      metadataVersion: TASK_GRAPH_METADATA_VERSION,
      id: parsed.id,
      projectId:
        typeof parsed.projectId === 'string' ? parsed.projectId : undefined,
      projectName: parsed.projectName,
      contractId: parsed.contractId,
      contractVersion: parsed.contractVersion,
      capabilityResolutionCreatedAt:
        typeof parsed.capabilityResolutionCreatedAt === 'string'
          ? parsed.capabilityResolutionCreatedAt
          : undefined,
      sourceBuildContractUpdatedAt: parsed.sourceBuildContractUpdatedAt,
      sourceCapabilityRegistryVersion:
        typeof parsed.sourceCapabilityRegistryVersion === 'string'
          ? parsed.sourceCapabilityRegistryVersion
          : undefined,
      tasks: parsed.tasks
        .map((item) => safeTask(item))
        .filter((item): item is TaskGraphTask => Boolean(item)),
      warnings: safeWarnings(parsed.warnings),
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}
