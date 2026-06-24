import type { FileNode } from '@/app/chat-workspace/components/types';
import { extractImports, flattenTree } from '@/lib/repo/heuristics';
import { getAppRouterRootFiles } from '@/lib/repo/appRouterRoot';
import { findDuplicateEffectiveAppRoutes } from '@/lib/repo/appRoutes';
import { describePatchMarkerLeak } from '@/lib/repo/patchMarkers';
import { inferRequestedRouteSlugs } from '@/lib/generation/routePlanning';
import type { ParsedError } from './errorParser';

const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']);
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
const LINKED_APP_ROUTE_REGEX =
  /(?:href\s*=\s*|href\s*:\s*|router\.push\(\s*)["'`]\/([a-z0-9][a-z0-9-]*)(?:\/)?["'`]/gi;

export interface GeneratedQualityAudit {
  ok: boolean;
  errors: ParsedError[];
  log: string;
}

function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function candidateBasePath(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return normalizePath(`src/${specifier.slice(2)}`);
  if (!specifier.startsWith('.')) return null;
  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  return normalizePath(`${fromDir}/${specifier}`);
}

function resolveLocalImport(basePath: string, allPaths: Set<string>): string | null {
  if (allPaths.has(basePath)) return basePath;
  for (const ext of RESOLVE_EXTENSIONS) {
    if (allPaths.has(basePath + ext)) return basePath + ext;
  }
  for (const indexFile of INDEX_FILES) {
    const indexed = `${basePath}/${indexFile}`;
    if (allPaths.has(indexed)) return indexed;
  }
  return null;
}

function isLikelyRequiredTarget(path: string): boolean {
  return (
    /\.(?:tsx|jsx|ts|js|css)$/.test(path) &&
    (path.includes('/components/') ||
      path.includes('/lib/') ||
      path.endsWith('/globals.css') ||
      path.endsWith('/page.tsx') ||
      path.endsWith('/page.jsx'))
  );
}

function looksPlaceholder(content: string): boolean {
  const compact = content.replace(/\s+/g, ' ').trim();
  const obviousStubPatterns = [
    /\bTODO\b/i,
    /\bFIXME\b/i,
    /\bimplement later\b/i,
    /\bnot implemented\b/i,
    /\bmock implementation\b/i,
    /throw\s+new\s+Error\s*\(\s*["'`]not implemented["'`]\s*\)/i,
    /\bplaceholder\s+(?:component|file|implementation|stub)\b/i,
    /\bstub\s+(?:component|file|implementation|only)\b/i,
    /(?:^|\n)\s*(?:(?:\/\/|\/\*|\*)\s*)?(?:placeholder|stub)\s*$/i,
  ];

  return obviousStubPatterns.some((pattern) => pattern.test(compact));
}

function hasTailwindDirectives(content: string): boolean {
  return (
    content.includes('@tailwind base') &&
    content.includes('@tailwind components') &&
    content.includes('@tailwind utilities')
  );
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function tsconfigAliasIsValid(content: string): { ok: boolean; reason?: string } {
  const parsed = parseJsonObject(content);
  if (!parsed) return { ok: false, reason: 'tsconfig.json is not valid JSON.' };
  const compilerOptions =
    parsed.compilerOptions && typeof parsed.compilerOptions === 'object'
      ? (parsed.compilerOptions as Record<string, unknown>)
      : null;
  if (!compilerOptions) {
    return { ok: false, reason: 'tsconfig.json is missing compilerOptions.' };
  }
  if (compilerOptions.baseUrl !== '.') {
    return { ok: false, reason: 'tsconfig.json compilerOptions.baseUrl must be ".".' };
  }
  const paths =
    compilerOptions.paths && typeof compilerOptions.paths === 'object'
      ? (compilerOptions.paths as Record<string, unknown>)
      : null;
  const alias = paths?.['@/*'];
  if (!Array.isArray(alias) || !alias.includes('./src/*')) {
    return {
      ok: false,
      reason: 'tsconfig.json compilerOptions.paths must include "@/*": ["./src/*"].',
    };
  }
  return { ok: true };
}

function requirementTerms(requirements: string): string[] {
  const lower = requirements.toLowerCase();
  const terms: string[] = [];
  for (const term of ['search', 'filter', 'edit', 'delete', 'localstorage']) {
    if (lower.includes(term)) terms.push(term);
  }
  return terms;
}

function addRequiredRoute(
  routes: Array<{ label: string; candidates: string[] }>,
  label: string,
  candidates: string[]
) {
  if (!routes.some((existing) => existing.label === label)) {
    routes.push({ label, candidates });
  }
}

function hasPositiveRoutePhrase(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 90), match.index);
    if (
      !/(?:do not|don't|dont|never|avoid|without|not requested|not part of|not part|unless explicitly)\s+(?:[\w\s-]*?)(?:create|use|add|include|requested|request)?\s*$/i.test(
        before
      )
    ) {
      return true;
    }
  }
  return false;
}

function requiredRoutes(requirements: string): Array<{ label: string; candidates: string[] }> {
  const lower = requirements.toLowerCase();
  const routes: Array<{ label: string; candidates: string[] }> = [];
  const explicitSlugs = inferRequestedRouteSlugs(requirements);
  if (hasPositiveRoutePhrase(lower, /\bdashboard\s+(?:page|route|screen|view)\b/g)) {
    addRequiredRoute(routes, 'dashboard page', [
      'src/app/dashboard/page.tsx',
      'app/dashboard/page.tsx',
    ]);
  }
  if (hasPositiveRoutePhrase(lower, /\badd\s+entry\s+(?:page|route|screen|view)\b/g)) {
    addRequiredRoute(routes, 'add entry page', [
      'src/app/add-entry/page.tsx',
      'app/add-entry/page.tsx',
    ]);
  }
  if (
    hasPositiveRoutePhrase(lower, /\b(?:history|archive)\s+(?:page|route|screen|view)\b/g) ||
    hasPositiveRoutePhrase(lower, /\bactivity\s+(?:history|log)\b/g) ||
    explicitSlugs.includes('history')
  ) {
    addRequiredRoute(routes, 'history page', [
      'src/app/history/page.tsx',
      'app/history/page.tsx',
    ]);
  }
  if (/\b3\s+pages\b|\bthree\s+pages\b/.test(lower) && routes.length < 3) {
    if (/\bdashboard\b/.test(lower)) {
      addRequiredRoute(routes, 'dashboard page', [
        'src/app/dashboard/page.tsx',
        'app/dashboard/page.tsx',
      ]);
    }
    if (/\badd\s+entry\b/.test(lower)) {
      addRequiredRoute(routes, 'add entry page', [
        'src/app/add-entry/page.tsx',
        'app/add-entry/page.tsx',
      ]);
    }
    if (/\bhistory\b/.test(lower)) {
      addRequiredRoute(routes, 'history page', [
        'src/app/history/page.tsx',
        'app/history/page.tsx',
      ]);
    }
  }
  return routes;
}

function routePagePath(slug: string): string {
  return `src/app/${slug}/page.tsx`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DUPLICATE_ROUTE_PAIRS: Array<[string, string]> = [
  ['add', 'add-note'],
  ['add', 'add-entry'],
  ['add', 'add-task'],
  ['edit', 'edit-note'],
  ['edit', 'edit-task'],
  ['history', 'task-history'],
];

function appRouteSlugs(paths: Set<string>): string[] {
  const slugs: string[] = [];
  for (const path of paths) {
    const match = path.match(/^src\/app\/([^/()]+)\/page\.(?:tsx|jsx|ts|js)$/);
    if (match) slugs.push(match[1]);
  }
  return slugs;
}

function hasAppRoutePage(slug: string, paths: Set<string>): boolean {
  const slugPattern = escapeRegExp(slug);
  const routePattern = new RegExp(
    `^(?:src/)?app/(?:\\([^/]+\\)/)*${slugPattern}/page\\.(?:tsx|jsx|ts|js)$`
  );
  for (const path of paths) {
    if (routePattern.test(path)) return true;
  }
  return false;
}

function linkedAppRoutes(files: FileNode[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const file of files) {
    if (!/\.(?:tsx|jsx|ts|js)$/.test(file.path)) continue;
    LINKED_APP_ROUTE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LINKED_APP_ROUTE_REGEX.exec(file.content ?? '')) !== null) {
      const slug = match[1];
      if (slug === 'api' || slug.startsWith('_')) continue;
      const sources = out.get(slug) ?? new Set<string>();
      sources.add(file.path);
      out.set(slug, sources);
    }
  }
  return out;
}

function isFallbackGeneratedPath(path: string): boolean {
  return (
    /^src\/components\/Component\d+\.(?:tsx|jsx|ts|js)$/.test(path) ||
    /^src\/generated\d+\.(?:tsx|jsx|ts|js|css|json)$/.test(path)
  );
}

function hasTerm(content: string, term: string): boolean {
  if (term === 'localstorage') return /localStorage/i.test(content);
  return new RegExp(`\\b${term}\\b`, 'i').test(content);
}

function stripLeadingCommentsAndWhitespace(content: string): string {
  let next = content.trimStart();
  let changed = true;
  while (changed) {
    changed = false;
    const lineComment = next.match(/^\/\/[^\n]*(?:\n|$)/);
    if (lineComment) {
      next = next.slice(lineComment[0].length).trimStart();
      changed = true;
      continue;
    }
    const blockComment = next.match(/^\/\*[\s\S]*?\*\//);
    if (blockComment) {
      next = next.slice(blockComment[0].length).trimStart();
      changed = true;
    }
  }
  return next;
}

function hasTopClientDirective(content: string): boolean {
  return /^['"]use client['"];?/.test(stripLeadingCommentsAndWhitespace(content));
}

function hasMisplacedClientDirective(content: string): boolean {
  return /['"]use client['"];?/.test(content) && !hasTopClientDirective(content);
}

function hasLateImportDeclaration(content: string): boolean {
  const lines = content.split(/\r?\n/);
  let seenCode = false;
  let inBlockComment = false;
  let inImportDeclaration = false;

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;

    if (inImportDeclaration) {
      if (trimmed.includes(';')) inImportDeclaration = false;
      continue;
    }

    if (inBlockComment) {
      if (trimmed.includes('*/')) {
        trimmed = trimmed.slice(trimmed.indexOf('*/') + 2).trim();
        inBlockComment = false;
        if (!trimmed) continue;
      } else {
        continue;
      }
    }

    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) {
        inBlockComment = true;
        continue;
      }
      trimmed = trimmed.slice(trimmed.indexOf('*/') + 2).trim();
      if (!trimmed) continue;
    }

    if (trimmed.startsWith('//')) continue;
    if (/^['"]use client['"];?$/.test(trimmed) || /^['"]use server['"];?$/.test(trimmed)) {
      if (seenCode) return true;
      continue;
    }
    if (/^import(?:\s|{|\*)/.test(trimmed)) {
      if (seenCode) return true;
      if (!trimmed.includes(';')) inImportDeclaration = true;
      continue;
    }
    seenCode = true;
  }

  return false;
}

export function runGeneratedQualityAudit(
  files: FileNode[],
  requirements = ''
): GeneratedQualityAudit {
  const flat = flattenTree(files).filter(
    (file) => file.type === 'file' && typeof file.content === 'string'
  );
  const byPath = new Map(flat.map((file) => [file.path, file]));
  const allPaths = new Set(byPath.keys());
  const errors: ParsedError[] = [];
  const findings: string[] = [];
  const usesTypescript = flat.some((file) => /\.(?:ts|tsx)$/.test(file.path));
  const usesAliasImports = flat.some((file) =>
    CODE_EXTENSIONS.has(file.path.split('.').pop()?.toLowerCase() ?? '') &&
    extractImports(file.content ?? '', file.language).some((specifier) =>
      specifier.startsWith('@/')
    )
  );

  const fail = (file: string | undefined, message: string) => {
    errors.push({ source: 'quality', file, message, raw: message });
    findings.push(`x ${message}`);
  };
  const pass = (message: string) => findings.push(`ok ${message}`);

  if (!byPath.has('package.json')) {
    fail(
      'package.json',
      'package.json is required for generated apps. Create a real package.json with scripts for dev/build/start, runtime dependencies, and devDependencies before install/build validation can continue.'
    );
  } else {
    pass('package.json exists');
  }

  const { rootAppFiles, srcAppFiles } = getAppRouterRootFiles(files);
  if (rootAppFiles.length > 0 && srcAppFiles.length > 0) {
    fail(
      'src/app',
      `Mixed App Router roots detected: ${rootAppFiles.length} file(s) under app/ and ${srcAppFiles.length} file(s) under src/app/. Generated Next.js apps must use exactly one App Router root. Normalize to src/app by moving app/layout.tsx, app/page.tsx, and app/globals.css into src/app and deleting the old app/ files before install/build.`
    );
  }

  for (const slug of inferRequestedRouteSlugs(requirements)) {
    const exactPath = routePagePath(slug);
    if (!byPath.has(exactPath)) {
      fail(
        exactPath,
        `The request names route "${slug}", but ${exactPath} does not exist. Preserve requested route names exactly instead of creating a different alias.`
      );
    }
    const firstSegment = slug.split('-')[0];
    const shortAlias = routePagePath(firstSegment);
    if (firstSegment !== slug && byPath.has(shortAlias)) {
      fail(
        shortAlias,
        `Route consistency failure: request uses "${slug}" but duplicate alias ${shortAlias} also exists. Keep one route name and update links/imports to match.`
      );
    }
  }

  for (const [a, b] of DUPLICATE_ROUTE_PAIRS) {
    const aPath = routePagePath(a);
    const bPath = routePagePath(b);
    if (byPath.has(aPath) && byPath.has(bPath)) {
      fail(
        bPath,
        `Duplicate semantic routes detected: ${aPath} and ${bPath}. Merge them into one requested route before build.`
      );
    }
  }

  for (const slug of appRouteSlugs(allPaths)) {
    if (!slug.includes('-')) continue;
    const shortAlias = slug.split('-')[0];
    const shortAliasPath = routePagePath(shortAlias);
    if (byPath.has(shortAliasPath)) {
      fail(
        shortAliasPath,
        `Route consistency failure: hyphenated route "${slug}" exists but duplicate short alias ${shortAliasPath} also exists. Keep one route name and update links/imports to match.`
      );
    }
  }

  for (const duplicate of findDuplicateEffectiveAppRoutes(files)) {
    fail(
      duplicate.paths[0],
      `Duplicate App Router pages resolve to "${duplicate.route}": ${duplicate.paths.join(', ')}. Route group folders like "(dashboard)" do not change the URL, so merge these pages before build.`
    );
  }

  for (const file of flat) {
    if (isFallbackGeneratedPath(file.path)) {
      fail(
        file.path,
        `${file.path} is an unnamed fallback file produced from a code fence without an explicit path. Regenerate this as a domain-named file with a real // path: annotation, or remove it if it is unused.`
      );
    }

    const markerLeak = describePatchMarkerLeak(file.content ?? '');
    if (markerLeak) {
      fail(
        file.path,
        `${file.path} contains leaked SEARCH/REPLACE markers (${markerLeak}). Regenerate or patch the file cleanly before type-check/build.`
      );
    }
  }

  for (const file of flat) {
    if (!/\.(?:tsx|jsx|ts|js)$/.test(file.path)) continue;
    const content = file.content ?? '';
    if (hasMisplacedClientDirective(content)) {
      fail(
        file.path,
        `${file.path} contains a misplaced 'use client' directive. Client directives must be the first statement in a file. For App Router route pages, keep page.tsx as a Server Component and move interactive code into a separate 'use client' child component.`
      );
    } else if (hasLateImportDeclaration(content)) {
      fail(
        file.path,
        `${file.path} contains an import statement after executable code. ES imports must stay at the top of the module. Split pasted client code into its own component file before build.`
      );
    }
  }

  const tsconfig = byPath.get('tsconfig.json');
  if (!tsconfig && (usesTypescript || usesAliasImports)) {
    fail(
      'tsconfig.json',
      'tsconfig.json is required before type-check for generated TypeScript apps or apps using @/ imports. Create it with compilerOptions.baseUrl "." and paths "@/*": ["./src/*"].'
    );
  } else if (tsconfig) {
    const alias = tsconfigAliasIsValid(tsconfig.content ?? '');
    if (!alias.ok) {
      fail(
        'tsconfig.json',
        `${alias.reason} This alias is required before type-check runs so imports like "@/types/task" resolve to src/types/task.ts.`
      );
    } else {
      pass('tsconfig.json baseUrl and @/* path alias are valid');
    }
  }

  for (const route of requiredRoutes(requirements)) {
    if (!route.candidates.some((path) => byPath.has(path))) {
      fail(
        route.candidates[0],
        `The original request requires a ${route.label}, but none of these route files exist: ${route.candidates.join(', ')}. Do not validate a config-only scaffold; create the requested page/component files first.`
      );
    }
  }

  for (const [slug, sources] of linkedAppRoutes(flat)) {
    if (hasAppRoutePage(slug, allPaths)) continue;
    fail(
      routePagePath(slug),
      `Generated navigation links to "/${slug}", but no App Router page exists for that route. Create ${routePagePath(slug)} or remove/update the link in: ${Array.from(sources).join(', ')}.`
    );
  }

  const globals =
    byPath.get('src/app/globals.css') ??
    byPath.get('app/globals.css') ??
    byPath.get('src/styles/globals.css');
  if (globals && !hasTailwindDirectives(globals.content ?? '')) {
    fail(
      globals.path,
      `${globals.path} is missing full Tailwind directives. It must include @tailwind base; @tailwind components; and @tailwind utilities;, not a tiny placeholder stylesheet.`
    );
  }

  const importedTargets = new Set<string>();
  for (const file of flat) {
    const ext = file.path.split('.').pop()?.toLowerCase();
    if (!ext || !CODE_EXTENSIONS.has(ext)) continue;
    for (const specifier of extractImports(file.content ?? '', file.language)) {
      const basePath = candidateBasePath(file.path, specifier);
      if (!basePath) continue;
      const resolved = resolveLocalImport(basePath, allPaths);
      if (resolved) importedTargets.add(resolved);
    }
  }

  for (const path of importedTargets) {
    if (!isLikelyRequiredTarget(path)) continue;
    const file = byPath.get(path);
    if (!file?.content) continue;
    if (looksPlaceholder(file.content)) {
      fail(
        path,
        `${path} is an imported generated file but looks like a placeholder (${file.content.length} chars). Replace it with a functional implementation that satisfies the user request.`
      );
    }
  }

  const requestedTerms = requirementTerms(requirements);
  const historyPage =
    byPath.get('src/components/HistoryPage.tsx') ??
    byPath.get('components/HistoryPage.tsx');
  if (historyPage && requestedTerms.length > 0) {
    const missing = requestedTerms.filter((term) => !hasTerm(historyPage.content ?? '', term));
    if (missing.length > 0) {
      fail(
        historyPage.path,
        `${historyPage.path} does not satisfy the requested HistoryPage behavior. Missing: ${missing.join(', ')}. Implement search, filter, edit, delete, and localStorage wiring when those features are in the user request.`
      );
    }
  }

  const header =
    errors.length === 0
      ? 'Generated quality audit PASSED'
      : `Generated quality audit FAILED - ${errors.length} issue(s) found`;

  return {
    ok: errors.length === 0,
    errors,
    log: [header, ...findings].join('\n'),
  };
}
