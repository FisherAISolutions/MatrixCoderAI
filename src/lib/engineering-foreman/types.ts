import type { ArchitectBudgetMode } from '@/lib/matrix-ai-architect/types';
import type {
  EngineeringDiscipline,
  TaskFailureClassification,
  TaskGraph,
  TaskGraphEvidenceReference,
  TaskGraphPriority,
} from '@/lib/task-graph';

export const ENGINEERING_FOREMAN_SCHEMA_VERSION = 1;
export const ENGINEERING_FOREMAN_PACKET_VERSION = 1;
export const ENGINEERING_FOREMAN_METADATA_VERSION = '2026-07-25';

export type EngineeringForemanTaskStatus =
  | 'queued'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'waiting'
  | 'needs-repair'
  | 'validated'
  | 'complete'
  | 'cancelled'
  | 'skipped';

export type EngineeringForemanMilestoneId =
  | 'foundation'
  | 'authentication'
  | 'database'
  | 'core-ui'
  | 'business-logic'
  | 'ai-features'
  | 'deployment'
  | 'validation'
  | 'completion';

export type EngineeringForemanMilestoneStatus =
  | 'queued'
  | 'active'
  | 'blocked'
  | 'complete';

export type EngineeringForemanFailureAction =
  | 'retry'
  | 'repair'
  | 'block'
  | 'cancel'
  | 'escalate';

export type EngineeringForemanDecisionKind =
  | 'schedule'
  | 'repair'
  | 'wait'
  | 'blocked'
  | 'complete'
  | 'cancelled';

export interface EngineeringForemanTaskState {
  taskId: string;
  status: EngineeringForemanTaskStatus;
  milestoneId: EngineeringForemanMilestoneId;
  startCount: number;
  retryCount: number;
  repairCount: number;
  evidence: TaskGraphEvidenceReference[];
  repositoryFingerprintBefore?: string;
  repositoryFingerprintAfter?: string;
  startedAt?: string;
  finishedAt?: string;
  validatedAt?: string;
  lastScheduledAt?: string;
  blockedReason?: string;
  resumable: boolean;
}

export interface EngineeringForemanMilestoneState {
  id: EngineeringForemanMilestoneId;
  title: string;
  status: EngineeringForemanMilestoneStatus;
  taskIds: string[];
  completedTaskIds: string[];
  blockedTaskIds: string[];
}

export interface EngineeringForemanRepositoryRefresh {
  fingerprint: string;
  refreshedAt: string;
}

export interface EngineeringForemanCheckpoint {
  id: string;
  createdAt: string;
  validatedTaskId: string;
  taskGraph: TaskGraph;
  taskStates: EngineeringForemanTaskState[];
  completedTaskIds: string[];
  repositoryFingerprint: string;
  evidenceReferences: string[];
  engineeringMemoryReferences: string[];
  currentMilestone: EngineeringForemanMilestoneId;
  remainingTaskIds: string[];
}

export interface EngineeringForemanState {
  schemaVersion: typeof ENGINEERING_FOREMAN_SCHEMA_VERSION;
  metadataVersion: typeof ENGINEERING_FOREMAN_METADATA_VERSION;
  id: string;
  projectId: string;
  taskGraphId: string;
  contractId: string;
  contractVersion: number;
  capabilityRegistryVersion?: string;
  taskStates: EngineeringForemanTaskState[];
  milestones: EngineeringForemanMilestoneState[];
  currentMilestone: EngineeringForemanMilestoneId;
  activeTaskId?: string;
  repositoryRefresh?: EngineeringForemanRepositoryRefresh;
  latestCheckpoint?: EngineeringForemanCheckpoint;
  checkpointHistory: EngineeringForemanCheckpoint[];
  cancelled: boolean;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskIntelligenceFileReference {
  path: string;
  readable: boolean;
  missing: boolean;
  generated: boolean;
  userEdited: boolean;
  protected: boolean;
  contentHash?: string;
}

export interface TaskIntelligenceDependency {
  taskId: string;
  title: string;
  status: EngineeringForemanTaskStatus;
}

export interface TaskIntelligenceRequirement {
  stableId: string;
  title: string;
  description: string;
  required: boolean;
  validationStrategy: string;
}

export interface TaskIntelligenceCapabilityReference {
  capabilityId: string;
  status: 'required' | 'optional';
  source: 'contract' | 'dependency' | 'domain-pack';
  sourceRequirementIds: string[];
}

export interface TaskIntelligenceBlueprintDecision {
  kind:
    | 'route'
    | 'data-model'
    | 'component'
    | 'integration'
    | 'role'
    | 'navigation'
    | 'folder'
    | 'deployment';
  id: string;
  value: string;
  description?: string;
}

export interface TaskIntelligenceMemoryLesson {
  recordId: string;
  lesson: string;
  confidence: number;
  evidenceReferences: string[];
}

export interface TaskIntelligenceValidationStrategy {
  commands: string[];
  requirementStrategies: string[];
  acceptanceChecks: string[];
}

export interface TaskIntelligenceRepairStrategy {
  failureClassification: TaskFailureClassification;
  remainingAttempts: number;
  allowedPaths: string[];
  preserveUnrelatedWork: true;
  stopOnEnvironmentOrPermissionFailure: true;
}

export interface TaskIntelligenceEstimatedScope {
  size: 'small' | 'medium' | 'large';
  expectedFileCount: number;
  allowedScopeCount: number;
  acceptanceCheckCount: number;
  reason: string;
}

export interface TaskIntelligencePacket {
  packetVersion: typeof ENGINEERING_FOREMAN_PACKET_VERSION;
  kind: 'engineering-task';
  projectId: string;
  task: {
    id: string;
    title: string;
    category: string;
    discipline: EngineeringDiscipline;
    priority: TaskGraphPriority;
  };
  purpose: string;
  repositoryFingerprint: string;
  relevantExistingFiles: TaskIntelligenceFileReference[];
  protectedFiles: string[];
  expectedOutputs: string[];
  expectedFiles: string[];
  allowedPaths: string[];
  requiredDependencies: TaskIntelligenceDependency[];
  blockedDependencies: TaskIntelligenceDependency[];
  acceptanceCriteria: string[];
  validationStrategy: TaskIntelligenceValidationStrategy;
  repairStrategy: TaskIntelligenceRepairStrategy;
  memoryLessons: TaskIntelligenceMemoryLesson[];
  blueprintDecisions: TaskIntelligenceBlueprintDecision[];
  contractRequirements: TaskIntelligenceRequirement[];
  capabilityReferences: TaskIntelligenceCapabilityReference[];
  currentMilestone: EngineeringForemanMilestoneId;
  confidence: number;
  budgetMode: ArchitectBudgetMode;
  complexity: 'low' | 'medium' | 'high';
  estimatedScope: TaskIntelligenceEstimatedScope;
  createdAt: string;
}

export interface EngineeringForemanDecision {
  kind: EngineeringForemanDecisionKind;
  reason: string;
  state: EngineeringForemanState;
  taskId?: string;
  packet?: TaskIntelligencePacket;
  repositoryRefreshRequired: boolean;
}

export interface EngineeringForemanFailureDecision {
  action: EngineeringForemanFailureAction;
  reason: string;
  retryAllowed: boolean;
}

export interface EngineeringForemanCheckpointRestore {
  state: EngineeringForemanState;
  taskGraph: TaskGraph;
  checkpoint: EngineeringForemanCheckpoint;
}
