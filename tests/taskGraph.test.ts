import { describe, expect, it } from 'vitest';

import {
  BUILD_CONTRACT_METADATA_VERSION,
  BUILD_CONTRACT_SCHEMA_VERSION,
  stableRequirementId,
  type BuildContract,
  type BuildContractRequirement,
  type BuildContractRequirementType,
} from '@/lib/build-contract';
import { resolveCapabilities } from '@/lib/capabilities';
import {
  cancelTaskGraph,
  createTaskGraph,
  deserializeTaskGraph,
  detectTaskGraphCycles,
  getBlockedTasks,
  getCompletedCapabilityIds,
  getFailedTasks,
  getNextReadyTask,
  getResumableTasks,
  getTaskGraphProgress,
  markTaskPassed,
  recordTaskFailure,
  serializeTaskGraph,
  stableTaskId,
  type TaskGraphTask,
} from '@/lib/task-graph';
import {
  createMatrixProject,
  loadMatrixProjects,
  saveMatrixProject,
} from '@/lib/projects/projectStore';

function createMemoryStorage(): Storage {
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

function requirement(
  type: BuildContractRequirementType,
  target: string,
  title: string,
  description = title
): BuildContractRequirement {
  return {
    stableId: stableRequirementId(type, target),
    type,
    title,
    description,
    status: 'required',
    source: 'blueprint',
    validationStrategy: type === 'route' ? 'route-exists' : 'content-check',
    completionStatus: 'pending',
    evidenceReferences:
      type === 'route'
        ? [{ kind: 'route', ref: target }]
        : [{ kind: 'source', ref: 'blueprint' }],
  };
}

function contract(overrides: Partial<BuildContract> = {}): BuildContract {
  const base: BuildContract = {
    schemaVersion: BUILD_CONTRACT_SCHEMA_VERSION,
    metadataVersion: BUILD_CONTRACT_METADATA_VERSION,
    contractVersion: 1,
    id: 'contract-1',
    project: {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      projectName: 'Matrix App',
    },
    projectSummary: 'Build a typed custom Next.js application.',
    targetFramework: 'Next.js 15 App Router',
    routes: [{ path: '/', label: 'Home', required: true, source: 'blueprint' }],
    layouts: ['Responsive app layout'],
    navigation: ['Primary navigation'],
    dataModels: [],
    relationships: [],
    authentication: 'No authentication required for the first version.',
    rolesAndPermissions: [],
    apis: [],
    integrations: [],
    aiCapabilities: [],
    storageRequirements: [],
    billingRequirements: [],
    backgroundJobs: [],
    environmentVariableNames: [],
    deploymentTarget: 'Next.js web app',
    visualRequirements: { source: 'platform-default' },
    responsiveRequirements: {
      mobileSupport: ['responsive-web'],
      expectations: ['Works on desktop and mobile.'],
      source: 'platform-default',
    },
    accessibilityExpectations: {
      expectations: ['Keyboard accessible primary workflows.'],
      source: 'platform-default',
    },
    acceptanceCriteria: ['Production validation passes before completion.'],
    constraints: ['Use Next.js App Router with src/app only.'],
    optionalCapabilities: [],
    requiredCapabilities: [],
    requirements: [
      requirement('route', '/', 'Route /', 'Home route must exist.'),
      requirement(
        'responsive',
        'responsive-design',
        'Responsive design',
        'Primary workflows must work on desktop and mobile.'
      ),
    ],
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
  };

  return { ...base, ...overrides };
}

function storyContract(): BuildContract {
  return contract({
    id: 'story-contract',
    project: {
      projectId: 'story-project',
      workspaceId: 'story-workspace',
      projectName: 'StorySpark',
    },
    projectSummary:
      'Build a children story creator where parents manage child profiles, upload photos, save characters, generate stories and illustrations, edit page-by-page, and keep a story library.',
    authentication: 'Parent accounts are required.',
    rolesAndPermissions: ['Parent', 'Child'],
    routes: [
      { path: '/', label: 'Home', required: true, source: 'blueprint' },
      { path: '/profiles', label: 'Profiles', required: true, source: 'blueprint' },
      { path: '/editor', label: 'Editor', required: true, source: 'blueprint' },
      { path: '/library', label: 'Library', required: true, source: 'blueprint' },
    ],
    dataModels: [
      {
        name: 'ChildProfile',
        fields: ['name', 'ageRange', 'interests'],
        source: 'blueprint',
      },
      {
        name: 'CharacterProfile',
        fields: ['name', 'traits', 'photoUrl'],
        source: 'blueprint',
      },
      {
        name: 'Story',
        fields: ['title', 'pages', 'illustrations'],
        source: 'blueprint',
      },
    ],
    integrations: ['Supabase', 'OpenAI', 'Vercel'],
    aiCapabilities: ['AI story generation', 'AI image generation'],
    storageRequirements: ['Supabase Storage for uploaded photos and images.'],
    environmentVariableNames: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'OPENAI_API_KEY',
    ],
    deploymentTarget: 'Vercel',
    requirements: [
      ...contract().requirements,
      requirement('route', '/profiles', 'Route /profiles'),
      requirement('route', '/editor', 'Route /editor'),
      requirement('route', '/library', 'Route /library'),
      requirement(
        'data-model',
        'ChildProfile',
        'Data model: ChildProfile',
        'Child profile stores age range, interests, and parent ownership.'
      ),
      requirement(
        'data-model',
        'CharacterProfile',
        'Data model: CharacterProfile',
        'Saved character profile with uploaded photo.'
      ),
      requirement(
        'data-model',
        'Story',
        'Data model: Story',
        'Saved story with editable pages and illustrations.'
      ),
      requirement(
        'ai-capability',
        'AI story generation',
        'AI story generation',
        'Generate child-safe story text.'
      ),
      requirement(
        'ai-capability',
        'AI image generation',
        'AI image generation',
        'Generate illustrations for story pages.'
      ),
      requirement(
        'storage',
        'Supabase Storage',
        'Supabase Storage',
        'Store uploaded child photos and generated story images.'
      ),
      requirement('deployment', 'Vercel', 'Deployment target: Vercel'),
    ],
  });
}

