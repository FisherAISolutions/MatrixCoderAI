import type { TaskGraphTask } from '@/lib/task-graph';
import type {
  RepositoryApiRoute,
  RepositoryCapabilityStatus,
  RepositoryDataSchema,
  RepositoryImportEdge,
  RepositoryModel,
  RepositoryModelFile,
  RepositoryRoute,
  RepositoryTaskContext,
} from './types';
import { normalizeRepositoryPath, repositoryPathMatchesScope } from './analysis';

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function routePathForFile(path: string): string | null {
  const normalized = normalizeRepositoryPath(path);
  const match = normalized.match(/^(?:src\/)?app\/(.+)\/page\.(?:tsx|jsx|ts|js)$/);
  if (normalized.match(/^(?:src\/)?app\/page\.(?:tsx|jsx|ts|js)$/)) return '/';
  if (!match) return null;
  return `/${match[1]}`.replace(/\/+/g, '/');
}

function fileMatchesAnyScope(file: RepositoryModelFile, scopes: string[]): boolean {
  return scopes.some((scope) => repositoryPathMatchesScope(file.path, scope));
}

function relatedByPathText(path: string, task: TaskGraphTask): boolean {
  const text = [
    task.id,
    task.title,
    task.description,
    task.expectedFiles.join(' '),
    task.expectedOutputs.join(' '),
    task.allowedFileScope.join(' '),
  ]
    .join(' ')
    .toLowerCase();
  const tokens = normalizeRepositoryPath(path)
    .toLowerCase()
    .split(/[/.:-]+/)
    .filter((token) => token.length > 2);
  return tokens.some((token) => text.includes(token));
}

function directRelevantFiles(
  task: TaskGraphTask,
  repositoryModel: RepositoryModel
): RepositoryModelFile[] {
  const expected = new Set(task.expectedFiles.map(normalizeRepositoryPath));
  const direct = repositoryModel.files.filter(
    (file) =>
      expected.has(file.path) ||
      fileMatchesAnyScope(file, task.allowedFileScope) ||
      relatedByPathText(file.path, task)
  );
  return direct.slice(0, 12);
}

function importClosure(
  seeds: RepositoryModelFile[],
  imports: RepositoryImportEdge[]
): RepositoryImportEdge[] {
  const seedPaths = new Set(seeds.map((file) => file.path));
  const related = imports.filter(
    (edge) => seedPaths.has(edge.from) || seedPaths.has(edge.to)
  );
  return related.slice(0, 30);
}

function relatedRoutes(
  task: TaskGraphTask,
  files: RepositoryModelFile[],
  routes: RepositoryRoute[]
): RepositoryRoute[] {
  const routePaths = new Set(
    task.expectedFiles
      .map(routePathForFile)
      .filter((route): route is string => Boolean(route))
  );
  files.forEach((file) => {
    const route = routePathForFile(file.path);
    if (route) routePaths.add(route);
  });
  return routes.filter(
    (route) =>
      routePaths.has(route.path) ||
      relatedByPathText(route.path, task) ||
      relatedByPathText(route.filePath, task)
  );
}

function relatedApis(
  task: TaskGraphTask,
  apis: RepositoryApiRoute[]
): RepositoryApiRoute[] {
  return apis.filter(
    (api) => relatedByPathText(api.path, task) || relatedByPathText(api.filePath, task)
  );
}

function relatedSchemas(
  task: TaskGraphTask,
  schemas: RepositoryDataSchema[]
): RepositoryDataSchema[] {
  return schemas.filter(
    (schema) =>
      relatedByPathText(schema.filePath, task) ||
      schema.tables.some((table) => relatedByPathText(table, task))
  );
}

function capabilityStatus(
  task: TaskGraphTask,
  repositoryModel: RepositoryModel
): Record<string, RepositoryCapabilityStatus> {
  const detected = new Set(repositoryModel.detectedCapabilities);
  return Object.fromEntries(
    task.capabilityIds.map((capabilityId) => {
      if (detected.has(capabilityId)) return [capabilityId, 'present'];
      if (
        repositoryModel.providerIntegrations.some((item) =>
          item.name.includes(capabilityId)
        )
      ) {
        return [capabilityId, 'partial'];
      }
      return [capabilityId, 'missing'];
    })
  );
}

export function getRepositoryContextForTask(
  task: TaskGraphTask,
  repositoryModel: RepositoryModel
): RepositoryTaskContext {
  const relevantFiles = directRelevantFiles(task, repositoryModel);
  const relatedImports = importClosure(relevantFiles, repositoryModel.importGraph);
  const routeContext = relatedRoutes(task, relevantFiles, repositoryModel.routes);
  const apiContext = relatedApis(task, repositoryModel.apis);
  const schemaContext = relatedSchemas(task, repositoryModel.databaseSchemas);
  const relevantFilePaths = new Set(relevantFiles.map((file) => file.path));
  const currentErrors = repositoryModel.currentValidationErrors.filter(
    (error) =>
      (error.file && relevantFilePaths.has(normalizeRepositoryPath(error.file))) ||
      task.expectedFiles.some((path) =>
        error.message.includes(normalizeRepositoryPath(path))
      )
  );
  const filesMayChange = unique(task.allowedFileScope.map(normalizeRepositoryPath));
  const filesToAvoidChanging = unique([
    ...repositoryModel.protectedFiles,
    ...repositoryModel.files
      .filter(
        (file) =>
          file.protected ||
          (file.userEdited && !fileMatchesAnyScope(file, task.allowedFileScope))
      )
      .map((file) => file.path),
  ]);
  const existingPaths = new Set(
    repositoryModel.files
      .filter((file) => !file.missing && file.readable)
      .map((file) => file.path)
  );
  const expectedOutputsAlreadyExist =
    task.expectedFiles.length > 0 &&
    task.expectedFiles
      .map(normalizeRepositoryPath)
      .every((path) => existingPaths.has(path));
  const compactSummary = [
    `Task ${task.id}: ${task.title}`,
    `${relevantFiles.length} relevant file(s), ${routeContext.length} route(s), ${apiContext.length} API route(s).`,
    expectedOutputsAlreadyExist
      ? 'Expected files already exist.'
      : 'Expected files are not fully present yet.',
  ].join(' ');

  return {
    taskId: task.id,
    relevantFiles,
    relatedImports,
    relatedRoutes: routeContext,
    relatedDataSchemas: schemaContext,
    relatedApis: apiContext,
    currentErrors,
    capabilityStatus: capabilityStatus(task, repositoryModel),
    filesMayChange,
    filesToAvoidChanging,
    expectedOutputsAlreadyExist,
    duplicateScaffoldRisks: repositoryModel.duplicateScaffoldRisks.filter((risk) =>
      risk.paths.some((path) => relatedByPathText(path, task))
    ),
    compactSummary,
  };
}

export function getCompletedWorkForTask(
  task: TaskGraphTask,
  repositoryModel: RepositoryModel
): string[] {
  const existing = new Set(
    repositoryModel.files
      .filter((file) => file.readable && !file.missing)
      .map((file) => file.path)
  );
  return task.expectedFiles
    .map(normalizeRepositoryPath)
    .filter((path) => existing.has(path));
}
