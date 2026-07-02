import {
  buildSuiteCatalog,
  buildSuiteCatalogOrder,
  findBuildSuiteItems,
  getAllBuildSuiteItems,
} from './catalog';
import type {
  BuildSuiteCatalog,
  BuildSuiteEnhancedItem,
  BuildSuiteGenerationImpact,
  BuildSuiteSelection,
} from './types';

export type BuildSuiteAdvisorSectionId =
  | 'recommended-next'
  | 'missing-core'
  | 'nice-to-have'
  | 'ux-improvements'
  | 'performance-improvements'
  | 'security-recommendations'
  | 'mobile-recommendations'
  | 'accessibility-recommendations'
  | 'ai-feature-suggestions';

export interface BuildSuiteAdvisorRecommendation {
  sectionId: BuildSuiteAdvisorSectionId;
  item: BuildSuiteEnhancedItem;
  reason: string;
  confidenceScore: number;
  compatibilityScore: number;
  estimatedImplementationImpact: BuildSuiteGenerationImpact;
}

export interface BuildSuiteAdvisorSection {
  id: BuildSuiteAdvisorSectionId;
  title: string;
  description: string;
  recommendations: BuildSuiteAdvisorRecommendation[];
}

export interface BuildSuiteAdvisorReport {
  selectedItemCount: number;
  sections: BuildSuiteAdvisorSection[];
}

interface AdvisorSectionRule {
  id: BuildSuiteAdvisorSectionId;
  title: string;
  description: string;
  keywords: string[];
  maxItems: number;
}

const SECTION_RULES: AdvisorSectionRule[] = [
  {
    id: 'recommended-next',
    title: 'Recommended Next Enhancements',
    description: 'The highest-confidence next additions for the current build.',
    keywords: [],
    maxItems: 24,
  },
  {
    id: 'missing-core',
    title: 'Missing Core Features',
    description: 'Foundational pieces that usually make this app type feel complete.',
    keywords: [
      'table',
      'data',
      'forms',
      'crud',
      'search',
      'filters',
      'charts',
      'metrics',
      'calendar',
      'kanban',
      'storage',
      'persistence',
      'auth',
      'navigation',
    ],
    maxItems: 24,
  },
  {
    id: 'nice-to-have',
    title: 'Nice-to-Have Features',
    description: 'Polish and depth that can make the build feel more complete.',
    keywords: [
      'premium',
      'popular',
      'timeline',
      'ratings',
      'reviews',
      'export',
      'notifications',
      'pricing',
      'testimonials',
      'faq',
      'carousel',
      'media',
      'upload',
    ],
    maxItems: 24,
  },
  {
    id: 'ux-improvements',
    title: 'UX Improvements',
    description: 'Interface patterns that improve scanning, navigation, and feedback.',
    keywords: [
      'navigation',
      'tabs',
      'drawer',
      'modal',
      'toast',
      'surface',
      'cards',
      'forms',
      'feedback',
      'command',
      'search',
      'layout',
      'empty-states',
    ],
    maxItems: 24,
  },
  {
    id: 'performance-improvements',
    title: 'Performance Improvements',
    description: 'Lightweight states and structure that keep generated apps feeling fast.',
    keywords: [
      'loading',
      'skeleton',
      'shimmer',
      'responsive',
      'api-ready',
      'mock-data',
      'helpers',
      'export',
      'low',
    ],
    maxItems: 24,
  },
  {
    id: 'security-recommendations',
    title: 'Security Recommendations',
    description: 'Safe auth and protected-area planning without adding live backend calls.',
    keywords: [
      'auth',
      'clerk',
      'users',
      'user-menu',
      'protected',
      'supabase',
      'database',
      'roles',
      'security',
    ],
    maxItems: 24,
  },
  {
    id: 'mobile-recommendations',
    title: 'Mobile Recommendations',
    description: 'Touch-friendly and Android-ready additions for smaller screens.',
    keywords: [
      'mobile',
      'touch',
      'android',
      'capacitor',
      'responsive',
      'bottom',
      'tabs',
      'stacked',
    ],
    maxItems: 24,
  },
  {
    id: 'accessibility-recommendations',
    title: 'Accessibility Recommendations',
    description: 'Interaction patterns that encourage labels, focus states, and clear controls.',
    keywords: [
      'accessible',
      'keyboard',
      'labels',
      'focus',
      'forms',
      'navigation',
      'tabs',
      'accordion',
      'modal',
      'dialog',
      'empty-states',
    ],
    maxItems: 24,
  },
  {
    id: 'ai-feature-suggestions',
    title: 'AI Feature Suggestions',
    description: 'AI-ready surfaces and assistant patterns that stay local until wired later.',
    keywords: [
      'ai',
      'assistant',
      'summary',
      'summaries',
      'recommendations',
      'natural-language',
      'chat',
      'openai',
      'anthropic',
      'gemini',
      'drafting',
    ],
    maxItems: 24,
  },
];

