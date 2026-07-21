import { describe, expect, it, vi } from 'vitest';
import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  createTaskExecutionState,
  deserializeTaskExecutionState,
  executeNextTask,
  serializeTaskExecutionState,
  skipOptionalTask,
  type TaskExecutionAiClient,
  type TaskExecutionValidationRunner,
} from '@/lib/task-execution';
import {
  serializeTaskGraph,
  deserializeTaskGraph,
  TASK_GRAPH_METADATA_VERSION,
  TASK_GRAPH_SCHEMA_VERSION,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';

const now = new Date('2026-07-20T12:00:00.000Z');

function file(path: string, content: string): FileNode {
  return {
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    language: path.endsWith('.json') ? 'json' : 'typescript',
    content,
    size: content.length,
    lastModified: now.toISOString(),
  };
}

function task(overrides: Partial<TaskGraphTask> = {}): TaskGraphTask {
  return {
    id: 'task-frontend-workouts',
    title: 'Implement workouts route',
    description: 'Create the workouts page as one functional vertical slice.',
    category: 'frontend',
    capabilityIds: ['workouts'],
    sourceRequirementIds: ['route-workouts'],
    dependencies: [],
    status: 'ready',
    priority: 'high',
    allowedFileScope: ['src/app/workouts/**', 'src/components/fitness/**'],
    expectedFiles: ['src/app/workouts/page.tsx'],
    expectedOutputs: ['Workouts page exists'],
    acceptanceChecks: ['Route renders without client hooks in page.tsx'],
    validationCommands: ['type-check'],
    retryCount: 0,
    maximumRetryCount: 2,
    failureClassification: 'none',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    assignedDiscipline: 'frontend',
    resultEvidence: [],
    resumable: true,
    fingerprint: 'task-frontend-workouts',
    ...overrides,
  };
}

function graph(tasks: TaskGraphTask[]): TaskGraph {
  return {
    schemaVersion: TASK_GRAPH_SCHEMA_VERSION,
    metadataVersion: TASK_GRAPH_METADATA_VERSION,
    id: 'graph-1',
    projectId: 'project-1',
    projectName: 'Demo',
    contractId: 'contract-1',
    contractVersion: 1,
    sourceBuildContractUpdatedAt: now.toISOString(),
    tasks,
    warnings: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
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

function validationRunner(ok: boolean): TaskExecutionValidationRunner {
  return {
    validate: vi.fn(async (_files: FileNode[], taskToValidate: TaskGraphTask) => ({
      ok,
      summary: ok ? 'Task validation passed.' : 'Task validation failed.',
      commands: taskToValidate.validationCommands.map((command) => ({
        command,
        status: ok ? ('passed' as const) : ('failed' as const),
        output: ok ? 'ok' : 'failed',
      })),
      errors: ok ? [] : ['validation failed'],
      warnings: [],
    })),
  };
}

describe('task execution engine', () => {
  it('stays disabled unless the task execution feature flag is explicit', async () => {
    const ai = aiClient('');
    const result = await executeNextTask({
      enabled: false,
      graph: graph([task()]),
      files: [],
      aiClient: ai,
      now,
    });

    expect(result.status).toBe('skipped');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('allows only one active task per project', async () => {
    const ai = aiClient('');
    const active = task({ status: 'running' });
    const result = await executeNextTask({
      enabled: true,
      graph: graph([active, task({ id: 'task-second' })]),
      files: [],
      aiClient: ai,
      now,
    });

    expect(result.status).toBe('blocked');
    expect(result.task?.id).toBe(active.id);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('executes one ready task and persists validation evidence', async () => {
    const ai = aiClient(`\`\`\`tsx
// path: src/app/workouts/page.tsx
export default function WorkoutsPage() {
  return <main>Workouts</main>;
}
\`\`\``);
    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      graph: graph([task()]),
      files: [file('package.json', '{"dependencies":{"next":"15.1.11"}}')],
      aiClient: ai,
      validationRunner: validationRunner(true),
      now,
      runId: 'run-1',
      operationId: 'op-1',
    });

    expect(result.status).toBe('passed');
    expect(result.appliedChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/app/workouts/page.tsx', kind: 'create' }),
      ])
    );
    expect(result.graph.tasks[0].status).toBe('passed');
    expect(result.graph.tasks[0].resultEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'file', ref: 'src/app/workouts/page.tsx' }),
        expect.objectContaining({ kind: 'command', ref: 'type-check' }),
      ])
    );
  });

  it('does not run a task whose dependencies are not passed', async () => {
    const ai = aiClient('');
    const blocked = task({
      id: 'task-dependent',
      dependencies: ['task-foundation'],
      expectedFiles: ['src/app/dashboard/page.tsx'],
    });
    const result = await executeNextTask({
      enabled: true,
      graph: graph([blocked]),
      files: [],
      aiClient: ai,
      now,
    });

    expect(result.status).toBe('idle');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('rejects stale callbacks before mutating files', async () => {
    let checks = 0;
    const ai = aiClient(`\`\`\`tsx
// path: src/app/workouts/page.tsx
export default function WorkoutsPage() {
  return <main>Late</main>;
}
\`\`\``);
    const result = await executeNextTask({
      enabled: true,
      graph: graph([task()]),
      files: [],
      aiClient: ai,
      validationRunner: validationRunner(true),
      now,
      runId: 'run-1',
      operationId: 'op-1',
      shouldAcceptResult: () => {
        checks += 1;
        return checks === 1;
      },
    });

    expect(result.status).toBe('stale');
    expect(result.files).toHaveLength(0);
    expect(result.graph.tasks[0].status).toBe('ready');
  });

  it('cancels before execution without calling AI', async () => {
    const controller = new AbortController();
    controller.abort();
    const ai = aiClient('');
    const result = await executeNextTask({
      enabled: true,
      graph: graph([task()]),
      files: [],
      aiClient: ai,
      signal: controller.signal,
      now,
    });

    expect(result.status).toBe('cancelled');
    expect(result.graph.tasks[0].status).toBe('cancelled');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('rejects changes outside the task allowed file scope', async () => {
    const result = await executeNextTask({
      enabled: true,
      graph: graph([task()]),
      files: [],
      aiClient: aiClient(`\`\`\`tsx
// path: src/app/page.tsx
export default function Home() {
  return <main>Broad rewrite</main>;
}
\`\`\``),
      validationRunner: validationRunner(false),
      now,
    });

    expect(result.status).toBe('recoverable-failure');
    expect(result.rejectedChanges[0]).toEqual(
      expect.objectContaining({ path: 'src/app/page.tsx' })
    );
    expect(result.files).toHaveLength(0);
  });

  it('rejects path traversal attempts', async () => {
    const result = await executeNextTask({
      enabled: true,
      graph: graph([task()]),
      files: [file('package.json', '{"dependencies":{"next":"15.1.11"}}')],
      aiClient: aiClient(`\`\`\`edit:../escape.ts
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
\`\`\``),
      validationRunner: validationRunner(false),
      now,
    });

    expect(result.status).toBe('recoverable-failure');
    expect(result.rejectedChanges[0]).toEqual(
      expect.objectContaining({ reason: expect.stringContaining('path traversal') })
    );
  });

  it('marks a task failed when retry limit is exhausted and blocks dependents', async () => {
    const failedTask = task({ maximumRetryCount: 1 });
    const dependent = task({
      id: 'task-dependent',
      dependencies: [failedTask.id],
      expectedFiles: ['src/app/progress/page.tsx'],
    });
    const result = await executeNextTask({
      enabled: true,
      graph: graph([failedTask, dependent]),
      files: [],
      aiClient: aiClient('No usable patches.'),
      validationRunner: validationRunner(false),
      now,
    });

    expect(result.status).toBe('failed');
    expect(result.graph.tasks.find((item) => item.id === failedTask.id)?.status).toBe('failed');
    expect(result.graph.tasks.find((item) => item.id === dependent.id)?.status).toBe('blocked');
  });

  it('does not rerun completed tasks', async () => {
    const ai = aiClient('');
    const result = await executeNextTask({
      enabled: true,
      graph: graph([task({ status: 'passed' })]),
      files: [],
      aiClient: ai,
      now,
    });

    expect(result.status).toBe('idle');
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('preserves applied files after validation failure', async () => {
    const result = await executeNextTask({
      enabled: true,
      graph: graph([task()]),
      files: [],
      aiClient: aiClient(`\`\`\`tsx
// path: src/app/workouts/page.tsx
export default function WorkoutsPage() {
  return <main>Needs follow-up</main>;
}
\`\`\``),
      validationRunner: validationRunner(false),
      now,
    });

    expect(result.status).toBe('recoverable-failure');
    expect(result.files.some((item) => item.path === 'src/app/workouts/page.tsx')).toBe(true);
  });

  it('supports skipping optional tasks only', () => {
    const skipped = skipOptionalTask(graph([task()]), 'task-frontend-workouts', {
      optional: true,
      reason: 'Optional polish deferred.',
      now,
    });
    expect(skipped.tasks[0].status).toBe('skipped');
    expect(() =>
      skipOptionalTask(graph([task()]), 'task-frontend-workouts', {
        optional: false,
      })
    ).toThrow('Only optional tasks can be skipped.');
  });

  it('serializes progress state and task graph for refresh restore', () => {
    const state = createTaskExecutionState('running', now, {
      projectId: 'project-1',
      activeTaskId: 'task-frontend-workouts',
      activeRunId: 'run-1',
      activeOperationId: 'op-1',
    });
    const restoredState = deserializeTaskExecutionState(
      serializeTaskExecutionState(state)
    );
    const restoredGraph = deserializeTaskGraph(serializeTaskGraph(graph([task()])));

    expect(restoredState?.activeTaskId).toBe('task-frontend-workouts');
    expect(restoredGraph?.tasks[0].id).toBe('task-frontend-workouts');
  });

  it('rejects late validation results after project switch', async () => {
    let checks = 0;
    const result = await executeNextTask({
      enabled: true,
      graph: graph([task()]),
      files: [],
      aiClient: aiClient(`\`\`\`tsx
// path: src/app/workouts/page.tsx
export default function WorkoutsPage() {
  return <main>Workouts</main>;
}
\`\`\``),
      validationRunner: validationRunner(true),
      now,
      shouldAcceptResult: () => {
        checks += 1;
        return checks < 3;
      },
    });

    expect(result.status).toBe('stale');
    expect(result.graph.tasks[0].status).toBe('ready');
  });
});
