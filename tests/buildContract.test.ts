import { describe, expect, it } from 'vitest';

import type { BuildManifest } from '@/lib/build-suite/buildManifest';
import {
  createBlueprintDraftFromArchitectDraft,
} from '@/lib/matrix-ai-architect';
import { updateBlueprintRoute } from '@/lib/blueprint-studio/blueprintDraft';
import {
  createArchitectDraft,
  updateArchitectAnswer,
} from '@/lib/matrix-ai-architect';
import {
  createBuildContract,
  deserializeBuildContract,
  serializeBuildContract,
  stableRequirementId,
} from '@/lib/build-contract';
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

function manifest(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return {
    schemaVersion: 1,
    metadataVersion: '2026-07-07',
    source: 'manual',
    createdAt: '2026-07-20T00:00:00.000Z',
    selection: {
      appTypeId: 'crm',
      appearance: 'dark',
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
    },
    appType: {
      id: 'crm',
      label: 'Personal CRM',
      category: 'app-type',
      tags: ['crm'],
      promptInstruction: 'Build a CRM.',
    },
    appearance: 'dark',
    colorPalette: {
      id: 'emerald',
      label: 'Emerald',
      category: 'palette',
      tags: ['dark'],
      promptInstruction: 'Use emerald accents.',
    },
    uiStyle: {
      id: 'saas',
      label: 'SaaS',
      category: 'style',
      tags: ['professional'],
      promptInstruction: 'Use a SaaS interface.',
    },
    layout: {
      id: 'dashboard',
      label: 'Dashboard',
      category: 'layout',
      tags: ['dashboard'],
      promptInstruction: 'Use dashboard layout.',
    },
    navigation: {
      inferredPattern: 'dashboard',
      routeStrategy: 'domain-inferred',
    },
    components: [],
    charts: [],
    forms: [],
    tables: [],
    aiFeatures: [],
    integrations: [],
    advisorRecommendations: [],
    ...overrides,
  };
}

function crmArchitectDraft() {
  let draft = createArchitectDraft({
    projectId: 'project-1',
    projectName: 'Founder CRM',
    now: new Date('2026-07-20T00:00:00.000Z'),
  });
  draft = updateArchitectAnswer(
    draft,
    'appIdea',
    'Build a personal CRM for contacts, companies, tasks, and pipeline.',
    new Date('2026-07-20T00:01:00.000Z')
  );
  draft = updateArchitectAnswer(
    draft,
    'crm',
    true,
    new Date('2026-07-20T00:02:00.000Z')
  );
  draft = updateArchitectAnswer(
    draft,
    'accountsRequired',
    true,
    new Date('2026-07-20T00:03:00.000Z')
  );
  return draft;
}