const DOMAIN_SIGNAL_RULES: Array<{
  match: string[];
  signals: string[];
}> = [
  {
    match: ['crm', 'contacts', 'pipeline', 'relationship'],
    signals: [
      'table',
      'search',
      'filter',
      'kanban',
      'notifications',
      'auth',
      'email',
      'timeline',
      'analytics',
      'forms',
    ],
  },
  {
    match: ['fitness', 'workout', 'progress', 'goals', 'health'],
    signals: [
      'auth',
      'profile',
      'notifications',
      'charts',
      'progress',
      'mobile',
      'ai',
      'assistant',
      'coach',
      'summary',
      'summaries',
      'recommendations',
      'calendar',
      'storage',
    ],
  },
  {
    match: ['ecommerce', 'commerce', 'products', 'orders', 'customers'],
    signals: [
      'stripe',
      'payments',
      'inventory',
      'ratings',
      'reviews',
      'rating',
      'pricing',
      'media',
      'image',
      'cloudinary',
      'search',
      'data',
      'tables',
      'admin',
      'upload',
    ],
  },
  {
    match: ['expense', 'finance', 'budget', 'transactions', 'spending'],
    signals: [
      'forms',
      'crud',
      'charts',
      'financial',
      'csv',
      'tables',
      'search',
      'storage',
      'reports',
    ],
  },
  {
    match: ['inventory', 'stock', 'suppliers', 'operations'],
    signals: [
      'tables',
      'forms',
      'search',
      'csv',
      'notifications',
      'api',
      'admin',
      'barcode',
      'reports',
    ],
  },
  {
    match: ['booking', 'schedule', 'appointments', 'calendar'],
    signals: [
      'calendar',
      'notifications',
      'email',
      'mobile',
      'auth',
      'forms',
      'timeline',
    ],
  },
  {
    match: ['saas', 'analytics', 'dashboard', 'metrics'],
    signals: [
      'charts',
      'tables',
      'auth',
      'stripe',
      'analytics',
      'loading',
      'search',
      'ai',
      'reports',
    ],
  },
  {
    match: ['habit', 'wellness', 'today', 'stats'],
    signals: [
      'mobile',
      'charts',
      'notifications',
      'confetti',
      'heatmap',
      'storage',
      'calendar',
      'progress',
    ],
  },
];

