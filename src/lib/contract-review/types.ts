import type { BuildContractRequirementType } from '@/lib/build-contract';
import type { TaskGraphTask } from '@/lib/task-graph';

export const CONTRACT_REVIEW_SCHEMA_VERSION = 1;
export const CONTRACT_REVIEW_METADATA_VERSION = '2026-07-21';

export type ContractReviewRequirementStatus =
  | 'satisfied'
  | 'partially satisfied'
  | 'missing'
  | 'failed validation'
  | 'blocked'
  | 'manually review';

export type ContractReviewCategory =
  | 'required routes'
  | 'navigation'
  | 'data models'
  | 'authentication'
  | 'ownership/security'
  | 'APIs'
  | 'AI features'
  | 'storage'
  | 'billing'
  | 'environment variable template'
  | 'responsive design'
  | 'accessibility'
  | 'visual requirements'
  | 'error states'
  | 'tests'
  | 'deployment readiness';

export type ContractReviewValidationResult =
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'not run'
  | 'manual';

export interface ContractReviewEvidence {
  kind: 'file' | 'route' | 'model' | 'api' | 'validation' | 'env' | 'note';
  ref: string;
  description?: string;
}

export interface ContractReviewRequirementReport {
  requirementId: string;
  requirementType: BuildContractRequirementType;
  category: ContractReviewCategory;
  requirementDescription: string;
  required: boolean;
  status: ContractReviewRequirementStatus;
  evidence: ContractReviewEvidence[];
  relatedFiles: string[];
  relatedRoutes: string[];
  relatedModels: string[];
  relatedApis: string[];
  validationResult: ContractReviewValidationResult;
  missingImplementation?: string;
  warning?: string;
  recommendedRepairTask?: TaskGraphTask;
}

export interface ContractReviewFinalSummary {
  whatWasBuilt: string[];
  whatPassed: string[];
  whatRemains: string[];
  blockedEnvironmentalItems: string[];
  requiredEnvironmentVariables: string[];
  manualSetupSteps: string[];
  deploymentReadiness: 'ready' | 'not ready' | 'blocked' | 'manual review required';
}

export interface ContractReviewReport {
  schemaVersion: typeof CONTRACT_REVIEW_SCHEMA_VERSION;
  metadataVersion: typeof CONTRACT_REVIEW_METADATA_VERSION;
  id: string;
  projectId?: string;
  projectName: string;
  contractId: string;
  contractVersion: number;
  repositoryFingerprint: string;
  buildValidationPassed: boolean;
  generatedAt: string;
  requirementReports: ContractReviewRequirementReport[];
  completionAllowed: boolean;
  blockingRequirementIds: string[];
  optionalMissingRequirementIds: string[];
  blockedRequirementIds: string[];
  manualReviewRequirementIds: string[];
  summary: ContractReviewFinalSummary;
}
