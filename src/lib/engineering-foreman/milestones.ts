import type { TaskGraph, TaskGraphTask } from '@/lib/task-graph';
import type {
  EngineeringForemanMilestoneId,
  EngineeringForemanMilestoneState,
  EngineeringForemanTaskState,
  EngineeringForemanTaskStatus,
} from './types';

export const ENGINEERING_FOREMAN_MILESTONES: ReadonlyArray<{
  id: EngineeringForemanMilestoneId;
  title: string;
}> = [
  { id: 'foundation', title: 'Foundation' },
  { id: 'authentication', title: 'Authentication' },
  { id: 'database', title: 'Database' },
  { id: 'core-ui', title: 'Core UI' },
  { id: 'business-logic', title: 'Business Logic' },
  { id: 'ai-features', title: 'AI Features' },
  { id: 'deployment', title: 'Deployment' },
  { id: 'validation', title: 'Validation' },
  { id: 'completion', title: 'Completion' },
];

export function getMilestoneForTask(
  task: Pick<TaskGraphTask, 'category' | 'assignedDiscipline'>
): EngineeringForemanMilestoneId {
  if (task.category === 'foundation' || task.category === 'environment') {
    return 'foundation';
  }
  if (task.category === 'authentication') return 'authentication';
  if (task.category === 'data' || task.assignedDiscipline === 'database') {
    return 'database';
  }
  if (task.category === 'frontend') return 'core-ui';
  if (
    task.category === 'backend' ||
    task.category === 'storage' ||
    task.assignedDiscipline === 'architecture'
  ) {
    return 'business-logic';
  }
  if (task.category === 'AI') return 'ai-features';
  if (task.category === 'deployment') return 'deployment';
  return 'validation';
}

export function mapTaskGraphStatus(
  task: Pick<TaskGraphTask, 'status' | 'resumable'>
): EngineeringForemanTaskStatus {
  switch (task.status) {
    case 'ready':
      return 'ready';
    case 'running':
    case 'validating':
      return 'running';
    case 'recoverable-failure':
      return 'needs-repair';
    case 'blocked':
    case 'failed':
      return 'blocked';
    case 'passed':
      return 'complete';
    case 'cancelled':
      return 'cancelled';
    case 'skipped':
      return 'skipped';
    default:
      return task.resumable ? 'queued' : 'waiting';
  }
}

function taskIsComplete(status: EngineeringForemanTaskStatus): boolean {
  return status === 'complete' || status === 'skipped';
}

export function buildMilestoneStates(
  graph: TaskGraph,
  taskStates: EngineeringForemanTaskState[]
): EngineeringForemanMilestoneState[] {
  const statesByTask = new Map(taskStates.map((state) => [state.taskId, state]));
  const milestones = ENGINEERING_FOREMAN_MILESTONES.map((definition) => {
    const taskIds =
      definition.id === 'completion'
        ? []
        : graph.tasks
            .filter((task) => getMilestoneForTask(task) === definition.id)
            .map((task) => task.id);
    const completedTaskIds = taskIds.filter((id) =>
      taskIsComplete(statesByTask.get(id)?.status ?? 'queued')
    );
    const blockedTaskIds = taskIds.filter((id) =>
      ['blocked', 'cancelled'].includes(statesByTask.get(id)?.status ?? '')
    );
    const active = taskIds.some((id) =>
      ['ready', 'running', 'needs-repair', 'validated'].includes(
        statesByTask.get(id)?.status ?? ''
      )
    );
    return {
      ...definition,
      status:
        taskIds.length === 0
          ? ('complete' as const)
          : completedTaskIds.length === taskIds.length
          ? ('complete' as const)
          : blockedTaskIds.length > 0
            ? ('blocked' as const)
            : active
              ? ('active' as const)
              : ('queued' as const),
      taskIds,
      completedTaskIds,
      blockedTaskIds,
    };
  });

  const allTasksComplete =
    graph.tasks.length > 0 &&
    graph.tasks.every((task) =>
      taskIsComplete(statesByTask.get(task.id)?.status ?? 'queued')
    );
  const completion = milestones.find((item) => item.id === 'completion');
  if (completion) completion.status = allTasksComplete ? 'complete' : 'queued';
  return milestones;
}

export function getCurrentMilestone(
  milestones: EngineeringForemanMilestoneState[]
): EngineeringForemanMilestoneId {
  return (
    milestones.find((milestone) => milestone.status !== 'complete')?.id ??
    'completion'
  );
}
