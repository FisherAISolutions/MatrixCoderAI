import { describe, expect, it } from 'vitest';

import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  BUILD_CONTRACT_METADATA_VERSION,
  BUILD_CONTRACT_SCHEMA_VERSION,
  stableRequirementId,
  type BuildContract,
} from '@/lib/build-contract';
import {
  addIntelligenceRecord,
  allIntelligenceRecords,
  applyWorkingState,
  cloneIntelligenceCoreForProject,
  createArchitectIntelligencePacket,
  createEmptyIntelligenceCore,
  createFinalReviewIntelligencePacket,
  createIntelligenceCore,
  createTaskIntelligencePacket,
  deserializeIntelligenceCore,
  recordVerifiedExperienceLesson,
  resolveIntelligenceDecision,
  serializeIntelligenceCore,
  type MatrixIntelligenceCore,
} from '@/lib/intelligence-core';
import {
  createMatrixProject,
  duplicateMatrixProject,
  loadMatrixProjectWorkspaceContext,
  loadMatrixProjectWorkspaceSnapshot,
  saveMatrixProject,
  saveMatrixProjectWorkspaceContext,
  saveMatrixProjectWorkspaceSnapshot,
  loadMatrixProjects,
} from '@/lib/projects/projectStore';
import { createRepositoryModel } from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function file(path: string, content: string): FileNode {
  return {
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    content,
  };
}

function contract(overrides: Partial<BuildContract> = {}): BuildContract {
  const routeRequirementId = stableRequirementId('route', '/dashboard');
  const modelRequirementId = stableRequirementId('data-model', 'Customer');
  return {
    schemaVersion: BUILD_CONTRACT_SCHEMA_VERSION,
    metadataVersion: BUILD_CONTRACT_METADATA_VERSION,
    contractVersion: 2,
    id: 'contract-1',
    project: {
      projectId: 'project-1',
      projectName: 'Customer Portal',
      workspaceId: 'workspace-1',
    },
    projectSummary: 'Build a customer portal.',
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
    layouts: ['Responsive shell'],
    navigation: ['Link to dashboard'],
    dataModels: [
      {
        name: 'Customer',
        fields: ['id', 'name', 'email'],
        source: 'blueprint',
      },
    ],
    relationships: [],
    authentication: 'Email authentication',
    rolesAndPermissions: ['user owns own records'],
    apis: [],
    integrations: [],
    aiCapabilities: [],
    storageRequirements: [],
    billingRequirements: [],
    backgroundJobs: [],
    environmentVariableNames: ['NEXT_PUBLIC_SUPABASE_URL', 'OPENAI_API_KEY'],
    deploymentTarget: 'Vercel',
    visualRequirements: { source: 'blueprint', appearance: 'dark' },
    responsiveRequirements: {
      source: 'blueprint',
      mobileSupport: ['responsive-web'],
      expectations: ['Works on mobile'],
    },
    accessibilityExpectations: {
      source: 'platform-default',
      expectations: ['Keyboard reachable controls'],
    },
    acceptanceCriteria: ['Build contract review passes.'],
    constraints: ['free-first investment level'],
    optionalCapabilities: ['notifications'],
    requiredCapabilities: ['auth', 'dashboard'],
    requirements: [
      {
        stableId: routeRequirementId,
        type: 'route',
        title: 'Dashboard route',
        description: 'The /dashboard route must exist.',
        status: 'required',
        source: 'blueprint',
        validationStrategy: 'route-exists',
        completionStatus: 'pending',
        evidenceReferences: [{ kind: 'route', ref: '/dashboard' }],
      },
      {
        stableId: modelRequirementId,
        type: 'data-model',
        title: 'Customer model',
        description: 'Customer data model must exist.',
        status: 'required',
        source: 'blueprint',
        validationStrategy: 'content-check',
        completionStatus: 'satisfied',
        evidenceReferences: [{ kind: 'model', ref: 'Customer' }],
      },
      {
        stableId: stableRequirementId('integration', 'notifications'),
        type: 'integration',
        title: 'Notifications',
        description: 'Optional notification reminders.',
        status: 'optional',
        source: 'architect',
        validationStrategy: 'manual-review',
        completionStatus: 'pending',
        evidenceReferences: [],
      },
    ],
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  };
}

