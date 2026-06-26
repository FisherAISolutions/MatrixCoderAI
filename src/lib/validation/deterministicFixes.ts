import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';
import { findDuplicateEffectiveAppRoutes } from '@/lib/repo/appRoutes';
import { FALLBACK_GLOBALS_CSS, isCssPath, sanitizeCssContent } from '@/lib/repo/cssSanitizer';
import type { ValidationResult } from './engine';

interface DeterministicUpdate {
  file: FileNode;
  reason: string;
}

interface DeterministicDelete {
  file: FileNode;
  reason: string;
}

interface DeterministicCreate {
  file: FileNode;
  reason: string;
}

export interface DeterministicFixReport {
  mutated: boolean;
  updates: DeterministicUpdate[];
  deletes: DeterministicDelete[];
  creates: DeterministicCreate[];
}

const REACT_IMPORTS = new Set([
  'useCallback',
  'useEffect',
  'useMemo',
  'useRef',
  'useState',
]);

const MISSING_LINKED_ROUTE_REGEX =
  /Generated navigation links to "\/([a-z0-9][a-z0-9-]*)", but no App Router page exists for that route\. Create (src\/app\/[a-z0-9-]+\/page\.tsx)/i;

function addNamedImport(content: string, moduleName: string, symbol: string): string {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namedImport = new RegExp(`import\\s+\\{([^}]+)\\}\\s+from\\s+['"]${escaped}['"];?`);
  const existing = content.match(namedImport);
  if (existing) {
    const names = existing[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (names.includes(symbol)) return content;
    const replacement = `import { ${[...names, symbol].sort().join(', ')} } from '${moduleName}';`;
    return content.replace(namedImport, replacement);
  }

  const directive = content.match(/^(['"]use client['"];?\s*)/);
  if (directive) {
    return content.replace(directive[0], `${directive[0]}\nimport { ${symbol} } from '${moduleName}';\n`);
  }
  return `import { ${symbol} } from '${moduleName}';\n${content}`;
}

function addDefaultImport(content: string, moduleName: string, symbol: string): string {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const defaultImport = new RegExp(`import\\s+${symbol}\\s+from\\s+['"]${escaped}['"];?`);
  if (defaultImport.test(content)) return content;
  const directive = content.match(/^(['"]use client['"];?\s*)/);
  if (directive) {
    return content.replace(directive[0], `${directive[0]}\nimport ${symbol} from '${moduleName}';\n`);
  }
  return `import ${symbol} from '${moduleName}';\n${content}`;
}

function fixMissingSymbol(content: string, symbol: string): { content: string; reason?: string } {
  if (REACT_IMPORTS.has(symbol)) {
    return {
      content: addNamedImport(content, 'react', symbol),
      reason: `added missing React import ${symbol}`,
    };
  }
  if (symbol === 'Link') {
    return {
      content: addDefaultImport(content, 'next/link', 'Link'),
      reason: 'added missing next/link import',
    };
  }
  return { content };
}

function sourceCandidatesForErrorFile(path: string): string[] {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const candidates = [normalized];
  const nextAppRoot = normalized.match(/^\.next\/types\/app\/page\.ts$/);
  if (nextAppRoot) {
    candidates.push('src/app/page.tsx', 'app/page.tsx');
  }
  const nextAppRoute = normalized.match(/^\.next\/types\/app\/(.+)\/page\.ts$/);
  if (nextAppRoute) {
    candidates.push(
      `src/app/${nextAppRoute[1]}/page.tsx`,
      `app/${nextAppRoute[1]}/page.tsx`
    );
  }
  return candidates;
}

function resolveFileForError(
  byPath: Map<string, FileNode>,
  path: string
): FileNode | undefined {
  for (const candidate of sourceCandidatesForErrorFile(path)) {
    const file = byPath.get(candidate);
    if (file) return file;
  }
  return undefined;
}

function wrapPropTypeInPromise(content: string, prop: 'params' | 'searchParams'): string {
  let next = content;
  const objectProp = new RegExp(`(${prop}\\??:\\s*)(?!Promise<)({[\\s\\S]*?})(\\s*[;,])`, 'g');
  next = next.replace(objectProp, (_match, prefix, typeBody, suffix) => {
    return `${prefix}Promise<${typeBody}>${suffix}`;
  });

  const singleLineProp = new RegExp(`(${prop}\\??:\\s*)(?!Promise<)([^;,\\n]+)([;,])`, 'g');
  next = next.replace(singleLineProp, (_match, prefix, typeBody, suffix) => {
    const trimmed = String(typeBody).trim();
    if (!trimmed || trimmed.startsWith('Promise<')) return `${prefix}${typeBody}${suffix}`;
    return `${prefix}Promise<${typeBody}>${suffix}`;
  });
  return next;
}

function awaitPageProp(content: string, prop: 'params' | 'searchParams'): string {
  if (!new RegExp(`\\b${prop}\\b`).test(content)) return content;

  let next = content.replace(
    /export\s+default\s+function\s+([A-Za-z_$][\w$]*)?\s*\(/,
    (_match, name = '') => `export default async function ${name}(`.replace(/\s+\(/, '(')
  );

  const alreadyAsync = /export\s+default\s+async\s+function\s+/.test(next);
  if (!alreadyAsync) return next;

  const functionStart = next.search(/export\s+default\s+async\s+function\s+/);
  const openBrace = next.indexOf('{', functionStart);
  if (openBrace < 0) return next;

  const resolvedName = prop === 'searchParams' ? 'resolvedSearchParams' : 'resolvedParams';
  if (next.includes(`const ${resolvedName} = await ${prop};`)) return next;

  const beforeBody = next.slice(0, openBrace + 1);
  let body = next.slice(openBrace + 1);
  if (!new RegExp(`\\b${prop}\\b`).test(body)) return next;

  body = body
    .replace(new RegExp(`${prop}\\?\\.`, 'g'), `${resolvedName}?.`)
    .replace(new RegExp(`${prop}\\.`, 'g'), `${resolvedName}.`)
    .replace(new RegExp(`${prop}\\[`, 'g'), `${resolvedName}[`);

  return `${beforeBody}\n  const ${resolvedName} = await ${prop};${body}`;
}

function fixNext15PageProps(
  content: string,
  message: string
): { content: string; reason?: string } {
  if (!/PageProps/.test(message) || !/Promise<any>|Promise<unknown>|Promise/.test(message)) {
    return { content };
  }

  let next = content;
  const fixedProps: string[] = [];
  for (const prop of ['searchParams', 'params'] as const) {
    if (!new RegExp(`\\b${prop}\\b`).test(message)) continue;
    const before = next;
    next = wrapPropTypeInPromise(next, prop);
    next = awaitPageProp(next, prop);
    if (next !== before) fixedProps.push(prop);
  }

  if (fixedProps.length === 0 || next === content) return { content };
  return {
    content: next,
    reason: `updated Next.js 15 page props for ${fixedProps.join(', ')}`,
  };
}

function isDirectiveLine(line: string): boolean {
  return /^['"]use (?:client|server)['"];?$/.test(line.trim());
}

function isStaticImportStart(line: string): boolean {
  return /^import(?:\s|['"{*])/.test(line.trim());
}

function normalizeModulePreamble(content: string): { content: string; reason?: string } {
  const lines = content.split(/\r?\n/);
  const directives: string[] = [];
  const imports: string[] = [];
  const body: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isDirectiveLine(line)) {
      if (!directives.includes(trimmed)) directives.push(trimmed.endsWith(';') ? trimmed : `${trimmed};`);
      continue;
    }

    if (isStaticImportStart(line)) {
      const block = [line];
      while (!/;\s*$/.test(lines[i]) && i + 1 < lines.length) {
        i += 1;
        block.push(lines[i]);
      }
      const importBlock = block.join('\n').trimEnd();
      if (!imports.includes(importBlock)) imports.push(importBlock);
      continue;
    }

    body.push(line);
  }

  while (body.length > 0 && body[0].trim() === '') body.shift();

  const preamble = [...directives, ...imports];
  if (preamble.length === 0) return { content };

  const next = `${preamble.join('\n')}${body.length > 0 ? `\n\n${body.join('\n')}` : '\n'}`;
  if (next === content) return { content };

  return {
    content: next,
    reason: 'moved client directive and ES imports to the top of the module',
  };
}

function isGlobalsCssPath(path: string): boolean {
  return /(?:^|\/)globals\.css$/i.test(path);
}

function cssFailureNeedsGlobalsFallback(error: { file?: string; message?: string; raw?: string }): boolean {
  const text = `${error.file ?? ''}\n${error.message ?? ''}\n${error.raw ?? ''}`;
  return (
    /globals\.css/i.test(text) &&
    /css-loader|postcss-loader|Unknown word|Build failed while compiling this module|webpack errors/i.test(text)
  );
}

function updateFile(file: FileNode, content: string): FileNode {
  return {
    ...file,
    content,
    size: content.length,
    lastModified: new Date().toISOString(),
    isNew: false,
  };
}

function routeSlugFromQualityError(error: { file?: string; message?: string }): {
  slug: string;
  path: string;
} | null {
  const messageMatch = error.message?.match(MISSING_LINKED_ROUTE_REGEX);
  if (messageMatch) {
    return {
      slug: messageMatch[1],
      path: messageMatch[2],
    };
  }

  const fileMatch = error.file?.match(/^src\/app\/([a-z0-9][a-z0-9-]*)\/page\.tsx$/i);
  if (
    fileMatch &&
    /Generated navigation links to "\//i.test(error.message ?? '') &&
    /no App Router page exists/i.test(error.message ?? '')
  ) {
    return {
      slug: fileMatch[1],
      path: error.file!,
    };
  }

  return null;
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function identifierFromSlug(slug: string): string {
  const title = titleFromSlug(slug).replace(/[^A-Za-z0-9]/g, '');
  return title ? `${title}Page` : 'GeneratedRoutePage';
}

function createLinkedRoutePage(slug: string, path: string): FileNode {
  const title = titleFromSlug(slug);
  const componentName = identifierFromSlug(slug);
  const content = `// MATRIX_CODER_FALLBACK_ROUTE
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '${title}',
  description: 'Generated ${title} workspace route.',
};

export default function ${componentName}() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto flex max-w-4xl flex-col gap-8">
        <nav className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-2xl shadow-black/20">
          <Link href="/" className="text-sm font-semibold text-cyan-200 transition hover:text-white">
            Back to dashboard
          </Link>
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
            ${title}
          </span>
        </nav>

        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl shadow-black/20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-200">
            Navigation route
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            ${title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            This page keeps the app navigation complete and gives the route a styled, build-safe
            destination while the main experience remains connected from the dashboard.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {['Overview', 'Workflow', 'Next steps'].map((label) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {label}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  Route-ready content area for ${title.toLowerCase()} details and actions.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
`;

  return {
    id: `deterministic-route-${slug}`,
    name: 'page.tsx',
    path,
    parentPath: path.split('/').slice(0, -1).join('/'),
    type: 'file',
    language: 'typescript',
    content,
    size: content.length,
    lastModified: new Date().toISOString(),
    isNew: true,
  };
}

export function applyDeterministicFixes(
  files: FileNode[],
  validation: ValidationResult
): DeterministicFixReport {
  const byPath = new Map(
    flattenTree(files)
      .filter((file) => file.type === 'file' && typeof file.content === 'string')
      .map((file) => [file.path, file])
  );
  const updates = new Map<string, DeterministicUpdate>();
  const deletes = new Map<string, DeterministicDelete>();
  const creates = new Map<string, DeterministicCreate>();

  for (const file of byPath.values()) {
    if (!file.content || !isCssPath(file.path)) continue;
    const sanitized = sanitizeCssContent(file.path, file.content);
    if (sanitized !== file.content) {
      updates.set(file.path, {
        file: updateFile(file, sanitized),
        reason: `sanitized invalid CSS in ${file.path}`,
      });
    }
  }

  const globalsFallbackNeeded = validation.errors.some(cssFailureNeedsGlobalsFallback);
  if (globalsFallbackNeeded) {
    const globals = Array.from(byPath.values()).find((file) => isGlobalsCssPath(file.path));
    if (globals) {
      updates.set(globals.path, {
        file: updateFile(globals, FALLBACK_GLOBALS_CSS),
        reason: `replaced ${globals.path} with safe globals.css fallback after CSS build failure`,
      });
    }
  }

  for (const duplicate of findDuplicateEffectiveAppRoutes(files)) {
    for (const path of duplicate.deletePaths) {
      const file = byPath.get(path);
      if (file) {
        deletes.set(file.path, {
          file,
          reason: `removed duplicate App Router page ${file.path} for route ${duplicate.route}`,
        });
      }
    }
  }

  for (const error of validation.errors) {
    const missingRoute = routeSlugFromQualityError(error);
    if (!missingRoute || byPath.has(missingRoute.path)) continue;
    const file = createLinkedRoutePage(missingRoute.slug, missingRoute.path);
    creates.set(file.path, {
      file,
      reason: `created missing linked App Router route /${missingRoute.slug}`,
    });
    byPath.set(file.path, file);
  }

  for (const error of validation.errors) {
    if (!error.file || !error.message) continue;
    const file = resolveFileForError(byPath, error.file);
    const duplicateAlias =
      error.message.match(/duplicate alias\s+([A-Za-z0-9_./[\]-]+)\s+also exists/i)?.[1] ??
      (/Route consistency failure/i.test(error.message) ? error.file : undefined);
    if (duplicateAlias) {
      const duplicateFile = byPath.get(duplicateAlias);
      if (duplicateFile) {
        deletes.set(duplicateFile.path, {
          file: duplicateFile,
          reason: `removed duplicate route alias ${duplicateFile.path}`,
        });
        continue;
      }
    }

    if (!file?.content) continue;

    if (/misplaced 'use client' directive|import statement after executable code/i.test(error.message)) {
      const normalized = normalizeModulePreamble(file.content);
      if (normalized.reason && normalized.content !== file.content) {
        updates.set(file.path, {
          file: updateFile(file, normalized.content),
          reason: normalized.reason,
        });
        continue;
      }
    }

    const next15PageProps = fixNext15PageProps(file.content, error.message);
    if (next15PageProps.reason && next15PageProps.content !== file.content) {
      updates.set(file.path, {
        file: updateFile(file, next15PageProps.content),
        reason: next15PageProps.reason,
      });
      continue;
    }

    const missingName = error.message.match(/Cannot find name ['"]?([A-Za-z_$][\w$]*)['"]?/)?.[1];
    if (!missingName) continue;

    const fixed = fixMissingSymbol(file.content, missingName);
    if (!fixed.reason || fixed.content === file.content) continue;

    updates.set(file.path, {
      file: updateFile(file, fixed.content),
      reason: fixed.reason,
    });
  }

  return {
    mutated: updates.size > 0 || deletes.size > 0 || creates.size > 0,
    updates: Array.from(updates.values()),
    deletes: Array.from(deletes.values()),
    creates: Array.from(creates.values()),
  };
}
