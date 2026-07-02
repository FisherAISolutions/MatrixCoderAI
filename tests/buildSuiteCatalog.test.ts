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

  it('includes the expanded marketplace enhancement catalog', () => {
    const ids = getAllBuildSuiteItems().map((item) => item.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'accordions',
        'tabs',
        'drawers',
        'modals',
        'toasts',
        'pricing-tables',
        'command-palettes',
        'file-uploaders',
        'rich-text-editors',
        'chat-windows',
        'neo-brutalism',
        'skeuomorphic',
        'aurora',
        'minimal',
        'luxury',
        'fintech',
        'medical',
        'gaming',
        'admin-dashboard',
        'crm-layout',
        'analytics-layout',
        'ecommerce-layout',
        'documentation-layout',
        'knowledge-base-layout',
        'ide-layout',
        'kanban-workspace',
        'framer-motion-style',
        'scroll-reveal',
        'page-transitions',
        'confetti',
        'loading-skeletons',
        'shimmer',
        'lottie-support',
        'line-charts',
        'area-charts',
        'pie-charts',
        'bar-charts',
        'heatmaps',
        'treemaps',
        'sankey-charts',
        'radar-charts',
        'timeline-charts',
        'financial-charts',
        'stripe-ready',
        'clerk-ready',
        'firebase-ready',
        'supabase-ready',
        'openai-ready',
        'anthropic-ready',
        'gemini-ready',
        'resend-ready',
        'uploadthing-ready',
        'cloudinary-ready',
        'algolia-ready',
        'meilisearch-ready',
        'google-maps-ready',
        'twilio-ready',
      ])
    );
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
      'new-additions',
      'most-popular',
      'beginner',
      'best-saas',
      'best-mobile',
      'best-ai',
      'popular-dashboards',
      'popular-ecommerce',
      'popular-crm',
      'production-ready',
    ]);

    for (const collection of featuredBuildSuiteCollections) {
      expect(getBuildSuiteCollectionItems(collection.id).length).toBeGreaterThan(0);
    }
  });

  it('derives marketplace shelves for domain browsing', () => {
    expect(
      getBuildSuiteCollectionItems('popular-crm').map((item) => item.id)
    ).toEqual(expect.arrayContaining(['personal-crm', 'crm-layout']));
    expect(
      getBuildSuiteCollectionItems('popular-ecommerce').map((item) => item.id)
    ).toEqual(expect.arrayContaining(['ecommerce-layout', 'stripe-ready']));
    expect(
      getBuildSuiteCollectionItems('popular-dashboards').map((item) => item.id)
    ).toEqual(expect.arrayContaining(['saas-dashboard', 'charts-metrics']));
    expect(getBuildSuiteCollectionItems('new-additions').length).toBeGreaterThan(
      0
    );
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

  it('returns CRM marketplace recommendations from catalog metadata', () => {
    const selection: BuildSuiteSelection = {
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
      appTypeId: 'personal-crm',
    };

    expect(getRelatedBuildSuiteItems(selection).map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'data-tables',
        'search-filters',
        'kanban-board',
        'notifications',
      ])
    );
  });
});
