import {
  deserializeTaskGraph,
  type TaskGraph,
  type TaskGraphEvidenceReference,
} from '@/lib/task-graph';
import {
  ENGINEERING_FOREMAN_METADATA_VERSION,
  ENGINEERING_FOREMAN_SCHEMA_VERSION,
  type EngineeringForemanCheckpoint,
  type EngineeringForemanMilestoneId,
  type EngineeringForemanMilestoneState,
  type EngineeringForemanState,
  type EngineeringForemanTaskState,
  type EngineeringForemanTaskStatus,
} from './types';

const taskStatuses: EngineeringForemanTaskStatus[] = [
  'queued',
  'ready',
  'running',
  'blocked',
  'waiting',
  'needs-repair',
  'validated',
  'complete',
  'cancelled',
  'skipped',
];

const milestoneIds: EngineeringForemanMilestoneId[] = [
  'foundation',
  'authentication',
  'database',
  'core-ui',
  'business-logic',
  'ai-features',
  'deployment',
  'validation',
  'completion',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function evidence(value: unknown): TaskGraphEvidenceReference[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is TaskGraphEvidenceReference =>
          isObject(item) &&
          typeof item.kind === 'string' &&
          typeof item.ref === 'string'
      )
    : [];
}

function taskState(value: unknown): EngineeringForemanTaskState | null {
  if (!isObject(value) || typeof value.taskId !== 'string') return null;
  const status = taskStatuses.includes(value.status as EngineeringForemanTaskStatus)
    ? (value.status as EngineeringForemanTaskStatus)
    : 'queued';
  const milestoneId = milestoneIds.includes(
    value.milestoneId as EngineeringForemanMilestoneId
  )
    ? (value.milestoneId as EngineeringForemanMilestoneId)
    : 'foundation';
  return {
    taskId: value.taskId,
    status,
    milestoneId,
    startCount: typeof value.startCount === 'number' ? value.startCount : 0,
    retryCount: typeof value.retryCount === 'number' ? value.retryCount : 0,
    repairCount: typeof value.repairCount === 'number' ? value.repairCount : 0,
    evidence: evidence(value.evidence),
    repositoryFingerprintBefore:
      typeof value.repositoryFingerprintBefore === 'string'
        ? value.repositoryFingerprintBefore
        : undefined,
    repositoryFingerprintAfter:
      typeof value.repositoryFingerprintAfter === 'string'
        ? value.repositoryFingerprintAfter
        : undefined,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : undefined,
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : undefined,
    validatedAt:
      typeof value.validatedAt === 'string' ? value.validatedAt : undefined,
    lastScheduledAt:
      typeof value.lastScheduledAt === 'string' ? value.lastScheduledAt : undefined,
    blockedReason:
      typeof value.blockedReason === 'string' ? value.blockedReason : undefined,
    resumable: value.resumable === true,
  };
}

function milestone(value: unknown): EngineeringForemanMilestoneState | null {
  if (
    !isObject(value) ||
    !milestoneIds.includes(value.id as EngineeringForemanMilestoneId) ||
    typeof value.title !== 'string'
  ) {
    return null;
  }
  return {
    id: value.id as EngineeringForemanMilestoneId,
    title: value.title,
    status: ['queued', 'active', 'blocked', 'complete'].includes(
      String(value.status)
    )
      ? (value.status as EngineeringForemanMilestoneState['status'])
      : 'queued',
    taskIds: strings(value.taskIds),
    completedTaskIds: strings(value.completedTaskIds),
    blockedTaskIds: strings(value.blockedTaskIds),
  };
}

function checkpoint(value: unknown): EngineeringForemanCheckpoint | undefined {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.validatedTaskId !== 'string' ||
    typeof value.repositoryFingerprint !== 'string'
  ) {
    return undefined;
  }
  const taskGraph = value.taskGraph
    ? deserializeTaskGraph(JSON.stringify(value.taskGraph))
    : null;
  if (!taskGraph) return undefined;
  return {
    id: value.id,
    createdAt: value.createdAt,
    validatedTaskId: value.validatedTaskId,
    taskGraph,
    taskStates: Array.isArray(value.taskStates)
      ? value.taskStates
          .map(taskState)
          .filter((item): item is EngineeringForemanTaskState => Boolean(item))
      : [],
    completedTaskIds: strings(value.completedTaskIds),
    repositoryFingerprint: value.repositoryFingerprint,
    evidenceReferences: strings(value.evidenceReferences),
    engineeringMemoryReferences: strings(value.engineeringMemoryReferences),
    currentMilestone: milestoneIds.includes(
      value.currentMilestone as EngineeringForemanMilestoneId
    )
      ? (value.currentMilestone as EngineeringForemanMilestoneId)
      : 'foundation',
    remainingTaskIds: strings(value.remainingTaskIds),
  };
}

