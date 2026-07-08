import {
  deserializeBuildManifest,
  type BuildManifest,
  type BuildManifestItemRef,
} from './buildManifest';
import { MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY } from './chatHandoff';

export interface BlueprintSummaryGroup {
  title: string;
  description: string;
  items: string[];
}

export interface BlueprintSummary {
  appName: string;
  source: string;
  createdAt: string;
  metadataVersion: string;
  groups: BlueprintSummaryGroup[];
}

type ReadableStorage = Pick<Storage, 'getItem'>;

function itemLabel(item: BuildManifestItemRef | undefined): string | null {
  return item?.label?.trim() || item?.id?.trim() || null;
}

function itemLabels(items: BuildManifestItemRef[]): string[] {
  return items.map((item) => itemLabel(item)).filter((item): item is string => Boolean(item));
}

function fallback(value: string | undefined, label: string): string {
  return value?.trim() || label;
}

function maybeGroup(
  title: string,
  description: string,
  items: Array<string | null | undefined>
): BlueprintSummaryGroup | null {
  const clean = items.filter((item): item is string => Boolean(item?.trim()));
  if (clean.length === 0) return null;
  return { title, description, items: clean };
}

export function createBlueprintSummary(
  manifest: BuildManifest
): BlueprintSummary {
  const groups = [
    maybeGroup('App blueprint', 'The high-level product and visual direction.', [
      itemLabel(manifest.appType),
      manifest.appearance ? `${manifest.appearance} appearance` : null,
      itemLabel(manifest.colorPalette),
      itemLabel(manifest.uiStyle),
      itemLabel(manifest.layout),
    ]),
    maybeGroup('Routes', 'Route strategy and navigation pattern for the future app map.', [
      `${manifest.navigation.inferredPattern} navigation`,
      `${manifest.navigation.routeStrategy} route strategy`,
    ]),
    maybeGroup('Data models', 'Structured features that usually imply data entities or storage.', [
      ...itemLabels(manifest.forms),
      ...itemLabels(manifest.tables),
      ...itemLabels(manifest.integrations),
    ]),
    maybeGroup('Components', 'Selected interface building blocks for the app experience.', [
      ...itemLabels(manifest.components),
      ...itemLabels(manifest.charts),
    ]),
    maybeGroup('Integrations', 'External services and platform capabilities requested.', [
      ...itemLabels(manifest.integrations),
    ]),
    maybeGroup('User flows', 'AI, animation, and mobile behavior that shape the user journey.', [
      ...itemLabels(manifest.aiFeatures),
      itemLabel(manifest.animations),
      itemLabel(manifest.mobileFeatures),
    ]),
    maybeGroup('Folder structure', 'Likely implementation areas for a Next.js App Router project.', [
      'src/app for route pages',
      'src/components for reusable UI',
      'src/lib for helpers and persistence',
      'src/types for shared TypeScript models',
    ]),
  ].filter((group): group is BlueprintSummaryGroup => Boolean(group));

  return {
    appName: fallback(itemLabel(manifest.appType) ?? undefined, 'Untitled app'),
    source: manifest.source,
    createdAt: manifest.createdAt,
    metadataVersion: manifest.metadataVersion,
    groups,
  };
}

export function readBuildManifestFromHandoffStorage(
  storage: ReadableStorage
): BuildManifest | null {
  const raw = storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { buildManifest?: unknown };
    if (!parsed.buildManifest) return null;
    return deserializeBuildManifest(JSON.stringify(parsed.buildManifest));
  } catch {
    return null;
  }
}
