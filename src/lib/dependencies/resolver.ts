/**
 * Dependency awareness resolver (Phase 2).
 *
 * Pipeline:
 *   1. Scan every code file for `import …` / `require(…)` specifiers.
 *   2. Filter to real npm packages (relative imports, path aliases,
 *      Node built-ins are dropped at scan time).
 *   3. Compare against the current package.json. Anything missing is
 *      a candidate.
 *   4. Resolve each candidate to a sensible `name + version` pair via
 *      the curated `KNOWN_PACKAGES` registry, falling back to
 *      `"latest"` when the package isn't in the curated set.
 *   5. Mutate package.json IN-PLACE (preserving its indentation +
 *      trailing newline) and emit an `onUpdateFile(...)` call so the
 *      change flows into React state + Supabase via the host.
 *
 * What this module deliberately does NOT do:
 *   - Run `npm install` directly. That's the WebContainer's job — the
 *     auto-fix loop's install step picks up the new deps on its next
 *     run.
 *   - Bump existing versions. We only ADD; the user's pinned versions
 *     are sacred.
 *   - Auto-add packages we suspect are typos (e.g. `react-domm`). The
 *     curated registry filters most of these out by virtue of not
 *     listing them; unknowns get "latest" but still go through the
 *     same idempotency guard so a typo'd import won't repeatedly
 *     thrash package.json.
 */

import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';
import { prefixedId } from '@/lib/uuid';
import { scanProjectImports, type ImportRef } from './scanner';
import { pickVersionFor } from './registry';
import {
  addDependencies,
  findPackageJsonNode,
  parsePackageJson,
  stringifyPackageJson,
  type AddDepResult,
  type PackageJsonShape,
} from './packageJson';

// ---------------------------------------------------------------------------
// React runtime ↔ @types alignment
// ---------------------------------------------------------------------------

const REACT_TYPE_PACKAGES = ['@types/react', '@types/react-dom'] as const;

/** Extract the major version from a semver range like `^19.1.0` / `~18.2.0`. */
function extractMajor(range: string | undefined): number | null {
  if (!range) return null;
  const m = range.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Targeted exception to the "never touch existing versions" rule.
 *
 * React runtime and React type packages MUST share a major version or
 * `npm install` dies with ERESOLVE before validation can even start
 * (observed failure: AI scaffolds `react@^19` alongside
 * `@types/react@^18.2.0`, then we add `@types/react-dom@^19` → boom).
 *
 * We correct the `@types/*` majors IN PLACE to match the runtime —
 * never the other way around (the runtime version is what the app code
 * was written against).
 */
function alignReactTypeMajors(
  shape: PackageJsonShape
): Array<{ name: string; from: string; to: string }> {
  const reactMajor = extractMajor(
    shape.dependencies?.['react'] ?? shape.devDependencies?.['react']
  );
  if (reactMajor === null) return [];

  const corrected: Array<{ name: string; from: string; to: string }> = [];
  for (const name of REACT_TYPE_PACKAGES) {
    for (const section of ['dependencies', 'devDependencies'] as const) {
      const current = shape[section]?.[name];
      if (!current) continue;
      const typesMajor = extractMajor(current);
      if (typesMajor === null || typesMajor === reactMajor) continue;
      const to = `^${reactMajor}.0.0`;
      shape[section]![name] = to;
      corrected.push({ name, from: current, to });
    }
  }
  return corrected;
}

/**
 * Infer dev-only packages a project NEEDS based on which config files
 * exist, even if no source file imports them directly.
 *
 * This is what catches the "AI scaffolded a Next.js project but didn't
 * include `typescript` in package.json" failure mode — the type-check
 * step then fails with `tsc: command not found` because typescript
 * isn't in node_modules/.bin.
 *
 * Returns an array of `{ name, version, devDeps }` triples ready to
 * feed into addDependencies(...).
 */
function inferProjectShapeDeps(
  files: FileNode[]
): Array<{ name: string; version: string; devDeps: boolean; reason: string }> {
  const flat = flattenTree(files).filter((f) => f.type === 'file');
  const paths = new Set(flat.map((f) => f.path));
  const filenames = new Set(flat.map((f) => f.name));
  const out: Array<{ name: string; version: string; devDeps: boolean; reason: string }> = [];

  const has = (p: string) => paths.has(p);
  const hasFile = (name: string) => filenames.has(name);
  const hasTsConfig = has('tsconfig.json');
  const hasNextConfig =
    has('next.config.js') ||
    has('next.config.mjs') ||
    has('next.config.ts') ||
    has('next.config.cjs');
  const hasTailwindConfig = Array.from(filenames).some((n) =>
    /^tailwind\.config\.(?:m?js|ts|cjs)$/i.test(n)
  );
  const hasPostcssConfig = Array.from(filenames).some((n) =>
    /^postcss\.config\.(?:m?js|ts|cjs)$/i.test(n)
  );
  const hasViteConfig = Array.from(filenames).some((n) =>
    /^vite\.config\.(?:m?js|ts|cjs)$/i.test(n)
  );
  const hasTsxFiles = flat.some(
    (f) => f.path.endsWith('.tsx') || f.path.endsWith('.ts')
  );

  const add = (name: string, reason: string) => {
    const { version, devDeps } = pickVersionFor(name);
    out.push({ name, version, devDeps, reason });
  };

  // TypeScript shape — when there's a tsconfig.json OR any .ts/.tsx
  // file in the tree, the project needs typescript itself.
  if (hasTsConfig || hasTsxFiles) {
    add('typescript', hasTsConfig ? 'tsconfig.json present' : '.ts/.tsx files present');
    add('@types/node', 'TypeScript project — Node types needed');
  }

  // Next.js shape — config file present? Add the Next-flavoured TS deps.
  if (hasNextConfig) {
    add('@types/react', 'Next.js TypeScript project');
    add('@types/react-dom', 'Next.js TypeScript project');
    add('eslint-config-next', 'Next.js project linting');
  }

  // Tailwind shape — config but no tailwindcss → it'll be a no-op build.
  if (hasTailwindConfig) {
    add('tailwindcss', 'tailwind.config.* present');
  }
  if (hasPostcssConfig) {
    add('postcss', 'postcss.config.* present');
    add('autoprefixer', 'postcss.config.* present');
  }

  // Vite shape.
  if (hasViteConfig) {
    add('vite', 'vite.config.* present');
    add('@vitejs/plugin-react', 'Vite + React project');
  }

  // Dedupe — multiple heuristics may add the same package.
  const seen = new Set<string>();
  return out.filter((e) => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });
}

