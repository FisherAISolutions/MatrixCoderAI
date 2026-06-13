/**
 * package.json edit helpers — format-preserving where possible.
 *
 * Strategy:
 *   - Parse the current package.json. Track the indentation it uses
 *     (defaulting to 2 spaces) and whether it ends with a newline so
 *     we can re-emit a byte-identical-when-unchanged file.
 *   - Add new entries by mutating the parsed object and re-stringifying
 *     with the detected indentation. This won't preserve property
 *     ORDER perfectly, but JSON.stringify on a Node object is stable
 *     across V8 versions when keys are inserted-order, which is what
 *     we need.
 *   - Never reorder existing keys: we merge new deps INTO the existing
 *     dependencies/devDependencies maps (or create them at the end if
 *     missing).
 *
 * Why not a real CST-preserving parser (e.g. `jsonc-parser`)?
 *   - package.json files in JS projects are pure JSON, never JSONC.
 *   - We don't need to preserve comments — there are none.
 *   - Adding a parser dep just for indentation would be heavier than
 *     this 60-line helper.
 */

import type { FileNode } from '@/app/chat-workspace/components/types';

export interface PackageJsonShape {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface ParsedPackageJson {
  shape: PackageJsonShape;
  indent: number | string;
  hasTrailingNewline: boolean;
  raw: string;
}

/**
 * Detect the indentation used by an existing JSON file by looking at
 * the first indented line. Returns the number of leading spaces, or a
 * tab character if the file uses tabs. Defaults to 2.
 */
function detectIndent(raw: string): number | string {
  const lines = raw.split('\n');
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line[0] === '{' || line[0] === '}') continue;
    const match = line.match(/^([\t ]+)/);
    if (!match) continue;
    const lead = match[1];
    if (lead.startsWith('\t')) return '\t';
    return lead.length || 2;
  }
  return 2;
}

export function parsePackageJson(raw: string): ParsedPackageJson | null {
  try {
    const shape = JSON.parse(raw) as PackageJsonShape;
    return {
      shape,
      indent: detectIndent(raw),
      hasTrailingNewline: raw.endsWith('\n'),
      raw,
    };
  } catch {
    return null;
  }
}

export function stringifyPackageJson(parsed: ParsedPackageJson): string {
  const body = JSON.stringify(parsed.shape, null, parsed.indent);
  return parsed.hasTrailingNewline ? `${body}\n` : body;
}

export interface AddDepResult {
  changed: boolean;
  added: Array<{ name: string; version: string; section: 'dependencies' | 'devDependencies' }>;
  skipped: Array<{ name: string; reason: string }>;
}

/**
 * Add one or more entries to package.json. Existing entries are NEVER
 * overwritten (idempotent on repeat calls), and the function reports
 * what it actually changed so the caller can surface a chat message.
 */
export function addDependencies(
  parsed: ParsedPackageJson,
  entries: Array<{ name: string; version: string; devDeps?: boolean }>
): AddDepResult {
  const result: AddDepResult = {
    changed: false,
    added: [],
    skipped: [],
  };

  const shape = parsed.shape;
  if (!shape.dependencies) shape.dependencies = {};
  if (!shape.devDependencies) shape.devDependencies = {};

  for (const entry of entries) {
    const targetKey: 'dependencies' | 'devDependencies' = entry.devDeps
      ? 'devDependencies'
      : 'dependencies';
    const target = shape[targetKey]!;

    // Already present anywhere in deps / devDeps / peerDeps → skip.
    if (
      (shape.dependencies && entry.name in shape.dependencies) ||
      (shape.devDependencies && entry.name in shape.devDependencies) ||
      (shape.peerDependencies && entry.name in shape.peerDependencies)
    ) {
      result.skipped.push({ name: entry.name, reason: 'already-present' });
      continue;
    }

    target[entry.name] = entry.version;
    result.added.push({
      name: entry.name,
      version: entry.version,
      section: targetKey,
    });
    result.changed = true;
  }

  // Clean up the empty objects we may have created.
  if (shape.dependencies && Object.keys(shape.dependencies).length === 0) {
    delete shape.dependencies;
  }
  if (shape.devDependencies && Object.keys(shape.devDependencies).length === 0) {
    delete shape.devDependencies;
  }

  return result;
}

/** Locate the package.json FileNode in a CodePilot tree. */
export function findPackageJsonNode(files: FileNode[]): FileNode | null {
  const flat: FileNode[] = [];
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === 'file') flat.push(n);
      if (n.type === 'folder' && n.children) walk(n.children);
    }
  };
  walk(files);
  // Prefer ROOT package.json — never grab one nested inside node_modules
  // or a sub-package.
  const root = flat.find((f) => f.path === 'package.json');
  if (root) return root;
  // Fallback: top-level package.json under src/ or similar edge cases.
  return flat.find((f) => f.name === 'package.json') ?? null;
}
