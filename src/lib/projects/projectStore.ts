import type {
  ChatMessage,
  FileNode,
} from '@/app/chat-workspace/components/types';
import {
  deserializeBuildManifest,
  serializeBuildManifest,
  type BuildManifest,
} from '@/lib/build-suite/buildManifest';
import {
  deserializeBlueprintDraft,
  serializeBlueprintDraft,
  type BlueprintDraft,
} from '@/lib/blueprint-studio/blueprintDraft';
import {
  deserializeBuildContract,
  serializeBuildContract,
  type BuildContract,
} from '@/lib/build-contract';
import {
  deserializeCapabilityResolution,
  serializeCapabilityResolution,
  type CapabilityResolutionResult,
} from '@/lib/capabilities';
import {
  deserializeTaskGraph,
  serializeTaskGraph,
  type TaskGraph,
} from '@/lib/task-graph';
import {
  deserializeRepositoryModel,
  serializeRepositoryModel,
  type RepositoryModel,
} from '@/lib/repository-model';
import {
  cloneEngineeringMemoryForProject,
  deserializeEngineeringMemory,
  serializeEngineeringMemory,
  type EngineeringMemory,
} from '@/lib/engineering-memory';
import {
  deserializeTaskExecutionState,
  serializeTaskExecutionState,
  type TaskExecutionState,
} from '@/lib/task-execution';
import {
  deserializeBuildOrchestrationState,
  serializeBuildOrchestrationState,
  type BuildOrchestrationState,
} from '@/lib/build-orchestration';
import {
  cloneEngineeringForemanStateForProject,
  deserializeEngineeringForemanState,
  serializeEngineeringForemanState,
  type EngineeringForemanState,
} from '@/lib/engineering-foreman';
import {
  deserializeContractReviewReport,
  serializeContractReviewReport,
  type ContractReviewReport,
} from '@/lib/contract-review';
import {
  cloneIntelligenceCoreForProject,
  deserializeIntelligenceCore,
  serializeIntelligenceCore,
  type MatrixIntelligenceCore,
} from '@/lib/intelligence-core';
import {
  cloneBuildChangePlanForProject,
  deserializeBuildChangePlan,
  serializeBuildChangePlan,
  type BuildChangePlan,
} from '@/lib/change-planning';
import {
  deserializeArchitectDraft,
  serializeArchitectDraft,
} from '@/lib/matrix-ai-architect/architectDraft';
import type { ArchitectDraft } from '@/lib/matrix-ai-architect/types';
import { supabase as defaultSupabase } from '@/lib/supabase';
import {
  getActiveStorageUserId,
  getUserScopedStorageKey,
} from '@/lib/storage/userScope';

export const MATRIX_PROJECTS_STORAGE_KEY = 'matrix-coder:projects';
export const MATRIX_PROJECTS_LOCAL_NAMESPACE_PREFIX =
  'matrix-coder:projects:v2';
export const MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY =
  'matrix-coder:workspace-project-snapshot';
export const MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY =
  'matrix-coder:workspace-project-context';
export const MATRIX_PROJECTS_OPEN_HANDOFF_KEY =
  'matrix-coder:project-open-handoff';
export const MATRIX_PROJECTS_VERSION = 2;
export const MATRIX_PROJECT_OPEN_HANDOFF_TTL_MS = 15 * 60 * 1000;

export type MatrixProjectSaveState =
  | 'unsaved'
  | 'saving'
  | 'saved'
  | 'save-failed'
  | 'offline-local-only'
  | 'conflict'
  | 'stale'
  | 'cancelled'
  | 'unauthorized';

export type MatrixProjectSyncStatus =
  | 'synced'
  | 'saving'
  | 'offline-local'
  | 'conflict'
  | 'failed'
  | 'restoring'
  | 'unauthorized';

export type MatrixProjectValidationStatus =
  | 'unknown'
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed';

export type MatrixProjectDeploymentStatus =
  | 'unknown'
  | 'pending'
  | 'ready'
  | 'deployed'
  | 'failed';

export interface MatrixProjectWorkspaceState {
  activeFilePath?: string;
}

export interface MatrixProject {
  id: string;
  workspaceId?: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  favorite: boolean;
  saveVersion: number;
  files: FileNode[];
  chatMessages: ChatMessage[];
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
  architectDraft?: ArchitectDraft;
  buildContract?: BuildContract;
  capabilityResolution?: CapabilityResolutionResult;
  taskGraph?: TaskGraph;
  repositoryModel?: RepositoryModel;
  engineeringMemory?: EngineeringMemory;
  engineeringForemanState?: EngineeringForemanState;
  taskExecutionState?: TaskExecutionState;
  buildOrchestrationState?: BuildOrchestrationState;
  contractReviewReport?: ContractReviewReport;
  intelligenceCore?: MatrixIntelligenceCore;
  changePlan?: BuildChangePlan;
  validationStatus: MatrixProjectValidationStatus;
  deploymentStatus: MatrixProjectDeploymentStatus;
  workspaceState?: MatrixProjectWorkspaceState;
  metadataVersion: number;
}

export interface MatrixProjectDraft {
  workspaceId?: string;
  name: string;
  description?: string;
  favorite?: boolean;
  files?: FileNode[];
  chatMessages?: ChatMessage[];
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
  architectDraft?: ArchitectDraft;
  buildContract?: BuildContract;
  capabilityResolution?: CapabilityResolutionResult;
  taskGraph?: TaskGraph;
  repositoryModel?: RepositoryModel;
  engineeringMemory?: EngineeringMemory;
  engineeringForemanState?: EngineeringForemanState;
  taskExecutionState?: TaskExecutionState;
  buildOrchestrationState?: BuildOrchestrationState;
  contractReviewReport?: ContractReviewReport;
  intelligenceCore?: MatrixIntelligenceCore;
  changePlan?: BuildChangePlan;
  validationStatus?: MatrixProjectValidationStatus;
  deploymentStatus?: MatrixProjectDeploymentStatus;
  workspaceState?: MatrixProjectWorkspaceState;
}

export interface MatrixProjectWorkspaceContext {
  currentProjectId?: string;
  currentProjectName?: string;
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
  architectDraft?: ArchitectDraft;
  buildContract?: BuildContract;
  capabilityResolution?: CapabilityResolutionResult;
  taskGraph?: TaskGraph;
  repositoryModel?: RepositoryModel;
  engineeringMemory?: EngineeringMemory;
  engineeringForemanState?: EngineeringForemanState;
  taskExecutionState?: TaskExecutionState;
  buildOrchestrationState?: BuildOrchestrationState;
  contractReviewReport?: ContractReviewReport;
  intelligenceCore?: MatrixIntelligenceCore;
  changePlan?: BuildChangePlan;
}

export interface MatrixProjectWorkspaceSnapshot {
  projectId?: string;
  name: string;
  description: string;
  files: FileNode[];
  chatMessages: ChatMessage[];
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
  architectDraft?: ArchitectDraft;
  buildContract?: BuildContract;
  capabilityResolution?: CapabilityResolutionResult;
  taskGraph?: TaskGraph;
  repositoryModel?: RepositoryModel;
  engineeringMemory?: EngineeringMemory;
  engineeringForemanState?: EngineeringForemanState;
  taskExecutionState?: TaskExecutionState;
  buildOrchestrationState?: BuildOrchestrationState;
  contractReviewReport?: ContractReviewReport;
  intelligenceCore?: MatrixIntelligenceCore;
  changePlan?: BuildChangePlan;
  validationStatus: MatrixProjectValidationStatus;
  deploymentStatus: MatrixProjectDeploymentStatus;
  workspaceState?: MatrixProjectWorkspaceState;
  favorite?: boolean;
  lastOpenedAt?: string;
  updatedAt: string;
}

export interface MatrixProjectOpenHandoff {
  source: 'projects';
  projectId: string;
  projectName: string;
  createdAt: string;
  message: string;
}

export interface MatrixProjectPersistenceResult {
  projects: MatrixProject[];
  source: 'supabase' | 'local';
  saveState?: MatrixProjectSaveState;
  syncStatus?: MatrixProjectSyncStatus;
  conflictProject?: MatrixProject;
  warning?: string;
}

interface MatrixProjectLocalEnvelope {
  version: number;
  userId: string;
  projects: MatrixProject[];
  savedAt: string;
}

interface SupabaseUserResult {
  data?: { user?: { id: string } | null } | null;
  error?: { message?: string } | null;
}

interface SupabaseQueryResult<T> {
  data?: T[] | T | null;
  error?: { message?: string } | null;
}

