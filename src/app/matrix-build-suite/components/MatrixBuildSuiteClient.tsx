'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  BadgeCheck,
  Blocks,
  Boxes,
  BrainCircuit,
  Check,
  Clock3,
  Component,
  Heart,
  LayoutDashboard,
  Moon,
  Palette,
  PlugZap,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import {
  buildSuiteCatalog,
  buildSuiteCatalogOrder,
  findBuildSuiteItems,
  getAllBuildSuiteItems,
  type BuildSuiteCatalogKey,
} from '@/lib/build-suite/catalog';
import {
  featuredBuildSuiteCollections,
  getBuildSuiteCollectionItems,
  getRelatedBuildSuiteItems,
  type BuildSuiteFeaturedCollection,
} from '@/lib/build-suite/collections';
import {
  getBuildSuiteAdvisorReport,
  type BuildSuiteAdvisorRecommendation,
  type BuildSuiteAdvisorSection,
} from '@/lib/build-suite/advisor';
import {
  MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE,
  writeMatrixBuildSuiteChatHandoff,
} from '@/lib/build-suite/chatHandoff';
import {
  buildSuiteTemplatePacks,
  cloneBuildSuiteTemplateSelection,
  type BuildSuiteTemplatePack,
} from '@/lib/build-suite/templates';
import { filterPalettesByAppearance } from '@/lib/build-suite/palettes';
import { buildMatrixBuildSuitePrompt } from '@/lib/build-suite/promptBuilder';
import { BuildSuiteLivePreviewPanel } from '@/lib/build-suite/preview';
import { createBuildManifest } from '@/lib/build-suite/buildManifest';
import {
  createBuildSuiteSavedBuild,
  deleteBuildSuiteSavedBuild,
  duplicateBuildSuiteSavedBuild,
  exportBuildSuiteSavedBuild,
  importBuildSuiteSavedBuild,
  loadBuildSuiteSavedBuilds,
  renameBuildSuiteSavedBuild,
  saveBuildSuiteSavedBuild,
  searchSortAndFilterBuildSuiteSavedBuilds,
  toggleBuildSuiteSavedBuildFavorite,
  type BuildSuiteSavedBuild,
  type BuildSuiteSavedBuildFilters,
  type BuildSuiteSavedBuildSort,
} from '@/lib/build-suite/savedBuilds';
import type {
  BuildSuiteAppearance,
  BuildSuiteAccentColor,
  BuildSuiteDifficulty,
  BuildSuiteEnhancedItem,
  BuildSuiteGenerationImpact,
  BuildSuiteIcon,
  BuildSuiteSelection,
} from '@/lib/build-suite/types';
import { emptyBuildSuiteSelection } from '@/lib/build-suite/types';
import {
  BuildSuiteAppearancePreview,
  BuildSuiteCardPreview,
} from './BuildSuitePreviews';

const steps = [
  'App Type',
  'Appearance',
  'Color Palette',
  'UI Style',
  'Layout',
  'Components/Add-ons',
  'AI Features',
  'Integrations',
  'Animations',
  'Mobile',
  'Final Review',
];

const stepDescriptions = [
  'Choose the product category Matrix Coder should build around.',
  'Set the visual baseline before choosing a palette.',
  'Browse palettes filtered by the selected appearance.',
  'Pick the product design language for the generated app.',
  'Choose the structural layout for pages and workflows.',
  'Add functional building blocks and richer app workflows.',
  'Add AI-ready interface patterns without calling any API yet.',
  'Choose safe local integration patterns for the generated app.',
  'Tune the interaction energy and motion style.',
  'Shape the responsive and mobile behavior.',
  'Review the assembled prompt before using it anywhere.',
];

const stepIcons: LucideIcon[] = [
  AppWindow,
  Sparkles,
  Palette,
  Wand2,
  LayoutDashboard,
  Component,
  BrainCircuit,
  PlugZap,
  Zap,
  Smartphone,
  BadgeCheck,
];

const multiSelectStepKeys = new Set([5, 6, 7]);

type MarketplaceView = 'home' | 'browse' | 'wizard';
type MarketplaceSort = 'popularity' | 'newest' | 'alphabetical' | 'impact';
type CatalogBucket =
  | BuildSuiteCatalogKey
  | 'appearance'
  | 'unknown';

const collectionHomeOrder: BuildSuiteFeaturedCollection['id'][] = [
  'trending',
  'new-additions',
  'best-saas',
  'best-mobile',
  'best-ai',
  'popular-dashboards',
  'popular-ecommerce',
  'popular-crm',
  'production-ready',
];

const sortLabels: Record<MarketplaceSort, string> = {
  popularity: 'Popularity',
  newest: 'Newest',
  alphabetical: 'A-Z',
  impact: 'Generation impact',
};

const difficultyClasses: Record<BuildSuiteDifficulty, string> = {
  easy: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100',
  medium: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100',
  advanced: 'border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100',
};

const impactClasses: Record<BuildSuiteGenerationImpact, string> = {
  low: 'border-lime-300/35 bg-lime-300/10 text-lime-100',
  medium: 'border-blue-300/35 bg-blue-300/10 text-blue-100',
  high: 'border-amber-300/35 bg-amber-300/10 text-amber-100',
};

const accentClasses: Record<BuildSuiteAccentColor, string> = {
  amber: 'border-amber-300/45 bg-amber-300/15 text-amber-100',
  blue: 'border-blue-300/45 bg-blue-300/15 text-blue-100',
  cyan: 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100',
  emerald: 'border-emerald-300/45 bg-emerald-300/15 text-emerald-100',
  fuchsia: 'border-fuchsia-300/45 bg-fuchsia-300/15 text-fuchsia-100',
  lime: 'border-lime-300/45 bg-lime-300/15 text-lime-100',
  slate: 'border-slate-300/45 bg-slate-300/15 text-slate-100',
  violet: 'border-violet-300/45 bg-violet-300/15 text-violet-100',
};

const complexityClasses = {
  low: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100',
  medium: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100',
  high: 'border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100',
};

const iconMap: Record<BuildSuiteIcon, LucideIcon> = {
  'app-window': AppWindow,
  'badge-check': BadgeCheck,
  blocks: Blocks,
  boxes: Boxes,
  'brain-circuit': BrainCircuit,
  calendar: BadgeCheck,
  chart: LayoutDashboard,
  component: Component,
  form: Component,
  kanban: Blocks,
  'layout-dashboard': LayoutDashboard,
  moon: Moon,
  palette: Palette,
  'plug-zap': PlugZap,
  search: Search,
  smartphone: Smartphone,
  sparkles: Sparkles,
  star: Star,
  sun: Sun,
  table: Blocks,
  wand: Wand2,
  zap: Zap,
};

const impactWeight: Record<BuildSuiteGenerationImpact, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function cloneSelection(): BuildSuiteSelection {
  return {
    ...emptyBuildSuiteSelection,
    componentIds: [],
    aiFeatureIds: [],
    integrationIds: [],
  };
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id)
    ? ids.filter((existing) => existing !== id)
    : [...ids, id];
}

function getCategories(items: BuildSuiteEnhancedItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.category))).sort();
}

function getCatalogBucket(item: BuildSuiteEnhancedItem): CatalogBucket {
  for (const key of buildSuiteCatalogOrder) {
    if (buildSuiteCatalog[key].some((candidate) => candidate.id === item.id)) {
      return key;
    }
  }
  return 'unknown';
}

function getSelectedIds(selection: BuildSuiteSelection): Set<string> {
  return new Set(
    [
      selection.appTypeId,
      selection.paletteId,
      selection.styleId,
      selection.layoutId,
      selection.animationId,
      selection.mobileId,
      ...selection.componentIds,
      ...selection.aiFeatureIds,
      ...selection.integrationIds,
    ].filter((id): id is string => Boolean(id))
  );
}

function itemSearchText(item: BuildSuiteEnhancedItem): string {
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
  ]
    .join(' ')
    .toLowerCase();
}

function filterItems(
  items: BuildSuiteEnhancedItem[],
  query: string,
  category: string,
  difficulty: string,
  impact: string,
  appType: string
): BuildSuiteEnhancedItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  return items.filter((item) => {
    const text = itemSearchText(item);
    const appTypes = item.compatibleWith?.appTypes ?? [];
    return (
      (!normalizedQuery || text.includes(normalizedQuery)) &&
      (category === 'all' || item.category === category) &&
      (difficulty === 'all' || item.difficulty === difficulty) &&
      (impact === 'all' || item.estimatedGenerationImpact === impact) &&
      (appType === 'all' ||
        appTypes.includes(appType) ||
        item.tags.includes(appType) ||
        item.id === appType)
    );
  });
}

function sortItems(
  items: BuildSuiteEnhancedItem[],
  sortMode: MarketplaceSort
): BuildSuiteEnhancedItem[] {
  return [...items].sort((a, b) => {
    if (sortMode === 'alphabetical') return a.label.localeCompare(b.label);
    if (sortMode === 'impact') {
      return (
        impactWeight[b.estimatedGenerationImpact] -
          impactWeight[a.estimatedGenerationImpact] ||
        b.popularity - a.popularity ||
        a.label.localeCompare(b.label)
      );
    }
    if (sortMode === 'newest') {
      return (
        Number(b.badges.includes('New')) - Number(a.badges.includes('New')) ||
        b.id.localeCompare(a.id) ||
        a.label.localeCompare(b.label)
      );
    }
    return b.popularity - a.popularity || a.label.localeCompare(b.label);
  });
}

function relatedItemsFor(item: BuildSuiteEnhancedItem): BuildSuiteEnhancedItem[] {
  return findBuildSuiteItems(item.relatedItemIds).slice(0, 4);
}

function compatibilityLabels(item: BuildSuiteEnhancedItem): string[] {
  const appTypes = item.compatibleWith?.appTypes ?? [];
  if (appTypes.length) return appTypes;
  return item.recommendedFor;
}

function ratingText(item: BuildSuiteEnhancedItem): string {
  return `${'\u2605'.repeat(item.popularity)} Popular`;
}

function itemIsSelected(
  item: BuildSuiteEnhancedItem,
  selection: BuildSuiteSelection
): boolean {
  return getSelectedIds(selection).has(item.id);
}

function uniqueList(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value?.trim())))
  );
}

