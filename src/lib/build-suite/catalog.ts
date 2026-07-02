import { aiFeatureItems } from './aiFeatures';
import { animationItems } from './animations';
import { appTypeItems } from './appTypes';
import { componentItems } from './components';
import { integrationItems } from './integrations';
import { layoutItems } from './layouts';
import { mobileItems } from './mobile';
import { paletteItems } from './palettes';
import { styleItems } from './styles';
import { enhanceBuildSuiteItems } from './metadata';
import type {
  BuildSuiteCatalog,
  BuildSuiteEnhancedItem,
  BuildSuiteItem,
} from './types';

export const buildSuiteCatalog: BuildSuiteCatalog = {
  appTypes: enhanceBuildSuiteItems(appTypeItems),
  palettes: enhanceBuildSuiteItems(paletteItems),
  styles: enhanceBuildSuiteItems(styleItems),
  layouts: enhanceBuildSuiteItems(layoutItems),
  components: enhanceBuildSuiteItems(componentItems),
  aiFeatures: enhanceBuildSuiteItems(aiFeatureItems),
  integrations: enhanceBuildSuiteItems(integrationItems),
  animations: enhanceBuildSuiteItems(animationItems),
  mobile: enhanceBuildSuiteItems(mobileItems),
};

export type BuildSuiteCatalogKey = keyof BuildSuiteCatalog;

export const buildSuiteCatalogOrder: BuildSuiteCatalogKey[] = [
  'appTypes',
  'palettes',
  'styles',
  'layouts',
  'components',
  'aiFeatures',
  'integrations',
  'animations',
  'mobile',
];

export function getAllBuildSuiteItems(
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuiteEnhancedItem[] {
  return buildSuiteCatalogOrder.flatMap((key) => catalog[key]);
}

export function findBuildSuiteItem(
  id: string | undefined,
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuiteItem | undefined {
  if (!id) return undefined;
  return getAllBuildSuiteItems(catalog).find((item) => item.id === id);
}

export function findBuildSuiteItems(
  ids: string[],
  catalog: BuildSuiteCatalog = buildSuiteCatalog
): BuildSuiteEnhancedItem[] {
  return ids
    .map((id) => findBuildSuiteItem(id, catalog) as BuildSuiteEnhancedItem | undefined)
    .filter((item): item is BuildSuiteEnhancedItem => Boolean(item));
}
