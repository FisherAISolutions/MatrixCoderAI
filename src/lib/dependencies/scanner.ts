/**
 * Import scanner (Phase 2 — Dependency Awareness System).
 *
 * Walks every TS/TSX/JS/JSX/MJS/CJS file in the current file tree and
 * extracts the module specifiers actually imported. Output is used by
 * the resolver to decide which packages are missing from package.json
 * and need to be auto-added.
 *
 * Why a custom regex scanner instead of a real AST parser:
 *   - Zero new runtime deps (the AST option would pull in @babel/parser
 *     or typescript-eslint/parser — both > 1 MB of JS).
 *   - We only need module specifiers, not full AST data.
 *   - The regex is intentionally permissive (handles ES `import …`,
 *     CommonJS `require(…)`, dynamic `import(…)`, side-effect imports,
 *     and `export … from …` re-exports).
 *   - False positives are harmless — the resolver double-checks each
 *     candidate against package.json + a known-package list before
 *     auto-adding.
 */

import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';

const SCANNABLE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
]);

/** ES module import / re-export / dynamic-import patterns. */
const ES_IMPORT_REGEX =
  /(?:^|\n|;|\s)(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * Tiny set of bare module names that aren't packages and should always
 * be skipped (Node built-ins, virtual modules emitted by bundlers).
 */
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
  'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url',
  'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

const NEXT_VIRTUAL_PREFIXES = ['next/', 'react-server-dom', 'private-next'];

export interface ImportRef {
  /** The module name as it would appear in package.json. */
  packageName: string;
  /** Full specifier including any deep import path. */
  specifier: string;
  /** Files (project-relative paths) that import this specifier. */
  importedBy: string[];
}

/**
 * Take a raw import specifier (e.g. `framer-motion/dist/es/animation`)
 * and return the package name (`framer-motion`). Returns `null` for
 * relative imports, path-alias imports, node built-ins, and other
 * non-package references.
 */
export function specifierToPackageName(specifier: string): string | null {
  const s = specifier.trim();
  if (!s) return null;

  // Relative / absolute / data / protocol-prefixed imports are local
  // files or external resources — not packages.
  if (s.startsWith('.') || s.startsWith('/')) return null;
  if (s.startsWith('@/')) return null; // path alias
  if (/^[a-z]+:/i.test(s)) return null; // http:, https:, data:, node:

  // Strip `node:` builtin prefix (modern Node syntax)
  if (s.startsWith('node:')) {
    const name = s.slice(5).split('/')[0];
    return NODE_BUILTINS.has(name) ? null : name;
  }

  // Node built-ins
  const firstSegment = s.split('/')[0];
  if (NODE_BUILTINS.has(firstSegment)) return null;

  // Scoped package: `@scope/name` (with optional subpath).
  if (s.startsWith('@')) {
    const parts = s.split('/');
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  // Bundler / framework virtual modules (next/image, next/font/…, etc.)
  // are NOT packages — `next` itself is the package and is already in
  // package.json for any Next.js project. Filter them out so we don't
  // try to auto-install a phantom `next/image` package.
  if (NEXT_VIRTUAL_PREFIXES.some((p) => s.startsWith(p))) {
    // The base package `next` IS real — return it so we can verify the
    // user actually has Next in deps. Same logic for `react/jsx-runtime`.
    return firstSegment;
  }

  return firstSegment;
}

/**
 * Scan a single file's contents for module imports.
 */
export function scanFileImports(filePath: string, content: string): ImportRef[] {
  const refs: ImportRef[] = [];
  ES_IMPORT_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ES_IMPORT_REGEX.exec(content)) !== null) {
    const spec = m[1];
    const pkg = specifierToPackageName(spec);
    if (!pkg) continue;
    refs.push({ packageName: pkg, specifier: spec, importedBy: [filePath] });
  }
  return refs;
}

/**
 * Scan every code file in the tree and return a deduped list of
 * referenced packages. Each entry includes the list of files that
 * pulled it in, so the resolver can surface helpful "added X because
 * Y imported it" chat messages.
 */
export function scanProjectImports(files: FileNode[]): ImportRef[] {
  const byPackage = new Map<string, ImportRef>();

  const flat = flattenTree(files).filter(
    (f) => f.type === 'file' && typeof f.content === 'string'
  );

  for (const f of flat) {
    const ext = f.path.split('.').pop()?.toLowerCase();
    if (!ext || !SCANNABLE_EXTENSIONS.has(ext)) continue;

    const refs = scanFileImports(f.path, f.content!);
    for (const r of refs) {
      const existing = byPackage.get(r.packageName);
      if (existing) {
        if (!existing.importedBy.includes(f.path)) {
          existing.importedBy.push(f.path);
        }
      } else {
        byPackage.set(r.packageName, r);
      }
    }
  }

  return Array.from(byPackage.values());
}