function friendlyId(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSavedBuildDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function itemLabelsForIds(ids: string[] = []): string[] {
  return ids.map((id) => findBuildSuiteItems([id])[0]?.label ?? friendlyId(id));
}

function relatedCatalogItems(
  item: BuildSuiteEnhancedItem,
  catalogKey: BuildSuiteCatalogKey
): BuildSuiteEnhancedItem[] {
  const appTypes = item.compatibleWith?.appTypes ?? [];
  const recommendationText = [...item.recommendedFor, ...item.tags, item.category]
    .join(' ')
    .toLowerCase();

  return buildSuiteCatalog[catalogKey]
    .filter((candidate) => {
      if (candidate.id === item.id) return false;
      const candidateText = [
        candidate.id,
        candidate.label,
        candidate.category,
        ...candidate.tags,
        ...candidate.recommendedFor,
      ]
        .join(' ')
        .toLowerCase();
      const candidateAppTypes = candidate.compatibleWith?.appTypes ?? [];

      return (
        item.relatedItemIds.includes(candidate.id) ||
        candidate.relatedItemIds.includes(item.id) ||
        appTypes.some((appType) => candidateAppTypes.includes(appType)) ||
        item.tags.some((tag) => candidate.tags.includes(tag)) ||
        candidate.recommendedFor.some((value) =>
          recommendationText.includes(value.toLowerCase())
        ) ||
        candidateText.includes(item.category.toLowerCase())
      );
    })
    .sort((a, b) => b.popularity - a.popularity || a.label.localeCompare(b.label))
    .slice(0, 6);
}

function detailUseCases(item: BuildSuiteEnhancedItem): string[] {
  return uniqueList([
    ...item.recommendedFor,
    ...item.tags.slice(0, 6),
    ...(item.compatibleWith?.appTypes ?? []).map(friendlyId),
  ]).slice(0, 10);
}

function DetailStat({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`border border-emerald-500/20 bg-black/30 p-4 ${className}`}>
      <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold capitalize text-emerald-50">{value}</p>
    </div>
  );
}

function ChipList({
  values,
  empty,
  tone = 'emerald',
}: {
  values: string[];
  empty: string;
  tone?: 'emerald' | 'cyan' | 'amber' | 'rose';
}) {
  const classes =
    tone === 'cyan'
      ? 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100'
      : tone === 'amber'
        ? 'border-amber-300/35 bg-amber-300/10 text-amber-100'
        : tone === 'rose'
          ? 'border-rose-300/35 bg-rose-300/10 text-rose-100'
          : 'border-emerald-500/20 bg-black/20 text-emerald-100/75';

  if (!values.length) {
    return <p className="text-sm text-emerald-100/55">{empty}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className={`border px-2 py-1 text-xs ${classes}`}>
          {value}
        </span>
      ))}
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 border border-emerald-500/20 bg-black/25 p-4">
      <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">
        {title}
      </p>
      {children}
    </section>
  );
}