export interface SupabaseProjectClient {
  auth: {
    getUser: () => Promise<SupabaseUserResult>;
  };
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          options?: { ascending?: boolean }
        ) => Promise<SupabaseQueryResult<SupabaseProjectRecord>>;
      };
    };
    upsert: (
      values: SupabaseProjectRecord | SupabaseProjectRecord[],
      options?: { onConflict?: string }
    ) => Promise<SupabaseQueryResult<SupabaseProjectRecord>>;
    delete: () => {
      eq: (column: string, value: string) => SupabaseProjectMutationBuilder;
    };
  };
  rpc?: (
    functionName: string,
    args: Record<string, unknown>
  ) => Promise<SupabaseQueryResult<SupabaseProjectRecord>>;
}

export interface SupabaseProjectMutationBuilder
  extends PromiseLike<SupabaseQueryResult<SupabaseProjectRecord>> {
  eq: (column: string, value: string) => SupabaseProjectMutationBuilder;
}

interface SupabaseProjectRecord {
  id: string;
  user_id: string;
  name: string;
  description: string;
  payload: unknown;
  created_at: string;
  updated_at: string;
  workspace_id?: string | null;
  favorite?: boolean;
  save_version?: number;
  last_opened_at?: string | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface PersistenceOptions {
  storage?: StorageLike;
  supabaseClient?: SupabaseProjectClient | null;
  userId?: string;
}

export interface SaveMatrixProjectOptions extends PersistenceOptions {
  expectedUpdatedAt?: string;
}

export interface DeleteMatrixProjectOptions extends PersistenceOptions {
  expectedName?: string;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function getMatrixProjectsLocalStorageKey(userId?: string): string {
  const scopedUser = userId?.trim() || 'anonymous';
  return `${MATRIX_PROJECTS_LOCAL_NAMESPACE_PREFIX}:${scopedUser}`;
}

function sortProjects(projects: MatrixProject[]): MatrixProject[] {
  return [...projects].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isPermanentPersistenceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /auth|jwt|permission|policy|rls|unauthori[sz]ed|forbidden|not authenticated/i.test(
    message
  );
}

async function withBoundedRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (isPermanentPersistenceError(error) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 125 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function createProjectId(now = new Date()): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `project-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function redactPersistentSecrets(value: string): string {
  return value
    .replace(
      /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
      '$1 [redacted-secret]'
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[redacted-secret]')
    .replace(
      /\b((?:OPENAI|ANTHROPIC|GEMINI|PERPLEXITY|VERCEL|STRIPE|SUPABASE)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET)|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*([^\s"'`]+)/gi,
      '$1=[redacted-secret]'
    );
}

function sanitizePersistentFiles(nodes: FileNode[]): FileNode[] {
  return nodes.map((node) => {
    const next = { ...node };
    if (node.type === 'folder') {
      next.children = sanitizePersistentFiles(node.children ?? []);
      return next;
    }
    if (typeof node.content !== 'string') return next;

    const basename = node.path.replace(/\\/g, '/').split('/').pop() ?? '';
    const isPrivateEnv =
      /^\.env(?:\..+)?$/i.test(basename) &&
      !/\.example$|\.sample$|\.template$/i.test(basename);
    next.content = isPrivateEnv
      ? node.content.replace(
          /^(\s*(?:export\s+)?(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE)[A-Z0-9_]*|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|PERPLEXITY_API_KEY|DATABASE_URL)\s*=).+$/gim,
          '$1[redacted-secret]'
        )
      : redactPersistentSecrets(node.content);
    return next;
  });
}

function sanitizePersistentChatMessages(
  messages: ChatMessage[]
): ChatMessage[] {
  return messages.map((message) => ({
    ...cloneJson(message),
    content: redactPersistentSecrets(message.content),
    codeBlocks: message.codeBlocks?.map((block) => ({
      ...block,
      code: redactPersistentSecrets(block.code),
    })),
  }));
}

function normalizeWorkspaceState(
  value: unknown
): MatrixProjectWorkspaceState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { activeFilePath?: unknown };
  if (
    typeof candidate.activeFilePath === 'string' &&
    candidate.activeFilePath.trim()
  ) {
    return {
      activeFilePath: candidate.activeFilePath,
    };
  }
  return undefined;
}

function normalizeProjectPayload(
  value: unknown
): Omit<MatrixProject, 'id' | 'name' | 'description' | 'createdAt' | 'updatedAt'> | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<MatrixProject>;

  if (!Array.isArray(parsed.files) || !Array.isArray(parsed.chatMessages)) {
    return null;
  }

  const buildManifest = parsed.buildManifest
    ? (deserializeBuildManifest(JSON.stringify(parsed.buildManifest)) ?? undefined)
    : undefined;
  const blueprintDraft = parsed.blueprintDraft
    ? (deserializeBlueprintDraft(JSON.stringify(parsed.blueprintDraft)) ?? undefined)
    : undefined;
  const architectDraft = parsed.architectDraft
    ? (deserializeArchitectDraft(JSON.stringify(parsed.architectDraft)) ?? undefined)
    : undefined;
  const buildContract = parsed.buildContract
    ? (deserializeBuildContract(JSON.stringify(parsed.buildContract)) ?? undefined)
    : undefined;
  const capabilityResolution = parsed.capabilityResolution
    ? (deserializeCapabilityResolution(JSON.stringify(parsed.capabilityResolution)) ??
      undefined)
    : undefined;
  const taskGraph = parsed.taskGraph
    ? (deserializeTaskGraph(JSON.stringify(parsed.taskGraph)) ?? undefined)
    : undefined;
  const repositoryModel = parsed.repositoryModel
    ? (deserializeRepositoryModel(JSON.stringify(parsed.repositoryModel)) ??
      undefined)
    : undefined;
  const engineeringMemory = parsed.engineeringMemory
    ? (deserializeEngineeringMemory(JSON.stringify(parsed.engineeringMemory)) ??
      undefined)
    : undefined;
  const engineeringForemanState = parsed.engineeringForemanState
    ? (deserializeEngineeringForemanState(
        JSON.stringify(parsed.engineeringForemanState)
      ) ?? undefined)
    : undefined;
  const taskExecutionState = parsed.taskExecutionState
    ? (deserializeTaskExecutionState(JSON.stringify(parsed.taskExecutionState)) ??
      undefined)
    : undefined;
  const buildOrchestrationState = parsed.buildOrchestrationState
    ? (deserializeBuildOrchestrationState(
        JSON.stringify(parsed.buildOrchestrationState)
      ) ?? undefined)
    : undefined;
  const contractReviewReport = parsed.contractReviewReport
    ? (deserializeContractReviewReport(
        JSON.stringify(parsed.contractReviewReport)
      ) ?? undefined)
    : undefined;
  const intelligenceCore = parsed.intelligenceCore
    ? (deserializeIntelligenceCore(
        JSON.stringify(parsed.intelligenceCore),
        typeof parsed.id === 'string' ? parsed.id : undefined
      ) ?? undefined)
    : undefined;
  const changePlan = parsed.changePlan
    ? (deserializeBuildChangePlan(JSON.stringify(parsed.changePlan)) ??
      undefined)
    : undefined;

  return {
    files: cloneJson(parsed.files as FileNode[]),
    chatMessages: cloneJson(parsed.chatMessages as ChatMessage[]),
    buildManifest,
    blueprintDraft,
    architectDraft,
    buildContract,
    capabilityResolution,
    taskGraph,
    repositoryModel,
    engineeringMemory,
    engineeringForemanState,
    taskExecutionState,
    buildOrchestrationState,
    contractReviewReport,
    intelligenceCore,
    changePlan,
    validationStatus:
      parsed.validationStatus === 'passed' ||
      parsed.validationStatus === 'failed' ||
      parsed.validationStatus === 'running' ||
      parsed.validationStatus === 'pending'
        ? parsed.validationStatus
        : 'unknown',
    deploymentStatus:
      parsed.deploymentStatus === 'ready' ||
      parsed.deploymentStatus === 'deployed' ||
      parsed.deploymentStatus === 'failed' ||
      parsed.deploymentStatus === 'pending'
        ? parsed.deploymentStatus
        : 'unknown',
    workspaceId:
      typeof parsed.workspaceId === 'string' && parsed.workspaceId.trim()
        ? parsed.workspaceId
        : undefined,
    lastOpenedAt: isValidIsoDate(parsed.lastOpenedAt)
      ? parsed.lastOpenedAt
      : undefined,
    favorite: parsed.favorite === true,
    saveVersion:
      typeof parsed.saveVersion === 'number' && Number.isFinite(parsed.saveVersion)
        ? parsed.saveVersion
        : 1,
    workspaceState: normalizeWorkspaceState(parsed.workspaceState),
    metadataVersion:
      typeof parsed.metadataVersion === 'number'
        ? parsed.metadataVersion
        : MATRIX_PROJECTS_VERSION,
  };
}

