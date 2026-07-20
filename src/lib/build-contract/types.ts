import type { BuildManifest } from '@/lib/build-suite/buildManifest';
import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import type { ArchitectDraft } from '@/lib/matrix-ai-architect/types';

export const BUILD_CONTRACT_SCHEMA_VERSION = 1;
export const BUILD_CONTRACT_METADATA_VERSION = '2026-07-20';

export type BuildContractSourceKind =
  | 'blueprint'
  | 'architect'
  | 'build-manifest'
  | 'platform-default';

export type BuildContractCapabilityStatus = 'required' | 'optional';

export type BuildContractCompletionStatus =
  | 'pending'
  | 'satisfied'
  | 'failed'
  | 'waived';

export type BuildContractValidationStrategy =
  | 'route-exists'
  | 'file-exists'
  | 'content-check'
  | 'config-check'
  | 'type-check'
  | 'build'
  | 'runtime-smoke'
  | 'generated-quality'
  | 'manual-review';

export type BuildContractRequirementType =
  | 'route'
  | 'layout'
  | 'navigation'
  | 'data-model'
  | 'relationship'
  | 'authentication'
  | 'role-permission'
  | 'api'
  | 'integration'
  | 'ai-capability'
  | 'storage'
  | 'billing'
  | 'background-job'
  | 'environment-variable'
  | 'deployment'
  | 'visual'
  | 'responsive'
  | 'accessibility'
  | 'acceptance'
  | 'constraint';

export interface BuildContractSourceReference {
  kind: Exclude<BuildContractSourceKind, 'platform-default'>;
  id?: string;
  metadataVersion?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface BuildContractEvidenceReference {
  kind: 'route' | 'file' | 'model' | 'source' | 'note';
  ref: string;
  description?: string;
}

export interface BuildContractRequirement {
  stableId: string;
  type: BuildContractRequirementType;
  title: string;
  description: string;
  status: BuildContractCapabilityStatus;
  source: BuildContractSourceKind;
  validationStrategy: BuildContractValidationStrategy;
  completionStatus: BuildContractCompletionStatus;
  evidenceReferences: BuildContractEvidenceReference[];
}

export interface BuildContractRoute {
  path: string;
  label: string;
  purpose?: string;
  required: boolean;
  source: BuildContractSourceKind;
}

export interface BuildContractDataModel {
  name: string;
  fields: string[];
  purpose?: string;
  source: BuildContractSourceKind;
}

export interface BuildContractApi {
  path: string;
  methods: string[];
  purpose?: string;
  source: BuildContractSourceKind;
}

export interface BuildContractIdentity {
  projectId?: string;
  projectName: string;
  workspaceId?: string;
}

export interface BuildContractVisualRequirements {
  appearance?: string;
  palette?: string;
  uiStyle?: string;
  layout?: string;
  source: BuildContractSourceKind;
}

export interface BuildContractResponsiveRequirements {
  mobileSupport: string[];
  expectations: string[];
  source: BuildContractSourceKind;
}

export interface BuildContractAccessibilityExpectations {
  expectations: string[];
  source: BuildContractSourceKind;
}

export interface BuildContract {
  schemaVersion: typeof BUILD_CONTRACT_SCHEMA_VERSION;
  metadataVersion: typeof BUILD_CONTRACT_METADATA_VERSION;
  contractVersion: number;
  id: string;
  project: BuildContractIdentity;
  projectSummary: string;
  sourceArchitectDraft?: BuildContractSourceReference;
  sourceBuildManifest?: BuildContractSourceReference;
  sourceBlueprintDraft?: BuildContractSourceReference;
  targetFramework: string;
  routes: BuildContractRoute[];
  layouts: string[];
  navigation: string[];
  dataModels: BuildContractDataModel[];
  relationships: string[];
  authentication: string;
  rolesAndPermissions: string[];
  apis: BuildContractApi[];
  integrations: string[];
  aiCapabilities: string[];
  storageRequirements: string[];
  billingRequirements: string[];
  backgroundJobs: string[];
  environmentVariableNames: string[];
  deploymentTarget: string;
  visualRequirements: BuildContractVisualRequirements;
  responsiveRequirements: BuildContractResponsiveRequirements;
  accessibilityExpectations: BuildContractAccessibilityExpectations;
  acceptanceCriteria: string[];
  constraints: string[];
  optionalCapabilities: string[];
  requiredCapabilities: string[];
  requirements: BuildContractRequirement[];
  createdAt: string;
  updatedAt: string;
}

export interface BuildContractCreateOptions {
  projectId?: string;
  projectName?: string;
  workspaceId?: string;
  architectDraft?: ArchitectDraft | null;
  buildManifest?: BuildManifest | null;
  blueprintDraft?: BlueprintDraft | null;
  existingContract?: BuildContract | null;
  now?: Date;
}
