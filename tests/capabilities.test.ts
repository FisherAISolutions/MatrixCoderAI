import { describe, expect, it } from 'vitest';

import {
  BUILD_CONTRACT_METADATA_VERSION,
  BUILD_CONTRACT_SCHEMA_VERSION,
  stableRequirementId,
  type BuildContract,
  type BuildContractRequirement,
  type BuildContractRequirementType,
} from '@/lib/build-contract';
import {
  CAPABILITY_REGISTRY_VERSION,
  CAPABILITY_RESOLUTION_SCHEMA_VERSION,
  capabilityRegistry,
  deserializeCapabilityResolution,
  expandCapabilityDependencies,
  getCapabilityDefinition,
  resolveCapabilities,
  serializeCapabilityResolution,
  type CapabilityDefinition,
  type ResolvedCapability,
} from '@/lib/capabilities';
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
    projectSummary: 'Build a typed Next.js application.',
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

function capabilityIds(result: {
  capabilities: Array<{ capabilityId: string }>;
}): string[] {
  return result.capabilities.map((capability) => capability.capabilityId);
}

function resolvedCapability(capabilityId: string): ResolvedCapability {
  return {
    capabilityId,
    status: 'required',
    sourceRequirementIds: [],
    source: 'contract',
    addedByCapabilityIds: [],
    addedByDomainPackIds: [],
  };
}

