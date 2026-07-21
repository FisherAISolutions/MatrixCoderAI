import type { FileNode } from '@/app/chat-workspace/components/types';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import { AI_PROVIDER, PRIMARY_MODEL } from '@/lib/ai/modelConfig';
import { flattenTree } from '@/lib/repo/heuristics';
import {
  getRepositoryContextForTask,
  refreshRepositoryModel,
  type RepositoryModel,
} from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';
import { AUTO_FIX_SYSTEM_PROMPT } from '@/lib/validation/autoFixPrompt';
import { applyTaskExecutionResponse } from './patchApplication';
import type {
  AppliedTaskChange,
  RejectedTaskChange,
  TaskExecutionAiClient,
  TaskExecutionAiMessage,
  TaskValidationResult,
} from './types';

export interface TargetedRepairResult {
  files: FileNode[];
  repositoryModel: RepositoryModel;
  attempts: number;
  appliedChanges: AppliedTaskChange[];
  rejectedChanges: RejectedTaskChange[];
  warnings: string[];
  errors: string[];
  repaired: boolean;
  stoppedByEnvironment: boolean;
}

export interface TargetedRepairOptions {
  task: TaskGraphTask;
  files: FileNode[];
  repositoryModel: RepositoryModel;
  validation: TaskValidationResult;
  maxAttempts?: number;
  aiClient?: TaskExecutionAiClient;
  signal?: AbortSignal;
  runId: string;
  operationId: string;
  projectId?: string;
  now?: Date;
  generatedFilePaths?: string[];
  userEditedFilePaths?: string[];
  protectedPaths?: string[];
}

