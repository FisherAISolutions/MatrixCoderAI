import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MATRIX_PROJECTS_OPEN_HANDOFF_KEY,
  MATRIX_PROJECTS_STORAGE_KEY,
  MATRIX_PROJECTS_VERSION,
  MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY,
  MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY,
  clearMatrixProjectWorkspaceContext,
  createMatrixProject,
  createMatrixProjectAutosaveController,
  deleteMatrixProject,
  duplicateMatrixProject,
  getMatrixProjectsLocalStorageKey,
  loadMatrixProjects,
  loadMatrixProjectWorkspaceContext,
  loadMatrixProjectWorkspaceSnapshot,
  readLocalProjectsDiagnostics,
  readMatrixProjectOpenHandoff,
  renameMatrixProject,
  saveMatrixProject,
  saveMatrixProjectWorkspaceContext,
  saveMatrixProjectWorkspaceSnapshot,
  toggleMatrixProjectFavorite,
  writeMatrixProjectOpenHandoff,
  type MatrixProject,
  type MatrixProjectPersistenceResult,
  type SupabaseProjectClient,
  type SupabaseProjectMutationBuilder,
} from '@/lib/projects/projectStore';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function makeProject(overrides: Partial<MatrixProject> = {}): MatrixProject {
  const project = createMatrixProject(
    {
      workspaceId: overrides.workspaceId,
      name: overrides.name ?? 'Project One',
      description: overrides.description ?? 'Test project',
      favorite: overrides.favorite,
      files:
        overrides.files ??
        [
          {
            id: 'file-1',
            name: 'page.tsx',
            path: 'src/app/page.tsx',
            type: 'file',
            content: 'export default function Page() { return null; }',
          },
        ],
      chatMessages:
        overrides.chatMessages ??
        [
          {
            id: 'message-1',
            role: 'user',
            content: 'Build an app',
            timestamp: '2026-07-08T00:00:00.000Z',
          },
        ],
      validationStatus: overrides.validationStatus ?? 'unknown',
      deploymentStatus: overrides.deploymentStatus ?? 'unknown',
      workspaceState: overrides.workspaceState,
    },
    new Date(overrides.createdAt ?? '2026-07-08T00:00:00.000Z'),
    overrides.id ?? 'project-1'
  );

  return {
    ...project,
    ...(overrides.updatedAt ? { updatedAt: overrides.updatedAt } : {}),
    ...(overrides.lastOpenedAt ? { lastOpenedAt: overrides.lastOpenedAt } : {}),
    ...(typeof overrides.saveVersion === 'number'
      ? { saveVersion: overrides.saveVersion }
      : {}),
  };
}

function createRemoteProjectSupabaseClient(
  remoteProject: MatrixProject,
  upsertCalls: MatrixProject[]
): SupabaseProjectClient {
  const remoteRow = {
    id: remoteProject.id,
    user_id: 'user-1',
    name: remoteProject.name,
    description: remoteProject.description,
    payload: remoteProject,
    created_at: remoteProject.createdAt,
    updated_at: remoteProject.updatedAt,
    workspace_id: remoteProject.workspaceId ?? null,
    favorite: remoteProject.favorite,
    save_version: remoteProject.saveVersion,
    last_opened_at: remoteProject.lastOpenedAt ?? null,
  };
  const mutation: SupabaseProjectMutationBuilder = {
    eq: () => mutation,
    then(onfulfilled, onrejected) {
      return Promise.resolve({ data: null, error: null }).then(
        onfulfilled,
        onrejected
      );
    },
  };

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [remoteRow], error: null }),
        }),
      }),
      upsert: async (value) => {
        if (!Array.isArray(value)) {
          const payload = value.payload;
          if (payload && typeof payload === 'object') {
            upsertCalls.push(payload as MatrixProject);
          }
        }
        return { data: null, error: null };
      },
      delete: () => ({
        eq: mutation.eq,
      }),
    }),
  };
}

function createDeleteSupabaseClient(
  eqCalls: Array<[string, string]>
): SupabaseProjectClient {
  const response = { data: null, error: null };
  const mutation: SupabaseProjectMutationBuilder = {
    eq(column, value) {
      eqCalls.push([column, value]);
      return mutation;
    },
    then(onfulfilled, onrejected) {
      return Promise.resolve(response).then(onfulfilled, onrejected);
    },
  };

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [], error: null }),
        }),
      }),
      upsert: async () => ({ data: null, error: null }),
      delete: () => ({
        eq: mutation.eq,
      }),
    }),
  };
}

