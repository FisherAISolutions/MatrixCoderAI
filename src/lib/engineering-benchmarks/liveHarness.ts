import type { FileNode } from '@/app/chat-workspace/components/types';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import { AI_PROVIDER } from '@/lib/ai/modelConfig';
import { PRIMARY_MODEL } from '@/lib/ai/modelConfig';
import { createContractReviewReport } from '@/lib/contract-review';
import {
  createEngineeringMemory,
  recordTaskExecutionInMemory,
} from '@/lib/engineering-memory';
import {
  createRepositoryModel,
  refreshRepositoryModel,
  type RepositoryModel,
} from '@/lib/repository-model';
import { flattenTree } from '@/lib/repo/heuristics';
import {
  executeNextTask,
  createTaskValidationRunner,
  type TaskExecutionAiClient,
  type TaskExecutionValidationRunner,
} from '@/lib/task-execution';
import { cancelTaskGraph, getNextReadyTask } from '@/lib/task-graph';
import { getEngineeringAcceptanceFixture } from './fixtures';
import {
  LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
  type EngineeringAcceptanceFixture,
  type EngineeringBenchmarkId,
  type LiveEngineeringBenchmarkLimits,
  type LiveEngineeringBenchmarkResult,
  type LiveEngineeringBenchmarkStopReason,
  type LiveEngineeringBenchmarkTaskResult,
} from './types';

export const DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS: LiveEngineeringBenchmarkLimits = {
  maxTasks: 14,
  maxAiRequests: 20,
  maxRetryRequests: 14,
  maxExecutionDurationMs: 30 * 60 * 1000,
  maxFiles: 80,
  maxGeneratedBytes: 450_000,
  maxTaskRepairAttempts: 1,
  stopOnCostLimit: true,
  stopOnTimeLimit: true,
};

export interface LiveEngineeringBenchmarkOptions {
  fixtureId: EngineeringBenchmarkId;
  confirmation?: string;
  allowLiveProvider?: boolean;
  limits?: Partial<LiveEngineeringBenchmarkLimits>;
  aiClient?: TaskExecutionAiClient;
  validationRunner?: TaskExecutionValidationRunner;
  signal?: AbortSignal;
  now?: Date;
  onProgress?: (result: {
    runId: string;
    currentTaskId?: string;
    currentTaskTitle?: string;
    aiRequestsUsed: number;
    maxAiRequests: number;
    elapsedMs: number;
    progress: number;
    latestValidation?: string;
  }) => void;
}

