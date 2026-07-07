import {
  buildSuiteCatalog,
  findBuildSuiteItem,
  findBuildSuiteItems,
} from '../catalog';
import { getBuildSuiteAdvisorReport } from '../advisor';
import type { BuildSuiteCatalog, BuildSuiteEnhancedItem } from '../types';
import {
  BUILD_MANIFEST_METADATA_VERSION,
  BUILD_MANIFEST_SCHEMA_VERSION,
  type BuildManifest,
  type BuildManifestAdvisorRecommendation,
  type BuildManifestCreateOptions,
  type BuildManifestItemRef,
  type BuildManifestNavigation,
  type SerializedBuildManifestResult,
} from './types';

function itemRef(
  item: BuildSuiteEnhancedItem | undefined
): BuildManifestItemRef | undefined {
  if (!item) return undefined;
  return {
    id: item.id,
    label: item.label,
    category: item.category,
    tags: [...item.tags],
    promptInstruction: item.promptInstruction,
  };
}

function itemRefs(items: BuildSuiteEnhancedItem[]): BuildManifestItemRef[] {
  return items.map((item) => itemRef(item)!).filter(Boolean);
}

function itemMatches(item: BuildSuiteEnhancedItem, terms: string[]): boolean {
  const haystack = [
    item.id,
    item.label,
    item.category,
    item.previewType,
    ...item.tags,
  ]
    .join(' ')
    .toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function inferNavigation(
  layout: BuildSuiteEnhancedItem | undefined
): BuildManifestNavigation {
  if (!layout) {
    return {
      inferredPattern: 'responsive',
      routeStrategy: 'domain-inferred',
    };
  }

  if (itemMatches(layout, ['sidebar'])) {
    return {
      layoutId: layout.id,
      inferredPattern: 'sidebar',
      routeStrategy: 'domain-inferred',
    };
  }
  if (itemMatches(layout, ['bottom-nav', 'mobile tabs', 'mobile-first'])) {
    return {
      layoutId: layout.id,
      inferredPattern: 'bottom-nav',
      routeStrategy: 'domain-inferred',
    };
  }
  if (itemMatches(layout, ['split'])) {
    return {
      layoutId: layout.id,
      inferredPattern: 'split',
      routeStrategy: 'domain-inferred',
    };
  }
  if (itemMatches(layout, ['bento'])) {
    return {
      layoutId: layout.id,
      inferredPattern: 'bento',
      routeStrategy: 'domain-inferred',
    };
  }
  if (itemMatches(layout, ['landing'])) {
    return {
      layoutId: layout.id,
      inferredPattern: 'landing',
      routeStrategy: 'domain-inferred',
    };
  }
  if (itemMatches(layout, ['dashboard'])) {
    return {
      layoutId: layout.id,
      inferredPattern: 'dashboard',
      routeStrategy: 'domain-inferred',
    };
  }

  return {
    layoutId: layout.id,
    inferredPattern: 'top-nav',
    routeStrategy: 'domain-inferred',
  };
}

function advisorRecommendations(
  selection: BuildManifestCreateOptions['selection']
): BuildManifestAdvisorRecommendation[] {
  return getBuildSuiteAdvisorReport(selection).sections.flatMap((section) =>
    section.recommendations.map((recommendation) => ({
      sectionId: section.id,
      itemId: recommendation.item.id,
      itemLabel: recommendation.item.label,
      reason: recommendation.reason,
      confidenceScore: recommendation.confidenceScore,
      compatibilityScore: recommendation.compatibilityScore,
      estimatedImplementationImpact:
        recommendation.estimatedImplementationImpact,
    }))
  );
}

export function createBuildManifest(
  options: BuildManifestCreateOptions,
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildManifest {
  const { selection } = options;
  const appType = findBuildSuiteItem(
    selection.appTypeId,
    catalog
  ) as BuildSuiteEnhancedItem | undefined;
  const colorPalette = findBuildSuiteItem(
    selection.paletteId,
    catalog
  ) as BuildSuiteEnhancedItem | undefined;
  const uiStyle = findBuildSuiteItem(
    selection.styleId,
    catalog
  ) as BuildSuiteEnhancedItem | undefined;
  const layout = findBuildSuiteItem(
    selection.layoutId,
    catalog
  ) as BuildSuiteEnhancedItem | undefined;
  const components = findBuildSuiteItems(selection.componentIds, catalog);
  const aiFeatures = findBuildSuiteItems(selection.aiFeatureIds, catalog);
  const integrations = findBuildSuiteItems(selection.integrationIds, catalog);
  const animation = findBuildSuiteItem(
    selection.animationId,
    catalog
  ) as BuildSuiteEnhancedItem | undefined;
  const mobileFeature = findBuildSuiteItem(
    selection.mobileId,
    catalog
  ) as BuildSuiteEnhancedItem | undefined;

  return {
    schemaVersion: BUILD_MANIFEST_SCHEMA_VERSION,
    metadataVersion: BUILD_MANIFEST_METADATA_VERSION,
    source:
      options.source ??
      (options.templateId
        ? 'template'
        : options.savedBuildId
        ? 'saved-build'
        : 'manual'),
    createdAt: (options.now ?? new Date()).toISOString(),
    templateId: options.templateId,
    savedBuildId: options.savedBuildId,
    selection: {
      ...selection,
      componentIds: [...selection.componentIds],
      aiFeatureIds: [...selection.aiFeatureIds],
      integrationIds: [...selection.integrationIds],
    },
    appType: itemRef(appType),
    appearance: selection.appearance,
    colorPalette: itemRef(colorPalette),
    uiStyle: itemRef(uiStyle),
    layout: itemRef(layout),
    navigation: inferNavigation(layout),
    components: itemRefs(components),
    charts: itemRefs(
      components.filter((item) => itemMatches(item, ['chart']))
    ),
    forms: itemRefs(components.filter((item) => itemMatches(item, ['form']))),
    tables: itemRefs(
      components.filter((item) => itemMatches(item, ['table']))
    ),
    aiFeatures: itemRefs(aiFeatures),
    integrations: itemRefs(integrations),
    animations: itemRef(animation),
    mobileFeatures: itemRef(mobileFeature),
    advisorRecommendations: advisorRecommendations(selection),
  };
}

export function serializeBuildManifest(manifest: BuildManifest): string {
  return JSON.stringify(manifest);
}

export function deserializeBuildManifest(raw: string): BuildManifest | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BuildManifest>;
    if (
      parsed.schemaVersion !== BUILD_MANIFEST_SCHEMA_VERSION ||
      typeof parsed.metadataVersion !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      !parsed.selection ||
      !Array.isArray(parsed.selection.componentIds) ||
      !Array.isArray(parsed.selection.aiFeatureIds) ||
      !Array.isArray(parsed.selection.integrationIds) ||
      !parsed.navigation ||
      !Array.isArray(parsed.components) ||
      !Array.isArray(parsed.aiFeatures) ||
      !Array.isArray(parsed.integrations)
    ) {
      return null;
    }
    return parsed as BuildManifest;
  } catch {
    return null;
  }
}

export function createSerializedBuildManifest(
  options: BuildManifestCreateOptions,
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): SerializedBuildManifestResult {
  const manifest = createBuildManifest(options, catalog);
  return {
    manifest,
    json: serializeBuildManifest(manifest),
  };
}
