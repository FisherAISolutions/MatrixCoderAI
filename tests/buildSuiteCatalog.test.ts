import { describe, expect, it } from 'vitest';
import {
  buildSuiteCatalog,
  buildSuiteCatalogOrder,
  getAllBuildSuiteItems,
} from '@/lib/build-suite/catalog';
import {
  featuredBuildSuiteCollections,
  getBuildSuiteCollectionItems,
  getRelatedBuildSuiteItems,
} from '@/lib/build-suite/collections';
import { filterPalettesByAppearance } from '@/lib/build-suite/palettes';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';

describe('build suite catalog', () => {
  it('contains valid catalog items in every category', () => {
    for (const key of buildSuiteCatalogOrder) {
      const items = buildSuiteCatalog[key];
      expect(items.length, `${key} should have starter items`).toBeGreaterThan(0);

      for (const item of items) {
        expect(item.id).toMatch(/^[a-z0-9-]+$/);
        expect(item.label.trim()).not.toBe('');
        expect(item.category.trim()).not.toBe('');
        expect(item.description.trim()).not.toBe('');
        expect(item.promptInstruction.trim()).not.toBe('');
        expect(item.tags.length).toBeGreaterThan(0);
        expect(item.icon).toBeTruthy();
        expect(item.accentColor).toBeTruthy();
        expect(item.previewType).toBeTruthy();
        expect(item.popularity).toBeGreaterThanOrEqual(1);
        expect(item.popularity).toBeLessThanOrEqual(5);
        expect(item.difficulty).toMatch(/^(easy|medium|advanced)$/);
        expect(item.estimatedGenerationImpact).toMatch(/^(low|medium|high)$/);
      }
    }
  });

  it('keeps item ids unique across the full catalog', () => {
    const ids = getAllBuildSuiteItems().map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('filters color palettes by selected appearance', () => {
    const lightPalettes = filterPalettesByAppearance('light');
    const darkPalettes = filterPalettesByAppearance('dark');

    expect(lightPalettes.length).toBeGreaterThan(0);
    expect(darkPalettes.length).toBeGreaterThan(0);
    expect(lightPalettes.every((item) => item.category === 'Light')).toBe(true);
    expect(darkPalettes.every((item) => item.category === 'Dark')).toBe(true);
    expect(lightPalettes.map((item) => item.id)).not.toContain('dark-matrix-green');
    expect(darkPalettes.map((item) => item.id)).not.toContain('light-saas-blue');
  });

  it('defines featured collections with matching catalog items', () => {
    expect(featuredBuildSuiteCollections.map((collection) => collection.id)).toEqual([
      'trending',
      'most-popular',
      'beginner',
      'best-saas',
      'best-mobile',
      'best-ai',
      'production-ready',
    ]);

    for (const collection of featuredBuildSuiteCollections) {
      expect(getBuildSuiteCollectionItems(collection.id).length).toBeGreaterThan(0);
    }
  });

  it('returns data-driven recommendations from selected enhancement metadata', () => {
    const selection: BuildSuiteSelection = {
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
      styleId: 'glassmorphism',
    };

    expect(getRelatedBuildSuiteItems(selection).map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'floating-cards',
        'blur-navigation',
        'soft-shadows',
        'animated-gradients',
      ])
    );
  });
});
