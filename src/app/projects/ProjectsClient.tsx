'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Copy,
  ExternalLink,
  FolderKanban,
  FolderPlus,
  Pencil,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import {
  createMatrixProject,
  createProjectFromWorkspaceSnapshot,
  deleteMatrixProject,
  duplicateMatrixProject,
  loadMatrixProjects,
  loadMatrixProjectWorkspaceContext,
  loadMatrixProjectWorkspaceSnapshot,
  renameMatrixProject,
  saveMatrixProject,
  saveMatrixProjectWorkspaceContext,
  saveMatrixProjectWorkspaceSnapshot,
  writeMatrixProjectOpenHandoff,
  type MatrixProject,
  type MatrixProjectPersistenceResult,
  type MatrixProjectWorkspaceSnapshot,
} from '@/lib/projects/projectStore';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusTone(status: string): string {
  switch (status) {
    case 'passed':
    case 'ready':
    case 'deployed':
      return 'border-matrix-green/60 bg-matrix-green-ghost text-matrix-green';
    case 'failed':
      return 'border-red-400/70 bg-red-500/10 text-red-200';
    case 'running':
    case 'pending':
      return 'border-cyan-300/70 bg-cyan-400/10 text-cyan-100';
    default:
      return 'border-matrix-border bg-matrix-bg text-matrix-green-muted';
  }
}

function buildSnapshotFromProject(project: MatrixProject): MatrixProjectWorkspaceSnapshot {
  return {
    name: project.name,
    description: project.description,
    files: project.files,
    chatMessages: project.chatMessages,
    buildManifest: project.buildManifest,
    blueprintDraft: project.blueprintDraft,
    validationStatus: project.validationStatus,
    deploymentStatus: project.deploymentStatus,
    workspaceState: project.workspaceState,
    updatedAt: project.updatedAt,
  };
}

