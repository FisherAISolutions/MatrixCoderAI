import { describe, expect, it, vi } from 'vitest';

import {
  BUILD_CONTRACT_METADATA_VERSION,
  BUILD_CONTRACT_SCHEMA_VERSION,
  stableRequirementId,
  type BuildContract,
} from '@/lib/build-contract';
import {
  initializeTaskDrivenBuild,
  runTaskDrivenBuild,
  selectWorkspaceGenerationMode,
  type BuildOrchestrationEvent,
} from '@/lib/build-orchestration';
import {
  CONTRACT_REVIEW_METADATA_VERSION,
  CONTRACT_REVIEW_SCHEMA_VERSION,
  type ContractReviewReport,
} from '@/lib/contract-review';
import { resolveCapabilities } from '@/lib/capabilities';
import { refreshRepositoryModel } from '@/lib/repository-model';
import {
  TASK_EXECUTION_METADATA_VERSION,
  TASK_EXECUTION_SCHEMA_VERSION,
  type TaskExecutionOptions,
  type TaskExecutionResult,
} from '@/lib/task-execution';
import { getNextReadyTask } from '@/lib/task-graph';
import type { ValidationResult } from '@/lib/validation';

const now = '2026-07-22T12:00:00.000Z';

function contract(): BuildContract {
  return {
    schemaVersion: BUILD_CONTRACT_SCHEMA_VERSION,
    metadataVersion: BUILD_CONTRACT_METADATA_VERSION,
    contractVersion: 1,
    id: 'contract-orchestration',
    project: { projectId: 'project-1', projectName: 'Acme Site' },
    projectSummary: 'Build a production-ready business website.',
    targetFramework: 'Next.js 15 App Router',
    routes: [{ path: '/', label: 'Home', required: true, source: 'blueprint' }],
    layouts: [],
    navigation: ['/'],
    dataModels: [],
    relationships: [],
    authentication: 'No authentication required.',
    rolesAndPermissions: [],
    apis: [],
    integrations: [],
    aiCapabilities: [],
    storageRequirements: [],
    billingRequirements: [],
    backgroundJobs: [],
    environmentVariableNames: [],
    deploymentTarget: 'Vercel',
    visualRequirements: { appearance: 'dark', source: 'blueprint' },
    responsiveRequirements: {
      mobileSupport: ['responsive web'],
      expectations: ['Works on mobile and desktop.'],
      source: 'blueprint',
    },
    accessibilityExpectations: {
      expectations: ['Keyboard accessible navigation.'],
      source: 'blueprint',
    },
    acceptanceCriteria: ['Home route renders.'],
    constraints: ['Use src/app only.'],
    optionalCapabilities: [],
    requiredCapabilities: ['responsive-interface'],
    requirements: [
      {
        stableId: stableRequirementId('route', '/'),
        type: 'route',
        title: 'Home route',
        description: 'Home route must exist.',
        status: 'required',
        source: 'blueprint',
        validationStrategy: 'route-exists',
        completionStatus: 'pending',
        evidenceReferences: [{ kind: 'route', ref: '/' }],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function validationPassed(): ValidationResult {
  return {
    success: true,
    skipped: false,
    steps: [],
    errors: [],
    combinedLog: 'passed',
    durationMs: 1,
  };
}

function review(
  buildContract: BuildContract,
  completionAllowed: boolean
): ContractReviewReport {
  return {
    schemaVersion: CONTRACT_REVIEW_SCHEMA_VERSION,
    metadataVersion: CONTRACT_REVIEW_METADATA_VERSION,
    id: 'review-1',
    projectId: buildContract.project.projectId,
    projectName: buildContract.project.projectName,
    contractId: buildContract.id,
    contractVersion: buildContract.contractVersion,
    repositoryFingerprint: 'repository-1',
    buildValidationPassed: true,
    generatedAt: now,
    requirementReports: [],
    completionAllowed,
    blockingRequirementIds: completionAllowed ? [] : ['req-route-home'],
    optionalMissingRequirementIds: [],
    blockedRequirementIds: [],
    manualReviewRequirementIds: [],
    summary: {
      whatWasBuilt: [],
      whatPassed: completionAllowed ? ['Required contract evidence passed.'] : [],
      whatRemains: completionAllowed ? [] : ['Home route evidence is missing.'],
      blockedEnvironmentalItems: [],
      requiredEnvironmentVariables: [],
      manualSetupSteps: [],
      deploymentReadiness: completionAllowed ? 'ready' : 'not ready',
    },
  };
}

function taskResult(
  options: TaskExecutionOptions,
  status: 'passed' | 'cancelled'
): TaskExecutionResult {
  const current = getNextReadyTask(options.graph);
  if (!current) throw new Error('Expected a ready task.');
  const updatedTask = {
    ...current,
    status,
    updatedAt: now,
    completedAt: status === 'passed' ? now : undefined,
    blockedReason: status === 'cancelled' ? 'Cancelled by user.' : undefined,
  } as const;
  const graph = {
    ...options.graph,
    updatedAt: now,
    tasks: options.graph.tasks.map((task) =>
      task.id === current.id ? updatedTask : task
    ),
  };
  const repositoryModel = options.repositoryModel
    ? refreshRepositoryModel(options.repositoryModel, {
        files: options.files,
        projectId: options.projectId,
        now: new Date(now),
      }).model
    : (() => {
        throw new Error('Coordinator should provide a repository model.');
      })();

  return {
    status,
    task: updatedTask,
    graph,
    files: options.files,
    repositoryModel,
    state: {
      schemaVersion: TASK_EXECUTION_SCHEMA_VERSION,
      metadataVersion: TASK_EXECUTION_METADATA_VERSION,
      projectId: options.projectId,
      activeTaskId: current.id,
      activeRunId: 'task-run',
      activeOperationId: 'task-operation',
      status,
      startedAt: now,
      updatedAt: now,
      finishedAt: now,
      repositoryFingerprint: repositoryModel.repositoryFingerprint,
      warnings: [],
      errors: [],
    },
    validation:
      status === 'passed'
        ? {
            ok: true,
            outcome: 'passed',
            summary: 'Task validation passed.',
            commands: [],
            errors: [],
            warnings: [],
            evidence: [],
          }
        : undefined,
    appliedChanges: [],
    rejectedChanges: [],
    warnings: [],
    errors: [],
  };
}

describe('task-driven build orchestration', () => {
  it('routes large approved builds to task execution and blocks vague unapproved builds', () => {
    const request = 'Build a complete CRM dashboard with routes, forms, search, and filters.';

    expect(
      selectWorkspaceGenerationMode({
        request,
        agent: 'coding',
        existingFileCount: 0,
        hasApprovedBuildContract: true,
      })
    ).toBe('task-driven');
    expect(
      selectWorkspaceGenerationMode({
        request,
        agent: 'coding',
        existingFileCount: 0,
        hasApprovedBuildContract: false,
      })
    ).toBe('planning-required');
    expect(
      selectWorkspaceGenerationMode({
        request: 'Fix the typo in src/app/page.tsx.',
        agent: 'coding',
        existingFileCount: 20,
        hasApprovedBuildContract: true,
      })
    ).toBe('single-request');
  });

  it('executes ready tasks sequentially and completes only after contract approval', async () => {
    const buildContract = contract();
    const initialized = initializeTaskDrivenBuild({
      projectId: 'project-1',
      contract: buildContract,
      capabilityResolution: resolveCapabilities(buildContract),
      files: [],
      now: new Date(now),
    });
    const taskIds: string[] = [];
    const executeTask = vi.fn(async (options: TaskExecutionOptions) => {
      const ready = getNextReadyTask(options.graph);
      if (!ready) throw new Error('Expected one ready task.');
      taskIds.push(ready.id);
      return taskResult(options, 'passed');
    });

    const result = await runTaskDrivenBuild({
      ...initialized,
      projectId: 'project-1',
      contract: buildContract,
      capabilityResolution: resolveCapabilities(buildContract),
      dependencies: {
        executeTask,
        runFinalValidation: vi.fn(async () => validationPassed()),
        createReviewReport: vi.fn(() => review(buildContract, true)),
      },
    });

    expect(result.state.status).toBe('completed');
    expect(result.stopReason).toBe('completed');
    expect(taskIds).toHaveLength(initialized.graph.tasks.length);
    expect(new Set(taskIds).size).toBe(taskIds.length);
    expect(result.graph.tasks.every((task) => task.status === 'passed')).toBe(true);
  });

  it('does not report completion when final contract evidence is incomplete', async () => {
    const buildContract = contract();
    const initialized = initializeTaskDrivenBuild({
      projectId: 'project-1',
      contract: buildContract,
      capabilityResolution: resolveCapabilities(buildContract),
      files: [],
    });

    const result = await runTaskDrivenBuild({
      ...initialized,
      projectId: 'project-1',
      contract: buildContract,
      capabilityResolution: resolveCapabilities(buildContract),
      dependencies: {
        executeTask: async (options) => taskResult(options, 'passed'),
        runFinalValidation: async () => validationPassed(),
        createReviewReport: () => review(buildContract, false),
      },
    });

    expect(result.state.status).toBe('recoverable-failure');
    expect(result.stopReason).toBe('contract-incomplete');
    expect(result.contractReviewReport?.completionAllowed).toBe(false);
  });

  it('persists a cancelled task as resumable before the stopped checkpoint', async () => {
    const buildContract = contract();
    const initialized = initializeTaskDrivenBuild({
      projectId: 'project-1',
      contract: buildContract,
      capabilityResolution: resolveCapabilities(buildContract),
      files: [],
    });
    const events: BuildOrchestrationEvent[] = [];

    const result = await runTaskDrivenBuild({
      ...initialized,
      projectId: 'project-1',
      contract: buildContract,
      capabilityResolution: resolveCapabilities(buildContract),
      onEvent: (event) => {
        events.push(event);
      },
      dependencies: {
        executeTask: async (options) => taskResult(options, 'cancelled'),
      },
    });

    const stopped = events.findLast((event) => event.type === 'stopped');
    expect(result.stopReason).toBe('cancelled-by-user');
    expect(result.graph.tasks[0].status).toBe('recoverable-failure');
    expect(result.graph.tasks[0].resumable).toBe(true);
    expect(stopped?.graph.tasks[0].status).toBe('recoverable-failure');
  });
});