function task(overrides: Partial<TaskGraphTask> = {}): TaskGraphTask {
  const timestamp = '2026-07-22T00:00:00.000Z';
  return {
    id: 'task-dashboard',
    title: 'Build dashboard route',
    description: 'Create a dashboard route for customer records.',
    category: 'frontend',
    capabilityIds: ['dashboard'],
    sourceRequirementIds: [stableRequirementId('route', '/dashboard')],
    dependencies: [],
    status: 'ready',
    priority: 'high',
    allowedFileScope: ['src/app/dashboard/**', 'src/components/dashboard/**'],
    expectedFiles: [
      'src/app/dashboard/page.tsx',
      'src/components/dashboard/DashboardClient.tsx',
    ],
    expectedOutputs: ['Dashboard route renders records.'],
    acceptanceChecks: ['Route /dashboard exists.'],
    validationCommands: ['npm run type-check'],
    retryCount: 0,
    maximumRetryCount: 1,
    failureClassification: 'none',
    createdAt: timestamp,
    updatedAt: timestamp,
    assignedDiscipline: 'frontend',
    resultEvidence: [],
    resumable: true,
    fingerprint: 'task-dashboard-v1',
    ...overrides,
  };
}

describe('Matrix Intelligence Core', () => {
  it('creates all eight brain domains with versioned memory boundaries', () => {
    const core = createEmptyIntelligenceCore('project-1');

    expect(core.schemaVersion).toBe(1);
    expect(core.vision.version).toBe('2026-07-22');
    expect(core.project.records).toEqual([]);
    expect(core.product.records).toEqual([]);
    expect(core.user.records).toEqual([]);
    expect(core.conversation.records).toEqual([]);
    expect(core.working.records).toEqual([]);
    expect(core.engineering.records).toEqual([]);
    expect(core.experience.records).toEqual([]);
  });

  it('extracts durable meaning records from structured sources without mutating them', () => {
    const buildContract = contract();
    const core = createIntelligenceCore({
      projectId: 'project-1',
      buildContract,
      now: new Date('2026-07-22T00:00:00.000Z'),
    });

    expect(core.engineering.buildContractId).toBe(buildContract.id);
    expect(core.engineering.buildContractVersion).toBe(2);
    expect(core.engineering.pendingRequirementIds).toContain(
      stableRequirementId('route', '/dashboard')
    );
    expect(buildContract.requirements[0]?.completionStatus).toBe('pending');
    expect(
      core.engineering.records.some(
        (record) => record.key === stableRequirementId('route', '/dashboard')
      )
    ).toBe(true);
  });

  it('uses precedence rules: explicit corrections beat user-approved and blueprint decisions', () => {
    let core = createEmptyIntelligenceCore('project-1');
    core = addIntelligenceRecord(core, {
      domain: 'product',
      category: 'decision',
      key: 'theme',
      value: 'light',
      source: { kind: 'blueprint', id: 'blueprint-1' },
      status: 'approved',
      userApproved: true,
    });
    core = addIntelligenceRecord(core, {
      domain: 'product',
      category: 'decision',
      key: 'theme',
      value: 'dark',
      source: { kind: 'user-correction', id: 'msg-1' },
      status: 'approved',
    });

    const resolution = resolveIntelligenceDecision(core, {
      domain: 'product',
      category: 'decision',
      key: 'theme',
    });

    expect(resolution.record?.value).toBe('dark');
    expect(
      core.product.records.find((record) => record.value === 'light')?.status
    ).toBe('superseded');
  });

  it('keeps Working Brain temporary and unable to overwrite permanent memory', () => {
    let core = addIntelligenceRecord(createEmptyIntelligenceCore('project-1'), {
      domain: 'product',
      category: 'decision',
      key: 'app-type',
      value: 'CRM',
      source: { kind: 'user-approved' },
      status: 'approved',
      userApproved: true,
    });
    core = applyWorkingState(core, {
      activeTaskId: 'task-1',
      currentRepositoryFingerprint: 'fingerprint-1',
      summary: 'Temporary task note',
    });

    expect(core.working.activeTaskId).toBe('task-1');
    expect(core.working.records[0]?.key).toBe('active-summary');
    expect(
      resolveIntelligenceDecision(core, {
        domain: 'product',
        category: 'decision',
        key: 'app-type',
      }).record?.value
    ).toBe('CRM');
  });

  it('reflects verified repository evidence in Engineering Brain', () => {
    const repositoryModel = createRepositoryModel({
      files: [
        file('package.json', JSON.stringify({ dependencies: { next: '^15.0.0' } })),
        file('src/app/page.tsx', 'export default function Page() { return null; }'),
        file(
          'src/app/dashboard/page.tsx',
          'export default function Dashboard() { return null; }'
        ),
      ],
      projectId: 'project-1',
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    const core = createIntelligenceCore({
      projectId: 'project-1',
      repositoryModel,
      now: new Date('2026-07-22T00:00:00.000Z'),
    });

    expect(core.engineering.repositoryFingerprint).toBe(
      repositoryModel.repositoryFingerprint
    );
    expect(
      [
        ...(core.engineering.records.find((record) => record.key === 'routes')
          ?.value as string[]),
      ].sort()
    ).toEqual(['/', '/dashboard']);
  });

  it('accepts only verified Experience Brain lessons with evidence', () => {
    const core = createEmptyIntelligenceCore('project-1');
    expect(() =>
      recordVerifiedExperienceLesson(core, {
        lessonId: 'lesson-no-evidence',
        title: 'No evidence',
        description: 'Should fail',
        evidenceReferences: [],
      })
    ).toThrow(/require evidence/i);

    const next = recordVerifiedExperienceLesson(core, {
      lessonId: 'lesson-dashboard-client',
      title: 'Dashboard client split',
      description: 'Interactive dashboards need client children.',
      evidenceReferences: [
        {
          kind: 'file',
          ref: 'src/components/dashboard/DashboardClient.tsx',
        },
      ],
    });
    expect(next.experience.verifiedLessonIds).toContain('lesson-dashboard-client');
    expect(next.experience.records[0]?.status).toBe('verified');
  });

  it('creates task packets with foundation empty-repo safeguards and stale fingerprint detection', () => {
    let core = createIntelligenceCore({
      projectId: 'project-1',
      buildContract: contract(),
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    core = applyWorkingState(core, {
      currentRepositoryFingerprint: 'old-fingerprint',
    });
    const repositoryModel = createRepositoryModel({
      files: [],
      projectId: 'project-1',
      now: new Date('2026-07-22T00:00:00.000Z'),
    });

    const packet = createTaskIntelligencePacket(core, {
      task: task({
        category: 'foundation',
        allowedFileScope: ['package.json', 'src/app/**'],
        expectedFiles: ['package.json', 'src/app/page.tsx'],
      }),
      buildContract: contract(),
      repositoryModel,
      now: new Date('2026-07-22T00:00:00.000Z'),
    });

    expect(packet.fullFileCreationRequired).toBe(true);
    expect(packet.doNotValidateExpectedOutputsBeforeGeneration).toBe(true);
    expect(packet.missingExpectedFiles).toEqual([]);
    expect(packet.repositoryState).toBe('stale');
  });

  it('keeps task packets relevant and excludes unrelated permanent memory', () => {
    let core = createEmptyIntelligenceCore('project-1');
    core = addIntelligenceRecord(core, {
      domain: 'product',
      category: 'decision',
      key: 'dashboard',
      value: 'Customer dashboard with KPIs',
      source: { kind: 'blueprint' },
      status: 'approved',
    });
    core = addIntelligenceRecord(core, {
      domain: 'product',
      category: 'decision',
      key: 'restaurant-menu',
      value: 'Unrelated menu builder',
      source: { kind: 'blueprint' },
      status: 'approved',
    });

    const packet = createTaskIntelligencePacket(core, {
      task: task(),
      buildContract: contract(),
    });

    expect(packet.relevantMemory.map((record) => record.key)).toContain(
      'dashboard'
    );
    expect(packet.relevantMemory.map((record) => record.key)).not.toContain(
      'restaurant-menu'
    );
  });

  it('redacts secrets and raw image data before persistence', () => {
    let core = createEmptyIntelligenceCore('project-1');
    core = addIntelligenceRecord(core, {
      domain: 'project',
      category: 'constraint',
      key: 'OPENAI_API_KEY',
      value: 'sk-abc123456789secret',
      source: { kind: 'conversation' },
    });
    core = addIntelligenceRecord(core, {
      domain: 'user',
      category: 'preference',
      key: 'child-photo',
      value: 'data:image/png;base64,AAAA',
      source: { kind: 'conversation' },
    });

    const serialized = serializeIntelligenceCore(core);
    expect(serialized).not.toContain('sk-abc');
    expect(serialized).not.toContain('data:image');
    expect(serialized).toContain('[REDACTED_SECRET]');
    expect(serialized).toContain('[REDACTED_IMAGE_DATA]');
  });

  it('migrates older projects with no Intelligence Core gracefully', () => {
    expect(deserializeIntelligenceCore('{}', 'project-old')?.projectId).toBe(
      'project-old'
    );
  });

  it('persists Intelligence Core through project save, restore, context, snapshot, and duplicate', async () => {
    const storage = memoryStorage();
    const core = createIntelligenceCore({
      projectId: 'project-1',
      buildContract: contract(),
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    const project = createMatrixProject(
      {
        name: 'Customer Portal',
        files: [file('src/app/page.tsx', 'export default function Page() {}')],
        chatMessages: [],
        intelligenceCore: core,
      },
      new Date('2026-07-22T00:00:00.000Z'),
      'project-1'
    );

    await saveMatrixProject(project, [], {
      storage,
      supabaseClient: null,
      userId: 'user-1',
    });
    const loaded = await loadMatrixProjects({
      storage,
      supabaseClient: null,
      userId: 'user-1',
    });
    expect(loaded.projects[0]?.intelligenceCore?.projectId).toBe('project-1');

    saveMatrixProjectWorkspaceSnapshot(storage, {
      projectId: 'project-1',
      name: project.name,
      description: project.description,
      files: project.files,
      chatMessages: project.chatMessages,
      intelligenceCore: core,
      validationStatus: 'unknown',
      deploymentStatus: 'unknown',
      updatedAt: project.updatedAt,
    });
    expect(loadMatrixProjectWorkspaceSnapshot(storage)?.intelligenceCore?.id).toBe(
      core.id
    );

    saveMatrixProjectWorkspaceContext(storage, {
      currentProjectId: 'project-1',
      currentProjectName: project.name,
      intelligenceCore: core,
    });
    expect(loadMatrixProjectWorkspaceContext(storage).intelligenceCore?.id).toBe(
      core.id
    );

    const duplicate = duplicateMatrixProject(
      project,
      new Date('2026-07-23T00:00:00.000Z'),
      'project-2'
    );
    expect(duplicate.intelligenceCore?.projectId).toBe('project-2');
    expect(duplicate.intelligenceCore?.working.records).toEqual([]);
  });

  it('creates summary packets that treat Build Contract as completion authority', () => {
    const buildContract = contract();
    const core = createIntelligenceCore({
      projectId: 'project-1',
      buildContract,
    });
    const packet = createFinalReviewIntelligencePacket(core, buildContract);
    const architectPacket = createArchitectIntelligencePacket(core, buildContract);

    expect(packet.summary).toMatch(/Build Contract items/i);
    expect(packet.authoritativeRequirementIds).toContain(
      stableRequirementId('route', '/dashboard')
    );
    expect(architectPacket.kind).toBe('architect');
    expect(allIntelligenceRecords(core).length).toBeGreaterThan(0);
  });

  it('clones Intelligence Core for a new project without sharing volatile working state', () => {
    const original = applyWorkingState(createEmptyIntelligenceCore('project-1'), {
      activeTaskId: 'task-1',
      summary: 'Working note',
    });
    const cloned = cloneIntelligenceCoreForProject(
      original,
      'project-2',
      new Date('2026-07-23T00:00:00.000Z')
    );

    expect(cloned.projectId).toBe('project-2');
    expect(cloned.id).toBe('intelligence-core:project-2');
    expect(cloned.working.activeTaskId).toBeUndefined();
    expect(cloned.working.records).toEqual([]);
  });
});
