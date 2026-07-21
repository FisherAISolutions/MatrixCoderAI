import type {
  EngineeringMemory,
  EngineeringMemoryBuildStatus,
  EngineeringMemoryCapabilitySnapshot,
  EngineeringMemoryCheckpoint,
  EngineeringMemoryFileOwnership,
  EngineeringMemoryIssue,
  EngineeringMemoryRestoreAction,
  EngineeringMemoryTaskHistoryEntry,
  EngineeringMemoryValidationEvidence,
} from './types';
import { deserializeTaskGraph } from '@/lib/task-graph';
import {
  ENGINEERING_MEMORY_METADATA_VERSION,
  ENGINEERING_MEMORY_SCHEMA_VERSION,
} from './types';

const SECRET_PATTERN =
  /(OPENAI_API_KEY|VERCEL_TOKEN|SUPABASE_SERVICE_ROLE|SERVICE_ROLE|api[_-]?key|secret|token|password|authorization|bearer|sk-[a-z0-9_-]+)/gi;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? sanitizeText(value) : fallback;
}

export function sanitizeText(value: string): string {
  return value.replace(SECRET_PATTERN, '[redacted]');
}

function sanitizeUnknown<T>(value: T): T {
  if (typeof value === 'string') return sanitizeText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeUnknown) as T;
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeUnknown(entry)])
  ) as T;
}

function safeBuildStatus(value: unknown): EngineeringMemoryBuildStatus {
  return [
    'not-started',
    'planning',
    'in-progress',
    'recoverable',
    'blocked',
    'passed',
    'failed',
    'cancelled',
  ].includes(String(value))
    ? (value as EngineeringMemoryBuildStatus)
    : 'planning';
}

function safeRestoreAction(value: unknown): value is EngineeringMemoryRestoreAction {
  return ['resume', 'retry', 'review'].includes(String(value));
}

function safeCapability(value: unknown): EngineeringMemoryCapabilitySnapshot | null {
  if (!isObject(value) || typeof value.capabilityId !== 'string') return null;
  return {
    capabilityId: safeString(value.capabilityId),
    status: value.status === 'optional' ? 'optional' : 'required',
    source:
      value.source === 'dependency' || value.source === 'domain-pack'
        ? value.source
        : 'contract',
    sourceRequirementIds: stringArray(value.sourceRequirementIds).map(sanitizeText),
  };
}

function safeEvidence(value: unknown): EngineeringMemoryValidationEvidence | null {
  if (!isObject(value) || typeof value.ref !== 'string') return null;
  return {
    kind: ['file', 'route', 'command', 'requirement', 'validation', 'note'].includes(
      String(value.kind)
    )
      ? value.kind as EngineeringMemoryValidationEvidence['kind']
      : 'note',
    ref: safeString(value.ref),
    status: ['passed', 'failed', 'skipped', 'blocked', 'unknown'].includes(
      String(value.status)
    )
      ? value.status as EngineeringMemoryValidationEvidence['status']
      : 'unknown',
    description:
      typeof value.description === 'string'
        ? sanitizeText(value.description)
        : undefined,
  };
}

function safeIssue(value: unknown): EngineeringMemoryIssue | null {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return null;
  }
  return {
    id: safeString(value.id),
    severity: ['info', 'warning', 'error'].includes(String(value.severity))
      ? value.severity as EngineeringMemoryIssue['severity']
      : 'warning',
    title: safeString(value.title),
    description: safeString(value.description),
    taskId: typeof value.taskId === 'string' ? safeString(value.taskId) : undefined,
    requirementId:
      typeof value.requirementId === 'string'
        ? safeString(value.requirementId)
        : undefined,
    createdAt: value.createdAt,
    resolvedAt:
      typeof value.resolvedAt === 'string' ? value.resolvedAt : undefined,
  };
}

function safeFileOwnership(value: unknown): EngineeringMemoryFileOwnership | null {
  if (!isObject(value) || typeof value.path !== 'string') return null;
  return {
    path: value.path.replace(/\\/g, '/'),
    ownerTaskId:
      typeof value.ownerTaskId === 'string' ? safeString(value.ownerTaskId) : undefined,
    capabilityIds: stringArray(value.capabilityIds).map(sanitizeText),
    generated: value.generated === true,
    userEdited: value.userEdited === true,
    protected: value.protected === true,
    lastChangedAt:
      typeof value.lastChangedAt === 'string' ? value.lastChangedAt : undefined,
  };
}

function safeHistory(value: unknown): EngineeringMemoryTaskHistoryEntry | null {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.taskId !== 'string' ||
    typeof value.taskTitle !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return null;
  }
  return {
    id: safeString(value.id),
    taskId: safeString(value.taskId),
    taskTitle: safeString(value.taskTitle),
    category: typeof value.category === 'string'
      ? value.category as EngineeringMemoryTaskHistoryEntry['category']
      : 'foundation',
    assignedDiscipline: typeof value.assignedDiscipline === 'string'
      ? value.assignedDiscipline as EngineeringMemoryTaskHistoryEntry['assignedDiscipline']
      : 'architecture',
    status: typeof value.status === 'string'
      ? value.status as EngineeringMemoryTaskHistoryEntry['status']
      : 'pending',
    failureClassification: typeof value.failureClassification === 'string'
      ? value.failureClassification as EngineeringMemoryTaskHistoryEntry['failureClassification']
      : 'none',
    retryCount:
      typeof value.retryCount === 'number' && Number.isFinite(value.retryCount)
        ? value.retryCount
        : 0,
    runId: typeof value.runId === 'string' ? safeString(value.runId) : undefined,
    operationId:
      typeof value.operationId === 'string' ? safeString(value.operationId) : undefined,
    changedFiles: stringArray(value.changedFiles).map((path) =>
      sanitizeText(path.replace(/\\/g, '/'))
    ),
    validationEvidence: Array.isArray(value.validationEvidence)
      ? value.validationEvidence
          .map(safeEvidence)
          .filter((item): item is EngineeringMemoryValidationEvidence => Boolean(item))
      : [],
    warnings: stringArray(value.warnings).map(sanitizeText),
    errors: stringArray(value.errors).map(sanitizeText),
    createdAt: value.createdAt,
  };
}

