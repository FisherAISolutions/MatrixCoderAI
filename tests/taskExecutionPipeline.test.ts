import { describe, expect, it, vi } from 'vitest';

import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  ENGINEERING_FOREMAN_PACKET_VERSION,
  type TaskIntelligencePacket,
} from '@/lib/engineering-foreman';
import {
  executeNextTask,
  type TaskExecutionAiClient,
  type TaskExecutionValidationRunner,
} from '@/lib/task-execution';
import {
  TASK_GRAPH_METADATA_VERSION,
  TASK_GRAPH_SCHEMA_VERSION,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';

const now = new Date('2026-07-26T12:00:00.000Z');

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
    id: 'task-foundation',
    title: 'Create project foundation',
    description: 'Create the bounded project foundation.',
    category: 'foundation',
    capabilityIds: ['project-foundation'],
    sourceRequirementIds: ['requirement-foundation'],
    dependencies: [],
    status: 'ready',
    priority: 'critical',
    allowedFileScope: [
      'package.json',
      'tsconfig.json',
      '.env.example',
      'src/app/**',
    ],
    expectedFiles: ['package.json', 'src/app/page.tsx'],
    expectedOutputs: ['A runnable project foundation'],
    acceptanceChecks: ['Required foundation files exist'],
    validationCommands: ['required-files'],
    retryCount: 0,
    maximumRetryCount: 2,
    failureClassification: 'none',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    assignedDiscipline: 'foundation',
    resultEvidence: [],
    resumable: true,
    fingerprint: 'task-foundation',
    ...overrides,
  };
}

