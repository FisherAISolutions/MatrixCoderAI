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
import { supabase as defaultSupabase } from '@/lib/supabase';

export const MATRIX_PROJECTS_STORAGE_KEY = 'matrix-coder:projects';
export const MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY =
  'matrix-coder:workspace-project-snapshot';
export const MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY =
  'matrix-coder:workspace-project-context';
export const MATRIX_PROJECTS_OPEN_HANDOFF_KEY =
  'matrix-coder:project-open-handoff';
export const MATRIX_PROJECTS_VERSION = 1;

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
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  files: FileNode[];
  chatMessages: ChatMessage[];
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
  validationStatus: MatrixProjectValidationStatus;
  deploymentStatus: MatrixProjectDeploymentStatus;
  workspaceState?: MatrixProjectWorkspaceState;
  metadataVersion: number;
}

export interface MatrixProjectDraft {
  name: string;
  description?: string;
  files?: FileNode[];
  chatMessages?: ChatMessage[];
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
  validationStatus?: MatrixProjectValidationStatus;
  deploymentStatus?: MatrixProjectDeploymentStatus;
  workspaceState?: MatrixProjectWorkspaceState;
}

export interface MatrixProjectWorkspaceContext {
  currentProjectId?: string;
  currentProjectName?: string;
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
}

export interface MatrixProjectWorkspaceSnapshot {
  name: string;
  description: string;
  files: FileNode[];
  chatMessages: ChatMessage[];
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
  validationStatus: MatrixProjectValidationStatus;
  deploymentStatus: MatrixProjectDeploymentStatus;
  workspaceState?: MatrixProjectWorkspaceState;
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
  warning?: string;
}

interface SupabaseUserResult {
  data?: { user?: { id: string } | null } | null;
  error?: { message?: string } | null;
}

interface SupabaseQueryResult<T> {
  data?: T[] | T | null;
  error?: { message?: string } | null;
}

interface SupabaseProjectClient {
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
      eq: (
        column: string,
        value: string
      ) => Promise<SupabaseQueryResult<SupabaseProjectRecord>>;
    };
  };
}

interface SupabaseProjectRecord {
  id: string;
  user_id: string;
  name: string;
  description: string;
  payload: unknown;
  created_at: string;
  updated_at: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface PersistenceOptions {
  storage?: StorageLike;
  supabaseClient?: SupabaseProjectClient | null;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
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
    ? deserializeBuildManifest(JSON.stringify(parsed.buildManifest))
    : undefined;
  const blueprintDraft = parsed.blueprintDraft
    ? deserializeBlueprintDraft(JSON.stringify(parsed.blueprintDraft))
    : undefined;

  return {
    files: cloneJson(parsed.files as FileNode[]),
    chatMessages: cloneJson(parsed.chatMessages as ChatMessage[]),
    buildManifest,
    blueprintDraft,
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
    workspaceState: project.workspaceState
      ? { ...project.workspaceState }
      : undefined,
  };
}

function readLocalProjects(storage: StorageLike | null): MatrixProject[] {
  if (!storage) return [];
  const raw = storage.getItem(MATRIX_PROJECTS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeProjectRecord(item))
      .filter((item): item is MatrixProject => Boolean(item));
  } catch {
    return [];
  }
}

function writeLocalProjects(
  storage: StorageLike | null,
  projects: MatrixProject[]
): void {
  if (!storage) return;
  storage.setItem(
    MATRIX_PROJECTS_STORAGE_KEY,
    JSON.stringify(projects.map(serializeProject))
  );
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
  return {
    projects: rows
      .map((row) => {
        const payload = normalizeProjectPayload(row.payload);
        if (!payload) return null;
        return {
          id: row.id,
          name: row.name,
          description: row.description ?? '',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          ...payload,
        } satisfies MatrixProject;
      })
      .filter((item): item is MatrixProject => Boolean(item)),
    source: 'supabase',
  };
}

async function saveRemoteProjects(
  supabaseClient: SupabaseProjectClient,
  projects: MatrixProject[]
): Promise<void> {
  const userResult = await supabaseClient.auth.getUser();
  const user = userResult.data?.user;
  if (!user?.id) {
    throw new Error('No authenticated user.');
  }

  const rows: SupabaseProjectRecord[] = projects.map((project) => ({
    id: project.id,
    user_id: user.id,
    name: project.name,
    description: project.description,
    payload: serializeProject(project),
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  }));

  const response = await supabaseClient
    .from('matrix_projects')
    .upsert(rows, { onConflict: 'id' });

  if (response.error) {
    throw new Error(response.error.message || 'Unable to save projects.');
  }
}

