import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';
import { promises as fs } from 'fs';
import path from 'path';

const DEFAULT_BENCHMARK_WORKSPACE_ROOT = '.cache/matrix-benchmark-runs';
const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'coverage',
  'dist',
  'build',
  'out',
]);
const TEXT_FILE_EXTENSIONS = new Set([
  '.css',
  '.cjs',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.prisma',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

export interface IsolatedBenchmarkWorkspace {
  path: string;
  rootPath: string;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'benchmark';
}

export function createIsolatedBenchmarkWorkspace(options: {
  runId: string;
  fixtureId: string;
  rootDir?: string;
  cwd?: string;
}): IsolatedBenchmarkWorkspace {
  const cwd = options.cwd ?? process.cwd();
  const rootPath = path.resolve(cwd, options.rootDir ?? DEFAULT_BENCHMARK_WORKSPACE_ROOT);
  const workspacePath = path.resolve(
    rootPath,
    `${safeSegment(options.fixtureId)}-${safeSegment(options.runId)}`
  );

  if (!workspacePath.startsWith(rootPath + path.sep)) {
    throw new Error('Resolved benchmark workspace escaped the benchmark root.');
  }

  return {
    path: workspacePath,
    rootPath,
  };
}

export function normalizeGeneratedFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  const parts = normalized.split('/').filter(Boolean);
  if (
    !normalized ||
    path.isAbsolute(filePath) ||
    parts.some((part) => part === '..' || part === '.')
  ) {
    throw new Error(`Unsafe generated file path: ${filePath}`);
  }
  return parts.join('/');
}

export async function prepareIsolatedBenchmarkWorkspace(
  workspacePath: string
): Promise<void> {
  await fs.rm(workspacePath, { recursive: true, force: true });
  await fs.mkdir(workspacePath, { recursive: true });
}

export async function writeGeneratedFilesToWorkspace(options: {
  files: FileNode[];
  workspacePath: string;
}): Promise<string[]> {
  await fs.mkdir(options.workspacePath, { recursive: true });
  const written: string[] = [];

  for (const file of flattenTree(options.files).filter((item) => item.type === 'file')) {
    const safePath = normalizeGeneratedFilePath(file.path);
    const target = path.resolve(options.workspacePath, safePath);
    if (!target.startsWith(path.resolve(options.workspacePath) + path.sep)) {
      throw new Error(`Generated file escaped isolated workspace: ${file.path}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content ?? '', 'utf8');
    written.push(safePath);
  }

  return written.sort();
}

function languageForPath(filePath: string): FileNode['language'] {
  if (filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.jsx')) return 'javascript';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return 'javascript';
  }
  if (filePath.endsWith('.css')) return 'css';
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.md')) return 'markdown';
  return 'unknown';
}

function isReadableTextPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_FILE_EXTENSIONS.has(ext)) return true;
  return filePath.endsWith('.env.example') || filePath.endsWith('Dockerfile');
}

export async function readGeneratedFilesFromWorkspace(
  workspacePath: string
): Promise<FileNode[]> {
  const root = path.resolve(workspacePath);
  const files: FileNode[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<import('fs').Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, '/');
      if (!relative || relative.startsWith('..')) continue;
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile() || !isReadableTextPath(relative)) continue;
      let content = '';
      try {
        content = await fs.readFile(absolute, 'utf8');
      } catch {
        continue;
      }
      files.push({
        id: relative,
        name: entry.name,
        path: relative,
        type: 'file',
        language: languageForPath(relative),
        content,
      });
    }
  }

  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function cleanupIsolatedBenchmarkWorkspace(
  workspacePath: string
): Promise<void> {
  await fs.rm(workspacePath, { recursive: true, force: true });
}
