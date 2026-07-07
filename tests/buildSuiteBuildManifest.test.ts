import { describe, expect, it } from 'vitest';
import {
  BUILD_MANIFEST_SCHEMA_VERSION,
  createBuildManifest,
  createBuildManifestPlanningContext,
  deserializeBuildManifest,
  serializeBuildManifest,
} from '@/lib/build-suite/buildManifest';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';

const selection: BuildSuiteSelection = {
  appTypeId: 'personal-crm',
  appearance: 'dark',
  paletteId: 'dark-matrix-green',
  styleId: 'quiet-saas',
  layoutId: 'sidebar-workspace',
  componentIds: ['data-tables', 'charts-metrics', 'forms-crud'],
  aiFeatureIds: ['smart-summaries'],
  integrationIds: ['local-storage'],
  animationId: 'minimal-motion',
  mobileId: 'responsive-web',
};

describe('Build Manifest', () => {
  it('creates a typed manifest from Build Suite selections', () => {
    const manifest = createBuildManifest({
      selection,
      templateId: 'personal-crm-template',
      now: new Date('2026-07-07T12:00:00.000Z'),
    });

    expect(manifest.schemaVersion).toBe(BUILD_MANIFEST_SCHEMA_VERSION);
    expect(manifest.source).toBe('template');
    expect(manifest.createdAt).toBe('2026-07-07T12:00:00.000Z');
    expect(manifest.templateId).toBe('personal-crm-template');
    expect(manifest.appType?.id).toBe('personal-crm');
    expect(manifest.appearance).toBe('dark');
    expect(manifest.colorPalette?.id).toBe('dark-matrix-green');
    expect(manifest.uiStyle?.id).toBe('quiet-saas');
    expect(manifest.layout?.id).toBe('sidebar-workspace');
    expect(manifest.navigation.inferredPattern).toBe('sidebar');
    expect(manifest.components.map((item) => item.id)).toEqual(
      expect.arrayContaining(['data-tables', 'charts-metrics', 'forms-crud'])
    );
    expect(manifest.charts.map((item) => item.id)).toContain('charts-metrics');
    expect(manifest.forms.map((item) => item.id)).toContain('forms-crud');
    expect(manifest.tables.map((item) => item.id)).toContain('data-tables');
    expect(manifest.aiFeatures.map((item) => item.id)).toContain(
      'smart-summaries'
    );
    expect(manifest.integrations.map((item) => item.id)).toContain(
      'local-storage'
    );
    expect(manifest.animations?.id).toBe('minimal-motion');
    expect(manifest.mobileFeatures?.id).toBe('responsive-web');
    expect(manifest.advisorRecommendations.length).toBeGreaterThan(0);
  });

  it('serializes and deserializes valid manifests', () => {
    const manifest = createBuildManifest({ selection });
    const serialized = serializeBuildManifest(manifest);

    expect(deserializeBuildManifest(serialized)).toEqual(manifest);
  });

  it('rejects invalid serialized manifests', () => {
    expect(deserializeBuildManifest('not json')).toBeNull();
    expect(
      deserializeBuildManifest(JSON.stringify({ schemaVersion: 999 }))
    ).toBeNull();
  });

  it('renders a planning context that marks the manifest authoritative', () => {
    const manifest = createBuildManifest({ selection });
    const context = createBuildManifestPlanningContext(manifest);

    expect(context).toContain('Matrix Build Suite Manifest');
    expect(context).toContain('authoritative configuration for planning');
    expect(context).toContain('"appTypeId": "personal-crm"');
    expect(context).toContain('"layoutId": "sidebar-workspace"');
  });
});
