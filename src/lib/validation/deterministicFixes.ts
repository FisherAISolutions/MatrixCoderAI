import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';
import { findDuplicateEffectiveAppRoutes } from '@/lib/repo/appRoutes';
import type { ValidationResult } from './engine';

interface DeterministicUpdate {
  file: FileNode;
  reason: string;
}

interface DeterministicDelete {
  file: FileNode;
  reason: string;
}

export interface DeterministicFixReport {
  mutated: boolean;
  updates: DeterministicUpdate[];
  deletes: DeterministicDelete[];
}

const REACT_IMPORTS = new Set([
  'useCallback',
  'useEffect',
  'useMemo',
  'useRef',
  'useState',
]);

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

    const next15PageProps = fixNext15PageProps(file.content, error.message);
    if (next15PageProps.reason && next15PageProps.content !== file.content) {
      updates.set(file.path, {
        file: {
          ...file,
          content: next15PageProps.content,
          size: next15PageProps.content.length,
          lastModified: new Date().toISOString(),
          isNew: false,
        },
        reason: next15PageProps.reason,
      });
      continue;
    }

    const missingName = error.message.match(/Cannot find name ['"]?([A-Za-z_$][\w$]*)['"]?/)?.[1];
    if (!missingName) continue;

    const fixed = fixMissingSymbol(file.content, missingName);
    if (!fixed.reason || fixed.content === file.content) continue;

    updates.set(file.path, {
      file: {
        ...file,
        content: fixed.content,
        size: fixed.content.length,
        lastModified: new Date().toISOString(),
        isNew: false,
      },
      reason: fixed.reason,
    });
  }

  return {
    mutated: updates.size > 0 || deletes.size > 0,
    updates: Array.from(updates.values()),
    deletes: Array.from(deletes.values()),
  };
}
