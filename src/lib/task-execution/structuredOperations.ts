import type { FileLanguage, FileNode } from '@/app/chat-workspace/components/types';
import { createFileNodeFromCreate } from '@/lib/generation/fileApplication';
import { flattenTree } from '@/lib/repo/heuristics';
import type { RepositoryModel } from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';
import { isPathAllowedForTask, isProtectedPath } from './guards';
import type { AppliedTaskChange, RejectedTaskChange } from './types';

export const TASK_OPERATION_ENVELOPE_VERSION = 1;

export type TaskOperation =
  | { type: 'create'; path: string; content: string }
  | { type: 'patch'; path: string; search: string; replace: string }
  | { type: 'delete'; path: string }
  | {
      type: 'package-json';
      path: 'package.json';
      section: 'dependencies' | 'devDependencies' | 'scripts';
      name: string;
      value: string | null;
    }
  | { type: 'environment'; path: '.env.example'; name: string; value?: string };

export interface TaskOperationEnvelope {
  version: typeof TASK_OPERATION_ENVELOPE_VERSION;
  taskId: string;
  mode: 'full-file-create' | 'repository-aware';
  operations: TaskOperation[];
  summary?: string;
}

export interface ParsedTaskOperationEnvelope {
  envelope?: TaskOperationEnvelope;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenced = trimmed.match(/^```json\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? null;
}

function parseOperation(value: unknown, index: number): {
  operation?: TaskOperation;
  error?: string;
} {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.path !== 'string') {
    return { error: `Operation ${index + 1} must contain string type and path fields.` };
  }
  if (value.type === 'create' && typeof value.content === 'string') {
    return { operation: { type: 'create', path: value.path, content: value.content } };
  }
  if (
    value.type === 'patch' &&
    typeof value.search === 'string' &&
    typeof value.replace === 'string' &&
    value.search.length > 0
  ) {
    return {
      operation: {
        type: 'patch',
        path: value.path,
        search: value.search,
        replace: value.replace,
      },
    };
  }
  if (value.type === 'delete') {
    return { operation: { type: 'delete', path: value.path } };
  }
  if (
    value.type === 'package-json' &&
    value.path === 'package.json' &&
    ['dependencies', 'devDependencies', 'scripts'].includes(String(value.section)) &&
    typeof value.name === 'string' &&
    (typeof value.value === 'string' || value.value === null)
  ) {
    return {
      operation: {
        type: 'package-json',
        path: 'package.json',
        section: value.section as 'dependencies' | 'devDependencies' | 'scripts',
        name: value.name,
        value: value.value,
      },
    };
  }
  if (
    value.type === 'environment' &&
    value.path === '.env.example' &&
    typeof value.name === 'string' &&
    (value.value === undefined || typeof value.value === 'string')
  ) {
    return {
      operation: {
        type: 'environment',
        path: '.env.example',
        name: value.name,
        value: value.value,
      },
    };
  }
  return { error: `Operation ${index + 1} has an unsupported or malformed payload.` };
}

export function parseTaskOperationEnvelope(
  raw: string,
  options: {
    taskId: string;
    mode: TaskOperationEnvelope['mode'];
  }
): ParsedTaskOperationEnvelope {
  const json = unwrapJson(raw);
  if (!json) {
    return { errors: ['Response must be one JSON object or one ```json fenced object with no prose.'] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      errors: [
        `Response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  if (!isRecord(parsed)) return { errors: ['Response envelope must be a JSON object.'] };
  const errors: string[] = [];
  if (parsed.version !== TASK_OPERATION_ENVELOPE_VERSION) {
    errors.push(`Envelope version must be ${TASK_OPERATION_ENVELOPE_VERSION}.`);
  }
  if (parsed.taskId !== options.taskId) errors.push(`Envelope taskId must be ${options.taskId}.`);
  if (parsed.mode !== options.mode) errors.push(`Envelope mode must be ${options.mode}.`);
  if (!Array.isArray(parsed.operations) || parsed.operations.length === 0) {
    errors.push('Envelope must contain at least one operation.');
  }
  const operations: TaskOperation[] = [];
  if (Array.isArray(parsed.operations)) {
    parsed.operations.forEach((value, index) => {
      const result = parseOperation(value, index);
      if (result.operation) operations.push(result.operation);
      if (result.error) errors.push(result.error);
    });
  }
  if (options.mode === 'full-file-create') {
    operations.forEach((operation, index) => {
      if (operation.type !== 'create') {
        errors.push(`Operation ${index + 1} must be a create operation in full-file-create mode.`);
      }
    });
  }
  if (errors.length) return { errors };
  return {
    envelope: {
      version: TASK_OPERATION_ENVELOPE_VERSION,
      taskId: options.taskId,
      mode: options.mode,
      operations,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    },
    errors: [],
  };
}

function languageForPath(path: string): FileLanguage {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'js' || ext === 'jsx') return 'javascript';
  if (ext === 'json') return 'json';
  if (ext === 'css') return 'css';
  if (ext === 'sql') return 'sql';
  if (ext === 'md' || ext === 'mdx') return 'markdown';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  return 'unknown';
}

function replaceFile(nodes: FileNode[], replacement: FileNode): {
  nodes: FileNode[];
  replaced: boolean;
} {
  let replaced = false;
  const next = nodes.map((node) => {
    if (node.type === 'file' && node.path === replacement.path) {
      replaced = true;
      return replacement;
    }
    if (node.children?.length) {
      const children = replaceFile(node.children, replacement);
      if (children.replaced) replaced = true;
      return { ...node, children: children.nodes };
    }
    return node;
  });
  return { nodes: next, replaced };
}

function upsertFile(nodes: FileNode[], file: FileNode): FileNode[] {
  const replaced = replaceFile(nodes, file);
  return replaced.replaced ? replaced.nodes : [...nodes, file];
}

function removeFile(nodes: FileNode[], path: string): {
  nodes: FileNode[];
  removed: boolean;
} {
  let removed = false;
  const next: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file' && node.path === path) {
      removed = true;
      continue;
    }
    if (node.children?.length) {
      const children = removeFile(node.children, path);
      if (children.removed) removed = true;
      next.push({ ...node, children: children.nodes });
    } else {
      next.push(node);
    }
  }
  return { nodes: next, removed };
}

function updateContent(file: FileNode, content: string, nowIso: string): FileNode {
  return {
    ...file,
    content,
    size: content.length,
    lastModified: nowIso,
    isNew: false,
  };
}

function packageContent(
  content: string,
  operation: Extract<TaskOperation, { type: 'package-json' }>
): string {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const section = isRecord(parsed[operation.section])
    ? { ...(parsed[operation.section] as Record<string, unknown>) }
    : {};
  if (operation.value === null) delete section[operation.name];
  else section[operation.name] = operation.value;
  parsed[operation.section] = section;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function environmentContent(
  content: string,
  operation: Extract<TaskOperation, { type: 'environment' }>
): string {
  const line = `${operation.name}=${operation.value ?? ''}`;
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const lines = normalized ? normalized.split('\n') : [];
  const index = lines.findIndex((item) => item.startsWith(`${operation.name}=`));
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  return `${lines.join('\n')}\n`;
}

export function applyStructuredTaskOperations(options: {
  envelope: TaskOperationEnvelope;
  files: FileNode[];
  task: TaskGraphTask;
  repositoryModel: RepositoryModel;
  now: Date;
}): {
  files: FileNode[];
  appliedChanges: AppliedTaskChange[];
  rejectedChanges: RejectedTaskChange[];
} {
  const nowIso = options.now.toISOString();
  const existing = flattenTree(options.files).filter((node) => node.type === 'file');
  const byPath = new Map(existing.map((node) => [node.path, node]));
  let files = options.files;
  const appliedChanges: AppliedTaskChange[] = [];
  const rejectedChanges: RejectedTaskChange[] = [];

  for (const operation of options.envelope.operations) {
    const scope = isPathAllowedForTask(operation.path, options.task);
    if (!scope.ok) {
      rejectedChanges.push({ path: scope.path, reason: scope.reason ?? 'path not allowed' });
      continue;
    }
    if (isProtectedPath(scope.path, options.repositoryModel.protectedFiles)) {
      rejectedChanges.push({ path: scope.path, reason: 'protected files cannot be modified by a task' });
      continue;
    }
    const current = byPath.get(scope.path);
    try {
      if (operation.type === 'create') {
        if (current) {
          rejectedChanges.push({
            path: scope.path,
            reason: 'create cannot overwrite an existing file; use a patch operation',
          });
          continue;
        }
        const created = createFileNodeFromCreate(
          {
            path: scope.path,
            name: scope.path.split('/').pop() ?? scope.path,
            language: languageForPath(scope.path),
            content: operation.content,
          },
          { id: `task-file-${scope.path}-${options.now.getTime()}`, nowIso }
        );
        files = upsertFile(files, created);
        byPath.set(scope.path, created);
        appliedChanges.push({ path: scope.path, kind: 'create', description: 'created complete file' });
        continue;
      }
      if (
        operation.type === 'environment' &&
        (!current || typeof current.content !== 'string')
      ) {
        const content = environmentContent('', operation);
        const created = createFileNodeFromCreate(
          {
            path: scope.path,
            name: '.env.example',
            language: languageForPath(scope.path),
            content,
          },
          {
            id: `task-file-${scope.path}-${options.now.getTime()}`,
            nowIso,
          }
        );
        files = upsertFile(files, created);
        byPath.set(scope.path, created);
        appliedChanges.push({
          path: scope.path,
          kind: 'environment',
          description: `created .env.example with ${operation.name}`,
        });
        continue;
      }
      if (!current || typeof current.content !== 'string') {
        rejectedChanges.push({ path: scope.path, reason: 'operation target does not exist or is unreadable' });
        continue;
      }
      if (operation.type === 'patch') {
        const first = current.content.indexOf(operation.search);
        const second = current.content.indexOf(operation.search, first + 1);
        if (first < 0 || second >= 0) {
          rejectedChanges.push({
            path: scope.path,
            reason: first < 0 ? 'patch search text was not found' : 'patch search text is not unique',
          });
          continue;
        }
        const content = `${current.content.slice(0, first)}${operation.replace}${current.content.slice(first + operation.search.length)}`;
        const updated = updateContent(current, content, nowIso);
        files = upsertFile(files, updated);
        byPath.set(scope.path, updated);
        appliedChanges.push({ path: scope.path, kind: 'edit', description: 'applied exact structured patch' });
      } else if (operation.type === 'delete') {
        const removed = removeFile(files, scope.path);
        files = removed.nodes;
        byPath.delete(scope.path);
        appliedChanges.push({ path: scope.path, kind: 'delete', description: 'deleted scoped file' });
      } else if (operation.type === 'package-json') {
        const updated = updateContent(current, packageContent(current.content, operation), nowIso);
        files = upsertFile(files, updated);
        byPath.set(scope.path, updated);
        appliedChanges.push({ path: scope.path, kind: 'dependency', description: `updated ${operation.section}.${operation.name}` });
      } else {
        const updated = updateContent(current, environmentContent(current.content, operation), nowIso);
        files = upsertFile(files, updated);
        byPath.set(scope.path, updated);
        appliedChanges.push({ path: scope.path, kind: 'environment', description: `updated ${operation.name} in .env.example` });
      }
    } catch (error) {
      rejectedChanges.push({
        path: scope.path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { files, appliedChanges, rejectedChanges };
}
