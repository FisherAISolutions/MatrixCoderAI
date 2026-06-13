import type { FileNode } from '@/app/chat-workspace/components/types';
import { extractImports, flattenTree } from '@/lib/repo/heuristics';
import type { ParsedError } from './errorParser';

const SCANNABLE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']);

const RESOLVABLE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.scss',
  '.sass',
  '.module.css',
  '.module.scss',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
];

const INDEX_FILES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mjs',
  'index.cjs',
  'index.json',
  'index.css',
];

export interface MissingLocalImport {
  fromFile: string;
  specifier: string;
  expectedBasePath: string;
  suggestedCreatePath: string;
}

export interface ImportIntegrityAudit {
  ok: boolean;
  checkedFiles: number;
  localImportCount: number;
  missing: MissingLocalImport[];
  log: string;
  errors: ParsedError[];
}

function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join('/');
}

function isLocalImport(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('@/');
}

function candidateBasePath(fromFile: string, specifier: string): string {
  if (specifier.startsWith('@/')) {
    return normalizePath(`src/${specifier.slice(2)}`);
  }
  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  return normalizePath(`${fromDir}/${specifier}`);
}

function resolvesToFile(basePath: string, allPaths: Set<string>): boolean {
  for (const ext of RESOLVABLE_EXTENSIONS) {
    if (allPaths.has(basePath + ext)) return true;
  }
  for (const indexFile of INDEX_FILES) {
    if (allPaths.has(`${basePath}/${indexFile}`)) return true;
  }
  return false;
}

function suggestCreatePath(fromFile: string, basePath: string): string {
  if (/\.[A-Za-z0-9]+$/.test(basePath)) return basePath;
  if (
    basePath.startsWith('src/components/') ||
    basePath.startsWith('components/') ||
    basePath.includes('/components/') ||
    basePath.startsWith('src/app/') ||
    basePath.startsWith('app/')
  ) {
    return `${basePath}.tsx`;
  }
  if (
    basePath.startsWith('src/lib/') ||
    basePath.startsWith('lib/') ||
    basePath.includes('/lib/') ||
    fromFile.endsWith('.ts')
  ) {
    return `${basePath}.ts`;
  }
  return `${basePath}.tsx`;
}

function toError(missing: MissingLocalImport): ParsedError {
  return {
    source: 'imports',
    file: missing.fromFile,
    message:
      `Missing local import "${missing.specifier}" from ${missing.fromFile}. ` +
      `Expected a file at ${missing.expectedBasePath} with a supported extension, ` +
      `or an index file in that directory. Suggested create path: ${missing.suggestedCreatePath}. ` +
      `Create the missing file or correct the import path.`,
    raw:
      `${missing.fromFile}: import "${missing.specifier}" -> ${missing.expectedBasePath}\n` +
      `Suggested create path: ${missing.suggestedCreatePath}`,
  };
}

export function runImportIntegrityAudit(files: FileNode[]): ImportIntegrityAudit {
  const flat = flattenTree(files).filter(
    (file) => file.type === 'file' && typeof file.content === 'string'
  );
  const allPaths = new Set(flat.map((file) => file.path));
  const missing: MissingLocalImport[] = [];
  let checkedFiles = 0;
  let localImportCount = 0;

  for (const file of flat) {
    const ext = file.path.split('.').pop()?.toLowerCase();
    if (!ext || !SCANNABLE_EXTENSIONS.has(ext)) continue;
    checkedFiles += 1;

    for (const specifier of extractImports(file.content ?? '', file.language)) {
      if (!isLocalImport(specifier)) continue;
      localImportCount += 1;
      const basePath = candidateBasePath(file.path, specifier);
      if (!resolvesToFile(basePath, allPaths)) {
        missing.push({
          fromFile: file.path,
          specifier,
          expectedBasePath: basePath,
          suggestedCreatePath: suggestCreatePath(file.path, basePath),
        });
      }
    }
  }

  const log =
    missing.length === 0
      ? `[import-integrity] OK - checked ${checkedFiles} file(s), ${localImportCount} local import(s), no missing generated files.\n`
      : [
          `[import-integrity] FAILED - checked ${checkedFiles} file(s), ${localImportCount} local import(s), ${missing.length} missing target(s).`,
          ...missing.map(
            (item) =>
              `- ${item.fromFile} imports "${item.specifier}" -> missing ${item.expectedBasePath} (suggested create: ${item.suggestedCreatePath})`
          ),
          '',
        ].join('\n');

  return {
    ok: missing.length === 0,
    checkedFiles,
    localImportCount,
    missing,
    log,
    errors: missing.map(toError),
  };
}