function normalizeProjectRecord(value: unknown): MatrixProject | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<MatrixProject>;
  if (
    typeof parsed.id !== 'string' ||
    !parsed.id.trim() ||
    typeof parsed.name !== 'string' ||
    !parsed.name.trim() ||
    typeof parsed.description !== 'string' ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.updatedAt !== 'string'
  ) {
    return null;
  }

  const payload = normalizeProjectPayload(parsed);
  if (!payload) return null;

  return {
    id: parsed.id,
    name: parsed.name.trim(),
    description: parsed.description,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    ...payload,
  };
}

function normalizeProjectList(value: unknown): MatrixProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeProjectRecord(item))
    .filter((item): item is MatrixProject => Boolean(item));
}

function serializeProject(project: MatrixProject): MatrixProject {
  return {
    ...project,
    files: cloneJson(project.files),
    chatMessages: cloneJson(project.chatMessages),
    ...(project.buildManifest
      ? {
          buildManifest: JSON.parse(
            serializeBuildManifest(project.buildManifest)
          ) as BuildManifest,
        }
      : {}),
    ...(project.blueprintDraft
      ? {
          blueprintDraft: JSON.parse(
            serializeBlueprintDraft(project.blueprintDraft)
          ) as BlueprintDraft,
        }
      : {}),
    ...(project.architectDraft
      ? {
          architectDraft: JSON.parse(
            serializeArchitectDraft(project.architectDraft)
          ) as ArchitectDraft,
        }
      : {}),
    ...(project.buildContract
      ? {
          buildContract: JSON.parse(
            serializeBuildContract(project.buildContract)
          ) as BuildContract,
        }
      : {}),
    ...(project.capabilityResolution
      ? {
          capabilityResolution: JSON.parse(
            serializeCapabilityResolution(project.capabilityResolution)
          ) as CapabilityResolutionResult,
        }
      : {}),
    ...(project.taskGraph
      ? {
          taskGraph: JSON.parse(
            serializeTaskGraph(project.taskGraph)
          ) as TaskGraph,
        }
      : {}),
    ...(project.repositoryModel
      ? {
          repositoryModel: JSON.parse(
            serializeRepositoryModel(project.repositoryModel)
          ) as RepositoryModel,
        }
      : {}),
    ...(project.engineeringMemory
      ? {
          engineeringMemory: JSON.parse(
            serializeEngineeringMemory(project.engineeringMemory)
          ) as EngineeringMemory,
        }
      : {}),
    ...(project.engineeringForemanState
      ? {
          engineeringForemanState: JSON.parse(
            serializeEngineeringForemanState(project.engineeringForemanState)
          ) as EngineeringForemanState,
        }
      : {}),
    ...(project.taskExecutionState
      ? {
          taskExecutionState: JSON.parse(
            serializeTaskExecutionState(project.taskExecutionState)
          ) as TaskExecutionState,
        }
      : {}),
    ...(project.buildOrchestrationState
      ? {
          buildOrchestrationState: JSON.parse(
            serializeBuildOrchestrationState(project.buildOrchestrationState)
          ) as BuildOrchestrationState,
        }
      : {}),
    ...(project.contractReviewReport
      ? {
          contractReviewReport: JSON.parse(
            serializeContractReviewReport(project.contractReviewReport)
          ) as ContractReviewReport,
        }
      : {}),
    ...(project.intelligenceCore
      ? {
          intelligenceCore: JSON.parse(
            serializeIntelligenceCore(project.intelligenceCore)
          ) as MatrixIntelligenceCore,
        }
      : {}),
    ...(project.changePlan
      ? {
          changePlan: JSON.parse(
            serializeBuildChangePlan(project.changePlan)
          ) as BuildChangePlan,
        }
      : {}),
    workspaceState: project.workspaceState
      ? { ...project.workspaceState }
      : undefined,
  };
}

export function readLocalProjectsDiagnostics(
  storage: StorageLike | null,
  userId?: string
): { projects: MatrixProject[]; warning?: string; migratedLegacy: boolean } {
  if (!storage) return { projects: [], migratedLegacy: false };

  const scopedKey = getMatrixProjectsLocalStorageKey(userId);
  const scopedRaw = storage.getItem(scopedKey);
  if (scopedRaw) {
    try {
      const parsed = JSON.parse(scopedRaw) as Partial<MatrixProjectLocalEnvelope>;
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.version === MATRIX_PROJECTS_VERSION &&
        parsed.userId === (userId?.trim() || 'anonymous') &&
        Array.isArray(parsed.projects)
      ) {
        return {
          projects: sortProjects(normalizeProjectList(parsed.projects)),
          migratedLegacy: false,
        };
      }
      return {
        projects: [],
        warning: 'Saved project cache was in an unsupported format and was ignored.',
        migratedLegacy: false,
      };
    } catch {
      return {
        projects: [],
        warning: 'Saved project cache was corrupted and was ignored.',
        migratedLegacy: false,
      };
    }
  }

  const legacyRaw = storage.getItem(MATRIX_PROJECTS_STORAGE_KEY);
  if (!legacyRaw) return { projects: [], migratedLegacy: false };

  try {
    const projects = sortProjects(normalizeProjectList(JSON.parse(legacyRaw)));
    if (projects.length > 0) {
      writeLocalProjects(storage, projects, userId);
      storage.removeItem(MATRIX_PROJECTS_STORAGE_KEY);
    }
    return { projects, migratedLegacy: projects.length > 0 };
  } catch {
    return {
      projects: [],
      warning: 'Legacy project cache was corrupted and was ignored.',
      migratedLegacy: false,
    };
  }
}

function readLocalProjects(storage: StorageLike | null, userId?: string): MatrixProject[] {
  return readLocalProjectsDiagnostics(storage, userId).projects;
}

function writeLocalProjects(
  storage: StorageLike | null,
  projects: MatrixProject[],
  userId?: string
): string | undefined {
  if (!storage) return undefined;
  const envelope: MatrixProjectLocalEnvelope = {
    version: MATRIX_PROJECTS_VERSION,
    userId: userId?.trim() || 'anonymous',
    projects: sortProjects(projects).map(serializeProjectForPersistence),
    savedAt: new Date().toISOString(),
  };
  try {
    storage.setItem(getMatrixProjectsLocalStorageKey(userId), JSON.stringify(envelope));
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'Unable to write project cache to local storage.';
  }
}

async function loadRemoteProjects(
  supabaseClient: SupabaseProjectClient,
  expectedUserId?: string
): Promise<MatrixProjectPersistenceResult> {
  const userResult = await supabaseClient.auth.getUser();
  const user = userResult.data?.user;
  if (!user?.id) {
    throw new ProjectAuthorizationError();
  }
  if (expectedUserId && user.id !== expectedUserId) {
    throw new ProjectAuthorizationError(
      'The active account does not own this project scope.'
    );
  }

  const response = await supabaseClient
    .from('matrix_projects')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (response.error) {
    throw new Error(response.error.message || 'Unable to load projects.');
  }

  const rows = Array.isArray(response.data) ? response.data : [];
  const projects = rows
    .map((row): MatrixProject | null => {
      const payload = normalizeProjectPayload(row.payload);
      if (!payload) return null;
      return {
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...payload,
        workspaceId: payload.workspaceId ?? row.workspace_id ?? row.id,
        lastOpenedAt: payload.lastOpenedAt ?? row.last_opened_at ?? undefined,
        favorite: payload.favorite || row.favorite === true,
        saveVersion: Math.max(payload.saveVersion, row.save_version ?? 1),
      } satisfies MatrixProject;
    })
    .filter((item): item is MatrixProject => Boolean(item));

  return {
    projects: sortProjects(projects),
    source: 'supabase',
    syncStatus: 'synced',
  };
}

function serializeProjectForPersistence(project: MatrixProject): MatrixProject {
  const serialized = serializeProject(project);
  return {
    ...serialized,
    files: sanitizePersistentFiles(serialized.files),
    chatMessages: sanitizePersistentChatMessages(serialized.chatMessages),
  };
}

function reconcileRemoteAndLocalProjects(
  remoteProjects: MatrixProject[],
  localProjects: MatrixProject[]
): { projects: MatrixProject[]; hasPendingLocalChanges: boolean } {
  const reconciled = new Map(
    remoteProjects.map((project) => [project.id, project] as const)
  );
  let hasPendingLocalChanges = false;

  for (const localProject of localProjects) {
    const remoteProject = reconciled.get(localProject.id);
    const localUpdatedAt = Date.parse(localProject.updatedAt);
    const remoteUpdatedAt = remoteProject
      ? Date.parse(remoteProject.updatedAt)
      : Number.NEGATIVE_INFINITY;
    const localIsNewer =
      !remoteProject ||
      localProject.saveVersion > remoteProject.saveVersion ||
      (localProject.saveVersion === remoteProject.saveVersion &&
        Number.isFinite(localUpdatedAt) &&
        (!Number.isFinite(remoteUpdatedAt) || localUpdatedAt > remoteUpdatedAt));

    if (localIsNewer) {
      reconciled.set(localProject.id, localProject);
      hasPendingLocalChanges = true;
    }
  }

  return {
    projects: sortProjects(Array.from(reconciled.values())),
    hasPendingLocalChanges,
  };
}

