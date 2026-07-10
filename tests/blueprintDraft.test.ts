import { describe, expect, it } from 'vitest';
import { createBuildManifest } from '@/lib/build-suite/buildManifest';
import {
  MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY,
  readMatrixBuildSuiteChatHandoff,
  writeMatrixBuildSuiteChatHandoff,
} from '@/lib/build-suite/chatHandoff';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';
import {
  addBlueprintDataModel,
  addBlueprintListItem,
  addBlueprintRoute,
  buildBlueprintGenerationPrompt,
  createBlueprintDraftFromManifest,
  createBlueprintDraftPlanningContext,
  removeBlueprintRoute,
  reorderBlueprintRoutes,
  updateBlueprintDataModel,
  updateBlueprintListItem,
  updateBlueprintRoute,
  validateBlueprintDraft,
} from '@/lib/blueprint-studio/blueprintDraft';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const crmSelection: BuildSuiteSelection = {
  appTypeId: 'personal-crm',
  appearance: 'dark',
  paletteId: 'dark-matrix-green',
  styleId: 'quiet-saas',
  layoutId: 'sidebar-workspace',
  componentIds: ['data-tables', 'forms-crud'],
  aiFeatureIds: ['smart-summaries'],
  integrationIds: ['local-storage'],
  animationId: 'minimal-motion',
  mobileId: 'responsive-web',
};

describe('Blueprint Draft', () => {
  it('creates an editable draft from a Build Manifest without mutating the manifest', () => {
    const manifest = createBuildManifest({
      selection: crmSelection,
      now: new Date('2026-07-08T12:00:00.000Z'),
    });
    const draft = createBlueprintDraftFromManifest(
      manifest,
      new Date('2026-07-08T12:01:00.000Z')
    );

    expect(draft.projectName).toBe('Personal CRM');
    expect(draft.sourceManifest).toEqual(manifest);
    expect(draft.routes.map((route) => route.path)).toEqual(
      expect.arrayContaining(['/', '/contacts', '/companies', '/tasks', '/pipeline'])
    );
    expect(draft.dataModels.map((model) => model.name)).toEqual(
      expect.arrayContaining(['Contact', 'Company', 'Task', 'Deal'])
    );
    expect(manifest.selection.appTypeId).toBe('personal-crm');
  });

  it('supports editing routes, models, and component-like lists', () => {
    const draft = createBlueprintDraftFromManifest(null, new Date('2026-07-08T12:00:00.000Z'));
    const withRoute = addBlueprintRoute(draft, '/reports', new Date('2026-07-08T12:01:00.000Z'));
    const reportsRoute = withRoute.routes.find((route) => route.path === '/reports');
    expect(reportsRoute).toBeTruthy();

    const renamedRoute = updateBlueprintRoute(
      withRoute,
      reportsRoute!.id,
      { name: 'Reports Center', path: '/reports-center' },
      new Date('2026-07-08T12:02:00.000Z')
    );
    expect(renamedRoute.routes.some((route) => route.path === '/reports-center')).toBe(true);

    const movedRoute = reorderBlueprintRoutes(
      renamedRoute,
      reportsRoute!.id,
      -1,
      new Date('2026-07-08T12:03:00.000Z')
    );
    expect(movedRoute.routes.map((route) => route.path)).toContain('/reports-center');

    const removedRoute = removeBlueprintRoute(
      movedRoute,
      reportsRoute!.id,
      new Date('2026-07-08T12:04:00.000Z')
    );
    expect(removedRoute.routes.some((route) => route.path === '/reports-center')).toBe(false);

    const withModel = addBlueprintDataModel(
      removedRoute,
      'Invoice',
      ['number', 'status'],
      new Date('2026-07-08T12:05:00.000Z')
    );
    const invoice = withModel.dataModels.find((model) => model.name === 'Invoice');
    const updatedModel = updateBlueprintDataModel(
      withModel,
      invoice!.id,
      { fields: ['number', 'status', 'total'] },
      new Date('2026-07-08T12:06:00.000Z')
    );
    expect(updatedModel.dataModels.find((model) => model.name === 'Invoice')?.fields).toContain('total');

    const withComponent = addBlueprintListItem(
      updatedModel,
      'components',
      'Analytics Cards',
      new Date('2026-07-08T12:07:00.000Z')
    );
    const component = withComponent.components.find(
      (item) => item.name === 'Analytics Cards'
    );
    const updatedComponent = updateBlueprintListItem(
      withComponent,
      'components',
      component!.id,
      { description: 'Metric cards for the dashboard.' },
      new Date('2026-07-08T12:08:00.000Z')
    );
    expect(updatedComponent.components.find((item) => item.id === component!.id)?.description).toContain('Metric cards');
  });

  it('reports lightweight blueprint warnings', () => {
    const draft = createBlueprintDraftFromManifest(null);
    const edited = {
      ...draft,
      projectName: 'Analytics Dashboard',
      routes: [
        { id: 'route-empty', name: 'Empty', path: '' },
        { id: 'route-a', name: 'Reports', path: '/reports' },
        { id: 'route-b', name: 'Reports Again', path: '/reports' },
      ],
      integrations: [
        { id: 'integration-clerk', name: 'Clerk Auth' },
        { id: 'integration-stripe', name: 'Stripe' },
      ],
      dataModels: [{ id: 'model-report', name: 'Report', fields: ['name'] }],
    };

    const warningCodes = validateBlueprintDraft(edited).map(
      (warning) => warning.code
    );

    expect(warningCodes).toEqual(
      expect.arrayContaining([
        'empty-route',
        'duplicate-route',
        'missing-home-route',
        'missing-dashboard-route',
        'auth-without-user-model',
        'stripe-without-billing-model',
      ])
    );
  });

  it('builds prompt and planning context from the approved draft', () => {
    const draft = createBlueprintDraftFromManifest(null);
    const prompt = buildBlueprintGenerationPrompt(draft);
    const context = createBlueprintDraftPlanningContext(draft);

    expect(prompt).toContain('Build Matrix App from this approved Blueprint Draft.');
    expect(prompt).toContain('Routes:');
    expect(prompt).toContain('Keep app route page.tsx files as Server Components.');
    expect(context).toContain('Matrix Blueprint Draft');
    expect(context).toContain('authoritative planning context');
    expect(context).toContain('"projectName": "Matrix App"');
  });

  it('passes Blueprint Draft through chat handoff without removing fallback behavior', () => {
    const storage = new MemoryStorage();
    const manifest = createBuildManifest({ selection: crmSelection });
    const draft = createBlueprintDraftFromManifest(manifest);
    const prompt = buildBlueprintGenerationPrompt(draft);

    writeMatrixBuildSuiteChatHandoff(
      storage,
      prompt,
      new Date('2026-07-08T12:00:00.000Z'),
      manifest,
      draft
    );

    const handoff = readMatrixBuildSuiteChatHandoff(storage);

    expect(handoff?.prompt).toBe(prompt);
    expect(handoff?.buildManifest).toEqual(manifest);
    expect(handoff?.blueprintDraft).toEqual(draft);
    expect(storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY)).toBeNull();
  });

  it('keeps old chat handoff payloads valid when no Blueprint Draft exists', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY,
      JSON.stringify({
        source: 'matrix-build-suite',
        prompt: 'Build a small app',
        createdAt: '2026-07-08T12:00:00.000Z',
      })
    );

    const handoff = readMatrixBuildSuiteChatHandoff(storage);

    expect(handoff?.prompt).toBe('Build a small app');
    expect(handoff?.buildManifest).toBeUndefined();
    expect(handoff?.blueprintDraft).toBeUndefined();
  });
});
