import { describe, expect, it } from 'vitest';
import {
  buildSuiteCatalog,
  buildSuiteCatalogOrder,
  getAllBuildSuiteItems,
} from '@/lib/build-suite/catalog';
import { filterPalettesByAppearance } from '@/lib/build-suite/palettes';

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
});