function safeCheckpoint(value: unknown): EngineeringMemoryCheckpoint | undefined {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return undefined;
  }

  return {
    id: safeString(value.id),
    label: safeString(value.label),
    createdAt: value.createdAt,
    taskId: typeof value.taskId === 'string' ? safeString(value.taskId) : undefined,
    repositoryFingerprint:
      typeof value.repositoryFingerprint === 'string'
        ? safeString(value.repositoryFingerprint)
        : undefined,
    taskGraph: value.taskGraph
      ? (deserializeTaskGraph(JSON.stringify(value.taskGraph)) ?? undefined)
      : undefined,
    fileOwnership: Array.isArray(value.fileOwnership)
      ? value.fileOwnership
          .map(safeFileOwnership)
          .filter((item): item is EngineeringMemoryFileOwnership => Boolean(item))
      : [],
    completedRequirementIds: stringArray(value.completedRequirementIds).map(sanitizeText),
    validationEvidence: Array.isArray(value.validationEvidence)
      ? value.validationEvidence
          .map(safeEvidence)
          .filter((item): item is EngineeringMemoryValidationEvidence => Boolean(item))
      : [],
  };
}

export function serializeEngineeringMemory(memory: EngineeringMemory): string {
  return JSON.stringify(sanitizeUnknown(memory));
}

export function deserializeEngineeringMemory(raw: string): EngineeringMemory | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EngineeringMemory>;
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== ENGINEERING_MEMORY_SCHEMA_VERSION ||
      parsed.metadataVersion !== ENGINEERING_MEMORY_METADATA_VERSION ||
      typeof parsed.id !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }

    return {
      schemaVersion: ENGINEERING_MEMORY_SCHEMA_VERSION,
      metadataVersion: ENGINEERING_MEMORY_METADATA_VERSION,
      id: safeString(parsed.id),
      projectId:
        typeof parsed.projectId === 'string' ? safeString(parsed.projectId) : undefined,
      buildContractId:
        typeof parsed.buildContractId === 'string'
          ? safeString(parsed.buildContractId)
          : undefined,
      buildContractVersion:
        typeof parsed.buildContractVersion === 'number'
          ? parsed.buildContractVersion
          : undefined,
      capabilityRegistryVersion:
        typeof parsed.capabilityRegistryVersion === 'string'
          ? safeString(parsed.capabilityRegistryVersion)
          : undefined,
      capabilities: Array.isArray(parsed.capabilities)
        ? parsed.capabilities
            .map(safeCapability)
            .filter((item): item is EngineeringMemoryCapabilitySnapshot => Boolean(item))
        : [],
      requiredCapabilityIds: stringArray(parsed.requiredCapabilityIds).map(sanitizeText),
      optionalCapabilityIds: stringArray(parsed.optionalCapabilityIds).map(sanitizeText),
      taskGraph: parsed.taskGraph
        ? (deserializeTaskGraph(JSON.stringify(parsed.taskGraph)) ?? undefined)
        : undefined,
      taskExecutionHistory: Array.isArray(parsed.taskExecutionHistory)
        ? parsed.taskExecutionHistory
            .map(safeHistory)
            .filter((item): item is EngineeringMemoryTaskHistoryEntry => Boolean(item))
        : [],
      completedRequirementIds: stringArray(parsed.completedRequirementIds).map(sanitizeText),
      validationEvidence: Array.isArray(parsed.validationEvidence)
        ? parsed.validationEvidence
            .map(safeEvidence)
            .filter((item): item is EngineeringMemoryValidationEvidence => Boolean(item))
        : [],
      unresolvedIssues: Array.isArray(parsed.unresolvedIssues)
        ? parsed.unresolvedIssues
            .map(safeIssue)
            .filter((item): item is EngineeringMemoryIssue => Boolean(item))
        : [],
      userApprovedWarningIds: stringArray(parsed.userApprovedWarningIds).map(sanitizeText),
      latestRepositoryFingerprint:
        typeof parsed.latestRepositoryFingerprint === 'string'
          ? safeString(parsed.latestRepositoryFingerprint)
          : undefined,
      generatedFileOwnership: Array.isArray(parsed.generatedFileOwnership)
        ? parsed.generatedFileOwnership
            .map(safeFileOwnership)
            .filter((item): item is EngineeringMemoryFileOwnership => Boolean(item))
        : [],
      lastSafeCheckpoint: safeCheckpoint(parsed.lastSafeCheckpoint),
      resumableTaskId:
        typeof parsed.resumableTaskId === 'string'
          ? safeString(parsed.resumableTaskId)
          : undefined,
      overallBuildStatus: safeBuildStatus(parsed.overallBuildStatus),
      restoreOptions: Array.isArray(parsed.restoreOptions)
        ? parsed.restoreOptions.filter(safeRestoreAction)
        : ['review'],
      warnings: stringArray(parsed.warnings).map(sanitizeText),
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}
