import type { ProjectExportFile } from './projectZip';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export interface DeploymentProjectInspection {
  supported: boolean;
  projectRoot: string;
  packageJsonPath?: string;
  framework: 'nextjs' | 'unknown';
  appRouter: boolean;
  packageManager: PackageManager;
  installCommand: string;
  buildCommand?: string;
  outputDirectory?: string;
  environmentVariables: string[];
  fingerprint: string;
  warnings: string[];
  blockingReasons: string[];
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function parent(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

function withinRoot(path: string, root: string): string {
  return root ? path.slice(root.length + 1) : path;
}

export function fingerprintProjectFiles(files: ProjectExportFile[]): string {
  let hash = 2166136261;
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const value = `${normalize(file.path)}\0${file.content}\0`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `repo-${files.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function collectEnvironmentVariables(files: ProjectExportFile[]): string[] {
  const names = new Set<string>();
  const pattern = /\b(?:process\.env\.|process\.env\[['"])([A-Z][A-Z0-9_]+)\b/g;
  for (const file of files) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(file.content)) !== null) names.add(match[1]);
    if (/(^|\/)\.env\.example$/i.test(file.path)) {
      for (const line of file.content.split(/\r?\n/)) {
        const envName = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1];
        if (envName) names.add(envName);
      }
    }
  }
  return Array.from(names).sort();
}

export function inspectDeploymentProject(
  files: ProjectExportFile[],
  overrideRoot?: string
): DeploymentProjectInspection {
  const normalizedFiles = files.map((file) => ({ ...file, path: normalize(file.path) }));
  const packageFiles = normalizedFiles.filter((file) => file.path.endsWith('package.json'));
  const candidateRoots = packageFiles.map((file) => parent(file.path));
  const requestedRoot = normalize(overrideRoot ?? '').replace(/\/+$/, '');
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  let projectRoot = requestedRoot;
  if (requestedRoot && !candidateRoots.includes(requestedRoot)) {
    blockingReasons.push(`The requested root directory "${requestedRoot}" has no package.json.`);
  } else if (!requestedRoot) {
    if (candidateRoots.length === 1) projectRoot = candidateRoots[0];
    else if (candidateRoots.includes('')) projectRoot = '';
    else if (candidateRoots.length === 0) blockingReasons.push('No package.json was found.');
    else blockingReasons.push('Multiple nested project roots were found; select one explicitly.');
  }

  const packageFile = packageFiles.find((file) => parent(file.path) === projectRoot);
  let parsed: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  } = {};
  if (packageFile) {
    try {
      parsed = JSON.parse(packageFile.content) as typeof parsed;
    } catch {
      blockingReasons.push(`${packageFile.path} is not valid JSON.`);
    }
  }
  const dependencies = { ...parsed.dependencies, ...parsed.devDependencies };
  const framework = dependencies.next ? 'nextjs' : 'unknown';
  if (framework !== 'nextjs') blockingReasons.push('The selected project is not a supported Next.js app.');
  const paths = new Set(normalizedFiles.map((file) => withinRoot(file.path, projectRoot)));
  const appRouter = Array.from(paths).some((path) => /^(?:src\/)?app\/.+|^(?:src\/)?app\/page\./.test(path));
  if (!appRouter) blockingReasons.push('No Next.js App Router files were detected.');

  let packageManager: PackageManager = 'npm';
  if (paths.has('pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (paths.has('yarn.lock')) packageManager = 'yarn';
  const installCommand =
    packageManager === 'pnpm'
      ? 'pnpm install --frozen-lockfile'
      : packageManager === 'yarn'
        ? 'yarn install --frozen-lockfile'
        : paths.has('package-lock.json')
          ? 'npm ci'
          : 'npm install';
  const buildCommand = parsed.scripts?.build
    ? `${packageManager === 'npm' ? 'npm run' : packageManager} build`
    : undefined;
  if (!buildCommand) blockingReasons.push('package.json does not define a build script.');
  if (!paths.has('.env.example')) {
    warnings.push('No .env.example file was found; environment setup may require manual review.');
  }

  return {
    supported: blockingReasons.length === 0,
    projectRoot,
    packageJsonPath: packageFile?.path,
    framework,
    appRouter,
    packageManager,
    installCommand,
    buildCommand,
    environmentVariables: collectEnvironmentVariables(normalizedFiles),
    fingerprint: fingerprintProjectFiles(normalizedFiles),
    warnings,
    blockingReasons,
  };
}
