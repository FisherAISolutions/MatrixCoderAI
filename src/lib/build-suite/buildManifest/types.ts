import type {
  BuildSuiteAppearance,
  BuildSuiteGenerationImpact,
  BuildSuiteSelection,
} from '../types';
import type { BuildSuiteAdvisorSectionId } from '../advisor';

export const BUILD_MANIFEST_SCHEMA_VERSION = 1;
export const BUILD_MANIFEST_METADATA_VERSION = '2026-07-07';

export type BuildManifestSource = 'manual' | 'template' | 'saved-build';

export interface BuildManifestItemRef {
  id: string;
  label: string;
  category: string;
  tags: string[];
  promptInstruction: string;
}

export interface BuildManifestAdvisorRecommendation {
  sectionId: BuildSuiteAdvisorSectionId;
  itemId: string;
  itemLabel: string;
  reason: string;
  confidenceScore: number;
  compatibilityScore: number;
  estimatedImplementationImpact: BuildSuiteGenerationImpact;
}

export interface BuildManifestNavigation {
  layoutId?: string;
  inferredPattern:
    | 'sidebar'
    | 'top-nav'
    | 'bottom-nav'
    | 'split'
    | 'bento'
    | 'landing'
    | 'dashboard'
    | 'responsive';
  routeStrategy: 'domain-inferred';
}

export interface BuildManifest {
  schemaVersion: typeof BUILD_MANIFEST_SCHEMA_VERSION;
  metadataVersion: string;
  source: BuildManifestSource;
  createdAt: string;
  templateId?: string;
  savedBuildId?: string;
  selection: BuildSuiteSelection;
  appType?: BuildManifestItemRef;
  appearance?: BuildSuiteAppearance;
  colorPalette?: BuildManifestItemRef;
  uiStyle?: BuildManifestItemRef;
  layout?: BuildManifestItemRef;
  navigation: BuildManifestNavigation;
  components: BuildManifestItemRef[];
  charts: BuildManifestItemRef[];
  forms: BuildManifestItemRef[];
  tables: BuildManifestItemRef[];
  aiFeatures: BuildManifestItemRef[];
  integrations: BuildManifestItemRef[];
  animations?: BuildManifestItemRef;
  mobileFeatures?: BuildManifestItemRef;
  advisorRecommendations: BuildManifestAdvisorRecommendation[];
}

export interface BuildManifestCreateOptions {
  selection: BuildSuiteSelection;
  templateId?: string;
  savedBuildId?: string;
  source?: BuildManifestSource;
  now?: Date;
}

export interface SerializedBuildManifestResult {
  manifest: BuildManifest;
  json: string;
}
