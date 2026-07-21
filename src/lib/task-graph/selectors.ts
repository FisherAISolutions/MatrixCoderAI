import type {
  TaskFailureClassification,
  TaskGraph,
  TaskGraphCycle,
  TaskGraphProgress,
  TaskGraphStatus,
  TaskGraphTask,
} from './types';

const priorityRank: Record<TaskGraphTask['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const terminalStatuses = new Set<TaskGraphStatus>([
  'passed',
  'failed',
  'blocked',
  'cancelled',
  'skipped',
]);

function dependenciesSatisfied(task: TaskGraphTask, tasksById: Map<string, TaskGraphTask>): boolean {
  return task.dependencies.every((dependencyId) => {
    const dependency = tasksById.get(dependencyId);
    return dependency?.status === 'passed' || dependency?.status === 'skipped';
  });
}

export function getReadyTasks(graph: TaskGraph): TaskGraphTask[] {
  const tasksById = new Map(graph.tasks.map((task) => [task.id, task]));
  return graph.tasks
    .filter((task) => {
      if (task.status === 'ready') return dependenciesSatisfied(task, tasksById);
      if (task.status !== 'pending') return false;
      return dependenciesSatisfied(task, tasksById);
    })
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}

export function getNextReadyTask(graph: TaskGraph): TaskGraphTask | null {
  return getReadyTasks(graph)[0] ?? null;
}

export function getBlockedTasks(graph: TaskGraph): TaskGraphTask[] {
  return graph.tasks.filter((task) => task.status === 'blocked');
}

export function getFailedTasks(graph: TaskGraph): TaskGraphTask[] {
  return graph.tasks.filter(
    (task) => task.status === 'failed' || task.status === 'recoverable-failure'
  );
}

export function getResumableTasks(graph: TaskGraph): TaskGraphTask[] {
  const tasksById = new Map(graph.tasks.map((task) => [task.id, task]));
  return graph.tasks.filter((task) => {
    if (!task.resumable || terminalStatuses.has(task.status)) return false;
    if (task.status === 'ready' || task.status === 'recoverable-failure') {
      return dependenciesSatisfied(task, tasksById);
    }
    return task.status === 'pending' && dependenciesSatisfied(task, tasksById);
  });
}

export function getCompletedCapabilityIds(graph: TaskGraph): string[] {
  return Array.from(
    new Set(
      graph.tasks
        .filter((task) => task.status === 'passed')
        .flatMap((task) => task.capabilityIds)
    )
  ).sort();
}

export function getTaskGraphProgress(graph: TaskGraph): TaskGraphProgress {
  const total = graph.tasks.length;
  const passed = graph.tasks.filter((task) => task.status === 'passed').length;
  const failed = graph.tasks.filter((task) => task.status === 'failed').length;
  const blocked = graph.tasks.filter((task) => task.status === 'blocked').length;
  const cancelled = graph.tasks.filter(
    (task) => task.status === 'cancelled'
  ).length;
  const skipped = graph.tasks.filter((task) => task.status === 'skipped').length;
  const active = graph.tasks.filter((task) =>
    ['ready', 'running', 'validating', 'recoverable-failure'].includes(
      task.status
    )
  ).length;
  const completeCount = passed + skipped;
  const remaining = Math.max(0, total - completeCount - failed - blocked - cancelled);
  return {
    total,
    passed,
    failed,
    blocked,
    cancelled,
    skipped,
    active,
    remaining,
    percentComplete: total === 0 ? 0 : Math.round((completeCount / total) * 100),
  };
}

export function markTaskPassed(
  graph: TaskGraph,
  taskId: string,
  evidence: TaskGraphTask['resultEvidence'] = [],
  now = new Date()
): TaskGraph {
  const nowIso = now.toISOString();
  return {
    ...graph,
    updatedAt: nowIso,
    tasks: graph.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: 'passed',
            resultEvidence: evidence,
            completedAt: nowIso,
            updatedAt: nowIso,
            failureClassification: 'none',
            blockedReason: undefined,
            resumable: false,
          }
        : task
    ),
  };
}

export function recordTaskFailure(
  graph: TaskGraph,
  taskId: string,
  classification: Exclude<TaskFailureClassification, 'none'> = 'unknown',
  blockedReason = 'Task failed during validation.',
  now = new Date()
): TaskGraph {
  const nowIso = now.toISOString();
  return {
    ...graph,
    updatedAt: nowIso,
    tasks: graph.tasks.map((task) => {
      if (task.id !== taskId) return task;
      const retryCount = task.retryCount + 1;
      const exhausted = retryCount >= task.maximumRetryCount;
      return {
        ...task,
        status: exhausted ? 'failed' : 'recoverable-failure',
        retryCount,
        failureClassification: classification,
        blockedReason,
        updatedAt: nowIso,
        resumable: !exhausted,
      };
    }),
  };
}

export function cancelTaskGraph(
  graph: TaskGraph,
  reason = 'Cancelled by user.',
  now = new Date()
): TaskGraph {
  const nowIso = now.toISOString();
  return {
    ...graph,
    updatedAt: nowIso,
    tasks: graph.tasks.map((task) => {
      if (task.status === 'passed' || task.status === 'skipped') return task;
      return {
        ...task,
        status: 'cancelled',
        blockedReason: reason,
        completedAt: nowIso,
        updatedAt: nowIso,
        resumable: false,
      };
    }),
  };
}

export function detectTaskGraphCycles(
  tasks: Pick<TaskGraphTask, 'id' | 'dependencies'>[]
): TaskGraphCycle[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: TaskGraphCycle[] = [];
  const stack: string[] = [];

  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      const cycleStart = stack.indexOf(taskId);
      const cycle =
        cycleStart >= 0 ? stack.slice(cycleStart).concat(taskId) : [taskId];
      cycles.push({ taskIds: cycle });
      return;
    }

    const task = byId.get(taskId);
    if (!task) return;

    visiting.add(taskId);
    stack.push(taskId);
    task.dependencies.forEach(visit);
    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
  }

  tasks.forEach((task) => visit(task.id));
  return cycles;
}
