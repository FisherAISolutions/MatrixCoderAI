import { describe, expect, it, vi } from 'vitest';
import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  createRepositoryModel,
  type RepositoryModel,
} from '@/lib/repository-model';
import {
  createTaskValidationRunner,
  executeNextTask,
  runMilestoneTaskValidation,
  runTargetedTaskRepair,
  selectTaskValidationPlan,
  type TaskExecutionAiClient,
} from '@/lib/task-execution';
import {
  TASK_GRAPH_METADATA_VERSION,
  TASK_GRAPH_SCHEMA_VERSION,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';
import type { ValidationResult } from '@/lib/validation';

const now = new Date('2026-07-20T12:00:00.000Z');

function file(path: string, content: string): FileNode {
  return {
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    language: path.endsWith('.json') ? 'json' : path.endsWith('.css') ? 'css' : 'typescript',
    content,
    size: content.length,
    lastModified: now.toISOString(),
  };
}

function task(overrides: Partial<TaskGraphTask> = {}): TaskGraphTask {
  return {
    id: 'task-story-storage',
    title: 'Implement story storage',
    description: 'Create typed local story storage helpers.',
    category: 'storage',
    capabilityIds: ['story-storage'],
    sourceRequirementIds: ['req-story-storage'],
    dependencies: [],
    status: 'ready',
    priority: 'high',
    allowedFileScope: ['src/lib/story-storage.ts'],
    expectedFiles: ['src/lib/story-storage.ts'],
    expectedOutputs: ['Story storage helpers compile'],
    acceptanceChecks: ['Storage type guard accepts stories only'],
    validationCommands: ['type-check'],
    retryCount: 0,
    maximumRetryCount: 2,
    failureClassification: 'none',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    assignedDiscipline: 'storage/media',
    resultEvidence: [],
    resumable: true,
    fingerprint: 'task-story-storage',
    ...overrides,
  };
}

function graph(tasks: TaskGraphTask[]): TaskGraph {
  return {
    schemaVersion: TASK_GRAPH_SCHEMA_VERSION,
    metadataVersion: TASK_GRAPH_METADATA_VERSION,
    id: 'graph-1',
    projectId: 'project-1',
    projectName: 'Story App',
    contractId: 'contract-1',
    contractVersion: 1,
    sourceBuildContractUpdatedAt: now.toISOString(),
    tasks,
    warnings: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function repository(files: FileNode[]): RepositoryModel {
  return createRepositoryModel({ files, projectId: 'project-1', now });
}

function validationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    success: true,
    skipped: false,
    steps: [],
    errors: [],
    combinedLog: '',
    durationMs: 1,
    ...overrides,
  };
}

function aiClient(content: string): TaskExecutionAiClient {
  return {
    complete: vi.fn(async () => ({
      content,
      finishReason: 'stop',
    })),
  };
}

describe('task-level validation and repair', () => {
  it('selects the smallest meaningful validation for task categories', () => {
    expect(selectTaskValidationPlan(task({ category: 'foundation', assignedDiscipline: 'foundation' })).kinds).toEqual(
      expect.arrayContaining(['required-files', 'package-manifest', 'typescript-config'])
    );
    expect(selectTaskValidationPlan(task({ category: 'data', assignedDiscipline: 'database' })).kinds).toEqual(
      expect.arrayContaining(['schema', 'type-check'])
    );
    expect(selectTaskValidationPlan(task({ category: 'frontend', assignedDiscipline: 'frontend' })).kinds).toEqual(
      expect.arrayContaining(['required-files', 'import-integrity', 'type-check', 'style-audit'])
    );
  });

  it('treats blocked environment validation as blocked rather than passed', async () => {
    const runner = createTaskValidationRunner({
      runValidationImpl: vi.fn(async () =>
        validationResult({
          success: false,
          skipped: true,
          skipReason: 'WebContainer is unavailable in this browser.',
          steps: [
            {
              step: 'type-check',
              status: 'skipped',
              durationMs: 1,
              errors: [],
              log: '',
              infrastructureError: 'WebContainer is unavailable in this browser.',
            },
          ],
        })
      ),
    });

    const files = [file('src/lib/story-storage.ts', 'export const ok = true;')];
    const result = await runner.validate(files, task(), repository(files), {
      runId: 'run-1',
      operationId: 'op-1',
    });

    expect(result.ok).toBe(false);
    expect(result.outcome).toBe('blocked by environment');
  });

  it('keeps exact scoped error evidence for task validation', async () => {
    const runner = createTaskValidationRunner({
      runValidationImpl: vi.fn(async () =>
        validationResult({
          success: false,
          errors: [
            {
              source: 'typescript',
              file: 'src/lib/story-storage.ts',
              line: 12,
              message: "Type 'unknown' is not assignable to type 'Story'.",
              raw: 'src/lib/story-storage.ts:12:7 - error TS2322',
            },
          ],
          steps: [
            {
              step: 'type-check',
              status: 'failed',
              durationMs: 1,
              errors: [
                {
                  source: 'typescript',
                  file: 'src/lib/story-storage.ts',
                  line: 12,
                  message: "Type 'unknown' is not assignable to type 'Story'.",
                  raw: 'src/lib/story-storage.ts:12:7 - error TS2322',
                },
              ],
              log: 'src/lib/story-storage.ts:12:7 - error TS2322',
            },
          ],
          combinedLog: 'src/lib/story-storage.ts:12:7 - error TS2322',
        })
      ),
    });
    const files = [file('src/lib/story-storage.ts', 'export const story = value;')];
    const result = await runner.validate(files, task(), repository(files), {
      runId: 'run-1',
      operationId: 'op-1',
    });

    expect(result.outcome).toBe('recoverable');
    expect(result.errors[0]).toContain("Type 'unknown'");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/lib/story-storage.ts',
          raw: 'src/lib/story-storage.ts:12:7 - error TS2322',
        }),
      ])
    );
  });

  it('runs broader milestone validation through the existing validation engine', async () => {
    const runValidationImpl = vi.fn(async () => validationResult());
    const files = [file('src/lib/story-storage.ts', 'export const ok = true;')];

    await runMilestoneTaskValidation({
      files,
      task: task({ category: 'review', assignedDiscipline: 'review', validationCommands: ['build'] }),
      repositoryModel: repository(files),
      runValidationImpl,
    });

    expect(runValidationImpl).toHaveBeenCalledWith(
      files,
      expect.objectContaining({ typeCheckOnly: false, runtimeSmoke: true })
    );
  });

  it('stops targeted repair on environment failures without calling AI', async () => {
    const ai = aiClient('');
    const files = [file('src/lib/story-storage.ts', 'export const ok = true;')];
    const result = await runTargetedTaskRepair({
      task: task(),
      files,
      repositoryModel: repository(files),
      validation: {
        ok: false,
        outcome: 'blocked by environment',
        summary: 'Network unavailable.',
        commands: [],
        errors: ['Network unavailable.'],
        warnings: [],
      },
      aiClient: ai,
      maxAttempts: 2,
      runId: 'run-1',
      operationId: 'op-1',
      now,
    });

    expect(result.stoppedByEnvironment).toBe(true);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('repairs only the failed task scope and preserves unrelated valid files', async () => {
    const files = [
      file('src/lib/story-storage.ts', 'export const broken = value;'),
      file('src/app/page.tsx', 'export default function Home() { return <main>Home</main>; }'),
    ];
    const result = await runTargetedTaskRepair({
      task: task(),
      files,
      repositoryModel: repository(files),
      validation: {
        ok: false,
        outcome: 'recoverable',
        summary: 'Type check failed.',
        commands: [{ command: 'type-check', status: 'failed', output: 'storage type failed' }],
        errors: ['src/lib/story-storage.ts: Type error'],
        warnings: [],
      },
      aiClient: aiClient(`\`\`\`edit:src/lib/story-storage.ts
<<<<<<< SEARCH
export const broken = value;
=======
export const fixed = true;
>>>>>>> REPLACE
\`\`\`

\`\`\`edit:src/app/page.tsx
<<<<<<< SEARCH
Home
=======
Regenerated app
>>>>>>> REPLACE
\`\`\``),
      maxAttempts: 1,
      runId: 'run-1',
      operationId: 'op-1',
      now,
    });

    const storage = result.files.find((item) => item.path === 'src/lib/story-storage.ts');
    const home = result.files.find((item) => item.path === 'src/app/page.tsx');
    expect(storage?.content).toContain('fixed');
    expect(home?.content).toContain('Home');
    expect(result.rejectedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/app/page.tsx' }),
      ])
    );
  });

  it('integrates targeted repair with task execution feature mode', async () => {
    const files = [file('src/lib/story-storage.ts', 'export const broken = value;')];
    const validator = {
      validate: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          outcome: 'recoverable',
          summary: 'Type check failed.',
          commands: [{ command: 'type-check', status: 'failed', output: 'storage type failed' }],
          errors: ['src/lib/story-storage.ts: Type error'],
          warnings: [],
        })
        .mockResolvedValueOnce({
          ok: true,
          outcome: 'passed',
          summary: 'Task validation passed.',
          commands: [{ command: 'type-check', status: 'passed', output: 'ok' }],
          errors: [],
          warnings: [],
        }),
    };

    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      graph: graph([task()]),
      files,
      aiClient: aiClient('No code changes needed before validation.'),
      validationRunner: validator,
      targetedRepair: {
        enabled: true,
        maxAttempts: 1,
        aiClient: aiClient(`\`\`\`edit:src/lib/story-storage.ts
<<<<<<< SEARCH
export const broken = value;
=======
export const fixed = true;
>>>>>>> REPLACE
\`\`\``),
      },
      now,
      runId: 'run-1',
      operationId: 'op-1',
    });

    expect(result.status).toBe('passed');
    expect(validator.validate).toHaveBeenCalledTimes(2);
    expect(result.files.find((item) => item.path === 'src/lib/story-storage.ts')?.content).toContain('fixed');
  });

  it('exhausts retry without broad regeneration when repair emits no usable patch', async () => {
    const files = [file('src/lib/story-storage.ts', 'export const broken = value;')];
    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      graph: graph([task({ maximumRetryCount: 1 })]),
      files,
      aiClient: aiClient('No initial changes.'),
      validationRunner: {
        validate: vi.fn(async () => ({
          ok: false,
          outcome: 'recoverable' as const,
          summary: 'Type check failed.',
          commands: [{ command: 'type-check', status: 'failed' as const, output: 'storage type failed' }],
          errors: ['src/lib/story-storage.ts: Type error'],
          warnings: [],
        })),
      },
      targetedRepair: {
        enabled: true,
        maxAttempts: 1,
        aiClient: aiClient('No usable patches.'),
      },
      now,
    });

    expect(result.status).toBe('failed');
    expect(result.files.find((item) => item.path === 'src/lib/story-storage.ts')?.content).toContain('broken');
  });
});
