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
const SAME_PAGE_ANCHOR_LINK_REGEX = /href\s*=\s*["'`]#[^"'`]+["'`]/i;
const COMPUTED_LABEL_ROUTE_HREF_REGEX =
  /href\s*=\s*{[\s\S]{0,240}toLowerCase\s*\(\s*\)[\s\S]{0,240}}/i;
const NAV_LABEL_ARRAY_REGEX =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[([\s\S]*?)\]\s*;?/gi;
const NAV_LABEL_ARRAY_NAME_REGEX = /(?:navigation|nav|routes?|links?|items?|tabs?|menu)/i;
const STRING_LITERAL_REGEX = /["'`]([A-Za-z][A-Za-z0-9 &/_-]{0,48})["'`]/g;
const DARK_THEME_CLASS_REGEX =
  /\b(?:bg|from|via|to)-(?:slate|gray|zinc|neutral|stone)-(?:900|950)\b|\b(?:bg|from|via|to)-black\b|\btext-white\b/gi;
const STRONG_DARK_THEME_CLASS_REGEX =
  /\b(?:bg|from|via|to)-(?:slate|gray|zinc|neutral|stone)-(?:900|950)\b|\b(?:bg|from|via|to)-black\b/i;
const LIGHT_THEME_CLASS_REGEX =
  /\b(?:bg-(?:white|slate-50|gray-50|zinc-50|neutral-50|stone-50)|text-(?:slate|gray|zinc|neutral|stone)-950)\b/i;
const LARGE_LAYOUT_CLASS_REGEX =
  /\b(?:min-h-screen|h-screen|min-h-\[[^\]]+\]|py-(?:1[2-9]|[2-9]\d)|pt-(?:1[2-9]|[2-9]\d)|pb-(?:1[2-9]|[2-9]\d))\b/i;