async function deleteRemoteProject(
  supabaseClient: SupabaseProjectClient,
  projectId: string
): Promise<void> {
  const response = await supabaseClient
    .from('matrix_projects')
    .delete()
    .eq('id', projectId);

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
    name: draft.name.trim(),
    description: draft.description?.trim() ?? '',
    createdAt: timestamp,
    updatedAt: timestamp,
    files: cloneJson(draft.files ?? []),
    chatMessages: cloneJson(draft.chatMessages ?? []),
    buildManifest: draft.buildManifest,
    blueprintDraft: draft.blueprintDraft,
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
    ...project,
    id,
    name: `${project.name} Copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    files: cloneJson(project.files),
    chatMessages: cloneJson(project.chatMessages),
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
      name: snapshot.name,
      description: snapshot.description,
      files: snapshot.files,
      chatMessages: snapshot.chatMessages,
      buildManifest: snapshot.buildManifest,
      blueprintDraft: snapshot.blueprintDraft,
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

  if (supabaseClient) {
    try {
      const remote = await loadRemoteProjects(supabaseClient);
      writeLocalProjects(storage, remote.projects);
      return remote;
    } catch (error) {
      return {
        projects: readLocalProjects(storage),
        source: 'local',
        warning:
          error instanceof Error
            ? error.message
            : 'Supabase unavailable. Using local projects.',
      };
    }
  }

  return {
    projects: readLocalProjects(storage),
    source: 'local',
  };
}

export async function saveMatrixProject(
  project: MatrixProject,
  existing: MatrixProject[],
  options: PersistenceOptions = {}
): Promise<MatrixProjectPersistenceResult> {
  const storage = getStorage(options.storage);
  const supabaseClient = resolveSupabaseClient(options.supabaseClient);
  const nextProjects = [
    project,
    ...existing.filter((item) => item.id !== project.id),
  ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  writeLocalProjects(storage, nextProjects);

  if (supabaseClient) {
    try {
      await saveRemoteProjects(supabaseClient, nextProjects);
      return { projects: nextProjects, source: 'supabase' };
    } catch (error) {
      return {
        projects: nextProjects,
        source: 'local',
        warning:
          error instanceof Error
            ? error.message
            : 'Supabase unavailable. Saved locally.',
      };
    }
  }

  return { projects: nextProjects, source: 'local' };
}

export async function deleteMatrixProject(
  projectId: string,
  existing: MatrixProject[],
  options: PersistenceOptions = {}
): Promise<MatrixProjectPersistenceResult> {
  const storage = getStorage(options.storage);
  const supabaseClient = resolveSupabaseClient(options.supabaseClient);
  const nextProjects = existing.filter((item) => item.id !== projectId);

  writeLocalProjects(storage, nextProjects);

  if (supabaseClient) {
    try {
      await deleteRemoteProject(supabaseClient, projectId);
      return { projects: nextProjects, source: 'supabase' };
    } catch (error) {
      return {
        projects: nextProjects,
        source: 'local',
        warning:
          error instanceof Error
            ? error.message
            : 'Supabase unavailable. Deleted locally.',
      };
    }
  }

  return { projects: nextProjects, source: 'local' };
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

    return {
      name: parsed.name,
      description: parsed.description,
      files: cloneJson(parsed.files as FileNode[]),
      chatMessages: cloneJson(parsed.chatMessages as ChatMessage[]),
      buildManifest: parsed.buildManifest
        ? deserializeBuildManifest(JSON.stringify(parsed.buildManifest))
        : undefined,
      blueprintDraft: parsed.blueprintDraft
        ? deserializeBlueprintDraft(JSON.stringify(parsed.blueprintDraft))
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
      workspaceState: normalizeWorkspaceState(parsed.workspaceState),
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
        ? deserializeBuildManifest(JSON.stringify(parsed.buildManifest))
        : undefined,
      blueprintDraft: parsed.blueprintDraft
        ? deserializeBlueprintDraft(JSON.stringify(parsed.blueprintDraft))
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
