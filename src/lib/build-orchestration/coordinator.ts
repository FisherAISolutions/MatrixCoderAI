import type { FileNode } from '@/app/chat-workspace/components/types';
import { createContractReviewReport } from '@/lib/contract-review';
import {
  createEngineeringMemory,
  recordTaskExecutionInMemory,
  restoreEngineeringMemory,
  type EngineeringMemory,
  type EngineeringMemoryValidationEvidence,
} from '@/lib/engineering-memory';
import {
  createRepositoryModel,
  refreshRepositoryModel,
} from '@/lib/repository-model';
import {
  createTaskValidationRunner,
  executeNextTask,
  type TaskExecutionResult,
  type TaskExecutionState,
} from '@/lib/task-execution';
import {
  createTaskGraph,
  getNextReadyTask,
  getTaskGraphProgress,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';
import { runValidation } from '@/lib/validation';
import { createOperationId, createRunId } from '@/lib/task-execution/state';
import { createBuildOrchestrationState } from './state';
import type {
  BuildOrchestrationEvent,
  BuildOrchestrationSnapshot,
  BuildOrchestrationState,
  BuildOrchestrationStopReason,
  InitializedTaskDrivenBuild,
  InitializeTaskDrivenBuildOptions,
  RunTaskDrivenBuildOptions,
  TaskDrivenBuildResult,
} from './types';

const DEFAULT_MAX_TASK_EXECUTIONS = 100;

function requirementsText(
  contract: RunTaskDrivenBuildOptions['contract']
): string {
  return [
    contract.projectSummary,
    ...contract.requirements
      .filter((requirement) => requirement.status === 'required')
      .map((requirement) => requirement.description),
  ]
    .filter(Boolean)
    .join('\n');
}

function completedCount(graph: TaskGraph): number {
  return graph.tasks.filter((task) =>
    ['passed', 'skipped'].includes(task.status)
  ).length;
}

function activeCount(graph: TaskGraph): number {
  return graph.tasks.filter((task) =>
    ['running', 'validating'].includes(task.status)
  ).length;
}

function resumableGraphAfterCancellation(
  graph: TaskGraph,
  taskId: string | undefined,
  now = new Date()
): TaskGraph {
  if (!taskId) return graph;
  const nowIso = now.toISOString();
  return {
    ...graph,
    updatedAt: nowIso,
    tasks: graph.tasks.map((task) =>
      task.id === taskId && task.status === 'cancelled'
        ? {
            ...task,
            status: 'recoverable-failure',
            completedAt: undefined,
            updatedAt: nowIso,
            blockedReason: 'Cancelled by user; completed files were preserved.',
            resumable: true,
          }
        : task
    ),
  };
}

function validationEvidence(
  result: TaskExecutionResult
): EngineeringMemoryValidationEvidence[] {
  return (result.validation?.evidence ?? []).map((item) => ({
    kind:
      item.kind === 'command' ? 'command' : 'validation',
    ref: item.file ?? item.kind,
    status:
      item.status === 'blocked'
        ? 'blocked'
        : item.status === 'failed'
          ? 'failed'
          : item.status === 'skipped'
            ? 'skipped'
            : 'passed',
    description: item.message,
  }));
}

function mergeRepairTasks(
  graph: TaskGraph,
  repairs: TaskGraphTask[],
  now = new Date()
): { graph: TaskGraph; added: TaskGraphTask[] } {
  const existing = new Map(graph.tasks.map((task) => [task.id, task]));
  const added = repairs.filter((task) => !existing.has(task.id));
  if (!added.length) return { graph, added };
  return {
    graph: {
      ...graph,
      tasks: [...graph.tasks, ...added],
      updatedAt: now.toISOString(),
    },
    added,
  };
}

function nextState(
  state: BuildOrchestrationState,
  graph: TaskGraph,
  updates: Partial<BuildOrchestrationState>,
  now = new Date()
): BuildOrchestrationState {
  return {
    ...state,
    ...updates,
    completedTaskCount: completedCount(graph),
    totalTaskCount: graph.tasks.length,
    updatedAt: now.toISOString(),
  };
}

function stopResult(
  snapshot: BuildOrchestrationSnapshot,
  stopReason: BuildOrchestrationStopReason
): TaskDrivenBuildResult {
  return { ...snapshot, stopReason };
}

async function emit(
  options: RunTaskDrivenBuildOptions,
  snapshot: BuildOrchestrationSnapshot,
  event: Omit<BuildOrchestrationEvent, keyof BuildOrchestrationSnapshot>
): Promise<void> {
  if (!options.onEvent) return;
  await options.onEvent({ ...snapshot, ...event });
}

export function initializeTaskDrivenBuild(
  options: InitializeTaskDrivenBuildOptions
): InitializedTaskDrivenBuild {
  const now = options.now ?? new Date();
  const graph = createTaskGraph({
    contract: options.contract,
    capabilityResolution: options.capabilityResolution,
    existingGraph: options.existingGraph,
    now,
  });
  const repositoryModel = options.existingRepositoryModel
    ? refreshRepositoryModel(options.existingRepositoryModel, {
        files: options.files,
        projectId: options.projectId,
        generatedFilePaths: options.generatedFilePaths,
        userEditedFilePaths: options.userEditedFilePaths,
        protectedPaths: options.protectedPaths,
        now,
      }).model
    : createRepositoryModel({
        files: options.files,
        projectId: options.projectId,
        generatedFilePaths: options.generatedFilePaths,
        userEditedFilePaths: options.userEditedFilePaths,
        protectedPaths: options.protectedPaths,
        now,
      });
  const memorySeed = createEngineeringMemory({
    projectId: options.projectId,
    buildContract: options.contract,
    capabilityResolution: options.capabilityResolution,
    taskGraph: graph,
    repositoryModel,
    existingMemory: options.existingEngineeringMemory,
    now,
  });
  const engineeringMemory = options.existingEngineeringMemory
    ? restoreEngineeringMemory(memorySeed, { repositoryModel, now })
    : memorySeed;
  const priorMatchesContract =
    options.existingState?.contractId === options.contract.id &&
    options.existingState.contractVersion === options.contract.contractVersion;
  const state = priorMatchesContract
    ? nextState(options.existingState!, graph, {
        status: 'idle',
        activeTaskId: undefined,
        stopReason: undefined,
        repositoryFingerprint: repositoryModel.repositoryFingerprint,
      }, now)
    : createBuildOrchestrationState({
        projectId: options.projectId,
        contractId: options.contract.id,
        contractVersion: options.contract.contractVersion,
        completedTaskCount: completedCount(graph),
        totalTaskCount: graph.tasks.length,
        maximumContractRepairRounds: options.maximumContractRepairRounds,
        now,
      });

  return { state, graph, repositoryModel, engineeringMemory, files: options.files };
}

export async function runTaskDrivenBuild(
  options: RunTaskDrivenBuildOptions
): Promise<TaskDrivenBuildResult> {
  const executeTask = options.dependencies?.executeTask ?? executeNextTask;
  const runFinalValidation =
    options.dependencies?.runFinalValidation ?? runValidation;
  const createReview =
    options.dependencies?.createReviewReport ?? createContractReviewReport;
  const runId = createRunId();
  const operationId = createOperationId();
  const maxTaskExecutions =
    options.maxTaskExecutions ?? DEFAULT_MAX_TASK_EXECUTIONS;
  let state = nextState(options.state, options.graph, {
    status: 'preparing',
    runId,
    operationId,
    startedAt: options.state.startedAt ?? new Date().toISOString(),
    finishedAt: undefined,
    stopReason: undefined,
    warnings: [],
    errors: [],
  });
  let graph = options.graph;
  let files = options.files;
  let repositoryModel = options.repositoryModel;
  let engineeringMemory = options.engineeringMemory;
  let taskExecutionState: TaskExecutionState | undefined;
  let contractReviewReport = options.contractReviewReport;
  let finalValidationResult = options.finalValidationResult;
  let executions = 0;

  const snapshot = (): BuildOrchestrationSnapshot => ({
    state,
    graph,
    repositoryModel,
    engineeringMemory,
    files,
    taskExecutionState,
    contractReviewReport,
    finalValidationResult,
  });
  const accepted = () =>
    options.shouldAcceptResult?.({
      projectId: options.projectId,
      runId,
      operationId,
    }) ?? true;

  await emit(options, snapshot(), {
    type: 'initialized',
    message: `Prepared ${graph.tasks.length} bounded engineering tasks.`,
  });

  while (true) {
    if (!accepted()) {
      state = nextState(state, graph, {
        status: 'stale',
        stopReason: 'stale-run',
        finishedAt: new Date().toISOString(),
        errors: ['Build result was rejected because the active project or run changed.'],
      });
      await emit(options, snapshot(), {
        type: 'stopped',
        message: 'Stopped a stale build run before it could update the project.',
      });
      return stopResult(snapshot(), 'stale-run');
    }

    if (options.signal?.aborted) {
      graph = resumableGraphAfterCancellation(graph, state.activeTaskId);
      state = nextState(state, graph, {
        status: 'cancelled',
        activeTaskId: undefined,
        stopReason: 'cancelled-by-user',
        finishedAt: new Date().toISOString(),
        warnings: ['Cancelled by user. Completed files and passed tasks were preserved.'],
      });
      await emit(options, snapshot(), {
        type: 'stopped',
        message: 'Cancelled by user. The build can be resumed from its checkpoint.',
      });
      return stopResult(snapshot(), 'cancelled-by-user');
    }

    const nextTask = getNextReadyTask(graph);
    if (nextTask) {
      if (executions >= maxTaskExecutions) {
        state = nextState(state, graph, {
          status: 'blocked',
          activeTaskId: undefined,
          stopReason: 'safety-limit',
          finishedAt: new Date().toISOString(),
          errors: [`Stopped after the bounded limit of ${maxTaskExecutions} task executions.`],
        });
        await emit(options, snapshot(), {
          type: 'stopped',
          message: state.errors[0],
        });
        return stopResult(snapshot(), 'safety-limit');
      }

      executions += 1;
      state = nextState(state, graph, {
        status: 'running',
        activeTaskId: nextTask.id,
      });
      await emit(options, snapshot(), {
        type: 'task-started',
        task: nextTask,
        message: nextTask.title,
      });

      const taskResult = await executeTask({
        enabled: true,
        projectId: options.projectId,
        graph,
        files,
        repositoryModel,
        validationRunner: createTaskValidationRunner({
          requirements: requirementsText(options.contract),
        }),
        targetedRepair: { enabled: true, maxAttempts: 1 },
        signal: options.signal,
        generatedFilePaths: options.generatedFilePaths,
        userEditedFilePaths: options.userEditedFilePaths,
        protectedPaths: options.protectedPaths,
        shouldAcceptResult: () => accepted(),
      });

      graph = taskResult.graph;
      files = taskResult.files;
      repositoryModel = taskResult.repositoryModel;
      taskExecutionState = taskResult.state;
      const recordedTask =
        graph.tasks.find((task) => task.id === nextTask.id) ?? taskResult.task ?? nextTask;
      engineeringMemory = recordTaskExecutionInMemory(engineeringMemory, {
        task: recordedTask,
        runId: taskResult.state.activeRunId,
        operationId: taskResult.state.activeOperationId,
        changedFiles: taskResult.appliedChanges
          .filter((change) => change.kind !== 'skip')
          .map((change) => change.path),
        validationEvidence: validationEvidence(taskResult),
        warnings: taskResult.warnings,
        errors: taskResult.errors,
        repositoryModel,
        taskGraph: graph,
        checkpointOnSuccess:
          taskResult.status === 'passed' ? `${recordedTask.title} passed` : false,
      });
      state = nextState(state, graph, {
        status:
          taskResult.status === 'passed'
            ? 'running'
            : taskResult.status === 'cancelled'
              ? 'cancelled'
              : taskResult.status === 'blocked'
                ? 'blocked'
                : taskResult.status === 'failed'
                  ? 'failed'
                  : 'recoverable-failure',
        activeTaskId: undefined,
        repositoryFingerprint: repositoryModel.repositoryFingerprint,
        lastValidationSummary: taskResult.validation?.summary,
        warnings: taskResult.warnings,
        errors: taskResult.errors,
      });
      await emit(options, snapshot(), {
        type: 'task-finished',
        task: recordedTask,
        taskResult,
        message: `${recordedTask.title}: ${taskResult.status}`,
      });
      await emit(options, snapshot(), {
        type: 'checkpoint',
        task: recordedTask,
        taskResult,
        message: 'Project files and engineering progress checkpointed.',
      });

      if (taskResult.status === 'passed') continue;
      if (taskResult.status === 'cancelled') {
        graph = resumableGraphAfterCancellation(graph, recordedTask.id);
        state = nextState(state, graph, {
          status: 'cancelled',
          stopReason: 'cancelled-by-user',
          finishedAt: new Date().toISOString(),
        });
        await emit(options, snapshot(), {
          type: 'stopped',
          task: graph.tasks.find((task) => task.id === recordedTask.id),
          taskResult,
          message: 'Cancelled by user. The task is resumable and completed files were preserved.',
        });
        return stopResult(snapshot(), 'cancelled-by-user');
      }
      const stopReason: BuildOrchestrationStopReason =
        taskResult.status === 'blocked'
          ? 'environment-blocked'
          : taskResult.status === 'failed'
            ? 'critical-task-failure'
            : 'recoverable-task-failure';
      state = nextState(state, graph, {
        stopReason,
        finishedAt: new Date().toISOString(),
      });
      await emit(options, snapshot(), {
        type: 'stopped',
        task: recordedTask,
        taskResult,
        message: `${recordedTask.title} needs attention before the build can continue.`,
      });
      return stopResult(snapshot(), stopReason);
    }

    const progress = getTaskGraphProgress(graph);
    const unresolved = graph.tasks.filter(
      (task) => !['passed', 'skipped'].includes(task.status)
    );
    if (unresolved.length || activeCount(graph)) {
      const blocked = unresolved.some((task) => task.status === 'blocked');
      const failed = unresolved.some((task) => task.status === 'failed');
      const recoverable = unresolved.some((task) =>
        ['recoverable-failure', 'cancelled'].includes(task.status)
      );
      const stopReason: BuildOrchestrationStopReason = blocked
        ? 'environment-blocked'
        : failed
          ? 'critical-task-failure'
          : recoverable
            ? 'recoverable-task-failure'
            : 'no-ready-task';
      state = nextState(state, graph, {
        status: blocked ? 'blocked' : failed ? 'failed' : 'recoverable-failure',
        stopReason,
        finishedAt: new Date().toISOString(),
        errors: [
          `${unresolved.length} task(s) remain but none are ready to execute.`,
        ],
      });
      await emit(options, snapshot(), {
        type: 'stopped',
        message: state.errors[0],
      });
      return stopResult(snapshot(), stopReason);
    }

    state = nextState(state, graph, {
      status: 'validating',
      activeTaskId: undefined,
      completedTaskCount: progress.passed + progress.skipped,
    });
    await emit(options, snapshot(), {
      type: 'final-validation-started',
      message: 'Running final production validation against the completed repository.',
    });
    finalValidationResult = await runFinalValidation(files, {
      runtimeSmoke: true,
      requirements: requirementsText(options.contract),
      signal: options.signal,
    });

    if (options.signal?.aborted) continue;
    repositoryModel = refreshRepositoryModel(repositoryModel, {
      files,
      projectId: options.projectId,
      validationErrors: finalValidationResult.errors,
      generatedFilePaths: options.generatedFilePaths,
      userEditedFilePaths: options.userEditedFilePaths,
      protectedPaths: options.protectedPaths,
    }).model;
    state = nextState(state, graph, {
      status: 'reviewing',
      repositoryFingerprint: repositoryModel.repositoryFingerprint,
      lastValidationSummary: finalValidationResult.success
        ? 'Production validation passed.'
        : finalValidationResult.skipped
          ? finalValidationResult.skipReason ?? 'Production validation was blocked.'
          : 'Production validation failed.',
    });
    await emit(options, snapshot(), {
      type: 'contract-review-started',
      message: 'Reviewing every required Build Contract item and its evidence.',
    });
    contractReviewReport = createReview({
      contract: options.contract,
      repositoryModel,
      files,
      validationResult: finalValidationResult,
    });

    if (contractReviewReport.completionAllowed) {
      state = nextState(state, graph, {
        status: 'completed',
        stopReason: 'completed',
        finishedAt: new Date().toISOString(),
        warnings: contractReviewReport.summary.manualSetupSteps,
        errors: [],
      });
      await emit(options, snapshot(), {
        type: 'completed',
        message: 'Build Contract satisfied. The project is ready for review and launch.',
      });
      return stopResult(snapshot(), 'completed');
    }

    const repairs = contractReviewReport.requirementReports
      .map((requirement) => requirement.recommendedRepairTask)
      .filter((task): task is TaskGraphTask => Boolean(task));
    const merged = mergeRepairTasks(graph, repairs);
    graph = merged.graph;
    if (
      merged.added.length > 0 &&
      state.contractRepairRound < state.maximumContractRepairRounds
    ) {
      state = nextState(state, graph, {
        status: 'running',
        contractRepairRound: state.contractRepairRound + 1,
        warnings: [
          `Contract review added ${merged.added.length} targeted repair task(s).`,
        ],
        errors: [],
      });
      await emit(options, snapshot(), {
        type: 'repair-tasks-added',
        message: `Added ${merged.added.length} targeted contract repair task(s).`,
      });
      continue;
    }

    const manual = contractReviewReport.manualReviewRequirementIds.length > 0;
    const blocked = contractReviewReport.blockedRequirementIds.length > 0;
    const stopReason: BuildOrchestrationStopReason = blocked
      ? 'environment-blocked'
      : manual
        ? 'manual-review-required'
        : 'contract-incomplete';
    state = nextState(state, graph, {
      status: blocked ? 'blocked' : 'recoverable-failure',
      stopReason,
      finishedAt: new Date().toISOString(),
      warnings: contractReviewReport.summary.manualSetupSteps,
      errors: contractReviewReport.summary.whatRemains,
    });
    await emit(options, snapshot(), {
      type: 'stopped',
      message:
        merged.added.length === 0
          ? 'Contract review found remaining work without a new safe repair task.'
          : 'Contract repair safety limit reached; review is required.',
    });
    return stopResult(snapshot(), stopReason);
  }
}