export function serializeEngineeringForemanState(
  state: EngineeringForemanState
): string {
  return JSON.stringify(state);
}

export function deserializeEngineeringForemanState(
  raw: string
): EngineeringForemanState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EngineeringForemanState>;
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== ENGINEERING_FOREMAN_SCHEMA_VERSION ||
      parsed.metadataVersion !== ENGINEERING_FOREMAN_METADATA_VERSION ||
      typeof parsed.id !== 'string' ||
      typeof parsed.projectId !== 'string' ||
      typeof parsed.taskGraphId !== 'string' ||
      typeof parsed.contractId !== 'string' ||
      typeof parsed.contractVersion !== 'number' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }
    const latestCheckpoint = checkpoint(parsed.latestCheckpoint);
    return {
      schemaVersion: ENGINEERING_FOREMAN_SCHEMA_VERSION,
      metadataVersion: ENGINEERING_FOREMAN_METADATA_VERSION,
      id: parsed.id,
      projectId: parsed.projectId,
      taskGraphId: parsed.taskGraphId,
      contractId: parsed.contractId,
      contractVersion: parsed.contractVersion,
      capabilityRegistryVersion:
        typeof parsed.capabilityRegistryVersion === 'string'
          ? parsed.capabilityRegistryVersion
          : undefined,
      taskStates: Array.isArray(parsed.taskStates)
        ? parsed.taskStates
            .map(taskState)
            .filter((item): item is EngineeringForemanTaskState => Boolean(item))
        : [],
      milestones: Array.isArray(parsed.milestones)
        ? parsed.milestones
            .map(milestone)
            .filter(
              (item): item is EngineeringForemanMilestoneState => Boolean(item)
            )
        : [],
      currentMilestone: milestoneIds.includes(
        parsed.currentMilestone as EngineeringForemanMilestoneId
      )
        ? (parsed.currentMilestone as EngineeringForemanMilestoneId)
        : 'foundation',
      activeTaskId:
        typeof parsed.activeTaskId === 'string' ? parsed.activeTaskId : undefined,
      repositoryRefresh:
        isObject(parsed.repositoryRefresh) &&
        typeof parsed.repositoryRefresh.fingerprint === 'string' &&
        typeof parsed.repositoryRefresh.refreshedAt === 'string'
          ? {
              fingerprint: parsed.repositoryRefresh.fingerprint,
              refreshedAt: parsed.repositoryRefresh.refreshedAt,
            }
          : undefined,
      latestCheckpoint,
      checkpointHistory: Array.isArray(parsed.checkpointHistory)
        ? parsed.checkpointHistory
            .map(checkpoint)
            .filter(
              (item): item is EngineeringForemanCheckpoint => Boolean(item)
            )
        : latestCheckpoint
          ? [latestCheckpoint]
          : [],
      cancelled: parsed.cancelled === true,
      cancellationReason:
        typeof parsed.cancellationReason === 'string'
          ? parsed.cancellationReason
          : undefined,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function cloneEngineeringForemanStateForProject(
  state: EngineeringForemanState,
  projectId: string,
  taskGraph: TaskGraph | undefined,
  now = new Date()
): EngineeringForemanState {
  const timestamp = now.toISOString();
  return {
    ...JSON.parse(serializeEngineeringForemanState(state)),
    id: `foreman-${projectId}-${now.getTime().toString(36)}`,
    projectId,
    taskGraphId: taskGraph?.id ?? state.taskGraphId,
    activeTaskId: undefined,
    repositoryRefresh: undefined,
    latestCheckpoint: undefined,
    checkpointHistory: [],
    cancelled: false,
    cancellationReason: undefined,
    taskStates: state.taskStates.map((task) =>
      task.status === 'running'
        ? {
            ...task,
            status: 'needs-repair',
            resumable: true,
            blockedReason: 'Duplicated while task execution was active.',
          }
        : { ...task }
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