export interface DependencyAnalysisResult {
  /** Was package.json mutated this run? */
  mutated: boolean;
  /** All imports scanned. */
  scanned: ImportRef[];
  /** Packages that were missing AND got auto-added. */
  added: AddDepResult['added'];
  /** Existing `@types/*` entries whose major was corrected to match the runtime. */
  corrected: Array<{ name: string; from: string; to: string }>;
  /** Packages skipped (already present, or no package.json at all). */
  skipped: Array<{ name: string; reason: string }>;
  /** Diagnostic message ready to drop into chat. */
  chatSummary: string | null;
}

export interface AnalyzeOptions {
  files: FileNode[];
  onUpdateFile: (file: FileNode) => void;
  /** Optional override for typing. */
  registry?: typeof pickVersionFor;
}

/**
 * Run the dependency analysis and apply any missing packages to
 * package.json. Returns a structured result + a chat-ready summary.
 */
export function analyzeAndAddMissingDependencies(
  opts: AnalyzeOptions
): DependencyAnalysisResult {
  const { files, onUpdateFile } = opts;
  const versionPicker = opts.registry ?? pickVersionFor;

  const scanned = scanProjectImports(files);

  const pkgNode = findPackageJsonNode(files);
  if (!pkgNode || typeof pkgNode.content !== 'string') {
    return {
      mutated: false,
      scanned,
      added: [],
      corrected: [],
      skipped: scanned.map((s) => ({ name: s.packageName, reason: 'no-package-json' })),
      chatSummary:
        scanned.length > 0
          ? `**Dependency scan skipped** — no \`package.json\` found in the tree. ${scanned.length} import(s) detected; the AI will need to emit a package.json before auto-fix can resolve them.`
          : null,
    };
  }

  const parsed = parsePackageJson(pkgNode.content);
  if (!parsed) {
    return {
      mutated: false,
      scanned,
      added: [],
      corrected: [],
      skipped: scanned.map((s) => ({ name: s.packageName, reason: 'package-json-parse-failed' })),
      chatSummary:
        `**Dependency scan skipped** — \`package.json\` is not valid JSON. ` +
        `Fix the syntax error and the next auto-fix attempt will re-run the scan.`,
    };
  }

  // Align existing @types/react(-dom) majors with the React runtime
  // BEFORE building candidates — fixes the ERESOLVE failure mode where
  // the AI scaffolds react@^19 alongside @types/react@^18.
  const corrected = alignReactTypeMajors(parsed.shape);

  // Build the candidate list: every imported package not already in
  // deps/devDeps/peerDeps, plus project-shape dev-deps (typescript,
  // @types/*, eslint-config-next, etc.) needed by config files even
  // when no source file imports them directly.
  const existing = new Set<string>([
    ...Object.keys(parsed.shape.dependencies ?? {}),
    ...Object.keys(parsed.shape.devDependencies ?? {}),
    ...Object.keys(parsed.shape.peerDependencies ?? {}),
  ]);

  const candidates: Array<{
    name: string;
    version: string;
    devDeps: boolean;
    importedBy: string[];
    reason?: string;
  }> = [];

  for (const ref of scanned) {
    if (existing.has(ref.packageName)) continue;
    const { version, devDeps } = versionPicker(ref.packageName);
    candidates.push({
      name: ref.packageName,
      version,
      devDeps,
      importedBy: ref.importedBy,
    });
  }

  // Project-shape inferred deps (typescript, @types/react, etc.)
  for (const shape of inferProjectShapeDeps(files)) {
    if (existing.has(shape.name)) continue;
    if (candidates.some((c) => c.name === shape.name)) continue;
    candidates.push({
      name: shape.name,
      version: shape.version,
      devDeps: shape.devDeps,
      importedBy: [],
      reason: shape.reason,
    });
  }

  // Pin React type-package candidates to the RUNTIME's major rather
  // than the registry default — a React 18 project must get
  // `@types/react@^18.0.0`, not the registry's `^19.0.0`.
  const reactMajor = extractMajor(
    parsed.shape.dependencies?.['react'] ?? parsed.shape.devDependencies?.['react']
  );
  if (reactMajor !== null) {
    for (const c of candidates) {
      if ((REACT_TYPE_PACKAGES as readonly string[]).includes(c.name)) {
        c.version = `^${reactMajor}.0.0`;
      }
    }
  }

  if (candidates.length === 0 && corrected.length === 0) {
    return {
      mutated: false,
      scanned,
      added: [],
      corrected: [],
      skipped: [],
      chatSummary: null,
    };
  }

  const addResult = addDependencies(parsed, candidates);
  if (!addResult.changed && corrected.length === 0) {
    return {
      mutated: false,
      scanned,
      added: [],
      corrected: [],
      skipped: addResult.skipped,
      chatSummary: null,
    };
  }

  // Re-serialise & push back through the file-update channel.
  const newContent = stringifyPackageJson(parsed);
  const updated: FileNode = {
    ...pkgNode,
    content: newContent,
    size: newContent.length,
    lastModified: new Date().toISOString(),
    isNew: false,
    id: pkgNode.id ?? prefixedId('file'),
  };
  onUpdateFile(updated);

  // Build chat summary.
  const lines = addResult.added.map((a) => {
    const ref = candidates.find((c) => c.name === a.name);
    let why = '';
    if (ref?.importedBy && ref.importedBy.length > 0) {
      why = ` (imported by ${ref.importedBy.slice(0, 2).join(', ')})`;
    } else if (ref?.reason) {
      why = ` (${ref.reason})`;
    }
    return `- \`${a.name}@${a.version}\` → **${a.section}**${why}`;
  });

  const parts: string[] = [];
  if (addResult.added.length > 0) {
    parts.push(
      `**Dependency awareness** — added ${addResult.added.length} missing package${addResult.added.length === 1 ? '' : 's'} to \`package.json\`:\n\n` +
        lines.join('\n')
    );
  }
  if (corrected.length > 0) {
    const correctedLines = corrected.map(
      (c) => `- \`${c.name}\`: \`${c.from}\` → \`${c.to}\` (aligned with the React runtime major)`
    );
    parts.push(
      `**Version alignment** — corrected ${corrected.length} \`@types/*\` package${corrected.length === 1 ? '' : 's'} to match the installed React major (prevents npm ERESOLVE):\n\n` +
        correctedLines.join('\n')
    );
  }
  const chatSummary =
    parts.join('\n\n') +
    `\n\n_Next validation pass will run \`npm install\` to pull these in._`;

  return {
    mutated: true,
    scanned,
    added: addResult.added,
    corrected,
    skipped: addResult.skipped,
    chatSummary,
  };
}
