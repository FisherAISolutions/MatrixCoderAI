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
  deserializeArchitectDraft,
  serializeArchitectDraft,
} from '@/lib/matrix-ai-architect/architectDraft';
import type { ArchitectDraft } from '@/lib/matrix-ai-architect/types';
import { supabase as defaultSupabase } from '@/lib/supabase';

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

export type MatrixProjectSaveState =
  | 'unsaved'
  | 'saving'
  | 'saved'
  | 'save-failed'
  | 'offline-local-only'
  | 'conflict';

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

  return {
    files: cloneJson(parsed.files as FileNode[]),
    chatMessages: cloneJson(parsed.chatMessages as ChatMessage[]),
    buildManifest,
    blueprintDraft,
    architectDraft,
    buildContract,
    capabilityResolution,
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
    projects: sortProjects(projects).map(serializeProject),
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
  supabaseClient: SupabaseProjectClient
): Promise<MatrixProjectPersistenceResult> {
  const userResult = await supabaseClient.auth.getUser();
  const user = userResult.data?.user;
  if (!user?.id) {
    return { projects: [], source: 'supabase', warning: 'No authenticated user.' };
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
  };
}

async function saveRemoteProject(
  supabaseClient: SupabaseProjectClient,
  project: MatrixProject
): Promise<void> {
  const userResult = await supabaseClient.auth.getUser();
  const user = userResult.data?.user;
  if (!user?.id) {
    throw new Error('No authenticated user.');
  }

  const row: SupabaseProjectRecord = {
    id: project.id,
    user_id: user.id,
    name: project.name,
    description: project.description,
    payload: serializeProject(project),
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    workspace_id: project.workspaceId ?? project.id,
    favorite: project.favorite,
    save_version: project.saveVersion,
    last_opened_at: project.lastOpenedAt ?? null,
  };

  const response = await supabaseClient
    .from('matrix_projects')
    .upsert(row, { onConflict: 'id' });

  if (response.error) {
    throw new Error(response.error.message || 'Unable to save project.');
  }
}

async function deleteRemoteProject(
  supabaseClient: SupabaseProjectClient,
  projectId: string
): Promise<void> {
  const userResult = await supabaseClient.auth.getUser();
  const user = userResult.data?.user;
  if (!user?.id) {
    throw new Error('No authenticated user.');
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
  try {
    const userResult = await supabaseClient.auth.getUser();
    return userResult.data?.user?.id ?? undefined;
  } catch {
    return undefined;
  }
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
      validationStatus: snapshot.validationStatus,
      deploymentStatus: snapshot.deploymentStatus,
      workspaceState: snapshot.workspaceState,
    },
    now,
    id
  );
}

