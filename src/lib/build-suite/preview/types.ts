import type {
  BuildSuiteAppearance,
  BuildSuiteCatalog,
  BuildSuiteEnhancedItem,
  BuildSuiteSelection,
} from '../types';

export type BuildSuitePreviewNavigation =
  | 'top'
  | 'sidebar'
  | 'bottom'
  | 'split'
  | 'bento'
  | 'landing';

export interface BuildSuitePreviewPlugin {
  id: string;
  matches: (item: BuildSuiteEnhancedItem) => boolean;
  apply: (
    model: MutableBuildSuitePreviewModel,
    item: BuildSuiteEnhancedItem
  ) => void;
}

export interface BuildSuitePreviewStyleFlags {
  glass: boolean;
  neon: boolean;
  material: boolean;
  apple: boolean;
  fluent: boolean;
  matrix: boolean;
  saas: boolean;
}

export interface BuildSuitePreviewWidgetFlags {
  cards: boolean;
  charts: boolean;
  tables: boolean;
  forms: boolean;
  notifications: boolean;
  aiPanel: boolean;
  mobileFrame: boolean;
  stripeCard: boolean;
  databaseStatus: boolean;
  calendar: boolean;
  kanban: boolean;
}

export interface BuildSuitePreviewClasses {
  frame: string;
  surface: string;
  panel: string;
  elevatedPanel: string;
  text: string;
  mutedText: string;
  border: string;
  accent: string;
  accentText: string;
  button: string;
  softAccent: string;
}

export interface BuildSuitePreviewModel {
  selection: BuildSuiteSelection;
  selectedItems: BuildSuiteEnhancedItem[];
  appTitle: string;
  appSubtitle: string;
  appearance: BuildSuiteAppearance;
  paletteLabel: string;
  styleLabel: string;
  layoutLabel: string;
  navigation: BuildSuitePreviewNavigation;
  styleFlags: BuildSuitePreviewStyleFlags;
  widgets: BuildSuitePreviewWidgetFlags;
  classes: BuildSuitePreviewClasses;
}

export interface MutableBuildSuitePreviewModel
  extends Omit<BuildSuitePreviewModel, 'selectedItems'> {
  selectedItems: BuildSuiteEnhancedItem[];
}

export interface BuildSuitePreviewBuildOptions {
  catalog?: BuildSuiteCatalog;
  plugins?: BuildSuitePreviewPlugin[];
}
