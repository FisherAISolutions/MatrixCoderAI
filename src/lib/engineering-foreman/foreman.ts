import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import type { BuildContract } from '@/lib/build-contract';
import type { CapabilityResolutionResult } from '@/lib/capabilities';
import type { EngineeringMemory } from '@/lib/engineering-memory';
import type { MatrixIntelligenceCore } from '@/lib/intelligence-core';
import type { ArchitectBudgetMode } from '@/lib/matrix-ai-architect/types';
import type { RepositoryModel } from '@/lib/repository-model';
import {
  getReadyTasks,
  type TaskFailureClassification,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';
import {
  buildMilestoneStates,
  getCurrentMilestone,
  getMilestoneForTask,
  mapTaskGraphStatus,
} from './milestones';
import { buildForemanTaskIntelligencePacket } from './packet';
import {
  ENGINEERING_FOREMAN_METADATA_VERSION,
  ENGINEERING_FOREMAN_SCHEMA_VERSION,
  type EngineeringForemanCheckpoint,
  type EngineeringForemanCheckpointRestore,
  type EngineeringForemanDecision,
  type EngineeringForemanFailureDecision,
  type EngineeringForemanState,
  type EngineeringForemanTaskState,
} from './types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string, projectId: string, now: Date): string {
  const safeProject = projectId.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40);
  return `${prefix}-${safeProject}-${now.getTime().toString(36)}`;
}

function stateForTask(
  task: TaskGraphTask,
  previous?: EngineeringForemanTaskState
): EngineeringForemanTaskState {
  const graphStatus = mapTaskGraphStatus(task);
  const preserveRuntime =
    previous &&
    !['complete', 'skipped', 'cancelled'].includes(graphStatus);
  const status =
    previous?.status === 'running' && preserveRuntime
      ? 'running'
      : previous?.status === 'validated' && task.status === 'passed'
        ? 'complete'
        : graphStatus;
  return {
    taskId: task.id,
    status,
    milestoneId: getMilestoneForTask(task),
    startCount: preserveRuntime ? previous.startCount : previous?.startCount ?? 0,
    retryCount: Math.max(previous?.retryCount ?? 0, task.retryCount),
    repairCount: previous?.repairCount ?? 0,
    evidence:
      task.resultEvidence.length > 0
        ? clone(task.resultEvidence)
        : clone(previous?.evidence ?? []),
    repositoryFingerprintBefore: previous?.repositoryFingerprintBefore,
    repositoryFingerprintAfter: previous?.repositoryFingerprintAfter,
    startedAt: task.startedAt ?? previous?.startedAt,
    finishedAt: task.completedAt ?? previous?.finishedAt,
    validatedAt: previous?.validatedAt,
    lastScheduledAt: previous?.lastScheduledAt,
    blockedReason: task.blockedReason ?? previous?.blockedReason,
    resumable: task.resumable,
  };
}

export interface CreateEngineeringForemanStateOptions {
  projectId: string;
  taskGraph: TaskGraph;
  contract: BuildContract;
  capabilityResolution?: CapabilityResolutionResult | null;
  existingState?: EngineeringForemanState | null;
  now?: Date;
}

