import type { FileLanguage } from '@/app/chat-workspace/components/types';
import type { ParsedError } from '@/lib/validation/errorParser';

export const REPOSITORY_MODEL_SCHEMA_VERSION = 1;
export const REPOSITORY_MODEL_METADATA_VERSION = '2026-07-20';

export type RepositoryFramework = 'nextjs' | 'react' | 'unknown';
export type RepositoryPackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';
export type RepositoryCapabilityStatus = 'present' | 'missing' | 'partial';

export interface RepositoryModelFile {
  path: string;
  name: string;
  extension: string;
  language?: FileLanguage;
  size: number;
  contentHash?: string;
  readable: boolean;
  missing: boolean;
  generated: boolean;
  userEdited: boolean;
  protected: boolean;
  lastModified?: string;
}

export interface RepositoryDependency {
  name: string;
  version?: string;
  kind: 'dependency' | 'devDependency';
  importedBy: string[];
}

export interface RepositoryRoute {
  path: string;
  filePath: string;
  kind: 'page' | 'layout';
  readable: boolean;
  fallback: boolean;
}

export interface RepositoryApiRoute {
  path: string;
  filePath: string;
  methods: string[];
  readable: boolean;
}

export interface RepositoryDataSchema {
  kind: 'supabase-migration' | 'sql' | 'prisma' | 'drizzle' | 'unknown';
  filePath: string;
  tables: string[];
  readable: boolean;
}

export interface RepositoryImportEdge {
  from: string;
  to: string;
  specifier: string;
  resolved: boolean;
}

export interface RepositoryImplementationSignal {
  kind: 'auth' | 'storage' | 'integration' | 'test' | 'component';
  name: string;
  files: string[];
}

export interface RepositoryDuplicateScaffoldRisk {
  code:
    | 'multiple-app-roots'
    | 'duplicate-route'
    | 'duplicate-component'
    | 'multiple-package-managers';
  message: string;
  paths: string[];
}

export interface RepositoryConfiguration {
  framework: RepositoryFramework;
  packageManager: RepositoryPackageManager;
  hasSrcApp: boolean;
  hasRootApp: boolean;
  configFiles: string[];
}

export interface RepositoryModel {
  schemaVersion: typeof REPOSITORY_MODEL_SCHEMA_VERSION;
  metadataVersion: typeof REPOSITORY_MODEL_METADATA_VERSION;
  id: string;
  projectId?: string;
  files: RepositoryModelFile[];
  directories: string[];
  configuration: RepositoryConfiguration;
  dependencies: RepositoryDependency[];
  scripts: Record<string, string>;
  routes: RepositoryRoute[];
  layouts: RepositoryRoute[];
  components: string[];
  apis: RepositoryApiRoute[];
  databaseSchemas: RepositoryDataSchema[];
  environmentVariableNames: string[];
  authImplementation: RepositoryImplementationSignal[];
  storageImplementation: RepositoryImplementationSignal[];
  providerIntegrations: RepositoryImplementationSignal[];
  tests: string[];
  currentValidationErrors: ParsedError[];
  protectedFiles: string[];
  unresolvedImports: RepositoryImportEdge[];
  importGraph: RepositoryImportEdge[];
  detectedCapabilities: string[];
  duplicateScaffoldRisks: RepositoryDuplicateScaffoldRisk[];
  repositoryFingerprint: string;
  sourceFileFingerprint: string;
  previousRepositoryFingerprint?: string;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRepositoryModelOptions {
  files: import('@/app/chat-workspace/components/types').FileNode[];
  projectId?: string;
  previousModel?: RepositoryModel | null;
  expectedPaths?: string[];
  generatedFilePaths?: string[];
  userEditedFilePaths?: string[];
  protectedPaths?: string[];
  validationErrors?: ParsedError[];
  now?: Date;
}

export interface RepositoryRefreshResult {
  model: RepositoryModel;
  changedPaths: string[];
  removedPaths: string[];
  addedPaths: string[];
}

export interface RepositoryTaskContext {
  taskId: string;
  relevantFiles: RepositoryModelFile[];
  relatedImports: RepositoryImportEdge[];
  relatedRoutes: RepositoryRoute[];
  relatedDataSchemas: RepositoryDataSchema[];
  relatedApis: RepositoryApiRoute[];
  currentErrors: ParsedError[];
  capabilityStatus: Record<string, RepositoryCapabilityStatus>;
  filesMayChange: string[];
  filesToAvoidChanging: string[];
  expectedOutputsAlreadyExist: boolean;
  duplicateScaffoldRisks: RepositoryDuplicateScaffoldRisk[];
  compactSummary: string;
}
