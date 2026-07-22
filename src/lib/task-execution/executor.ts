import type { FileNode } from '@/app/chat-workspace/components/types';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import { AI_PROVIDER, PRIMARY_MODEL } from '@/lib/ai/modelConfig';
import { CHAT_REQUEST_PROFILES } from '@/lib/ai/requestProfiles';
import {
  createRepositoryModel,
  getRepositoryContextForTask,
  refreshRepositoryModel,
  type RepositoryModel,
} from '@/lib/repository-model';
import {
  getNextReadyTask,
  markTaskPassed,
  recordTaskFailure,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';
import { buildTaskEngineeringInstruction } from './instructionBuilders';
import { applyTaskExecutionResponse } from './patchApplication';
import { createOperationId, createRunId, createTaskExecutionState } from './state';
import { runTargetedTaskRepair } from './targetedRepair';
import type {
  TaskExecutionAiClient,
  TaskExecutionGuard,
  TaskExecutionOptions,
  TaskExecutionResult,
  TaskExecutionState,
  TaskValidationResult,
} from './types';

const activeTaskStatuses = new Set(['running', 'validating']);

function defaultAiClient(): TaskExecutionAiClient {
  return {
    complete: async (messages, options) => {
      const response = await getChatCompletion(
        AI_PROVIDER,
        PRIMARY_MODEL,
        messages,
        CHAT_REQUEST_PROFILES.engineeringTask,
        { signal: options.signal }
      );
      const choice = response?.choices?.[0];
      return {
        content: choice?.message?.content ?? response?.content ?? '',
        finishReason: choice?.finish_reason ?? choice?.finishReason,
        usage: response?.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    },
  };
}

function expectedFilesExist(files: FileNode[], task: TaskGraphTask): boolean {
  const existing = new Set<string>();
  const walk = (nodes: FileNode[]) => {
    nodes.forEach((node) => {
      if (node.type === 'file') existing.add(node.path);
      if (node.children?.length) walk(node.children);
    });
  };
  walk(files);
  return (
    task.expectedFiles.length > 0 &&
    task.expectedFiles.every((path) => existing.has(path))
  );
}

async function defaultValidate(
  files: FileNode[],
  task: TaskGraphTask
): Promise<TaskValidationResult> {
  const missing = task.expectedFiles.filter((path) => !expectedFilesExistForPath(files, path));
  return {
    ok: missing.length === 0,
    summary: missing.length
      ? `Missing expected files: ${missing.join(', ')}`
      : 'Expected task files exist.',
    commands: task.validationCommands.map((command) => ({
      command,
      status: 'skipped' as const,
      output: 'Task executor foundation does not run project commands by default.',
    })),
    errors: missing.map((path) => `Missing expected file ${path}`),
    warnings: [],
  };
}

function expectedFilesExistForPath(files: FileNode[], path: string): boolean {
  let found = false;
  const walk = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file' && node.path === path) {
        found = true;
        return;
      }
      if (node.children?.length) walk(node.children);
      if (found) return;
    }
  };
  walk(files);
  return found;
}

function updateTask(
  graph: TaskGraph,
  taskId: string,
  updates: Partial<TaskGraphTask>,
  now: Date
): TaskGraph {
  const nowIso = now.toISOString();
  return {
    ...graph,
    updatedAt: nowIso,
    tasks: graph.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            ...updates,
            updatedAt: nowIso,
          }
        : task
    ),
  };
}

function blockDependents(graph: TaskGraph, failedTaskId: string, reason: string, now: Date): TaskGraph {
  const nowIso = now.toISOString();
  return {
    ...graph,
    updatedAt: nowIso,
    tasks: graph.tasks.map((task) => {
      if (!task.dependencies.includes(failedTaskId)) return task;
      if (task.status === 'passed' || task.status === 'skipped') return task;
      return {
        ...task,
        status: 'blocked',
        blockedReason: reason,
        updatedAt: nowIso,
        resumable: false,
      };
    }),
  };
}

function createResult(
  status: TaskExecutionResult['status'],
  options: {
    task?: TaskGraphTask;
    graph: TaskGraph;
    files: FileNode[];
    repositoryModel: RepositoryModel;
    state: TaskExecutionState;
    validation?: TaskValidationResult;
    warnings?: string[];
    errors?: string[];
  }
): TaskExecutionResult {
  return {
    status,
    task: options.task,
    graph: options.graph,
    files: options.files,
    repositoryModel: options.repositoryModel,
    state: options.state,
    validation: options.validation,
    appliedChanges: [],
    rejectedChanges: [],
    warnings: options.warnings ?? [],
    errors: options.errors ?? [],
  };
}