async function saveRemoteProject(
  supabaseClient: SupabaseProjectClient,
  project: MatrixProject,
  expectedSaveVersion: number | null,
  expectedUserId?: string
): Promise<void> {
  const userResult = await supabaseClient.auth.getUser();
  const user = userResult.data?.user;
  if (!user?.id) {
    throw new ProjectAuthorizationError();
  }
  if (expectedUserId && user.id !== expectedUserId) {
    throw new ProjectAuthorizationError(
      'The active account does not own this project scope.'
    );
  }

  const row: SupabaseProjectRecord = {
    id: project.id,
    user_id: user.id,
    name: project.name,
    description: project.description,
    payload: serializeProjectForPersistence(project),
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    workspace_id: project.workspaceId ?? project.id,
    favorite: project.favorite,
    save_version: project.saveVersion,
    last_opened_at: project.lastOpenedAt ?? null,
  };

  if (supabaseClient.rpc) {
    const atomicResponse = await supabaseClient.rpc(
      'save_matrix_project_if_version',
      {
        project_id: row.id,
        project_name: row.name,
        project_description: row.description,
        project_payload: row.payload,
        project_created_at: row.created_at,
        project_workspace_id: row.workspace_id,
        project_favorite: row.favorite,
        project_save_version: row.save_version,
        project_last_opened_at: row.last_opened_at,
        expected_save_version: expectedSaveVersion,
      }
    );
    if (!atomicResponse.error) {
      const rows = Array.isArray(atomicResponse.data)
        ? atomicResponse.data
        : atomicResponse.data
          ? [atomicResponse.data]
          : [];
      if (rows.length === 0) throw new ProjectVersionConflictError();
      return;
    }
    if (
      !/function .* does not exist|could not find the function/i.test(
        atomicResponse.error.message ?? ''
      )
    ) {
      throw new Error(atomicResponse.error.message || 'Unable to save project.');
    }
  }

  const response = await supabaseClient
    .from('matrix_projects')
    .upsert(row, { onConflict: 'id' });
  if (response.error) {
    throw new Error(response.error.message || 'Unable to save project.');
  }
}

class ProjectAuthorizationError extends Error {
  constructor(message = 'An authenticated project owner is required.') {
    super(message);
    this.name = 'ProjectAuthorizationError';
  }
}

class ProjectVersionConflictError extends Error {
  constructor() {
    super('A newer cloud copy exists.');
    this.name = 'ProjectVersionConflictError';
  }
}

async function deleteRemoteProject(
  supabaseClient: SupabaseProjectClient,
  projectId: string,
  expectedUserId?: string
): Promise<void> {
  const userResult = await supabaseClient.auth.getUser();
  const user = userResult.data?.user;
  if (!user?.id) {
    throw new ProjectAuthorizationError();
  }
  if (expectedUserId && user.id !== expectedUserId) {
    throw new ProjectAuthorizationError(
      'The active account does not own this project scope.'
    );
  }

  const response = await supabaseClient
    .from('matrix_projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', user.id);

  if (response.error) {
    throw new Error(response.error.message || 'Unable to delete project.');
  }
}

function resolveSupabaseClient(
  client?: SupabaseProjectClient | null
): SupabaseProjectClient | null {
  if (client === undefined) {
    return (defaultSupabase as unknown as SupabaseProjectClient | null) ?? null;
  }
  return client;
}

async function resolveStorageUserId(
  options: PersistenceOptions,
  supabaseClient: SupabaseProjectClient | null
): Promise<string | undefined> {
  if (options.userId?.trim()) return options.userId.trim();
  if (!supabaseClient) return undefined;
  const userResult = await supabaseClient.auth.getUser();
  const userId = userResult.data?.user?.id?.trim();
  if (!userId) throw new ProjectAuthorizationError();
  return userId;
}

function fileTreeContainsPath(nodes: FileNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === path) return true;
    if (node.type === 'folder' && node.children?.length) {
      if (fileTreeContainsPath(node.children, path)) return true;
    }
  }
  return false;
}

export function createMatrixProject(
  draft: MatrixProjectDraft,
  now = new Date(),
  id = createProjectId(now)
): MatrixProject {
  if (!draft.name.trim()) {
    throw new Error('Project name is required.');
  }

  const timestamp = now.toISOString();
  return {
    id,
    workspaceId: draft.workspaceId?.trim() || id,
    name: draft.name.trim(),
    description: draft.description?.trim() ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    favorite: draft.favorite === true,
    saveVersion: 1,
    files: cloneJson(draft.files ?? []),
    chatMessages: cloneJson(draft.chatMessages ?? []),
    buildManifest: draft.buildManifest,
    blueprintDraft: draft.blueprintDraft,
    architectDraft: draft.architectDraft,
    buildContract: draft.buildContract,
    capabilityResolution: draft.capabilityResolution,
    taskGraph: draft.taskGraph,
    repositoryModel: draft.repositoryModel,
    engineeringMemory: draft.engineeringMemory,
    engineeringForemanState: draft.engineeringForemanState,
    taskExecutionState: draft.taskExecutionState,
    buildOrchestrationState: draft.buildOrchestrationState,
    contractReviewReport: draft.contractReviewReport,
    intelligenceCore: draft.intelligenceCore,
    changePlan: draft.changePlan,
    validationStatus: draft.validationStatus ?? 'unknown',
    deploymentStatus: draft.deploymentStatus ?? 'unknown',
    workspaceState: draft.workspaceState
      ? { ...draft.workspaceState }
      : undefined,
    metadataVersion: MATRIX_PROJECTS_VERSION,
  };
}

export function renameMatrixProject(
  project: MatrixProject,
  name: string,
  now = new Date()
): MatrixProject {
  if (!name.trim()) {
    throw new Error('Project name is required.');
  }
  return {
    ...project,
    name: name.trim(),
    updatedAt: now.toISOString(),
  };
}

