import type { BuildManifest } from '@/lib/build-suite/buildManifest';
import type { BuildContract } from '@/lib/build-contract';
import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import type { ArchitectDraft } from '@/lib/matrix-ai-architect/types';
import type { RepositoryModel, RepositoryTaskContext } from '@/lib/repository-model';
import type { TaskGraph, TaskGraphTask } from '@/lib/task-graph';
import type { EngineeringMemory } from '@/lib/engineering-memory';

export const INTELLIGENCE_CORE_SCHEMA_VERSION = 1;
export const INTELLIGENCE_RECORD_SCHEMA_VERSION = 1;
export const INTELLIGENCE_CONTEXT_PACKET_VERSION = 1;
export const INTELLIGENCE_CORE_METADATA_VERSION = '2026-07-22';
export const VISION_BRAIN_VERSION = '2026-07-22';

export const INTELLIGENCE_BRAIN_DOMAINS = [
  'vision',
  'project',
  'product',
  'user',
  'conversation',
  'working',
  'engineering',
  'experience',
] as const;

export type IntelligenceBrainDomain =
  (typeof INTELLIGENCE_BRAIN_DOMAINS)[number];

export type IntelligenceMemoryCategory =
  | 'identity'
  | 'goal'
  | 'requirement'
  | 'decision'
  | 'constraint'
  | 'preference'
  | 'architecture'
  | 'capability'
  | 'repository-fact'
  | 'task-state'
  | 'validation'
  | 'lesson'
  | 'temporary'
  | 'summary';

export type IntelligenceMemoryStatus =
  | 'inferred'
  | 'proposed'
  | 'approved'
  | 'verified'
  | 'rejected'
  | 'superseded'
  | 'expired'
  | 'conflict';

export type IntelligenceSensitivity =
  | 'public'
  | 'internal'
  | 'private'
  | 'secret'
  | 'raw-media';

export type IntelligenceSourceKind =
  | 'user-correction'
  | 'user-approved'
  | 'blueprint'
  | 'architect'
  | 'build-contract'
  | 'repository'
  | 'experience'
  | 'build-manifest'
  | 'safe-default'
  | 'conversation'
  | 'working';

export type IntelligenceValidationStrategy =
  | 'none'
  | 'user-approval'
  | 'repository-evidence'
  | 'contract-evidence'
  | 'task-validation'
  | 'manual-review';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface IntelligenceSourceReference {
  kind: IntelligenceSourceKind;
  id?: string;
  version?: string | number;
  updatedAt?: string;
  evidenceRef?: string;
}

export interface IntelligenceMemoryRecord {
  schemaVersion: typeof INTELLIGENCE_RECORD_SCHEMA_VERSION;
  stableId: string;
  domain: IntelligenceBrainDomain;
  category: IntelligenceMemoryCategory;
  key: string;
  value: JsonValue;
  source: IntelligenceSourceReference;
  confidence: number;
  status: IntelligenceMemoryStatus;
  userApproved: boolean;
  sensitivity: IntelligenceSensitivity;
  validationStrategy: IntelligenceValidationStrategy;
  evidenceReferences: IntelligenceEvidenceReference[];
  createdAt: string;
  updatedAt: string;
  supersedes?: string[];
  replacedBy?: string;
  expiresAt?: string;
}

export interface IntelligenceEvidenceReference {
  kind:
    | 'file'
    | 'route'
    | 'model'
    | 'api'
    | 'requirement'
    | 'task'
    | 'repository-fingerprint'
    | 'note';
  ref: string;
  description?: string;
}

export interface VisionBrain {
  version: typeof VISION_BRAIN_VERSION;
  productMission: string;
  operatingPrinciples: string[];
  qualityBar: string[];
  records: IntelligenceMemoryRecord[];
}

export interface ProjectBrain {
  records: IntelligenceMemoryRecord[];
}

export interface ProductBrain {
  records: IntelligenceMemoryRecord[];
}

export interface UserBrain {
  records: IntelligenceMemoryRecord[];
}

export interface ConversationBrain {
  records: IntelligenceMemoryRecord[];
}

export interface WorkingBrain {
  records: IntelligenceMemoryRecord[];
  activeTaskId?: string;
  activeRunId?: string;
  currentRepositoryFingerprint?: string;
  expiresAt?: string;
}

export interface EngineeringBrain {
  records: IntelligenceMemoryRecord[];
  buildContractId?: string;
  buildContractVersion?: number;
  taskGraphId?: string;
  repositoryFingerprint?: string;
  completedRequirementIds: string[];
  pendingRequirementIds: string[];
  failedTaskIds: string[];
  blockedTaskIds: string[];
  protectedPaths: string[];
}

export interface ExperienceBrain {
  records: IntelligenceMemoryRecord[];
  verifiedLessonIds: string[];
}

