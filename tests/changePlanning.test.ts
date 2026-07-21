import { describe, expect, it } from 'vitest';

import {
  approveBuildChangePlan,
  cancelBuildChangePlan,
  createBuildChangePlan,
  deserializeBuildChangePlan,
  isChangePlanStale,
  serializeBuildChangePlan,
} from '@/lib/change-planning';
import { createBuildContract } from '@/lib/build-contract';
import { createTaskGraph } from '@/lib/task-graph';
import {
  createMatrixProject,
  duplicateMatrixProject,
  loadMatrixProjectWorkspaceSnapshot,
  saveMatrixProjectWorkspaceSnapshot,
} from '@/lib/projects/projectStore';
import { createArchitectDraft } from '@/lib/matrix-ai-architect';
import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import type { RepositoryModel } from '@/lib/repository-model';
import type { MatrixProjectWorkspaceSnapshot } from '@/lib/projects/projectStore';

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

const now = new Date('2026-07-21T12:00:00.000Z');

function blueprint(): BlueprintDraft {
  return {
    id: 'blueprint-story-platform',
    projectName: 'Story Studio',
    appDescription: 'A children story platform for one child profile.',
    routes: [
      { id: 'route-home', name: 'Home', path: '/', description: 'Landing page' },
      {
        id: 'route-library',
        name: 'Story Library',
        path: '/library',
        description: 'Browse saved stories',
      },
      {
        id: 'route-create',
        name: 'Create Story',
        path: '/create',
        description: 'Create a story',
      },
    ],
    dataModels: [
      {
        id: 'model-story',
        name: 'Story',
        fields: ['id', 'title', 'childProfileId', 'pages'],
      },
      {
        id: 'model-child-profile',
        name: 'ChildProfile',
        fields: ['id', 'name', 'age'],
      },
    ],
    components: [
      {
        id: 'component-story-creator',
        name: 'Story Creator',
      },
    ],
    integrations: [],
    userRoles: [{ id: 'role-parent', name: 'Parent' }],
    navigation: [
      { id: 'nav-home', name: 'Home', description: 'Link to /' },
      { id: 'nav-library', name: 'Story Library', description: 'Link to /library' },
    ],
    folderStructure: [
      { id: 'folder-app', name: 'src/app' },
      { id: 'folder-components', name: 'src/components' },
      { id: 'folder-lib', name: 'src/lib' },
      { id: 'folder-types', name: 'src/types' },
    ],
    deploymentTarget: 'Next.js web app',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    metadataVersion: '2026-07-08',
  };
}

function repositoryModel(userEditedStoryStorage = false): RepositoryModel {
  return {
    schemaVersion: 1,
    metadataVersion: '2026-07-20',
    id: 'repository-model-story',
    projectId: 'project-story',
    files: [
      {
        path: 'src/lib/story-storage.ts',
        name: 'story-storage.ts',
        extension: 'ts',
        size: 200,
        readable: true,
        missing: false,
        generated: true,
        userEdited: userEditedStoryStorage,
        protected: userEditedStoryStorage,
      },
      {
        path: 'src/types/story.ts',
        name: 'story.ts',
        extension: 'ts',
        size: 120,
        readable: true,
        missing: false,
        generated: true,
        userEdited: false,
        protected: false,
      },
      {
        path: 'src/app/library/page.tsx',
        name: 'page.tsx',
        extension: 'tsx',
        size: 180,
        readable: true,
        missing: false,
        generated: true,
        userEdited: false,
        protected: false,
      },
    ],
    directories: ['src', 'src/lib', 'src/types', 'src/app/library'],
    configuration: {
      framework: 'nextjs',
      packageManager: 'npm',
      hasSrcApp: true,
      hasRootApp: false,
      configFiles: ['package.json', 'tsconfig.json'],
    },
    dependencies: [],
    scripts: { build: 'next build', 'type-check': 'tsc --noEmit' },
    routes: [{ path: '/library', filePath: 'src/app/library/page.tsx', kind: 'page', readable: true, fallback: false }],
    layouts: [],
    components: ['src/components/StoryCreatorClient.tsx'],
    apis: [],
    databaseSchemas: [],
    environmentVariableNames: [],
    authImplementation: [],
    storageImplementation: [{ kind: 'storage', name: 'story-storage', files: ['src/lib/story-storage.ts'] }],
    providerIntegrations: [],
    tests: [],
    currentValidationErrors: [],
    protectedFiles: userEditedStoryStorage ? ['src/lib/story-storage.ts'] : [],
    unresolvedImports: [],
    importGraph: [],
    detectedCapabilities: ['story-crud', 'child-profile-management'],
    duplicateScaffoldRisks: [],
    repositoryFingerprint: userEditedStoryStorage ? 'repo-user-edit' : 'repo-base',
    sourceFileFingerprint: userEditedStoryStorage ? 'files-user-edit' : 'files-base',
    stale: false,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
  };
}

