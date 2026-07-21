import type { EngineeringMemory } from '@/lib/engineering-memory';
import type { TaskGraph, TaskGraphTask } from '@/lib/task-graph';
import {
  cancelTaskGraph,
  getTaskGraphProgress,
  type TaskGraphPriority,
  type TaskGraphStatus,
} from '@/lib/task-graph';
import { skipOptionalTask } from '@/lib/task-execution/skip';

import type {
  GuidedBuildMilestone,
  GuidedBuildMilestoneStatus,
  GuidedBuildOverallStatus,
  GuidedBuildState,
  GuidedBuildTechnicalDetail,
} from './types';

interface GuidedBuildInput {
  taskGraph?: TaskGraph | null;
  engineeringMemory?: EngineeringMemory | null;
  projectId?: string;
  projectName?: string;
}

const ACTIVE_STATUSES = new Set<TaskGraphStatus>([
  'ready',
  'running',
  'validating',
  'recoverable-failure',
]);

const SUCCESS_STATUSES = new Set<TaskGraphStatus>(['passed', 'skipped']);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function friendlyTaskSubject(task: TaskGraphTask): string {
  const text = normalizeText(
    `${task.title} ${task.description} ${task.capabilityIds.join(' ')} ${task.expectedFiles.join(' ')}`
  );

  if (text.includes('dashboard')) return 'dashboard';
  if (text.includes('story editor') || text.includes('page editor')) {
    return 'story editor';
  }
  if (text.includes('profile')) return 'profiles';
  if (text.includes('library')) return 'library';
  if (text.includes('payment') || text.includes('billing') || text.includes('stripe')) {
    return 'payments';
  }
  if (text.includes('notification') || text.includes('email')) return 'notifications';
  if (text.includes('analytics') || text.includes('report')) return 'analytics';
  if (text.includes('deployment') || text.includes('vercel')) return 'deployment';
  if (text.includes('test') || text.includes('quality') || text.includes('review')) {
    return 'quality checks';
  }
  if (text.includes('route')) {
    const route = task.expectedFiles
      .map((file) => file.match(/src\/app\/([^/]+)\/page\.(?:tsx|ts|jsx|js)$/)?.[1])
      .find(Boolean);
    if (route) return route.replace(/-/g, ' ');
  }

  return task.title.replace(/^implement\s+/i, '').replace(/^create\s+/i, '');
}

export function getGuidedBuildMilestoneTitle(task: TaskGraphTask): string {
  const text = normalizeText(`${task.title} ${task.description}`);
  const subject = friendlyTaskSubject(task);

  if (task.category === 'foundation' || task.category === 'environment') {
    return 'Preparing project foundation';
  }
  if (task.category === 'data' || task.assignedDiscipline === 'database') {
    return 'Creating data storage';
  }
  if (task.category === 'authentication' || task.assignedDiscipline === 'authentication') {
    return 'Setting up accounts';
  }
  if (task.category === 'AI' || task.assignedDiscipline === 'AI integration') {
    return 'Connecting AI generation';
  }
  if (task.category === 'testing' || task.category === 'review') {
    return 'Running quality checks';
  }
  if (task.category === 'deployment' || subject === 'deployment') {
    return 'Preparing deployment';
  }
  if (task.category === 'frontend') {
    return `Building ${subject}`;
  }
  if (task.category === 'backend') {
    return text.includes('api') ? `Creating ${subject} API` : `Building ${subject}`;
  }
  if (task.category === 'storage') {
    return 'Connecting file storage';
  }

  return titleCase(subject);
}

function milestoneStatus(status: TaskGraphStatus): GuidedBuildMilestoneStatus {
  switch (status) {
    case 'pending':
      return 'not-started';
    case 'recoverable-failure':
      return 'recoverable';
    default:
      return status;
  }
}

function milestoneProgress(status: TaskGraphStatus): number {
  switch (status) {
    case 'passed':
    case 'skipped':
      return 100;
    case 'validating':
      return 80;
    case 'running':
      return 55;
    case 'recoverable-failure':
      return 45;
    case 'ready':
      return 10;
    case 'failed':
    case 'blocked':
    case 'cancelled':
      return 0;
    default:
      return 0;
  }
}