describe('projectStore', () => {
  let localStorage: Storage;
  let sessionStorage: Storage;

  beforeEach(() => {
    localStorage = createMemoryStorage();
    sessionStorage = createMemoryStorage();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('saves and loads projects with versioned local fallback', async () => {
    const project = makeProject();
    const saved = await saveMatrixProject(project, [], {
      storage: localStorage,
      supabaseClient: null,
    });

    expect(saved.source).toBe('local');
    expect(saved.saveState).toBe('offline-local-only');
    expect(saved.projects).toHaveLength(1);

    const loaded = await loadMatrixProjects({
      storage: localStorage,
      supabaseClient: null,
    });
    expect(loaded.source).toBe('local');
    expect(loaded.projects[0]?.name).toBe('Project One');

    const raw = localStorage.getItem(getMatrixProjectsLocalStorageKey());
    expect(raw).toContain('Project One');
    expect(JSON.parse(raw ?? '{}')).toMatchObject({
      version: MATRIX_PROJECTS_VERSION,
      userId: 'anonymous',
    });
  });

  it('renames a project without changing stable identity', () => {
    const project = makeProject({
      id: 'source-project',
      workspaceId: 'workspace-stable-id',
      name: 'Source',
    });

    const renamed = renameMatrixProject(
      project,
      'Renamed Project',
      new Date('2026-07-09T00:00:00.000Z')
    );

    expect(renamed.id).toBe('source-project');
    expect(renamed.workspaceId).toBe('workspace-stable-id');
    expect(renamed.name).toBe('Renamed Project');
    expect(project.name).toBe('Source');
  });

  it('duplicates with a new identity and isolated persistent data', () => {
    const project = makeProject({
      id: 'source-project',
      workspaceId: 'workspace-stable-id',
      name: 'Source',
      favorite: true,
    });

    const duplicate = duplicateMatrixProject(
      project,
      new Date('2026-07-09T00:00:00.000Z'),
      'copy-project'
    );

    expect(duplicate.id).toBe('copy-project');
    expect(duplicate.workspaceId).toBe('copy-project');
    expect(duplicate.name).toBe('Source Copy');
    expect(duplicate.favorite).toBe(false);
    expect(duplicate.saveVersion).toBe(1);
    expect(duplicate.files).not.toBe(project.files);

    const duplicateFile = duplicate.files[0];
    const sourceFile = project.files[0];
    if (duplicateFile?.type === 'file' && sourceFile?.type === 'file') {
      duplicateFile.content = 'changed copy';
      expect(sourceFile.content).not.toBe('changed copy');
    }
  });

  it('deletes a saved project from local storage', async () => {
    const project = makeProject();
    await saveMatrixProject(project, [], {
      storage: localStorage,
      supabaseClient: null,
    });

    const deleted = await deleteMatrixProject(project.id, [project], {
      storage: localStorage,
      supabaseClient: null,
      expectedName: project.name,
    });

    expect(deleted.projects).toHaveLength(0);
    const loaded = await loadMatrixProjects({
      storage: localStorage,
      supabaseClient: null,
    });
    expect(loaded.projects).toHaveLength(0);
  });

  it('scopes remote deletion to the authenticated owner', async () => {
    const eqCalls: Array<[string, string]> = [];
    const project = makeProject();

    await deleteMatrixProject(project.id, [project], {
      storage: localStorage,
      supabaseClient: createDeleteSupabaseClient(eqCalls),
      expectedName: project.name,
    });

    expect(eqCalls).toContainEqual(['id', 'project-1']);
    expect(eqCalls).toContainEqual(['user_id', 'user-1']);
  });

  it('does not overwrite a newer cloud copy with a stale save', async () => {
    const base = makeProject({ updatedAt: '2026-07-08T00:00:00.000Z' });
    const remoteNewer = renameMatrixProject(
      base,
      'Newer cloud copy',
      new Date('2026-07-10T00:00:00.000Z')
    );
    const localEdit = renameMatrixProject(
      base,
      'Local stale edit',
      new Date('2026-07-11T00:00:00.000Z')
    );
    const upsertCalls: MatrixProject[] = [];

    const result = await saveMatrixProject(localEdit, [base], {
      storage: localStorage,
      supabaseClient: createRemoteProjectSupabaseClient(remoteNewer, upsertCalls),
      expectedUpdatedAt: base.updatedAt,
    });

    expect(result.saveState).toBe('conflict');
    expect(result.source).toBe('supabase');
    expect(result.conflictProject?.name).toBe('Newer cloud copy');
    expect(upsertCalls).toEqual([]);
  });

  it('does not overwrite a newer existing project with a stale save', async () => {
    const base = makeProject({ updatedAt: '2026-07-08T00:00:00.000Z' });
    const newer = renameMatrixProject(
      base,
      'Newer cloud copy',
      new Date('2026-07-10T00:00:00.000Z')
    );
    const staleLocal = renameMatrixProject(
      base,
      'Stale local edit',
      new Date('2026-07-11T00:00:00.000Z')
    );

    const result = await saveMatrixProject(staleLocal, [newer], {
      storage: localStorage,
      supabaseClient: null,
      expectedUpdatedAt: base.updatedAt,
    });

    expect(result.saveState).toBe('conflict');
    expect(result.conflictProject?.name).toBe('Newer cloud copy');
    expect(result.projects[0]?.name).toBe('Newer cloud copy');
    expect(localStorage.getItem(getMatrixProjectsLocalStorageKey())).toBeNull();
  });

  it('debounces autosave and resolves superseded saves as stale', async () => {
    vi.useFakeTimers();
    const saveCalls: MatrixProject[] = [];
    const saveFn: typeof saveMatrixProject = async (project, existing) => {
      saveCalls.push(project);
      return {
        projects: [project, ...existing.filter((item) => item.id !== project.id)],
        source: 'local',
        saveState: 'saved',
      };
    };
    const controller = createMatrixProjectAutosaveController(25, saveFn);
    const firstProject = makeProject({ name: 'First' });
    const secondProject = makeProject({ name: 'Second' });

    const first = controller.scheduleSave(firstProject, []);
    const second = controller.scheduleSave(secondProject, []);
    await expect(first).resolves.toMatchObject({ saveState: 'unsaved' });

    await vi.advanceTimersByTimeAsync(25);
    await expect(second).resolves.toMatchObject({ saveState: 'saved' });
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]?.name).toBe('Second');
  });

  it('ignores an older in-flight autosave response', async () => {
    vi.useFakeTimers();
    const resolvers: Array<(result: MatrixProjectPersistenceResult) => void> = [];
    const saveFn: typeof saveMatrixProject = (project) => {
      return new Promise((resolve) => {
        resolvers.push(() =>
          resolve({
            projects: [project],
            source: 'local',
            saveState: 'saved',
          })
        );
      });
    };
    const controller = createMatrixProjectAutosaveController(0, saveFn);

    const first = controller.scheduleSave(makeProject({ name: 'First' }), []);
    await vi.advanceTimersByTimeAsync(0);
    const second = controller.scheduleSave(makeProject({ name: 'Second' }), []);
    await vi.advanceTimersByTimeAsync(0);

    resolvers[1]?.({ projects: [], source: 'local', saveState: 'saved' });
    await expect(second).resolves.toMatchObject({ saveState: 'saved' });
    resolvers[0]?.({ projects: [], source: 'local', saveState: 'saved' });
    await expect(first).resolves.toMatchObject({ saveState: 'unsaved' });
  });

  it('handles corrupt local project records without throwing', async () => {
    localStorage.setItem(getMatrixProjectsLocalStorageKey('user-1'), '{not-json');

    const diagnostics = readLocalProjectsDiagnostics(localStorage, 'user-1');
    expect(diagnostics.projects).toEqual([]);
    expect(diagnostics.warning).toContain('corrupted');

    const loaded = await loadMatrixProjects({
      storage: localStorage,
      supabaseClient: null,
      userId: 'user-1',
    });
    expect(loaded.projects).toEqual([]);
    expect(loaded.warning).toContain('corrupted');
  });

  it('migrates compatible legacy local project records', async () => {
    const project = makeProject();
    localStorage.setItem(MATRIX_PROJECTS_STORAGE_KEY, JSON.stringify([project]));

    const loaded = await loadMatrixProjects({
      storage: localStorage,
      supabaseClient: null,
    });

    expect(loaded.projects[0]?.id).toBe(project.id);
    expect(localStorage.getItem(MATRIX_PROJECTS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(getMatrixProjectsLocalStorageKey())).toContain(
      project.id
    );
  });

  it('sorts favorite projects before recent projects', async () => {
    const oldFavorite = makeProject({
      id: 'favorite-project',
      name: 'Favorite',
      favorite: true,
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    const recent = makeProject({
      id: 'recent-project',
      name: 'Recent',
      updatedAt: '2026-07-12T00:00:00.000Z',
    });

    await saveMatrixProject(recent, [], {
      storage: localStorage,
      supabaseClient: null,
    });
    await saveMatrixProject(oldFavorite, [recent], {
      storage: localStorage,
      supabaseClient: null,
    });

    const loaded = await loadMatrixProjects({
      storage: localStorage,
      supabaseClient: null,
    });
    expect(loaded.projects.map((project) => project.id)).toEqual([
      'favorite-project',
      'recent-project',
    ]);
  });

  it('toggles favorite without changing project identity', () => {
    const project = makeProject({ id: 'project-1', favorite: false });
    const favorite = toggleMatrixProjectFavorite(
      project,
      new Date('2026-07-09T00:00:00.000Z')
    );

    expect(favorite.id).toBe(project.id);
    expect(favorite.favorite).toBe(true);
    expect(favorite.updatedAt).toBe('2026-07-09T00:00:00.000Z');
  });

  it('stores and reads complete workspace snapshot data safely', () => {
    const project = makeProject({
      favorite: true,
      workspaceState: { activeFilePath: 'src/app/page.tsx' },
    });

    saveMatrixProjectWorkspaceSnapshot(localStorage, {
      projectId: project.id,
      name: 'Project One',
      description: 'Snapshot project',
      files: project.files,
      chatMessages: project.chatMessages,
      validationStatus: 'passed',
      deploymentStatus: 'ready',
      workspaceState: project.workspaceState,
      favorite: project.favorite,
      lastOpenedAt: '2026-07-10T00:00:00.000Z',
      updatedAt: project.updatedAt,
    });

    const snapshot = loadMatrixProjectWorkspaceSnapshot(localStorage);
    expect(snapshot?.projectId).toBe(project.id);
    expect(snapshot?.name).toBe('Project One');
    expect(snapshot?.favorite).toBe(true);
    expect(snapshot?.lastOpenedAt).toBe('2026-07-10T00:00:00.000Z');
    expect(snapshot?.workspaceState?.activeFilePath).toBe('src/app/page.tsx');
    expect(localStorage.getItem(MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY)).toContain(
      'Project One'
    );
  });

  it('drops restored active file paths that are not in the restored file tree', () => {
    const project = makeProject({
      workspaceState: { activeFilePath: 'src/app/missing.tsx' },
    });

    saveMatrixProjectWorkspaceSnapshot(localStorage, {
      name: 'Project One',
      description: 'Snapshot project',
      files: project.files,
      chatMessages: project.chatMessages,
      validationStatus: 'passed',
      deploymentStatus: 'ready',
      workspaceState: project.workspaceState,
      updatedAt: project.updatedAt,
    });

    const snapshot = loadMatrixProjectWorkspaceSnapshot(localStorage);
    expect(snapshot?.workspaceState).toBeUndefined();
  });

  it('stores and clears workspace context data', () => {
    saveMatrixProjectWorkspaceContext(localStorage, {
      currentProjectId: 'project-1',
      currentProjectName: 'Project One',
    });

    const saved = loadMatrixProjectWorkspaceContext(localStorage);
    expect(saved.currentProjectId).toBe('project-1');
    expect(localStorage.getItem(MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY)).toContain(
      'Project One'
    );

    clearMatrixProjectWorkspaceContext(localStorage);
    expect(loadMatrixProjectWorkspaceContext(localStorage)).toEqual({});
  });

  it('writes and consumes project open handoff once', () => {
    const project = makeProject();
    writeMatrixProjectOpenHandoff(
      sessionStorage,
      project,
      new Date('2026-07-08T00:00:00.000Z')
    );

    expect(sessionStorage.getItem(MATRIX_PROJECTS_OPEN_HANDOFF_KEY)).toContain(
      'project-1'
    );

    const firstRead = readMatrixProjectOpenHandoff(sessionStorage);
    expect(firstRead?.projectId).toBe('project-1');

    const secondRead = readMatrixProjectOpenHandoff(sessionStorage);
    expect(secondRead).toBeNull();
  });
});