export function createEngineeringForemanState(
  options: CreateEngineeringForemanStateOptions
): EngineeringForemanState {
  const now = options.now ?? new Date();
  const previousByTask = new Map(
    options.existingState?.taskStates.map((state) => [state.taskId, state]) ?? []
  );
  const taskStates = options.taskGraph.tasks.map((task) =>
    stateForTask(task, previousByTask.get(task.id))
  );
  const milestones = buildMilestoneStates(options.taskGraph, taskStates);
  const existing = options.existingState;
  return {
    schemaVersion: ENGINEERING_FOREMAN_SCHEMA_VERSION,
    metadataVersion: ENGINEERING_FOREMAN_METADATA_VERSION,
    id:
      existing?.projectId === options.projectId
        ? existing.id
        : createId('foreman', options.projectId, now),
    projectId: options.projectId,
    taskGraphId: options.taskGraph.id,
    contractId: options.contract.id,
    contractVersion: options.contract.contractVersion,
    capabilityRegistryVersion:
      options.capabilityResolution?.registryVersion ??
      existing?.capabilityRegistryVersion,
    taskStates,
    milestones,
    currentMilestone: getCurrentMilestone(milestones),
    activeTaskId:
      existing?.activeTaskId &&
      taskStates.some(
        (state) =>
          state.taskId === existing.activeTaskId && state.status === 'running'
      )
        ? existing.activeTaskId
        : undefined,
    repositoryRefresh: existing?.repositoryRefresh,
    latestCheckpoint: existing?.latestCheckpoint,
    checkpointHistory: existing?.checkpointHistory ?? [],
    cancelled: existing?.cancelled ?? false,
    cancellationReason: existing?.cancellationReason,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function confirmForemanRepositoryRefresh(
  state: EngineeringForemanState,
  repositoryModel: RepositoryModel,
  now = new Date()
): EngineeringForemanState {
  return {
    ...state,
    repositoryRefresh: {
      fingerprint: repositoryModel.repositoryFingerprint,
      refreshedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  };
}

function protectedExpectedFiles(
  task: TaskGraphTask,
  repositoryModel: RepositoryModel
): string[] {
  const protectedPaths = new Set(
    repositoryModel.protectedFiles.map((path) => path.replace(/\\/g, '/'))
  );
  return task.expectedFiles
    .map((path) => path.replace(/\\/g, '/'))
    .filter((path) => protectedPaths.has(path));
}

function repairCandidate(
  graph: TaskGraph,
  preferredTaskId?: string
): TaskGraphTask | undefined {
  const candidates = graph.tasks
    .filter(
      (task) =>
        task.status === 'recoverable-failure' &&
        task.resumable &&
        task.retryCount < task.maximumRetryCount
    )
    .sort((a, b) => a.retryCount - b.retryCount);
  return (
    candidates.find((task) => task.id === preferredTaskId) ?? candidates[0]
  );
}

export interface PlanNextEngineeringTaskOptions {
  state: EngineeringForemanState;
  taskGraph: TaskGraph;
  contract: BuildContract;
  capabilityResolution: CapabilityResolutionResult;
  repositoryModel: RepositoryModel;
  intelligenceCore: MatrixIntelligenceCore;
  engineeringMemory: EngineeringMemory;
  blueprintDraft?: BlueprintDraft | null;
  budgetMode?: ArchitectBudgetMode;
  now?: Date;
}

export function planNextEngineeringTask(
  options: PlanNextEngineeringTaskOptions
): EngineeringForemanDecision {
  const now = options.now ?? new Date();
  let state = createEngineeringForemanState({
    projectId: options.state.projectId,
    taskGraph: options.taskGraph,
    contract: options.contract,
    capabilityResolution: options.capabilityResolution,
    existingState: options.state,
    now,
  });
  if (state.cancelled) {
    return {
      kind: 'cancelled',
      reason: state.cancellationReason ?? 'Build orchestration was cancelled.',
      state,
      repositoryRefreshRequired: false,
    };
  }
  if (state.activeTaskId) {
    return {
      kind: 'wait',
      reason: `Task ${state.activeTaskId} is already active; duplicate scheduling is not allowed.`,
      state,
      taskId: state.activeTaskId,
      repositoryRefreshRequired: false,
    };
  }
  if (
    !state.repositoryRefresh ||
    state.repositoryRefresh.fingerprint !==
      options.repositoryModel.repositoryFingerprint
  ) {
    return {
      kind: 'wait',
      reason:
        'Repository Model must be refreshed and confirmed before the next engineering task is scheduled.',
      state,
      repositoryRefreshRequired: true,
    };
  }

  const task =
    repairCandidate(
      options.taskGraph,
      options.engineeringMemory.resumableTaskId
    ) ?? getReadyTasks(options.taskGraph)[0];
  if (!task) {
    const incomplete = options.taskGraph.tasks.filter(
      (item) => !['passed', 'skipped'].includes(item.status)
    );
    if (incomplete.length === 0) {
      return {
        kind: 'complete',
        reason: 'Every Task Graph task is validated or explicitly skipped.',
        state,
        repositoryRefreshRequired: false,
      };
    }
    const blocked = incomplete.filter((item) =>
      ['blocked', 'failed'].includes(item.status)
    );
    return {
      kind: blocked.length > 0 ? 'blocked' : 'wait',
      reason:
        blocked.length > 0
          ? `${blocked.length} task(s) are blocked or exhausted and require escalation.`
          : 'No task is ready because required dependencies are still incomplete.',
      state,
      repositoryRefreshRequired: false,
    };
  }

  const protectedFiles = protectedExpectedFiles(task, options.repositoryModel);
  if (protectedFiles.length > 0) {
    state = {
      ...state,
      taskStates: state.taskStates.map((item) =>
        item.taskId === task.id
          ? {
              ...item,
              status: 'blocked',
              blockedReason: `Expected output is protected: ${protectedFiles.join(', ')}`,
            }
          : item
      ),
      updatedAt: now.toISOString(),
    };
    const milestones = buildMilestoneStates(
      options.taskGraph,
      state.taskStates
    );
    state = {
      ...state,
      milestones,
      currentMilestone: getCurrentMilestone(milestones),
    };
    return {
      kind: 'blocked',
      reason: `Task ${task.id} cannot start because it targets protected file(s): ${protectedFiles.join(', ')}.`,
      state,
      taskId: task.id,
      repositoryRefreshRequired: false,
    };
  }

  const packet = buildForemanTaskIntelligencePacket({
    projectId: state.projectId,
    task,
    graph: options.taskGraph,
    contract: options.contract,
    capabilityResolution: options.capabilityResolution,
    repositoryModel: options.repositoryModel,
    intelligenceCore: options.intelligenceCore,
    blueprintDraft: options.blueprintDraft,
    taskStates: state.taskStates,
    milestoneId: getMilestoneForTask(task),
    budgetMode: options.budgetMode,
    now,
  });
  if (packet.blockedDependencies.length > 0) {
    return {
      kind: 'wait',
      reason: `Task ${task.id} is waiting for ${packet.blockedDependencies.map((item) => item.taskId).join(', ')}.`,
      state,
      taskId: task.id,
      repositoryRefreshRequired: false,
    };
  }

  state = {
    ...state,
    repositoryRefresh: undefined,
    taskStates: state.taskStates.map((item) =>
      item.taskId === task.id
        ? {
            ...item,
            status: task.status === 'recoverable-failure' ? 'needs-repair' : 'ready',
            lastScheduledAt: now.toISOString(),
          }
        : item
    ),
    updatedAt: now.toISOString(),
  };
  return {
    kind: task.status === 'recoverable-failure' ? 'repair' : 'schedule',
    reason:
      task.status === 'recoverable-failure'
        ? `Repair ${task.id} within its existing file scope before any dependent work continues.`
        : `${task.id} is the highest-priority task whose dependencies are satisfied.`,
    state,
    taskId: task.id,
    packet,
    repositoryRefreshRequired: false,
  };
}

export function startForemanTask(
  state: EngineeringForemanState,
  taskId: string,
  repositoryFingerprint: string,
  now = new Date()
): EngineeringForemanState {
  if (state.activeTaskId && state.activeTaskId !== taskId) {
    throw new Error(`Cannot start ${taskId}; ${state.activeTaskId} is already active.`);
  }
  const taskState = state.taskStates.find((item) => item.taskId === taskId);
  if (!taskState) throw new Error(`Unknown Foreman task ${taskId}.`);
  if (['complete', 'skipped', 'cancelled'].includes(taskState.status)) {
    throw new Error(`Task ${taskId} cannot be rerun from ${taskState.status}.`);
  }
  const timestamp = now.toISOString();
  return {
    ...state,
    activeTaskId: taskId,
    taskStates: state.taskStates.map((item) =>
      item.taskId === taskId
        ? {
            ...item,
            status: 'running',
            startCount: item.startCount + 1,
            repositoryFingerprintBefore: repositoryFingerprint,
            startedAt: timestamp,
            blockedReason: undefined,
          }
        : item
    ),
    updatedAt: timestamp,
  };
}

export function decideForemanFailureAction(
  task: TaskGraphTask,
  classification: TaskFailureClassification = task.failureClassification
): EngineeringForemanFailureDecision {
  if (task.status === 'cancelled') {
    return { action: 'cancel', reason: 'The task was cancelled.', retryAllowed: false };
  }
  if (task.status === 'blocked') {
    return {
      action: 'block',
      reason: task.blockedReason ?? 'The task is blocked by an external dependency.',
      retryAllowed: false,
    };
  }
  const retryAllowed = task.retryCount < task.maximumRetryCount && task.resumable;
  if (!retryAllowed) {
    return {
      action: 'escalate',
      reason: 'The bounded retry allowance is exhausted.',
      retryAllowed: false,
    };
  }
  if (
    ['syntax', 'type-check', 'build', 'runtime', 'validation', 'integration'].includes(
      classification
    )
  ) {
    return {
      action: 'repair',
      reason: 'A targeted repair can address the classified engineering failure.',
      retryAllowed: true,
    };
  }
  return {
    action: 'retry',
    reason: 'The task can be retried once within its existing bounded scope.',
    retryAllowed: true,
  };
}

export function recordForemanFailure(
  state: EngineeringForemanState,
  task: TaskGraphTask,
  now = new Date()
): EngineeringForemanState {
  const decision = decideForemanFailureAction(task);
  const timestamp = now.toISOString();
  return {
    ...state,
    activeTaskId: state.activeTaskId === task.id ? undefined : state.activeTaskId,
    taskStates: state.taskStates.map((item) =>
      item.taskId === task.id
        ? {
            ...item,
            status:
              decision.action === 'repair' || decision.action === 'retry'
                ? 'needs-repair'
                : decision.action === 'cancel'
                  ? 'cancelled'
                  : 'blocked',
            retryCount: Math.max(item.retryCount, task.retryCount),
            repairCount:
              decision.action === 'repair' ? item.repairCount + 1 : item.repairCount,
            blockedReason:
              decision.action === 'repair' || decision.action === 'retry'
                ? undefined
                : decision.reason,
            finishedAt: timestamp,
            resumable: decision.retryAllowed,
          }
        : item
    ),
    updatedAt: timestamp,
  };
}

function memoryReferencesForTask(
  memory: EngineeringMemory,
  taskId: string
): string[] {
  return Array.from(
    new Set([
      ...memory.taskExecutionHistory
        .filter((entry) => entry.taskId === taskId)
        .map((entry) => entry.id),
      ...memory.validationEvidence
        .filter((evidence) => evidence.ref.includes(taskId))
        .map((evidence) => `${evidence.kind}:${evidence.ref}`),
    ])
  );
}

export function recordValidatedForemanTask(
  state: EngineeringForemanState,
  graph: TaskGraph,
  repositoryModel: RepositoryModel,
  memory: EngineeringMemory,
  taskId: string,
  now = new Date()
): EngineeringForemanState {
  const graphTask = graph.tasks.find((task) => task.id === taskId);
  if (!graphTask || graphTask.status !== 'passed') {
    throw new Error(`Task ${taskId} must be passed before a Foreman checkpoint.`);
  }
  const timestamp = now.toISOString();
  const taskStates = state.taskStates.map((item) =>
    item.taskId === taskId
      ? {
          ...item,
          status: 'complete' as const,
          evidence: clone(graphTask.resultEvidence),
          repositoryFingerprintAfter: repositoryModel.repositoryFingerprint,
          validatedAt: timestamp,
          finishedAt: timestamp,
          blockedReason: undefined,
          resumable: false,
        }
      : item
  );
  const milestones = buildMilestoneStates(graph, taskStates);
  const currentMilestone = getCurrentMilestone(milestones);
  const completedTaskIds = taskStates
    .filter((item) => item.status === 'complete' || item.status === 'skipped')
    .map((item) => item.taskId);
  const evidenceReferences = graphTask.resultEvidence.map(
    (evidence) => `${evidence.kind}:${evidence.ref}`
  );
  const checkpoint: EngineeringForemanCheckpoint = {
    id: createId('foreman-checkpoint', state.projectId, now),
    createdAt: timestamp,
    validatedTaskId: taskId,
    taskGraph: clone(graph),
    taskStates: clone(taskStates),
    completedTaskIds,
    repositoryFingerprint: repositoryModel.repositoryFingerprint,
    evidenceReferences,
    engineeringMemoryReferences: memoryReferencesForTask(memory, taskId),
    currentMilestone,
    remainingTaskIds: taskStates
      .filter((item) => !['complete', 'skipped', 'cancelled'].includes(item.status))
      .map((item) => item.taskId),
  };
  return {
    ...state,
    taskGraphId: graph.id,
    activeTaskId: state.activeTaskId === taskId ? undefined : state.activeTaskId,
    taskStates,
    milestones,
    currentMilestone,
    repositoryRefresh: undefined,
    latestCheckpoint: checkpoint,
    checkpointHistory: [...state.checkpointHistory.slice(-19), checkpoint],
    updatedAt: timestamp,
  };
}

export function cancelEngineeringForeman(
  state: EngineeringForemanState,
  reason = 'Cancelled by user.',
  now = new Date()
): EngineeringForemanState {
  const timestamp = now.toISOString();
  return {
    ...state,
    activeTaskId: undefined,
    cancelled: true,
    cancellationReason: reason,
    taskStates: state.taskStates.map((task) =>
      ['complete', 'skipped'].includes(task.status)
        ? task
        : {
            ...task,
            status: 'cancelled',
            blockedReason: reason,
            finishedAt: timestamp,
            resumable: false,
          }
    ),
    updatedAt: timestamp,
  };
}

export function restoreEngineeringForemanState(
  state: EngineeringForemanState,
  graph: TaskGraph,
  now = new Date()
): EngineeringForemanState {
  const timestamp = now.toISOString();
  const checkpoint = state.latestCheckpoint;
  const checkpointByTask = new Map(
    checkpoint?.taskStates.map((task) => [task.taskId, task]) ?? []
  );
  const currentByTask = new Map(state.taskStates.map((task) => [task.taskId, task]));
  const taskStates = graph.tasks.map((task) => {
    const saved = checkpointByTask.get(task.id) ?? currentByTask.get(task.id);
    const reconciled = stateForTask(task, saved);
    if (
      reconciled.status === 'running' ||
      task.status === 'running' ||
      task.status === 'validating'
    ) {
      return {
        ...reconciled,
        status: 'needs-repair' as const,
        blockedReason: 'Task execution was interrupted and must be resumed or retried.',
        resumable: true,
      };
    }
    return reconciled;
  });
  const milestones = buildMilestoneStates(graph, taskStates);
  return {
    ...state,
    taskGraphId: graph.id,
    taskStates,
    milestones,
    currentMilestone: getCurrentMilestone(milestones),
    activeTaskId: undefined,
    repositoryRefresh: undefined,
    cancelled: false,
    cancellationReason: undefined,
    updatedAt: timestamp,
  };
}

export function restoreLatestEngineeringForemanCheckpoint(
  state: EngineeringForemanState,
  now = new Date()
): EngineeringForemanCheckpointRestore | null {
  const checkpoint = state.latestCheckpoint;
  if (!checkpoint) return null;
  const taskGraph = clone(checkpoint.taskGraph);
  return {
    checkpoint: clone(checkpoint),
    taskGraph,
    state: restoreEngineeringForemanState(state, taskGraph, now),
  };
}
