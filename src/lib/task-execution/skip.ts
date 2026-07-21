import type { TaskGraph, TaskGraphTask } from '@/lib/task-graph';

export function skipOptionalTask(
  graph: TaskGraph,
  taskId: string,
  options: { optional: boolean; reason?: string; now?: Date }
): TaskGraph {
  if (!options.optional) {
    throw new Error('Only optional tasks can be skipped.');
  }
  const nowIso = (options.now ?? new Date()).toISOString();
  return {
    ...graph,
    updatedAt: nowIso,
    tasks: graph.tasks.map((task): TaskGraphTask => {
      if (task.id !== taskId) return task;
      return {
        ...task,
        status: 'skipped',
        blockedReason: options.reason,
        completedAt: nowIso,
        updatedAt: nowIso,
        resumable: false,
      };
    }),
  };
}

