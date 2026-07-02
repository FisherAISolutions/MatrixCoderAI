'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  BadgeCheck,
  Blocks,
  Boxes,
  BrainCircuit,
  Check,
  Component,
  LayoutDashboard,
  Moon,
  Palette,
  PlugZap,
  Search,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Wand2,
  Zap,
} from 'lucide-react';
import { buildSuiteCatalog } from '@/lib/build-suite/catalog';
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
  BuildSuiteEnhancedItem,
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

const complexityClasses = {
  low: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100',
  medium: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100',
  high: 'border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100',
};

const difficultyClasses = {
  easy: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100',
  medium: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100',
  advanced: 'border-fuchsia-300/35 bg-fuchsia-300/10 text-fuchsia-100',
};

const impactClasses = {
  low: 'border-lime-300/35 bg-lime-300/10 text-lime-100',
  medium: 'border-blue-300/35 bg-blue-300/10 text-blue-100',
  high: 'border-amber-300/35 bg-amber-300/10 text-amber-100',
};

const accentClasses = {
  amber: 'from-amber-300/20 to-orange-500/5',
  blue: 'from-blue-300/20 to-cyan-500/5',
  cyan: 'from-cyan-300/20 to-blue-500/5',
  emerald: 'from-emerald-300/20 to-green-500/5',
  fuchsia: 'from-fuchsia-300/20 to-purple-500/5',
  lime: 'from-lime-300/20 to-emerald-500/5',
  slate: 'from-slate-300/20 to-slate-500/5',
  violet: 'from-violet-300/20 to-fuchsia-500/5',
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

function cloneSelection(): BuildSuiteSelection {
  return {
    ...emptyBuildSuiteSelection,
    componentIds: [],
    aiFeatureIds: [],
    integrationIds: [],
  };
}

function includesId(ids: string[], id: string): boolean {
  return ids.includes(id);
}

function toggleId(ids: string[], id: string): string[] {
  return includesId(ids, id)
    ? ids.filter((existing) => existing !== id)
    : [...ids, id];
}

function matchesItem(
  item: BuildSuiteEnhancedItem,
  query: string,
  category: string,
  complexity: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedComplexity = item.complexity ?? 'low';
  const text = [
    item.id,
    item.label,
    item.category,
    item.description,
    item.promptInstruction,
    ...item.badges,
    ...item.recommendedFor,
    ...item.tags,
  ]
    .join(' ')
    .toLowerCase();

  return (
    (!normalizedQuery || text.includes(normalizedQuery)) &&
    (category === 'all' || item.category === category) &&
    (complexity === 'all' || normalizedComplexity === complexity)
  );
}

function getCategories(items: BuildSuiteEnhancedItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.category))).sort();
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
  const isRecommended = item.badges.includes('Popular') || item.popularity >= 5;
  const popularityLabel = `${'★'.repeat(item.popularity)} Popular`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex min-h-[260px] flex-col overflow-hidden border p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:bg-emerald-400/10 hover:shadow-[0_22px_55px_rgba(16,185,129,0.16)] ${
        selected
          ? 'scale-[1.015] border-emerald-200 bg-emerald-300/15 text-emerald-50 shadow-[0_0_0_1px_rgba(110,231,183,0.45),0_28px_70px_rgba(16,185,129,0.16)]'
          : 'border-emerald-500/25 bg-black/35 text-emerald-50'
      }`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/75 to-transparent opacity-0 transition group-hover:opacity-100" />
      <span
        className={`pointer-events-none absolute right-4 top-4 h-16 w-16 rounded-full bg-gradient-to-br ${accentClasses[item.accentColor]} blur-2xl transition ${
          selected ? 'bg-emerald-300/25 opacity-100' : 'bg-emerald-300/0 opacity-0'
        }`}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div
          className={`grid h-12 w-12 place-items-center border transition ${
            selected
              ? 'border-emerald-200 bg-emerald-300 text-black'
              : 'border-emerald-500/35 bg-emerald-400/10 text-emerald-200 group-hover:border-emerald-300'
          }`}
        >
          <Icon size={22} strokeWidth={1.8} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {isRecommended ? (
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
          <span
            className={`border px-2 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${difficultyClasses[item.difficulty]}`}
          >
            {item.difficulty}
          </span>
        </div>
      </div>

      <BuildSuiteCardPreview item={item} />

      <div className="relative mt-5">
        <p className="text-xl font-bold tracking-normal text-emerald-50">
          {item.label}
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-emerald-300/75">
          {item.category}
        </p>
        <p className="mt-4 text-sm leading-6 text-emerald-50/72">
          {item.description}
        </p>
      </div>

      <div className="relative mt-5 flex flex-wrap gap-2">
        <span className="border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
          {popularityLabel}
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
        {item.tags.slice(0, 5).map((tag) => (
          <span
            key={tag}
            className="border border-emerald-500/20 bg-black/20 px-2 py-1 text-xs text-emerald-100/75 transition group-hover:border-emerald-300/35"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="relative mt-auto flex items-end justify-between pt-6">
        <span className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">
          {selected ? 'Selected' : 'Tap to select'}
        </span>
        <span
          className={`grid h-8 w-8 place-items-center border transition ${
            selected
              ? 'border-emerald-200 bg-emerald-300 text-black'
              : 'border-emerald-500/30 text-emerald-200/55 group-hover:border-emerald-300 group-hover:text-emerald-100'
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
  const filteredItems = items.filter(
    (item) =>
      (collectionFilter === 'all' || collectionItemIds.has(item.id)) &&
      matchesItem(item, searchQuery, categoryFilter, complexityFilter)
  );
  const relatedItemIds = new Set(relatedItems.map((item) => item.id));
  const relatedOptions = items.filter(
    (item) =>
      relatedItemIds.has(item.id) &&
      selectedId !== item.id &&
      !selectedIds?.includes(item.id)
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
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
                className={`group border px-3 py-2 text-left transition hover:-translate-y-0.5 ${
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
                  {collection.badge} · {count}
                </span>
              </button>
            );
          })}
        </div>
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
        <span>App-store browse mode</span>
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
      className={`group relative min-h-[260px] overflow-hidden border p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:bg-emerald-400/10 ${
        selected
          ? 'scale-[1.015] border-emerald-200 bg-emerald-300/15 shadow-[0_28px_70px_rgba(16,185,129,0.16)]'
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
                  ? 'border-emerald-300 bg-emerald-400/10 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.12)]'
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

export default function MatrixBuildSuiteClient() {
  const [activeStep, setActiveStep] = useState(0);
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
                    {'\u2605'.repeat(enhancedItem.popularity)} ·{' '}
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
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
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
      </div>
    </main>
  );
}
