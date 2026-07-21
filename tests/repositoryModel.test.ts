import { describe, expect, it } from 'vitest';

import type { FileNode } from '@/app/chat-workspace/components/types';
import type { TaskGraphTask } from '@/lib/task-graph';
import {
  createRepositoryModel,
  deserializeRepositoryModel,
  getCompletedWorkForTask,
  getRepositoryContextForTask,
  isRepositoryModelStale,
  normalizeRepositoryPath,
  refreshRepositoryModel,
  serializeRepositoryModel,
} from '@/lib/repository-model';
import {
  createMatrixProject,
  loadMatrixProjectWorkspaceContext,
  loadMatrixProjectWorkspaceSnapshot,
  saveMatrixProjectWorkspaceContext,
  saveMatrixProjectWorkspaceSnapshot,
} from '@/lib/projects/projectStore';

function file(path: string, content?: string, language?: FileNode['language']): FileNode {
  const name = normalizeRepositoryPath(path).split('/').pop() ?? path;
  return {
    id: path,
    name,
    path,
    type: 'file',
    language,
    content,
  };
}

function memoryStorage(): Storage {
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

function task(overrides: Partial<TaskGraphTask> = {}): TaskGraphTask {
  const timestamp = '2026-07-20T00:00:00.000Z';
  return {
    id: 'task-workouts',
    title: 'Implement workouts route',
    description: 'Create the workouts page and its route-specific component.',
    category: 'frontend',
    capabilityIds: ['app-router-routes'],
    sourceRequirementIds: ['req-workouts'],
    dependencies: [],
    status: 'ready',
    priority: 'high',
    allowedFileScope: ['src/app/workouts/**', 'src/components/fitness/**'],
    expectedFiles: [
      'src/app/workouts/page.tsx',
      'src/components/fitness/WorkoutsClient.tsx',
    ],
    expectedOutputs: ['A complete workouts screen.'],
    acceptanceChecks: ['Route /workouts exists.'],
    validationCommands: ['npm run type-check'],
    retryCount: 0,
    maximumRetryCount: 2,
    failureClassification: 'none',
    createdAt: timestamp,
    updatedAt: timestamp,
    assignedDiscipline: 'frontend',
    resultEvidence: [],
    resumable: true,
    fingerprint: 'task-fingerprint',
    ...overrides,
  };
}

describe('repository model', () => {
  it('detects App Router routes, layouts, and framework configuration', () => {
    const model = createRepositoryModel({
      files: [
        file('package.json', JSON.stringify({ dependencies: { next: '^15.0.0' } }), 'json'),
        file('src/app/layout.tsx', 'export default function Layout() { return null; }', 'typescript'),
        file('src/app/page.tsx', 'export default function Home() { return null; }', 'typescript'),
        file('src/app/dashboard/page.tsx', 'export default function Dashboard() { return null; }', 'typescript'),
      ],
      now: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(model.configuration.framework).toBe('nextjs');
    expect(model.configuration.hasSrcApp).toBe(true);
    expect(model.routes.map((route) => route.path).sort()).toEqual(['/', '/dashboard']);
    expect(model.layouts.map((layout) => layout.path)).toEqual(['/']);
  });

  it('detects dependencies from package.json and imports', () => {
    const model = createRepositoryModel({
      files: [
        file(
          'package.json',
          JSON.stringify({
            scripts: { build: 'next build' },
            dependencies: { next: '^15.0.0', react: '^19.0.0' },
            devDependencies: { vitest: '^3.0.0' },
          }),
          'json'
        ),
        file(
          'src/app/page.tsx',
          "import clsx from 'clsx';\nexport default function Page() { return clsx('x'); }",
          'typescript'
        ),
      ],
    });

    expect(model.scripts.build).toBe('next build');
    expect(model.dependencies.map((dependency) => dependency.name)).toEqual([
      'clsx',
      'next',
      'react',
      'vitest',
    ]);
    expect(model.dependencies.find((dependency) => dependency.name === 'vitest')?.kind).toBe(
      'devDependency'
    );
  });

  it('detects API routes and database schema files', () => {
    const model = createRepositoryModel({
      files: [
        file(
          'src/app/api/stories/route.ts',
          'export async function GET() { return Response.json([]); }\nexport async function POST() { return Response.json({ ok: true }); }',
          'typescript'
        ),
        file(
          'supabase/migrations/001_create_stories.sql',
          'create table if not exists stories (id uuid primary key);',
          'sql'
        ),
      ],
    });

    expect(model.apis).toMatchObject([
      { path: '/api/stories', filePath: 'src/app/api/stories/route.ts', methods: ['GET', 'POST'] },
    ]);
    expect(model.databaseSchemas).toMatchObject([
      {
        kind: 'supabase-migration',
        filePath: 'supabase/migrations/001_create_stories.sql',
        tables: ['stories'],
      },
    ]);
  });

  it('refreshes incrementally and reports changed, added, and removed files', () => {
    const previous = createRepositoryModel({
      files: [
        file('src/app/page.tsx', 'export default function Page() { return null; }', 'typescript'),
        file('src/app/old/page.tsx', 'export default function Old() { return null; }', 'typescript'),
      ],
    });
    const refreshed = refreshRepositoryModel(previous, {
      files: [
        file('src/app/page.tsx', 'export default function Page() { return <main />; }', 'typescript'),
        file('src/app/new/page.tsx', 'export default function New() { return null; }', 'typescript'),
      ],
    });

    expect(refreshed.changedPaths).toEqual(['src/app/page.tsx']);
    expect(refreshed.addedPaths).toEqual(['src/app/new/page.tsx']);
    expect(refreshed.removedPaths).toEqual(['src/app/old/page.tsx']);
    expect(refreshed.model.stale).toBe(true);
  });

  it('detects duplicate scaffolding risks', () => {
    const model = createRepositoryModel({
      files: [
        file('app/page.tsx', 'export default function Root() { return null; }', 'typescript'),
        file('src/app/page.tsx', 'export default function SrcRoot() { return null; }', 'typescript'),
        file('package-lock.json', '{}', 'json'),
        file('yarn.lock', '', 'unknown'),
      ],
    });

    expect(model.duplicateScaffoldRisks.map((risk) => risk.code)).toEqual([
      'multiple-app-roots',
      'duplicate-route',
      'multiple-package-managers',
    ]);
  });

  it('builds compact task-specific context', () => {
    const model = createRepositoryModel({
      files: [
        file('src/app/workouts/page.tsx', "import WorkoutsClient from '@/components/fitness/WorkoutsClient';\nexport default function Page() { return <WorkoutsClient />; }", 'typescript'),
        file('src/components/fitness/WorkoutsClient.tsx', "'use client';\nexport default function WorkoutsClient() { return null; }", 'typescript'),
        file('.env.local', 'SECRET=value', 'unknown'),
      ],
      userEditedFilePaths: ['src/app/page.tsx'],
    });
    const context = getRepositoryContextForTask(task(), model);

    expect(context.relatedRoutes.map((route) => route.path)).toContain('/workouts');
    expect(context.relevantFiles.map((item) => item.path)).toContain(
      'src/components/fitness/WorkoutsClient.tsx'
    );
    expect(context.expectedOutputsAlreadyExist).toBe(true);
    expect(context.filesMayChange).toEqual(['src/app/workouts/**', 'src/components/fitness/**']);
    expect(context.filesToAvoidChanging).toContain('.env.local');
    expect(getCompletedWorkForTask(task(), model)).toEqual([
      'src/app/workouts/page.tsx',
      'src/components/fitness/WorkoutsClient.tsx',
    ]);
  });

  it('normalizes Windows and POSIX paths consistently', () => {
    expect(normalizeRepositoryPath('src\\app\\.\\dashboard\\..\\dashboard\\page.tsx')).toBe(
      'src/app/dashboard/page.tsx'
    );
  });

  it('detects stale repository fingerprints', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return null; }', 'typescript'),
    ];
    const model = createRepositoryModel({ files });

    expect(isRepositoryModelStale(model, files)).toBe(false);
    expect(
      isRepositoryModelStale(model, [
        file('src/app/page.tsx', 'export default function Page() { return <main />; }', 'typescript'),
      ])
    ).toBe(true);
  });

  it('tolerates unreadable and expected missing files', () => {
    const model = createRepositoryModel({
      files: [file('src/app/page.tsx', undefined, 'typescript')],
      expectedPaths: ['src/app/dashboard/page.tsx'],
    });

    expect(model.files.find((item) => item.path === 'src/app/page.tsx')).toMatchObject({
      readable: false,
      missing: false,
    });
    expect(model.files.find((item) => item.path === 'src/app/dashboard/page.tsx')).toMatchObject({
      readable: false,
      missing: true,
    });
  });

  it('serializes defensively and recovers malformed optional data', () => {
    const model = createRepositoryModel({
      files: [file('src/app/page.tsx', 'export default function Page() { return null; }', 'typescript')],
    });
    const restored = deserializeRepositoryModel(serializeRepositoryModel(model));

    expect(restored?.routes.map((route) => route.path)).toEqual(['/']);
    expect(deserializeRepositoryModel('{bad json')).toBeNull();
    expect(
      deserializeRepositoryModel(
        JSON.stringify({ ...model, routes: 'not-an-array' })
      )?.routes
    ).toEqual([]);
    expect(
      deserializeRepositoryModel(JSON.stringify({ ...model, schemaVersion: 999 }))
    ).toBeNull();
  });

  it('persists through the existing project snapshot system', () => {
    const storage = memoryStorage();
    const repositoryModel = createRepositoryModel({
      projectId: 'project-repo',
      files: [file('src/app/page.tsx', 'export default function Page() { return null; }', 'typescript')],
    });
    const project = createMatrixProject(
      {
        name: 'Repository Project',
        description: 'Has repository model',
        repositoryModel,
        files: [],
        chatMessages: [],
      },
      new Date('2026-07-20T00:00:00.000Z'),
      'project-repo'
    );

    saveMatrixProjectWorkspaceSnapshot(storage, {
      projectId: project.id,
      name: project.name,
      description: project.description,
      files: project.files,
      chatMessages: project.chatMessages,
      repositoryModel: project.repositoryModel,
      validationStatus: 'passed',
      deploymentStatus: 'unknown',
      updatedAt: project.updatedAt,
    });
    saveMatrixProjectWorkspaceContext(storage, {
      currentProjectId: project.id,
      currentProjectName: project.name,
      repositoryModel: project.repositoryModel,
    });

    expect(
      loadMatrixProjectWorkspaceSnapshot(storage)?.repositoryModel?.routes.map(
        (route) => route.path
      )
    ).toEqual(['/']);
    expect(
      loadMatrixProjectWorkspaceContext(storage)?.repositoryModel?.projectId
    ).toBe('project-repo');
  });
});