const JSX_CLASS_ATTRIBUTE_REGEX =
  /<(main|section|div)\b[\s\S]{0,300}?className\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|{\s*`([^`]*)`\s*})/gi;
const FALLBACK_ROUTE_MARKER = 'MATRIX_CODER_FALLBACK_ROUTE';
const IMPORTANT_LINKED_ROUTE_SLUGS = new Set([
  'dashboard',
  'progress',
  'goals',
  'transactions',
  'budgets',
  'expenses',
  'reports',
  'settings',
  'contacts',
  'companies',
  'tasks',
  'pipeline',
  'workouts',
  'nutrition',
  'plans',
  'timer',
  'calories',
  'items',
  'suppliers',
  'stock',
  'boards',
  'backlog',
  'team',
  'calendar',
  'appointments',
  'clients',
  'metrics',
  'users',
  'habits',
  'today',
  'stats',
  'products',
  'orders',
  'customers',
  'promotions',
]);

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
  return Boolean(appRoutePagePathForSlug(slug, paths));
}

function appRoutePagePathForSlug(slug: string, paths: Set<string>): string | null {
  const slugPattern = escapeRegExp(slug);
  const routePattern = new RegExp(
    `^(?:src/)?app/(?:\\([^/]+\\)/)*${slugPattern}/page\\.(?:tsx|jsx|ts|js)$`
  );
  for (const path of paths) {
    if (routePattern.test(path)) return path;
  }
  return null;
}

function linkedAppRoutes(files: FileNode[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const file of files) {
    if (!/\.(?:tsx|jsx|ts|js)$/.test(file.path)) continue;
    for (const slug of linkedAppRouteSlugsInContent(file.content ?? '')) {
      const sources = out.get(slug) ?? new Set<string>();
      sources.add(file.path);
      out.set(slug, sources);
    }
  }
  return out;
}

function labelToRouteSlug(label: string): string | null {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized || ['home', 'overview', 'root', 'landing'].includes(normalized)) {
    return null;
  }
  return normalized;
}

function computedLabelRouteSlugs(content: string): Set<string> {
  const slugs = new Set<string>();
  if (!COMPUTED_LABEL_ROUTE_HREF_REGEX.test(content)) return slugs;

  NAV_LABEL_ARRAY_REGEX.lastIndex = 0;
  let arrayMatch: RegExpExecArray | null;
  while ((arrayMatch = NAV_LABEL_ARRAY_REGEX.exec(content)) !== null) {
    const arrayName = arrayMatch[1];
    const arrayBody = arrayMatch[2];
    if (!NAV_LABEL_ARRAY_NAME_REGEX.test(arrayName)) continue;
    if (/[{}]/.test(arrayBody)) continue;

    STRING_LITERAL_REGEX.lastIndex = 0;
    let labelMatch: RegExpExecArray | null;
    while ((labelMatch = STRING_LITERAL_REGEX.exec(arrayBody)) !== null) {
      const slug = labelToRouteSlug(labelMatch[1]);
      if (slug) slugs.add(slug);
    }
  }

  return slugs;
}

function linkedAppRouteSlugsInContent(content: string): Set<string> {
  const slugs = new Set<string>();
  LINKED_APP_ROUTE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINKED_APP_ROUTE_REGEX.exec(content)) !== null) {
    const slug = match[1];
    if (slug === 'api' || slug.startsWith('_')) continue;
    slugs.add(slug);
  }
  for (const slug of computedLabelRouteSlugs(content)) {
    if (slug === 'api' || slug.startsWith('_')) continue;
    slugs.add(slug);
  }
  return slugs;
}

function rootAppPage(filesByPath: Map<string, FileNode>): FileNode | undefined {
  return filesByPath.get('src/app/page.tsx') ?? filesByPath.get('app/page.tsx');
}

function hasSamePageAnchorLinks(content: string): boolean {
  return SAME_PAGE_ANCHOR_LINK_REGEX.test(content);
}

function looksDarkThemedApp(homePage: FileNode | undefined, globals: FileNode | undefined): boolean {
  const content = `${homePage?.content ?? ''}\n${globals?.content ?? ''}`;
  if (STRONG_DARK_THEME_CLASS_REGEX.test(content)) return true;

  DARK_THEME_CLASS_REGEX.lastIndex = 0;
  const darkSignals = content.match(DARK_THEME_CLASS_REGEX) ?? [];
  return darkSignals.length >= 3;
}

function isGeneratedUiSurface(path: string): boolean {
  return (
    /^src\/app\/.+\.(?:tsx|jsx)$/.test(path) ||
    /^src\/components\/.+\.(?:tsx|jsx)$/.test(path)
  );
}

function isAppRoutePage(path: string): boolean {
  return /^(?:src\/)?app\/(?:.*\/)?page\.(?:tsx|jsx|ts|js)$/.test(path);
}

function hasLargeLightThemeSurface(content: string): boolean {
  JSX_CLASS_ATTRIBUTE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JSX_CLASS_ATTRIBUTE_REGEX.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    const className = match.slice(2).find(Boolean) ?? '';
    if (!LIGHT_THEME_CLASS_REGEX.test(className)) continue;
    if (tagName === 'main') return true;
    if (LARGE_LAYOUT_CLASS_REGEX.test(className)) return true;
  }
  return false;
}

function isFallbackGeneratedPath(path: string): boolean {
  return (
    /^src\/components\/Component\d+\.(?:tsx|jsx|ts|js)$/.test(path) ||
    /^src\/generated\d+\.(?:tsx|jsx|ts|js|css|json)$/.test(path)
  );
}

function isDeterministicFallbackRoute(file: FileNode | undefined): boolean {
  return Boolean(file?.content?.includes(FALLBACK_ROUTE_MARKER));
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
  const requestedRouteSlugs = inferRequestedRouteSlugs(requirements);
  const linkedRoutes = linkedAppRoutes(flat);

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

  for (const slug of requestedRouteSlugs) {
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
    if (isAppRoutePage(file.path) && hasTopClientDirective(content)) {
      fail(
        file.path,
        `${file.path} is a Client Component route page. App Router route pages must be Server Components; move hooks, state, forms, effects, localStorage, browser APIs, and event handlers into a separate 'use client' child component and render that child from the page.`
      );
    } else if (hasMisplacedClientDirective(content)) {
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

  for (const [slug, sources] of linkedRoutes) {
    if (hasAppRoutePage(slug, allPaths)) continue;
    fail(
      routePagePath(slug),
      `Generated navigation links to "/${slug}", but no App Router page exists for that route. Create ${routePagePath(slug)} or remove/update the link in: ${Array.from(sources).join(', ')}.`
    );
  }

  const homePage = rootAppPage(byPath);
  if (homePage) {
    const homeLinkedRoutes = linkedAppRouteSlugsInContent(homePage.content ?? '');
    const homeHasNavigationLinks =
      homeLinkedRoutes.size > 0 || hasSamePageAnchorLinks(homePage.content ?? '');
    if (homeHasNavigationLinks) {
      const existingPrimaryRoutes = new Set<string>();
      for (const slug of appRouteSlugs(allPaths)) {
        if (requestedRouteSlugs.includes(slug) || IMPORTANT_LINKED_ROUTE_SLUGS.has(slug)) {
          existingPrimaryRoutes.add(slug);
        }
      }

      for (const slug of existingPrimaryRoutes) {
        if (homeLinkedRoutes.has(slug)) continue;
        const routePath = appRoutePagePathForSlug(slug, allPaths) ?? routePagePath(slug);
        fail(
          homePage.path,
          `${homePage.path} does not link to existing primary route /${slug} even though ${routePath} exists. Same-page anchors such as #features are allowed for landing sections, but they must not replace App Router navigation to /${slug}. Add a real route link to /${slug} from the home page navigation or primary calls-to-action.`
        );
      }
    }
  }

  const primaryRouteSlugs = new Set(requestedRouteSlugs);
  for (const slug of linkedRoutes.keys()) {
    if (IMPORTANT_LINKED_ROUTE_SLUGS.has(slug)) primaryRouteSlugs.add(slug);
  }

  for (const slug of primaryRouteSlugs) {
    const path = appRoutePagePathForSlug(slug, allPaths);
    if (!path) continue;
    const routeFile = byPath.get(path);
    if (!isDeterministicFallbackRoute(routeFile)) continue;
    fail(
      path,
      `Primary route /${slug} is only a deterministic fallback page. Generate a real app screen for this route only; do not regenerate the whole app.`
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

  if (looksDarkThemedApp(homePage, globals)) {
    for (const file of flat) {
      if (!isGeneratedUiSurface(file.path)) continue;
      if (!hasLargeLightThemeSurface(file.content ?? '')) continue;
      fail(
        file.path,
        `Visual consistency issue: ${file.path} uses a large light section inside a dark-themed app. Keep primary pages visually consistent with the app theme.`
      );
    }
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