function graph(tasks: TaskGraphTask[]): TaskGraph {
  return {
    schemaVersion: TASK_GRAPH_SCHEMA_VERSION,
    metadataVersion: TASK_GRAPH_METADATA_VERSION,
    id: 'graph-project-1',
    projectId: 'project-1',
    projectName: 'Pipeline Test',
    contractId: 'contract-project-1',
    contractVersion: 1,
    sourceBuildContractUpdatedAt: now.toISOString(),
    tasks,
    warnings: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function packet(taskToRun: TaskGraphTask): TaskIntelligencePacket {
  return {
    packetVersion: ENGINEERING_FOREMAN_PACKET_VERSION,
    kind: 'engineering-task',
    projectId: 'project-1',
    task: {
      id: taskToRun.id,
      title: taskToRun.title,
      category: taskToRun.category,
      discipline: taskToRun.assignedDiscipline,
      priority: taskToRun.priority,
    },
    purpose: taskToRun.description,
    repositoryFingerprint: 'repository-before',
    relevantExistingFiles: [],
    protectedFiles: [],
    expectedOutputs: taskToRun.expectedOutputs,
    expectedFiles: taskToRun.expectedFiles,
    allowedPaths: taskToRun.allowedFileScope,
    requiredDependencies: [],
    blockedDependencies: [],
    acceptanceCriteria: taskToRun.acceptanceChecks,
    validationStrategy: {
      commands: taskToRun.validationCommands,
      requirementStrategies: ['required-files'],
      acceptanceChecks: taskToRun.acceptanceChecks,
    },
    repairStrategy: {
      failureClassification: 'none',
      remainingAttempts: 1,
      allowedPaths: taskToRun.allowedFileScope,
      preserveUnrelatedWork: true,
      stopOnEnvironmentOrPermissionFailure: true,
    },
    memoryLessons: [],
    blueprintDecisions: [],
    contractRequirements: [],
    capabilityReferences: taskToRun.capabilityIds.map((capabilityId) => ({
      capabilityId,
      status: 'required',
      source: 'contract',
      sourceRequirementIds: taskToRun.sourceRequirementIds,
    })),
    currentMilestone: 'foundation',
    confidence: 0.95,
    budgetMode: 'lean',
    complexity: 'low',
    estimatedScope: {
      size: 'small',
      expectedFileCount: taskToRun.expectedFiles.length,
      allowedScopeCount: taskToRun.allowedFileScope.length,
      acceptanceCheckCount: taskToRun.acceptanceChecks.length,
      reason: 'Focused pipeline test task.',
    },
    createdAt: now.toISOString(),
  };
}

function sequentialAiClient(...responses: string[]): TaskExecutionAiClient {
  let index = 0;
  return {
    complete: vi.fn(async () => ({
      content: responses[Math.min(index++, responses.length - 1)] ?? '',
      finishReason: 'stop',
    })),
  };
}

function validationRunner(
  ...outcomes: boolean[]
): TaskExecutionValidationRunner {
  let index = 0;
  return {
    validate: vi.fn(async () => {
      const ok = outcomes[Math.min(index++, outcomes.length - 1)] ?? false;
      return {
        ok,
        outcome: ok ? ('passed' as const) : ('recoverable' as const),
        summary: ok ? 'Task validation passed.' : 'Task validation failed.',
        commands: [
          {
            command: 'required-files',
            status: ok ? ('passed' as const) : ('failed' as const),
            output: ok ? 'ok' : 'missing evidence',
          },
        ],
        errors: ok ? [] : ['Missing required implementation evidence.'],
        warnings: [],
      };
    }),
  };
}

function envelope(
  taskId: string,
  mode: 'full-file-create' | 'repository-aware',
  operations: unknown[]
): string {
  return JSON.stringify({
    version: 1,
    taskId,
    mode,
    operations,
    summary: 'Completed the bounded task.',
  });
}

describe('deterministic task execution pipeline', () => {
  it('uses full-file-create mode for an empty repository', async () => {
    const foundation = task();
    const ai = sequentialAiClient(
      envelope(foundation.id, 'full-file-create', [
        {
          type: 'create',
          path: 'package.json',
          content:
            '{"scripts":{"build":"next build"},"dependencies":{"next":"15.1.11"}}\n',
        },
        {
          type: 'create',
          path: 'src/app/page.tsx',
          content:
            'export default function Home() { return <main>Home</main>; }\n',
        },
      ])
    );

    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      taskId: foundation.id,
      graph: graph([foundation]),
      files: [],
      intelligencePacket: packet(foundation),
      responseProtocol: 'structured-operations',
      aiClient: ai,
      validationRunner: validationRunner(true),
      now,
    });

    expect(result.status).toBe('passed');
    expect(result.structuredResponse?.mode).toBe('full-file-create');
    expect(result.appliedChanges.map((change) => change.path)).toEqual([
      'package.json',
      'src/app/page.tsx',
    ]);
    expect(result.repositoryModel.repositoryFingerprint).not.toBe(
      'repository-before'
    );
  });

  it('uses exact patches for existing repository files', async () => {
    const pageTask = task({
      id: 'task-home-copy',
      title: 'Update home copy',
      allowedFileScope: ['src/app/page.tsx'],
      expectedFiles: [],
      expectedOutputs: ['Updated home copy'],
    });
    const original = 'export default function Home() { return <main>Old</main>; }\n';
    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      taskId: pageTask.id,
      graph: graph([pageTask]),
      files: [file('src/app/page.tsx', original)],
      intelligencePacket: packet(pageTask),
      responseProtocol: 'structured-operations',
      aiClient: sequentialAiClient(
        envelope(pageTask.id, 'repository-aware', [
          {
            type: 'patch',
            path: 'src/app/page.tsx',
            search: '<main>Old</main>',
            replace: '<main>New</main>',
          },
        ])
      ),
      validationRunner: validationRunner(true),
      now,
    });

    expect(result.status).toBe('passed');
    expect(result.structuredResponse?.mode).toBe('repository-aware');
    expect(result.files[0]?.content).toContain('<main>New</main>');
  });

  it('applies dependency, environment, and delete operations deterministically', async () => {
    const maintenance = task({
      id: 'task-project-config',
      title: 'Update project configuration',
      allowedFileScope: ['package.json', '.env.example', 'src/obsolete.ts'],
      expectedFiles: [],
      expectedOutputs: ['Dependency and environment contract updated'],
    });
    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      taskId: maintenance.id,
      graph: graph([maintenance]),
      files: [
        file('package.json', '{"dependencies":{},"scripts":{}}\n'),
        file('src/obsolete.ts', 'export const obsolete = true;\n'),
      ],
      intelligencePacket: packet(maintenance),
      responseProtocol: 'structured-operations',
      aiClient: sequentialAiClient(
        envelope(maintenance.id, 'repository-aware', [
          {
            type: 'package-json',
            path: 'package.json',
            section: 'dependencies',
            name: 'zod',
            value: '^4.3.6',
          },
          {
            type: 'environment',
            path: '.env.example',
            name: 'NEXT_PUBLIC_APP_URL',
            value: '',
          },
          { type: 'delete', path: 'src/obsolete.ts' },
        ])
      ),
      validationRunner: validationRunner(true),
      now,
    });

    expect(result.status).toBe('passed');
    const packageFile = result.files.find((item) => item.path === 'package.json');
    const envFile = result.files.find((item) => item.path === '.env.example');
    expect(packageFile?.content).toContain('"zod": "^4.3.6"');
    expect(envFile?.content).toBe('NEXT_PUBLIC_APP_URL=\n');
    expect(result.files.some((item) => item.path === 'src/obsolete.ts')).toBe(
      false
    );
    expect(result.appliedChanges.map((change) => change.kind)).toEqual([
      'dependency',
      'environment',
      'delete',
    ]);
  });

  it('uses one bounded response-format repair and then continues', async () => {
    const foundation = task();
    const valid = envelope(foundation.id, 'full-file-create', [
      {
        type: 'create',
        path: 'package.json',
        content: '{"scripts":{"build":"next build"}}\n',
      },
      {
        type: 'create',
        path: 'src/app/page.tsx',
        content: 'export default function Home() { return null; }\n',
      },
    ]);
    const ai = sequentialAiClient(
      'I created the project foundation for you.',
      valid
    );
    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      taskId: foundation.id,
      graph: graph([foundation]),
      files: [],
      intelligencePacket: packet(foundation),
      responseProtocol: 'structured-operations',
      aiClient: ai,
      validationRunner: validationRunner(true),
      now,
    });

    expect(result.status).toBe('passed');
    expect(ai.complete).toHaveBeenCalledTimes(2);
    expect(result.responseValidationErrors).toEqual([]);
  });

  it('fails only the active task after a second invalid response and leaves dependents waiting', async () => {
    const foundation = task({ maximumRetryCount: 1 });
    const dependent = task({
      id: 'task-dependent',
      title: 'Build dependent route',
      dependencies: [foundation.id],
      status: 'pending',
    });
    const ai = sequentialAiClient('prose only', '{"operations":[]}');
    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      taskId: foundation.id,
      graph: graph([foundation, dependent]),
      files: [],
      intelligencePacket: packet(foundation),
      responseProtocol: 'structured-operations',
      aiClient: ai,
      validationRunner: validationRunner(true),
      now,
    });

    expect(result.status).toBe('failed');
    expect(ai.complete).toHaveBeenCalledTimes(2);
    expect(result.files).toEqual([]);
    expect(result.graph.tasks[0]?.status).toBe('failed');
    expect(result.graph.tasks[1]?.status).toBe('pending');
  });

  it('rejects protected file operations without mutating the file', async () => {
    const protectedTask = task({
      id: 'task-protected',
      title: 'Attempt protected update',
      allowedFileScope: ['src/app/page.tsx'],
      expectedFiles: [],
      expectedOutputs: ['Protected path remains unchanged'],
    });
    const original = 'export default function Home() { return <main>Safe</main>; }\n';
    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      taskId: protectedTask.id,
      graph: graph([protectedTask]),
      files: [file('src/app/page.tsx', original)],
      protectedPaths: ['src/app/page.tsx'],
      intelligencePacket: packet(protectedTask),
      responseProtocol: 'structured-operations',
      aiClient: sequentialAiClient(
        envelope(protectedTask.id, 'repository-aware', [
          {
            type: 'patch',
            path: 'src/app/page.tsx',
            search: 'Safe',
            replace: 'Unsafe',
          },
        ])
      ),
      validationRunner: validationRunner(false),
      now,
    });

    expect(result.status).toBe('recoverable-failure');
    expect(result.files[0]?.content).toBe(original);
    expect(result.rejectedChanges[0]?.reason).toContain('protected');
  });

  it('repairs only files touched by the failed task', async () => {
    const repairTask = task({
      id: 'task-scoped-repair',
      title: 'Repair one route',
      allowedFileScope: ['src/app/page.tsx', 'src/app/other/page.tsx'],
      expectedFiles: [],
      expectedOutputs: ['Home route repaired'],
    });
    const initialAi = sequentialAiClient(
      envelope(repairTask.id, 'repository-aware', [
        {
          type: 'patch',
          path: 'src/app/page.tsx',
          search: 'Broken',
          replace: 'Still broken',
        },
      ])
    );
    const repairAi = sequentialAiClient(
      envelope(repairTask.id, 'repository-aware', [
        {
          type: 'patch',
          path: 'src/app/page.tsx',
          search: 'Still broken',
          replace: 'Fixed',
        },
      ])
    );
    const result = await executeNextTask({
      enabled: true,
      projectId: 'project-1',
      taskId: repairTask.id,
      graph: graph([repairTask]),
      files: [
        file(
          'src/app/page.tsx',
          'export default function Home() { return <main>Broken</main>; }\n'
        ),
        file(
          'src/app/other/page.tsx',
          'export default function Other() { return <main>Untouched</main>; }\n'
        ),
      ],
      intelligencePacket: packet(repairTask),
      responseProtocol: 'structured-operations',
      aiClient: initialAi,
      targetedRepair: {
        enabled: true,
        maxAttempts: 1,
        aiClient: repairAi,
      },
      validationRunner: validationRunner(false, true),
      now,
    });

    expect(result.status).toBe('passed');
    expect(repairAi.complete).toHaveBeenCalledTimes(1);
    expect(
      result.files.find((item) => item.path === 'src/app/page.tsx')?.content
    ).toContain('Fixed');
    expect(
      result.files.find((item) => item.path === 'src/app/other/page.tsx')
        ?.content
    ).toContain('Untouched');
  });
});