export async function loadMatrixProjects(
  options: PersistenceOptions = {}
): Promise<MatrixProjectPersistenceResult> {
  const storage = getStorage(options.storage);
  const supabaseClient = resolveSupabaseClient(options.supabaseClient);
  const storageUserId = await resolveStorageUserId(options, supabaseClient);

  if (supabaseClient) {
    try {
      const remote = await loadRemoteProjects(supabaseClient);
      writeLocalProjects(storage, remote.projects, storageUserId);
      return { ...remote, saveState: 'saved' };
    } catch (error) {
      const local = readLocalProjectsDiagnostics(storage, storageUserId);
      return {
        projects: local.projects,
        source: 'local',
        saveState: 'offline-local-only',
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
  const storageUserId = await resolveStorageUserId(options, supabaseClient);
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
      conflictProject: existingProject,
      warning:
        'This project changed elsewhere after you opened it. Your local edits were preserved and were not overwritten.',
    };
  }

  if (supabaseClient && options.expectedUpdatedAt) {
    try {
      const remote = await loadRemoteProjects(supabaseClient);
      const remoteProject = remote.projects.find((item) => item.id === project.id);
      if (
        remoteProject &&
        Date.parse(remoteProject.updatedAt) > Date.parse(options.expectedUpdatedAt)
      ) {
        return {
          projects: sortProjects(existing),
          source: 'supabase',
          saveState: 'conflict',
          conflictProject: remoteProject,
          warning:
            'A newer cloud copy exists. Your local edits were preserved and were not overwritten.',
        };
      }
    } catch {
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
      await withBoundedRetry(() => saveRemoteProject(supabaseClient, projectToSave));
      return {
        projects: nextProjects,
        source: 'supabase',
        saveState: localWarning ? 'save-failed' : 'saved',
        warning: localWarning,
      };
    } catch (error) {
      return {
        projects: nextProjects,
        source: 'local',
        saveState: localWarning ? 'save-failed' : 'offline-local-only',
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
  const storageUserId = await resolveStorageUserId(options, supabaseClient);
  const project = existing.find((item) => item.id === projectId);
  const nextProjects = existing.filter((item) => item.id !== projectId);

  if (!project) {
    return { projects: sortProjects(existing), source: 'local', saveState: 'saved' };
  }

  if (options.expectedName && options.expectedName !== project.name) {
    return {
      projects: sortProjects(existing),
      source: 'local',
      saveState: 'conflict',
      conflictProject: project,
      warning: 'Project name changed before deletion. Delete was cancelled.',
    };
  }

  if (supabaseClient) {
    try {
      await withBoundedRetry(() => deleteRemoteProject(supabaseClient, projectId));
      const localWarning = writeLocalProjects(storage, nextProjects, storageUserId);
      return {
        projects: sortProjects(nextProjects),
        source: 'supabase',
        saveState: localWarning ? 'save-failed' : 'saved',
        warning: localWarning,
      };
    } catch (error) {
      return {
        projects: sortProjects(existing),
        source: 'local',
        saveState: 'save-failed',
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
}

export function createMatrixProjectAutosaveController(
  saveDelayMs = 250,
  saveFn: typeof saveMatrixProject = saveMatrixProject
): MatrixProjectAutosaveController {
  let state: MatrixProjectSaveState = 'saved';
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolve:
    | ((result: MatrixProjectPersistenceResult) => void)
    | null = null;

  const staleResult = (
    projects: MatrixProject[],
    warning = 'A stale save response was ignored.'
  ): MatrixProjectPersistenceResult => ({
    projects,
    source: 'local',
    saveState: 'unsaved',
    warning,
  });

  return {
    getState: () => state,
    scheduleSave: (project, existing, options = {}) => {
      sequence += 1;
      const requestId = sequence;
      state = 'saving';
      if (timer) clearTimeout(timer);
      if (pendingResolve) {
        pendingResolve(staleResult(existing, 'A superseded pending save was cancelled.'));
      }

      return new Promise((resolve) => {
        pendingResolve = resolve;
        timer = setTimeout(() => {
          timer = null;
          pendingResolve = null;
          void saveFn(project, existing, options)
            .then((result) => {
              if (requestId !== sequence) {
                resolve(staleResult(existing));
                return;
              }
              state = result.saveState ?? 'saved';
              resolve(result);
            })
            .catch((error) => {
              if (requestId === sequence) state = 'save-failed';
              resolve({
                projects: existing,
                source: 'local',
                saveState: 'save-failed',
                warning:
                  error instanceof Error ? error.message : 'Project save failed.',
              });
            });
        }, saveDelayMs);
      });
    },
  };
}

export function saveMatrixProjectWorkspaceSnapshot(
  storage: StorageLike,
  snapshot: MatrixProjectWorkspaceSnapshot
): void {
  storage.setItem(
    MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY,
    JSON.stringify({
      ...snapshot,
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
    })
  );
}

export function loadMatrixProjectWorkspaceSnapshot(
  storage: Pick<Storage, 'getItem'>
): MatrixProjectWorkspaceSnapshot | null {
  const raw = storage.getItem(MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MatrixProjectWorkspaceSnapshot>;
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
  context: MatrixProjectWorkspaceContext
): void {
  storage.setItem(
    MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY,
    JSON.stringify({
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
    })
  );
}

export function loadMatrixProjectWorkspaceContext(
  storage: Pick<Storage, 'getItem'>
): MatrixProjectWorkspaceContext {
  const raw = storage.getItem(MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Partial<MatrixProjectWorkspaceContext>;
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
    };
  } catch {
    return {};
  }
}

export function clearMatrixProjectWorkspaceContext(
  storage: Pick<Storage, 'removeItem'>
): void {
  storage.removeItem(MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY);
}

export function writeMatrixProjectOpenHandoff(
  storage: Pick<Storage, 'setItem'>,
  project: MatrixProject,
  now = new Date()
): MatrixProjectOpenHandoff {
  const handoff: MatrixProjectOpenHandoff = {
    source: 'projects',
    projectId: project.id,
    projectName: project.name,
    createdAt: now.toISOString(),
    message: `${project.name} loaded from Projects. Review and continue working.`,
  };

  storage.setItem(MATRIX_PROJECTS_OPEN_HANDOFF_KEY, JSON.stringify(handoff));
  return handoff;
}

export function readMatrixProjectOpenHandoff(
  storage: Pick<Storage, 'getItem' | 'removeItem'>
): MatrixProjectOpenHandoff | null {
  const raw = storage.getItem(MATRIX_PROJECTS_OPEN_HANDOFF_KEY);
  if (!raw) return null;
  storage.removeItem(MATRIX_PROJECTS_OPEN_HANDOFF_KEY);

  try {
    const parsed = JSON.parse(raw) as Partial<MatrixProjectOpenHandoff>;
    if (
      parsed.source !== 'projects' ||
      typeof parsed.projectId !== 'string' ||
      typeof parsed.projectName !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.message !== 'string'
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
