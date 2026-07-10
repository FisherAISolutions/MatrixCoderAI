import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function makeProject(overrides: Partial<MatrixProject> = {}): MatrixProject {
  const now = '2026-07-08T00:00:00.000Z';

  return {
    id: overrides.id ?? 'project-1',
    name: overrides.name ?? 'Project One',
    description: overrides.description ?? 'Test project',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    filesSnapshot: overrides.filesSnapshot ?? [],
    chatMessagesSnapshot: overrides.chatMessagesSnapshot ?? [],
    validationStatus: overrides.validationStatus ?? 'unknown',
    deploymentStatus: overrides.deploymentStatus ?? 'not-ready',
    ...overrides,
  };
}

describe('projectStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('saves and loads projects with local fallback', async () => {
    const saved = await saveMatrixProject(makeProject());
    expect(saved.mode).toBe('local');

    const projects = await loadMatrixProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('Project One');
    expect(window.localStorage.getItem(MATRIX_PROJECTS_STORAGE_KEY)).toContain(
      'Project One'
    );
  });

  it('renames a saved project', async () => {
    await saveMatrixProject(makeProject());

    const renamed = await renameMatrixProject('project-1', 'Renamed Project');
    expect(renamed?.name).toBe('Renamed Project');

    const projects = await loadMatrixProjects();
    expect(projects[0]?.name).toBe('Renamed Project');
  });

  it('duplicates a saved project with a new id and name', async () => {
    await saveMatrixProject(makeProject({ id: 'source-project', name: 'Source' }));

    const duplicate = await duplicateMatrixProject('source-project');
    expect(duplicate).not.toBeNull();
    expect(duplicate?.id).not.toBe('source-project');
    expect(duplicate?.name).toContain('Source');

    const projects = await loadMatrixProjects();
    expect(projects).toHaveLength(2);
  });

  it('deletes a saved project', async () => {
    await saveMatrixProject(makeProject());
    await deleteMatrixProject('project-1');

    const projects = await loadMatrixProjects();
    expect(projects).toHaveLength(0);
  });

  it('creates a new project draft locally', async () => {
    const created = await createMatrixProject({
      name: 'Fresh Build',
      description: 'Created from UI',
    });

    expect(created.mode).toBe('local');

    const projects = await loadMatrixProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('Fresh Build');
  });

  it('stores and reads workspace snapshot data', () => {
    saveMatrixProjectWorkspaceSnapshot({
      projectId: 'project-1',
      projectName: 'Project One',
      workspaceState: {
        filesSnapshot: [],
        chatMessagesSnapshot: [],
        activeFilePath: 'src/app/page.tsx',
      },
    });

    const snapshot = loadMatrixProjectWorkspaceSnapshot();
    expect(snapshot?.projectId).toBe('project-1');
    expect(snapshot?.workspaceState.activeFilePath).toBe('src/app/page.tsx');
    expect(
      window.localStorage.getItem(MATRIX_PROJECTS_WORKSPACE_SNAPSHOT_KEY)
    ).toContain('project-1');
  });

  it('stores and clears workspace context data', () => {
    saveMatrixProjectWorkspaceContext({
      currentProjectId: 'project-1',
      currentProjectName: 'Project One',
      buildManifest: { metadataVersion: 1 } as never,
    });

    const saved = loadMatrixProjectWorkspaceContext();
    expect(saved?.currentProjectId).toBe('project-1');
    expect(
      window.localStorage.getItem(MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY)
    ).toContain('Project One');

    clearMatrixProjectWorkspaceContext();
    expect(loadMatrixProjectWorkspaceContext()).toBeNull();
  });

  it('writes and consumes project open handoff once', () => {
    writeMatrixProjectOpenHandoff({
      projectId: 'project-1',
      projectName: 'Project One',
      openedAt: '2026-07-08T00:00:00.000Z',
    });

    expect(
      window.sessionStorage.getItem(MATRIX_PROJECTS_OPEN_HANDOFF_KEY)
    ).toContain('project-1');

    const firstRead = readMatrixProjectOpenHandoff();
    expect(firstRead?.projectId).toBe('project-1');

    const secondRead = readMatrixProjectOpenHandoff();
    expect(secondRead).toBeNull();
  });
});
