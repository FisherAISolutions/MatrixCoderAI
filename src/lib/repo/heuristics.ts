import type { FileNode, ChatMessage } from '@/app/chat-workspace/components/types';

/**
 * Repository heuristics — pure functions, no I/O.
 * Each ranker returns a Map<filePath, score in [0,1]>.
 *
 * Higher score = more relevant.
 */

// ---------- Import extraction ----------

// JS/TS: import ... from 'x' / require('x') / import('x') / export ... from 'x'
const JS_IMPORT_REGEX =
  /(?:import\s+(?:[\w*\s{},$]+\s+from\s+)?['"]([^'"]+)['"])|(?:require\s*\(\s*['"]([^'"]+)['"]\s*\))|(?:import\s*\(\s*['"]([^'"]+)['"]\s*\))|(?:export\s+(?:[\w*\s{},]+\s+)?from\s+['"]([^'"]+)['"])/g;

// Python: from x.y import z   /   import x.y
const PY_IMPORT_REGEX = /^[ \t]*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm;

export function extractImports(content: string, language?: string): string[] {
  if (!content) return [];
  const out = new Set<string>();
  const lang = (language || '').toLowerCase();

  if (lang === 'python') {
    let m: RegExpExecArray | null;
    PY_IMPORT_REGEX.lastIndex = 0;
    while ((m = PY_IMPORT_REGEX.exec(content)) !== null) {
      const mod = m[1] || m[2];
      if (mod) out.add(mod);
    }
    return Array.from(out);
  }

  // Default: JS/TS family (also matches inside other text languages harmlessly)
  let m: RegExpExecArray | null;
  JS_IMPORT_REGEX.lastIndex = 0;
  while ((m = JS_IMPORT_REGEX.exec(content)) !== null) {
    const spec = m[1] || m[2] || m[3] || m[4];
    if (spec) out.add(spec);
  }
  return Array.from(out);
}

// ---------- Import path resolution ----------

const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const JS_INDEX = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
const PY_EXTS = ['.py'];

function tryCandidates(pathNoExt: string, allPaths: Set<string>, exts: string[]): string | null {
  if (allPaths.has(pathNoExt)) return pathNoExt;
  for (const ext of exts) {
    if (allPaths.has(pathNoExt + ext)) return pathNoExt + ext;
  }
  return null;
}

/**
 * Resolve a single import spec against the set of all known file paths.
 * Returns the resolved path or null (e.g. for node_modules / unresolved).
 */
export function resolveImport(
  fromFilePath: string,
  spec: string,
  allPaths: Set<string>,
  language?: string
): string | null {
  if (!spec) return null;

  const isPy = (language || '').toLowerCase() === 'python';
  const exts = isPy ? PY_EXTS : JS_EXTS;

  // Python dotted import - try to resolve relative to project root
  if (isPy) {
    const asPath = spec.replace(/^\.+/, '').replace(/\./g, '/');
    return tryCandidates(asPath, allPaths, exts);
  }

  // Relative imports (./ or ../)
  if (spec.startsWith('.')) {
    const fromDir = fromFilePath.split('/').slice(0, -1).join('/');
    const segs = (fromDir ? fromDir + '/' : '') + spec;
    const normalized = normalizePath(segs);
    const direct = tryCandidates(normalized, allPaths, exts);
    if (direct) return direct;
    for (const idx of JS_INDEX) {
      if (allPaths.has(normalized + idx)) return normalized + idx;
    }
    return null;
  }

  // tsconfig path alias @/foo  →  src/foo (Next.js default)
  if (spec.startsWith('@/')) {
    const target = 'src/' + spec.slice(2);
    const direct = tryCandidates(target, allPaths, exts);
    if (direct) return direct;
    for (const idx of JS_INDEX) {
      if (allPaths.has(target + idx)) return target + idx;
    }
    return null;
  }

  // Bare imports (node_modules / built-ins) — skip
  return null;
}

