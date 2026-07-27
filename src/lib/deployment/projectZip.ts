import JSZip from 'jszip';

export interface ProjectExportFile {
  path: string;
  content: string;
}

const ROOT_PROJECT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'next-env.d.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
  'eslint.config.js',
  '.eslintrc.json',
  '.gitignore',
  '.env.example',
  'README.md',
]);

const PROJECT_DIRECTORIES = [
  'src/',
  'app/',
  'components/',
  'lib/',
  'hooks/',
  'types/',
  'utils/',
  'data/',
  'styles/',
  'public/',
];

const EXCLUDED_PREFIXES = [
  '.git/',
  '.next/',
  '.turbo/',
  '.vercel/',
  '.agents/',
  '.codex/',
  'coverage/',
  'dist/',
  'build/',
  'node_modules/',
  'scripts/',
  'supabase/',
  'tests/',
];

const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
]);

export const MAX_DEPLOYMENT_FILES = 500;
export const MAX_DEPLOYMENT_BYTES = 5_000_000;

const SECRET_FILE_PATTERN = /(^|\/)\.env(?:\.|$)/i;
const ENV_EXAMPLE_PATTERN = /(^|\/)\.env\.example$/i;
const EXCLUDED_SEGMENT_PATTERN =
  /(^|\/)(?:node_modules|\.next|\.git|\.turbo|\.vercel|coverage|dist|build|cache|\.cache)(?:\/|$)/i;

export function normalizeExportPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('../') ||
    normalized === '..' ||
    /^[a-zA-Z]:\//.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function isProjectExportPath(path: string): boolean {
  const normalized = normalizeExportPath(path);
  if (!normalized) return false;
  if (
    EXCLUDED_FILES.has(normalized) ||
    (SECRET_FILE_PATTERN.test(normalized) && !ENV_EXAMPLE_PATTERN.test(normalized))
  ) {
    return false;
  }
  if (EXCLUDED_SEGMENT_PATTERN.test(normalized)) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }
  return (
    ROOT_PROJECT_FILES.has(normalized) ||
    PROJECT_DIRECTORIES.some((prefix) => normalized.startsWith(prefix)) ||
    Array.from(ROOT_PROJECT_FILES).some((file) => normalized.endsWith(`/${file}`)) ||
    PROJECT_DIRECTORIES.some((prefix) => normalized.includes(`/${prefix}`))
  );
}

export function selectProjectExportFiles(
  files: Array<{ path: string; content?: string | null }>,
  limits: { maxFiles?: number; maxBytes?: number } = {}
): ProjectExportFile[] {
  const byPath = new Map<string, ProjectExportFile>();

  for (const file of files) {
    const path = normalizeExportPath(file.path);
    if (!path || !isProjectExportPath(path)) continue;
    if (typeof file.content !== 'string') continue;
    byPath.set(path, {
      path,
      content: file.content,
    });
  }

  const selected = Array.from(byPath.values()).sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  const maxFiles = limits.maxFiles ?? MAX_DEPLOYMENT_FILES;
  const maxBytes = limits.maxBytes ?? MAX_DEPLOYMENT_BYTES;
  const bytes = selected.reduce(
    (total, file) => total + new TextEncoder().encode(file.content).byteLength,
    0
  );
  if (selected.length > maxFiles) {
    throw new Error(`Deployment package exceeds the ${maxFiles} file limit.`);
  }
  if (bytes > maxBytes) {
    throw new Error(`Deployment package exceeds the ${maxBytes} byte limit.`);
  }
  return selected;
}

export async function createProjectZipBlob(
  files: ProjectExportFile[]
): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  return zip.generateAsync({ type: 'blob' });
}

export function projectZipFileName(projectName: string): string {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'matrix-coder-project'}.zip`;
}