export default function ProjectsClient() {
  const router = useRouter();
  const [projects, setProjects] = useState<MatrixProject[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [source, setSource] = useState<'supabase' | 'local'>('local');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [workspaceSnapshot, setWorkspaceSnapshot] =
    useState<MatrixProjectWorkspaceSnapshot | null>(null);

  const refreshProjects = useCallback(async () => {
    setIsLoading(true);
    const result = await loadMatrixProjects();
    setProjects(result.projects);
    setSource(result.source);
    setWarning(result.warning ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refreshProjects();

    if (typeof window === 'undefined') return;
    const snapshot = loadMatrixProjectWorkspaceSnapshot(window.localStorage);
    const context = loadMatrixProjectWorkspaceContext(window.localStorage);
    setWorkspaceSnapshot(snapshot);
    setActiveProjectId(context.currentProjectId ?? null);
    if (snapshot?.name) {
      setProjectName(snapshot.name);
      setProjectDescription(snapshot.description);
    }
  }, [refreshProjects]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) => {
      return (
        project.name.toLowerCase().includes(normalized) ||
        project.description.toLowerCase().includes(normalized)
      );
    });
  }, [projects, query]);

  const persistProjectList = useCallback(
    async (
      nextProject: MatrixProject,
      existing: MatrixProject[],
      successMessage: string
    ) => {
      const result = await saveMatrixProject(nextProject, existing);
      setProjects(result.projects);
      setSource(result.source);
      setWarning(result.warning ?? null);
      toast.success(successMessage);
      return result;
    },
    []
  );

  const handleCreateProject = useCallback(
    async (mode: 'workspace' | 'blank') => {
      const trimmedName = projectName.trim();
      if (!trimmedName) {
        toast.error('Give the project a name first.');
        return;
      }

      let nextProject: MatrixProject;
      if (mode === 'workspace' && workspaceSnapshot) {
        nextProject = createProjectFromWorkspaceSnapshot({
          ...workspaceSnapshot,
          name: trimmedName,
          description: projectDescription.trim(),
        });
      } else {
        nextProject = createMatrixProject({
          name: trimmedName,
          description: projectDescription.trim(),
        });
      }

      await persistProjectList(
        nextProject,
        projects,
        mode === 'workspace'
          ? 'Current workspace saved as a project.'
          : 'Blank project created.'
      );
      setProjectName('');
      setProjectDescription('');
    },
    [
      persistProjectList,
      projectDescription,
      projectName,
      projects,
      workspaceSnapshot,
    ]
  );

  const handleRenameProject = useCallback(
    async (project: MatrixProject) => {
      const nextName =
        typeof window !== 'undefined'
          ? window.prompt('Rename project', project.name)
          : null;
      if (!nextName || !nextName.trim() || nextName.trim() === project.name) return;

      const renamed = renameMatrixProject(project, nextName);
      await persistProjectList(renamed, projects, 'Project renamed.');
    },
    [persistProjectList, projects]
  );

  const handleDuplicateProject = useCallback(
    async (project: MatrixProject) => {
      const duplicate = duplicateMatrixProject(project);
      await persistProjectList(duplicate, projects, 'Project duplicated.');
    },
    [persistProjectList, projects]
  );

  const handleDeleteProject = useCallback(
    async (project: MatrixProject) => {
      if (typeof window !== 'undefined') {
        const shouldDelete = window.confirm(
          `Delete "${project.name}" from Projects? This will not touch files already open in Workspace.`
        );
        if (!shouldDelete) return;
      }

      const result: MatrixProjectPersistenceResult = await deleteMatrixProject(
        project.id,
        projects
      );
      setProjects(result.projects);
      setSource(result.source);
      setWarning(result.warning ?? null);
      if (activeProjectId === project.id) {
        setActiveProjectId(null);
      }
      toast.success('Project deleted.');
    },
    [activeProjectId, projects]
  );

  const handleOpenProject = useCallback(
    (project: MatrixProject) => {
      if (typeof window === 'undefined') return;

      saveMatrixProjectWorkspaceSnapshot(
        window.localStorage,
        buildSnapshotFromProject(project)
      );
      saveMatrixProjectWorkspaceContext(window.localStorage, {
        currentProjectId: project.id,
        currentProjectName: project.name,
        buildManifest: project.buildManifest,
        blueprintDraft: project.blueprintDraft,
      });
      writeMatrixProjectOpenHandoff(window.sessionStorage, project);
      setActiveProjectId(project.id);
      toast.success(`${project.name} loaded into Workspace.`);
      router.push('/chat-workspace');
    },
    [router]
  );

  return (
    <div className="min-h-full overflow-x-hidden bg-matrix-bg px-4 py-8 text-matrix-green md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="border border-matrix-border bg-matrix-panel/60 p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Matrix Coder AI
              </p>
              <h1 className="mt-3 text-3xl font-bold text-matrix-green neon-text-glow md:text-5xl">
                Projects
              </h1>
              <p className="mt-4 text-sm leading-7 text-matrix-readable md:text-base">
                Save generated apps, reopen them in Workspace, and keep the files,
                messages, manifest, and blueprint draft together in one place.
              </p>
            </div>

            <div className="border border-matrix-border bg-matrix-bg/70 px-4 py-3 text-xs uppercase tracking-[0.2em] text-matrix-green-muted">
              <div>Persistence</div>
              <div className="mt-2 font-bold text-matrix-green">
                {source === 'supabase' ? 'Supabase + local cache' : 'Local fallback'}
              </div>
            </div>
          </div>
          {warning ? (
            <div className="mt-5 border border-yellow-300/40 bg-yellow-300/10 px-4 py-3 text-sm text-yellow-100">
              {warning}
            </div>
          ) : null}
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="border border-matrix-border bg-matrix-panel/70 p-5">
            <div className="flex items-center gap-3">
              <FolderPlus size={18} aria-hidden="true" />
              <h2 className="text-lg font-bold text-matrix-green">Create project</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-matrix-readable">
              Save the current workspace into Projects, or create a blank shell you can
              reopen later.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-matrix-readable">
                <span className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  Project name
                </span>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="My next project"
                  className="border border-matrix-border bg-matrix-bg px-3 py-2 text-sm text-matrix-green outline-none transition focus:border-matrix-green"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-matrix-readable">
                <span className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  Description
                </span>
                <input
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="What this app is for"
                  className="border border-matrix-border bg-matrix-bg px-3 py-2 text-sm text-matrix-green outline-none transition focus:border-matrix-green"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleCreateProject('workspace')}
                disabled={!workspaceSnapshot}
                className="border border-matrix-green bg-matrix-green px-4 py-2 text-sm font-bold text-matrix-bg transition hover:bg-matrix-green-bright disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save current workspace
              </button>
              <button
                type="button"
                onClick={() => void handleCreateProject('blank')}
                className="border border-matrix-border bg-matrix-panel px-4 py-2 text-sm font-bold text-matrix-green transition hover:border-matrix-green"
              >
                Create blank project
              </button>
            </div>

            <div className="mt-5 border-t border-matrix-border pt-4 text-sm text-matrix-readable">
              {workspaceSnapshot ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                      Current workspace
                    </p>
                    <p className="mt-1 font-bold text-matrix-green">{workspaceSnapshot.name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                      Files
                    </p>
                    <p className="mt-1 font-bold text-matrix-green">
                      {workspaceSnapshot.files.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                      Last updated
                    </p>
                    <p className="mt-1 font-bold text-matrix-green">
                      {formatDate(workspaceSnapshot.updatedAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <p>No active workspace snapshot yet. Open Workspace and generate something first.</p>
              )}
            </div>
          </div>

          <div className="border border-matrix-border bg-matrix-panel/70 p-5">
            <div className="flex items-center gap-3">
              <FolderKanban size={18} aria-hidden="true" />
              <h2 className="text-lg font-bold text-matrix-green">Build context</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-matrix-readable">
              Each saved project keeps its file snapshot, chat history, validation state,
              and optional Build Manifest or Blueprint Draft so we can reopen it safely.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="border border-matrix-border bg-matrix-bg/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  Saved projects
                </p>
                <p className="mt-2 text-2xl font-bold text-matrix-green">{projects.length}</p>
              </div>
              <div className="border border-matrix-border bg-matrix-bg/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  Active project in workspace
                </p>
                <p className="mt-2 text-sm font-bold text-matrix-green">
                  {projects.find((project) => project.id === activeProjectId)?.name ??
                    'Not set'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border border-matrix-border bg-matrix-panel/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-matrix-green">Project library</h2>
              <p className="mt-1 text-sm text-matrix-readable">
                Reopen any saved app in Workspace without losing the surrounding context.
              </p>
            </div>
            <label className="relative block min-w-[260px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-matrix-green-muted"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects"
                className="w-full border border-matrix-border bg-matrix-bg px-9 py-2 text-sm text-matrix-green outline-none transition focus:border-matrix-green"
              />
            </label>
          </div>

          <div className="mt-5 space-y-4">
            {isLoading ? (
              <div className="border border-matrix-border bg-matrix-bg/60 px-4 py-6 text-sm text-matrix-readable">
                Loading projects...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="border border-dashed border-matrix-border bg-matrix-bg/60 px-4 py-10 text-center text-sm text-matrix-readable">
                No saved projects yet.
              </div>
            ) : (
              filteredProjects.map((project) => {
                const hasManifest = Boolean(project.buildManifest);
                const hasBlueprint = Boolean(project.blueprintDraft);
                const isActive = project.id === activeProjectId;

                return (
                  <article
                    key={project.id}
                    className={`border p-5 transition ${
                      isActive
                        ? 'border-matrix-green bg-matrix-green-ghost/10 shadow-[0_0_24px_rgba(0,255,102,0.08)]'
                        : 'border-matrix-border bg-matrix-panel/70'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-bold text-matrix-green">{project.name}</h3>
                          {isActive ? (
                            <span className="border border-matrix-green/60 bg-matrix-green-ghost px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-matrix-green">
                              Open in workspace
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-matrix-readable">
                          {project.description || 'No description yet.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenProject(project)}
                          className="inline-flex items-center gap-2 border border-matrix-green bg-matrix-green px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-matrix-bg transition hover:bg-matrix-green-bright"
                        >
                          <ExternalLink size={14} />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRenameProject(project)}
                          className="inline-flex items-center gap-2 border border-matrix-border bg-matrix-panel px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-matrix-green transition hover:border-matrix-green"
                        >
                          <Pencil size={14} />
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDuplicateProject(project)}
                          className="inline-flex items-center gap-2 border border-matrix-border bg-matrix-panel px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-matrix-green transition hover:border-matrix-green"
                        >
                          <Copy size={14} />
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProject(project)}
                          className="inline-flex items-center gap-2 border border-red-400/60 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-red-200 transition hover:bg-red-500/20"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                      <div className="border border-matrix-border bg-matrix-bg/60 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
                          Files
                        </p>
                        <p className="mt-2 font-bold text-matrix-green">{project.files.length}</p>
                      </div>
                      <div className="border border-matrix-border bg-matrix-bg/60 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
                          Messages
                        </p>
                        <p className="mt-2 font-bold text-matrix-green">
                          {project.chatMessages.length}
                        </p>
                      </div>
                      <div className="border border-matrix-border bg-matrix-bg/60 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
                          Manifest
                        </p>
                        <p className="mt-2 font-bold text-matrix-green">
                          {hasManifest ? 'Included' : 'None'}
                        </p>
                      </div>
                      <div className="border border-matrix-border bg-matrix-bg/60 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
                          Blueprint
                        </p>
                        <p className="mt-2 font-bold text-matrix-green">
                          {hasBlueprint ? 'Included' : 'None'}
                        </p>
                      </div>
                      <div className="border border-matrix-border bg-matrix-bg/60 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
                          Validation
                        </p>
                        <p
                          className={`mt-2 inline-flex border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusTone(
                            project.validationStatus
                          )}`}
                        >
                          {project.validationStatus}
                        </p>
                      </div>
                      <div className="border border-matrix-border bg-matrix-bg/60 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
                          Deployment
                        </p>
                        <p
                          className={`mt-2 inline-flex border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusTone(
                            project.deploymentStatus
                          )}`}
                        >
                          {project.deploymentStatus}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-matrix-border pt-4 text-xs text-matrix-green-muted">
                      <div className="flex flex-wrap items-center gap-4">
                        <span>Created {formatDate(project.createdAt)}</span>
                        <span>Updated {formatDate(project.updatedAt)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-1">
                          <Star size={12} />
                          Build context ready
                        </span>
                        <span>{project.workspaceState?.activeFilePath ?? 'No active file saved'}</span>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