function explanationForTask(task: TaskGraphTask): string {
  if (task.status === 'passed') {
    return 'This milestone is complete and its checks have passed.';
  }
  if (task.status === 'skipped') {
    return 'This optional milestone was skipped intentionally.';
  }
  if (task.status === 'recoverable-failure') {
    return 'This milestone needs a targeted retry. Completed work remains in place.';
  }
  if (task.status === 'failed') {
    return 'This milestone failed, but other completed milestones are still preserved.';
  }
  if (task.status === 'blocked') {
    return 'This milestone is blocked until the issue below is resolved.';
  }
  if (task.status === 'cancelled') {
    return 'This milestone was cancelled and can be reviewed before resuming.';
  }
  if (task.status === 'running') {
    return 'Matrix Coder is working on this milestone now.';
  }
  if (task.status === 'validating') {
    return 'Matrix Coder is checking this milestone before moving on.';
  }
  if (task.status === 'ready') {
    return 'This milestone is ready to run next.';
  }
  return 'This milestone is waiting for earlier work to finish.';
}

function actionForTask(task: TaskGraphTask): string {
  if (task.status === 'passed') return 'Completed';
  if (task.status === 'skipped') return 'Skipped';
  if (task.status === 'running') return 'Applying changes';
  if (task.status === 'validating') return 'Running validation';
  if (task.status === 'ready') return 'Ready to start';
  if (task.status === 'recoverable-failure') return 'Review and retry this milestone';
  if (task.status === 'failed') return 'Manual review required';
  if (task.status === 'blocked') return 'Waiting for blocker to be resolved';
  if (task.status === 'cancelled') return 'Cancelled by user';
  return 'Waiting for dependencies';
}

function isOptionalTask(task: TaskGraphTask): boolean {
  return task.priority === 'low';
}

function canRetry(task: TaskGraphTask): boolean {
  return (
    (task.status === 'failed' || task.status === 'recoverable-failure') &&
    task.retryCount < task.maximumRetryCount
  );
}

function canResume(task: TaskGraphTask, memory?: EngineeringMemory | null): boolean {
  return (
    task.resumable &&
    (task.status === 'recoverable-failure' ||
      task.status === 'cancelled' ||
      memory?.resumableTaskId === task.id)
  );
}

function canCancel(task: TaskGraphTask): boolean {
  return task.status === 'running' || task.status === 'validating' || task.status === 'ready';
}