export interface IntelligenceConflict {
  id: string;
  domain: IntelligenceBrainDomain;
  category: IntelligenceMemoryCategory;
  key: string;
  recordIds: string[];
  reason: string;
  status: 'unresolved' | 'resolved' | 'ignored';
  resolutionRecordId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface MatrixIntelligenceCore {
  schemaVersion: typeof INTELLIGENCE_CORE_SCHEMA_VERSION;
  metadataVersion: typeof INTELLIGENCE_CORE_METADATA_VERSION;
  id: string;
  projectId: string;
  vision: VisionBrain;
  project: ProjectBrain;
  product: ProductBrain;
  user: UserBrain;
  conversation: ConversationBrain;
  working: WorkingBrain;
  engineering: EngineeringBrain;
  experience: ExperienceBrain;
  conflicts: IntelligenceConflict[];
  createdAt: string;
  updatedAt: string;
}

export type SerializedMatrixIntelligenceCore = MatrixIntelligenceCore;

export interface IntelligenceCoreSources {
  projectId: string;
  projectName?: string;
  architectDraft?: ArchitectDraft | null;
  buildManifest?: BuildManifest | null;
  blueprintDraft?: BlueprintDraft | null;
  buildContract?: BuildContract | null;
  taskGraph?: TaskGraph | null;
  repositoryModel?: RepositoryModel | null;
  engineeringMemory?: EngineeringMemory | null;
  existingCore?: MatrixIntelligenceCore | null;
  now?: Date;
}

export interface AddIntelligenceRecordInput {
  domain: IntelligenceBrainDomain;
  category: IntelligenceMemoryCategory;
  key: string;
  value: JsonValue;
  source: IntelligenceSourceReference;
  confidence?: number;
  status?: IntelligenceMemoryStatus;
  userApproved?: boolean;
  sensitivity?: IntelligenceSensitivity;
  validationStrategy?: IntelligenceValidationStrategy;
  evidenceReferences?: IntelligenceEvidenceReference[];
  supersedes?: string[];
  expiresAt?: string;
  now?: Date;
}

export interface ResolveIntelligenceDecisionOptions {
  domain?: IntelligenceBrainDomain;
  category?: IntelligenceMemoryCategory;
  key: string;
}

export interface IntelligenceDecisionResolution {
  record?: IntelligenceMemoryRecord;
  precedenceRank: number;
  conflicted: boolean;
}

export interface IntelligenceTaskContextPacket {
  packetVersion: typeof INTELLIGENCE_CONTEXT_PACKET_VERSION;
  kind: 'task';
  projectId: string;
  taskId: string;
  taskObjective: string;
  allowedPaths: string[];
  protectedPaths: string[];
  buildContractRequirementIds: string[];
  repositoryFingerprint?: string;
  repositoryState: 'fresh' | 'stale' | 'missing';
  currentRepositoryFacts: IntelligenceMemoryRecord[];
  relevantMemory: IntelligenceMemoryRecord[];
  repositoryContext?: RepositoryTaskContext;
  expectedFiles: string[];
  expectedOutputs: string[];
  missingExpectedFiles: string[];
  existingExpectedFiles: string[];
  validationCommands: string[];
  unresolvedAssumptions: string[];
  applicableLessons: IntelligenceMemoryRecord[];
  fullFileCreationRequired: boolean;
  doNotValidateExpectedOutputsBeforeGeneration: boolean;
  createdAt: string;
}

export interface IntelligenceSummaryPacket {
  packetVersion: typeof INTELLIGENCE_CONTEXT_PACKET_VERSION;
  kind:
    | 'architect'
    | 'blueprint'
    | 'validation'
    | 'change-planning'
    | 'final-review'
    | 'user-summary';
  projectId: string;
  summary: string;
  authoritativeRequirementIds: string[];
  relevantMemory: IntelligenceMemoryRecord[];
  unresolvedConflicts: IntelligenceConflict[];
  createdAt: string;
}

export interface IntelligenceArchitectContextPacket
  extends Omit<IntelligenceSummaryPacket, 'kind'> {
  kind: 'architect';
  visionPrinciples: string[];
  projectContext: IntelligenceMemoryRecord[];
  approvedProductDecisions: IntelligenceMemoryRecord[];
  userPreferences: IntelligenceMemoryRecord[];
  recentConversationDecisions: IntelligenceMemoryRecord[];
  unresolvedQuestions: IntelligenceMemoryRecord[];
  rejectedRecommendations: IntelligenceMemoryRecord[];
  budgetConstraints: IntelligenceMemoryRecord[];
  readinessStage: string;
  assumptions: string[];
}

export interface IntelligenceTaskPacketOptions {
  task: TaskGraphTask;
  buildContract?: BuildContract | null;
  repositoryModel?: RepositoryModel | null;
  repositoryContext?: RepositoryTaskContext;
  includeRecordsLimit?: number;
  now?: Date;
}
