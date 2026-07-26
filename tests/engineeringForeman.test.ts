import { describe, expect, it } from 'vitest';

import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  BUILD_CONTRACT_METADATA_VERSION,
  BUILD_CONTRACT_SCHEMA_VERSION,
  type BuildContract,
} from '@/lib/build-contract';
import { resolveCapabilities } from '@/lib/capabilities';
import {
  cancelEngineeringForeman,
  confirmForemanRepositoryRefresh,
  createEngineeringForemanState,
  decideForemanFailureAction,
  deserializeEngineeringForemanState,
  planNextEngineeringTask,
  recordForemanFailure,
  recordValidatedForemanTask,
  restoreLatestEngineeringForemanCheckpoint,
  restoreEngineeringForemanState,
  serializeEngineeringForemanState,
  startForemanTask,
} from '@/lib/engineering-foreman';
import { createEngineeringMemory } from '@/lib/engineering-memory';
import {
  createIntelligenceCore,
  recordVerifiedExperienceLesson,
} from '@/lib/intelligence-core';
import {
  loadMatrixProjectWorkspaceSnapshot,
  saveMatrixProjectWorkspaceSnapshot,
} from '@/lib/projects/projectStore';
import { createRepositoryModel } from '@/lib/repository-model';
import {
  TASK_GRAPH_METADATA_VERSION,
  TASK_GRAPH_SCHEMA_VERSION,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';
import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';

const NOW = new Date('2026-07-25T12:00:00.000Z');

function file(path: string, content: string): FileNode {
  return {
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    language: path.endsWith('.json') ? 'json' : 'typescript',
    content,
  };
}

function contract(): BuildContract {
  return {
    schemaVersion: BUILD_CONTRACT_SCHEMA_VERSION,
    metadataVersion: BUILD_CONTRACT_METADATA_VERSION,
    contractVersion: 2,
    id: 'contract-foreman',
    project: {
      projectId: 'project-foreman',
      workspaceId: 'workspace-foreman',
      projectName: 'Foreman Dashboard',
    },
    projectSummary: 'Build a responsive dashboard with typed data.',
    targetFramework: 'Next.js 15 App Router',
    routes: [
      { path: '/', label: 'Home', required: true, source: 'blueprint' },
      {
        path: '/dashboard',
        label: 'Dashboard',
        required: true,
        source: 'blueprint',
      },
    ],
    layouts: ['Responsive application shell'],
    navigation: ['Home and Dashboard navigation'],
    dataModels: [
      {
        name: 'DashboardMetric',
        fields: ['label', 'value'],
        source: 'blueprint',
      },
    ],
    relationships: [],
    authentication: 'No authentication is required.',
    rolesAndPermissions: [],
    apis: [],
    integrations: [],
    aiCapabilities: [],
    storageRequirements: [],
    billingRequirements: [],
    backgroundJobs: [],
    environmentVariableNames: [],
    deploymentTarget: 'Vercel',
    visualRequirements: {
      appearance: 'dark',
      source: 'blueprint',
    },
    responsiveRequirements: {
      mobileSupport: ['responsive-web'],
      expectations: ['Dashboard works on desktop and mobile.'],
      source: 'blueprint',
    },
    accessibilityExpectations: {
      expectations: ['Primary navigation is keyboard accessible.'],
      source: 'platform-default',
    },
    acceptanceCriteria: ['Production checks pass.'],
    constraints: ['Use a lean budget and preserve user-edited files.'],
    optionalCapabilities: ['analytics'],
    requiredCapabilities: ['framework-nextjs', 'app-router-routes'],
    requirements: [
      {
        stableId: 'req-route-dashboard',
        type: 'route',
        title: 'Dashboard route',
        description: 'A complete dashboard must exist at /dashboard.',
        status: 'required',
        source: 'blueprint',
        validationStrategy: 'route-exists',
        completionStatus: 'pending',
        evidenceReferences: [{ kind: 'route', ref: '/dashboard' }],
      },
    ],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function task(
  id: string,
  overrides: Partial<TaskGraphTask> = {}
): TaskGraphTask {
  return {
    id,
    title: id === 'task-foundation' ? 'Create project foundation' : 'Build dashboard',
    description:
      id === 'task-foundation'
        ? 'Create the project foundation.'
        : 'Implement the approved dashboard route.',
    category: id === 'task-foundation' ? 'foundation' : 'frontend',
    capabilityIds:
      id === 'task-foundation'
        ? ['framework-nextjs']
        : ['app-router-routes'],
    sourceRequirementIds:
      id === 'task-foundation' ? [] : ['req-route-dashboard'],
    dependencies: id === 'task-foundation' ? [] : ['task-foundation'],
    status: id === 'task-foundation' ? 'ready' : 'pending',
    priority: id === 'task-foundation' ? 'critical' : 'high',
    allowedFileScope:
      id === 'task-foundation'
        ? ['package.json', 'tsconfig.json', 'src/app/**']
        : ['src/app/dashboard/**', 'src/components/dashboard/**'],
    expectedFiles:
      id === 'task-foundation'
        ? ['package.json', 'tsconfig.json', 'src/app/page.tsx']
        : [
            'src/app/dashboard/page.tsx',
            'src/components/dashboard/DashboardClient.tsx',
          ],
    expectedOutputs:
      id === 'task-foundation'
        ? ['A valid Next.js foundation.']
        : ['A complete dashboard screen.'],
    acceptanceChecks:
      id === 'task-foundation'
        ? ['Project manifest and TypeScript configuration exist.']
        : ['Route /dashboard exists and renders.'],
    validationCommands: ['yarn type-check'],
    retryCount: 0,
    maximumRetryCount: 2,
    failureClassification: 'none',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    assignedDiscipline: id === 'task-foundation' ? 'foundation' : 'frontend',
    resultEvidence: [],
    resumable: true,
    fingerprint: `fingerprint-${id}`,
    ...overrides,
  };
}

function graph(tasks: TaskGraphTask[] = [task('task-foundation'), task('task-dashboard')]): TaskGraph {
  return {
    schemaVersion: TASK_GRAPH_SCHEMA_VERSION,
    metadataVersion: TASK_GRAPH_METADATA_VERSION,
    id: 'graph-foreman',
    projectId: 'project-foreman',
    projectName: 'Foreman Dashboard',
    contractId: 'contract-foreman',
    contractVersion: 2,
    sourceBuildContractUpdatedAt: NOW.toISOString(),
    tasks,
    warnings: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function blueprint(): BlueprintDraft {
  return {
    id: 'blueprint-foreman',
    projectName: 'Foreman Dashboard',
    appDescription: 'A responsive operations dashboard.',
    routes: [
      {
        id: 'route-dashboard',
        name: 'Dashboard',
        path: '/dashboard',
        description: 'Primary metrics and actions.',
      },
      {
        id: 'route-unrelated',
        name: 'Unrelated',
        path: '/unrelated',
        description: 'Deferred.',
      },
    ],
    dataModels: [
      {
        id: 'model-dashboard-metric',
        name: 'DashboardMetric',
        description: 'Typed metric displayed by the dashboard.',
        fields: ['label', 'value'],
      },
    ],
    components: [],
    integrations: [],
    userRoles: [],
    navigation: [],
    folderStructure: [],
    deploymentTarget: 'Vercel',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    metadataVersion: '2026-07-08',
  };
}

function repository(options: { protectedEnv?: boolean } = {}) {
  return createRepositoryModel({
    projectId: 'project-foreman',
    files: [
      file(
        'package.json',
        JSON.stringify({ scripts: { 'type-check': 'tsc --noEmit' }, dependencies: { next: '^15.0.0' } })
      ),
      file('src/app/page.tsx', 'export default function Page() { return null; }'),
      ...(options.protectedEnv ? [file('.env.local', 'SECRET=value')] : []),
    ],
    now: NOW,
  });
}

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function planningInputs(sourceGraph = graph(), sourceRepository = repository()) {
  const sourceContract = contract();
  const capabilities = resolveCapabilities(sourceContract, { now: NOW });
  const memory = createEngineeringMemory({
    projectId: 'project-foreman',
    buildContract: sourceContract,
    capabilityResolution: capabilities,
    taskGraph: sourceGraph,
    repositoryModel: sourceRepository,
    now: NOW,
  });
  const intelligenceCore = createIntelligenceCore({
    projectId: 'project-foreman',
    buildContract: sourceContract,
    capabilityResolution: capabilities,
    taskGraph: sourceGraph,
    repositoryModel: sourceRepository,
    engineeringMemory: memory,
    now: NOW,
  });
  const state = createEngineeringForemanState({
    projectId: 'project-foreman',
    taskGraph: sourceGraph,
    contract: sourceContract,
    capabilityResolution: capabilities,
    now: NOW,
  });
  return {
    taskGraph: sourceGraph,
    contract: sourceContract,
    capabilityResolution: capabilities,
    repositoryModel: sourceRepository,
    intelligenceCore,
    engineeringMemory: memory,
    blueprintDraft: blueprint(),
    state,
    now: NOW,
  };
}

describe('Engineering Foreman', () => {
  it('requires a confirmed repository refresh and then schedules dependencies first', () => {
    const inputs = planningInputs();
    const waiting = planNextEngineeringTask(inputs);

    expect(waiting).toMatchObject({
      kind: 'wait',
      repositoryRefreshRequired: true,
    });

    const refreshed = confirmForemanRepositoryRefresh(
      inputs.state,
      inputs.repositoryModel,
      NOW
    );
    const decision = planNextEngineeringTask({ ...inputs, state: refreshed });

    expect(decision).toMatchObject({
      kind: 'schedule',
      taskId: 'task-foundation',
      repositoryRefreshRequired: false,
    });
  });

  it('builds a compact task intelligence packet from only relevant sources', () => {
    const sourceGraph = graph([
      task('task-foundation', { status: 'passed', resumable: false }),
      task('task-dashboard', { status: 'ready' }),
    ]);
    const inputs = planningInputs(sourceGraph);
    const coreWithLesson = recordVerifiedExperienceLesson(
      inputs.intelligenceCore,
      {
        lessonId: 'dashboard-client-boundary',
        title: 'Dashboard client boundary',
        description: 'Keep route pages server-side and isolate interactive dashboard state.',
        evidenceReferences: [
          {
            kind: 'file',
            ref: 'src/components/dashboard/DashboardClient.tsx',
          },
        ],
        now: NOW,
      }
    );
    const state = confirmForemanRepositoryRefresh(
      inputs.state,
      inputs.repositoryModel,
      NOW
    );
    const decision = planNextEngineeringTask({
      ...inputs,
      state,
      intelligenceCore: coreWithLesson,
      budgetMode: 'free-first',
    });

    expect(decision.packet).toMatchObject({
      kind: 'engineering-task',
      projectId: 'project-foreman',
      task: { id: 'task-dashboard', discipline: 'frontend' },
      currentMilestone: 'core-ui',
      budgetMode: 'free-first',
    });
    expect(decision.packet?.contractRequirements.map((item) => item.stableId)).toEqual([
      'req-route-dashboard',
    ]);
    expect(decision.packet?.blueprintDecisions.map((item) => item.value)).toContain(
      '/dashboard'
    );
    expect(decision.packet?.blueprintDecisions.map((item) => item.value)).not.toContain(
      '/unrelated'
    );
    expect(decision.packet?.memoryLessons[0]?.recordId).toContain(
      'dashboard-client-boundary'
    );
    expect(decision.packet?.repairStrategy.preserveUnrelatedWork).toBe(true);

    const serialized = JSON.stringify(decision.packet);
    expect(serialized).not.toContain('"conversation"');
    expect(serialized).not.toContain('"taskGraph"');
    expect(serialized).not.toContain('"repositoryModel"');
    expect(serialized.length).toBeLessThan(12_000);
  });

  it('blocks protected expected outputs before issuing an engineering packet', () => {
    const protectedTask = task('task-foundation', {
      expectedFiles: ['.env.local'],
      allowedFileScope: ['.env.local'],
    });
    const sourceGraph = graph([protectedTask]);
    const sourceRepository = repository({ protectedEnv: true });
    const inputs = planningInputs(sourceGraph, sourceRepository);
    const state = confirmForemanRepositoryRefresh(
      inputs.state,
      inputs.repositoryModel,
      NOW
    );
    const decision = planNextEngineeringTask({ ...inputs, state });

    expect(decision.kind).toBe('blocked');
    expect(decision.packet).toBeUndefined();
    expect(
      decision.state.taskStates.find((item) => item.taskId === protectedTask.id)
    ).toMatchObject({
      status: 'blocked',
      blockedReason: 'Expected output is protected: .env.local',
    });
  });

  it('prevents duplicate scheduling while a task is active', () => {
    const inputs = planningInputs();
    const refreshed = confirmForemanRepositoryRefresh(
      inputs.state,
      inputs.repositoryModel,
      NOW
    );
    const running = startForemanTask(
      refreshed,
      'task-foundation',
      inputs.repositoryModel.repositoryFingerprint,
      NOW
    );
    const decision = planNextEngineeringTask({ ...inputs, state: running });

    expect(decision).toMatchObject({
      kind: 'wait',
      taskId: 'task-foundation',
      repositoryRefreshRequired: false,
    });
    expect(decision.reason).toMatch(/duplicate scheduling is not allowed/i);
  });

  it('uses bounded retry, repair, block, cancel, and escalation decisions', () => {
    expect(
      decideForemanFailureAction(
        task('repair', {
          status: 'recoverable-failure',
          failureClassification: 'type-check',
          retryCount: 1,
        })
      ).action
    ).toBe('repair');
    expect(
      decideForemanFailureAction(
        task('retry', {
          status: 'recoverable-failure',
          failureClassification: 'timeout',
          retryCount: 1,
        })
      ).action
    ).toBe('retry');
    expect(
      decideForemanFailureAction(
        task('exhausted', {
          status: 'failed',
          failureClassification: 'build',
          retryCount: 2,
        })
      ).action
    ).toBe('escalate');
    expect(
      decideForemanFailureAction(
        task('blocked', { status: 'blocked', blockedReason: 'Permission denied.' })
      ).action
    ).toBe('block');
    expect(
      decideForemanFailureAction(task('cancelled', { status: 'cancelled' })).action
    ).toBe('cancel');
  });

  it('records a targeted repair without clearing valid task state', () => {
    const inputs = planningInputs();
    const running = startForemanTask(
      inputs.state,
      'task-foundation',
      inputs.repositoryModel.repositoryFingerprint,
      NOW
    );
    const failedTask = task('task-foundation', {
      status: 'recoverable-failure',
      failureClassification: 'validation',
      retryCount: 1,
    });
    const failed = recordForemanFailure(running, failedTask, NOW);

    expect(failed.activeTaskId).toBeUndefined();
    expect(failed.taskStates.find((item) => item.taskId === failedTask.id)).toMatchObject({
      status: 'needs-repair',
      retryCount: 1,
      repairCount: 1,
      resumable: true,
    });
    expect(failed.taskStates.find((item) => item.taskId === 'task-dashboard')?.status).toBe(
      'queued'
    );
  });

  it('advances milestones and writes a durable checkpoint after validation', () => {
    const sourceGraph = graph([
      task('task-foundation', {
        status: 'passed',
        resumable: false,
        resultEvidence: [{ kind: 'file', ref: 'package.json' }],
      }),
      task('task-dashboard', { status: 'ready' }),
    ]);
    const inputs = planningInputs(sourceGraph);
    const checkpointed = recordValidatedForemanTask(
      inputs.state,
      sourceGraph,
      inputs.repositoryModel,
      inputs.engineeringMemory,
      'task-foundation',
      NOW
    );

    expect(checkpointed.currentMilestone).toBe('core-ui');
    expect(checkpointed.latestCheckpoint).toMatchObject({
      validatedTaskId: 'task-foundation',
      completedTaskIds: ['task-foundation'],
      repositoryFingerprint: inputs.repositoryModel.repositoryFingerprint,
      remainingTaskIds: ['task-dashboard'],
    });
    expect(
      checkpointed.milestones.find((item) => item.id === 'foundation')?.status
    ).toBe('complete');
    expect(
      checkpointed.milestones.find((item) => item.id === 'authentication')?.status
    ).toBe('complete');
  });

  it('persists and restores Foreman checkpoints through project snapshots', () => {
    const sourceGraph = graph([
      task('task-foundation', {
        status: 'passed',
        resumable: false,
        resultEvidence: [{ kind: 'file', ref: 'package.json' }],
      }),
      task('task-dashboard', { status: 'ready' }),
    ]);
    const inputs = planningInputs(sourceGraph);
    const foreman = recordValidatedForemanTask(
      inputs.state,
      sourceGraph,
      inputs.repositoryModel,
      inputs.engineeringMemory,
      'task-foundation',
      NOW
    );
    const localStorage = storage();

    saveMatrixProjectWorkspaceSnapshot(localStorage, {
      projectId: 'project-foreman',
      name: 'Foreman Dashboard',
      description: 'Checkpoint persistence',
      files: [],
      chatMessages: [],
      taskGraph: sourceGraph,
      engineeringForemanState: foreman,
      validationStatus: 'pending',
      deploymentStatus: 'unknown',
      updatedAt: NOW.toISOString(),
    });

    const restored = loadMatrixProjectWorkspaceSnapshot(localStorage);
    expect(restored?.engineeringForemanState?.latestCheckpoint).toMatchObject({
      validatedTaskId: 'task-foundation',
      remainingTaskIds: ['task-dashboard'],
    });
    const checkpointRestore = restoreLatestEngineeringForemanCheckpoint(
      restored!.engineeringForemanState!,
      new Date('2026-07-25T12:10:00.000Z')
    );
    expect(checkpointRestore?.taskGraph.tasks).toEqual(sourceGraph.tasks);
    expect(checkpointRestore?.state.activeTaskId).toBeUndefined();
  });

  it('restores interrupted work as resumable repair and never as complete', () => {
    const inputs = planningInputs();
    const running = startForemanTask(
      inputs.state,
      'task-foundation',
      inputs.repositoryModel.repositoryFingerprint,
      NOW
    );
    const interruptedGraph = graph([
      task('task-foundation', { status: 'running' }),
      task('task-dashboard'),
    ]);
    const restored = restoreEngineeringForemanState(
      running,
      interruptedGraph,
      new Date('2026-07-25T12:05:00.000Z')
    );

    expect(restored.activeTaskId).toBeUndefined();
    expect(
      restored.taskStates.find((item) => item.taskId === 'task-foundation')
    ).toMatchObject({
      status: 'needs-repair',
      resumable: true,
    });
  });

  it('prioritizes the resumable task recorded by Engineering Memory', () => {
    const sourceGraph = graph([
      task('repair-a', {
        status: 'recoverable-failure',
        dependencies: [],
        retryCount: 1,
      }),
      task('repair-b', {
        status: 'recoverable-failure',
        dependencies: [],
        retryCount: 1,
      }),
    ]);
    const inputs = planningInputs(sourceGraph);
    const memory = {
      ...inputs.engineeringMemory,
      resumableTaskId: 'repair-b',
    };
    const state = confirmForemanRepositoryRefresh(
      inputs.state,
      inputs.repositoryModel,
      NOW
    );
    const decision = planNextEngineeringTask({
      ...inputs,
      state,
      engineeringMemory: memory,
    });

    expect(decision).toMatchObject({
      kind: 'repair',
      taskId: 'repair-b',
    });
  });

  it('cancels unfinished tasks while preserving completed work', () => {
    const sourceGraph = graph([
      task('task-foundation', { status: 'passed', resumable: false }),
      task('task-dashboard', { status: 'ready' }),
    ]);
    const inputs = planningInputs(sourceGraph);
    const cancelled = cancelEngineeringForeman(
      inputs.state,
      'Cancelled by user.',
      NOW
    );

    expect(cancelled.cancelled).toBe(true);
    expect(
      cancelled.taskStates.find((item) => item.taskId === 'task-foundation')?.status
    ).toBe('complete');
    expect(
      cancelled.taskStates.find((item) => item.taskId === 'task-dashboard')?.status
    ).toBe('cancelled');
  });

  it('does not rerun completed tasks and recovers malformed optional state safely', () => {
    const sourceGraph = graph([
      task('task-foundation', { status: 'passed', resumable: false }),
      task('task-dashboard', { status: 'ready' }),
    ]);
    const inputs = planningInputs(sourceGraph);

    expect(() =>
      startForemanTask(
        inputs.state,
        'task-foundation',
        inputs.repositoryModel.repositoryFingerprint,
        NOW
      )
    ).toThrow(/cannot be rerun/i);

    const malformed = JSON.parse(
      serializeEngineeringForemanState(inputs.state)
    ) as Record<string, unknown>;
    malformed.taskStates = [
      {
        taskId: 'task-dashboard',
        status: 'not-real',
        milestoneId: 'not-real',
        evidence: 'bad',
      },
    ];
    const restored = deserializeEngineeringForemanState(JSON.stringify(malformed));

    expect(restored?.taskStates[0]).toMatchObject({
      taskId: 'task-dashboard',
      status: 'queued',
      milestoneId: 'foundation',
      evidence: [],
    });
    expect(deserializeEngineeringForemanState('{bad json')).toBeNull();
  });
});
