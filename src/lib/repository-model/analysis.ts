import type { FileNode } from '@/app/chat-workspace/components/types';
import { scanProjectImports } from '@/lib/dependencies/scanner';
import { extractImports, flattenTree, resolveImport } from '@/lib/repo/heuristics';
import { runImportIntegrityAudit } from '@/lib/validation/importIntegrity';
import type {
  CreateRepositoryModelOptions,
  RepositoryApiRoute,
  RepositoryDataSchema,
  RepositoryDependency,
  RepositoryDuplicateScaffoldRisk,
  RepositoryImplementationSignal,
  RepositoryImportEdge,
  RepositoryModel,
  RepositoryModelFile,
  RepositoryPackageManager,
  RepositoryRoute,
} from './types';
import {
  REPOSITORY_MODEL_METADATA_VERSION,
  REPOSITORY_MODEL_SCHEMA_VERSION,
} from './types';

const IGNORED_SEGMENTS = new Set([
  'node_modules',
  '.next',
  'out',
  'dist',
  'build',
  'coverage',
  '.git',
  '.turbo',
  '.vercel',
]);

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'svg',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'pdf',
  'zip',
  'wasm',
]);

const PROTECTED_DEFAULTS = [
  '.env',
  '.env.local',
  '.env.production',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
];

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeRepositoryPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

