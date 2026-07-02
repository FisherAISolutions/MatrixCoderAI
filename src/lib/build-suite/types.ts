export type BuildSuiteAppearance = 'light' | 'dark';

export type BuildSuiteComplexity = 'low' | 'medium' | 'high';

export type BuildSuiteIcon =
  | 'app-window'
  | 'badge-check'
  | 'blocks'
  | 'boxes'
  | 'brain-circuit'
  | 'calendar'
  | 'chart'
  | 'component'
  | 'form'
  | 'kanban'
  | 'layout-dashboard'
  | 'moon'
  | 'palette'
  | 'plug-zap'
  | 'search'
  | 'smartphone'
  | 'sparkles'
  | 'star'
  | 'sun'
  | 'table'
  | 'wand'
  | 'zap';

export type BuildSuiteAccentColor =
  | 'amber'
  | 'blue'
  | 'cyan'
  | 'emerald'
  | 'fuchsia'
  | 'lime'
  | 'slate'
  | 'violet';

export type BuildSuitePreviewType =
  | 'ai-assistant'
  | 'animation-motion'
  | 'app-dashboard'
  | 'component-calendar'
  | 'component-cards'
  | 'component-charts'
  | 'component-forms'
  | 'component-kanban'
  | 'component-notifications'
  | 'component-tables'
  | 'integration-flow'
  | 'layout-bento'
  | 'layout-bottom-nav'
  | 'layout-dashboard'
  | 'layout-landing'
  | 'layout-sidebar'
  | 'layout-split'
  | 'layout-top-nav'
  | 'mobile-device'
  | 'palette-swatches'
  | 'style-apple'
  | 'style-cyber'
  | 'style-fluent'
  | 'style-glass'
  | 'style-material'
  | 'style-matrix'
  | 'style-saas';

export type BuildSuiteDifficulty = 'easy' | 'medium' | 'advanced';

export type BuildSuiteGenerationImpact = 'low' | 'medium' | 'high';

export interface BuildSuiteVisualMetadata {
  icon: BuildSuiteIcon;
  accentColor: BuildSuiteAccentColor;
  previewType: BuildSuitePreviewType;
  badges: string[];
  recommendedFor: string[];
  popularity: number;
  difficulty: BuildSuiteDifficulty;
  estimatedGenerationImpact: BuildSuiteGenerationImpact;
  relatedItemIds: string[];
  featuredCollectionIds: string[];
}

export interface BuildSuiteCompatibility {
  appearances?: BuildSuiteAppearance[];
  appTypes?: string[];
  categories?: string[];
}

export interface BuildSuiteItem {
  id: string;
  label: string;
  category: string;
  description: string;
  tags: string[];
  promptInstruction: string;
  compatibleWith?: BuildSuiteCompatibility;
  conflictsWith?: string[];
  complexity?: BuildSuiteComplexity;
  icon?: BuildSuiteIcon;
  accentColor?: BuildSuiteAccentColor;
  previewType?: BuildSuitePreviewType;
  badges?: string[];
  recommendedFor?: string[];
  popularity?: number;
  difficulty?: BuildSuiteDifficulty;
  estimatedGenerationImpact?: BuildSuiteGenerationImpact;
  relatedItemIds?: string[];
  featuredCollectionIds?: string[];
}

export type BuildSuiteEnhancedItem = BuildSuiteItem & BuildSuiteVisualMetadata;

export interface BuildSuiteCatalog {
  appTypes: BuildSuiteEnhancedItem[];
  palettes: BuildSuiteEnhancedItem[];
  styles: BuildSuiteEnhancedItem[];
  layouts: BuildSuiteEnhancedItem[];
  components: BuildSuiteEnhancedItem[];
  aiFeatures: BuildSuiteEnhancedItem[];
  integrations: BuildSuiteEnhancedItem[];
  animations: BuildSuiteEnhancedItem[];
  mobile: BuildSuiteEnhancedItem[];
}

export interface BuildSuiteSelection {
  appTypeId?: string;
  appearance?: BuildSuiteAppearance;
  paletteId?: string;
  styleId?: string;
  layoutId?: string;
  componentIds: string[];
  aiFeatureIds: string[];
  integrationIds: string[];
  animationId?: string;
  mobileId?: string;
}

export const emptyBuildSuiteSelection: BuildSuiteSelection = {
  componentIds: [],
  aiFeatureIds: [],
  integrationIds: [],
};
