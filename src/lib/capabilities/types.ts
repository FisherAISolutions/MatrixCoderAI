import type { BuildContract } from '@/lib/build-contract';
import type { ArchitectBudgetMode } from '@/lib/matrix-ai-architect/types';

export const CAPABILITY_REGISTRY_VERSION = '2026-07-20';
export const CAPABILITY_RESOLUTION_SCHEMA_VERSION = 1;

export type CapabilityCategory =
  | 'foundation'
  | 'frontend'
  | 'backend'
  | 'data'
  | 'authentication'
  | 'authorization'
  | 'storage'
  | 'AI'
  | 'billing'
  | 'communication'
  | 'analytics'
  | 'operations'
  | 'deployment'
  | 'domain-specific';

export type CapabilityApplicability = 'required' | 'optional';
export type CapabilityComplexity = 'low' | 'medium' | 'high' | 'platform';
export type CapabilityConflictSeverity = 'warning' | 'error';
export type CapabilityCostBand =
  | 'free'
  | 'low'
  | 'moderate'
  | 'high'
  | 'enterprise/custom';

export interface CapabilityProviderChoice {
  id: string;
  label: string;
  category: CapabilityRecommendationCategory;
  costBand: CapabilityCostBand;
  hasFreeTier: boolean;
  assumptions: string[];
}

export type CapabilityRecommendationCategory =
  | 'database'
  | 'authentication'
  | 'deployment'
  | 'file-storage'
  | 'billing'
  | 'email'
  | 'analytics'
  | 'monitoring'
  | 'AI-provider'
  | 'background-jobs'
  | 'compute';

export interface CapabilityDefinition {
  id: string;
  category: CapabilityCategory;
  displayName: string;
  description: string;
  technicalDescription: string;
  applicability: CapabilityApplicability;
  dependencyCapabilityIds: string[];
  conflictingCapabilityIds: string[];
  providerChoices: CapabilityProviderChoice[];
  requiredEnvironmentVariableNames: string[];
  recommendedPackages: string[];
  expectedArchitecturalArtifacts: string[];
  expectedRoutes: string[];
  expectedApis: string[];
  expectedDataModels: string[];
  expectedStorageRequirements: string[];
  acceptanceCriteriaTemplates: string[];
  validationStrategies: string[];
  estimatedComplexity: CapabilityComplexity;
  budgetCompatibility: ArchitectBudgetMode[];
  supportedDeploymentAssumptions: string[];
  sourceMetadataVersion: string;
}

export interface ResolvedCapability {
  capabilityId: string;
  status: CapabilityApplicability;
  sourceRequirementIds: string[];
  source: 'contract' | 'dependency' | 'domain-pack';
  addedByCapabilityIds: string[];
  addedByDomainPackIds: string[];
}

export interface CapabilityConflict {
  capabilityIds: string[];
  severity: CapabilityConflictSeverity;
  explanation: string;
  recommendedResolution: string;
}

export interface CapabilityProviderRecommendation {
  category: CapabilityRecommendationCategory;
  recommendedOption: string;
  lowerCostAlternative: string;
  reason: string;
  estimatedCostBand: CapabilityCostBand;
  hasFreeTier: boolean;
  confidence: number;
  assumptions: string[];
  relevantCapabilityIds: string[];
}

export interface CapabilityDomainPack {
  id: string;
  displayName: string;
  description: string;
  matchTags: string[];
  suggestedCapabilityIds: string[];
  domainEntities: string[];
  acceptanceCriteria: string[];
  riskChecks: string[];
  uxPatterns: string[];
  terminology: string[];
  recommendations: string[];
  metadataVersion: string;
}

export interface CapabilityDomainPackContribution {
  domainPackId: string;
  capabilityIds: string[];
  domainEntities: string[];
  acceptanceCriteria: string[];
  riskChecks: string[];
  uxPatterns: string[];
  terminology: string[];
  recommendations: string[];
}

export interface CapabilityResolutionWarning {
  code:
    | 'missing-definition'
    | 'dependency-cycle'
    | 'unresolved-custom-requirement'
    | 'unknown-domain';
  message: string;
  capabilityId?: string;
  requirementId?: string;
}

export interface CapabilityResolutionResult {
  schemaVersion: typeof CAPABILITY_RESOLUTION_SCHEMA_VERSION;
  registryVersion: typeof CAPABILITY_REGISTRY_VERSION;
  contractId: string;
  contractVersion: number;
  capabilities: ResolvedCapability[];
  detectedCapabilities: ResolvedCapability[];
  expandedDependencies: ResolvedCapability[];
  providerRecommendations: CapabilityProviderRecommendation[];
  conflicts: CapabilityConflict[];
  warnings: CapabilityResolutionWarning[];
  sourceRequirementIds: string[];
  domainPackContributions: CapabilityDomainPackContribution[];
  unresolvedCustomRequirements: string[];
  createdAt: string;
}

export interface CapabilityResolutionOptions {
  budgetMode?: ArchitectBudgetMode;
  domainPacks?: CapabilityDomainPack[];
  now?: Date;
}

export interface CapabilityDetectionContext {
  contract: BuildContract;
  textIndex: string;
  requirementIdsByCapability: Map<string, Set<string>>;
}
