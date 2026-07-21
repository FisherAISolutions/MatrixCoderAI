import { describe, expect, it } from 'vitest';

import type { FileNode } from '@/app/chat-workspace/components/types';
import type { BuildContract } from '@/lib/build-contract';
import type { CapabilityResolutionResult } from '@/lib/capabilities';
import {
  cloneEngineeringMemoryForProject,
  createEngineeringMemory,
  createEngineeringMemoryCheckpoint,
  deserializeEngineeringMemory,
  getEngineeringMemorySummary,
  recordTaskExecutionInMemory,
  restoreEngineeringMemory,
  serializeEngineeringMemory,
} from '@/lib/engineering-memory';
import { createRepositoryModel } from '@/lib/repository-model';
import {
  TASK_GRAPH_METADATA_VERSION,
  TASK_GRAPH_SCHEMA_VERSION,
  type TaskGraph,
  type TaskGraphTask,
} from '@/lib/task-graph';

const now = new Date('2026-07-20T12:00:00.000Z');

function file(path: string, content: string, overrides: Partial<FileNode> = {}): FileNode {
  return {
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    language: path.endsWith('.json') ? 'json' : 'typescript',
    content,
    lastModified: now.toISOString(),
    ...overrides,
  };
}

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
    expectedOutputs: ['Dashboard route renders.'],
    acceptanceChecks: ['Route /dashboard exists.'],
    validationCommands: ['npm run type-check'],
    retryCount: 0,
    maximumRetryCount: 2,
    failureClassification: 'none',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    assignedDiscipline: 'frontend',
    resultEvidence: [],
    blockedReason: undefined,
    resumable: true,
    fingerprint: 'task-frontend-dashboard',
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