function isAbort(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function validationIsBlocked(validation: TaskValidationResult): boolean {
  return (
    validation.outcome === 'blocked by environment' ||
    validation.outcome === 'manual review required'
  );
}

function validationIsCancelled(validation: TaskValidationResult): boolean {
  return validation.outcome === 'cancelled';
}

function validationIsRecoverable(validation: TaskValidationResult): boolean {
  return validation.outcome === 'recoverable' || (!validation.ok && !validation.outcome);
}

function guardAccepted(
  guard: TaskExecutionGuard,
  options: Pick<TaskExecutionOptions, 'shouldAcceptResult'>
): boolean {
  return options.shouldAcceptResult ? options.shouldAcceptResult(guard) : true;
}

function startRepositoryModel(options: TaskExecutionOptions, now: Date): RepositoryModel {
  if (options.repositoryModel) {
    return refreshRepositoryModel(options.repositoryModel, {
      files: options.files,
      projectId: options.projectId,
      generatedFilePaths: options.generatedFilePaths,
      userEditedFilePaths: options.userEditedFilePaths,
      protectedPaths: options.protectedPaths,
      now,
    }).model;
  }
  return createRepositoryModel({
    files: options.files,
    projectId: options.projectId,
    generatedFilePaths: options.generatedFilePaths,
    userEditedFilePaths: options.userEditedFilePaths,
    protectedPaths: options.protectedPaths,
    now,
  });
}

export async function executeNextTask(
  options: TaskExecutionOptions
): Promise<TaskExecutionResult> {
  const now = options.now ?? new Date();
  const repositoryModel = startRepositoryModel(options, now);

  if (!options.enabled) {
    return createResult('skipped', {
      graph: options.graph,
      files: options.files,
      repositoryModel,
      state: createTaskExecutionState('skipped', now, {
        projectId: options.projectId,
        warnings: ['Task execution feature flag is disabled.'],
      }),
      warnings: ['Task execution feature flag is disabled.'],
    });
  }

  const activeTask = options.graph.tasks.find((task) =>
    activeTaskStatuses.has(task.status)
  );
  if (activeTask) {
    return createResult('blocked', {
      task: activeTask,
      graph: options.graph,
      files: options.files,
      repositoryModel,
      state: createTaskExecutionState('blocked', now, {
        projectId: options.projectId,
        activeTaskId: activeTask.id,
        warnings: [`Task ${activeTask.id} is already active.`],
      }),
      warnings: [`Task ${activeTask.id} is already active.`],
    });
  }

  const task = getNextReadyTask(options.graph);
  if (!task) {
    return createResult('idle', {
      graph: options.graph,
      files: options.files,
      repositoryModel,
      state: createTaskExecutionState('idle', now, {
        projectId: options.projectId,
        repositoryFingerprint: repositoryModel.repositoryFingerprint,
      }),
    });
  }

  if (isAbort(options.signal)) {
    const graph = updateTask(
      options.graph,
      task.id,
      {
        status: 'cancelled',
        blockedReason: 'Cancelled before task execution started.',
        completedAt: now.toISOString(),
        resumable: false,
      },
      now
    );
    return createResult('cancelled', {
      task,
      graph,
      files: options.files,
      repositoryModel,
      state: createTaskExecutionState('cancelled', now, {
        projectId: options.projectId,
        activeTaskId: task.id,
        errors: ['Cancelled before task execution started.'],
      }),
      errors: ['Cancelled before task execution started.'],
    });
  }

  const runId = options.runId ?? createRunId(now);
  const operationId = options.operationId ?? createOperationId(now);
  const guard: TaskExecutionGuard = {
    projectId: options.projectId,
    taskId: task.id,
    runId,
    operationId,
  };
  if (!guardAccepted(guard, options)) {
    return createResult('stale', {
      task,
      graph: options.graph,
      files: options.files,
      repositoryModel,
      state: createTaskExecutionState('stale', now, {
        projectId: options.projectId,
        activeTaskId: task.id,
        activeRunId: runId,
        activeOperationId: operationId,
        warnings: ['Task execution result was rejected as stale before AI work began.'],
      }),
      warnings: ['Task execution result was rejected as stale before AI work began.'],
    });
  }

  let graph = updateTask(
    options.graph,
    task.id,
    {
      status: 'running',
      startedAt: now.toISOString(),
      resumable: true,
    },
    now
  );
  const runningTask = graph.tasks.find((item) => item.id === task.id) ?? task;
  const context = getRepositoryContextForTask(runningTask, repositoryModel);
  const validationRunner = options.validationRunner ?? {
    validate: defaultValidate,
  };

  let files = options.files;
  let latestModel = repositoryModel;
  let appliedChanges: TaskExecutionResult['appliedChanges'] = [];
  let rejectedChanges: TaskExecutionResult['rejectedChanges'] = [];
  let extracted: TaskExecutionResult['extracted'];

  if (!context.expectedOutputsAlreadyExist) {
    const aiClient = options.aiClient ?? defaultAiClient();
    const messages = buildTaskEngineeringInstruction(runningTask, context);
    const aiResponse = await aiClient.complete(messages, {
      signal: options.signal,
      task: runningTask,
      context,
      runId,
      operationId,
    });

    if (isAbort(options.signal)) {
      graph = updateTask(
        graph,
        runningTask.id,
        {
          status: 'cancelled',
          blockedReason: 'Cancelled by user.',
          completedAt: now.toISOString(),
          resumable: false,
        },
        now
      );
      return createResult('cancelled', {
        task: runningTask,
        graph,
        files,
        repositoryModel: latestModel,
        state: createTaskExecutionState('cancelled', now, {
          projectId: options.projectId,
          activeTaskId: runningTask.id,
          activeRunId: runId,
          activeOperationId: operationId,
          errors: ['Cancelled by user.'],
        }),
        errors: ['Cancelled by user.'],
      });
    }

    if (!guardAccepted(guard, options)) {
      return createResult('stale', {
        task: runningTask,
        graph: options.graph,
        files: options.files,
        repositoryModel,
        state: createTaskExecutionState('stale', now, {
          projectId: options.projectId,
          activeTaskId: runningTask.id,
          activeRunId: runId,
          activeOperationId: operationId,
          warnings: ['Late task execution result was rejected.'],
        }),
        warnings: ['Late task execution result was rejected.'],
      });
    }

    const applied = applyTaskExecutionResponse({
      responseContent: aiResponse.content,
      files,
      task: runningTask,
      repositoryModel: latestModel,
      now,
    });
    files = applied.files;
    extracted = applied.extracted;
    appliedChanges = applied.appliedChanges;
    rejectedChanges = applied.rejectedChanges;
    latestModel = refreshRepositoryModel(latestModel, {
      files,
      projectId: options.projectId,
      generatedFilePaths: options.generatedFilePaths,
      userEditedFilePaths: options.userEditedFilePaths,
      protectedPaths: options.protectedPaths,
      now,
    }).model;
  }

  graph = updateTask(graph, runningTask.id, { status: 'validating' }, now);
  let validation = await validationRunner.validate(files, runningTask, latestModel, {
    signal: options.signal,
    runId,
    operationId,
  });

  if (isAbort(options.signal)) {
    graph = updateTask(
      graph,
      runningTask.id,
      {
        status: 'cancelled',
        blockedReason: 'Cancelled during validation.',
        completedAt: now.toISOString(),
        resumable: false,
      },
      now
    );
    return {
      status: 'cancelled',
      task: runningTask,
      graph,
      files,
      repositoryModel: latestModel,
      state: createTaskExecutionState('cancelled', now, {
        projectId: options.projectId,
        activeTaskId: runningTask.id,
        activeRunId: runId,
        activeOperationId: operationId,
        validationSummary: validation.summary,
        errors: ['Cancelled during validation.'],
      }),
      extracted,
      validation,
      appliedChanges,
      rejectedChanges,
      warnings: validation.warnings,
      errors: ['Cancelled during validation.'],
    };
  }

  if (!guardAccepted(guard, options)) {
    return {
      status: 'stale',
      task: runningTask,
      graph: options.graph,
      files: options.files,
      repositoryModel,
      state: createTaskExecutionState('stale', now, {
        projectId: options.projectId,
        activeTaskId: runningTask.id,
        activeRunId: runId,
        activeOperationId: operationId,
        validationSummary: validation.summary,
        warnings: ['Late validation result was rejected.'],
      }),
      extracted,
      validation,
      appliedChanges: [],
      rejectedChanges: [],
      warnings: ['Late validation result was rejected.'],
      errors: [],
    };
  }

  if (
    !validation.ok &&
    rejectedChanges.length === 0 &&
    options.targetedRepair?.enabled &&
    validationIsRecoverable(validation) &&
    runningTask.retryCount < runningTask.maximumRetryCount
  ) {
    const repair = await runTargetedTaskRepair({
      task: runningTask,
      files,
      repositoryModel: latestModel,
      validation,
      maxAttempts: options.targetedRepair.maxAttempts ?? 1,
      aiClient: options.targetedRepair.aiClient,
      signal: options.signal,
      runId,
      operationId,
      projectId: options.projectId,
      now,
      generatedFilePaths: options.generatedFilePaths,
      userEditedFilePaths: options.userEditedFilePaths,
      protectedPaths: options.protectedPaths,
    });

    files = repair.files;
    latestModel = repair.repositoryModel;
    appliedChanges.push(...repair.appliedChanges);
    rejectedChanges.push(...repair.rejectedChanges);

    if (repair.stoppedByEnvironment) {
      validation = {
        ...validation,
        ok: false,
        outcome: 'blocked by environment',
        summary: repair.errors[0] ?? validation.summary,
        errors: [...validation.errors, ...repair.errors],
        warnings: [...validation.warnings, ...repair.warnings],
      };
    } else if (repair.repaired && !isAbort(options.signal)) {
      validation = await validationRunner.validate(files, runningTask, latestModel, {
        signal: options.signal,
        runId,
        operationId: `${operationId}:post-repair`,
      });
    }
  }

  if (validation.ok && rejectedChanges.length === 0) {
    graph = markTaskPassed(
      graph,
      runningTask.id,
      [
        ...runningTask.resultEvidence,
        ...appliedChanges.map((change) => ({
          kind: 'file' as const,
          ref: change.path,
          description: change.description,
        })),
        ...validation.commands.map((command) => ({
          kind: 'command' as const,
          ref: command.command,
          description: command.status,
        })),
        {
          kind: 'note' as const,
          ref: validation.summary,
          description: 'Task validation summary',
        },
      ],
      now
    );
    return {
      status: 'passed',
      task: runningTask,
      graph,
      files,
      repositoryModel: latestModel,
      state: createTaskExecutionState('passed', now, {
        projectId: options.projectId,
        activeTaskId: runningTask.id,
        activeRunId: runId,
        activeOperationId: operationId,
        finishedAt: now.toISOString(),
        repositoryFingerprint: latestModel.repositoryFingerprint,
        validationSummary: validation.summary,
        warnings: validation.warnings,
      }),
      extracted,
      validation,
      appliedChanges,
      rejectedChanges,
      warnings: validation.warnings,
      errors: [],
    };
  }

  if (validationIsCancelled(validation)) {
    graph = updateTask(
      graph,
      runningTask.id,
      {
        status: 'cancelled',
        blockedReason: validation.summary,
        completedAt: now.toISOString(),
        resumable: false,
      },
      now
    );
    return {
      status: 'cancelled',
      task: runningTask,
      graph,
      files,
      repositoryModel: latestModel,
      state: createTaskExecutionState('cancelled', now, {
        projectId: options.projectId,
        activeTaskId: runningTask.id,
        activeRunId: runId,
        activeOperationId: operationId,
        validationSummary: validation.summary,
        errors: validation.errors,
      }),
      extracted,
      validation,
      appliedChanges,
      rejectedChanges,
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }

  if (validationIsBlocked(validation)) {
    graph = updateTask(
      graph,
      runningTask.id,
      {
        status: 'blocked',
        blockedReason: validation.summary,
        completedAt: now.toISOString(),
        resumable: false,
      },
      now
    );
    return {
      status: 'blocked',
      task: graph.tasks.find((item) => item.id === runningTask.id) ?? runningTask,
      graph,
      files,
      repositoryModel: latestModel,
      state: createTaskExecutionState('blocked', now, {
        projectId: options.projectId,
        activeTaskId: runningTask.id,
        activeRunId: runId,
        activeOperationId: operationId,
        validationSummary: validation.summary,
        warnings: validation.warnings,
        errors: validation.errors,
      }),
      extracted,
      validation,
      appliedChanges,
      rejectedChanges,
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }

  const failureReason =
    rejectedChanges[0]?.reason ??
    validation.errors[0] ??
    validation.summary ??
    'Task failed validation.';
  graph = recordTaskFailure(graph, runningTask.id, 'validation', failureReason, now);
  const updatedTask = graph.tasks.find((item) => item.id === runningTask.id);
  if (updatedTask?.status === 'failed') {
    graph = blockDependents(
      graph,
      runningTask.id,
      `Dependency ${runningTask.id} failed: ${failureReason}`,
      now
    );
  }

  const status = updatedTask?.status === 'failed' ? 'failed' : 'recoverable-failure';
  return {
    status,
    task: updatedTask ?? runningTask,
    graph,
    files,
    repositoryModel: latestModel,
    state: createTaskExecutionState(status, now, {
      projectId: options.projectId,
      activeTaskId: runningTask.id,
      activeRunId: runId,
      activeOperationId: operationId,
      finishedAt: now.toISOString(),
      repositoryFingerprint: latestModel.repositoryFingerprint,
      validationSummary: validation.summary,
      warnings: validation.warnings,
      errors: [...validation.errors, ...rejectedChanges.map((change) => change.reason)],
    }),
    extracted,
    validation,
    appliedChanges,
    rejectedChanges,
    warnings: validation.warnings,
    errors: [...validation.errors, ...rejectedChanges.map((change) => change.reason)],
  };
}