function EnhancementDetailPanel({
  item,
  selected,
  favorite,
  onClose,
  onAdd,
  onToggleFavorite,
  onOpenRelated,
}: {
  item: BuildSuiteEnhancedItem;
  selected: boolean;
  favorite: boolean;
  onClose: () => void;
  onAdd: () => void;
  onToggleFavorite: () => void;
  onOpenRelated: (id: string) => void;
}) {
  const Icon = iconMap[item.icon] ?? Boxes;
  const related = relatedItemsFor(item);
  const useCases = detailUseCases(item);
  const compatibleAppTypes = compatibilityLabels(item);
  const compatibleStyles = relatedCatalogItems(item, 'styles').map(
    (candidate) => candidate.label
  );
  const compatibleLayouts = relatedCatalogItems(item, 'layouts').map(
    (candidate) => candidate.label
  );
  const dependencies = itemLabelsForIds(item.compatibleWith?.categories ?? []);
  const conflicts = itemLabelsForIds(item.conflictsWith ?? []);
  const pairings = uniqueList([
    ...related.map((candidate) => candidate.label),
    ...item.relatedItemIds.map((id) => findBuildSuiteItems([id])[0]?.label),
  ]).slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-50 grid bg-black/72 p-4 backdrop-blur-sm lg:place-items-end"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.label} enhancement details`}
    >
      <button
        type="button"
        aria-label="Close enhancement details"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative ml-auto flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden border border-emerald-400/35 bg-black shadow-[0_0_70px_rgba(16,185,129,0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-emerald-500/25 bg-emerald-400/5 p-5">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center border border-emerald-500/40 bg-emerald-400/10 text-emerald-200">
              <Icon size={24} />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-emerald-300">
                {item.category}
              </p>
              <h2 className="mt-2 text-3xl font-bold text-emerald-50 sm:text-4xl">
                {item.label}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleFavorite}
              className={`grid h-11 w-11 place-items-center border transition hover:-translate-y-0.5 ${
                favorite
                  ? 'border-rose-300 bg-rose-300/15 text-rose-100'
                  : 'border-emerald-500/30 text-emerald-100/60 hover:border-rose-300 hover:text-rose-100'
              }`}
            >
              <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center border border-emerald-500/30 text-emerald-100/75 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-50"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="grid gap-4">
              <div className="[&>div]:mt-0 [&>div]:h-64">
                <BuildSuiteCardPreview item={item} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="[&>div]:mt-0">
                  <BuildSuiteCardPreview item={item} />
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-300/65">
                    Primary preview
                  </p>
                </div>
                {related.slice(0, 2).map((relatedItem) => (
                  <button
                    key={relatedItem.id}
                    type="button"
                    onClick={() => onOpenRelated(relatedItem.id)}
                    className="text-left [&>div]:mt-0"
                  >
                    <BuildSuiteCardPreview item={relatedItem} />
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-300/65">
                      Pairing preview
                    </p>
                  </button>
                ))}
              </div>

              <DetailSection title="What this adds">
                <p className="text-sm leading-7 text-emerald-50/72">
                  {item.promptInstruction}
                </p>
              </DetailSection>

              <DetailSection title="Tags">
                <ChipList values={item.tags} empty="No tags listed yet." />
              </DetailSection>
            </div>

            <div className="grid gap-5">
              <p className="text-sm leading-7 text-emerald-50/75">
                {item.description}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DetailStat label="Difficulty" value={item.difficulty} />
                <DetailStat label="Popularity" value={ratingText(item)} />
                <DetailStat
                  label="AI impact"
                  value={`${item.estimatedGenerationImpact} generation`}
                />
                <DetailStat
                  label="Complexity"
                  value={item.complexity ?? item.difficulty}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <DetailSection title="Best use cases">
                  <ChipList
                    values={useCases}
                    empty="This enhancement is broadly useful."
                    tone="amber"
                  />
                </DetailSection>
                <DetailSection title="Compatible app categories">
                  <ChipList
                    values={compatibleAppTypes}
                    empty="Broad app compatibility."
                    tone="cyan"
                  />
                </DetailSection>
                <DetailSection title="Compatible UI styles">
                  <ChipList
                    values={compatibleStyles}
                    empty="Works with most UI styles."
                  />
                </DetailSection>
                <DetailSection title="Compatible layouts">
                  <ChipList
                    values={compatibleLayouts}
                    empty="Works with most layout systems."
                  />
                </DetailSection>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <DetailSection title="Recommended pairings">
                  <ChipList
                    values={pairings}
                    empty="No pairings listed yet."
                    tone="cyan"
                  />
                </DetailSection>
                <DetailSection title="People also installed">
                  {related.length ? (
                    <div className="grid gap-2">
                      {related.map((relatedItem) => (
                        <button
                          key={relatedItem.id}
                          type="button"
                          onClick={() => onOpenRelated(relatedItem.id)}
                          className="flex items-center justify-between border border-cyan-300/20 bg-cyan-300/10 p-3 text-left text-cyan-50 transition hover:-translate-y-0.5 hover:border-cyan-200"
                        >
                          <span>{relatedItem.label}</span>
                          <Sparkles size={14} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-emerald-100/55">
                      No linked installs yet.
                    </p>
                  )}
                </DetailSection>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <DetailSection title="Dependencies">
                  <ChipList
                    values={dependencies}
                    empty="No dependencies listed."
                    tone="emerald"
                  />
                </DetailSection>
                <DetailSection title="Conflicts">
                  <ChipList
                    values={conflicts}
                    empty="No conflicts listed."
                    tone="rose"
                  />
                </DetailSection>
              </div>

              <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-500/25 bg-black/92 p-5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">
                  {selected ? 'Already added to this build' : 'Ready to add'}
                </p>
                <button
                  type="button"
                  onClick={onAdd}
                  className={`border px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] transition hover:-translate-y-0.5 ${
                    selected
                      ? 'border-emerald-200 bg-emerald-300 text-black'
                      : 'border-emerald-300 bg-emerald-300 text-black hover:shadow-[0_16px_42px_rgba(16,185,129,0.24)]'
                  }`}
                >
                  {selected ? 'Added to Build' : 'Add to Build'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function MarketplaceCard({
  item,
  selected,
  favorite,
  onOpen,
  onAdd,
  onToggleFavorite,
}: {
  item: BuildSuiteEnhancedItem;
  selected: boolean;
  favorite: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onToggleFavorite: () => void;
}) {
  const Icon = iconMap[item.icon] ?? Boxes;
  const compatible = compatibilityLabels(item).slice(0, 3);
  const related = relatedItemsFor(item);

  return (
    <article
      className={`group relative flex min-h-[430px] flex-col overflow-hidden border p-5 transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:bg-emerald-400/10 hover:shadow-[0_22px_55px_rgba(16,185,129,0.16)] ${
        selected
          ? 'border-emerald-200 bg-emerald-300/15'
          : 'border-emerald-500/25 bg-black/35'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <span
            className={`grid h-12 w-12 shrink-0 place-items-center border ${
              selected
                ? 'border-emerald-200 bg-emerald-300 text-black'
                : 'border-emerald-500/35 bg-emerald-400/10 text-emerald-200'
            }`}
          >
            <Icon size={22} strokeWidth={1.8} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xl font-bold text-emerald-50">
              {item.label}
            </span>
            <span className="mt-1 block text-xs uppercase tracking-[0.28em] text-emerald-300/70">
              {item.category}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={favorite ? 'Remove favorite' : 'Add favorite'}
          className={`grid h-10 w-10 shrink-0 place-items-center border transition hover:-translate-y-0.5 ${
            favorite
              ? 'border-rose-300 bg-rose-300/15 text-rose-100'
              : 'border-emerald-500/25 text-emerald-100/55 hover:border-rose-300 hover:text-rose-100'
          }`}
        >
          <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <button type="button" onClick={onOpen} className="mt-4 text-left">
        <BuildSuiteCardPreview item={item} />
      </button>

      <p className="mt-4 text-sm leading-6 text-emerald-50/72">
        {item.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`border px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${difficultyClasses[item.difficulty]}`}
        >
          {item.difficulty}
        </span>
        <span className="border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
          {ratingText(item)}
        </span>
        <span
          className={`border px-2 py-1 text-xs uppercase tracking-[0.16em] ${impactClasses[item.estimatedGenerationImpact]}`}
        >
          {item.estimatedGenerationImpact} impact
        </span>
        {item.badges.slice(0, 3).map((badge) => (
          <span
            key={badge}
            className="border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100"
          >
            {badge}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">
          Compatible app types
        </p>
        <div className="flex flex-wrap gap-2">
          {compatible.length ? (
            compatible.map((label) => (
              <span
                key={label}
                className="border border-emerald-500/20 bg-black/20 px-2 py-1 text-xs text-emerald-100/75"
              >
                {label}
              </span>
            ))
          ) : (
            <span className="text-xs text-emerald-100/50">Broad compatibility</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">
          People also added
        </p>
        <div className="flex flex-wrap gap-2">
          {related.length ? (
            related.map((relatedItem) => (
              <span
                key={relatedItem.id}
                className="border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100"
              >
                {relatedItem.label}
              </span>
            ))
          ) : (
            <span className="text-xs text-emerald-100/50">No linked add-ons yet</span>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
        <button
          type="button"
          onClick={onOpen}
          className="text-xs uppercase tracking-[0.22em] text-emerald-300/80 transition hover:text-emerald-100"
        >
          View details
        </button>
        <button
          type="button"
          onClick={onAdd}
          className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition hover:-translate-y-0.5 ${
            selected
              ? 'border-emerald-200 bg-emerald-300 text-black'
              : 'border-emerald-400/50 text-emerald-100 hover:border-emerald-200 hover:bg-emerald-300 hover:text-black'
          }`}
        >
          {selected ? 'Added' : 'Add to Build'}
        </button>
      </div>
    </article>
  );
}

function MarketplaceShelf({
  title,
  subtitle,
  items,
  selection,
  favoriteIds,
  onOpen,
  onAdd,
  onToggleFavorite,
  onBrowse,
}: {
  title: string;
  subtitle: string;
  items: BuildSuiteEnhancedItem[];
  selection: BuildSuiteSelection;
  favoriteIds: string[];
  onOpen: (id: string) => void;
  onAdd: (item: BuildSuiteEnhancedItem) => void;
  onToggleFavorite: (id: string) => void;
  onBrowse?: () => void;
}) {
  if (!items.length) return null;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-emerald-50">{title}</h2>
          <p className="mt-2 text-sm text-emerald-50/65">{subtitle}</p>
        </div>
        {onBrowse ? (
          <button
            type="button"
            onClick={onBrowse}
            className="border border-emerald-500/35 px-3 py-2 text-xs uppercase tracking-[0.22em] text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-400/10"
          >
            Browse all
          </button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 6).map((item) => (
          <MarketplaceCard
            key={item.id}
            item={item}
            selected={itemIsSelected(item, selection)}
            favorite={favoriteIds.includes(item.id)}
            onOpen={() => onOpen(item.id)}
            onAdd={() => onAdd(item)}
            onToggleFavorite={() => onToggleFavorite(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

function AdvisorRecommendationCard({
  recommendation,
  selected,
  onOpen,
  onAdd,
}: {
  recommendation: BuildSuiteAdvisorRecommendation;
  selected: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const item = recommendation.item;
  const Icon = iconMap[item.icon] ?? Boxes;

  return (
    <article className="group grid gap-4 border border-emerald-500/20 bg-black/35 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/60 hover:bg-emerald-400/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center border ${accentClasses[item.accentColor]}`}
          >
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">
              {item.category}
            </p>
            <h3 className="mt-1 text-lg font-bold text-emerald-50">
              {item.label}
            </h3>
          </div>
        </div>
        <span className="border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs uppercase tracking-[0.16em] text-cyan-100">
          {recommendation.estimatedImplementationImpact} impact
        </span>
      </div>

      <p className="text-sm leading-6 text-emerald-50/70">
        {recommendation.reason}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="border border-emerald-500/20 bg-black/25 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/60">
            Confidence
          </p>
          <p className="mt-1 text-xl font-bold text-emerald-50">
            {recommendation.confidenceScore}%
          </p>
        </div>
        <div className="border border-emerald-500/20 bg-black/25 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/60">
            Compatibility
          </p>
          <p className="mt-1 text-xl font-bold text-emerald-50">
            {recommendation.compatibilityScore}%
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {item.badges.slice(0, 2).map((badge) => (
          <span
            key={badge}
            className="border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100"
          >
            {badge}
          </span>
        ))}
        {item.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="border border-emerald-500/20 bg-black/20 px-2 py-1 text-xs text-emerald-100/70"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-xs uppercase tracking-[0.22em] text-emerald-300/80 transition hover:text-emerald-100"
        >
          View details
        </button>
        <button
          type="button"
          onClick={onAdd}
          className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition hover:-translate-y-0.5 ${
            selected
              ? 'border-emerald-200 bg-emerald-300 text-black'
              : 'border-emerald-400/50 text-emerald-100 hover:border-emerald-200 hover:bg-emerald-300 hover:text-black'
          }`}
        >
          {selected ? 'Added' : 'Add to Build'}
        </button>
      </div>
    </article>
  );
}

function BuildAdvisorPanel({
  sections,
  selection,
  onOpen,
  onAdd,
}: {
  sections: BuildSuiteAdvisorSection[];
  selection: BuildSuiteSelection;
  onOpen: (id: string) => void;
  onAdd: (item: BuildSuiteEnhancedItem) => void;
}) {
  const visibleSections = sections.slice(0, 9);

  if (!visibleSections.length) return null;

  return (
    <section className="grid gap-5 border border-cyan-300/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.1),rgba(16,185,129,0.06),rgba(0,0,0,0.35))] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.38em] text-cyan-200">
            Intelligent Build Advisor
          </p>
          <h2 className="mt-2 text-3xl font-bold text-emerald-50">
            Metadata-driven recommendations for this build
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-emerald-50/68">
            The advisor studies selected app types, styles, layouts, tags,
            compatibility, and related add-ons. No model calls are made here.
          </p>
        </div>
        <span className="border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs uppercase tracking-[0.22em] text-emerald-100">
          {getSelectedIds(selection).size} selected
        </span>
      </div>

      <div className="grid gap-6">
        {visibleSections.map((section) => (
          <div key={section.id} className="grid gap-3">
            <div>
              <h3 className="text-xl font-bold text-emerald-50">
                {section.title}
              </h3>
              <p className="mt-1 text-sm text-emerald-50/58">
                {section.description}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {section.recommendations.slice(0, 3).map((recommendation) => (
                <AdvisorRecommendationCard
                  key={`${section.id}-${recommendation.item.id}`}
                  recommendation={recommendation}
                  selected={itemIsSelected(recommendation.item, selection)}
                  onOpen={() => onOpen(recommendation.item.id)}
                  onAdd={() => onAdd(recommendation.item)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MarketplaceFilters({
  query,
  setQuery,
  category,
  setCategory,
  difficulty,
  setDifficulty,
  impact,
  setImpact,
  appType,
  setAppType,
  sortMode,
  setSortMode,
  categories,
  count,
}: {
  query: string;
  setQuery: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  difficulty: string;
  setDifficulty: (value: string) => void;
  impact: string;
  setImpact: (value: string) => void;
  appType: string;
  setAppType: (value: string) => void;
  sortMode: MarketplaceSort;
  setSortMode: (value: MarketplaceSort) => void;
  categories: string[];
  count: number;
}) {
  return (
    <div className="grid gap-3 border border-emerald-500/25 bg-black/35 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-emerald-300">
        <SlidersHorizontal size={15} />
        Search and filters
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300/70"
            size={18}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search marketplace..."
            className="h-12 w-full border border-emerald-500/25 bg-black/45 pl-11 pr-4 text-sm text-emerald-50 outline-none transition placeholder:text-emerald-100/35 focus:border-emerald-300"
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="h-12 border border-emerald-500/25 bg-black/45 px-3 text-sm text-emerald-50 outline-none focus:border-emerald-300"
        >
          <option value="all">All categories</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value)}
          className="h-12 border border-emerald-500/25 bg-black/45 px-3 text-sm text-emerald-50 outline-none focus:border-emerald-300"
        >
          <option value="all">All difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="advanced">Advanced</option>
        </select>
        <select
          value={impact}
          onChange={(event) => setImpact(event.target.value)}
          className="h-12 border border-emerald-500/25 bg-black/45 px-3 text-sm text-emerald-50 outline-none focus:border-emerald-300"
        >
          <option value="all">All impact</option>
          <option value="low">Low impact</option>
          <option value="medium">Medium impact</option>
          <option value="high">High impact</option>
        </select>
        <select
          value={appType}
          onChange={(event) => setAppType(event.target.value)}
          className="h-12 border border-emerald-500/25 bg-black/45 px-3 text-sm text-emerald-50 outline-none focus:border-emerald-300"
        >
          <option value="all">All app types</option>
          {buildSuiteCatalog.appTypes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as MarketplaceSort)}
          className="h-12 border border-emerald-500/25 bg-black/45 px-3 text-sm text-emerald-50 outline-none focus:border-emerald-300"
        >
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>
              Sort: {label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/65">
        {count} enhancements shown
      </p>
    </div>
  );
}

function AppearanceCard({
  id,
  label,
  description,
  selected,
  onSelect,
}: {
  id: BuildSuiteAppearance;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = id === 'light' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group min-h-[260px] border p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:bg-emerald-400/10 ${
        selected
          ? 'border-emerald-200 bg-emerald-300/15'
          : 'border-emerald-500/25 bg-black/35'
      }`}
    >
      <div className="flex items-start justify-between">
        <div
          className={`grid h-14 w-14 place-items-center border ${
            selected
              ? 'border-emerald-200 bg-emerald-300 text-black'
              : 'border-emerald-500/35 bg-emerald-400/10 text-emerald-200'
          }`}
        >
          <Icon size={25} strokeWidth={1.8} />
        </div>
        <span className="border border-amber-300/45 bg-amber-300/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
          Recommended
        </span>
      </div>
      <BuildSuiteAppearancePreview appearance={id} />
      <p className="mt-7 text-3xl font-bold text-emerald-50">{label}</p>
      <p className="mt-4 max-w-md text-sm leading-6 text-emerald-50/72">
        {description}
      </p>
      <div className="mt-7 flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">
          {selected ? 'Selected' : 'Choose appearance'}
        </span>
        <span
          className={`grid h-8 w-8 place-items-center border ${
            selected
              ? 'border-emerald-200 bg-emerald-300 text-black'
              : 'border-emerald-500/30 text-emerald-200/55 group-hover:border-emerald-300'
          }`}
        >
          {selected ? <Check size={17} /> : <Sparkles size={15} />}
        </span>
      </div>
    </button>
  );
}

function StepRail({
  activeStep,
  setActiveStep,
}: {
  activeStep: number;
  setActiveStep: (step: number) => void;
}) {
  return (
    <aside className="border border-emerald-500/25 bg-black/35 p-3 lg:sticky lg:top-6 lg:self-start">
      <div className="grid gap-2">
        {steps.map((step, index) => {
          const Icon = stepIcons[index];
          return (
            <button
              key={step}
              type="button"
              onClick={() => setActiveStep(index)}
              className={`group flex items-center justify-between border px-3 py-3 text-left text-sm transition duration-200 hover:translate-x-1 ${
                activeStep === index
                  ? 'border-emerald-300 bg-emerald-400/10 text-emerald-100'
                  : 'border-transparent text-emerald-100/60 hover:border-emerald-500/30 hover:text-emerald-100'
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`grid h-8 w-8 place-items-center border ${
                    activeStep === index
                      ? 'border-emerald-300 bg-emerald-300 text-black'
                      : 'border-emerald-500/20 text-emerald-200/55 group-hover:border-emerald-300/50'
                  }`}
                >
                  <Icon size={15} />
                </span>
                <span>{step}</span>
              </span>
              <span className="text-xs text-emerald-300/65">
                {String(index + 1).padStart(2, '0')}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function StepHeader({
  activeStep,
  canAdvance,
}: {
  activeStep: number;
  canAdvance: boolean;
}) {
  const Icon = stepIcons[activeStep];

  return (
    <div className="overflow-hidden border border-emerald-500/30 bg-black/45">
      <div className="flex flex-wrap items-center justify-between gap-5 border-b border-emerald-500/20 bg-emerald-400/5 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center border border-emerald-400/40 bg-emerald-400/10 text-emerald-200">
            <Icon size={24} strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">
              Step {activeStep + 1} of {steps.length}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-emerald-50">
              {steps[activeStep]}
            </h2>
          </div>
        </div>
        <span
          className={`border px-3 py-2 text-xs uppercase tracking-[0.25em] ${
            canAdvance
              ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200'
              : 'border-amber-300/70 bg-amber-300/10 text-amber-200'
          }`}
        >
          {canAdvance ? 'Ready' : 'Choose option'}
        </span>
      </div>
      <p className="p-5 text-sm leading-6 text-emerald-50/68">
        {stepDescriptions[activeStep]}
      </p>
    </div>
  );
}

function OptionCard({
  item,
  selected,
  onSelect,
}: {
  item: BuildSuiteEnhancedItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = iconMap[item.icon] ?? Boxes;
  const complexity = item.complexity ?? 'low';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex min-h-[310px] flex-col overflow-hidden border p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:bg-emerald-400/10 ${
        selected
          ? 'border-emerald-200 bg-emerald-300/15'
          : 'border-emerald-500/25 bg-black/35'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`grid h-12 w-12 place-items-center border ${
            selected
              ? 'border-emerald-200 bg-emerald-300 text-black'
              : 'border-emerald-500/35 bg-emerald-400/10 text-emerald-200'
          }`}
        >
          <Icon size={22} strokeWidth={1.8} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {item.popularity >= 5 ? (
            <span className="inline-flex items-center gap-1 border border-amber-300/45 bg-amber-300/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
              <Star size={12} />
              Recommended
            </span>
          ) : null}
          <span
            className={`border px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${complexityClasses[complexity]}`}
          >
            {complexity}
          </span>
        </div>
      </div>
      <BuildSuiteCardPreview item={item} />
      <p className="mt-5 text-xl font-bold tracking-normal text-emerald-50">
        {item.label}
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.3em] text-emerald-300/75">
        {item.category}
      </p>
      <p className="mt-4 text-sm leading-6 text-emerald-50/72">
        {item.description}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
          {ratingText(item)}
        </span>
        <span
          className={`border px-2 py-1 text-xs uppercase tracking-[0.16em] ${impactClasses[item.estimatedGenerationImpact]}`}
        >
          {item.estimatedGenerationImpact} impact
        </span>
        {item.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="border border-emerald-500/20 bg-black/20 px-2 py-1 text-xs text-emerald-100/75"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-end justify-between pt-6">
        <span className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">
          {selected ? 'Selected' : 'Tap to select'}
        </span>
        <span
          className={`grid h-8 w-8 place-items-center border ${
            selected
              ? 'border-emerald-200 bg-emerald-300 text-black'
              : 'border-emerald-500/30 text-emerald-200/55 group-hover:border-emerald-300'
          }`}
        >
          {selected ? <Check size={17} /> : <Sparkles size={15} />}
        </span>
      </div>
    </button>
  );
}

function OptionBrowser({
  items,
  selectedId,
  selectedIds,
  onSelect,
  relatedItems,
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  complexityFilter,
  setComplexityFilter,
  collectionFilter,
  setCollectionFilter,
}: {
  items: BuildSuiteEnhancedItem[];
  selectedId?: string;
  selectedIds?: string[];
  onSelect: (id: string) => void;
  relatedItems: BuildSuiteEnhancedItem[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  complexityFilter: string;
  setComplexityFilter: (value: string) => void;
  collectionFilter: BuildSuiteFeaturedCollection['id'] | 'all';
  setCollectionFilter: (value: BuildSuiteFeaturedCollection['id'] | 'all') => void;
}) {
  const categories = getCategories(items);
  const collectionItems =
    collectionFilter === 'all'
      ? []
      : getBuildSuiteCollectionItems(collectionFilter)
          .map((item) => item.id)
          .filter((id) => items.some((item) => item.id === id));
  const collectionItemIds = new Set(collectionItems);
  const filteredItems = items.filter((item) => {
    const complexity = item.complexity ?? 'low';
    return (
      (collectionFilter === 'all' || collectionItemIds.has(item.id)) &&
      filterItems(
        [item],
        searchQuery,
        categoryFilter,
        'all',
        'all',
        'all'
      ).length > 0 &&
      (complexityFilter === 'all' || complexity === complexityFilter)
    );
  });
  const relatedItemIds = new Set(relatedItems.map((item) => item.id));
  const relatedOptions = items.filter(
    (item) =>
      relatedItemIds.has(item.id) &&
      selectedId !== item.id &&
      !selectedIds?.includes(item.id)
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCollectionFilter('all')}
          className={`border px-3 py-2 text-xs uppercase tracking-[0.18em] transition ${
            collectionFilter === 'all'
              ? 'border-emerald-300 bg-emerald-300 text-black'
              : 'border-emerald-500/25 bg-black/35 text-emerald-100/70 hover:border-emerald-300'
          }`}
        >
          All
        </button>
        {featuredBuildSuiteCollections.map((collection) => {
          const count = getBuildSuiteCollectionItems(collection.id).filter(
            (item) => items.some((candidate) => candidate.id === item.id)
          ).length;
          if (count === 0) return null;

          return (
            <button
              key={collection.id}
              type="button"
              onClick={() => setCollectionFilter(collection.id)}
              className={`border px-3 py-2 text-left transition hover:-translate-y-0.5 ${
                collectionFilter === collection.id
                  ? 'border-emerald-300 bg-emerald-300 text-black'
                  : 'border-emerald-500/25 bg-black/35 text-emerald-100/75 hover:border-emerald-300 hover:bg-emerald-400/10'
              }`}
              title={collection.description}
            >
              <span className="block text-xs font-semibold uppercase tracking-[0.18em]">
                {collection.label}
              </span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] opacity-70">
                {collection.badge} - {count}
              </span>
            </button>
          );
        })}
      </div>

      {relatedOptions.length ? (
        <div className="border border-cyan-300/25 bg-cyan-300/10 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-100">
            <Sparkles size={14} />
            People also add
          </div>
          <div className="flex flex-wrap gap-2">
            {relatedOptions.slice(0, 6).map((item) => {
              const Icon = iconMap[item.icon] ?? Boxes;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="inline-flex items-center gap-2 border border-cyan-300/35 bg-black/30 px-3 py-2 text-sm text-cyan-50 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-300/15"
                >
                  <Icon size={14} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 border border-emerald-500/20 bg-black/25 p-3 md:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300/70"
            size={18}
          />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search options, tags, categories..."
            className="h-12 w-full border border-emerald-500/25 bg-black/45 pl-11 pr-4 text-sm text-emerald-50 outline-none transition placeholder:text-emerald-100/35 focus:border-emerald-300"
          />
        </label>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-12 border border-emerald-500/25 bg-black/45 px-4 text-sm text-emerald-50 outline-none transition focus:border-emerald-300"
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          value={complexityFilter}
          onChange={(event) => setComplexityFilter(event.target.value)}
          className="h-12 border border-emerald-500/25 bg-black/45 px-4 text-sm text-emerald-50 outline-none transition focus:border-emerald-300"
        >
          <option value="all">All complexity</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-emerald-300/70">
        <span>{filteredItems.length} options shown</span>
        <span>Wizard browse mode</span>
      </div>

      {filteredItems.length ? (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {filteredItems.map((item) => (
            <OptionCard
              key={item.id}
              item={item}
              selected={
                selectedId === item.id || Boolean(selectedIds?.includes(item.id))
              }
              onSelect={() => onSelect(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="border border-amber-300/35 bg-amber-300/10 p-8 text-center text-amber-100">
          No matching options. Clear search or filters to keep browsing.
        </div>
      )}
    </div>
  );
}

export default function MatrixBuildSuiteClient() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [marketplaceView, setMarketplaceView] =
    useState<MarketplaceView>('home');
  const [detailItemId, setDetailItemId] = useState<string>();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [marketplaceQuery, setMarketplaceQuery] = useState('');
  const [chatHandoffStatus, setChatHandoffStatus] = useState<string | null>(
    null
  );
  const [marketplaceCategory, setMarketplaceCategory] = useState('all');
  const [marketplaceDifficulty, setMarketplaceDifficulty] = useState('all');
  const [marketplaceImpact, setMarketplaceImpact] = useState('all');
  const [marketplaceAppType, setMarketplaceAppType] = useState('all');
  const [marketplaceSort, setMarketplaceSort] =
    useState<MarketplaceSort>('popularity');
  const [previewTemplateId, setPreviewTemplateId] = useState<string>(
    buildSuiteTemplatePacks[0]?.id ?? ''
  );
  const [templateStatus, setTemplateStatus] = useState(
    'Template Packs ready.'
  );
  const [savedBuilds, setSavedBuilds] = useState<BuildSuiteSavedBuild[]>([]);
  const [savedBuildSource, setSavedBuildSource] = useState<'supabase' | 'local'>(
    'local'
  );
  const [savedBuildStatus, setSavedBuildStatus] = useState(
    'Build Library ready.'
  );
  const [buildLibraryQuery, setBuildLibraryQuery] = useState('');
  const [buildLibrarySort, setBuildLibrarySort] =
    useState<BuildSuiteSavedBuildSort>('updated');
  const [buildLibraryFilters, setBuildLibraryFilters] =
    useState<BuildSuiteSavedBuildFilters>({});
  const importBuildInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [complexityFilter, setComplexityFilter] = useState('all');
  const [collectionFilter, setCollectionFilter] = useState<
    BuildSuiteFeaturedCollection['id'] | 'all'
  >('all');
  const [selection, setSelection] = useState<BuildSuiteSelection>(() =>
    cloneSelection()
  );
  const [sourceTemplateId, setSourceTemplateId] = useState<string>();
  const [sourceSavedBuildId, setSourceSavedBuildId] = useState<string>();

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadBuildSuiteSavedBuilds().then((result) => {
      if (!active) return;
      setSavedBuilds(result.builds);
      setSavedBuildSource(result.source);
      setSavedBuildStatus(
        result.warning
          ? `Using local Build Library fallback. ${result.warning}`
          : result.source === 'supabase'
            ? 'Build Library synced with Supabase.'
            : 'Build Library using local storage fallback.'
      );
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSearchQuery('');
    setCategoryFilter('all');
    setComplexityFilter('all');
    setCollectionFilter('all');
  }, [activeStep]);

  const allItems = useMemo(() => getAllBuildSuiteItems(), []);
  const marketplaceCategories = useMemo(() => getCategories(allItems), [allItems]);
  const filteredMarketplaceItems = useMemo(
    () =>
      sortItems(
        filterItems(
          allItems,
          marketplaceQuery,
          marketplaceCategory,
          marketplaceDifficulty,
          marketplaceImpact,
          marketplaceAppType
        ),
        marketplaceSort
      ),
    [
      allItems,
      marketplaceQuery,
      marketplaceCategory,
      marketplaceDifficulty,
      marketplaceImpact,
      marketplaceAppType,
      marketplaceSort,
    ]
  );

  const availablePalettes = useMemo(() => {
    if (!selection.appearance) return [];
    return filterPalettesByAppearance(
      selection.appearance,
      buildSuiteCatalog.palettes
    );
  }, [selection.appearance]);

  const relatedItems = useMemo(
    () => getRelatedBuildSuiteItems(selection),
    [selection]
  );

  const advisorReport = useMemo(
    () => getBuildSuiteAdvisorReport(selection),
    [selection]
  );

  const promptResult = useMemo(
    () => buildMatrixBuildSuitePrompt(selection),
    [selection]
  );
  const buildManifest = useMemo(
    () =>
      createBuildManifest({
        selection,
        templateId: sourceTemplateId,
        savedBuildId: sourceSavedBuildId,
      }),
    [selection, sourceTemplateId, sourceSavedBuildId]
  );

  const visibleSavedBuilds = useMemo(
    () =>
      searchSortAndFilterBuildSuiteSavedBuilds(savedBuilds, {
        query: buildLibraryQuery,
        sort: buildLibrarySort,
        filters: buildLibraryFilters,
      }),
    [savedBuilds, buildLibraryQuery, buildLibrarySort, buildLibraryFilters]
  );
  const previewTemplate = useMemo(
    () =>
      buildSuiteTemplatePacks.find(
        (template) => template.id === previewTemplateId
      ) ?? buildSuiteTemplatePacks[0],
    [previewTemplateId]
  );

  const applySavedBuildResult = (
    result: Awaited<ReturnType<typeof saveBuildSuiteSavedBuild>>,
    successMessage: string
  ) => {
    setSavedBuilds(result.builds);
    setSavedBuildSource(result.source);
    setSavedBuildStatus(
      result.warning
        ? `${successMessage} ${result.warning}`
        : `${successMessage} ${
            result.source === 'supabase'
              ? 'Synced with Supabase.'
              : 'Saved locally.'
          }`
    );
  };

  const restoreSavedSelection = (build: BuildSuiteSavedBuild) => {
    setSelection({
      ...build.selection,
      componentIds: [...build.selection.componentIds],
      aiFeatureIds: [...build.selection.aiFeatureIds],
      integrationIds: [...build.selection.integrationIds],
    });
    setSourceTemplateId(undefined);
    setSourceSavedBuildId(build.id);
    setMarketplaceView('wizard');
    setActiveStep(steps.length - 1);
    setSavedBuildStatus(`Loaded "${build.name}" into the Build Wizard.`);
  };

  const applyTemplateSelection = (template: BuildSuiteTemplatePack) => {
    setSelection(cloneBuildSuiteTemplateSelection(template));
    setSourceTemplateId(template.id);
    setSourceSavedBuildId(undefined);
    setMarketplaceView('wizard');
    setActiveStep(steps.length - 1);
    setTemplateStatus(`Applied "${template.label}". Review and adjust before sending.`);
  };

  const saveCurrentBuild = async () => {
    const defaultName =
      promptResult.selectedItems[0]?.label ?? 'Matrix Build Suite Build';
    const name = window.prompt('Name this saved build', defaultName);
    if (!name) return;

    try {
      const build = createBuildSuiteSavedBuild({
        name,
        selection,
        advisorReport,
        finalPrompt: promptResult.prompt,
      });
      const result = await saveBuildSuiteSavedBuild(build, savedBuilds);
      applySavedBuildResult(result, `Saved "${build.name}".`);
    } catch (error) {
      setSavedBuildStatus(
        error instanceof Error ? error.message : 'Could not save this build.'
      );
    }
  };

  const updateSavedBuild = async (
    build: BuildSuiteSavedBuild,
    successMessage: string
  ) => {
    const result = await saveBuildSuiteSavedBuild(build, savedBuilds);
    applySavedBuildResult(result, successMessage);
  };

  const renameSavedBuild = async (build: BuildSuiteSavedBuild) => {
    const name = window.prompt('Rename saved build', build.name);
    if (!name) return;
    try {
      await updateSavedBuild(
        renameBuildSuiteSavedBuild(build, name),
        `Renamed "${build.name}".`
      );
    } catch (error) {
      setSavedBuildStatus(
        error instanceof Error ? error.message : 'Could not rename this build.'
      );
    }
  };

  const duplicateSavedBuild = async (build: BuildSuiteSavedBuild) => {
    const duplicate = duplicateBuildSuiteSavedBuild(build);
    await updateSavedBuild(duplicate, `Duplicated "${build.name}".`);
  };

  const toggleSavedBuildFavorite = async (build: BuildSuiteSavedBuild) => {
    const updated = toggleBuildSuiteSavedBuildFavorite(build);
    await updateSavedBuild(
      updated,
      updated.favorite
        ? `Favorited "${build.name}".`
        : `Removed "${build.name}" from favorites.`
    );
  };

  const deleteSavedBuild = async (build: BuildSuiteSavedBuild) => {
    if (!window.confirm(`Delete "${build.name}"?`)) return;
    const result = await deleteBuildSuiteSavedBuild(build.id, savedBuilds);
    setSavedBuilds(result.builds);
    setSavedBuildSource(result.source);
    setSavedBuildStatus(
      result.warning
        ? `Deleted "${build.name}" locally. ${result.warning}`
        : `Deleted "${build.name}".`
    );
  };

  const exportSavedBuild = (build: BuildSuiteSavedBuild) => {
    const blob = new Blob([exportBuildSuiteSavedBuild(build)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${build.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'matrix-build'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSavedBuildStatus(`Exported "${build.name}" as JSON.`);
  };

  const importSavedBuild = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const build = importBuildSuiteSavedBuild(text);
      const result = await saveBuildSuiteSavedBuild(build, savedBuilds);
      applySavedBuildResult(result, `Imported "${build.name}".`);
    } catch (error) {
      setSavedBuildStatus(
        error instanceof Error ? error.message : 'Could not import this build.'
      );
    }
  };

  const saveTemplateAsBuild = async (template: BuildSuiteTemplatePack) => {
    const templateSelection = cloneBuildSuiteTemplateSelection(template);
    const templatePrompt = buildMatrixBuildSuitePrompt(templateSelection);
    const templateAdvisorReport = getBuildSuiteAdvisorReport(templateSelection);

    try {
      const build = createBuildSuiteSavedBuild({
        name: template.label,
        selection: templateSelection,
        advisorReport: templateAdvisorReport,
        finalPrompt: templatePrompt.prompt,
      });
      const result = await saveBuildSuiteSavedBuild(build, savedBuilds);
      applySavedBuildResult(result, `Saved "${template.label}" as a Build.`);
      setTemplateStatus(`Saved "${template.label}" to the Build Library.`);
    } catch (error) {
      setTemplateStatus(
        error instanceof Error
          ? error.message
          : 'Could not save this template as a build.'
      );
    }
  };

  const insertTemplateIntoChat = (template: BuildSuiteTemplatePack) => {
    try {
      if (typeof window === 'undefined') return;
      const templateSelection = cloneBuildSuiteTemplateSelection(template);
      const templatePrompt = buildMatrixBuildSuitePrompt(templateSelection);
      const templateManifest = createBuildManifest({
        selection: templateSelection,
        templateId: template.id,
      });
      writeMatrixBuildSuiteChatHandoff(
        window.sessionStorage,
        templatePrompt.prompt,
        undefined,
        templateManifest
      );
      setChatHandoffStatus(MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE);
      router.push('/chat-workspace');
    } catch (error) {
      setTemplateStatus(
        error instanceof Error
          ? error.message
          : 'Could not prepare this template prompt for chat.'
      );
    }
  };

  const insertPromptIntoChat = () => {
    try {
      if (typeof window === 'undefined') return;
      writeMatrixBuildSuiteChatHandoff(
        window.sessionStorage,
        promptResult.prompt,
        undefined,
        buildManifest
      );
      setChatHandoffStatus(MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE);
      router.push('/chat-workspace');
    } catch (error) {
      setChatHandoffStatus(
        error instanceof Error
          ? error.message
          : 'Could not prepare the prompt for chat.'
      );
    }
  };

  const canAdvance = useMemo(() => {
    if (activeStep === 0) return Boolean(selection.appTypeId);
    if (activeStep === 1) return Boolean(selection.appearance);
    if (activeStep === 2) return Boolean(selection.paletteId);
    if (activeStep === 3) return Boolean(selection.styleId);
    if (activeStep === 4) return Boolean(selection.layoutId);
    if (activeStep === 8) return Boolean(selection.animationId);
    if (activeStep === 9) return Boolean(selection.mobileId);
    return true;
  }, [activeStep, selection]);

  const detailItem = detailItemId
    ? allItems.find((item) => item.id === detailItemId)
    : undefined;
  const favoriteItems = allItems.filter((item) => favoriteIds.includes(item.id));
  const recentItems = recentIds
    .map((id) => allItems.find((item) => item.id === id))
    .filter((item): item is BuildSuiteEnhancedItem => Boolean(item));

  const setSingleSelection = (
    key: keyof BuildSuiteSelection,
    id: string | BuildSuiteAppearance
  ) => {
    setSourceTemplateId(undefined);
    setSourceSavedBuildId(undefined);
    setSelection((current) => ({ ...current, [key]: id }));
  };

  const selectAppearance = (appearance: BuildSuiteAppearance) => {
    setSourceTemplateId(undefined);
    setSourceSavedBuildId(undefined);
    setSelection((current) => {
      const palettes = filterPalettesByAppearance(
        appearance,
        buildSuiteCatalog.palettes
      );
      const currentPalette = palettes.some(
        (palette) => palette.id === current.paletteId
      )
        ? current.paletteId
        : undefined;

      return {
        ...current,
        appearance,
        paletteId: currentPalette,
      };
    });
  };

  const toggleMultiSelection = (
    key: 'componentIds' | 'aiFeatureIds' | 'integrationIds',
    id: string
  ) => {
    setSourceTemplateId(undefined);
    setSourceSavedBuildId(undefined);
    setSelection((current) => ({
      ...current,
      [key]: toggleId(current[key], id),
    }));
  };

  const addMarketplaceItem = (item: BuildSuiteEnhancedItem) => {
    const bucket = getCatalogBucket(item);

    if (bucket === 'appTypes') {
      setSingleSelection('appTypeId', item.id);
      return;
    }
    if (bucket === 'palettes') {
      const appearance = item.compatibleWith?.appearances?.[0];
      setSourceTemplateId(undefined);
      setSourceSavedBuildId(undefined);
      setSelection((current) => ({
        ...current,
        appearance: current.appearance ?? appearance,
        paletteId: item.id,
      }));
      return;
    }
    if (bucket === 'styles') {
      setSingleSelection('styleId', item.id);
      return;
    }
    if (bucket === 'layouts') {
      setSingleSelection('layoutId', item.id);
      return;
    }
    if (bucket === 'animations') {
      setSingleSelection('animationId', item.id);
      return;
    }
    if (bucket === 'mobile') {
      setSingleSelection('mobileId', item.id);
      return;
    }
    if (bucket === 'components') {
      toggleMultiSelection('componentIds', item.id);
      return;
    }
    if (bucket === 'aiFeatures') {
      toggleMultiSelection('aiFeatureIds', item.id);
      return;
    }
    if (bucket === 'integrations') {
      toggleMultiSelection('integrationIds', item.id);
    }
  };

  const openMarketplaceItem = (id: string) => {
    setDetailItemId(id);
    setRecentIds((current) => [id, ...current.filter((value) => value !== id)].slice(0, 8));
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) => toggleId(current, id));
  };

  const browseCollection = (collectionId: BuildSuiteFeaturedCollection['id']) => {
    setMarketplaceQuery('');
    setMarketplaceCategory('all');
    setMarketplaceDifficulty('all');
    setMarketplaceImpact('all');
    setMarketplaceAppType('all');
    setMarketplaceSort('popularity');
    const collectionItems = getBuildSuiteCollectionItems(collectionId);
    const firstTag = collectionItems[0]?.tags[0];
    if (firstTag) setMarketplaceQuery(firstTag);
    setMarketplaceView('browse');
  };

  const nextStep = () => {
    if (!canAdvance) return;
    setActiveStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const previousStep = () => {
    setActiveStep((current) => Math.max(current - 1, 0));
  };

  const renderTemplatePacks = () => {
    const activeTemplate = previewTemplate;
    const activeTemplatePrompt = activeTemplate
      ? buildMatrixBuildSuitePrompt(activeTemplate.selection)
      : undefined;
    const activeAppType = activeTemplate?.selection.appTypeId
      ? findBuildSuiteItems([activeTemplate.selection.appTypeId])[0]
      : undefined;

    return (
      <section className="mt-8 border border-emerald-500/30 bg-black/35 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-emerald-300">
              Template Packs
            </p>
            <h2 className="mt-2 text-2xl font-bold text-emerald-100">
              Start from a full app blueprint
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/65">
              Pick a complete app template to fill the wizard instantly. You can
              preview, apply, save, or send the generated prompt to chat without
              changing the prompt builder itself.
            </p>
            <p className="mt-2 text-xs text-emerald-300/75">
              {templateStatus}
            </p>
          </div>
          {activeTemplate ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyTemplateSelection(activeTemplate)}
                className="border border-emerald-300 bg-emerald-300 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-black transition hover:-translate-y-0.5"
              >
                Apply Template
              </button>
              <button
                type="button"
                onClick={() => saveTemplateAsBuild(activeTemplate)}
                className="border border-emerald-500/45 px-4 py-3 text-xs uppercase tracking-[0.22em] text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-300"
              >
                Save as Build
              </button>
              <button
                type="button"
                onClick={() => insertTemplateIntoChat(activeTemplate)}
                className="border border-cyan-300/45 px-4 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-200"
              >
                Insert into Chat
              </button>
            </div>
          ) : null}
        </div>

        {activeTemplate ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <article className="border border-emerald-500/25 bg-black/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-emerald-300/75">
                    Preview Template
                  </p>
                  <h3 className="mt-2 text-3xl font-bold text-emerald-50">
                    {activeTemplate.label}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-emerald-50/70">
                    {activeTemplate.description}
                  </p>
                </div>
                <span className="border border-emerald-500/35 px-3 py-2 text-xs text-emerald-100/75">
                  {activeTemplate.category}
                </span>
              </div>

              {activeAppType ? <BuildSuiteCardPreview item={activeAppType} /> : null}

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {activeTemplate.highlights.map((highlight) => (
                  <span
                    key={highlight}
                    className="border border-emerald-500/25 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100"
                  >
                    {highlight}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeTemplate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border border-emerald-500/20 px-2 py-1 text-xs text-emerald-100/65"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>

            <article className="border border-emerald-500/25 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-300/75">
                Default selections
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(activeTemplatePrompt?.selectedItems ?? []).slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="border border-emerald-500/20 bg-black/25 p-3"
                  >
                    <p className="text-sm font-semibold text-emerald-50">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs text-emerald-100/55">
                      {item.category}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-emerald-100/65">
                <span>
                  Components: {activeTemplate.selection.componentIds.length}
                </span>
                <span>
                  Integrations: {activeTemplate.selection.integrationIds.length}
                </span>
                <span>AI: {activeTemplate.selection.aiFeatureIds.length}</span>
              </div>
            </article>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {buildSuiteTemplatePacks.map((template) => {
            const appType = template.selection.appTypeId
              ? findBuildSuiteItems([template.selection.appTypeId])[0]
              : undefined;
            const selected = template.id === previewTemplateId;

            return (
              <article
                key={template.id}
                className={`grid gap-3 border p-3 transition hover:-translate-y-1 ${
                  selected
                    ? 'border-emerald-300 bg-emerald-300/10 shadow-[0_0_28px_rgba(52,211,153,0.16)]'
                    : 'border-emerald-500/20 bg-black/25 hover:border-emerald-300/70'
                }`}
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">
                    {template.category}
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-emerald-50">
                    {template.label}
                  </h3>
                </div>
                {appType ? <BuildSuiteCardPreview item={appType} /> : null}
                <p className="text-sm leading-6 text-emerald-50/65">
                  {template.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewTemplateId(template.id);
                      setTemplateStatus(`Previewing "${template.label}".`);
                    }}
                    className="border border-emerald-500/45 px-3 py-2 text-xs uppercase tracking-[0.18em] text-emerald-100 transition hover:border-emerald-300"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplateSelection(template)}
                    className="border border-emerald-300 bg-emerald-300 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black transition hover:-translate-y-0.5"
                  >
                    Apply
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  const renderBuildLibrary = () => (
    <section className="mt-8 border border-emerald-500/30 bg-black/35 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.36em] text-emerald-300">
            Build Library
          </p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-100">
            Saved Builds
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/65">
            Save complete Build Suite configurations, reload them later, and
            keep a JSON copy for sharing or backup.
          </p>
          <p className="mt-2 text-xs text-emerald-300/75">
            {savedBuildStatus} Source: {savedBuildSource}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveCurrentBuild}
            disabled={promptResult.missingSelection.length > 0}
            className="border border-emerald-300 bg-emerald-300 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Save Current Build
          </button>
          <button
            type="button"
            onClick={() => importBuildInputRef.current?.click()}
            className="border border-emerald-500/45 px-4 py-3 text-xs uppercase tracking-[0.22em] text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-300"
          >
            Import Build JSON
          </button>
          <input
            ref={importBuildInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={importSavedBuild}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))]">
        <label className="grid gap-2 text-xs uppercase tracking-[0.18em] text-emerald-300/80">
          Search
          <input
            value={buildLibraryQuery}
            onChange={(event) => setBuildLibraryQuery(event.target.value)}
            placeholder="Search saved builds..."
            className="border border-emerald-500/25 bg-black/40 px-3 py-2 text-sm normal-case tracking-normal text-emerald-50 outline-none focus:border-emerald-300"
          />
        </label>
        <label className="grid gap-2 text-xs uppercase tracking-[0.18em] text-emerald-300/80">
          Sort
          <select
            value={buildLibrarySort}
            onChange={(event) =>
              setBuildLibrarySort(event.target.value as BuildSuiteSavedBuildSort)
            }
            className="border border-emerald-500/25 bg-black/40 px-3 py-2 text-sm normal-case tracking-normal text-emerald-50 outline-none focus:border-emerald-300"
          >
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="name">Name</option>
            <option value="favorites">Favorites</option>
          </select>
        </label>
        <label className="grid gap-2 text-xs uppercase tracking-[0.18em] text-emerald-300/80">
          App type
          <select
            value={buildLibraryFilters.appTypeId ?? ''}
            onChange={(event) =>
              setBuildLibraryFilters((current) => ({
                ...current,
                appTypeId: event.target.value || undefined,
              }))
            }
            className="border border-emerald-500/25 bg-black/40 px-3 py-2 text-sm normal-case tracking-normal text-emerald-50 outline-none focus:border-emerald-300"
          >
            <option value="">All app types</option>
            {buildSuiteCatalog.appTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs uppercase tracking-[0.18em] text-emerald-300/80">
          Theme
          <select
            value={buildLibraryFilters.theme ?? ''}
            onChange={(event) =>
              setBuildLibraryFilters((current) => ({
                ...current,
                theme: (event.target.value || undefined) as
                  | BuildSuiteAppearance
                  | undefined,
              }))
            }
            className="border border-emerald-500/25 bg-black/40 px-3 py-2 text-sm normal-case tracking-normal text-emerald-50 outline-none focus:border-emerald-300"
          >
            <option value="">All themes</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="grid gap-2 text-xs uppercase tracking-[0.18em] text-emerald-300/80">
          Style
          <select
            value={buildLibraryFilters.styleId ?? ''}
            onChange={(event) =>
              setBuildLibraryFilters((current) => ({
                ...current,
                styleId: event.target.value || undefined,
              }))
            }
            className="border border-emerald-500/25 bg-black/40 px-3 py-2 text-sm normal-case tracking-normal text-emerald-50 outline-none focus:border-emerald-300"
          >
            <option value="">All styles</option>
            {buildSuiteCatalog.styles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs uppercase tracking-[0.18em] text-emerald-300/80">
          Platform
          <select
            value={buildLibraryFilters.platform ?? ''}
            onChange={(event) =>
              setBuildLibraryFilters((current) => ({
                ...current,
                platform: event.target.value || undefined,
              }))
            }
            className="border border-emerald-500/25 bg-black/40 px-3 py-2 text-sm normal-case tracking-normal text-emerald-50 outline-none focus:border-emerald-300"
          >
            <option value="">All platforms</option>
            {buildSuiteCatalog.mobile.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {visibleSavedBuilds.map((build) => {
          const selectedItemCount =
            Number(Boolean(build.selection.appTypeId)) +
            Number(Boolean(build.selection.paletteId)) +
            Number(Boolean(build.selection.styleId)) +
            Number(Boolean(build.selection.layoutId)) +
            Number(Boolean(build.selection.animationId)) +
            Number(Boolean(build.selection.mobileId)) +
            build.selection.componentIds.length +
            build.selection.integrationIds.length +
            build.selection.aiFeatureIds.length;
          const advisorCount = build.advisorRecommendations.sections.reduce(
            (count, section) => count + section.recommendations.length,
            0
          );

          return (
            <article
              key={build.id}
              className="grid gap-4 border border-emerald-500/25 bg-black/30 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-emerald-50">
                      {build.name}
                    </h3>
                    {build.favorite ? (
                      <span className="border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                        Favorite
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-emerald-100/65">
                    {build.selection.appTypeId
                      ? friendlyId(build.selection.appTypeId)
                      : 'No app type'}{' '}
                    / {build.selection.appearance ?? 'No theme'} /{' '}
                    {build.selection.styleId
                      ? friendlyId(build.selection.styleId)
                      : 'No style'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSavedBuildFavorite(build)}
                  className={`border px-3 py-2 text-xs uppercase tracking-[0.18em] transition hover:-translate-y-0.5 ${
                    build.favorite
                      ? 'border-amber-300 bg-amber-300 text-black'
                      : 'border-emerald-500/35 text-emerald-100/75 hover:border-amber-300 hover:text-amber-100'
                  }`}
                >
                  Favorite
                </button>
              </div>

              <div className="grid gap-2 text-xs text-emerald-100/65 sm:grid-cols-2">
                <p>Created: {formatSavedBuildDate(build.createdAt)}</p>
                <p>Modified: {formatSavedBuildDate(build.updatedAt)}</p>
                <p>Selections: {selectedItemCount}</p>
                <p>Advisor items: {advisorCount}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => restoreSavedSelection(build)}
                  className="border border-emerald-300 bg-emerald-300 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black transition hover:-translate-y-0.5"
                >
                  Load Build
                </button>
                <button
                  type="button"
                  onClick={() => renameSavedBuild(build)}
                  className="border border-emerald-500/35 px-3 py-2 text-xs uppercase tracking-[0.18em] text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-300"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => duplicateSavedBuild(build)}
                  className="border border-emerald-500/35 px-3 py-2 text-xs uppercase tracking-[0.18em] text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-300"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => exportSavedBuild(build)}
                  className="border border-cyan-300/40 px-3 py-2 text-xs uppercase tracking-[0.18em] text-cyan-100 transition hover:-translate-y-0.5 hover:border-cyan-200"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => deleteSavedBuild(build)}
                  className="border border-rose-300/40 px-3 py-2 text-xs uppercase tracking-[0.18em] text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-200"
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {visibleSavedBuilds.length === 0 ? (
        <div className="mt-5 border border-emerald-500/20 bg-black/25 p-6 text-center text-sm text-emerald-100/65">
          No saved builds match the current library filters.
        </div>
      ) : null}
    </section>
  );

  const renderItems = (
    items: BuildSuiteEnhancedItem[],
    selectedId: string | undefined,
    onSelect: (id: string) => void
  ) => (
    <OptionBrowser
      items={items}
      selectedId={selectedId}
      onSelect={onSelect}
      relatedItems={relatedItems}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      categoryFilter={categoryFilter}
      setCategoryFilter={setCategoryFilter}
      complexityFilter={complexityFilter}
      setComplexityFilter={setComplexityFilter}
      collectionFilter={collectionFilter}
      setCollectionFilter={setCollectionFilter}
    />
  );

  const renderMultiItems = (
    items: BuildSuiteEnhancedItem[],
    selectedIds: string[],
    onSelect: (id: string) => void
  ) => (
    <OptionBrowser
      items={items}
      selectedIds={selectedIds}
      onSelect={onSelect}
      relatedItems={relatedItems}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      categoryFilter={categoryFilter}
      setCategoryFilter={setCategoryFilter}
      complexityFilter={complexityFilter}
      setComplexityFilter={setComplexityFilter}
      collectionFilter={collectionFilter}
      setCollectionFilter={setCollectionFilter}
    />
  );

  const renderMarketplaceHome = () => {
    const featured = sortItems(allItems, 'popularity').slice(0, 6);

    return (
      <div className="grid gap-10">
        <section className="border border-emerald-500/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(0,0,0,0.26))] p-6">
          <p className="text-xs uppercase tracking-[0.4em] text-emerald-300">
            Marketplace Home
          </p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h2 className="max-w-3xl text-4xl font-bold text-emerald-50 sm:text-5xl">
                Browse enhancements like a product marketplace.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-emerald-50/70">
                Open any enhancement to inspect previews, compatibility,
                generation impact, and related add-ons before adding it to the
                local build prompt.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setMarketplaceView('browse')}
                  className="border border-emerald-300 bg-emerald-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-black transition hover:-translate-y-0.5"
                >
                  Browse marketplace
                </button>
                <button
                  type="button"
                  onClick={() => setMarketplaceView('wizard')}
                  className="border border-emerald-500/45 px-5 py-3 text-sm uppercase tracking-[0.22em] text-emerald-100 transition hover:-translate-y-0.5 hover:border-emerald-300"
                >
                  Open wizard
                </button>
              </div>
            </div>
            <div className="grid gap-3 border border-emerald-500/25 bg-black/30 p-4">
              <div className="flex items-center gap-3 text-emerald-100">
                <Heart size={18} />
                {favoriteIds.length} favorites
              </div>
              <div className="flex items-center gap-3 text-emerald-100">
                <Clock3 size={18} />
                {recentIds.length} recently viewed
              </div>
              <div className="flex items-center gap-3 text-emerald-100">
                <Check size={18} />
                {getSelectedIds(selection).size} added to build
              </div>
            </div>
          </div>
        </section>

        <BuildAdvisorPanel
          sections={advisorReport.sections}
          selection={selection}
          onOpen={openMarketplaceItem}
          onAdd={addMarketplaceItem}
        />

        <MarketplaceShelf
          title="Featured Enhancements"
          subtitle="A curated starting shelf from the full typed catalog."
          items={featured}
          selection={selection}
          favoriteIds={favoriteIds}
          onOpen={openMarketplaceItem}
          onAdd={addMarketplaceItem}
          onToggleFavorite={toggleFavorite}
          onBrowse={() => setMarketplaceView('browse')}
        />

        {favoriteItems.length ? (
          <MarketplaceShelf
            title="Favorites"
            subtitle="Saved locally in this browsing session."
            items={favoriteItems}
            selection={selection}
            favoriteIds={favoriteIds}
            onOpen={openMarketplaceItem}
            onAdd={addMarketplaceItem}
            onToggleFavorite={toggleFavorite}
          />
        ) : null}

        {recentItems.length ? (
          <MarketplaceShelf
            title="Recently Viewed"
            subtitle="Enhancements you opened during this session."
            items={recentItems}
            selection={selection}
            favoriteIds={favoriteIds}
            onOpen={openMarketplaceItem}
            onAdd={addMarketplaceItem}
            onToggleFavorite={toggleFavorite}
          />
        ) : null}

        {collectionHomeOrder.map((collectionId) => {
          const collection = featuredBuildSuiteCollections.find(
            (item) => item.id === collectionId
          );
          if (!collection) return null;
          return (
            <MarketplaceShelf
              key={collection.id}
              title={collection.label}
              subtitle={collection.description}
              items={getBuildSuiteCollectionItems(collection.id)}
              selection={selection}
              favoriteIds={favoriteIds}
              onOpen={openMarketplaceItem}
              onAdd={addMarketplaceItem}
              onToggleFavorite={toggleFavorite}
              onBrowse={() => browseCollection(collection.id)}
            />
          );
        })}
      </div>
    );
  };

  const renderMarketplaceBrowse = () => (
    <div className="grid gap-5">
      <MarketplaceFilters
        query={marketplaceQuery}
        setQuery={setMarketplaceQuery}
        category={marketplaceCategory}
        setCategory={setMarketplaceCategory}
        difficulty={marketplaceDifficulty}
        setDifficulty={setMarketplaceDifficulty}
        impact={marketplaceImpact}
        setImpact={setMarketplaceImpact}
        appType={marketplaceAppType}
        setAppType={setMarketplaceAppType}
        sortMode={marketplaceSort}
        setSortMode={setMarketplaceSort}
        categories={marketplaceCategories}
        count={filteredMarketplaceItems.length}
      />

      <BuildAdvisorPanel
        sections={advisorReport.sections.slice(0, 3)}
        selection={selection}
        onOpen={openMarketplaceItem}
        onAdd={addMarketplaceItem}
      />

      {filteredMarketplaceItems.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredMarketplaceItems.map((item) => (
            <MarketplaceCard
              key={item.id}
              item={item}
              selected={itemIsSelected(item, selection)}
              favorite={favoriteIds.includes(item.id)}
              onOpen={() => openMarketplaceItem(item.id)}
              onAdd={() => addMarketplaceItem(item)}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="border border-amber-300/35 bg-amber-300/10 p-8 text-center text-amber-100">
          No marketplace matches yet. Try a broader search or fewer filters.
        </div>
      )}
    </div>
  );

  const renderCurrentStep = () => {
    if (activeStep === 0) {
      return renderItems(buildSuiteCatalog.appTypes, selection.appTypeId, (id) =>
        setSingleSelection('appTypeId', id)
      );
    }

    if (activeStep === 1) {
      const appearances: Array<{
        id: BuildSuiteAppearance;
        label: string;
        description: string;
      }> = [
        {
          id: 'light',
          label: 'Light',
          description:
            'Bright surfaces, crisp borders, and classic SaaS readability.',
        },
        {
          id: 'dark',
          label: 'Dark',
          description:
            'Deep surfaces, high contrast, and polished command-center mood.',
        },
      ];

      return (
        <div className="grid gap-4 md:grid-cols-2">
          {appearances.map((appearance) => (
            <AppearanceCard
              key={appearance.id}
              id={appearance.id}
              label={appearance.label}
              description={appearance.description}
              selected={selection.appearance === appearance.id}
              onSelect={() => selectAppearance(appearance.id)}
            />
          ))}
        </div>
      );
    }

    if (activeStep === 2) {
      if (!selection.appearance) {
        return (
          <p className="border border-amber-300/40 bg-amber-300/10 p-5 text-amber-100">
            Choose Light or Dark first so the palette list can be filtered.
          </p>
        );
      }

      return renderItems(availablePalettes, selection.paletteId, (id) =>
        setSingleSelection('paletteId', id)
      );
    }

    if (activeStep === 3) {
      return renderItems(buildSuiteCatalog.styles, selection.styleId, (id) =>
        setSingleSelection('styleId', id)
      );
    }

    if (activeStep === 4) {
      return renderItems(buildSuiteCatalog.layouts, selection.layoutId, (id) =>
        setSingleSelection('layoutId', id)
      );
    }

    if (activeStep === 5) {
      return renderMultiItems(
        buildSuiteCatalog.components,
        selection.componentIds,
        (id) => toggleMultiSelection('componentIds', id)
      );
    }

    if (activeStep === 6) {
      return renderMultiItems(
        buildSuiteCatalog.aiFeatures,
        selection.aiFeatureIds,
        (id) => toggleMultiSelection('aiFeatureIds', id)
      );
    }

    if (activeStep === 7) {
      return renderMultiItems(
        buildSuiteCatalog.integrations,
        selection.integrationIds,
        (id) => toggleMultiSelection('integrationIds', id)
      );
    }

    if (activeStep === 8) {
      return renderItems(
        buildSuiteCatalog.animations,
        selection.animationId,
        (id) => setSingleSelection('animationId', id)
      );
    }

    if (activeStep === 9) {
      return renderItems(buildSuiteCatalog.mobile, selection.mobileId, (id) =>
        setSingleSelection('mobileId', id)
      );
    }

    return (
      <div className="grid gap-5">
        {promptResult.missingSelection.length > 0 ? (
          <div className="border border-amber-300/40 bg-amber-300/10 p-4 text-sm text-amber-100">
            Missing selections: {promptResult.missingSelection.join(', ')}
          </div>
        ) : (
          <div className="border border-emerald-400/40 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            Prompt assembled locally. It has not been sent to Matrix Coder.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {promptResult.selectedItems.map((item) => {
            const enhancedItem = item as BuildSuiteEnhancedItem;
            const Icon = iconMap[enhancedItem.icon] ?? Boxes;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 border border-emerald-500/25 bg-black/30 p-4"
              >
                <span className="grid h-10 w-10 place-items-center border border-emerald-500/30 bg-emerald-400/10 text-emerald-200">
                  <Icon size={17} />
                </span>
                <span>
                  <p className="text-sm font-semibold text-emerald-100">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.22em] text-emerald-300/70">
                    {item.category}
                  </p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-amber-100/80">
                    {'\u2605'.repeat(enhancedItem.popularity)} -{' '}
                    {enhancedItem.difficulty}
                  </p>
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border border-emerald-500/25 bg-black/35 p-4">
          <div>
            <p className="text-sm font-semibold text-emerald-100">
              Ready to use this prompt?
            </p>
            <p className="mt-1 text-xs text-emerald-100/65">
              Insert it into Chat Workspace, review it, then press Send when
              ready.
            </p>
            {chatHandoffStatus ? (
              <p className="mt-2 text-xs text-emerald-300">
                {chatHandoffStatus}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={insertPromptIntoChat}
            disabled={promptResult.missingSelection.length > 0}
            className="border border-emerald-300 bg-emerald-300 px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-black transition hover:-translate-y-0.5 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-emerald-500/25 disabled:bg-emerald-500/10 disabled:text-emerald-100/35"
          >
            Insert into Chat
          </button>
        </div>
        <textarea
          value={promptResult.prompt}
          readOnly
          className="min-h-[420px] w-full border border-emerald-500/25 bg-black/55 p-5 font-mono text-sm leading-6 text-emerald-50 outline-none"
        />
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-black text-emerald-50">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(16,185,129,0.16),transparent_28%),radial-gradient(circle_at_78%_0%,rgba(34,211,238,0.1),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="border-b border-emerald-500/30 pb-8">
          <p className="text-xs uppercase tracking-[0.45em] text-emerald-300">
            Matrix Coder AI
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-4xl font-bold tracking-normal text-emerald-100 sm:text-5xl">
                Matrix Build Suite
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-50/70">
                Browse premium app blueprints, visual systems, workflows, and
                integrations. The final prompt is assembled locally for review.
              </p>
            </div>
            <a
              href="/chat-workspace"
              className="border border-emerald-500/50 px-4 py-3 text-xs uppercase tracking-[0.3em] text-emerald-200 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-400/10"
            >
              Workspace
            </a>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            {[
              ['home', 'Marketplace Home'],
              ['browse', 'Browse All'],
              ['wizard', 'Build Wizard'],
            ].map(([view, label]) => (
              <button
                key={view}
                type="button"
                onClick={() => setMarketplaceView(view as MarketplaceView)}
                className={`border px-4 py-3 text-xs uppercase tracking-[0.24em] transition ${
                  marketplaceView === view
                    ? 'border-emerald-300 bg-emerald-300 text-black'
                    : 'border-emerald-500/35 bg-black/30 text-emerald-100/75 hover:border-emerald-300 hover:bg-emerald-400/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {renderTemplatePacks()}

        {renderBuildLibrary()}

        <div className="mt-8">
          {marketplaceView === 'home' ? renderMarketplaceHome() : null}
          {marketplaceView === 'browse' ? renderMarketplaceBrowse() : null}
          {marketplaceView === 'wizard' ? (
            <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
              <StepRail activeStep={activeStep} setActiveStep={setActiveStep} />
              <section className="grid gap-5">
                <StepHeader activeStep={activeStep} canAdvance={canAdvance} />
                <div className="border border-emerald-500/25 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(0,0,0,0.18))] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
                  {renderCurrentStep()}
                </div>

                <div className="flex flex-wrap justify-between gap-3">
                  <button
                    type="button"
                    onClick={previousStep}
                    disabled={activeStep === 0}
                    className="border border-emerald-500/40 px-5 py-3 text-sm uppercase tracking-[0.22em] text-emerald-200 transition hover:-translate-y-0.5 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
                  >
                    Back
                  </button>
                  <div className="flex flex-wrap gap-3">
                    {multiSelectStepKeys.has(activeStep) ? (
                      <button
                        type="button"
                        onClick={nextStep}
                        className="border border-emerald-500/40 px-5 py-3 text-sm uppercase tracking-[0.22em] text-emerald-200 transition hover:-translate-y-0.5 hover:border-emerald-300"
                      >
                        Skip
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={nextStep}
                      disabled={!canAdvance || activeStep === steps.length - 1}
                      className="border border-emerald-300 bg-emerald-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-black transition hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(16,185,129,0.24)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>
              <BuildSuiteLivePreviewPanel selection={selection} />
            </div>
          ) : null}
        </div>
        {detailItem ? (
          <EnhancementDetailPanel
            item={detailItem}
            selected={itemIsSelected(detailItem, selection)}
            favorite={favoriteIds.includes(detailItem.id)}
            onClose={() => setDetailItemId(undefined)}
            onAdd={() => addMarketplaceItem(detailItem)}
            onToggleFavorite={() => toggleFavorite(detailItem.id)}
            onOpenRelated={openMarketplaceItem}
          />
        ) : null}
      </div>
    </main>
  );
}