function contract(): BuildContract {
  return {
    schemaVersion: 1,
    metadataVersion: '2026-07-20',
    contractVersion: 1,
    id: 'contract-1',
    project: { projectId: 'project-1', projectName: 'Demo' },
    projectSummary: 'Demo app',
    targetFramework: 'Next.js',
    routes: [{ path: '/dashboard', label: 'Dashboard', required: true, source: 'blueprint' }],
    layouts: [],
    navigation: ['/dashboard'],
    dataModels: [],
    relationships: [],
    authentication: 'none',
    rolesAndPermissions: [],
    apis: [],
    integrations: [],
    aiCapabilities: [],
    storageRequirements: [],
    billingRequirements: [],
    backgroundJobs: [],
    environmentVariableNames: [],
    deploymentTarget: 'web',
    visualRequirements: { source: 'platform-default' },
    responsiveRequirements: { mobileSupport: [], expectations: [], source: 'platform-default' },
    accessibilityExpectations: { expectations: [], source: 'platform-default' },
    acceptanceCriteria: ['Dashboard exists'],
    constraints: ['Use free-first services when possible'],
    optionalCapabilities: ['analytics'],
    requiredCapabilities: ['dashboard'],
    requirements: [
      {
        stableId: 'req-route-dashboard',
        type: 'route',
        title: 'Dashboard route',
        description: 'The dashboard route must exist.',
        status: 'required',
        source: 'blueprint',
        validationStrategy: 'route-exists',
        completionStatus: 'satisfied',
        evidenceReferences: [
          { kind: 'route', ref: '/dashboard', description: 'Dashboard route exists.' },
        ],
      },
    ],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function capabilities(): CapabilityResolutionResult {
  return {
    schemaVersion: 1,
    registryVersion: '2026-07-20',
    contractId: 'contract-1',
    contractVersion: 1,
    capabilities: [
      {
        capabilityId: 'dashboard',
        status: 'required',
        sourceRequirementIds: ['req-route-dashboard'],
        source: 'contract',
        addedByCapabilityIds: [],
        addedByDomainPackIds: [],
      },
      {
        capabilityId: 'analytics',
        status: 'optional',
        sourceRequirementIds: [],
        source: 'domain-pack',
        addedByCapabilityIds: [],
        addedByDomainPackIds: ['analytics'],
      },
    ],
    detectedCapabilities: [],
    expandedDependencies: [],
    providerRecommendations: [],
    conflicts: [],
    warnings: [],
    sourceRequirementIds: ['req-route-dashboard'],
    domainPackContributions: [],
    unresolvedCustomRequirements: [],
    createdAt: now.toISOString(),
  };
}

describe('engineering memory', () => {
  it('persists and restores structured memory across refresh', () => {
    const repositoryModel = createRepositoryModel({
      projectId: 'project-1',
      files: [file('src/app/dashboard/page.tsx', 'export default function Page() { return null; }')],
      generatedFilePaths: ['src/app/dashboard/page.tsx'],
      now,
    });
    const memory = createEngineeringMemory({
      projectId: 'project-1',
      buildContract: contract(),
      capabilityResolution: capabilities(),
      taskGraph: graph([task({ status: 'passed' })]),
      repositoryModel,
      now,
    });

    const restored = deserializeEngineeringMemory(serializeEngineeringMemory(memory));

    expect(restored?.buildContractVersion).toBe(1);
    expect(restored?.requiredCapabilityIds).toContain('dashboard');
    expect(restored?.optionalCapabilityIds).toContain('analytics');
    expect(restored?.completedRequirementIds).toContain('req-route-dashboard');
    expect(restored?.latestRepositoryFingerprint).toBe(repositoryModel.repositoryFingerprint);
  });

  it('marks interrupted running tasks as recoverable instead of passed', () => {
    const memory = createEngineeringMemory({
      taskGraph: graph([task({ status: 'running' })]),
      now,
    });

    const restored = restoreEngineeringMemory(memory, {
      now: new Date('2026-07-20T12:05:00.000Z'),
    });

    expect(restored.taskGraph?.tasks[0]?.status).toBe('recoverable-failure');
    expect(restored.overallBuildStatus).toBe('recoverable');
    expect(restored.resumableTaskId).toBe('task-frontend-dashboard');
    expect(restored.restoreOptions).toEqual(expect.arrayContaining(['resume', 'retry', 'review']));
  });

  it('supports checkpoint restore metadata after successful milestones', () => {
    const memory = createEngineeringMemory({
      taskGraph: graph([task({ status: 'passed' })]),
      now,
    });
    const checkpointed = createEngineeringMemoryCheckpoint(memory, {
      label: 'Dashboard passed',
      taskId: 'task-frontend-dashboard',
      now,
    });
    const restored = deserializeEngineeringMemory(
      serializeEngineeringMemory(checkpointed)
    );

    expect(restored?.lastSafeCheckpoint?.label).toBe('Dashboard passed');
    expect(getEngineeringMemorySummary(restored!).lastSafeCheckpointLabel).toBe(
      'Dashboard passed'
    );
  });

  it('detects repository drift on restore', () => {
    const firstModel = createRepositoryModel({
      files: [file('src/app/page.tsx', 'export default function Page() { return null; }')],
      now,
    });
    const secondModel = createRepositoryModel({
      files: [file('src/app/page.tsx', 'export default function Page() { return <main />; }')],
      now: new Date('2026-07-20T12:05:00.000Z'),
    });
    const memory = createEngineeringMemory({
      repositoryModel: firstModel,
      now,
    });

    const restored = restoreEngineeringMemory(memory, {
      repositoryModel: secondModel,
      now: new Date('2026-07-20T12:06:00.000Z'),
    });

    expect(restored.unresolvedIssues.some((issue) => issue.id.includes('repository-drift'))).toBe(
      true
    );
    expect(restored.warnings).toContain('Repository drift detected during restore.');
  });

  it('preserves user-edited file ownership during restore', () => {
    const model = createRepositoryModel({
      files: [
        file('src/app/page.tsx', 'export default function Page() { return null; }'),
      ],
      userEditedFilePaths: ['src/app/page.tsx'],
      now,
    });
    const memory = createEngineeringMemory({ repositoryModel: model, now });

    const restored = restoreEngineeringMemory(memory, { repositoryModel: model, now });

    expect(restored.generatedFileOwnership[0]).toMatchObject({
      path: 'src/app/page.tsx',
      userEdited: true,
    });
  });

  it('records task history and changed files without storing secrets', () => {
    const memory = createEngineeringMemory({
      taskGraph: graph([task()]),
      now,
    });
    const updated = recordTaskExecutionInMemory(memory, {
      task: task({ status: 'recoverable-failure', blockedReason: 'OPENAI_API_KEY=sk-test leaked' }),
      changedFiles: ['src/app/dashboard/page.tsx'],
      validationEvidence: [
        {
          kind: 'command',
          ref: 'npm run type-check',
          status: 'failed',
          description: 'Authorization bearer token failed',
        },
      ],
      errors: ['VERCEL_TOKEN=secret-token failed'],
      warnings: ['password should not be stored'],
      now,
    });
    const serialized = serializeEngineeringMemory(updated);

    expect(updated.taskExecutionHistory).toHaveLength(1);
    expect(updated.generatedFileOwnership[0]?.ownerTaskId).toBe('task-frontend-dashboard');
    expect(serialized).not.toContain('sk-test');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).toContain('[redacted]');
  });

  it('clones memory for another project without shared mutable references', () => {
    const memory = createEngineeringMemory({
      projectId: 'project-a',
      taskGraph: graph([task()]),
      now,
    });

    const cloned = cloneEngineeringMemoryForProject(
      memory,
      'project-b',
      new Date('2026-07-20T12:10:00.000Z')
    );

    expect(cloned.id).not.toBe(memory.id);
    expect(cloned.projectId).toBe('project-b');
    expect(cloned.taskGraph?.projectId).toBe('project-b');
    cloned.taskGraph!.tasks[0]!.title = 'Changed';
    expect(memory.taskGraph?.tasks[0]?.title).toBe('Implement dashboard route');
  });
});