const IMPACT_WEIGHT: Record<BuildSuiteGenerationImpact, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function getSelectedBuildSuiteItemIds(
  selection: BuildSuiteSelection
): string[] {
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

function itemText(item: BuildSuiteEnhancedItem): string {
  return [
    item.id,
    item.label,
    item.category,
    item.description,
    item.promptInstruction,
    ...item.tags,
    ...item.badges,
    ...item.recommendedFor,
    ...(item.compatibleWith?.appTypes ?? []),
    ...(item.compatibleWith?.categories ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function selectedProfileTerms(selectedItems: BuildSuiteEnhancedItem[]): string[] {
  const baseTerms = selectedItems.flatMap((item) => [
    item.id,
    item.label,
    item.category,
    ...item.tags,
    ...item.badges,
    ...item.recommendedFor,
    ...(item.compatibleWith?.appTypes ?? []),
  ]);
  const baseText = baseTerms.join(' ').toLowerCase();
  const inferredTerms = DOMAIN_SIGNAL_RULES.flatMap((rule) =>
    rule.match.some((term) => baseText.includes(term)) ? rule.signals : []
  );

  return unique([...baseTerms, ...inferredTerms]).map((term) =>
    term.toLowerCase()
  );
}

function countKeywordMatches(text: string, keywords: string[]): number {
  return keywords.reduce(
    (count, keyword) => count + (text.includes(keyword.toLowerCase()) ? 1 : 0),
    0
  );
}

function isRelatedCandidate(
  candidate: BuildSuiteEnhancedItem,
  selectedItems: BuildSuiteEnhancedItem[]
): boolean {
  const selectedIds = new Set(selectedItems.map((item) => item.id));
  return (
    selectedItems.some((item) => item.relatedItemIds.includes(candidate.id)) ||
    candidate.relatedItemIds.some((id) => selectedIds.has(id))
  );
}

function hasProfileAppTypeAffinity(
  candidate: BuildSuiteEnhancedItem,
  profileTerms: string[]
): boolean {
  return (candidate.compatibleWith?.appTypes ?? []).some((appType) => {
    const normalizedAppType = appType.replace(/-/g, ' ');
    return profileTerms.some(
      (term) =>
        normalizedAppType.includes(term) ||
        appType.includes(term) ||
        term.includes(appType)
    );
  });
}

function compatibilityScoreFor(
  candidate: BuildSuiteEnhancedItem,
  selectedItems: BuildSuiteEnhancedItem[],
  profileTerms: string[]
): number {
  const selectedAppType = selectedItems.find((item) =>
    buildSuiteCatalog.appTypes.some((candidateApp) => candidateApp.id === item.id)
  );
  const compatibleAppTypes = candidate.compatibleWith?.appTypes ?? [];
  const text = itemText(candidate);
  const relatedIds = new Set(selectedItems.flatMap((item) => item.relatedItemIds));
  const selectedIds = new Set(selectedItems.map((item) => item.id));

  let score = 18;

  if (selectedAppType && compatibleAppTypes.includes(selectedAppType.id)) {
    score += 42;
  } else if (hasProfileAppTypeAffinity(candidate, profileTerms)) {
    score += 30;
  } else if (!compatibleAppTypes.length) {
    score += 10;
  }

  if (relatedIds.has(candidate.id)) score += 28;
  if (candidate.relatedItemIds.some((id) => selectedIds.has(id))) score += 12;

  score += Math.min(countKeywordMatches(text, profileTerms) * 6, 24);
  score += Math.min(candidate.popularity * 3, 15);

  return Math.min(100, Math.round(score));
}

function groupAffinityScore(
  candidate: BuildSuiteEnhancedItem,
  rule: AdvisorSectionRule,
  selectedItems: BuildSuiteEnhancedItem[],
  profileTerms: string[]
): number {
  const text = itemText(candidate);
  const relatedBoost = isRelatedCandidate(candidate, selectedItems) ? 26 : 0;

  if (rule.id === 'recommended-next') {
    return Math.min(
      100,
      45 + relatedBoost + countKeywordMatches(text, profileTerms) * 8
    );
  }

  const ruleMatches = countKeywordMatches(text, rule.keywords);
  const profileMatches = countKeywordMatches(text, profileTerms);
  return Math.min(100, relatedBoost + ruleMatches * 28 + profileMatches * 6);
}

function isConflicting(
  candidate: BuildSuiteEnhancedItem,
  selectedItems: BuildSuiteEnhancedItem[]
): boolean {
  const selectedIds = selectedItems.map((item) => item.id);
  return (
    candidate.conflictsWith?.some((id) => selectedIds.includes(id)) ||
    selectedItems.some((item) => item.conflictsWith?.includes(candidate.id))
  );
}

function reasonFor(
  candidate: BuildSuiteEnhancedItem,
  rule: AdvisorSectionRule,
  selectedItems: BuildSuiteEnhancedItem[],
  compatibilityScore: number
): string {
  const relatedSource = selectedItems.find((item) =>
    item.relatedItemIds.includes(candidate.id)
  );
  const selectedAppType = selectedItems.find((item) =>
    buildSuiteCatalog.appTypes.some((candidateApp) => candidateApp.id === item.id)
  );

  if (relatedSource) {
    return `${candidate.label} pairs naturally with ${relatedSource.label}.`;
  }
  if (
    selectedAppType &&
    candidate.compatibleWith?.appTypes?.includes(selectedAppType.id)
  ) {
    return `${candidate.label} is marked compatible with ${selectedAppType.label}.`;
  }
  if (rule.id === 'missing-core') {
    return `${candidate.label} covers a common core capability for this kind of app.`;
  }
  if (rule.id === 'recommended-next' && compatibilityScore >= 70) {
    return `${candidate.label} matches the current build's selected app type and metadata.`;
  }
  return `${candidate.label} matches this advisor category through its tags, use cases, and catalog metadata.`;
}

function recommendationFor(
  candidate: BuildSuiteEnhancedItem,
  rule: AdvisorSectionRule,
  selectedItems: BuildSuiteEnhancedItem[],
  profileTerms: string[]
): BuildSuiteAdvisorRecommendation | undefined {
  const groupScore = groupAffinityScore(candidate, rule, selectedItems, profileTerms);
  if (rule.id !== 'recommended-next' && groupScore < 18) return undefined;

  const compatibilityScore = compatibilityScoreFor(
    candidate,
    selectedItems,
    profileTerms
  );
  if (compatibilityScore < 34) return undefined;

  const confidenceScore = Math.min(
    100,
    Math.round(
      compatibilityScore * 0.55 +
        groupScore * 0.3 +
        candidate.popularity * 3 +
        IMPACT_WEIGHT[candidate.estimatedGenerationImpact] * 3 +
        (isRelatedCandidate(candidate, selectedItems) ? 10 : 0)
    )
  );

  if (confidenceScore < 42) return undefined;

  return {
    sectionId: rule.id,
    item: candidate,
    reason: reasonFor(candidate, rule, selectedItems, compatibilityScore),
    confidenceScore,
    compatibilityScore,
    estimatedImplementationImpact: candidate.estimatedGenerationImpact,
  };
}

export function getBuildSuiteAdvisorReport(
  selection: BuildSuiteSelection,
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuiteAdvisorReport {
  const selectedIds = getSelectedBuildSuiteItemIds(selection);
  const selectedIdSet = new Set(selectedIds);
  const selectedItems = findBuildSuiteItems(selectedIds, catalog);
  const profileTerms = selectedProfileTerms(selectedItems);

  const candidates = getAllBuildSuiteItems(catalog).filter(
    (item) => !selectedIdSet.has(item.id) && !isConflicting(item, selectedItems)
  );

  const sections = SECTION_RULES.map((rule) => {
    const recommendations = candidates
      .map((candidate) =>
        recommendationFor(candidate, rule, selectedItems, profileTerms)
      )
      .filter(
        (
          recommendation
        ): recommendation is BuildSuiteAdvisorRecommendation =>
          Boolean(recommendation)
      )
      .sort(
        (a, b) =>
          b.confidenceScore - a.confidenceScore ||
          b.compatibilityScore - a.compatibilityScore ||
          b.item.popularity - a.item.popularity ||
          a.item.label.localeCompare(b.item.label)
      )
      .slice(0, rule.maxItems);

    return {
      id: rule.id,
      title: rule.title,
      description: rule.description,
      recommendations,
    };
  }).filter((section) => section.recommendations.length > 0);

  return {
    selectedItemCount: selectedIds.length,
    sections,
  };
}
