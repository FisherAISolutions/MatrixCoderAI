import type { User } from '@supabase/supabase-js';
import type { BuildSuiteAdvisorReport } from './advisor';
import type {
  BuildSuiteAppearance,
  BuildSuiteSelection,
} from './types';
import { supabase as defaultSupabase } from '@/lib/supabase';

export const BUILD_SUITE_SAVED_BUILDS_VERSION = 1;
export const BUILD_SUITE_SAVED_BUILDS_STORAGE_KEY =
  'matrix-build-suite:saved-builds';

export type BuildSuiteSavedBuildSort =
  | 'name'
  | 'updated'
  | 'created'
  | 'favorites';

export interface BuildSuiteSavedBuildFilters {
  appTypeId?: string;
  theme?: BuildSuiteAppearance;
  styleId?: string;
  platform?: string;
}

export interface BuildSuiteAdvisorSnapshot {
  sections: Array<{
    id: string;
    title: string;
    recommendations: Array<{
      itemId: string;
      label: string;
      reason: string;
      confidence: number;
      compatibilityScore: number;
      estimatedImplementationImpact: string;
    }>;
  }>;
}

export interface BuildSuiteSavedBuild {
  id: string;
  name: string;
  favorite: boolean;
  selection: BuildSuiteSelection;
  advisorRecommendations: BuildSuiteAdvisorSnapshot;
  finalPrompt: string;
  metadataVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface BuildSuiteSavedBuildDraft {
  name: string;
  selection: BuildSuiteSelection;
  advisorReport: BuildSuiteAdvisorReport;
  finalPrompt: string;
  favorite?: boolean;
}

export interface SavedBuildPersistenceResult {
  builds: BuildSuiteSavedBuild[];
  source: 'supabase' | 'local';
  warning?: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface SupabaseLike {
  auth: {
    getUser: () => Promise<{
      data: { user: Pick<User, 'id'> | null };
      error?: { message?: string } | null;
    }>;
  };
  from: (table: string) => any;
}

interface PersistenceOptions {
  storage?: StorageLike;
  supabaseClient?: SupabaseLike | null;
}

function createBuildId(now = new Date()): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `build-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneSelection(selection: BuildSuiteSelection): BuildSuiteSelection {
  return {
    ...selection,
    componentIds: [...selection.componentIds],
    aiFeatureIds: [...selection.aiFeatureIds],
    integrationIds: [...selection.integrationIds],
  };
}

export function snapshotAdvisorReport(
  report: BuildSuiteAdvisorReport
): BuildSuiteAdvisorSnapshot {
  return {
    sections: report.sections.map((section) => ({
      id: section.id,
      title: section.title,
      recommendations: section.recommendations.map((recommendation) => ({
        itemId: recommendation.item.id,
        label: recommendation.item.label,
        reason: recommendation.reason,
        confidence: recommendation.confidenceScore,
        compatibilityScore: recommendation.compatibilityScore,
        estimatedImplementationImpact:
          recommendation.estimatedImplementationImpact,
      })),
    })),
  };
}

export function createBuildSuiteSavedBuild(
  draft: BuildSuiteSavedBuildDraft,
  now = new Date(),
  id = createBuildId(now)
): BuildSuiteSavedBuild {
  if (!draft.name.trim()) {
    throw new Error('Saved build name is required.');
  }
  if (!draft.finalPrompt.trim()) {
    throw new Error('Saved build prompt is required.');
  }

  const timestamp = now.toISOString();
  return {
    id,
    name: draft.name.trim(),
    favorite: draft.favorite ?? false,
    selection: cloneSelection(draft.selection),
    advisorRecommendations: snapshotAdvisorReport(draft.advisorReport),
    finalPrompt: draft.finalPrompt,
    metadataVersion: BUILD_SUITE_SAVED_BUILDS_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function renameBuildSuiteSavedBuild(
  build: BuildSuiteSavedBuild,
  name: string,
  now = new Date()
): BuildSuiteSavedBuild {
  if (!name.trim()) throw new Error('Saved build name is required.');
  return {
    ...build,
    name: name.trim(),
    updatedAt: now.toISOString(),
  };
}

export function duplicateBuildSuiteSavedBuild(
  build: BuildSuiteSavedBuild,
  now = new Date(),
  id = createBuildId(now)
): BuildSuiteSavedBuild {
  const timestamp = now.toISOString();
  return {
    ...build,
    id,
    name: `${build.name} Copy`,
    favorite: false,
    selection: cloneSelection(build.selection),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function toggleBuildSuiteSavedBuildFavorite(
  build: BuildSuiteSavedBuild,
  now = new Date()
): BuildSuiteSavedBuild {
  return {
    ...build,
    favorite: !build.favorite,
    updatedAt: now.toISOString(),
  };
}

export function exportBuildSuiteSavedBuild(build: BuildSuiteSavedBuild): string {
  return JSON.stringify(build, null, 2);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeSelection(value: unknown): BuildSuiteSelection | null {
  if (!value || typeof value !== 'object') return null;
  const selection = value as Partial<BuildSuiteSelection>;
  if (
    !isStringArray(selection.componentIds) ||
    !isStringArray(selection.aiFeatureIds) ||
    !isStringArray(selection.integrationIds)
  ) {
    return null;
  }

  return {
    appTypeId:
      typeof selection.appTypeId === 'string' ? selection.appTypeId : undefined,
    appearance:
      selection.appearance === 'light' || selection.appearance === 'dark'
        ? selection.appearance
        : undefined,
    paletteId:
      typeof selection.paletteId === 'string' ? selection.paletteId : undefined,
    styleId:
      typeof selection.styleId === 'string' ? selection.styleId : undefined,
    layoutId:
      typeof selection.layoutId === 'string' ? selection.layoutId : undefined,
    componentIds: [...selection.componentIds],
    aiFeatureIds: [...selection.aiFeatureIds],
    integrationIds: [...selection.integrationIds],
    animationId:
      typeof selection.animationId === 'string'
        ? selection.animationId
        : undefined,
    mobileId:
      typeof selection.mobileId === 'string' ? selection.mobileId : undefined,
  };
}

export function importBuildSuiteSavedBuild(
  raw: string,
  now = new Date(),
  id = createBuildId(now)
): BuildSuiteSavedBuild {
  const parsed = JSON.parse(raw) as Partial<BuildSuiteSavedBuild>;
  const selection = normalizeSelection(parsed.selection);
  if (!selection) throw new Error('Imported build has invalid selections.');
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    throw new Error('Imported build is missing a name.');
  }
  if (typeof parsed.finalPrompt !== 'string' || !parsed.finalPrompt.trim()) {
    throw new Error('Imported build is missing a final prompt.');
  }

  const timestamp = now.toISOString();
  return {
    id,
    name: parsed.name.trim(),
    favorite: Boolean(parsed.favorite),
    selection,
    advisorRecommendations:
      parsed.advisorRecommendations &&
      typeof parsed.advisorRecommendations === 'object' &&
      Array.isArray(parsed.advisorRecommendations.sections)
        ? (parsed.advisorRecommendations as BuildSuiteAdvisorSnapshot)
        : { sections: [] },
    finalPrompt: parsed.finalPrompt,
    metadataVersion: BUILD_SUITE_SAVED_BUILDS_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeSavedBuildRecord(value: unknown): BuildSuiteSavedBuild | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<BuildSuiteSavedBuild>;
  const selection = normalizeSelection(parsed.selection);
  if (!selection) return null;
  if (typeof parsed.id !== 'string' || !parsed.id.trim()) return null;
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
  if (typeof parsed.finalPrompt !== 'string' || !parsed.finalPrompt.trim()) {
    return null;
  }
  if (
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: parsed.id,
    name: parsed.name.trim(),
    favorite: Boolean(parsed.favorite),
    selection,
    advisorRecommendations:
      parsed.advisorRecommendations &&
      typeof parsed.advisorRecommendations === 'object' &&
      Array.isArray(parsed.advisorRecommendations.sections)
        ? (parsed.advisorRecommendations as BuildSuiteAdvisorSnapshot)
        : { sections: [] },
    finalPrompt: parsed.finalPrompt,
    metadataVersion:
      typeof parsed.metadataVersion === 'number'
        ? parsed.metadataVersion
        : BUILD_SUITE_SAVED_BUILDS_VERSION,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

export function searchSortAndFilterBuildSuiteSavedBuilds(
  builds: BuildSuiteSavedBuild[],
  options: {
    query?: string;
    sort?: BuildSuiteSavedBuildSort;
    filters?: BuildSuiteSavedBuildFilters;
  } = {}
): BuildSuiteSavedBuild[] {
  const query = options.query?.trim().toLowerCase() ?? '';
  const filters = options.filters ?? {};
  const filtered = builds.filter((build) => {
    const haystack = [
      build.name,
      build.selection.appTypeId,
      build.selection.appearance,
      build.selection.paletteId,
      build.selection.styleId,
      build.selection.layoutId,
      build.selection.mobileId,
      ...build.selection.componentIds,
      ...build.selection.integrationIds,
      ...build.selection.aiFeatureIds,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      (!query || haystack.includes(query)) &&
      (!filters.appTypeId || build.selection.appTypeId === filters.appTypeId) &&
      (!filters.theme || build.selection.appearance === filters.theme) &&
      (!filters.styleId || build.selection.styleId === filters.styleId) &&
      (!filters.platform || build.selection.mobileId === filters.platform)
    );
  });

  return filtered.sort((a, b) => {
    if (options.sort === 'name') return a.name.localeCompare(b.name);
    if (options.sort === 'created') {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }
    if (options.sort === 'favorites') {
      return Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name);
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function readLocalBuilds(storage: StorageLike): BuildSuiteSavedBuild[] {
  const raw = storage.getItem(BUILD_SUITE_SAVED_BUILDS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeSavedBuildRecord(item))
      .filter((item): item is BuildSuiteSavedBuild => Boolean(item));
  } catch {
    return [];
  }
}

function writeLocalBuilds(
  storage: StorageLike,
  builds: BuildSuiteSavedBuild[]
): void {
  storage.setItem(BUILD_SUITE_SAVED_BUILDS_STORAGE_KEY, JSON.stringify(builds));
}

function getStorage(options: PersistenceOptions): StorageLike | null {
  if (options.storage) return options.storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function getSupabaseClient(options: PersistenceOptions): SupabaseLike | null {
  return (
    options.supabaseClient ??
    (defaultSupabase as unknown as SupabaseLike | null)
  );
}

function toSupabaseRow(build: BuildSuiteSavedBuild, userId: string) {
  return {
    id: build.id,
    user_id: userId,
    name: build.name,
    favorite: build.favorite,
    selection: build.selection,
    advisor_recommendations: build.advisorRecommendations,
    final_prompt: build.finalPrompt,
    metadata_version: build.metadataVersion,
    created_at: build.createdAt,
    updated_at: build.updatedAt,
  };
}

function fromSupabaseRow(row: any): BuildSuiteSavedBuild {
  return {
    id: row.id,
    name: row.name,
    favorite: Boolean(row.favorite),
    selection: normalizeSelection(row.selection) ?? {
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
    },
    advisorRecommendations: row.advisor_recommendations ?? { sections: [] },
    finalPrompt: row.final_prompt,
    metadataVersion:
      typeof row.metadata_version === 'number'
        ? row.metadata_version
        : BUILD_SUITE_SAVED_BUILDS_VERSION,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSupabaseUserId(
  client: SupabaseLike | null
): Promise<string | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export async function loadBuildSuiteSavedBuilds(
  options: PersistenceOptions = {}
): Promise<SavedBuildPersistenceResult> {
  const storage = getStorage(options);
  const localBuilds = storage ? readLocalBuilds(storage) : [];
  const client = getSupabaseClient(options);
  const userId = await getSupabaseUserId(client);
  if (!client || !userId) {
    return { builds: localBuilds, source: 'local' };
  }

  try {
    const { data, error } = await client
      .from('build_suite_saved_builds')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    const builds = (data ?? []).map(fromSupabaseRow);
    if (storage) writeLocalBuilds(storage, builds);
    return { builds, source: 'supabase' };
  } catch (error) {
    return {
      builds: localBuilds,
      source: 'local',
      warning:
        error instanceof Error
          ? error.message
          : 'Supabase unavailable. Using local saved builds.',
    };
  }
}

export async function saveBuildSuiteSavedBuild(
  build: BuildSuiteSavedBuild,
  builds: BuildSuiteSavedBuild[],
  options: PersistenceOptions = {}
): Promise<SavedBuildPersistenceResult> {
  const nextBuilds = [
    build,
    ...builds.filter((existing) => existing.id !== build.id),
  ];
  const storage = getStorage(options);
  if (storage) writeLocalBuilds(storage, nextBuilds);

  const client = getSupabaseClient(options);
  const userId = await getSupabaseUserId(client);
  if (!client || !userId) {
    return { builds: nextBuilds, source: 'local' };
  }

  try {
    const { error } = await client
      .from('build_suite_saved_builds')
      .upsert(toSupabaseRow(build, userId));
    if (error) throw error;
    return { builds: nextBuilds, source: 'supabase' };
  } catch (error) {
    return {
      builds: nextBuilds,
      source: 'local',
      warning:
        error instanceof Error
          ? error.message
          : 'Supabase save failed. Saved locally instead.',
    };
  }
}

export async function deleteBuildSuiteSavedBuild(
  id: string,
  builds: BuildSuiteSavedBuild[],
  options: PersistenceOptions = {}
): Promise<SavedBuildPersistenceResult> {
  const nextBuilds = builds.filter((build) => build.id !== id);
  const storage = getStorage(options);
  if (storage) writeLocalBuilds(storage, nextBuilds);

  const client = getSupabaseClient(options);
  const userId = await getSupabaseUserId(client);
  if (!client || !userId) {
    return { builds: nextBuilds, source: 'local' };
  }

  try {
    const { error } = await client
      .from('build_suite_saved_builds')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
    if (error) throw error;
    return { builds: nextBuilds, source: 'supabase' };
  } catch (error) {
    return {
      builds: nextBuilds,
      source: 'local',
      warning:
        error instanceof Error
          ? error.message
          : 'Supabase delete failed. Removed locally.',
    };
  }
}