function normalizePath(p: string): string {
  const parts = p.split('/').filter(Boolean);
  const out: string[] = [];
  for (const seg of parts) {
    if (seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

// ---------- Import graph ----------

export type ImportGraph = Map<string, Set<string>>;

export function buildImportGraph(files: FileNode[]): ImportGraph {
  const filePaths = new Set(files.filter((f) => f.type === 'file').map((f) => f.path));
  const graph: ImportGraph = new Map();

  for (const f of files) {
    if (f.type !== 'file' || !f.content) continue;
    const neighbors = new Set<string>();
    const imports = extractImports(f.content, f.language);
    for (const spec of imports) {
      const resolved = resolveImport(f.path, spec, filePaths, f.language);
      if (resolved && resolved !== f.path) neighbors.add(resolved);
    }
    graph.set(f.path, neighbors);
  }
  return graph;
}

// ---------- Ranking helpers ----------

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[_\-/.]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Filename / path token-match score */
export function rankByFilename(query: string, files: FileNode[]): Map<string, number> {
  const out = new Map<string, number>();
  if (!query.trim()) return out;
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return out;

  for (const f of files) {
    if (f.type !== 'file') continue;
    const pTokens = tokenize(f.path);
    let hits = 0;
    for (const t of pTokens) {
      if (qTokens.has(t)) hits++;
    }
    if (hits > 0) {
      // Normalize to [0,1]
      const score = Math.min(1, hits / Math.min(qTokens.size, 4));
      out.set(f.path, score);
    }
  }
  return out;
}

/** BFS from seed file(s); decays by hop. 1.0 at hop 1, 0.5 at hop 2, then 0. */
export function rankByImportGraph(
  seedPaths: string[],
  graph: ImportGraph,
  maxHops: number = 2
): Map<string, number> {
  const out = new Map<string, number>();
  const visited = new Set<string>(seedPaths);
  let frontier = new Set(seedPaths);

  for (let hop = 1; hop <= maxHops; hop++) {
    const next = new Set<string>();
    const score = Math.pow(0.5, hop - 1); // 1.0, 0.5, 0.25...
    for (const node of frontier) {
      const neigh = graph.get(node);
      if (!neigh) continue;
      for (const n of neigh) {
        if (visited.has(n)) continue;
        next.add(n);
        const prev = out.get(n) ?? 0;
        if (score > prev) out.set(n, score);
      }
      // Also include reverse edges (who imports this file)
      for (const [other, others] of graph.entries()) {
        if (visited.has(other)) continue;
        if (others.has(node)) {
          next.add(other);
          const prev = out.get(other) ?? 0;
          const reverseScore = score * 0.8;
          if (reverseScore > prev) out.set(other, reverseScore);
        }
      }
    }
    for (const n of next) visited.add(n);
    frontier = next;
    if (frontier.size === 0) break;
  }
  return out;
}

/** Newer = higher. Linear over the observed lastModified range. */
export function rankByRecency(files: FileNode[]): Map<string, number> {
  const out = new Map<string, number>();
  const entries = files.filter((f) => f.type === 'file' && f.lastModified);
  if (entries.length === 0) return out;
  const times = entries.map((f) => new Date(f.lastModified as string).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const range = Math.max(1, max - min);
  for (const f of entries) {
    const t = new Date(f.lastModified as string).getTime();
    out.set(f.path, (t - min) / range);
  }
  return out;
}

/** File paths explicitly referenced (substring match) in last N user messages. */
export function rankByChatMentions(
  messages: ChatMessage[],
  files: FileNode[],
  lookbackUserMessages: number = 5
): Map<string, number> {
  const out = new Map<string, number>();
  const userMessages = messages.filter((m) => m.role === 'user').slice(-lookbackUserMessages);
  if (userMessages.length === 0) return out;
  const joined = userMessages.map((m) => m.content).join('\n').toLowerCase();
  for (const f of files) {
    if (f.type !== 'file') continue;
    const path = f.path.toLowerCase();
    const name = f.name.toLowerCase();
    if (joined.includes(path)) out.set(f.path, 1.0);
    else if (joined.includes(name) && name.includes('.')) out.set(f.path, 0.7);
  }
  return out;
}

/** Utility: flatten nested FileNode[] (tree) into flat list of file entries. */
export function flattenTree(tree: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === 'file') out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}
