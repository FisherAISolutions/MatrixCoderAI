import type { BuildManifest } from '@/lib/build-suite/buildManifest';

export const ARCHITECT_DRAFT_METADATA_VERSION = '2026-07-19';

export type ArchitectBudgetMode =
  | 'free-first'
  | 'lean'
  | 'professional'
  | 'growth';

export type ArchitectQuestionType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean';

export type ArchitectComplexity = 'small' | 'medium' | 'large' | 'platform';

export interface ArchitectQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface ArchitectQuestion {
  id: keyof ArchitectAnswers;
  label: string;
  description: string;
  type: ArchitectQuestionType;
  category:
    | 'foundation'
    | 'users'
    | 'product'
    | 'data'
    | 'integrations'
    | 'delivery';
  options?: ArchitectQuestionOption[];
  placeholder?: string;
}

export interface ArchitectAnswers {
  appIdea: string;
  investmentLevel: ArchitectBudgetMode;
  primaryUsers: string;
  accountsRequired: boolean;
  adminPanel: boolean;
  mobileSupport: string[];
  payments: boolean;
  notifications: string[];
  aiFeatures: string[];
  offlineSupport: boolean;
  database: string;
  publicWebsite: boolean;
  dashboard: boolean;
  crm: boolean;
  scheduling: boolean;
  analytics: boolean;
  auth: string;
  deploymentTarget: string;
  integrations: string[];
  customRequirements: string;
}

export interface ArchitectRouteSpec {
  path: string;
  label: string;
  purpose: string;
  priority: 'primary' | 'secondary';
}

export interface ArchitectDataModelSpec {
  name: string;
  fields: string[];
  purpose: string;
}

export interface ArchitectApiSpec {
  path: string;
  purpose: string;
  methods: string[];
}

export interface ArchitectRecommendation {
  title: string;
  description: string;
  confidence: number;
  category:
    | 'architecture'
    | 'database'
    | 'auth'
    | 'deployment'
    | 'ux'
    | 'cost'
    | 'ai';
}

export interface ArchitectSpecification {
  applicationSummary: string;
  recommendedArchitecture: string;
  recommendedFolderStructure: string[];
  recommendedRoutes: ArchitectRouteSpec[];
  recommendedDataModels: ArchitectDataModelSpec[];
  recommendedComponents: string[];
  recommendedApis: ArchitectApiSpec[];
  recommendedIntegrations: string[];
  recommendedAuth: string;
  recommendedDeployment: string;
  estimatedComplexity: ArchitectComplexity;
  estimatedGenerationSize: 'compact' | 'standard' | 'expanded';
  estimatedAiPasses: number;
  confidenceScore: number;
  recommendations: ArchitectRecommendation[];
}

export interface ArchitectDraft {
  id: string;
  projectId?: string;
  projectName: string;
  answers: ArchitectAnswers;
  specification: ArchitectSpecification;
  sourceBuildManifest?: BuildManifest;
  createdAt: string;
  updatedAt: string;
  metadataVersion: typeof ARCHITECT_DRAFT_METADATA_VERSION;
}

export interface ArchitectDraftCreateOptions {
  projectId?: string;
  projectName?: string;
  sourceBuildManifest?: BuildManifest;
  now?: Date;
}