describe('Build Contract foundation', () => {
  it('creates a versioned contract from structured planning sources', () => {
    const architectDraft = crmArchitectDraft();
    const blueprintDraft = createBlueprintDraftFromArchitectDraft(
      architectDraft,
      new Date('2026-07-20T00:04:00.000Z')
    );

    const contract = createBuildContract({
      projectId: 'project-1',
      projectName: 'Founder CRM',
      architectDraft,
      buildManifest: manifest(),
      blueprintDraft,
      now: new Date('2026-07-20T00:05:00.000Z'),
    });

    expect(contract.schemaVersion).toBe(1);
    expect(contract.project.projectId).toBe('project-1');
    expect(contract.targetFramework).toBe('Next.js 15 App Router');
    expect(contract.routes.map((route) => route.path)).toEqual(
      expect.arrayContaining(['/', '/contacts', '/companies', '/tasks', '/pipeline'])
    );
    expect(contract.requirements.some((item) => item.type === 'route')).toBe(true);
    expect(contract.requirements.every((item) => item.completionStatus === 'pending')).toBe(true);
  });

  it('uses stable requirement ids', () => {
    expect(stableRequirementId('route', '/contacts')).toBe('req-route-contacts');
    expect(stableRequirementId('route', '/contacts')).toBe(
      stableRequirementId('route', 'contacts')
    );
  });

  it('keeps newest Blueprint decisions ahead of Architect and Manifest defaults', () => {
    const architectDraft = crmArchitectDraft();
    let blueprintDraft = createBlueprintDraftFromArchitectDraft(
      architectDraft,
      new Date('2026-07-20T00:04:00.000Z')
    );
    const contactsRoute = blueprintDraft.routes.find((route) => route.path === '/contacts');
    expect(contactsRoute).toBeTruthy();
    blueprintDraft = updateBlueprintRoute(
      blueprintDraft,
      contactsRoute!.id,
      {
        name: 'Approved Accounts',
        description: 'Newest explicit blueprint decision.',
      },
      new Date('2026-07-20T00:05:00.000Z')
    );

    const contract = createBuildContract({
      architectDraft,
      buildManifest: manifest(),
      blueprintDraft,
      now: new Date('2026-07-20T00:06:00.000Z'),
    });

    expect(contract.routes.find((route) => route.path === '/contacts')).toMatchObject({
      label: 'Approved Accounts',
      purpose: 'Newest explicit blueprint decision.',
      source: 'blueprint',
    });
  });

  it('marks secondary Architect routes as optional while keeping primary routes required', () => {
    let architectDraft = createArchitectDraft({
      projectName: 'FitTrack',
      now: new Date('2026-07-20T00:00:00.000Z'),
    });
    architectDraft = updateArchitectAnswer(
      architectDraft,
      'appIdea',
      'Build a fitness tracker with workouts, nutrition, progress, goals, and analytics.',
      new Date('2026-07-20T00:01:00.000Z')
    );

    const contract = createBuildContract({
      architectDraft,
      buildManifest: manifest({
        selection: {
          appTypeId: 'fitness',
          componentIds: [],
          aiFeatureIds: [],
          integrationIds: [],
        },
        appType: {
          id: 'fitness',
          label: 'Fitness Tracker',
          category: 'app-type',
          tags: ['fitness'],
          promptInstruction: 'Build a fitness tracker.',
        },
      }),
      now: new Date('2026-07-20T00:02:00.000Z'),
    });

    const routeRequirements = new Map(
      contract.requirements
        .filter((item) => item.type === 'route')
        .map((item) => [item.evidenceReferences[0]?.ref, item.status])
    );

    expect(routeRequirements.get('/workouts')).toBe('required');
    expect(routeRequirements.get('/nutrition')).toBe('optional');
  });

  it('reflects free-first budget choices in constraints', () => {
    const architectDraft = updateArchitectAnswer(
      createArchitectDraft({ now: new Date('2026-07-20T00:00:00.000Z') }),
      'investmentLevel',
      'free-first',
      new Date('2026-07-20T00:01:00.000Z')
    );

    const contract = createBuildContract({ architectDraft });

    expect(contract.constraints.join(' ')).toMatch(/free-tier|local-first/i);
    expect(contract.constraints.join(' ')).toMatch(/Avoid paid-only defaults/i);
  });

  it('does not mutate the Build Manifest while deriving a contract', () => {
    const sourceManifest = manifest();
    const before = JSON.stringify(sourceManifest);

    createBuildContract({
      architectDraft: crmArchitectDraft(),
      buildManifest: sourceManifest,
    });

    expect(JSON.stringify(sourceManifest)).toBe(before);
  });

  it('serializes through existing project save and restore', async () => {
    const storage = createMemoryStorage();
    const buildContract = createBuildContract({
      projectId: 'project-1',
      architectDraft: crmArchitectDraft(),
      buildManifest: manifest(),
      now: new Date('2026-07-20T00:05:00.000Z'),
    });
    const project = createMatrixProject(
      {
        name: 'Contract Project',
        buildContract,
      },
      new Date('2026-07-20T00:06:00.000Z'),
      'project-1'
    );

    await saveMatrixProject(project, [], {
      storage,
      supabaseClient: null,
    });
    const loaded = await loadMatrixProjects({
      storage,
      supabaseClient: null,
    });

    expect(loaded.projects[0]?.buildContract?.id).toBe(buildContract.id);
    expect(loaded.projects[0]?.buildContract?.requirements.length).toBeGreaterThan(0);
  });

  it('keeps older projects compatible when no Build Contract exists', async () => {
    const storage = createMemoryStorage();
    const oldProject = {
      id: 'older-project',
      name: 'Older Project',
      description: '',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      favorite: false,
      saveVersion: 1,
      files: [],
      chatMessages: [],
      validationStatus: 'unknown',
      deploymentStatus: 'unknown',
      metadataVersion: 2,
    };
    storage.setItem(
      'matrix-coder:projects:v2:anonymous',
      JSON.stringify({
        version: 2,
        userId: 'anonymous',
        savedAt: '2026-07-01T00:00:00.000Z',
        projects: [oldProject],
      })
    );

    const loaded = await loadMatrixProjects({
      storage,
      supabaseClient: null,
    });

    expect(loaded.projects[0]?.id).toBe('older-project');
    expect(loaded.projects[0]?.buildContract).toBeUndefined();
  });

  it('recovers from malformed optional contract data', () => {
    const contract = createBuildContract({
      architectDraft: crmArchitectDraft(),
      buildManifest: manifest(),
    });
    const raw = JSON.parse(serializeBuildContract(contract));
    raw.integrations = 'not-an-array';
    raw.aiCapabilities = null;
    raw.requirements = [{ stableId: 'bad' }];

    const restored = deserializeBuildContract(JSON.stringify(raw));

    expect(restored?.integrations).toEqual([]);
    expect(restored?.aiCapabilities).toEqual([]);
    expect(restored?.requirements).toEqual([]);
  });
});