function shouldScanPath(path: string): boolean {
  const normalized = normalizeRepositoryPath(path);
  const parts = normalized.split('/');
  if (parts.some((part) => IGNORED_SEGMENTS.has(part))) return false;
  const ext = normalized.split('.').pop()?.toLowerCase() ?? '';
  return !BINARY_EXTENSIONS.has(ext);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function pathMatchesScope(path: string, scope: string): boolean {
  const normalizedPath = normalizeRepositoryPath(path);
  const normalizedScope = normalizeRepositoryPath(scope);
  if (normalizedScope.endsWith('/**')) {
    return normalizedPath.startsWith(normalizedScope.slice(0, -3));
  }
  if (normalizedScope.endsWith('/*')) {
    const prefix = normalizedScope.slice(0, -1);
    return normalizedPath.startsWith(prefix);
  }
  if (normalizedScope.includes('*')) {
    const regex = new RegExp(
      '^' +
        normalizedScope
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*') +
        '$'
    );
    return regex.test(normalizedPath);
  }
  return normalizedPath === normalizedScope;
}

function directoryPaths(files: RepositoryModelFile[]): string[] {
  const directories = new Set<string>();
  files.forEach((file) => {
    const parts = file.path.split('/').slice(0, -1);
    for (let index = 1; index <= parts.length; index += 1) {
      directories.add(parts.slice(0, index).join('/'));
    }
  });
  return Array.from(directories).filter(Boolean).sort();
}

function fileExtension(path: string): string {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function createFileModel(
  file: FileNode,
  sets: {
    generated: Set<string>;
    userEdited: Set<string>;
    protected: Set<string>;
  }
): RepositoryModelFile {
  const path = normalizeRepositoryPath(file.path);
  const content = typeof file.content === 'string' ? file.content : undefined;
  return {
    path,
    name: file.name || path.split('/').pop() || path,
    extension: fileExtension(path),
    language: file.language,
    size: content?.length ?? file.size ?? 0,
    contentHash: content === undefined ? undefined : stableHash(content),
    readable: content !== undefined,
    missing: false,
    generated: sets.generated.has(path) || file.isNew === true,
    userEdited: sets.userEdited.has(path),
    protected:
      sets.protected.has(path) ||
      PROTECTED_DEFAULTS.some((protectedPath) => path === protectedPath),
    lastModified: file.lastModified,
  };
}

function missingFile(path: string): RepositoryModelFile {
  const normalized = normalizeRepositoryPath(path);
  return {
    path: normalized,
    name: normalized.split('/').pop() || normalized,
    extension: fileExtension(normalized),
    size: 0,
    readable: false,
    missing: true,
    generated: false,
    userEdited: false,
    protected: PROTECTED_DEFAULTS.some((protectedPath) => normalized === protectedPath),
  };
}

function packageManager(paths: Set<string>): RepositoryPackageManager {
  if (paths.has('pnpm-lock.yaml')) return 'pnpm';
  if (paths.has('yarn.lock')) return 'yarn';
  if (paths.has('bun.lockb')) return 'bun';
  if (paths.has('package-lock.json') || paths.has('package.json')) return 'npm';
  return 'unknown';
}

function parsePackageJson(content: string | undefined): {
  scripts: Record<string, string>;
  dependencyVersions: Map<string, { version: string; kind: 'dependency' | 'devDependency' }>;
} {
  if (!content) return { scripts: {}, dependencyVersions: new Map() };
  try {
    const parsed = JSON.parse(content) as {
      scripts?: Record<string, unknown>;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const scripts = Object.fromEntries(
      Object.entries(parsed.scripts ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
    const dependencyVersions = new Map<
      string,
      { version: string; kind: 'dependency' | 'devDependency' }
    >();
    Object.entries(parsed.dependencies ?? {}).forEach(([name, version]) => {
      if (typeof version === 'string') {
        dependencyVersions.set(name, { version, kind: 'dependency' });
      }
    });
    Object.entries(parsed.devDependencies ?? {}).forEach(([name, version]) => {
      if (typeof version === 'string') {
        dependencyVersions.set(name, { version, kind: 'devDependency' });
      }
    });
    return { scripts, dependencyVersions };
  } catch {
    return { scripts: {}, dependencyVersions: new Map() };
  }
}

function detectRoutes(fileModels: RepositoryModelFile[]): {
  routes: RepositoryRoute[];
  layouts: RepositoryRoute[];
} {
  const routeFiles = fileModels.filter((file) =>
    /^(?:src\/)?app\/.+\/(?:page|layout)\.(?:tsx|jsx|ts|js)$/.test(file.path) ||
    /^(?:src\/)?app\/(?:page|layout)\.(?:tsx|jsx|ts|js)$/.test(file.path)
  );
  const routeFromFile = (file: RepositoryModelFile): RepositoryRoute => {
    const withoutRoot = file.path.replace(/^(src\/)?app\/?/, '');
    const parts = withoutRoot.split('/');
    const kind = parts.at(-1)?.startsWith('layout.') ? 'layout' : 'page';
    const routeParts = parts.slice(0, -1).filter((part) => !part.startsWith('('));
    const routePath = '/' + routeParts.join('/');
    return {
      path: routePath === '/' ? '/' : routePath.replace(/\/+/g, '/').replace(/\/$/, ''),
      filePath: file.path,
      kind,
      readable: file.readable,
      fallback: false,
    };
  };
  const all = routeFiles.map(routeFromFile);
  return {
    routes: all.filter((route) => route.kind === 'page'),
    layouts: all.filter((route) => route.kind === 'layout'),
  };
}

function detectApis(fileModels: RepositoryModelFile[], contentByPath: Map<string, string>): RepositoryApiRoute[] {
  return fileModels
    .filter((file) => /^(?:src\/)?app\/api\/.+\/route\.(?:ts|js)$/.test(file.path))
    .map((file) => {
      const relative = file.path
        .replace(/^(src\/)?app\/api\//, '/api/')
        .replace(/\/route\.(?:ts|js)$/, '');
      const content = contentByPath.get(file.path) ?? '';
      const methods = unique(
        Array.from(content.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)).map(
          (match) => match[1]
        )
      );
      return {
        path: relative,
        filePath: file.path,
        methods,
        readable: file.readable,
      };
    });
}

function detectDatabaseSchemas(
  fileModels: RepositoryModelFile[],
  contentByPath: Map<string, string>
): RepositoryDataSchema[] {
  return fileModels
    .filter(
      (file) =>
        file.path.startsWith('supabase/migrations/') ||
        file.path.endsWith('.sql') ||
        file.path === 'prisma/schema.prisma' ||
        /drizzle.*\.(?:ts|js)$/.test(file.path)
    )
    .map((file) => {
      const content = contentByPath.get(file.path) ?? '';
      const tables = unique(
        Array.from(content.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["']?([a-z0-9_]+)/gi)).map(
          (match) => match[1]
        )
      );
      const kind = file.path.startsWith('supabase/migrations/')
        ? 'supabase-migration'
        : file.path.endsWith('.sql')
          ? 'sql'
          : file.path === 'prisma/schema.prisma'
            ? 'prisma'
            : /drizzle/i.test(file.path)
              ? 'drizzle'
              : 'unknown';
      return {
        kind,
        filePath: file.path,
        tables,
        readable: file.readable,
      };
    });
}

function detectEnvVars(contents: string[]): string[] {
  const vars = new Set<string>();
  contents.forEach((content) => {
    Array.from(content.matchAll(/process\.env\.([A-Z0-9_]+)/g)).forEach((match) => {
      vars.add(match[1]);
    });
  });
  return Array.from(vars).sort();
}

function implementationSignal(
  kind: RepositoryImplementationSignal['kind'],
  name: string,
  files: string[]
): RepositoryImplementationSignal | null {
  return files.length ? { kind, name, files: unique(files) } : null;
}

function detectImplementationSignals(
  contentByPath: Map<string, string>,
  dependencies: RepositoryDependency[]
): {
  auth: RepositoryImplementationSignal[];
  storage: RepositoryImplementationSignal[];
  integrations: RepositoryImplementationSignal[];
  capabilities: string[];
} {
  const entries = Array.from(contentByPath.entries());
  const filesContaining = (regex: RegExp) =>
    entries.filter(([, content]) => regex.test(content)).map(([path]) => path);
  const dependencyNames = new Set(dependencies.map((dependency) => dependency.name));
  const auth = [
    implementationSignal(
      'auth',
      'supabase-auth',
      filesContaining(/supabase\.auth|signInWithPassword|signUp\(/i)
    ),
    implementationSignal('auth', 'auth-boundary', filesContaining(/\bAuthGate\b|useAuth\b/i)),
  ].filter((item): item is RepositoryImplementationSignal => Boolean(item));
  const storage = [
    implementationSignal('storage', 'localStorage', filesContaining(/\blocalStorage\b/)),
    implementationSignal('storage', 'supabase-storage', filesContaining(/\.storage\.from\(/i)),
  ].filter((item): item is RepositoryImplementationSignal => Boolean(item));
  const integrations = [
    dependencyNames.has('@supabase/supabase-js')
      ? implementationSignal('integration', 'supabase', ['package.json'])
      : null,
    dependencyNames.has('openai') ? implementationSignal('integration', 'openai', ['package.json']) : null,
    dependencyNames.has('stripe') ? implementationSignal('integration', 'stripe', ['package.json']) : null,
    implementationSignal('integration', 'vercel', filesContaining(/\bvercel\b/i)),
  ].filter((item): item is RepositoryImplementationSignal => Boolean(item));
  const capabilities = unique([
    ...(auth.length ? ['authentication'] : []),
    ...(storage.some((item) => item.name === 'localStorage') ? ['local-storage'] : []),
    ...(storage.some((item) => item.name === 'supabase-storage') ? ['file-storage'] : []),
    ...(integrations.map((item) => item.name)),
  ]);
  return { auth, storage, integrations, capabilities };
}

function buildImportEdges(
  fileNodes: FileNode[],
  fileModels: RepositoryModelFile[]
): RepositoryImportEdge[] {
  const paths = new Set(fileModels.filter((file) => !file.missing).map((file) => file.path));
  const flat = flattenTree(fileNodes).filter(
    (file) =>
      file.type === 'file' &&
      typeof file.content === 'string' &&
      shouldScanPath(file.path)
  );
  const edges: RepositoryImportEdge[] = [];
  flat.forEach((file) => {
    const from = normalizeRepositoryPath(file.path);
    extractImports(file.content ?? '', file.language).forEach((specifier) => {
      const resolved = resolveImport(from, specifier, paths, file.language);
      if (resolved) {
        edges.push({ from, to: resolved, specifier, resolved: true });
      } else if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        edges.push({ from, to: '', specifier, resolved: false });
      }
    });
  });
  return edges;
}

function detectDuplicateRisks(
  fileModels: RepositoryModelFile[],
  routes: RepositoryRoute[]
): RepositoryDuplicateScaffoldRisk[] {
  const risks: RepositoryDuplicateScaffoldRisk[] = [];
  const paths = new Set(fileModels.map((file) => file.path));
  if (
    Array.from(paths).some((path) => path.startsWith('src/app/')) &&
    Array.from(paths).some((path) => path.startsWith('app/'))
  ) {
    risks.push({
      code: 'multiple-app-roots',
      message: 'Both app/ and src/app/ exist; this can create duplicate Next.js scaffolding.',
      paths: Array.from(paths).filter((path) => path.startsWith('app/') || path.startsWith('src/app/')),
    });
  }

  const routesByPath = new Map<string, string[]>();
  routes.forEach((route) => {
    routesByPath.set(route.path, [...(routesByPath.get(route.path) ?? []), route.filePath]);
  });
  routesByPath.forEach((routePaths, routePath) => {
    if (routePaths.length > 1) {
      risks.push({
        code: 'duplicate-route',
        message: `Route ${routePath} is implemented by multiple files.`,
        paths: routePaths,
      });
    }
  });

  const componentBasenames = new Map<string, string[]>();
  fileModels
    .filter((file) => /(?:^|\/)components\//.test(file.path) && /\.(?:tsx|jsx)$/.test(file.path))
    .forEach((file) => {
      const base = file.name.toLowerCase();
      componentBasenames.set(base, [...(componentBasenames.get(base) ?? []), file.path]);
    });
  componentBasenames.forEach((componentPaths) => {
    if (componentPaths.length > 1) {
      risks.push({
        code: 'duplicate-component',
        message: 'Multiple components share the same filename and may be duplicate scaffolding.',
        paths: componentPaths,
      });
    }
  });

  const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'].filter((path) =>
    paths.has(path)
  );
  if (lockFiles.length > 1) {
    risks.push({
      code: 'multiple-package-managers',
      message: 'Multiple package-manager lockfiles are present.',
      paths: lockFiles,
    });
  }
  return risks;
}

function sourceFingerprint(fileModels: RepositoryModelFile[]): string {
  return stableHash(
    fileModels
      .filter((file) => !file.missing)
      .map((file) => `${file.path}:${file.contentHash ?? 'unreadable'}:${file.size}`)
      .sort()
      .join('|')
  );
}

function repositoryFingerprint(input: unknown): string {
  return stableHash(JSON.stringify(input));
}

export function createRepositoryModel(options: CreateRepositoryModelOptions): RepositoryModel {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const generated = new Set((options.generatedFilePaths ?? []).map(normalizeRepositoryPath));
  const userEdited = new Set((options.userEditedFilePaths ?? []).map(normalizeRepositoryPath));
  const protectedPaths = new Set((options.protectedPaths ?? []).map(normalizeRepositoryPath));
  const flatNodes = flattenTree(options.files).filter((file) => file.type === 'file');
  const scannableNodes = flatNodes.filter((file) => shouldScanPath(file.path));
  const contentByPath = new Map<string, string>();
  scannableNodes.forEach((file) => {
    if (typeof file.content === 'string') {
      contentByPath.set(normalizeRepositoryPath(file.path), file.content);
    }
  });

  const fileModels = scannableNodes.map((file) =>
    createFileModel(file, { generated, userEdited, protected: protectedPaths })
  );
  const presentPaths = new Set(fileModels.map((file) => file.path));
  (options.expectedPaths ?? []).map(normalizeRepositoryPath).forEach((path) => {
    if (!presentPaths.has(path)) fileModels.push(missingFile(path));
  });
  fileModels.sort((a, b) => a.path.localeCompare(b.path));

  const directories = directoryPaths(fileModels);
  const pathSet = new Set(fileModels.map((file) => file.path));
  const packageJson = contentByPath.get('package.json');
  const packageData = parsePackageJson(packageJson);
  const imports = scanProjectImports(options.files);
  const dependencies: RepositoryDependency[] = Array.from(
    new Set([
      ...Array.from(packageData.dependencyVersions.keys()),
      ...imports.map((ref) => ref.packageName),
    ])
  )
    .sort()
    .map((name) => {
      const packageEntry = packageData.dependencyVersions.get(name);
      return {
        name,
        version: packageEntry?.version,
        kind: packageEntry?.kind ?? 'dependency',
        importedBy: unique(
          imports.find((ref) => ref.packageName === name)?.importedBy.map(normalizeRepositoryPath) ?? []
        ),
      };
    });
  const routeInfo = detectRoutes(fileModels);
  const apis = detectApis(fileModels, contentByPath);
  const databaseSchemas = detectDatabaseSchemas(fileModels, contentByPath);
  const importEdges = buildImportEdges(options.files, fileModels);
  const unresolvedImports = importEdges.filter((edge) => !edge.resolved);
  const implementation = detectImplementationSignals(
    contentByPath,
    dependencies
  );
  const tests = fileModels
    .filter((file) => /(^tests\/|\.test\.|\.spec\.)/.test(file.path))
    .map((file) => file.path);
  const protectedFiles = fileModels
    .filter((file) => file.protected)
    .map((file) => file.path);
  const configuration = {
    framework: dependencies.some((dependency) => dependency.name === 'next') ||
      pathSet.has('next.config.ts') ||
      pathSet.has('next.config.mjs')
      ? 'nextjs' as const
      : dependencies.some((dependency) => dependency.name === 'react')
        ? 'react' as const
        : 'unknown' as const,
    packageManager: packageManager(pathSet),
    hasSrcApp: directories.includes('src/app'),
    hasRootApp: directories.includes('app'),
    configFiles: Array.from(pathSet).filter((path) =>
      /^(package\.json|tsconfig\.json|next\.config\.(?:ts|mjs|js)|tailwind\.config\.(?:ts|js)|postcss\.config\.(?:js|mjs))$/.test(
        path
      )
    ),
  };
  const duplicateScaffoldRisks = detectDuplicateRisks(fileModels, routeInfo.routes);
  const source = sourceFingerprint(fileModels);
  const fingerprint = repositoryFingerprint({
    source,
    routes: routeInfo.routes,
    apis,
    dependencies,
    schemas: databaseSchemas,
    unresolvedImports,
    duplicateScaffoldRisks,
  });

  return {
    schemaVersion: REPOSITORY_MODEL_SCHEMA_VERSION,
    metadataVersion: REPOSITORY_MODEL_METADATA_VERSION,
    id: `repository-model-${options.projectId ?? 'workspace'}`,
    projectId: options.projectId,
    files: fileModels,
    directories,
    configuration,
    dependencies,
    scripts: packageData.scripts,
    routes: routeInfo.routes,
    layouts: routeInfo.layouts,
    components: fileModels
      .filter((file) => /(?:^|\/)components\//.test(file.path) && /\.(?:tsx|jsx)$/.test(file.path))
      .map((file) => file.path),
    apis,
    databaseSchemas,
    environmentVariableNames: detectEnvVars(Array.from(contentByPath.values())),
    authImplementation: implementation.auth,
    storageImplementation: implementation.storage,
    providerIntegrations: implementation.integrations,
    tests,
    currentValidationErrors: options.validationErrors ?? runImportIntegrityAudit(options.files).errors,
    protectedFiles,
    unresolvedImports,
    importGraph: importEdges,
    detectedCapabilities: unique([
      ...implementation.capabilities,
      ...(routeInfo.routes.length ? ['app-router-routes'] : []),
      ...(apis.length ? ['api-routes'] : []),
      ...(databaseSchemas.length ? ['database-schema'] : []),
      ...(tests.length ? ['tests'] : []),
    ]),
    duplicateScaffoldRisks,
    repositoryFingerprint: fingerprint,
    sourceFileFingerprint: source,
    previousRepositoryFingerprint: options.previousModel?.repositoryFingerprint,
    stale:
      Boolean(options.previousModel) &&
      options.previousModel?.sourceFileFingerprint !== source,
    createdAt: options.previousModel?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}

export function refreshRepositoryModel(
  previousModel: RepositoryModel,
  options: Omit<CreateRepositoryModelOptions, 'previousModel'>
): import('./types').RepositoryRefreshResult {
  const model = createRepositoryModel({ ...options, previousModel });
  const previousPaths = new Set(previousModel.files.map((file) => file.path));
  const nextPaths = new Set(model.files.map((file) => file.path));
  const changedPaths = model.files
    .filter((file) => {
      const previous = previousModel.files.find((item) => item.path === file.path);
      return previous && previous.contentHash !== file.contentHash;
    })
    .map((file) => file.path);
  const addedPaths = model.files
    .filter((file) => !previousPaths.has(file.path))
    .map((file) => file.path);
  const removedPaths = previousModel.files
    .filter((file) => !nextPaths.has(file.path))
    .map((file) => file.path);
  return { model, changedPaths, addedPaths, removedPaths };
}

export function isRepositoryModelStale(
  model: RepositoryModel,
  files: FileNode[]
): boolean {
  return createRepositoryModel({
    files,
    projectId: model.projectId,
    previousModel: model,
  }).sourceFileFingerprint !== model.sourceFileFingerprint;
}

export function repositoryPathMatchesScope(path: string, scope: string): boolean {
  return pathMatchesScope(path, scope);
}
