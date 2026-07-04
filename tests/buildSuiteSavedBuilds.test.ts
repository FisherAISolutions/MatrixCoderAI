import { describe, expect, it } from 'vitest';
import {
  BUILD_SUITE_SAVED_BUILDS_STORAGE_KEY,
  createBuildSuiteSavedBuild,
  deleteBuildSuiteSavedBuild,
  duplicateBuildSuiteSavedBuild,
  exportBuildSuiteSavedBuild,
  importBuildSuiteSavedBuild,
  loadBuildSuiteSavedBuilds,
  saveBuildSuiteSavedBuild,
  searchSortAndFilterBuildSuiteSavedBuilds,
  toggleBuildSuiteSavedBuildFavorite,
} from '@/lib/build-suite/savedBuilds';
import type { BuildSuiteAdvisorReport } from '@/lib/build-suite/advisor';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';
import { findBuildSuiteItems } from '@/lib/build-suite/catalog';

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

const selection: BuildSuiteSelection = {
  appTypeId: 'personal-crm',
  appearance: 'dark',
  paletteId: 'dark-matrix-green',
  styleId: 'quiet-saas',
  layoutId: 'sidebar-workspace',
  componentIds: ['data-tables'],
  aiFeatureIds: ['smart-summaries'],
  integrationIds: ['local-storage'],
  animationId: 'minimal-motion',
  mobileId: 'responsive-web',
};

function advisorReport(): BuildSuiteAdvisorReport {
  return {
    selectedItemCount: 1,
    sections: [
      {
        id: 'recommended-next',
        title: 'Recommended Next Enhancements',
        description: 'Next additions',
        recommendations: [
          {
            sectionId: 'recommended-next',
            item: findBuildSuiteItems(['search-bars'])[0],
            reason: 'CRM apps need search.',
            confidenceScore: 90,
            compatibilityScore: 85,
            estimatedImplementationImpact: 'medium',
          },
        ],
      },
    ],
  };
}

function savedBuild(name = 'CRM Build') {
  return createBuildSuiteSavedBuild(
    {
      name,
      selection,
      advisorReport: advisorReport(),
      finalPrompt: 'Build a complete CRM app.',
    },
    new Date('2026-07-02T12:00:00.000Z'),
    `id-${name.toLowerCase().replace(/\s+/g, '-')}`
  );
}

describe('Build Suite saved builds', () => {
  it('saves and loads using local fallback when Supabase is unavailable', async () => {
    const storage = new MemoryStorage();
    const build = savedBuild();

    const saved = await saveBuildSuiteSavedBuild(build, [], {
      storage,
      supabaseClient: null,
    });
    const loaded = await loadBuildSuiteSavedBuilds({
      storage,
      supabaseClient: null,
    });

    expect(saved.source).toBe('local');
    expect(loaded.source).toBe('local');
    expect(loaded.builds).toHaveLength(1);
    expect(loaded.builds[0].selection).toEqual(selection);
    expect(storage.getItem(BUILD_SUITE_SAVED_BUILDS_STORAGE_KEY)).toContain(
      'CRM Build'
    );
  });

  it('duplicates, favorites, and deletes a build', async () => {
    const storage = new MemoryStorage();
    const build = savedBuild();
    const duplicate = duplicateBuildSuiteSavedBuild(
      build,
      new Date('2026-07-03T12:00:00.000Z'),
      'copy-id'
    );
    const favorite = toggleBuildSuiteSavedBuildFavorite(duplicate);

    expect(duplicate.name).toBe('CRM Build Copy');
    expect(duplicate.id).toBe('copy-id');
    expect(favorite.favorite).toBe(true);

    const saved = await saveBuildSuiteSavedBuild(favorite, [build], {
      storage,
      supabaseClient: null,
    });
    const deleted = await deleteBuildSuiteSavedBuild('copy-id', saved.builds, {
      storage,
      supabaseClient: null,
    });

    expect(saved.builds.map((item) => item.id)).toContain('copy-id');
    expect(deleted.builds.map((item) => item.id)).not.toContain('copy-id');
  });

  it('exports and imports build JSON', () => {
    const build = savedBuild();
    const exported = exportBuildSuiteSavedBuild(build);
    const imported = importBuildSuiteSavedBuild(
      exported,
      new Date('2026-07-04T12:00:00.000Z'),
      'imported-id'
    );

    expect(imported.id).toBe('imported-id');
    expect(imported.name).toBe('CRM Build');
    expect(imported.selection).toEqual(selection);
    expect(imported.finalPrompt).toBe(build.finalPrompt);
  });

  it('searches, sorts, and filters saved builds', () => {
    const crm = savedBuild('CRM Build');
    const finance = {
      ...savedBuild('Expense Build'),
      favorite: true,
      selection: {
        ...selection,
        appTypeId: 'expense-tracker',
        appearance: 'light' as const,
        styleId: 'fintech',
      },
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-05T12:00:00.000Z',
    };

    expect(
      searchSortAndFilterBuildSuiteSavedBuilds([crm, finance], {
        query: 'expense',
        filters: { theme: 'light' },
      }).map((build) => build.name)
    ).toEqual(['Expense Build']);

    expect(
      searchSortAndFilterBuildSuiteSavedBuilds([crm, finance], {
        sort: 'favorites',
      }).map((build) => build.name)
    ).toEqual(['Expense Build', 'CRM Build']);
  });
});
