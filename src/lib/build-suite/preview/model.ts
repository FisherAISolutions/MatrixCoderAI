import { buildSuiteCatalog, findBuildSuiteItem } from '../catalog';
import { getBuildSuiteSelectedItems } from '../promptBuilder';
import type {
  BuildSuiteAccentColor,
  BuildSuiteAppearance,
  BuildSuiteCatalog,
  BuildSuiteEnhancedItem,
  BuildSuitePreviewType,
  BuildSuiteSelection,
} from '../types';
import type {
  BuildSuitePreviewBuildOptions,
  BuildSuitePreviewClasses,
  BuildSuitePreviewModel,
  BuildSuitePreviewNavigation,
  BuildSuitePreviewPlugin,
  MutableBuildSuitePreviewModel,
} from './types';

const accentClasses: Record<
  BuildSuiteAccentColor,
  Pick<BuildSuitePreviewClasses, 'accent' | 'accentText' | 'button' | 'softAccent'>
> = {
  amber: {
    accent: 'bg-amber-300',
    accentText: 'text-amber-300',
    button: 'bg-amber-300 text-black',
    softAccent: 'bg-amber-300/15 text-amber-100 border-amber-300/30',
  },
  blue: {
    accent: 'bg-blue-400',
    accentText: 'text-blue-300',
    button: 'bg-blue-400 text-white',
    softAccent: 'bg-blue-400/15 text-blue-100 border-blue-300/30',
  },
  cyan: {
    accent: 'bg-cyan-300',
    accentText: 'text-cyan-300',
    button: 'bg-cyan-300 text-slate-950',
    softAccent: 'bg-cyan-300/15 text-cyan-100 border-cyan-300/30',
  },
  emerald: {
    accent: 'bg-emerald-300',
    accentText: 'text-emerald-300',
    button: 'bg-emerald-300 text-black',
    softAccent: 'bg-emerald-300/15 text-emerald-100 border-emerald-300/30',
  },
  fuchsia: {
    accent: 'bg-fuchsia-400',
    accentText: 'text-fuchsia-300',
    button: 'bg-fuchsia-400 text-white',
    softAccent: 'bg-fuchsia-400/15 text-fuchsia-100 border-fuchsia-300/30',
  },
  lime: {
    accent: 'bg-lime-300',
    accentText: 'text-lime-300',
    button: 'bg-lime-300 text-black',
    softAccent: 'bg-lime-300/15 text-lime-100 border-lime-300/30',
  },
  slate: {
    accent: 'bg-slate-300',
    accentText: 'text-slate-200',
    button: 'bg-slate-200 text-slate-950',
    softAccent: 'bg-slate-300/15 text-slate-100 border-slate-300/30',
  },
  violet: {
    accent: 'bg-violet-400',
    accentText: 'text-violet-300',
    button: 'bg-violet-400 text-white',
    softAccent: 'bg-violet-400/15 text-violet-100 border-violet-300/30',
  },
};

function textIncludes(item: BuildSuiteEnhancedItem, values: string[]): boolean {
  const haystack = [
    item.id,
    item.category,
    item.label,
    item.previewType,
    ...item.tags,
  ]
    .join(' ')
    .toLowerCase();

  return values.some((value) => haystack.includes(value));
}

function previewTypeIs(
  item: BuildSuiteEnhancedItem,
  previewTypes: BuildSuitePreviewType[]
): boolean {
  return previewTypes.includes(item.previewType);
}

function setNavigation(
  model: MutableBuildSuitePreviewModel,
  navigation: BuildSuitePreviewNavigation
): void {
  model.navigation = navigation;
}

