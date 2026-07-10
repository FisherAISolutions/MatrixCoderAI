import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MATRIX_PROJECTS_OPEN_HANDOFF_KEY,
  MATRIX_PROJECTS_STORAGE_KEY,
  MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY,
  MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY,
  clearMatrixProjectWorkspaceContext,
  createMatrixProject,
  deleteMatrixProject,
  duplicateMatrixProject,
  loadMatrixProjects,
  loadMatrixProjectWorkspaceContext,
  loadMatrixProjectWorkspaceSnapshot,
  readMatrixProjectOpenHandoff,
  renameMatrixProject,
  saveMatrixProject,
  saveMatrixProjectWorkspaceContext,
  saveMatrixProjectWorkspaceSnapshot,
  writeMatrixProjectOpenHandoff,
  type MatrixProject,
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
  return createMatrixProject(
    {
      name: overrides.name ?? 'Project One',
      description: overrides.description ?? 'Test project',
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
}

describe('projectStore', () => {
  let localStorage: Storage;
  let sessionStorage: Storage;

  beforeEach(() => {
    localStorage = createMemoryStorage();
    sessionStorage = createMemoryStorage();
    vi.restoreAllMocks();
  });

  it('saves and loads projects with local fallback', async () => {
    const project = makeProject();
    const saved = await saveMatrixProject(project, [], {
      storage: localStorage,
      supabaseClient: null,
    });

    expect(saved.source).toBe('local');
    expect(saved.projects).toHaveLength(1);

    const loaded = await loadMatrixProjects({
      storage: localStorage,
      supabaseClient: null,
    });
    expect(loaded.source).toBe('local');
    expect(loaded.projects[0]?.name).toBe('Project One');
    expect(localStorage.getItem(MATRIX_PROJECTS_STORAGE_KEY)).toContain(
      'Project One'
    );
  });

  it('renames and duplicates project records without mutating the source', () => {
    const project = makeProject({ id: 'source-project', name: 'Source' });

    const renamed = renameMatrixProject(project, 'Renamed Project');
    expect(renamed.name).toBe('Renamed Project');
    expect(project.name).toBe('Source');

    const duplicate = duplicateMatrixProject(
      project,
      new Date('2026-07-09T00:00:00.000Z'),
      'copy-project'
    );
    expect(duplicate.id).toBe('copy-project');
    expect(duplicate.name).toBe('Source Copy');
    expect(duplicate.files).not.toBe(project.files);
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
    });

    expect(deleted.projects).toHaveLength(0);
    const loaded = await loadMatrixProjects({
      storage: localStorage,
      supabaseClient: null,
    });
    expect(loaded.projects).toHaveLength(0);
  });

  it('stores and reads workspace snapshot data', () => {
    const project = makeProject({
      workspaceState: { activeFilePath: 'src/app/page.tsx' },
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
    expect(snapshot?.name).toBe('Project One');
    expect(snapshot?.workspaceState?.activeFilePath).toBe('src/app/page.tsx');
    expect(localStorage.getItem(MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY)).toContain(
      'Project One'
    );
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