function baseState() {
  const architectDraft = createArchitectDraft({
    projectId: 'project-story',
    projectName: 'Story Studio',
    now: new Date('2026-07-20T00:00:00.000Z'),
  });
  const blueprintDraft = blueprint();
  const buildContract = createBuildContract({
    projectId: 'project-story',
    architectDraft,
    blueprintDraft,
    now: new Date('2026-07-20T00:00:00.000Z'),
  });
  const taskGraph = createTaskGraph({
    contract: buildContract,
    now: new Date('2026-07-20T00:00:00.000Z'),
  });
  return { architectDraft, blueprintDraft, buildContract, taskGraph };
}

describe('change planning', () => {
  it('creates a localized feature change plan for multi-child stories', () => {
    const state = baseState();
    const plan = createBuildChangePlan({
      projectId: 'project-story',
      userRequest: 'I want stories to support two children instead of one.',
      ...state,
      repositoryModel: repositoryModel(),
      now,
    });

    expect(plan.interpretedIntent.kind).toBe('localized-feature-change');
    expect(plan.affectedModels).toContain('story');
    expect(plan.proposedBlueprintDraft?.dataModels.find((model) => model.name === 'Story')?.fields)
      .toContain('childProfileIds');
    expect(plan.proposedArchitectDraft?.answers.customRequirements).toContain(
      'multiple child profiles'
    );
    expect(plan.status).toBe('draft');
  });

  it('preserves unaffected completed tasks while creating or invalidating affected tasks', () => {
    const state = baseState();
    const foundationTask = state.taskGraph.tasks.find((task) => task.id === 'task-foundation-project-foundation');
    expect(foundationTask).toBeTruthy();
    const passedGraph = {
      ...state.taskGraph,
      tasks: state.taskGraph.tasks.map((task) =>
        task.id === 'task-foundation-project-foundation' ? { ...task, status: 'passed' as const } : task
      ),
    };

    const plan = createBuildChangePlan({
      projectId: 'project-story',
      userRequest: 'I want stories to support two children instead of one.',
      architectDraft: state.architectDraft,
      blueprintDraft: state.blueprintDraft,
      buildContract: state.buildContract,
      taskGraph: passedGraph,
      repositoryModel: repositoryModel(),
      now,
    });

    expect(plan.preservedTasks.some((task) => task.taskId === 'task-foundation-project-foundation')).toBe(true);
    expect(plan.invalidatedTasks.length + plan.newTasks.length).toBeGreaterThan(0);
    expect(plan.affectedModels).toContain('story');
  });

  it('requires confirmation for destructive changes before deleting anything', () => {
    const state = baseState();
    const plan = createBuildChangePlan({
      projectId: 'project-story',
      userRequest: 'Delete the story library route and drop the Story model.',
      ...state,
      repositoryModel: repositoryModel(),
      now,
    });

    expect(plan.explicitApprovalRequirement.required).toBe(true);
    expect(plan.explicitApprovalRequirement.riskKinds).toContain('feature-deletion');
    expect(plan.proposedBlueprintDraft?.routes.some((route) => route.path === '/library')).toBe(true);
    expect(plan.proposedBlueprintDraft?.dataModels.some((model) => model.name === 'Story')).toBe(true);
  });

  it('protects user-edited files in the affected scope', () => {
    const state = baseState();
    const plan = createBuildChangePlan({
      projectId: 'project-story',
      userRequest: 'I want stories to support two children instead of one.',
      ...state,
      repositoryModel: repositoryModel(true),
      now,
    });

    expect(plan.protectedUserEditedFiles).toContain('src/lib/story-storage.ts');
    expect(plan.explicitApprovalRequirement.required).toBe(true);
    expect(plan.explicitApprovalRequirement.riskKinds).toContain('user-edited-file');
  });

  it('calculates a Build Contract diff without mutating the original contract', () => {
    const state = baseState();
    const originalManifest = state.buildContract.sourceBuildManifest;
    const plan = createBuildChangePlan({
      projectId: 'project-story',
      userRequest: 'I want stories to support two children instead of one.',
      ...state,
      repositoryModel: repositoryModel(),
      now,
    });

    expect(plan.contractChanges.dataModels.changed).toContain('story');
    expect(state.buildContract.dataModels.find((model) => model.name === 'Story')?.fields)
      .not.toContain('childProfileIds');
    expect(state.buildContract.sourceBuildManifest).toEqual(originalManifest);
  });

  it('serializes and restores a cancelled change plan', () => {
    const state = baseState();
    const plan = createBuildChangePlan({
      projectId: 'project-story',
      userRequest: 'I want stories to support two children instead of one.',
      ...state,
      repositoryModel: repositoryModel(),
      now,
    });
    const cancelled = cancelBuildChangePlan(plan, 'User decided to keep one child.', now);
    const restored = deserializeBuildChangePlan(serializeBuildChangePlan(cancelled));

    expect(restored?.status).toBe('cancelled');
    expect(restored?.risks.at(-1)?.message).toContain('cancelled');
  });

  it('persists change plans through project snapshots and duplicate projects', () => {
    const state = baseState();
    const plan = approveBuildChangePlan(
      createBuildChangePlan({
        projectId: 'project-story',
        userRequest: 'I want stories to support two children instead of one.',
        ...state,
        repositoryModel: repositoryModel(),
        now,
      }),
      now
    );
    const storage = memoryStorage();
    const snapshot: MatrixProjectWorkspaceSnapshot = {
      projectId: 'project-story',
      name: 'Story Studio',
      description: 'Story app',
      files: [],
      chatMessages: [],
      changePlan: plan,
      validationStatus: 'unknown',
      deploymentStatus: 'unknown',
      updatedAt: now.toISOString(),
    };

    saveMatrixProjectWorkspaceSnapshot(storage, snapshot);
    const loaded = loadMatrixProjectWorkspaceSnapshot(storage);
    expect(loaded?.changePlan?.id).toBe(plan.id);

    const project = createMatrixProject(
      {
        name: 'Story Studio',
        changePlan: plan,
      },
      now,
      'project-story'
    );
    const duplicate = duplicateMatrixProject(project, now, 'project-story-copy');
    expect(duplicate.changePlan?.projectId).toBe('project-story-copy');
    expect(duplicate.changePlan?.id).not.toBe(plan.id);
  });

  it('detects stale change plans when Blueprint or repository state moved on', () => {
    const state = baseState();
    const plan = createBuildChangePlan({
      projectId: 'project-story',
      userRequest: 'I want stories to support two children instead of one.',
      ...state,
      repositoryModel: repositoryModel(),
      now,
    });

    expect(
      isChangePlanStale(plan, {
        blueprintDraft: {
          ...state.blueprintDraft,
          updatedAt: '2026-07-22T00:00:00.000Z',
        },
        repositoryModel: repositoryModel(),
      })
    ).toBe(true);
  });
});
