import type { RepositoryModel } from './types';
import {
  REPOSITORY_MODEL_METADATA_VERSION,
  REPOSITORY_MODEL_SCHEMA_VERSION,
} from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeArray<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isParsedError(value: unknown): value is RepositoryModel['currentValidationErrors'][number] {
  return (
    isObject(value) &&
    typeof value.source === 'string' &&
    typeof value.message === 'string'
  );
}

export function serializeRepositoryModel(model: RepositoryModel): string {
  return JSON.stringify(model);
}

export function deserializeRepositoryModel(raw: string): RepositoryModel | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RepositoryModel>;
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== REPOSITORY_MODEL_SCHEMA_VERSION ||
      typeof parsed.id !== 'string' ||
      typeof parsed.repositoryFingerprint !== 'string' ||
      typeof parsed.sourceFileFingerprint !== 'string'
    ) {
      return null;
    }

    return {
      schemaVersion: REPOSITORY_MODEL_SCHEMA_VERSION,
      metadataVersion: REPOSITORY_MODEL_METADATA_VERSION,
      id: parsed.id,
      projectId:
        typeof parsed.projectId === 'string' ? parsed.projectId : undefined,
      files: Array.isArray(parsed.files) ? parsed.files as RepositoryModel['files'] : [],
      directories: stringArray(parsed.directories),
      configuration: isObject(parsed.configuration)
        ? parsed.configuration as RepositoryModel['configuration']
        : {
            framework: 'unknown',
            packageManager: 'unknown',
            hasSrcApp: false,
            hasRootApp: false,
            configFiles: [],
          },
      dependencies: Array.isArray(parsed.dependencies)
        ? parsed.dependencies as RepositoryModel['dependencies']
        : [],
      scripts: isObject(parsed.scripts)
        ? Object.fromEntries(
            Object.entries(parsed.scripts).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
          )
        : {},
      routes: Array.isArray(parsed.routes) ? parsed.routes as RepositoryModel['routes'] : [],
      layouts: Array.isArray(parsed.layouts) ? parsed.layouts as RepositoryModel['layouts'] : [],
      components: stringArray(parsed.components),
      apis: Array.isArray(parsed.apis) ? parsed.apis as RepositoryModel['apis'] : [],
      databaseSchemas: Array.isArray(parsed.databaseSchemas)
        ? parsed.databaseSchemas as RepositoryModel['databaseSchemas']
        : [],
      environmentVariableNames: stringArray(parsed.environmentVariableNames),
      authImplementation: Array.isArray(parsed.authImplementation)
        ? parsed.authImplementation as RepositoryModel['authImplementation']
        : [],
      storageImplementation: Array.isArray(parsed.storageImplementation)
        ? parsed.storageImplementation as RepositoryModel['storageImplementation']
        : [],
      providerIntegrations: Array.isArray(parsed.providerIntegrations)
        ? parsed.providerIntegrations as RepositoryModel['providerIntegrations']
        : [],
      tests: stringArray(parsed.tests),
      currentValidationErrors: safeArray(
        parsed.currentValidationErrors,
        isParsedError
      ),
      protectedFiles: stringArray(parsed.protectedFiles),
      unresolvedImports: Array.isArray(parsed.unresolvedImports)
        ? parsed.unresolvedImports as RepositoryModel['unresolvedImports']
        : [],
      importGraph: Array.isArray(parsed.importGraph)
        ? parsed.importGraph as RepositoryModel['importGraph']
        : [],
      detectedCapabilities: stringArray(parsed.detectedCapabilities),
      duplicateScaffoldRisks: Array.isArray(parsed.duplicateScaffoldRisks)
        ? parsed.duplicateScaffoldRisks as RepositoryModel['duplicateScaffoldRisks']
        : [],
      repositoryFingerprint: parsed.repositoryFingerprint,
      sourceFileFingerprint: parsed.sourceFileFingerprint,
      previousRepositoryFingerprint:
        typeof parsed.previousRepositoryFingerprint === 'string'
          ? parsed.previousRepositoryFingerprint
          : undefined,
      stale: parsed.stale === true,
      createdAt:
        typeof parsed.createdAt === 'string'
          ? parsed.createdAt
          : new Date(0).toISOString(),
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}
