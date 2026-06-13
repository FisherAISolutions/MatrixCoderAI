import type { FileNode } from '@/app/chat-workspace/components/types';
import { extractImports, flattenTree } from '@/lib/repo/heuristics';
import type { ParsedError } from './errorParser';

const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']);
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

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
  const lower = compact.toLowerCase();
  const hasImplementationSignals =
    /\b(useState|useEffect|useMemo|useReducer|useRef)\b/.test(compact) ||
    /\b(onClick|onChange|onSubmit|onInput)\b/.test(compact) ||
    /\b(localStorage|fetch|map\(|filter\(|reduce\(|sort\()\b/.test(compact) ||
    /\binterface\s+\w+|type\s+\w+\s*=|const\s+\w+\s*=/.test(compact) ||
    /\bexport\s+(?:async\s+)?function\b/.test(compact);

  if (
    /return\s+(?:null|<>\s*<\/>|<div>\s*(?:todo|placeholder|stub|coming soon)?\s*<\/div>)/i.test(compact)
  ) {
    return true;
  }

  if (/\b(todo:\s*implement|stub only|placeholder component|coming soon)\b/i.test(compact)) {
    return true;
  }

  if (compact.length < 180 && !hasImplementationSignals) {
    return true;
  }

  if (lower.includes('placeholder') && compact.length < 260 && !hasImplementationSignals) {
    return true;
  }

  return false;
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

function requiredRoutes(requirements: string): Array<{ label: string; candidates: string[] }> {
  const lower = requirements.toLowerCase();
  const routes: Array<{ label: string; candidates: string[] }> = [];
  if (/\bdashboard\b/.test(lower)) {
    routes.push({
      label: 'dashboard page',
      candidates: ['src/app/dashboard/page.tsx', 'app/dashboard/page.tsx'],
    });
  }
  if (/\badd\b|\bentry\b|\bentries\b/.test(lower)) {
    routes.push({
      label: 'add entry page',
      candidates: ['src/app/add/page.tsx', 'app/add/page.tsx', 'src/app/add-entry/page.tsx', 'app/add-entry/page.tsx'],
    });
  }
  if (/\bhistory\b|\bedit\b|\bdelete\b/.test(lower)) {
    routes.push({
      label: 'history page',
      candidates: ['src/app/history/page.tsx', 'app/history/page.tsx'],
    });
  }
  if (/\b3\s+pages\b|\bthree\s+pages\b/.test(lower) && routes.length < 3) {
    for (const route of [
      {
        label: 'dashboard page',
        candidates: ['src/app/dashboard/page.tsx', 'app/dashboard/page.tsx'],
      },
      {
        label: 'add entry page',
        candidates: ['src/app/add/page.tsx', 'app/add/page.tsx', 'src/app/add-entry/page.tsx', 'app/add-entry/page.tsx'],
      },
      {
        label: 'history page',
        candidates: ['src/app/history/page.tsx', 'app/history/page.tsx'],
      },
    ]) {
      if (!routes.some((existing) => existing.label === route.label)) routes.push(route);
    }
  }
  return routes;
}

function hasTerm(content: string, term: string): boolean {
  if (term === 'localstorage') return /localStorage/i.test(content);
  return new RegExp(`\\b${term}\\b`, 'i').test(content);
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
