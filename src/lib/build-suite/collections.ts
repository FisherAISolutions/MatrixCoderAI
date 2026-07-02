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
    | 'new-additions'
    | 'most-popular'
    | 'beginner'
    | 'best-saas'
    | 'best-mobile'
    | 'best-ai'
    | 'popular-dashboards'
    | 'popular-ecommerce'
    | 'popular-crm'
    | 'production-ready';
  label: string;
  description: string;
  badge: string;
}

export const featuredBuildSuiteCollections: BuildSuiteFeaturedCollection[] = [
  {
    id: 'trending',
    label: 'Trending This Week',
    description: 'High-energy picks users reach for first.',
    badge: 'Hot',
  },
  {
    id: 'new-additions',
    label: 'New Additions',
    description: 'Recently expanded marketplace patterns and integrations.',
    badge: 'New',
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
    id: 'popular-dashboards',
    label: 'Popular For Dashboards',
    description: 'Metrics, charts, tables, and operational surfaces.',
    badge: 'Dash',
  },
  {
    id: 'popular-ecommerce',
    label: 'Popular For Ecommerce',
    description: 'Commerce admin, product, order, and customer patterns.',
    badge: 'Shop',
  },
  {
    id: 'popular-crm',
    label: 'Popular For CRM',
    description: 'Contacts, pipeline, tasks, tables, and relationship workflows.',
    badge: 'CRM',
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

function hasMarketplaceSignal(
  item: BuildSuiteEnhancedItem,
  values: string[]
): boolean {
  const haystack = [
    item.id,
    item.label,
    item.category,
    item.description,
    ...item.tags,
    ...item.badges,
    ...item.recommendedFor,
    ...(item.compatibleWith?.appTypes ?? []),
  ]
    .join(' ')
    .toLowerCase();

  return values.some((value) => haystack.includes(value));
}

function isDerivedCollectionMatch(
  collectionId: BuildSuiteFeaturedCollection['id'],
  item: BuildSuiteEnhancedItem
): boolean {
  if (item.featuredCollectionIds.includes(collectionId)) return true;

  if (collectionId === 'new-additions') {
    return hasMarketplaceSignal(item, [
      'accordion',
      'drawer',
      'modal',
      'toast',
      'pricing',
      'command',
      'upload',
      'rich text',
      'cloudinary',
      'twilio',
      'lottie',
      'sankey',
      'radar',
    ]);
  }

  if (collectionId === 'popular-dashboards') {
    return hasMarketplaceSignal(item, [
      'dashboard',
      'analytics',
      'metrics',
      'charts',
      'table',
      'reports',
    ]);
  }

  if (collectionId === 'popular-ecommerce') {
    return hasMarketplaceSignal(item, [
      'ecommerce',
      'commerce',
      'products',
      'orders',
      'customers',
      'stripe',
      'cloudinary',
    ]);
  }

  if (collectionId === 'popular-crm') {
    return hasMarketplaceSignal(item, [
      'crm',
      'contacts',
      'companies',
      'pipeline',
      'tasks',
      'kanban',
      'notifications',
    ]);
  }

  return false;
}

export function getBuildSuiteCollectionItems(
  collectionId: BuildSuiteFeaturedCollection['id'],
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuiteEnhancedItem[] {
  return getAllBuildSuiteItems(catalog)
    .filter((item) => isDerivedCollectionMatch(collectionId, item))
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
