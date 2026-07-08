import { describe, expect, it } from 'vitest';
import {
  createBlueprintSummary,
  readBuildManifestFromHandoffStorage,
} from '@/lib/build-suite/blueprintSummary';
import {
  createBuildManifest,
  serializeBuildManifest,
} from '@/lib/build-suite/buildManifest';
import { MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY } from '@/lib/build-suite/chatHandoff';
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

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  };
}

describe('Build Suite blueprint summary', () => {
  it('summarizes a Build Manifest into blueprint groups', () => {
    const manifest = createBuildManifest({
      selection,
      now: new Date('2026-07-07T12:00:00.000Z'),
    });
    const summary = createBlueprintSummary(manifest);

    expect(summary.appName).toBe('Personal CRM');
    expect(summary.createdAt).toBe('2026-07-07T12:00:00.000Z');
    expect(summary.groups.map((group) => group.title)).toEqual(
      expect.arrayContaining([
        'App blueprint',
        'Routes',
        'Data models',
        'Components',
        'Integrations',
        'User flows',
        'Folder structure',
      ])
    );
    expect(
      summary.groups.find((group) => group.title === 'Routes')?.items
    ).toContain('sidebar navigation');
  });

  it('reads a manifest from chat handoff storage without consuming it', () => {
    const manifest = createBuildManifest({ selection });
    const raw = JSON.stringify({
      source: 'matrix-build-suite',
      prompt: 'Build a CRM',
      createdAt: '2026-07-07T12:00:00.000Z',
      buildManifest: JSON.parse(serializeBuildManifest(manifest)),
    });
    const storage = createMemoryStorage({
      [MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY]: raw,
    });

    expect(readBuildManifestFromHandoffStorage(storage)?.appType?.id).toBe(
      'personal-crm'
    );
    expect(storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY)).toBe(raw);
  });

  it('returns null for missing or malformed handoff data', () => {
    expect(readBuildManifestFromHandoffStorage(createMemoryStorage())).toBeNull();
    expect(
      readBuildManifestFromHandoffStorage(
        createMemoryStorage({
          [MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY]: '{ bad json',
        })
      )
    ).toBeNull();
  });
});