export const buildSuitePreviewPlugins: BuildSuitePreviewPlugin[] = [
  {
    id: 'layout-sidebar',
    matches: (item) => previewTypeIs(item, ['layout-sidebar']),
    apply: (model) => setNavigation(model, 'sidebar'),
  },
  {
    id: 'layout-bottom-navigation',
    matches: (item) =>
      previewTypeIs(item, ['layout-bottom-nav', 'mobile-device']) ||
      textIncludes(item, ['bottom nav', 'mobile first']),
    apply: (model) => {
      setNavigation(model, 'bottom');
      model.widgets.mobileFrame = true;
    },
  },
  {
    id: 'layout-bento',
    matches: (item) => previewTypeIs(item, ['layout-bento']),
    apply: (model) => setNavigation(model, 'bento'),
  },
  {
    id: 'layout-split',
    matches: (item) => previewTypeIs(item, ['layout-split']),
    apply: (model) => setNavigation(model, 'split'),
  },
  {
    id: 'layout-landing',
    matches: (item) => previewTypeIs(item, ['layout-landing']),
    apply: (model) => setNavigation(model, 'landing'),
  },
  {
    id: 'style-glass',
    matches: (item) => previewTypeIs(item, ['style-glass']) || textIncludes(item, ['glass']),
    apply: (model) => {
      model.styleFlags.glass = true;
    },
  },
  {
    id: 'style-cyber',
    matches: (item) => previewTypeIs(item, ['style-cyber']) || textIncludes(item, ['cyber']),
    apply: (model) => {
      model.styleFlags.neon = true;
    },
  },
  {
    id: 'style-material',
    matches: (item) => previewTypeIs(item, ['style-material']) || textIncludes(item, ['material']),
    apply: (model) => {
      model.styleFlags.material = true;
    },
  },
  {
    id: 'style-apple',
    matches: (item) => previewTypeIs(item, ['style-apple']) || textIncludes(item, ['apple']),
    apply: (model) => {
      model.styleFlags.apple = true;
    },
  },
  {
    id: 'style-fluent',
    matches: (item) => previewTypeIs(item, ['style-fluent']) || textIncludes(item, ['fluent']),
    apply: (model) => {
      model.styleFlags.fluent = true;
    },
  },
  {
    id: 'style-matrix',
    matches: (item) => previewTypeIs(item, ['style-matrix']) || textIncludes(item, ['matrix']),
    apply: (model) => {
      model.styleFlags.matrix = true;
      model.styleFlags.neon = true;
    },
  },
  {
    id: 'style-saas',
    matches: (item) => previewTypeIs(item, ['style-saas']) || textIncludes(item, ['saas']),
    apply: (model) => {
      model.styleFlags.saas = true;
    },
  },
  {
    id: 'widgets-cards',
    matches: (item) => previewTypeIs(item, ['component-cards', 'app-dashboard', 'layout-dashboard']),
    apply: (model) => {
      model.widgets.cards = true;
    },
  },
  {
    id: 'widgets-charts',
    matches: (item) => previewTypeIs(item, ['component-charts']) || textIncludes(item, ['chart', 'analytics']),
    apply: (model) => {
      model.widgets.charts = true;
    },
  },
  {
    id: 'widgets-tables',
    matches: (item) => previewTypeIs(item, ['component-tables']) || textIncludes(item, ['table', 'directory']),
    apply: (model) => {
      model.widgets.tables = true;
    },
  },
  {
    id: 'widgets-forms',
    matches: (item) => previewTypeIs(item, ['component-forms']) || textIncludes(item, ['form', 'upload']),
    apply: (model) => {
      model.widgets.forms = true;
    },
  },
  {
    id: 'widgets-notifications',
    matches: (item) => previewTypeIs(item, ['component-notifications']) || textIncludes(item, ['notification', 'toast']),
    apply: (model) => {
      model.widgets.notifications = true;
    },
  },
  {
    id: 'widgets-ai',
    matches: (item) => previewTypeIs(item, ['ai-assistant']) || textIncludes(item, ['ai', 'assistant', 'chat']),
    apply: (model) => {
      model.widgets.aiPanel = true;
    },
  },
  {
    id: 'widgets-commerce',
    matches: (item) => textIncludes(item, ['stripe', 'pricing', 'subscription']),
    apply: (model) => {
      model.widgets.stripeCard = true;
      model.widgets.cards = true;
    },
  },
  {
    id: 'widgets-data',
    matches: (item) =>
      textIncludes(item, ['supabase', 'firebase', 'database', 'localstorage', 'cloud sync']),
    apply: (model) => {
      model.widgets.databaseStatus = true;
    },
  },
  {
    id: 'widgets-calendar',
    matches: (item) => previewTypeIs(item, ['component-calendar']) || textIncludes(item, ['calendar', 'booking']),
    apply: (model) => {
      model.widgets.calendar = true;
    },
  },
  {
    id: 'widgets-kanban',
    matches: (item) => previewTypeIs(item, ['component-kanban']) || textIncludes(item, ['kanban']),
    apply: (model) => {
      model.widgets.kanban = true;
    },
  },
];

