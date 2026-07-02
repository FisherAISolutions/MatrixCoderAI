'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  ArrowLeft,
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
import { filterPalettesByAppearance } from '@/lib/build-suite/palettes';
import { buildMatrixBuildSuitePrompt } from '@/lib/build-suite/promptBuilder';
import type {
  BuildSuiteAppearance,
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

type MarketplaceView = 'home' | 'browse' | 'detail' | 'wizard';
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
  const [activeStep, setActiveStep] = useState(0);
  const [marketplaceView, setMarketplaceView] =
    useState<MarketplaceView>('home');
  const [detailItemId, setDetailItemId] = useState<string>();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [marketplaceQuery, setMarketplaceQuery] = useState('');
  const [marketplaceCategory, setMarketplaceCategory] = useState('all');
  const [marketplaceDifficulty, setMarketplaceDifficulty] = useState('all');
  const [marketplaceImpact, setMarketplaceImpact] = useState('all');
  const [marketplaceAppType, setMarketplaceAppType] = useState('all');
  const [marketplaceSort, setMarketplaceSort] =
    useState<MarketplaceSort>('popularity');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [complexityFilter, setComplexityFilter] = useState('all');
  const [collectionFilter, setCollectionFilter] = useState<
    BuildSuiteFeaturedCollection['id'] | 'all'
  >('all');
  const [selection, setSelection] = useState<BuildSuiteSelection>(() =>
    cloneSelection()
  );

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

  const promptResult = useMemo(
    () => buildMatrixBuildSuitePrompt(selection),
    [selection]
  );

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
    setSelection((current) => ({ ...current, [key]: id }));
  };

  const selectAppearance = (appearance: BuildSuiteAppearance) => {
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
    setMarketplaceView('detail');
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

  const renderMarketplaceDetail = () => {
    if (!detailItem) return null;
    const Icon = iconMap[detailItem.icon] ?? Boxes;
    const related = relatedItemsFor(detailItem);
    const compatible = compatibilityLabels(detailItem);

    return (
      <div className="grid gap-6">
        <button
          type="button"
          onClick={() => setMarketplaceView('home')}
          className="inline-flex w-fit items-center gap-2 border border-emerald-500/35 px-3 py-2 text-xs uppercase tracking-[0.22em] text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-400/10"
        >
          <ArrowLeft size={14} />
          Marketplace
        </button>

        <section className="grid gap-6 border border-emerald-500/25 bg-black/35 p-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <BuildSuiteCardPreview item={detailItem} />
            <div className="mt-4 grid gap-3 border border-emerald-500/20 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">
                Features
              </p>
              <div className="flex flex-wrap gap-2">
                {detailItem.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border border-emerald-500/20 bg-black/20 px-2 py-1 text-xs text-emerald-100/75"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center border border-emerald-500/35 bg-emerald-400/10 text-emerald-200">
                  <Icon size={24} />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-emerald-300">
                    {detailItem.category}
                  </p>
                  <h2 className="mt-2 text-4xl font-bold text-emerald-50">
                    {detailItem.label}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleFavorite(detailItem.id)}
                className={`grid h-11 w-11 place-items-center border ${
                  favoriteIds.includes(detailItem.id)
                    ? 'border-rose-300 bg-rose-300/15 text-rose-100'
                    : 'border-emerald-500/25 text-emerald-100/55 hover:border-rose-300 hover:text-rose-100'
                }`}
              >
                <Heart
                  size={18}
                  fill={favoriteIds.includes(detailItem.id) ? 'currentColor' : 'none'}
                />
              </button>
            </div>

            <p className="text-sm leading-7 text-emerald-50/72">
              {detailItem.description}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="border border-emerald-500/20 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">
                  Difficulty
                </p>
                <p className="mt-2 text-lg font-bold capitalize text-emerald-50">
                  {detailItem.difficulty}
                </p>
              </div>
              <div className="border border-emerald-500/20 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">
                  Popularity
                </p>
                <p className="mt-2 text-lg font-bold text-emerald-50">
                  {ratingText(detailItem)}
                </p>
              </div>
              <div className="border border-emerald-500/20 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">
                  Impact
                </p>
                <p className="mt-2 text-lg font-bold capitalize text-emerald-50">
                  {detailItem.estimatedGenerationImpact}
                </p>
              </div>
              <div className="border border-emerald-500/20 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/70">
                  Status
                </p>
                <p className="mt-2 text-lg font-bold text-emerald-50">
                  {itemIsSelected(detailItem, selection) ? 'Added' : 'Available'}
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
                Compatible app types
              </p>
              <div className="flex flex-wrap gap-2">
                {compatible.length ? (
                  compatible.map((label) => (
                    <span
                      key={label}
                      className="border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100"
                    >
                      {label}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-emerald-100/60">
                    Broad compatibility
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
                People also added
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {related.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openMarketplaceItem(item.id)}
                    className="flex items-center justify-between border border-cyan-300/20 bg-cyan-300/10 p-3 text-left text-cyan-50 transition hover:-translate-y-0.5 hover:border-cyan-200"
                  >
                    <span>{item.label}</span>
                    <Sparkles size={14} />
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => addMarketplaceItem(detailItem)}
              className="w-fit border border-emerald-300 bg-emerald-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-black transition hover:-translate-y-0.5"
            >
              {itemIsSelected(detailItem, selection) ? 'Added to Build' : 'Add to Build'}
            </button>
          </div>
        </section>
      </div>
    );
  };

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

        <div className="mt-8">
          {marketplaceView === 'home' ? renderMarketplaceHome() : null}
          {marketplaceView === 'browse' ? renderMarketplaceBrowse() : null}
          {marketplaceView === 'detail' ? renderMarketplaceDetail() : null}
          {marketplaceView === 'wizard' ? (
            <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
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
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
