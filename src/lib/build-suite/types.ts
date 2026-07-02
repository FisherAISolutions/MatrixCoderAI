export type BuildSuiteAppearance = 'light' | 'dark';

export type BuildSuiteComplexity = 'low' | 'medium' | 'high';

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
}

export interface BuildSuiteCatalog {
  appTypes: BuildSuiteItem[];
  palettes: BuildSuiteItem[];
  styles: BuildSuiteItem[];
  layouts: BuildSuiteItem[];
  components: BuildSuiteItem[];
  aiFeatures: BuildSuiteItem[];
  integrations: BuildSuiteItem[];
  animations: BuildSuiteItem[];
  mobile: BuildSuiteItem[];
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
