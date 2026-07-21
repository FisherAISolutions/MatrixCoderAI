import type { ArchitectDraft } from '@/lib/matrix-ai-architect/types';
import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import type { BuildContract } from '@/lib/build-contract';
import type { TaskGraph, TaskGraphTask } from '@/lib/task-graph';

export const CHANGE_PLAN_SCHEMA_VERSION = 1;
export const CHANGE_PLAN_METADATA_VERSION = '2026-07-21';

export type ChangeRequestSource = 'conversation' | 'blueprint' | 'manual';

export type BuildChangePlanStatus =
  | 'draft'
  | 'approval-required'
  | 'approved'
  | 'cancelled'
  | 'ready-to-execute'
  | 'executing'
  | 'validated'
  | 'failed';

export type ChangeIntentKind =
  | 'localized-feature-change'
  | 'architecture-change'
  | 'provider-change'
  | 'destructive-change'
  | 'unknown';

export type ChangeRiskKind =
  | 'auth-provider-change'
  | 'database-provider-change'
  | 'destructive-schema-change'
  | 'billing-provider-change'
  | 'deployment-target-change'
  | 'route-deletion'
  | 'model-deletion'
  | 'feature-deletion'
  | 'user-edited-file'
  | 'migration-required'
  | 'broad-regeneration-risk';

export type ChangeEffortEstimate = 'small' | 'medium' | 'large' | 'platform';

export interface BuildChangeRequest {
  schemaVersion: typeof CHANGE_PLAN_SCHEMA_VERSION;
  metadataVersion: typeof CHANGE_PLAN_METADATA_VERSION;
  id: string;
  projectId?: string;
  userRequest: string;
  source: ChangeRequestSource;
  createdAt: string;
}

export interface ChangePlanSourceVersions {
  architectDraftId?: string;
  architectDraftUpdatedAt?: string;
  buildManifestUpdatedAt?: string;
  blueprintDraftId?: string;
  blueprintDraftUpdatedAt?: string;
  buildContractId?: string;
  buildContractVersion?: number;
  buildContractUpdatedAt?: string;
  taskGraphId?: string;
  taskGraphUpdatedAt?: string;
  repositoryFingerprint?: string;
}

export interface ChangeIntent {
  kind: ChangeIntentKind;
  summary: string;
  confidence: number;
  assumptions: string[];
}

export interface ArchitectChangeSummary {
  changed: boolean;
  fields: string[];
  summary: string;
}

export interface BlueprintChangeSummary {
  changed: boolean;
  routesAdded: string[];
  routesRemoved: string[];
  routesChanged: string[];
  modelsAdded: string[];
  modelsRemoved: string[];
  modelsChanged: string[];
  componentsAdded: string[];
  componentsChanged: string[];
  integrationsChanged: string[];
  summary: string;
}

export interface ContractChangeSet<T = string> {
  added: T[];
  removed: T[];
  changed: T[];
}

export interface BuildContractChangeSummary {
  routes: ContractChangeSet;
  dataModels: ContractChangeSet;
  apis: ContractChangeSet;
  integrations: ContractChangeSet;
  capabilities: ContractChangeSet;
  requirements: ContractChangeSet;
  authenticationChanged: boolean;
  billingChanged: boolean;
  deploymentTargetChanged: boolean;
  databaseChanged: boolean;
  summary: string;
}

export interface ChangePlanTaskSummary {
  taskId: string;
  title: string;
  status: TaskGraphTask['status'];
  reason: string;
}

export interface ChangePlanRisk {
  kind: ChangeRiskKind;
  severity: 'info' | 'warning' | 'requires-approval';
  message: string;
  affectedRefs: string[];
}

export interface ChangePlanApprovalRequirement {
  required: boolean;
  reasons: string[];
  riskKinds: ChangeRiskKind[];
}

export interface BuildChangePlan {
  schemaVersion: typeof CHANGE_PLAN_SCHEMA_VERSION;
  metadataVersion: typeof CHANGE_PLAN_METADATA_VERSION;
  id: string;
  projectId?: string;
  userRequest: string;
  interpretedIntent: ChangeIntent;
  architectChanges: ArchitectChangeSummary;
  blueprintChanges: BlueprintChangeSummary;
  contractChanges: BuildContractChangeSummary;
  affectedCapabilities: string[];
  affectedRoutes: string[];
  affectedModels: string[];
  affectedApis: string[];
  affectedFiles: string[];
  protectedUserEditedFiles: string[];
  newTasks: ChangePlanTaskSummary[];
  invalidatedTasks: ChangePlanTaskSummary[];
  preservedTasks: ChangePlanTaskSummary[];
  risks: ChangePlanRisk[];
  migrationImplications: string[];
  estimatedEffort: ChangeEffortEstimate;
  explicitApprovalRequirement: ChangePlanApprovalRequirement;
  status: BuildChangePlanStatus;
  sourceVersions: ChangePlanSourceVersions;
  proposedArchitectDraft?: ArchitectDraft;
  proposedBlueprintDraft?: BlueprintDraft;
  proposedBuildContract?: BuildContract;
  proposedTaskGraph?: TaskGraph;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChangePlanOptions {
  projectId?: string;
  userRequest: string;
  source?: ChangeRequestSource;
  architectDraft?: ArchitectDraft | null;
  buildManifest?: import('@/lib/build-suite/buildManifest').BuildManifest | null;
  blueprintDraft?: BlueprintDraft | null;
  buildContract?: BuildContract | null;
  taskGraph?: TaskGraph | null;
  capabilityResolution?: import('@/lib/capabilities').CapabilityResolutionResult | null;
  repositoryModel?: import('@/lib/repository-model').RepositoryModel | null;
  now?: Date;
}