function createClasses(
  appearance: BuildSuiteAppearance,
  accentColor: BuildSuiteAccentColor,
  flags: MutableBuildSuitePreviewModel['styleFlags']
): BuildSuitePreviewClasses {
  const accent = accentClasses[accentColor] ?? accentClasses.emerald;
  const dark = appearance === 'dark';
  const glassPanel = dark
    ? 'bg-white/10 backdrop-blur-xl'
    : 'bg-white/70 backdrop-blur-xl';
  const plainPanel = dark ? 'bg-slate-900/90' : 'bg-white';
  const panel = flags.glass ? glassPanel : plainPanel;
  const border = flags.neon
    ? 'border-cyan-300/60 shadow-[0_0_24px_rgba(34,211,238,0.18)]'
    : dark
      ? 'border-white/10'
      : 'border-slate-200';

  return {
    frame: dark
      ? 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.28),transparent_38%),linear-gradient(135deg,#020617,#07111f_48%,#020617)]'
      : 'bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_36%),linear-gradient(135deg,#f8fafc,#eef6ff_50%,#ffffff)]',
    surface: dark ? 'bg-slate-950/88' : 'bg-slate-50/90',
    panel,
    elevatedPanel: `${panel} ${border} shadow-2xl`,
    text: dark ? 'text-white' : 'text-slate-950',
    mutedText: dark ? 'text-slate-300' : 'text-slate-600',
    border,
    ...accent,
  };
}

function getAccentColor(
  catalog: BuildSuiteCatalog,
  selection: BuildSuiteSelection
): BuildSuiteAccentColor {
  const palette = findBuildSuiteItem(selection.paletteId, catalog);
  const style = findBuildSuiteItem(selection.styleId, catalog);
  return (
    palette?.accentColor ??
    style?.accentColor ??
    (selection.appearance === 'light' ? 'blue' : 'emerald')
  );
}

function createInitialModel(
  selection: BuildSuiteSelection,
  catalog: BuildSuiteCatalog
): MutableBuildSuitePreviewModel {
  const appType = findBuildSuiteItem(selection.appTypeId, catalog);
  const palette = findBuildSuiteItem(selection.paletteId, catalog);
  const style = findBuildSuiteItem(selection.styleId, catalog);
  const layout = findBuildSuiteItem(selection.layoutId, catalog);
  const appearance = selection.appearance ?? 'dark';

  return {
    selection,
    selectedItems: getBuildSuiteSelectedItems(
      selection,
      catalog
    ) as BuildSuiteEnhancedItem[],
    appTitle: appType?.label ?? 'Preview App',
    appSubtitle: appType?.category ?? 'Live configuration',
    appearance,
    paletteLabel: palette?.label ?? 'Adaptive Palette',
    styleLabel: style?.label ?? 'Default Style',
    layoutLabel: layout?.label ?? 'Responsive Layout',
    navigation: 'top',
    styleFlags: {
      glass: false,
      neon: false,
      material: false,
      apple: false,
      fluent: false,
      matrix: false,
      saas: false,
    },
    widgets: {
      cards: true,
      charts: false,
      tables: false,
      forms: false,
      notifications: false,
      aiPanel: false,
      mobileFrame: false,
      stripeCard: false,
      databaseStatus: false,
      calendar: false,
      kanban: false,
    },
    classes: createClasses(appearance, getAccentColor(catalog, selection), {
      glass: false,
      neon: false,
      material: false,
      apple: false,
      fluent: false,
      matrix: false,
      saas: false,
    }),
  };
}

export function buildBuildSuitePreviewModel(
  selection: BuildSuiteSelection,
  options: BuildSuitePreviewBuildOptions = {}
): BuildSuitePreviewModel {
  const catalog = options.catalog ?? buildSuiteCatalog;
  const plugins = options.plugins ?? buildSuitePreviewPlugins;
  const model = createInitialModel(selection, catalog);

  for (const item of model.selectedItems) {
    for (const plugin of plugins) {
      if (plugin.matches(item)) {
        plugin.apply(model, item);
      }
    }
  }

  model.classes = createClasses(
    model.appearance,
    getAccentColor(catalog, selection),
    model.styleFlags
  );

  return model;
}