describe('Capability Registry and resolution', () => {
  it('detects structured platform and product capabilities from a Build Contract', () => {
    const authReq = requirement(
      'authentication',
      'supabase-auth',
      'Supabase authentication',
      'Users sign in with Supabase Auth.'
    );
    const dataReq = requirement(
      'data-model',
      'Contact',
      'Data model: Contact',
      'Contact model includes name, email, company, notes.'
    );
    const source = contract({
      projectSummary: 'Build a professional CRM dashboard.',
      authentication: 'Users need accounts with organization roles.',
      rolesAndPermissions: ['Admin', 'Member'],
      routes: [
        { path: '/', label: 'Home', required: true, source: 'blueprint' },
        {
          path: '/dashboard',
          label: 'Dashboard',
          required: true,
          source: 'blueprint',
        },
      ],
      dataModels: [
        {
          name: 'Contact',
          fields: ['name', 'email', 'company', 'notes'],
          source: 'blueprint',
        },
      ],
      integrations: ['Supabase', 'Vercel'],
      storageRequirements: ['Project-scoped persistence.'],
      environmentVariableNames: [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      ],
      deploymentTarget: 'Vercel',
      requirements: [
        ...contract().requirements,
        authReq,
        dataReq,
        requirement('deployment', 'Vercel', 'Deployment target: Vercel'),
      ],
    });

    const result = resolveCapabilities(source, {
      now: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(capabilityIds(result)).toEqual(
      expect.arrayContaining([
        'framework-nextjs',
        'typescript',
        'responsive-ui',
        'authentication',
        'role-based-access',
        'database',
        'supabase-database',
        'admin-dashboard',
        'crud',
        'deployment-vercel',
      ])
    );
    expect(
      result.capabilities.find((item) => item.capabilityId === 'database')
        ?.sourceRequirementIds
    ).toContain(dataReq.stableId);
  });

  it('expands dependencies once and keeps deterministic order', () => {
    const expanded = expandCapabilityDependencies([
      resolvedCapability('subscriptions'),
      resolvedCapability('image-upload'),
      resolvedCapability('subscriptions'),
    ]);

    const ids = capabilityIds(expanded);
    expect(ids.filter((id) => id === 'subscriptions')).toHaveLength(1);
    expect(ids).toEqual(
      expect.arrayContaining(['billing', 'file-storage', 'subscriptions'])
    );
    expect(ids.indexOf('file-storage')).toBeLessThan(ids.indexOf('image-upload'));
  });

  it('warns when dependency cycles are introduced by registry data', () => {
    const baseDefinition = getCapabilityDefinition('framework-nextjs')!;
    const cycleA: CapabilityDefinition = {
      ...baseDefinition,
      id: 'cycle-a',
      dependencyCapabilityIds: ['cycle-b'],
    };
    const cycleB: CapabilityDefinition = {
      ...baseDefinition,
      id: 'cycle-b',
      dependencyCapabilityIds: ['cycle-a'],
    };
    capabilityRegistry.set('cycle-a', cycleA);
    capabilityRegistry.set('cycle-b', cycleB);

    try {
      const expanded = expandCapabilityDependencies([
        resolvedCapability('cycle-a'),
      ]);
      expect(expanded.warnings.some((warning) => warning.code === 'dependency-cycle')).toBe(
        true
      );
    } finally {
      capabilityRegistry.delete('cycle-a');
      capabilityRegistry.delete('cycle-b');
    }
  });

  it('detects conservative conflicts without blocking safe combinations', () => {
    const source = contract({
      constraints: [
        'Fully offline local-first mode is required for the first prototype.',
      ],
      integrations: ['Supabase'],
      deploymentTarget: 'Vercel',
      storageRequirements: ['Local-first persistence with cloud sync later.'],
    });

    const result = resolveCapabilities(source);

    expect(result.conflicts.some((conflict) => /offline/i.test(conflict.explanation))).toBe(
      true
    );
    expect(result.conflicts.every((conflict) => conflict.severity === 'warning')).toBe(
      true
    );
  });

  it('makes budget-aware provider recommendations with broad cost bands', () => {
    const source = contract({
      dataModels: [{ name: 'Entry', fields: ['title'], source: 'blueprint' }],
      storageRequirements: ['Local-first persistence.'],
      requirements: [
        ...contract().requirements,
        requirement('data-model', 'Entry', 'Data model: Entry'),
      ],
    });

    const freeFirst = resolveCapabilities(source, { budgetMode: 'free-first' });
    const professional = resolveCapabilities(source, {
      budgetMode: 'professional',
    });

    expect(
      freeFirst.providerRecommendations.find(
        (recommendation) => recommendation.category === 'database'
      )
    ).toMatchObject({
      recommendedOption: 'localStorage with typed storage helpers',
      estimatedCostBand: 'free',
      hasFreeTier: true,
    });
    expect(
      professional.providerRecommendations.find(
        (recommendation) => recommendation.category === 'database'
      )?.recommendedOption
    ).toMatch(/Supabase|Managed/i);
  });

  it('adds a children story domain pack for a realistic story app contract', () => {
    const source = contract({
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
        { path: '/library', label: 'Library', required: true, source: 'blueprint' },
        { path: '/editor', label: 'Editor', required: true, source: 'blueprint' },
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
          'Saved story with editable story pages and illustrations.'
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
      ],
    });

    const result = resolveCapabilities(source);

    expect(result.domainPackContributions.map((item) => item.domainPackId)).toContain(
      'childrens-story'
    );
    expect(capabilityIds(result)).toEqual(
      expect.arrayContaining([
        'framework-nextjs',
        'typescript',
        'responsive-ui',
        'authentication',
        'database',
        'supabase-database',
        'file-storage',
        'image-upload',
        'text-ai-generation',
        'image-ai-generation',
        'child-profile-management',
        'character-profile-management',
        'story-crud',
        'page-editor',
        'story-library',
        'deployment-vercel',
      ])
    );
  });

  it('resolves unknown custom app contracts to general platform capabilities', () => {
    const source = contract({
      projectSummary: 'Build a weird custom planning surface for lab notes.',
      dataModels: [{ name: 'Record', fields: ['title'], source: 'blueprint' }],
      requirements: [
        ...contract().requirements,
        requirement('data-model', 'Record', 'Data model: Record'),
      ],
    });

    const result = resolveCapabilities(source);

    expect(capabilityIds(result)).toEqual(
      expect.arrayContaining([
        'framework-nextjs',
        'typescript',
        'responsive-ui',
        'database',
        'crud',
      ])
    );
    expect(
      result.capabilities.some((item) =>
        item.capabilityId.includes('child-profile')
      )
    ).toBe(false);
  });

  it('does not mutate the Build Contract while resolving capabilities', () => {
    const source = contract({
      dataModels: [{ name: 'Entry', fields: ['title'], source: 'blueprint' }],
    });
    const before = JSON.stringify(source);

    resolveCapabilities(source);

    expect(JSON.stringify(source)).toBe(before);
  });

  it('serializes and recovers malformed optional resolution data', () => {
    const source = contract();
    const resolution = resolveCapabilities(source, {
      now: new Date('2026-07-20T00:00:00.000Z'),
    });
    const raw = JSON.parse(serializeCapabilityResolution(resolution));
    raw.providerRecommendations = 'bad-data';
    raw.conflicts = null;
    raw.capabilities = [{ capabilityId: 'framework-nextjs' }];

    const restored = deserializeCapabilityResolution(JSON.stringify(raw));

    expect(restored?.schemaVersion).toBe(CAPABILITY_RESOLUTION_SCHEMA_VERSION);
    expect(restored?.registryVersion).toBe(CAPABILITY_REGISTRY_VERSION);
    expect(restored?.providerRecommendations).toEqual([]);
    expect(restored?.conflicts).toEqual([]);
    expect(restored?.capabilities[0]).toMatchObject({
      capabilityId: 'framework-nextjs',
      status: 'optional',
      source: 'contract',
    });
  });

  it('persists capability resolution through project save and restore', async () => {
    const storage = createMemoryStorage();
    const source = contract({
      dataModels: [{ name: 'Entry', fields: ['title'], source: 'blueprint' }],
    });
    const capabilityResolution = resolveCapabilities(source, {
      now: new Date('2026-07-20T00:00:00.000Z'),
    });
    const project = createMatrixProject(
      {
        name: 'Capability Project',
        buildContract: source,
        capabilityResolution,
      },
      new Date('2026-07-20T00:00:00.000Z'),
      'capability-project'
    );

    await saveMatrixProject(project, [], {
      storage,
      supabaseClient: null,
    });
    const loaded = await loadMatrixProjects({
      storage,
      supabaseClient: null,
    });

    expect(loaded.projects[0]?.capabilityResolution?.contractId).toBe(source.id);
    expect(
      loaded.projects[0]?.capabilityResolution?.capabilities.map(
        (capability) => capability.capabilityId
      )
    ).toContain('database');
  });

  it('keeps older projects compatible when no capability resolution exists', async () => {
    const storage = createMemoryStorage();
    const project = createMatrixProject({
      name: 'Older Project',
    });

    await saveMatrixProject(project, [], {
      storage,
      supabaseClient: null,
    });
    const loaded = await loadMatrixProjects({
      storage,
      supabaseClient: null,
    });

    expect(loaded.projects[0]?.capabilityResolution).toBeUndefined();
  });
});