describe('Task Graph foundation', () => {
  it('generates dependency-aware engineering slices in coherent order', () => {
    const source = contract({
      projectSummary: 'Build a CRM with contacts, tasks, dashboard, and pipeline.',
      routes: [
        { path: '/', label: 'Home', required: true, source: 'blueprint' },
        {
          path: '/contacts',
          label: 'Contacts',
          required: true,
          source: 'blueprint',
        },
        { path: '/tasks', label: 'Tasks', required: true, source: 'blueprint' },
      ],
      dataModels: [
        { name: 'Contact', fields: ['name', 'email'], source: 'blueprint' },
        { name: 'Task', fields: ['title', 'completed'], source: 'blueprint' },
      ],
      requirements: [
        ...contract().requirements,
        requirement('route', '/contacts', 'Route /contacts'),
        requirement('route', '/tasks', 'Route /tasks'),
        requirement('data-model', 'Contact', 'Data model: Contact'),
        requirement('data-model', 'Task', 'Data model: Task'),
      ],
    });
    const capabilities = resolveCapabilities(source, {
      now: new Date('2026-07-20T00:00:00.000Z'),
    });

    const graph = createTaskGraph({
      contract: source,
      capabilityResolution: capabilities,
      now: new Date('2026-07-20T00:01:00.000Z'),
    });

    const ids = graph.tasks.map((task) => task.id);
    expect(ids.indexOf('task-foundation-project-foundation')).toBeLessThan(
      ids.indexOf(stableTaskId('database', 'types-schema'))
    );
    expect(ids.indexOf(stableTaskId('database', 'types-schema'))).toBeLessThan(
      ids.indexOf(stableTaskId('route', '/contacts'))
    );
    expect(ids.indexOf(stableTaskId('testing', 'contract-validation'))).toBeGreaterThan(
      ids.indexOf(stableTaskId('route', '/tasks'))
    );
  });

  it('detects task dependency cycles', () => {
    const tasks = [
      { id: 'task-a', dependencies: ['task-b'] },
      { id: 'task-b', dependencies: ['task-a'] },
    ] as Pick<TaskGraphTask, 'id' | 'dependencies'>[];

    expect(detectTaskGraphCycles(tasks)[0]?.taskIds).toEqual([
      'task-a',
      'task-b',
      'task-a',
    ]);
  });

  it('selects the next ready task after dependencies pass', () => {
    const source = contract({
      dataModels: [{ name: 'Entry', fields: ['title'], source: 'blueprint' }],
      requirements: [
        ...contract().requirements,
        requirement('data-model', 'Entry', 'Data model: Entry'),
      ],
    });
    const graph = createTaskGraph({
      contract: source,
      capabilityResolution: resolveCapabilities(source),
      now: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(getNextReadyTask(graph)?.id).toBe(
      'task-foundation-project-foundation'
    );

    const afterFoundation = markTaskPassed(
      graph,
      'task-foundation-project-foundation',
      [],
      new Date('2026-07-20T00:01:00.000Z')
    );

    expect(getNextReadyTask(afterFoundation)?.id).toBe(
      stableTaskId('database', 'types-schema')
    );
  });

  it('persists and restores through the project snapshot system', async () => {
    const storage = createMemoryStorage();
    const source = contract();
    const taskGraph = createTaskGraph({
      contract: source,
      capabilityResolution: resolveCapabilities(source),
      now: new Date('2026-07-20T00:00:00.000Z'),
    });
    const project = createMatrixProject(
      {
        name: 'Graph Project',
        buildContract: source,
        capabilityResolution: resolveCapabilities(source),
        taskGraph,
      },
      new Date('2026-07-20T00:01:00.000Z'),
      'graph-project'
    );

    await saveMatrixProject(project, [], { storage, supabaseClient: null });
    const loaded = await loadMatrixProjects({ storage, supabaseClient: null });

    expect(loaded.projects[0]?.taskGraph?.id).toBe(taskGraph.id);
    expect(loaded.projects[0]?.taskGraph?.tasks.length).toBeGreaterThan(0);
  });

  it('cancels unfinished work while preserving completed evidence', () => {
    const source = contract();
    const graph = markTaskPassed(
      createTaskGraph({
        contract: source,
        capabilityResolution: resolveCapabilities(source),
        now: new Date('2026-07-20T00:00:00.000Z'),
      }),
      'task-foundation-project-foundation'
    );

    const cancelled = cancelTaskGraph(
      graph,
      'Cancelled by user.',
      new Date('2026-07-20T00:02:00.000Z')
    );

    expect(
      cancelled.tasks.find((task) => task.id === 'task-foundation-project-foundation')
        ?.status
    ).toBe('passed');
    expect(cancelled.tasks.some((task) => task.status === 'cancelled')).toBe(true);
    expect(getResumableTasks(cancelled)).toEqual([]);
  });

  it('tracks retry limits and failure classifications', () => {
    const source = contract();
    const graph = createTaskGraph({
      contract: source,
      capabilityResolution: resolveCapabilities(source),
    });
    const taskId = 'task-foundation-project-foundation';

    const once = recordTaskFailure(graph, taskId, 'type-check');
    expect(once.tasks.find((task) => task.id === taskId)).toMatchObject({
      status: 'recoverable-failure',
      retryCount: 1,
      failureClassification: 'type-check',
      resumable: true,
    });

    const twice = recordTaskFailure(once, taskId, 'build');
    expect(twice.tasks.find((task) => task.id === taskId)).toMatchObject({
      status: 'failed',
      retryCount: 2,
      failureClassification: 'build',
      resumable: false,
    });
    expect(getFailedTasks(twice)).toHaveLength(1);
  });

  it('regenerates only affected tasks when project requirements change', () => {
    const source = contract({
      dataModels: [{ name: 'Entry', fields: ['title'], source: 'blueprint' }],
      requirements: [
        ...contract().requirements,
        requirement('data-model', 'Entry', 'Data model: Entry'),
      ],
    });
    const first = markTaskPassed(
      createTaskGraph({
        contract: source,
        capabilityResolution: resolveCapabilities(source),
        now: new Date('2026-07-20T00:00:00.000Z'),
      }),
      'task-foundation-project-foundation',
      [{ kind: 'file', ref: 'package.json' }],
      new Date('2026-07-20T00:01:00.000Z')
    );

    const changed = contract({
      ...source,
      routes: [
        ...source.routes,
        { path: '/reports', label: 'Reports', required: true, source: 'blueprint' },
      ],
      requirements: [
        ...source.requirements,
        requirement('route', '/reports', 'Route /reports'),
      ],
      updatedAt: '2026-07-20T00:02:00.000Z',
    });
    const regenerated = createTaskGraph({
      contract: changed,
      capabilityResolution: resolveCapabilities(changed),
      existingGraph: first,
      now: new Date('2026-07-20T00:03:00.000Z'),
    });

    expect(
      regenerated.tasks.find(
        (task) => task.id === 'task-foundation-project-foundation'
      )?.status
    ).toBe('passed');
    expect(regenerated.tasks.find((task) => task.id === stableTaskId('route', '/reports'))).toMatchObject({
      status: 'pending',
      title: 'Implement Reports screen',
    });
  });

  it('uses stable task ids for identical contracts', () => {
    const source = contract({
      routes: [
        { path: '/', label: 'Home', required: true, source: 'blueprint' },
        { path: '/dashboard', label: 'Dashboard', required: true, source: 'blueprint' },
      ],
      requirements: [
        ...contract().requirements,
        requirement('route', '/dashboard', 'Route /dashboard'),
      ],
    });

    const first = createTaskGraph({
      contract: source,
      capabilityResolution: resolveCapabilities(source),
    });
    const second = createTaskGraph({
      contract: source,
      capabilityResolution: resolveCapabilities(source),
    });

    expect(second.tasks.map((task) => task.id)).toEqual(
      first.tasks.map((task) => task.id)
    );
  });

  it('creates the requested children story platform graph', () => {
    const source = storyContract();
    const graph = createTaskGraph({
      contract: source,
      capabilityResolution: resolveCapabilities(source),
      now: new Date('2026-07-20T00:00:00.000Z'),
    });
    const titles = graph.tasks.map((task) => task.title);

    expect(titles).toEqual(
      expect.arrayContaining([
        'Create project foundation',
        'Define Supabase schema',
        'Create typed clients',
        'Implement authentication',
        'Implement child profiles',
        'Implement image upload',
        'Implement story data model',
        'Implement story creation flow',
        'Implement page editor',
        'Implement text generation API',
        'Implement character likeness workflow',
        'Implement image generation API',
        'Implement story library',
        'Implement tests',
        'Run final contract review',
      ])
    );
    expect(
      graph.tasks.find((task) => task.title === 'Implement image generation API')
        ?.dependencies
    ).toEqual(
      expect.arrayContaining([
        stableTaskId('feature', 'character-likeness-workflow'),
        stableTaskId('AI', 'text-generation-api'),
      ])
    );
  });

  it('creates a conservative unknown custom app graph without domain-specific tasks', () => {
    const source = contract({
      projectSummary: 'Build a custom lab planning surface for unusual notes.',
      routes: [
        { path: '/', label: 'Home', required: true, source: 'blueprint' },
        { path: '/records', label: 'Records', required: true, source: 'blueprint' },
      ],
      dataModels: [{ name: 'Record', fields: ['title'], source: 'blueprint' }],
      requirements: [
        ...contract().requirements,
        requirement('route', '/records', 'Route /records'),
        requirement('data-model', 'Record', 'Data model: Record'),
      ],
    });
    const graph = createTaskGraph({
      contract: source,
      capabilityResolution: resolveCapabilities(source),
    });

    expect(graph.tasks.map((task) => task.title)).toEqual(
      expect.arrayContaining([
        'Create project foundation',
        'Define data types and schema',
        'Implement Records screen',
        'Implement tests',
        'Run final contract review',
      ])
    );
    expect(graph.tasks.some((task) => /story|child|character/i.test(task.title))).toBe(
      false
    );
  });

  it('serializes and recovers malformed optional graph data', () => {
    const graph = createTaskGraph({
      contract: contract(),
      capabilityResolution: resolveCapabilities(contract()),
    });
    const raw = JSON.parse(serializeTaskGraph(graph));
    raw.tasks[0].capabilityIds = 'bad-data';
    raw.tasks[0].retryCount = 'bad-data';
    raw.warnings = 'bad-data';

    const restored = deserializeTaskGraph(JSON.stringify(raw));

    expect(restored?.tasks[0]?.capabilityIds).toEqual([]);
    expect(restored?.tasks[0]?.retryCount).toBe(0);
    expect(restored?.warnings).toEqual([]);
  });

  it('reports progress, blocked tasks, and completed capabilities', () => {
    const source = contract();
    const graph = createTaskGraph({
      contract: source,
      capabilityResolution: resolveCapabilities(source),
    });
    const foundationPassed = markTaskPassed(
      graph,
      'task-foundation-project-foundation'
    );
    const blocked = {
      ...foundationPassed,
      tasks: foundationPassed.tasks.map((task) =>
        task.id === stableTaskId('review', 'final-contract-review')
          ? { ...task, status: 'blocked' as const, blockedReason: 'Needs review.' }
          : task
      ),
    };

    expect(getTaskGraphProgress(blocked).passed).toBe(1);
    expect(getBlockedTasks(blocked)).toHaveLength(1);
    expect(getCompletedCapabilityIds(blocked)).toEqual(
      expect.arrayContaining(['framework-nextjs', 'responsive-ui', 'typescript'])
    );
  });
});