function defaultAiClient(): TaskExecutionAiClient {
  return {
    complete: async (messages, options) => {
      const response = await getChatCompletion(
        AI_PROVIDER,
        PRIMARY_MODEL,
        messages,
        { temperature: 0.1 },
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

function renderFile(file: FileNode): string {
  const content = typeof file.content === 'string' ? file.content : '';
  const ext = file.path.split('.').pop() ?? 'ts';
  const truncated =
    content.length > 2400
      ? `${content.slice(0, 1400)}\n\n/* [... ${content.length - 2400} chars elided ...] */\n\n${content.slice(-1000)}`
      : content;
  return `\`\`\`${ext}
// path: ${file.path}
${truncated}
\`\`\``;
}

function relevantFileNodes(files: FileNode[], task: TaskGraphTask): FileNode[] {
  const flat = flattenTree(files).filter(
    (file) => file.type === 'file' && typeof file.content === 'string'
  );
  const wanted = new Set<string>(task.expectedFiles);
  for (const scope of task.allowedFileScope) {
    const prefix = scope.replace(/\/\*\*$/, '');
    flat
      .filter((file) => file.path === scope || file.path.startsWith(`${prefix}/`))
      .slice(0, 6)
      .forEach((file) => wanted.add(file.path));
  }
  return flat.filter((file) => wanted.has(file.path)).slice(0, 8);
}

function buildTargetedRepairMessages(options: TargetedRepairOptions): TaskExecutionAiMessage[] {
  const context = getRepositoryContextForTask(options.task, options.repositoryModel);
  const files = relevantFileNodes(options.files, options.task);
  const fileBlock = files.length
    ? files.map(renderFile).join('\n\n')
    : '(No scoped files exist yet. Use a CREATE fence only for an expected file or allowed path.)';
  const evidence = [
    options.validation.summary,
    ...options.validation.errors,
    ...(options.validation.evidence ?? []).map((item) =>
      `${item.kind} ${item.status}${item.file ? ` ${item.file}` : ''}: ${item.message}`
    ),
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: AUTO_FIX_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `# Targeted Task Repair

Repair ONLY this failed engineering task. Do not regenerate the whole app.

Task: ${options.task.title}
Task ID: ${options.task.id}
Discipline: ${options.task.assignedDiscipline}
Allowed file scope:
${options.task.allowedFileScope.map((scope) => `- ${scope}`).join('\n') || '- (none)'}

Expected files:
${options.task.expectedFiles.map((path) => `- ${path}`).join('\n') || '- (none)'}

Acceptance checks:
${options.task.acceptanceChecks.map((check) => `- ${check}`).join('\n') || '- (none)'}

Exact validation evidence:
\`\`\`
${evidence}
\`\`\`

Repository task context:
\`\`\`
${context.compactSummary}
\`\`\`

Scoped current files:

${fileBlock}

Emit only SEARCH/REPLACE edit fences or CREATE fences for files inside the allowed scope above.
Preserve unrelated valid work. If the failure is environmental, respond with SKIP: and a short reason.`,
    },
  ];
}

function isEnvironmentOrPermissionFailure(validation: TaskValidationResult): boolean {
  return (
    validation.outcome === 'blocked by environment' ||
    validation.outcome === 'cancelled' ||
    validation.errors.some((error) =>
      /network|permission|auth|unauthorized|forbidden|unsupported|environment|sandbox|out of memory/i.test(
        error
      )
    )
  );
}

export async function runTargetedTaskRepair(
  options: TargetedRepairOptions
): Promise<TargetedRepairResult> {
  const now = options.now ?? new Date();
  const maxAttempts = Math.max(0, options.maxAttempts ?? 1);
  let files = options.files;
  let repositoryModel = options.repositoryModel;
  const appliedChanges: AppliedTaskChange[] = [];
  const rejectedChanges: RejectedTaskChange[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (maxAttempts === 0) {
    return {
      files,
      repositoryModel,
      attempts: 0,
      appliedChanges,
      rejectedChanges,
      warnings,
      errors: ['Targeted repair attempts are disabled.'],
      repaired: false,
      stoppedByEnvironment: false,
    };
  }

  if (isEnvironmentOrPermissionFailure(options.validation)) {
    return {
      files,
      repositoryModel,
      attempts: 0,
      appliedChanges,
      rejectedChanges,
      warnings,
      errors: ['Targeted repair stopped because validation is blocked by environment or permissions.'],
      repaired: false,
      stoppedByEnvironment: true,
    };
  }

  const aiClient = options.aiClient ?? defaultAiClient();
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (options.signal?.aborted) {
      return {
        files,
        repositoryModel,
        attempts,
        appliedChanges,
        rejectedChanges,
        warnings,
        errors: ['Targeted repair cancelled.'],
        repaired: false,
        stoppedByEnvironment: false,
      };
    }
    attempts += 1;
    const response = await aiClient.complete(buildTargetedRepairMessages(options), {
      signal: options.signal,
      task: options.task,
      context: getRepositoryContextForTask(options.task, repositoryModel),
      runId: options.runId,
      operationId: `${options.operationId}:repair:${attempts}`,
    });

    if (response.finishReason === 'length') {
      warnings.push('Targeted repair hit the model output limit; no broad retry was attempted.');
      break;
    }

    const applied = applyTaskExecutionResponse({
      responseContent: response.content,
      files,
      task: options.task,
      repositoryModel,
      now,
    });
    files = applied.files;
    appliedChanges.push(...applied.appliedChanges);
    rejectedChanges.push(...applied.rejectedChanges);
    repositoryModel = refreshRepositoryModel(repositoryModel, {
      files,
      projectId: options.projectId,
      generatedFilePaths: options.generatedFilePaths,
      userEditedFilePaths: options.userEditedFilePaths,
      protectedPaths: options.protectedPaths,
      now,
    }).model;

    if (applied.appliedChanges.length > 0) {
      break;
    }
    if (applied.rejectedChanges.length > 0) {
      errors.push(...applied.rejectedChanges.map((change) => change.reason));
    }
  }

  return {
    files,
    repositoryModel,
    attempts,
    appliedChanges,
    rejectedChanges,
    warnings,
    errors,
    repaired: appliedChanges.length > 0,
    stoppedByEnvironment: false,
  };
}
