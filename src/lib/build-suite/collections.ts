import {
  buildSuiteCatalog,
  findBuildSuiteItems,
  getAllBuildSuiteItems,
} from './catalog';
import type {
  BuildSuiteCatalog,
  BuildSuiteEnhancedItem,
  BuildSuiteSelection,
} from './types';

export interface BuildSuiteFeaturedCollection {
  id:
    | 'trending'
    | 'most-popular'
    | 'beginner'
    | 'best-saas'
    | 'best-mobile'
    | 'best-ai'
    | 'production-ready';
  label: string;
  description: string;
  badge: string;
}

export const featuredBuildSuiteCollections: BuildSuiteFeaturedCollection[] = [
  {
    id: 'trending',
    label: 'Trending',
    description: 'High-energy picks users reach for first.',
    badge: 'Hot',
  },
  {
    id: 'most-popular',
    label: 'Most Popular',
    description: 'Common choices with broad app coverage.',
    badge: 'Top',
  },
  {
    id: 'beginner',
    label: 'Recommended for Beginners',
    description: 'Lower-risk choices that generate cleanly.',
    badge: 'Easy',
  },
  {
    id: 'best-saas',
    label: 'Best for SaaS',
    description: 'Dense, polished product and dashboard choices.',
    badge: 'SaaS',
  },
  {
    id: 'best-mobile',
    label: 'Best for Mobile',
    description: 'Touch-friendly and Android-ready patterns.',
    badge: 'Mobile',
  },
  {
    id: 'best-ai',
    label: 'Best for AI Apps',
    description: 'Assistant, search, insight, and command interfaces.',
    badge: 'AI',
  },
  {
    id: 'production-ready',
    label: 'Production Ready',
    description: 'Stable patterns for serious app workflows.',
    badge: 'Ready',
  },
];

export function getSelectedBuildSuiteIds(selection: BuildSuiteSelection): string[] {
  return [
    selection.appTypeId,
    selection.paletteId,
    selection.styleId,
    selection.layoutId,
    selection.animationId,
    selection.mobileId,
    ...selection.componentIds,
    ...selection.aiFeatureIds,
    ...selection.integrationIds,
  ].filter((id): id is string => Boolean(id));
}

export function getBuildSuiteCollectionItems(
  collectionId: BuildSuiteFeaturedCollection['id'],
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuiteEnhancedItem[] {
  return getAllBuildSuiteItems(catalog)
    .filter((item) => item.featuredCollectionIds.includes(collectionId))
    .sort((a, b) => b.popularity - a.popularity || a.label.localeCompare(b.label));
}

export function getRelatedBuildSuiteItems(
  selection: BuildSuiteSelection,
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuiteEnhancedItem[] {
  const selectedIds = new Set(getSelectedBuildSuiteIds(selection));
  const selectedItems = findBuildSuiteItems(Array.from(selectedIds), catalog);
  const relatedIds = new Set<string>();

  for (const item of selectedItems) {
    for (const relatedId of item.relatedItemIds) {
      if (!selectedIds.has(relatedId)) relatedIds.add(relatedId);
    }
  }

  return findBuildSuiteItems(Array.from(relatedIds), catalog).sort(
    (a, b) => b.popularity - a.popularity || a.label.localeCompare(b.label)
  );
}
