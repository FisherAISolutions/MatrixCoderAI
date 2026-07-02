import { aiFeatureItems } from './aiFeatures';
import { animationItems } from './animations';
import { appTypeItems } from './appTypes';
import { componentItems } from './components';
import { integrationItems } from './integrations';
import { layoutItems } from './layouts';
import { mobileItems } from './mobile';
import { paletteItems } from './palettes';
import { styleItems } from './styles';
import type { BuildSuiteCatalog, BuildSuiteItem } from './types';

export const buildSuiteCatalog: BuildSuiteCatalog = {
  appTypes: appTypeItems,
  palettes: paletteItems,
  styles: styleItems,
  layouts: layoutItems,
  components: componentItems,
  aiFeatures: aiFeatureItems,
  integrations: integrationItems,
  animations: animationItems,
  mobile: mobileItems,
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
): BuildSuiteItem[] {
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
): BuildSuiteItem[] {
  return ids
    .map((id) => findBuildSuiteItem(id, catalog))
    .filter((item): item is BuildSuiteItem => Boolean(item));
}