export function duplicateMatrixProject(
  project: MatrixProject,
  now = new Date(),
  id = createProjectId(now)
): MatrixProject {
  const timestamp = now.toISOString();
  return {
    ...serializeProject(project),
    id,
    workspaceId: id,
    name: `${project.name} Copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    favorite: false,
    saveVersion: 1,
    files: cloneJson(project.files),
    chatMessages: cloneJson(project.chatMessages),
    buildManifest: project.buildManifest
      ? (deserializeBuildManifest(serializeBuildManifest(project.buildManifest)) ?? undefined)
      : undefined,
    blueprintDraft: project.blueprintDraft
      ? (deserializeBlueprintDraft(serializeBlueprintDraft(project.blueprintDraft)) ?? undefined)
      : undefined,
    architectDraft: project.architectDraft
      ? (deserializeArchitectDraft(serializeArchitectDraft(project.architectDraft)) ?? undefined)
      : undefined,
    buildContract: project.buildContract
      ? (deserializeBuildContract(serializeBuildContract(project.buildContract)) ?? undefined)
      : undefined,
    capabilityResolution: project.capabilityResolution
      ? (deserializeCapabilityResolution(
          serializeCapabilityResolution(project.capabilityResolution)
        ) ?? undefined)
      : undefined,
    taskGraph: project.taskGraph
      ? (deserializeTaskGraph(serializeTaskGraph(project.taskGraph)) ?? undefined)
      : undefined,
    repositoryModel: project.repositoryModel
      ? (deserializeRepositoryModel(
          serializeRepositoryModel(project.repositoryModel)
        ) ?? undefined)
      : undefined,
    engineeringMemory: project.engineeringMemory
      ? cloneEngineeringMemoryForProject(project.engineeringMemory, id, now)
      : undefined,
    engineeringForemanState: project.engineeringForemanState
      ? cloneEngineeringForemanStateForProject(
          project.engineeringForemanState,
          id,
          project.taskGraph,
          now
        )
      : undefined,
    taskExecutionState: undefined,
    buildOrchestrationState: project.buildOrchestrationState
      ? {
          ...project.buildOrchestrationState,
          projectId: id,
          runId: undefined,
          operationId: undefined,
          activeTaskId: undefined,
          status: 'idle',
          stopReason: undefined,
          startedAt: undefined,
          finishedAt: undefined,
          updatedAt: timestamp,
          warnings: [],
          errors: [],
        }
      : undefined,
    contractReviewReport: undefined,
    intelligenceCore: project.intelligenceCore
      ? cloneIntelligenceCoreForProject(project.intelligenceCore, id, now)
      : undefined,
    changePlan: project.changePlan
      ? cloneBuildChangePlanForProject(project.changePlan, id, now)
      : undefined,
    workspaceState: project.workspaceState
      ? { ...project.workspaceState }
      : undefined,
  };
}

export function createProjectFromWorkspaceSnapshot(
  snapshot: MatrixProjectWorkspaceSnapshot,
  now = new Date(),
  id = createProjectId(now)
): MatrixProject {
  return createMatrixProject(
    {
      workspaceId: snapshot.projectId,
      name: snapshot.name,
      description: snapshot.description,
      favorite: snapshot.favorite,
      files: snapshot.files,
      chatMessages: snapshot.chatMessages,
      buildManifest: snapshot.buildManifest,
      blueprintDraft: snapshot.blueprintDraft,
      architectDraft: snapshot.architectDraft,
      buildContract: snapshot.buildContract,
      capabilityResolution: snapshot.capabilityResolution,
      taskGraph: snapshot.taskGraph,
      repositoryModel: snapshot.repositoryModel,
      engineeringMemory: snapshot.engineeringMemory,
      engineeringForemanState: snapshot.engineeringForemanState,
      taskExecutionState: snapshot.taskExecutionState,
      buildOrchestrationState: snapshot.buildOrchestrationState,
      contractReviewReport: snapshot.contractReviewReport,
      intelligenceCore: snapshot.intelligenceCore,
      changePlan: snapshot.changePlan,
      validationStatus: snapshot.validationStatus,
      deploymentStatus: snapshot.deploymentStatus,
      workspaceState: snapshot.workspaceState,
    },
    now,
    id
  );
}

export async function checkpointActiveMatrixProject(
  snapshot: MatrixProjectWorkspaceSnapshot,
  options: PersistenceOptions = {}
): Promise<MatrixProjectPersistenceResult | null> {
  const projectId = snapshot.projectId?.trim();
  if (!projectId) return null;

  const loaded = await loadMatrixProjects(options);
  const existingProject = loaded.projects.find((project) => project.id === projectId);
  if (!existingProject) return null;

  const updatedAt = snapshot.updatedAt || new Date().toISOString();
  const project: MatrixProject = {
    ...existingProject,
    name: snapshot.name || existingProject.name,
    description: snapshot.description,
    updatedAt,
    lastOpenedAt: snapshot.lastOpenedAt ?? existingProject.lastOpenedAt,
    favorite: snapshot.favorite ?? existingProject.favorite,
    files: cloneJson(snapshot.files),
    chatMessages: cloneJson(snapshot.chatMessages),
    buildManifest: snapshot.buildManifest,
    blueprintDraft: snapshot.blueprintDraft,
    architectDraft: snapshot.architectDraft,
    buildContract: snapshot.buildContract,
    capabilityResolution: snapshot.capabilityResolution,
    taskGraph: snapshot.taskGraph,
    repositoryModel: snapshot.repositoryModel,
    engineeringMemory: snapshot.engineeringMemory,
    engineeringForemanState: snapshot.engineeringForemanState,
    taskExecutionState: snapshot.taskExecutionState,
    buildOrchestrationState: snapshot.buildOrchestrationState,
    contractReviewReport: snapshot.contractReviewReport,
    intelligenceCore: snapshot.intelligenceCore,
    changePlan: snapshot.changePlan,
    validationStatus: snapshot.validationStatus,
    deploymentStatus: snapshot.deploymentStatus,
    workspaceState: snapshot.workspaceState
      ? { ...snapshot.workspaceState }
      : undefined,
  };

  return saveMatrixProject(project, loaded.projects, {
    ...options,
    expectedUpdatedAt: existingProject.updatedAt,
  });
}

export async function loadMatrixProjects(
  options: PersistenceOptions = {}
): Promise<MatrixProjectPersistenceResult> {
  const storage = getStorage(options.storage);
  const supabaseClient = resolveSupabaseClient(options.supabaseClient);
  let storageUserId: string | undefined;
  try {
    storageUserId = await resolveStorageUserId(options, supabaseClient);
  } catch (error) {
    return {
      projects: [],
      source: 'local',
      saveState: 'unauthorized',
      syncStatus: 'unauthorized',
      warning:
        error instanceof Error
          ? error.message
          : 'An authenticated project owner is required.',
    };
  }

  if (supabaseClient) {
    try {
      const remote = await loadRemoteProjects(supabaseClient, storageUserId);
      const local = readLocalProjectsDiagnostics(storage, storageUserId);
      const reconciled = reconcileRemoteAndLocalProjects(
        remote.projects,
        local.projects
      );
      const localWarning = writeLocalProjects(
        storage,
        reconciled.projects,
        storageUserId
      );
      if (reconciled.hasPendingLocalChanges) {
        return {
          projects: reconciled.projects,
          source: 'local',
          saveState: localWarning ? 'save-failed' : 'offline-local-only',
          syncStatus: localWarning ? 'failed' : 'offline-local',
          warning:
            localWarning ??
            'Newer local work is preserved and still needs to be saved to the cloud.',
        };
      }
      return {
        ...remote,
        projects: reconciled.projects,
        saveState: 'saved',
        syncStatus: localWarning ? 'failed' : 'synced',
        warning: localWarning,
      };
    } catch (error) {
      const local = readLocalProjectsDiagnostics(storage, storageUserId);
      const unauthorized = error instanceof ProjectAuthorizationError;
      return {
        projects: unauthorized ? [] : local.projects,
        source: 'local',
        saveState: unauthorized ? 'unauthorized' : 'offline-local-only',
        syncStatus: unauthorized ? 'unauthorized' : 'offline-local',
        warning:
          local.warning ??
          (error instanceof Error
            ? error.message
            : 'Supabase unavailable. Using local projects.'),
      };
    }
  }

  const local = readLocalProjectsDiagnostics(storage, storageUserId);
  return {
    projects: local.projects,
    source: 'local',
    saveState: 'offline-local-only',
    syncStatus: 'offline-local',
    warning: local.warning,
  };
}

export async function saveMatrixProject(
  project: MatrixProject,
  existing: MatrixProject[],
  options: SaveMatrixProjectOptions = {}
): Promise<MatrixProjectPersistenceResult> {
  const storage = getStorage(options.storage);
  const supabaseClient = resolveSupabaseClient(options.supabaseClient);
  let storageUserId: string | undefined;
  try {
    storageUserId = await resolveStorageUserId(options, supabaseClient);
  } catch (error) {
    return {
      projects: sortProjects(existing),
      source: 'local',
      saveState: 'unauthorized',
      syncStatus: 'unauthorized',
      warning:
        error instanceof Error
          ? error.message
          : 'An authenticated project owner is required.',
    };
  }
  const existingProject = existing.find((item) => item.id === project.id);

  if (
    options.expectedUpdatedAt &&
    existingProject &&
    Date.parse(existingProject.updatedAt) > Date.parse(options.expectedUpdatedAt)
  ) {
    return {
      projects: sortProjects(existing),
      source: 'local',
      saveState: 'conflict',
      syncStatus: 'conflict',
      conflictProject: existingProject,
      warning:
        'This project changed elsewhere after you opened it. Your local edits were preserved and were not overwritten.',
    };
  }

  if (supabaseClient && options.expectedUpdatedAt) {
    try {
      const remote = await loadRemoteProjects(supabaseClient, storageUserId);
      const remoteProject = remote.projects.find((item) => item.id === project.id);
      if (
        remoteProject &&
        Date.parse(remoteProject.updatedAt) > Date.parse(options.expectedUpdatedAt)
      ) {
        return {
          projects: sortProjects(existing),
          source: 'supabase',
          saveState: 'conflict',
          syncStatus: 'conflict',
          conflictProject: remoteProject,
          warning:
            'A newer cloud copy exists. Your local edits were preserved and were not overwritten.',
        };
      }
    } catch (error) {
      if (error instanceof ProjectAuthorizationError) {
        return {
          projects: sortProjects(existing),
          source: 'local',
          saveState: 'unauthorized',
          syncStatus: 'unauthorized',
          warning: error.message,
        };
      }
      // If the cloud check is unavailable, keep the local draft and fall back below.
    }
  }

  const projectToSave: MatrixProject = {
    ...serializeProject(project),
    workspaceId: project.workspaceId?.trim() || project.id,
    favorite: project.favorite === true,
    saveVersion: (existingProject?.saveVersion ?? project.saveVersion ?? 0) + 1,
  };
  const nextProjects = sortProjects([
    projectToSave,
    ...existing.filter((item) => item.id !== project.id),
  ]);

  const localWarning = writeLocalProjects(storage, nextProjects, storageUserId);

  if (supabaseClient) {
    try {
      await withBoundedRetry(() =>
        saveRemoteProject(
          supabaseClient,
          projectToSave,
          existingProject?.saveVersion ?? null,
          storageUserId
        )
      );
      return {
        projects: nextProjects,
        source: 'supabase',
        saveState: 'saved',
        syncStatus: localWarning ? 'failed' : 'synced',
        warning: localWarning
          ? `Cloud save succeeded, but the local recovery cache failed: ${localWarning}`
          : undefined,
      };
    } catch (error) {
      if (error instanceof ProjectVersionConflictError) {
        let conflictProject: MatrixProject | undefined;
        try {
          const remote = await loadRemoteProjects(supabaseClient, storageUserId);
          conflictProject = remote.projects.find(
            (item) => item.id === project.id
          );
        } catch {
          // Preserve the local recovery copy even if the newer cloud copy
          // cannot be reloaded for display.
        }
        return {
          projects: nextProjects,
          source: 'supabase',
          saveState: 'conflict',
          syncStatus: 'conflict',
          conflictProject,
          warning:
            'A newer cloud copy exists. Your local edits remain in the local recovery cache.',
        };
      }
      if (error instanceof ProjectAuthorizationError) {
        return {
          projects: nextProjects,
          source: 'local',
          saveState: 'unauthorized',
          syncStatus: 'unauthorized',
          warning: `${error.message} Unsaved work remains in the user-scoped local recovery cache.`,
        };
      }
      return {
        projects: nextProjects,
        source: 'local',
        saveState: localWarning ? 'save-failed' : 'offline-local-only',
        syncStatus: localWarning ? 'failed' : 'offline-local',
        warning:
          localWarning ??
          (error instanceof Error
            ? error.message
            : 'Supabase unavailable. Saved locally.'),
      };
    }
  }

  return {
    projects: nextProjects,
    source: 'local',
    saveState: localWarning ? 'save-failed' : 'offline-local-only',
    syncStatus: localWarning ? 'failed' : 'offline-local',
    warning: localWarning,
  };
}

export async function deleteMatrixProject(
  projectId: string,
  existing: MatrixProject[],
  options: DeleteMatrixProjectOptions = {}
): Promise<MatrixProjectPersistenceResult> {
  const storage = getStorage(options.storage);
  const supabaseClient = resolveSupabaseClient(options.supabaseClient);
  let storageUserId: string | undefined;
  try {
    storageUserId = await resolveStorageUserId(options, supabaseClient);
  } catch (error) {
    return {
      projects: sortProjects(existing),
      source: 'local',
      saveState: 'unauthorized',
      syncStatus: 'unauthorized',
      warning:
        error instanceof Error
          ? error.message
          : 'An authenticated project owner is required.',
    };
  }
  const project = existing.find((item) => item.id === projectId);
  const nextProjects = existing.filter((item) => item.id !== projectId);

  if (!project) {
    return {
      projects: sortProjects(existing),
      source: 'local',
      saveState: 'saved',
      syncStatus: supabaseClient ? 'synced' : 'offline-local',
    };
  }

  if (options.expectedName && options.expectedName !== project.name) {
    return {
      projects: sortProjects(existing),
      source: 'local',
      saveState: 'conflict',
      syncStatus: 'conflict',
      conflictProject: project,
      warning: 'Project name changed before deletion. Delete was cancelled.',
    };
  }

  if (supabaseClient) {
    try {
      await withBoundedRetry(() =>
        deleteRemoteProject(supabaseClient, projectId, storageUserId)
      );
      const localWarning = writeLocalProjects(storage, nextProjects, storageUserId);
      return {
        projects: sortProjects(nextProjects),
        source: 'supabase',
        saveState: localWarning ? 'save-failed' : 'saved',
        syncStatus: localWarning ? 'failed' : 'synced',
        warning: localWarning,
      };
    } catch (error) {
      return {
        projects: sortProjects(existing),
        source: 'local',
        saveState:
          error instanceof ProjectAuthorizationError
            ? 'unauthorized'
            : 'save-failed',
        syncStatus:
          error instanceof ProjectAuthorizationError
            ? 'unauthorized'
            : 'failed',
        warning:
          error instanceof Error
            ? error.message
            : 'Unable to delete project from Supabase.',
      };
    }
  }

  const localWarning = writeLocalProjects(storage, nextProjects, storageUserId);
  return {
    projects: sortProjects(nextProjects),
    source: 'local',
    saveState: localWarning ? 'save-failed' : 'offline-local-only',
    syncStatus: localWarning ? 'failed' : 'offline-local',
    warning: localWarning,
  };
}

export function toggleMatrixProjectFavorite(
  project: MatrixProject,
  now = new Date()
): MatrixProject {
  return {
    ...project,
    favorite: !project.favorite,
    updatedAt: now.toISOString(),
  };
}

export function markMatrixProjectOpened(
  project: MatrixProject,
  now = new Date()
): MatrixProject {
  return {
    ...project,
    lastOpenedAt: now.toISOString(),
  };
}

export interface MatrixProjectAutosaveController {
  getState: () => MatrixProjectSaveState;
  scheduleSave: (
    project: MatrixProject,
    existing: MatrixProject[],
    options?: SaveMatrixProjectOptions
  ) => Promise<MatrixProjectPersistenceResult>;
  cancel: () => void;
}

export function createMatrixProjectAutosaveController(
  saveDelayMs = 250,
  saveFn: typeof saveMatrixProject = saveMatrixProject
): MatrixProjectAutosaveController {
  let state: MatrixProjectSaveState = 'saved';
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let cancelledThrough = 0;
  let pending:
    | {
        requestId: number;
        project: MatrixProject;
        existing: MatrixProject[];
        options: SaveMatrixProjectOptions;
        resolve: (result: MatrixProjectPersistenceResult) => void;
      }
    | null = null;

  const staleResult = (
    projects: MatrixProject[],
    warning = 'A stale save response was ignored.'
  ): MatrixProjectPersistenceResult => ({
    projects,
    source: 'local',
    saveState: 'stale',
    syncStatus: 'saving',
    warning,
  });

  const cancelledResult = (
    projects: MatrixProject[]
  ): MatrixProjectPersistenceResult => ({
    projects,
    source: 'local',
    saveState: 'cancelled',
    syncStatus: 'failed',
    warning: 'The pending save was cancelled. Unsaved work remains in memory.',
  });

  const runNext = () => {
    if (inFlight || !pending) return;
    const current = pending;
    pending = null;
    inFlight = true;

    void saveFn(current.project, current.existing, current.options)
      .then((result) => {
        if (current.requestId <= cancelledThrough) {
          current.resolve(cancelledResult(current.existing));
          return;
        }
        if (current.requestId !== sequence) {
          current.resolve(staleResult(current.existing));
          return;
        }
        state = result.saveState ?? 'saved';
        current.resolve(result);
      })
      .catch((error) => {
        if (current.requestId <= cancelledThrough) {
          current.resolve(cancelledResult(current.existing));
          return;
        }
        if (current.requestId !== sequence) {
          current.resolve(staleResult(current.existing));
          return;
        }
        state = 'save-failed';
        current.resolve({
          projects: current.existing,
          source: 'local',
          saveState: 'save-failed',
          syncStatus: 'failed',
          warning:
            error instanceof Error ? error.message : 'Project save failed.',
        });
      })
      .finally(() => {
        inFlight = false;
        if (pending) runNext();
      });
  };

  return {
    getState: () => state,
    scheduleSave: (project, existing, options = {}) => {
      sequence += 1;
      const requestId = sequence;
      state = 'saving';
      if (timer) clearTimeout(timer);
      if (pending) {
        pending.resolve(
          staleResult(
            pending.existing,
            'A superseded pending save was not persisted.'
          )
        );
        pending = null;
      }

      return new Promise((resolve) => {
        pending = { requestId, project, existing, options, resolve };
        timer = setTimeout(() => {
          timer = null;
          runNext();
        }, saveDelayMs);
      });
    },
    cancel: () => {
      cancelledThrough = sequence;
      state = 'cancelled';
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending) {
        pending.resolve(cancelledResult(pending.existing));
        pending = null;
      }
    },
  };
}

export function saveMatrixProjectWorkspaceSnapshot(
  storage: StorageLike,
  snapshot: MatrixProjectWorkspaceSnapshot,
  userId?: string
): void {
  const ownerUserId = userId?.trim() || getActiveStorageUserId(storage);
  storage.setItem(
    getUserScopedStorageKey(
      MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY,
      ownerUserId,
      storage
    ),
    JSON.stringify({
      ...snapshot,
      files: sanitizePersistentFiles(snapshot.files),
      chatMessages: sanitizePersistentChatMessages(snapshot.chatMessages),
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(snapshot.buildManifest
        ? {
            buildManifest: JSON.parse(
              serializeBuildManifest(snapshot.buildManifest)
            ),
          }
        : {}),
      ...(snapshot.blueprintDraft
        ? {
            blueprintDraft: JSON.parse(
              serializeBlueprintDraft(snapshot.blueprintDraft)
            ),
          }
        : {}),
      ...(snapshot.architectDraft
        ? {
            architectDraft: JSON.parse(
              serializeArchitectDraft(snapshot.architectDraft)
            ),
          }
        : {}),
      ...(snapshot.buildContract
        ? {
            buildContract: JSON.parse(
              serializeBuildContract(snapshot.buildContract)
            ),
          }
        : {}),
      ...(snapshot.capabilityResolution
        ? {
            capabilityResolution: JSON.parse(
              serializeCapabilityResolution(snapshot.capabilityResolution)
            ),
          }
        : {}),
      ...(snapshot.taskGraph
        ? {
            taskGraph: JSON.parse(serializeTaskGraph(snapshot.taskGraph)),
          }
        : {}),
      ...(snapshot.repositoryModel
        ? {
            repositoryModel: JSON.parse(
              serializeRepositoryModel(snapshot.repositoryModel)
            ),
          }
        : {}),
      ...(snapshot.engineeringMemory
        ? {
            engineeringMemory: JSON.parse(
              serializeEngineeringMemory(snapshot.engineeringMemory)
            ),
          }
        : {}),
      ...(snapshot.engineeringForemanState
        ? {
            engineeringForemanState: JSON.parse(
              serializeEngineeringForemanState(
                snapshot.engineeringForemanState
              )
            ),
          }
        : {}),
      ...(snapshot.taskExecutionState
        ? {
            taskExecutionState: JSON.parse(
              serializeTaskExecutionState(snapshot.taskExecutionState)
            ),
          }
        : {}),
      ...(snapshot.buildOrchestrationState
        ? {
            buildOrchestrationState: JSON.parse(
              serializeBuildOrchestrationState(snapshot.buildOrchestrationState)
            ),
          }
        : {}),
      ...(snapshot.contractReviewReport
        ? {
            contractReviewReport: JSON.parse(
              serializeContractReviewReport(snapshot.contractReviewReport)
            ),
          }
        : {}),
      ...(snapshot.intelligenceCore
        ? {
            intelligenceCore: JSON.parse(
              serializeIntelligenceCore(snapshot.intelligenceCore)
            ),
          }
        : {}),
      ...(snapshot.changePlan
        ? {
            changePlan: JSON.parse(
              serializeBuildChangePlan(snapshot.changePlan)
            ),
          }
        : {}),
    })
  );
}

export function loadMatrixProjectWorkspaceSnapshot(
  storage: Pick<Storage, 'getItem'>,
  userId?: string
): MatrixProjectWorkspaceSnapshot | null {
  const ownerUserId = userId?.trim() || getActiveStorageUserId(storage);
  const raw = storage.getItem(
    getUserScopedStorageKey(
      MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY,
      ownerUserId,
      storage
    )
  );
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MatrixProjectWorkspaceSnapshot> & {
      ownerUserId?: unknown;
    };
    if (
      ownerUserId &&
      parsed.ownerUserId !== undefined &&
      parsed.ownerUserId !== ownerUserId
    ) {
      return null;
    }
    if (
      typeof parsed.name !== 'string' ||
      typeof parsed.description !== 'string' ||
      !Array.isArray(parsed.files) ||
      !Array.isArray(parsed.chatMessages) ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }

    const files = cloneJson(parsed.files as FileNode[]);
    const workspaceState = normalizeWorkspaceState(parsed.workspaceState);
    const safeWorkspaceState =
      workspaceState?.activeFilePath &&
      fileTreeContainsPath(files, workspaceState.activeFilePath)
        ? workspaceState
        : undefined;

    return {
      projectId:
        typeof parsed.projectId === 'string' && parsed.projectId.trim()
          ? parsed.projectId
          : undefined,
      name: parsed.name,
      description: parsed.description,
      files,
      chatMessages: cloneJson(parsed.chatMessages as ChatMessage[]),
      buildManifest: parsed.buildManifest
        ? (deserializeBuildManifest(JSON.stringify(parsed.buildManifest)) ?? undefined)
        : undefined,
      blueprintDraft: parsed.blueprintDraft
        ? (deserializeBlueprintDraft(JSON.stringify(parsed.blueprintDraft)) ?? undefined)
        : undefined,
      architectDraft: parsed.architectDraft
        ? (deserializeArchitectDraft(JSON.stringify(parsed.architectDraft)) ?? undefined)
        : undefined,
      buildContract: parsed.buildContract
        ? (deserializeBuildContract(JSON.stringify(parsed.buildContract)) ?? undefined)
        : undefined,
      capabilityResolution: parsed.capabilityResolution
        ? (deserializeCapabilityResolution(
            JSON.stringify(parsed.capabilityResolution)
          ) ?? undefined)
        : undefined,
      taskGraph: parsed.taskGraph
        ? (deserializeTaskGraph(JSON.stringify(parsed.taskGraph)) ?? undefined)
        : undefined,
      repositoryModel: parsed.repositoryModel
        ? (deserializeRepositoryModel(JSON.stringify(parsed.repositoryModel)) ??
          undefined)
        : undefined,
      engineeringMemory: parsed.engineeringMemory
        ? (deserializeEngineeringMemory(JSON.stringify(parsed.engineeringMemory)) ??
          undefined)
        : undefined,
      engineeringForemanState: parsed.engineeringForemanState
        ? (deserializeEngineeringForemanState(
            JSON.stringify(parsed.engineeringForemanState)
          ) ?? undefined)
        : undefined,
      taskExecutionState: parsed.taskExecutionState
        ? (deserializeTaskExecutionState(
            JSON.stringify(parsed.taskExecutionState)
          ) ?? undefined)
        : undefined,
      buildOrchestrationState: parsed.buildOrchestrationState
        ? (deserializeBuildOrchestrationState(
            JSON.stringify(parsed.buildOrchestrationState)
          ) ?? undefined)
        : undefined,
      contractReviewReport: parsed.contractReviewReport
        ? (deserializeContractReviewReport(
            JSON.stringify(parsed.contractReviewReport)
          ) ?? undefined)
        : undefined,
      intelligenceCore: parsed.intelligenceCore
        ? (deserializeIntelligenceCore(
            JSON.stringify(parsed.intelligenceCore),
            typeof parsed.projectId === 'string' ? parsed.projectId : undefined
          ) ?? undefined)
        : undefined,
      changePlan: parsed.changePlan
        ? (deserializeBuildChangePlan(JSON.stringify(parsed.changePlan)) ??
          undefined)
        : undefined,
      validationStatus:
        parsed.validationStatus === 'passed' ||
        parsed.validationStatus === 'failed' ||
        parsed.validationStatus === 'running' ||
        parsed.validationStatus === 'pending'
          ? parsed.validationStatus
          : 'unknown',
      deploymentStatus:
        parsed.deploymentStatus === 'ready' ||
        parsed.deploymentStatus === 'deployed' ||
        parsed.deploymentStatus === 'failed' ||
        parsed.deploymentStatus === 'pending'
          ? parsed.deploymentStatus
          : 'unknown',
      workspaceState: safeWorkspaceState,
      favorite: parsed.favorite === true,
      lastOpenedAt: isValidIsoDate(parsed.lastOpenedAt)
        ? parsed.lastOpenedAt
        : undefined,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function saveMatrixProjectWorkspaceContext(
  storage: StorageLike,
  context: MatrixProjectWorkspaceContext,
  userId?: string
): void {
  const ownerUserId = userId?.trim() || getActiveStorageUserId(storage);
  storage.setItem(
    getUserScopedStorageKey(
      MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY,
      ownerUserId,
      storage
    ),
    JSON.stringify({
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(context.currentProjectId
        ? { currentProjectId: context.currentProjectId }
        : {}),
      ...(context.currentProjectName
        ? { currentProjectName: context.currentProjectName }
        : {}),
      ...(context.buildManifest
        ? {
            buildManifest: JSON.parse(
              serializeBuildManifest(context.buildManifest)
            ),
          }
        : {}),
      ...(context.blueprintDraft
        ? {
            blueprintDraft: JSON.parse(
              serializeBlueprintDraft(context.blueprintDraft)
            ),
          }
        : {}),
      ...(context.architectDraft
        ? {
            architectDraft: JSON.parse(
              serializeArchitectDraft(context.architectDraft)
            ),
          }
        : {}),
      ...(context.buildContract
        ? {
            buildContract: JSON.parse(
              serializeBuildContract(context.buildContract)
            ),
          }
        : {}),
      ...(context.capabilityResolution
        ? {
            capabilityResolution: JSON.parse(
              serializeCapabilityResolution(context.capabilityResolution)
            ),
          }
        : {}),
      ...(context.taskGraph
        ? {
            taskGraph: JSON.parse(serializeTaskGraph(context.taskGraph)),
          }
        : {}),
      ...(context.repositoryModel
        ? {
            repositoryModel: JSON.parse(
              serializeRepositoryModel(context.repositoryModel)
            ),
          }
        : {}),
      ...(context.engineeringMemory
        ? {
            engineeringMemory: JSON.parse(
              serializeEngineeringMemory(context.engineeringMemory)
            ),
          }
        : {}),
      ...(context.engineeringForemanState
        ? {
            engineeringForemanState: JSON.parse(
              serializeEngineeringForemanState(
                context.engineeringForemanState
              )
            ),
          }
        : {}),
      ...(context.taskExecutionState
        ? {
            taskExecutionState: JSON.parse(
              serializeTaskExecutionState(context.taskExecutionState)
            ),
          }
        : {}),
      ...(context.buildOrchestrationState
        ? {
            buildOrchestrationState: JSON.parse(
              serializeBuildOrchestrationState(context.buildOrchestrationState)
            ),
          }
        : {}),
      ...(context.contractReviewReport
        ? {
            contractReviewReport: JSON.parse(
              serializeContractReviewReport(context.contractReviewReport)
            ),
          }
        : {}),
      ...(context.intelligenceCore
        ? {
            intelligenceCore: JSON.parse(
              serializeIntelligenceCore(context.intelligenceCore)
            ),
          }
        : {}),
      ...(context.changePlan
        ? {
            changePlan: JSON.parse(
              serializeBuildChangePlan(context.changePlan)
            ),
          }
        : {}),
    })
  );
}

export function loadMatrixProjectWorkspaceContext(
  storage: Pick<Storage, 'getItem'>,
  userId?: string
): MatrixProjectWorkspaceContext {
  const ownerUserId = userId?.trim() || getActiveStorageUserId(storage);
  const raw = storage.getItem(
    getUserScopedStorageKey(
      MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY,
      ownerUserId,
      storage
    )
  );
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Partial<MatrixProjectWorkspaceContext> & {
      ownerUserId?: unknown;
    };
    if (
      ownerUserId &&
      parsed.ownerUserId !== undefined &&
      parsed.ownerUserId !== ownerUserId
    ) {
      return {};
    }
    return {
      currentProjectId:
        typeof parsed.currentProjectId === 'string' &&
        parsed.currentProjectId.trim()
          ? parsed.currentProjectId
          : undefined,
      currentProjectName:
        typeof parsed.currentProjectName === 'string' &&
        parsed.currentProjectName.trim()
          ? parsed.currentProjectName
          : undefined,
      buildManifest: parsed.buildManifest
        ? (deserializeBuildManifest(JSON.stringify(parsed.buildManifest)) ?? undefined)
        : undefined,
      blueprintDraft: parsed.blueprintDraft
        ? (deserializeBlueprintDraft(JSON.stringify(parsed.blueprintDraft)) ?? undefined)
        : undefined,
      architectDraft: parsed.architectDraft
        ? (deserializeArchitectDraft(JSON.stringify(parsed.architectDraft)) ?? undefined)
        : undefined,
      buildContract: parsed.buildContract
        ? (deserializeBuildContract(JSON.stringify(parsed.buildContract)) ?? undefined)
        : undefined,
      capabilityResolution: parsed.capabilityResolution
        ? (deserializeCapabilityResolution(
            JSON.stringify(parsed.capabilityResolution)
          ) ?? undefined)
        : undefined,
      taskGraph: parsed.taskGraph
        ? (deserializeTaskGraph(JSON.stringify(parsed.taskGraph)) ?? undefined)
        : undefined,
      repositoryModel: parsed.repositoryModel
        ? (deserializeRepositoryModel(JSON.stringify(parsed.repositoryModel)) ??
          undefined)
        : undefined,
      engineeringMemory: parsed.engineeringMemory
        ? (deserializeEngineeringMemory(JSON.stringify(parsed.engineeringMemory)) ??
          undefined)
        : undefined,
      engineeringForemanState: parsed.engineeringForemanState
        ? (deserializeEngineeringForemanState(
            JSON.stringify(parsed.engineeringForemanState)
          ) ?? undefined)
        : undefined,
      taskExecutionState: parsed.taskExecutionState
        ? (deserializeTaskExecutionState(
            JSON.stringify(parsed.taskExecutionState)
          ) ?? undefined)
        : undefined,
      buildOrchestrationState: parsed.buildOrchestrationState
        ? (deserializeBuildOrchestrationState(
            JSON.stringify(parsed.buildOrchestrationState)
          ) ?? undefined)
        : undefined,
      contractReviewReport: parsed.contractReviewReport
        ? (deserializeContractReviewReport(
            JSON.stringify(parsed.contractReviewReport)
          ) ?? undefined)
        : undefined,
      intelligenceCore: parsed.intelligenceCore
        ? (deserializeIntelligenceCore(
            JSON.stringify(parsed.intelligenceCore),
            parsed.currentProjectId
          ) ?? undefined)
        : undefined,
      changePlan: parsed.changePlan
        ? (deserializeBuildChangePlan(JSON.stringify(parsed.changePlan)) ??
          undefined)
        : undefined,
    };
  } catch {
    return {};
  }
}

export function clearMatrixProjectWorkspaceContext(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  userId?: string
): void {
  storage.removeItem(
    getUserScopedStorageKey(
      MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY,
      userId,
      storage
    )
  );
}

export function clearMatrixProjectWorkspaceSnapshot(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  userId?: string
): void {
  storage.removeItem(
    getUserScopedStorageKey(
      MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY,
      userId,
      storage
    )
  );
}

export function writeMatrixProjectOpenHandoff(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  project: MatrixProject,
  now = new Date(),
  userId?: string
): MatrixProjectOpenHandoff {
  const ownerUserId = userId?.trim() || getActiveStorageUserId(storage);
  const handoff: MatrixProjectOpenHandoff = {
    source: 'projects',
    projectId: project.id,
    projectName: project.name,
    createdAt: now.toISOString(),
    message: `${project.name} loaded from Projects. Review and continue working.`,
  };

  storage.setItem(
    getUserScopedStorageKey(
      MATRIX_PROJECTS_OPEN_HANDOFF_KEY,
      ownerUserId,
      storage
    ),
    JSON.stringify({
      ...handoff,
      ...(ownerUserId ? { ownerUserId } : {}),
    })
  );
  return handoff;
}

export function readMatrixProjectOpenHandoff(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  options: { now?: Date; userId?: string } = {}
): MatrixProjectOpenHandoff | null {
  const ownerUserId =
    options.userId?.trim() || getActiveStorageUserId(storage);
  const key = getUserScopedStorageKey(
    MATRIX_PROJECTS_OPEN_HANDOFF_KEY,
    ownerUserId,
    storage
  );
  const raw = storage.getItem(key);
  if (!raw) return null;
  storage.removeItem(key);

  try {
    const parsed = JSON.parse(raw) as Partial<MatrixProjectOpenHandoff> & {
      ownerUserId?: unknown;
    };
    if (
      parsed.source !== 'projects' ||
      typeof parsed.projectId !== 'string' ||
      typeof parsed.projectName !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.message !== 'string'
    ) {
      return null;
    }
    if (
      ownerUserId &&
      parsed.ownerUserId !== undefined &&
      parsed.ownerUserId !== ownerUserId
    ) {
      return null;
    }
    const createdAtMs = Date.parse(parsed.createdAt);
    const nowMs = (options.now ?? new Date()).getTime();
    if (
      !Number.isFinite(createdAtMs) ||
      createdAtMs > nowMs + 5 * 60 * 1000 ||
      nowMs - createdAtMs > MATRIX_PROJECT_OPEN_HANDOFF_TTL_MS
    ) {
      return null;
    }
    return {
      source: 'projects',
      projectId: parsed.projectId,
      projectName: parsed.projectName,
      createdAt: parsed.createdAt,
      message: parsed.message,
    };
  } catch {
    return null;
  }
}

export function clearMatrixProjectOpenHandoff(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  userId?: string
): void {
  storage.removeItem(
    getUserScopedStorageKey(
      MATRIX_PROJECTS_OPEN_HANDOFF_KEY,
      userId,
      storage
    )
  );
}