function latestTaskHistory(memory: EngineeringMemory | null | undefined, taskId: string) {
  return (memory?.taskExecutionHistory ?? [])
    .filter((entry) => entry.taskId === taskId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function warningForTask(
  task: TaskGraphTask,
  memory: EngineeringMemory | null | undefined
): string | undefined {
  const issue = (memory?.unresolvedIssues ?? []).find(
    (item) => !item.resolvedAt && item.taskId === task.id
  );
  if (task.blockedReason) return task.blockedReason;
  if (issue) return issue.description || issue.title;
  const history = latestTaskHistory(memory, task.id);
  return history?.errors[0];
}

function milestoneForTask(
  task: TaskGraphTask,
  memory: EngineeringMemory | null | undefined
): GuidedBuildMilestone {
  return {
    id: `milestone:${task.id}`,
    taskIds: [task.id],
    primaryTaskId: task.id,
    title: getGuidedBuildMilestoneTitle(task),
    status: milestoneStatus(task.status),
    progress: milestoneProgress(task.status),
    explanation: explanationForTask(task),
    currentAction: actionForTask(task),
    importantWarning: warningForTask(task, memory),
    priority: task.priority,
    canRetry: canRetry(task),
    canResume: canResume(task, memory),
    canSkip: isOptionalTask(task) && !SUCCESS_STATUSES.has(task.status),
    canCancel: canCancel(task),
  };
}

function technicalDetailForTask(
  task: TaskGraphTask,
  memory: EngineeringMemory | null | undefined
): GuidedBuildTechnicalDetail {
  const history = (memory?.taskExecutionHistory ?? []).filter(
    (entry) => entry.taskId === task.id
  );
  const filesChanged = Array.from(
    new Set([
      ...history.flatMap((entry) => entry.changedFiles),
      ...task.resultEvidence
        .filter((item) => item.kind === 'file')
        .map((item) => item.ref),
    ])
  ).sort();
  const exactErrors = Array.from(
    new Set([
      ...history.flatMap((entry) => entry.errors),
      ...(task.blockedReason ? [task.blockedReason] : []),
      ...(memory?.unresolvedIssues ?? [])
        .filter((issue) => !issue.resolvedAt && issue.taskId === task.id)
        .map((issue) => issue.description || issue.title),
    ])
  ).filter(Boolean);

  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    discipline: task.assignedDiscipline,
    category: task.category,
    filesChanged,
    validationCommands: task.validationCommands,
    exactErrors,
    retries: {
      current: task.retryCount,
      maximum: task.maximumRetryCount,
      exhausted: task.retryCount >= task.maximumRetryCount,
    },
    repositoryContext: {
      allowedFileScope: task.allowedFileScope,
      expectedFiles: task.expectedFiles,
      capabilityIds: task.capabilityIds,
      sourceRequirementIds: task.sourceRequirementIds,
    },
    acceptanceCriteria: task.acceptanceChecks,
    evidence: task.resultEvidence.map((item) =>
      item.description ? `${item.kind}: ${item.ref} - ${item.description}` : `${item.kind}: ${item.ref}`
    ),
  };
}

function chooseCurrentMilestone(milestones: GuidedBuildMilestone[]): string | undefined {
  return (
    milestones.find((milestone) =>
      ['running', 'validating', 'recoverable', 'failed', 'blocked'].includes(
        milestone.status
      )
    ) ??
    milestones.find((milestone) => milestone.status === 'ready') ??
    milestones.find((milestone) => milestone.status === 'not-started')
  )?.id;
}

function overallStatus(
  graph: TaskGraph | null | undefined,
  milestones: GuidedBuildMilestone[],
  memory?: EngineeringMemory | null
): GuidedBuildOverallStatus {
  if (!graph || graph.tasks.length === 0) return 'not-started';
  if (memory?.overallBuildStatus === 'cancelled') return 'cancelled';
  if (milestones.some((milestone) => milestone.status === 'cancelled')) return 'cancelled';
  if (
    milestones.some((milestone) =>
      ['recoverable', 'failed', 'blocked'].includes(milestone.status)
    )
  ) {
    return 'needs-attention';
  }
  if (milestones.every((milestone) => SUCCESS_STATUSES.has(graph.tasks.find((task) => task.id === milestone.primaryTaskId)?.status ?? 'pending'))) {
    return 'passed';
  }
  if (milestones.some((milestone) => milestone.status === 'running' || milestone.status === 'validating')) {
    return 'in-progress';
  }
  return 'paused';
}

export function createGuidedBuildState(input: GuidedBuildInput): GuidedBuildState {
  const graph = input.taskGraph ?? input.engineeringMemory?.taskGraph;
  const projectName =
    input.projectName ??
    graph?.projectName ??
    input.engineeringMemory?.projectId ??
    'Current project';

  if (!graph) {
    return {
      projectId: input.projectId ?? input.engineeringMemory?.projectId,
      projectName,
      overallStatus: 'not-started',
      memoryStatus: input.engineeringMemory?.overallBuildStatus,
      progress: {
        total: 0,
        completed: 0,
        failed: 0,
        blocked: 0,
        cancelled: 0,
        remaining: 0,
        percentComplete: 0,
      },
      milestones: [
        {
          id: 'milestone:planning',
          taskIds: [],
          title: 'Planning your application',
          status: 'not-started',
          progress: 0,
          explanation:
            'Approve an Architect plan or Blueprint to create an engineering task graph.',
          currentAction: 'Waiting for an approved plan',
          priority: 'high',
          canRetry: false,
          canResume: false,
          canSkip: false,
          canCancel: false,
        },
      ],
      currentMilestoneId: 'milestone:planning',
      technicalDetails: [],
      actions: {
        retryableTaskIds: [],
        resumableTaskIds: [],
        skippableTaskIds: [],
        cancellableTaskIds: [],
      },
      warnings: input.engineeringMemory?.warnings ?? [],
      updatedAt: input.engineeringMemory?.updatedAt,
    };
  }

  const milestones = graph.tasks.map((task) =>
    milestoneForTask(task, input.engineeringMemory)
  );
  const technicalDetails = graph.tasks.map((task) =>
    technicalDetailForTask(task, input.engineeringMemory)
  );
  const progress = getTaskGraphProgress(graph);

  return {
    projectId: input.projectId ?? graph.projectId ?? input.engineeringMemory?.projectId,
    projectName,
    overallStatus: overallStatus(graph, milestones, input.engineeringMemory),
    memoryStatus: input.engineeringMemory?.overallBuildStatus,
    progress: {
      total: progress.total,
      completed: progress.passed + progress.skipped,
      failed: progress.failed,
      blocked: progress.blocked,
      cancelled: progress.cancelled,
      remaining: progress.remaining,
      percentComplete: progress.percentComplete,
    },
    currentMilestoneId: chooseCurrentMilestone(milestones),
    milestones,
    technicalDetails,
    actions: {
      retryableTaskIds: graph.tasks.filter(canRetry).map((task) => task.id),
      resumableTaskIds: graph.tasks
        .filter((task) => canResume(task, input.engineeringMemory))
        .map((task) => task.id),
      skippableTaskIds: graph.tasks
        .filter((task) => isOptionalTask(task) && !SUCCESS_STATUSES.has(task.status))
        .map((task) => task.id),
      cancellableTaskIds: graph.tasks.filter(canCancel).map((task) => task.id),
    },
    warnings: [...graph.warnings.map((warning) => warning.message), ...(input.engineeringMemory?.warnings ?? [])],
    updatedAt: input.engineeringMemory?.updatedAt ?? graph.updatedAt,
  };
}

function updateTask(
  graph: TaskGraph,
  taskId: string,
  updater: (task: TaskGraphTask, nowIso: string) => TaskGraphTask,
  now = new Date()
): TaskGraph {
  const nowIso = now.toISOString();
  return {
    ...graph,
    updatedAt: nowIso,
    tasks: graph.tasks.map((task) =>
      task.id === taskId ? updater(task, nowIso) : task
    ),
  };
}

export function markGuidedBuildTaskForRetry(
  graph: TaskGraph,
  taskId: string,
  now = new Date()
): TaskGraph {
  const task = graph.tasks.find((item) => item.id === taskId);
  if (!task || !canRetry(task)) return graph;
  return updateTask(
    graph,
    taskId,
    (current, nowIso) => ({
      ...current,
      status: 'ready',
      blockedReason: undefined,
      failureClassification: 'none',
      updatedAt: nowIso,
      completedAt: undefined,
      resumable: true,
    }),
    now
  );
}

export function markGuidedBuildTaskForResume(
  graph: TaskGraph,
  taskId: string,
  now = new Date()
): TaskGraph {
  const task = graph.tasks.find((item) => item.id === taskId);
  if (!task || !task.resumable) return graph;
  if (!['cancelled', 'recoverable-failure', 'pending', 'ready'].includes(task.status)) {
    return graph;
  }
  return updateTask(
    graph,
    taskId,
    (current, nowIso) => ({
      ...current,
      status: 'ready',
      blockedReason: undefined,
      updatedAt: nowIso,
      completedAt: undefined,
      resumable: true,
    }),
    now
  );
}

export function markGuidedBuildTaskSkipped(
  graph: TaskGraph,
  taskId: string,
  reason = 'Skipped by user from guided build.',
  now = new Date()
): TaskGraph {
  const task = graph.tasks.find((item) => item.id === taskId);
  return skipOptionalTask(graph, taskId, {
    optional: Boolean(task && isOptionalTask(task)),
    reason,
    now,
  });
}

export function cancelGuidedBuild(
  graph: TaskGraph,
  reason = 'Cancelled by user from guided build.',
  now = new Date()
): TaskGraph {
  return cancelTaskGraph(graph, reason, now);
}