let activeRunId: string | null = null;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createRunId(now: Date): string {
  return `live-benchmark-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

function countFiles(files: FileNode[]): number {
  return flattenTree(files).filter((file) => file.type === 'file').length;
}

function countBytes(files: FileNode[]): number {
  return flattenTree(files)
    .filter((file) => file.type === 'file')
    .reduce((sum, file) => sum + (file.content?.length ?? file.size ?? 0), 0);
}

function taskStatuses(
  fixture: EngineeringAcceptanceFixture,
  graph = fixture.taskGraph
): Record<string, number> {
  return graph.tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
}

function scoreFromContractReview(
  report: ReturnType<typeof createContractReviewReport> | undefined
): number {
  if (!report) return 0;
  const required = report.requirementReports.filter((item) => item.required);
  if (required.length === 0) return report.completionAllowed ? 100 : 0;
  const satisfied = required.filter((item) => item.status === 'satisfied').length;
  return Math.round((satisfied / required.length) * 100);
}

function statusFromBuildEvidence(
  taskResults: LiveEngineeringBenchmarkTaskResult[]
): LiveEngineeringBenchmarkResult['buildResult'] {
  const buildEvidence = taskResults.flatMap((task) =>
    task.validationSummary ? [task.validationSummary] : []
  );
  if (buildEvidence.some((summary) => /build.*failed|failed.*build/i.test(summary))) {
    return 'failed';
  }
  if (buildEvidence.some((summary) => /blocked/i.test(summary))) return 'blocked';
  if (buildEvidence.some((summary) => /build.*passed|validation passed/i.test(summary))) {
    return 'passed';
  }
  return 'not-run';
}

function redactedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED_OPENAI_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

function createEmptyResult(options: {
  fixture: EngineeringAcceptanceFixture;
  runId: string;
  startedAt: Date;
  endedAt: Date;
  stopReason: LiveEngineeringBenchmarkStopReason;
  isolatedProjectId: string;
  isolatedWorkspaceId: string;
  errors?: string[];
  warnings?: string[];
}): LiveEngineeringBenchmarkResult {
  return {
    runId: options.runId,
    fixtureId: options.fixture.id,
    displayName: options.fixture.displayName,
    model: PRIMARY_MODEL,
    startedAt: options.startedAt.toISOString(),
    endedAt: options.endedAt.toISOString(),
    durationMs: Math.max(0, options.endedAt.getTime() - options.startedAt.getTime()),
    isolatedProjectId: options.isolatedProjectId,
    isolatedWorkspaceId: options.isolatedWorkspaceId,
    taskCount: options.fixture.taskGraph.tasks.length,
    taskStatuses: taskStatuses(options.fixture),
    taskResults: [],
    aiRequestCount: 0,
    retryCount: 0,
    repairCount: 0,
    filesCreated: [],
    filesModified: [],
    generatedFileCount: 0,
    generatedBytes: 0,
    validationResults: [],
    buildResult: 'not-run',
    missingRequirements: [],
    blockedChecks: [],
    failureReasons: [],
    cancelled: options.stopReason === 'cancelled',
    finalScore: 0,
    estimatedUsage: { aiRequests: 0, retryRequests: 0 },
    stopReason: options.stopReason,
    warnings: options.warnings ?? [],
    errors: options.errors ?? [],
  };
}

function checkLimit(options: {
  limits: LiveEngineeringBenchmarkLimits;
  files: FileNode[];
  aiRequestCount: number;
  startedAt: Date;
  now: Date;
}): LiveEngineeringBenchmarkStopReason | null {
  if (
    options.limits.stopOnTimeLimit &&
    options.now.getTime() - options.startedAt.getTime() >=
      options.limits.maxExecutionDurationMs
  ) {
    return 'time-limit';
  }
  if (
    options.limits.stopOnCostLimit &&
    options.aiRequestCount >= options.limits.maxAiRequests
  ) {
    return 'cost-limit';
  }
  if (countFiles(options.files) > options.limits.maxFiles) return 'file-limit';
  if (countBytes(options.files) > options.limits.maxGeneratedBytes) return 'byte-limit';
  return null;
}

function createMeteredAiClient(options: {
  aiClient?: TaskExecutionAiClient;
  allowLiveProvider?: boolean;
  limits: LiveEngineeringBenchmarkLimits;
  requestCount: () => number;
  increment: () => void;
}): TaskExecutionAiClient | undefined {
  if (!options.aiClient && !options.allowLiveProvider) return undefined;
  const baseClient: TaskExecutionAiClient =
    options.aiClient ??
    {
      complete: async (messages, requestOptions) => {
        const response = await getChatCompletion(
          AI_PROVIDER,
          PRIMARY_MODEL,
          messages,
          { temperature: 0.2 },
          { signal: requestOptions.signal }
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

  return {
    complete: async (messages, requestOptions) => {
      if (options.requestCount() >= options.limits.maxAiRequests) {
        throw new Error('Live benchmark AI request limit reached.');
      }
      options.increment();
      return baseClient.complete(messages, requestOptions);
    },
  };
}

function memoryEvidenceKind(
  kind: string
): 'file' | 'route' | 'command' | 'requirement' | 'validation' | 'note' {
  if (kind === 'command') return 'command';
  if (kind === 'required-files') return 'file';
  if (kind === 'contract-acceptance') return 'requirement';
  return 'validation';
}

export function canStartLiveEngineeringBenchmark(options: {
  fixtureId?: string;
  confirmation?: string;
  allowLiveProvider?: boolean;
  aiClientProvided?: boolean;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!options.fixtureId) errors.push('Explicit benchmark fixture id is required.');
  if (options.fixtureId === 'all') {
    errors.push('Refusing to run all live engineering benchmarks.');
  }
  if (options.fixtureId && options.fixtureId !== 'simple-business-website') {
    errors.push('Only simple-business-website is enabled for the first live benchmark.');
  }
  if (options.confirmation !== LIVE_ENGINEERING_BENCHMARK_CONFIRMATION) {
    errors.push(
      `Live benchmark requires confirmation ${LIVE_ENGINEERING_BENCHMARK_CONFIRMATION}.`
    );
  }
  if (!options.allowLiveProvider && !options.aiClientProvided) {
    errors.push('Live provider use is disabled and no injected AI client was provided.');
  }
  if (activeRunId) errors.push(`Another live benchmark is already running: ${activeRunId}.`);
  return { ok: errors.length === 0, errors };
}

export async function runLiveEngineeringBenchmark(
  options: LiveEngineeringBenchmarkOptions
): Promise<LiveEngineeringBenchmarkResult> {
  const startedAt = options.now ?? new Date();
  const wallClockStartedAt = Date.now();
  const currentTime = () =>
    options.now
      ? new Date(startedAt.getTime() + (Date.now() - wallClockStartedAt))
      : new Date();
  const runId = createRunId(startedAt);
  const fixture = getEngineeringAcceptanceFixture(options.fixtureId);
  const isolatedProjectId = `${options.fixtureId}-${runId}-project`;
  const isolatedWorkspaceId = `${options.fixtureId}-${runId}-workspace`;

  if (!fixture) {
    return createEmptyResult({
      fixture: getEngineeringAcceptanceFixture('simple-business-website')!,
      runId,
      startedAt,
      endedAt: new Date(),
      stopReason: 'safety-refused',
      isolatedProjectId,
      isolatedWorkspaceId,
      errors: [`Unknown benchmark fixture: ${options.fixtureId}`],
    });
  }

  const safety = canStartLiveEngineeringBenchmark({
    fixtureId: options.fixtureId,
    confirmation: options.confirmation,
    allowLiveProvider: options.allowLiveProvider,
    aiClientProvided: Boolean(options.aiClient),
  });
  if (!safety.ok) {
    return createEmptyResult({
      fixture,
      runId,
      startedAt,
      endedAt: new Date(),
      stopReason: 'safety-refused',
      isolatedProjectId,
      isolatedWorkspaceId,
      errors: safety.errors,
    });
  }

  activeRunId = runId;
  const limits: LiveEngineeringBenchmarkLimits = {
    ...DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS,
    ...options.limits,
  };
  let aiRequestCount = 0;
  const meteredAiClient = createMeteredAiClient({
    aiClient: options.aiClient,
    allowLiveProvider: options.allowLiveProvider,
    limits,
    requestCount: () => aiRequestCount,
    increment: () => {
      aiRequestCount += 1;
    },
  });

  let graph = clone(fixture.taskGraph);
  graph = {
    ...graph,
    id: `${graph.id}-${runId}`,
    projectId: isolatedProjectId,
    projectName: `${fixture.displayName} Benchmark`,
    tasks: graph.tasks.slice(0, limits.maxTasks).map((task) => ({
      ...task,
      maximumRetryCount: Math.min(task.maximumRetryCount, limits.maxTaskRepairAttempts + 1),
    })),
  };
  let files: FileNode[] = [];
  let repositoryModel: RepositoryModel = createRepositoryModel({
    files,
    projectId: isolatedProjectId,
    now: startedAt,
  });
  let memory = createEngineeringMemory({
    projectId: isolatedProjectId,
    buildContract: fixture.buildContract,
    capabilityResolution: fixture.capabilityResolution,
    taskGraph: graph,
    repositoryModel,
    now: startedAt,
  });

  const taskResults: LiveEngineeringBenchmarkTaskResult[] = [];
  const filesCreated = new Set<string>();
  const filesModified = new Set<string>();
  const validationResults: string[] = [];
  const failureReasons: string[] = [];
  let stopReason: LiveEngineeringBenchmarkStopReason = 'completed';
  let lastError: string | undefined;

  const validationRunner =
    options.validationRunner ??
    createTaskValidationRunner({
      requirements: fixture.prompt,
    });

  try {
    while (taskResults.length < limits.maxTasks) {
      const now = currentTime();
      if (options.signal?.aborted) {
        graph = cancelTaskGraph(graph, 'Live engineering benchmark cancelled.', now);
        stopReason = 'cancelled';
        break;
      }
      const limitStop = checkLimit({
        limits,
        files,
        aiRequestCount,
        startedAt,
        now,
      });
      if (limitStop) {
        stopReason = limitStop;
        break;
      }

      const nextTask = getNextReadyTask(graph);
      if (!nextTask) break;

      options.onProgress?.({
        runId,
        currentTaskId: nextTask.id,
        currentTaskTitle: nextTask.title,
        aiRequestsUsed: aiRequestCount,
        maxAiRequests: limits.maxAiRequests,
        elapsedMs: now.getTime() - startedAt.getTime(),
        progress: taskResults.length / Math.max(1, graph.tasks.length),
      });

      const beforeRequests = aiRequestCount;
      const result = await executeNextTask({
        enabled: true,
        projectId: isolatedProjectId,
        graph,
        files,
        repositoryModel,
        aiClient: meteredAiClient,
        validationRunner,
        targetedRepair: {
          enabled: limits.maxTaskRepairAttempts > 0,
          maxAttempts: limits.maxTaskRepairAttempts,
          aiClient: meteredAiClient,
        },
        signal: options.signal,
        runId,
        operationId: `${runId}:${nextTask.id}:${taskResults.length + 1}`,
        shouldAcceptResult: (guard) => guard.runId === runId && activeRunId === runId,
      });

      graph = result.graph;
      files = result.files;
      repositoryModel = refreshRepositoryModel(repositoryModel, {
        files,
        projectId: isolatedProjectId,
        now: currentTime(),
      }).model;

      const created = result.appliedChanges
        .filter((change) => change.kind === 'create')
        .map((change) => change.path);
      const modified = result.appliedChanges
        .filter((change) => change.kind === 'edit' || change.kind === 'update')
        .map((change) => change.path);
      created.forEach((path) => filesCreated.add(path));
      modified.forEach((path) => filesModified.add(path));
      if (result.validation?.summary) validationResults.push(result.validation.summary);

      const task = graph.tasks.find((item) => item.id === nextTask.id) ?? nextTask;
      const repairCount = Math.max(0, aiRequestCount - beforeRequests - 1);
      taskResults.push({
        taskId: task.id,
        title: task.title,
        status: task.status,
        aiRequestsBefore: beforeRequests,
        aiRequestsAfter: aiRequestCount,
        retryCount: task.retryCount,
        repairCount,
        filesCreated: created,
        filesModified: modified,
        validationSummary: result.validation?.summary,
        errors: result.errors,
        warnings: result.warnings,
      });

      memory = recordTaskExecutionInMemory(memory, {
        task,
        taskGraph: graph,
        repositoryModel,
        changedFiles: [...created, ...modified],
        validationEvidence: result.validation?.evidence?.map((item) => ({
          kind: memoryEvidenceKind(item.kind),
          ref: item.file ?? item.message,
          status:
            item.status === 'passed'
              ? 'passed'
              : item.status === 'skipped'
                ? 'skipped'
                : item.status === 'blocked'
                  ? 'blocked'
                  : 'failed',
          description: item.message,
        })),
        warnings: result.warnings,
        errors: result.errors,
        runId,
        operationId: result.state.activeOperationId,
        checkpointOnSuccess: result.status === 'passed',
        now: currentTime(),
      });

      options.onProgress?.({
        runId,
        currentTaskId: task.id,
        currentTaskTitle: task.title,
        aiRequestsUsed: aiRequestCount,
        maxAiRequests: limits.maxAiRequests,
        elapsedMs: currentTime().getTime() - startedAt.getTime(),
        progress: taskResults.length / Math.max(1, graph.tasks.length),
        latestValidation: result.validation?.summary,
      });

      if (result.status === 'failed' || result.status === 'recoverable-failure') {
        stopReason = 'task-failed';
        failureReasons.push(result.errors[0] ?? result.validation?.summary ?? 'Task failed.');
        break;
      }
      if (result.status === 'blocked') {
        stopReason = 'task-blocked';
        failureReasons.push(result.errors[0] ?? result.validation?.summary ?? 'Task blocked.');
        break;
      }
      if (result.status === 'cancelled') {
        stopReason = 'cancelled';
        break;
      }
      if (result.status === 'stale') {
        stopReason = 'error';
        failureReasons.push('Task result was rejected as stale.');
        break;
      }
    }
  } catch (error) {
    lastError = redactedError(error);
    stopReason = /request limit/i.test(lastError) ? 'cost-limit' : 'error';
    failureReasons.push(lastError);
  } finally {
    activeRunId = null;
  }

  const finalRepositoryModel = refreshRepositoryModel(repositoryModel, {
    files,
    projectId: isolatedProjectId,
    now: currentTime(),
  }).model;
  const contractReview = createContractReviewReport({
    contract: fixture.buildContract,
    repositoryModel: finalRepositoryModel,
    files,
    now: currentTime(),
  });
  const missingRequirements = contractReview.requirementReports
    .filter((item) => item.required && item.status !== 'satisfied')
    .map((item) => item.requirementId);
  const blockedChecks = contractReview.requirementReports
    .filter((item) => item.status === 'blocked')
    .map((item) => item.requirementId);
  const endedAt = currentTime();

  return {
    runId,
    fixtureId: fixture.id,
    displayName: fixture.displayName,
    model: PRIMARY_MODEL,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    isolatedProjectId,
    isolatedWorkspaceId,
    taskCount: graph.tasks.length,
    taskStatuses: taskStatuses(fixture, graph),
    taskResults,
    aiRequestCount,
    retryCount: taskResults.reduce((sum, task) => sum + task.retryCount, 0),
    repairCount: taskResults.reduce((sum, task) => sum + task.repairCount, 0),
    filesCreated: Array.from(filesCreated).sort(),
    filesModified: Array.from(filesModified).sort(),
    generatedFileCount: countFiles(files),
    generatedBytes: countBytes(files),
    validationResults,
    buildResult: statusFromBuildEvidence(taskResults),
    contractReview,
    missingRequirements,
    blockedChecks,
    failureReasons,
    cancelled: stopReason === 'cancelled',
    finalScore: scoreFromContractReview(contractReview),
    estimatedUsage: {
      aiRequests: aiRequestCount,
      retryRequests: taskResults.reduce((sum, task) => sum + task.repairCount, 0),
    },
    stopReason,
    warnings: [
      `Isolated benchmark workspace: ${isolatedWorkspaceId}`,
      `Engineering memory captured ${memory.taskExecutionHistory.length} task event(s).`,
    ],
    errors: lastError ? [lastError] : [],
  };
}
