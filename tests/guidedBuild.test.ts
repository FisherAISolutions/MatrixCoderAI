import { describe, expect, it } from 'vitest';

import type { EngineeringMemory } from '@/lib/engineering-memory';
import {
  cancelGuidedBuild,
  createGuidedBuildState,
  markGuidedBuildTaskForResume,
  markGuidedBuildTaskForRetry,
  markGuidedBuildTaskSkipped,
} from '@/lib/guided-build';
import {
  TASK_GRAPH_METADATA_VERSION,
  TASK_GRAPH_SCHEMA_VERSION,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';

const now = '2026-07-21T12:00:00.000Z';

function task(overrides: Partial<TaskGraphTask> = {}): TaskGraphTask {
  return {
    id: 'task-frontend-dashboard',
    title: 'Implement dashboard route',
    description: 'Create the dashboard route and client component.',
    category: 'frontend',
    capabilityIds: ['dashboard'],
    sourceRequirementIds: ['req-route-dashboard'],
    dependencies: [],
    status: 'ready',
    priority: 'high',
    allowedFileScope: ['src/app/dashboard/**', 'src/components/dashboard/**'],
    expectedFiles: ['src/app/dashboard/page.tsx'],
    expectedOutputs: ['Dashboard renders.'],
    acceptanceChecks: ['Route /dashboard exists.', 'Dashboard shows metrics.'],
    validationCommands: ['npm run type-check'],
    retryCount: 0,
    maximumRetryCount: 2,
    failureClassification: 'none',
    createdAt: now,
    updatedAt: now,
    assignedDiscipline: 'frontend',
    resultEvidence: [],
    resumable: true,
    fingerprint: overrides.id ?? 'task-frontend-dashboard',
    ...overrides,
  };
}

function graph(tasks: TaskGraphTask[]): TaskGraph {
  return {
    schemaVersion: TASK_GRAPH_SCHEMA_VERSION,
    metadataVersion: TASK_GRAPH_METADATA_VERSION,
    id: 'graph-1',
    projectId: 'project-1',
    projectName: 'StorySpark',
    contractId: 'contract-1',
    contractVersion: 1,
    sourceBuildContractUpdatedAt: now,
    tasks,
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
}

function memory(taskGraph: TaskGraph): EngineeringMemory {
  return {
    schemaVersion: 1,
    metadataVersion: '2026-07-20',
    id: 'memory-1',
    projectId: 'project-1',
    buildContractVersion: 1,
    taskGraph,
    taskExecutionHistory: [
      {
        id: 'history-1',
        taskId: 'task-frontend-dashboard',
        taskTitle: 'Implement dashboard route',
        category: 'frontend',
        assignedDiscipline: 'frontend',
        status: 'recoverable-failure',
        failureClassification: 'type-check',
        retryCount: 1,
        runId: 'run-1',
        operationId: 'operation-1',
        changedFiles: [
          'src/app/dashboard/page.tsx',
          'src/components/dashboard/DashboardClient.tsx',
        ],
        validationEvidence: [
          {
            kind: 'command',
            ref: 'npm run type-check',
            status: 'failed',
            description: 'TypeScript failed.',
          },
        ],
        warnings: [],
        errors: ['Type error: missing DashboardMetric prop.'],
        createdAt: now,
      },
    ],
    completedRequirementIds: [],
    validationEvidence: [],
    unresolvedIssues: [
      {
        id: 'issue-1',
        severity: 'warning',
        title: 'Dashboard needs repair',
        description: 'Dashboard route did not pass validation.',
        taskId: 'task-frontend-dashboard',
        createdAt: now,
      },
    ],
    latestRepositoryFingerprint: 'repo-1',
    capabilities: [],
    requiredCapabilityIds: ['dashboard'],
    optionalCapabilityIds: [],
    generatedFileOwnership: [],
    userApprovedWarningIds: [],
    resumableTaskId: 'task-frontend-dashboard',
    overallBuildStatus: 'recoverable',
    restoreOptions: ['resume', 'retry', 'review'],
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('guided build state', () => {
  it('maps internal tasks to simple product milestones', () => {
    const state = createGuidedBuildState({
      taskGraph: graph([
        task({
          id: 'task-foundation',
          title: 'Create project foundation',
          category: 'foundation',
          assignedDiscipline: 'foundation',
          status: 'passed',
        }),
        task({
          id: 'task-data',
          title: 'Define Supabase schema',
          category: 'data',
          assignedDiscipline: 'database',
          status: 'running',
        }),
        task({
          id: 'task-story-editor',
          title: 'Implement story editor',
          description: 'Create the story editor route and page editing component.',
          category: 'frontend',
          capabilityIds: ['story-editor'],
          expectedFiles: ['src/app/editor/page.tsx'],
        }),
      ]),
    });

    expect(state.milestones.map((milestone) => milestone.title)).toEqual([
      'Preparing project foundation',
      'Creating data storage',
      'Building story editor',
    ]);
    expect(state.currentMilestoneId).toBe('milestone:task-data');
    expect(state.overallStatus).toBe('in-progress');
  });

  it('exposes technical details without hidden prompts or secrets', () => {
    const failedGraph = graph([
      task({
        status: 'recoverable-failure',
        retryCount: 1,
        blockedReason: 'TypeScript failed in dashboard client.',
        resultEvidence: [
          {
            kind: 'file',
            ref: 'src/app/dashboard/page.tsx',
            description: 'Route page was created.',
          },
        ],
      }),
    ]);
    const state = createGuidedBuildState({
      taskGraph: failedGraph,
      engineeringMemory: memory(failedGraph),
    });

    expect(state.technicalDetails[0]).toMatchObject({
      taskId: 'task-frontend-dashboard',
      discipline: 'frontend',
      validationCommands: ['npm run type-check'],
      acceptanceCriteria: ['Route /dashboard exists.', 'Dashboard shows metrics.'],
    });
    expect(state.technicalDetails[0].filesChanged).toContain(
      'src/components/dashboard/DashboardClient.tsx'
    );
    expect(state.technicalDetails[0].exactErrors.join('\n')).toContain(
      'Type error: missing DashboardMetric prop.'
    );
    expect(JSON.stringify(state.technicalDetails)).not.toContain('OPENAI_API_KEY');
  });

  it('retries only the failed task', () => {
    const original = graph([
      task({
        status: 'recoverable-failure',
        retryCount: 1,
        blockedReason: 'Route failed.',
      }),
      task({
        id: 'task-data',
        title: 'Define schema',
        category: 'data',
        assignedDiscipline: 'database',
        status: 'passed',
      }),
    ]);

    const next = markGuidedBuildTaskForRetry(
      original,
      'task-frontend-dashboard',
      new Date(now)
    );

    expect(next.tasks.find((item) => item.id === 'task-frontend-dashboard')?.status).toBe(
      'ready'
    );
    expect(next.tasks.find((item) => item.id === 'task-data')?.status).toBe('passed');
  });

  it('reopens blocked direct dependents when their failed dependency is retried', () => {
    const original = graph([
      task({
        status: 'failed',
        retryCount: 1,
        maximumRetryCount: 2,
        blockedReason: 'Route failed.',
      }),
      task({
        id: 'task-dependent',
        title: 'Validate dashboard workflow',
        status: 'blocked',
        dependencies: ['task-frontend-dashboard'],
        blockedReason: 'Blocked by failed dependency task-frontend-dashboard.',
      }),
    ]);

    const next = markGuidedBuildTaskForRetry(
      original,
      'task-frontend-dashboard',
      new Date(now)
    );

    expect(next.tasks[0].status).toBe('ready');
    expect(next.tasks[1].status).toBe('pending');
    expect(next.tasks[1].blockedReason).toBeUndefined();
  });

  it('resumes a recoverable interrupted task', () => {
    const original = graph([
      task({
        status: 'cancelled',
        blockedReason: 'Cancelled by user.',
        resumable: true,
      }),
    ]);

    const next = markGuidedBuildTaskForResume(
      original,
      'task-frontend-dashboard',
      new Date(now)
    );

    expect(next.tasks[0].status).toBe('ready');
    expect(next.tasks[0].blockedReason).toBeUndefined();
  });

  it('cancels active work without marking completed tasks as failed', () => {
    const original = graph([
      task({ id: 'task-foundation', status: 'passed' }),
      task({ id: 'task-dashboard', status: 'running' }),
    ]);

    const next = cancelGuidedBuild(original, 'Stopped in guided build.', new Date(now));

    expect(next.tasks.find((item) => item.id === 'task-foundation')?.status).toBe(
      'passed'
    );
    expect(next.tasks.find((item) => item.id === 'task-dashboard')?.status).toBe(
      'cancelled'
    );
  });

  it('calculates progress without false completion when a task failed', () => {
    const state = createGuidedBuildState({
      taskGraph: graph([
        task({ id: 'task-foundation', status: 'passed' }),
        task({ id: 'task-dashboard', status: 'failed', retryCount: 2 }),
      ]),
    });

    expect(state.progress.percentComplete).toBe(50);
    expect(state.overallStatus).toBe('needs-attention');
  });

  it('allows explicit skip only for optional milestones', () => {
    const original = graph([
      task({
        id: 'task-analytics',
        title: 'Add advanced analytics',
        priority: 'low',
        status: 'ready',
      }),
    ]);

    const next = markGuidedBuildTaskSkipped(
      original,
      'task-analytics',
      'User skipped optional analytics.',
      new Date(now)
    );

    expect(next.tasks[0].status).toBe('skipped');
    expect(() =>
      markGuidedBuildTaskSkipped(
        graph([task({ id: 'task-required', priority: 'high' })]),
        'task-required',
        'nope',
        new Date(now)
      )
    ).toThrow('Only optional tasks can be skipped.');
  });

  it('isolates project switching by deriving state from the selected graph only', () => {
    const first = createGuidedBuildState({
      taskGraph: graph([task({ id: 'task-first', title: 'Build first dashboard' })]),
      projectId: 'project-1',
      projectName: 'First',
    });
    const secondGraph = {
      ...graph([task({ id: 'task-second', title: 'Build second dashboard' })]),
      projectId: 'project-2',
      projectName: 'Second',
    };
    const second = createGuidedBuildState({
      taskGraph: secondGraph,
      projectId: 'project-2',
      projectName: 'Second',
    });

    expect(first.projectId).toBe('project-1');
    expect(first.milestones[0].taskIds).toEqual(['task-first']);
    expect(second.projectId).toBe('project-2');
    expect(second.milestones[0].taskIds).toEqual(['task-second']);
  });

  it('shows a planning milestone when no task graph exists yet', () => {
    const state = createGuidedBuildState({ projectName: 'Fresh Project' });

    expect(state.overallStatus).toBe('not-started');
    expect(state.milestones[0]).toMatchObject({
      title: 'Planning your application',
      currentAction: 'Waiting for an approved plan',
    });
  });
});
