import { describe, expect, it } from 'vitest';

import {
  engineeringAcceptanceFixtures,
  getEngineeringAcceptanceFixture,
  runEngineeringAcceptanceFixture,
} from '@/lib/engineering-benchmarks';
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

function capabilityIds(fixtureId: string): string[] {
  const fixture = engineeringAcceptanceFixtures.find(
    (item) => item.id === fixtureId
  );
  return (
    fixture?.capabilityResolution.capabilities.map(
      (capability) => capability.capabilityId
    ) ?? []
  );
}

function taskTitles(fixtureId: string): string[] {
  const fixture = engineeringAcceptanceFixtures.find(
    (item) => item.id === fixtureId
  );
  return fixture?.taskGraph.tasks.map((task) => task.title) ?? [];
}

describe('engineering acceptance fixtures', () => {
  it('defines the three internal benchmark fixtures', () => {
    expect(engineeringAcceptanceFixtures.map((fixture) => fixture.id)).toEqual([
      'children-story-platform',
      'simple-business-website',
      'crud-saas-dashboard',
    ]);
  });

  it('builds complete structured artifacts for the children story platform', () => {
    const fixture = getEngineeringAcceptanceFixture('children-story-platform');
    expect(fixture).toBeDefined();
    expect(fixture?.architectDraft.specification.estimatedComplexity).toBe(
      'platform'
    );
    expect(fixture?.blueprintDraft.projectName).toBe(
      'Personalized AI Children Story Platform'
    );
    expect(fixture?.buildContract.routes.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        '/',
        '/dashboard',
        '/profiles',
        '/characters',
        '/create',
        '/editor',
        '/stories',
        '/library',
      ])
    );
    expect(fixture?.buildContract.dataModels.map((model) => model.name)).toEqual(
      expect.arrayContaining([
        'ParentProfile',
        'ChildProfile',
        'CharacterProfile',
        'Story',
        'StoryPage',
        'StoryIllustration',
        'MediaAsset',
        'GenerationJob',
      ])
    );
    expect(fixture?.buildContract.apis.map((api) => api.path)).toEqual(
      expect.arrayContaining([
        '/api/ai/story',
        '/api/ai/illustration',
        '/api/storage/upload',
        '/api/stories',
        '/api/stories/[id]/pages',
      ])
    );
    expect(fixture?.buildContract.environmentVariableNames).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'OPENAI_API_KEY',
      ])
    );
  });

  it('resolves story capabilities and expected task graph slices', () => {
    expect(capabilityIds('children-story-platform')).toEqual(
      expect.arrayContaining([
        'authentication',
        'role-based-access',
        'database',
        'supabase-database',
        'file-storage',
        'image-upload',
        'media-library',
        'text-ai-generation',
        'image-ai-generation',
        'child-profile-management',
        'character-profile-management',
        'story-crud',
        'story-library',
        'parental-safety-review',
        'deployment-vercel',
      ])
    );
    expect(taskTitles('children-story-platform')).toEqual(
      expect.arrayContaining([
        'Create project foundation',
        'Define environment contract',
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
        'Prepare deployment readiness',
      ])
    );
  });

  it('covers the requested story acceptance categories', () => {
    const fixture = getEngineeringAcceptanceFixture('children-story-platform');
    const categories = fixture?.acceptanceCriteria.map(
      (criteria) => criteria.category
    );
    expect(categories).toEqual(
      expect.arrayContaining([
        'routes',
        'data-models',
        'apis',
        'storage',
        'security',
        'editor',
        'states',
        'ownership',
        'build',
        'quality',
        'deployment',
      ])
    );
    expect(
      fixture?.acceptanceCriteria.some((criteria) =>
        /server-only AI keys/i.test(criteria.title)
      )
    ).toBe(true);
    expect(
      fixture?.acceptanceCriteria.some((criteria) =>
        /placeholder/i.test(criteria.description)
      )
    ).toBe(true);
    expect(
      fixture?.acceptanceCriteria.some((criteria) =>
        /RLS|ownership/i.test(criteria.description)
      )
    ).toBe(true);
  });

  it('keeps contrasting fixtures general purpose', () => {
    expect(capabilityIds('simple-business-website')).not.toEqual(
      expect.arrayContaining([
        'child-profile-management',
        'story-crud',
        'story-library',
      ])
    );
    expect(capabilityIds('crud-saas-dashboard')).not.toEqual(
      expect.arrayContaining([
        'child-profile-management',
        'story-crud',
        'story-library',
      ])
    );
    expect(taskTitles('simple-business-website').join(' ')).not.toMatch(
      /story|child|character|illustration/i
    );
    expect(taskTitles('crud-saas-dashboard').join(' ')).not.toMatch(
      /story|child|character|illustration/i
    );
  });

  it('scores a bounded dry run without live generation', () => {
    const fixture = getEngineeringAcceptanceFixture('children-story-platform');
    expect(fixture).toBeDefined();
    const result = runEngineeringAcceptanceFixture(
      fixture!,
      Date.parse('2026-07-21T00:00:00.000Z'),
      Date.parse('2026-07-21T00:00:02.500Z')
    );

    expect(result).toMatchObject({
      fixtureId: 'children-story-platform',
      mode: 'structured-dry-run',
      buildResult: 'not-run',
      tasksPassed: 0,
      durationMs: 2500,
      finalScore: 100,
    });
    expect(result.tasksGenerated).toBeGreaterThan(15);
    expect(result.failures).toEqual([]);
    expect(result.warnings[0]).toMatch(/No GPT, OpenAI, WebContainer/);
  });

  it('persists fixture artifacts through the existing project snapshot system', async () => {
    const storage = createMemoryStorage();
    const fixture = getEngineeringAcceptanceFixture('children-story-platform');
    expect(fixture).toBeDefined();

    const project = createMatrixProject(
      {
        name: fixture!.displayName,
        description: fixture!.buildContract.projectSummary,
        architectDraft: fixture!.architectDraft,
        blueprintDraft: fixture!.blueprintDraft,
        buildContract: fixture!.buildContract,
        capabilityResolution: fixture!.capabilityResolution,
        taskGraph: fixture!.taskGraph,
        validationStatus: 'pending',
        deploymentStatus: 'pending',
      },
      new Date('2026-07-21T00:03:00.000Z'),
      'fixture-project-save-restore'
    );

    await saveMatrixProject(project, [], {
      storage,
      supabaseClient: null,
      userId: 'fixture-user',
    });
    const loaded = await loadMatrixProjects({
      storage,
      supabaseClient: null,
      userId: 'fixture-user',
    });

    expect(loaded.projects[0]?.architectDraft?.id).toBe(
      fixture!.architectDraft.id
    );
    expect(loaded.projects[0]?.buildContract?.id).toBe(
      fixture!.buildContract.id
    );
    expect(loaded.projects[0]?.taskGraph?.tasks.length).toBe(
      fixture!.taskGraph.tasks.length
    );
  });
});
