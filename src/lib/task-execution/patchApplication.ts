import type { FileLanguage, FileNode } from '@/app/chat-workspace/components/types';
import { createFileNodeFromCreate, updateFileNodeFromCreate } from '@/lib/generation/fileApplication';
import { extractFromAssistantResponse } from '@/lib/repo/extractors';
import { flattenTree } from '@/lib/repo/heuristics';
import { applyEditSequence } from '@/lib/repo/patcher';
import type { RepositoryModel } from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';
import { isPathAllowedForTask, isProtectedPath } from './guards';
import type { AppliedTaskChange, RejectedTaskChange } from './types';

function languageForPath(path: string): FileLanguage {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'js' || ext === 'jsx') return 'javascript';
  if (ext === 'css') return 'css';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'mdx') return 'markdown';
  if (ext === 'sql') return 'sql';
  if (ext === 'yml' || ext === 'yaml') return 'yaml';
  if (ext === 'html') return 'html';
  return 'unknown';
}

function replaceInTree(nodes: FileNode[], replacement: FileNode): {
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
      const childResult = replaceInTree(node.children, replacement);
      if (childResult.replaced) replaced = true;
      return { ...node, children: childResult.nodes };
    }
    return node;
  });
  return { nodes: next, replaced };
}

function upsertFile(nodes: FileNode[], file: FileNode): FileNode[] {
  const replaced = replaceInTree(nodes, file);
  if (replaced.replaced) return replaced.nodes;
  return [...nodes, file];
}

export function applyTaskExecutionResponse(options: {
  responseContent: string;
  files: FileNode[];
  task: TaskGraphTask;
  repositoryModel: RepositoryModel;
  now: Date;
}): {
  files: FileNode[];
  extracted: ReturnType<typeof extractFromAssistantResponse>;
  appliedChanges: AppliedTaskChange[];
  rejectedChanges: RejectedTaskChange[];
} {
  const extracted = extractFromAssistantResponse(options.responseContent);
  const existingFiles = flattenTree(options.files).filter((file) => file.type === 'file');
  const byPath = new Map(existingFiles.map((file) => [file.path, file]));
  const protectedPaths = options.repositoryModel.protectedFiles;
  const nowIso = options.now.toISOString();
  let nextFiles = options.files;
  const appliedChanges: AppliedTaskChange[] = [];
  const rejectedChanges: RejectedTaskChange[] = [];

  for (const create of extracted.creates) {
    const scope = isPathAllowedForTask(create.path, options.task);
    if (!scope.ok) {
      rejectedChanges.push({ path: scope.path, reason: scope.reason ?? 'path not allowed' });
      continue;
    }
    if (isProtectedPath(scope.path, protectedPaths)) {
      rejectedChanges.push({ path: scope.path, reason: 'protected files cannot be modified by a task' });
      continue;
    }

    const existing = byPath.get(scope.path);
    const normalizedCreate = {
      ...create,
      path: scope.path,
      name: scope.path.split('/').pop() ?? create.name,
      language: create.language || languageForPath(scope.path),
    };
    if (existing) {
      const updated = updateFileNodeFromCreate(existing, normalizedCreate, nowIso);
      nextFiles = upsertFile(nextFiles, updated);
      byPath.set(scope.path, updated);
      appliedChanges.push({ path: scope.path, kind: 'update', description: 'updated existing file from CREATE fence' });
    } else {
      const created = createFileNodeFromCreate(normalizedCreate, {
        id: `task-file-${scope.path}-${options.now.getTime()}`,
        nowIso,
      });
      nextFiles = upsertFile(nextFiles, created);
      byPath.set(scope.path, created);
      appliedChanges.push({ path: scope.path, kind: 'create', description: 'created file from CREATE fence' });
    }
  }

  const editsByPath = new Map<string, typeof extracted.edits>();
  for (const edit of extracted.edits) {
    const scope = isPathAllowedForTask(edit.path, options.task);
    if (!scope.ok) {
      rejectedChanges.push({ path: scope.path, reason: scope.reason ?? 'path not allowed' });
      continue;
    }
    if (isProtectedPath(scope.path, protectedPaths)) {
      rejectedChanges.push({ path: scope.path, reason: 'protected files cannot be modified by a task' });
      continue;
    }
    editsByPath.set(scope.path, [...(editsByPath.get(scope.path) ?? []), { ...edit, path: scope.path }]);
  }

  for (const [path, edits] of editsByPath) {
    const existing = byPath.get(path);
    if (!existing || typeof existing.content !== 'string') {
      rejectedChanges.push({ path, reason: 'edit target does not exist or is unreadable' });
      continue;
    }
    const result = applyEditSequence(existing.content, edits);
    if (result.failed.length > 0 || result.rejected) {
      rejectedChanges.push({
        path,
        reason:
          result.rejected ??
          result.failed.map((failure) => failure.reason).join('; ') ??
          'patch failed',
      });
      continue;
    }
    const updated: FileNode = {
      ...existing,
      content: result.finalContent,
      lastModified: nowIso,
      size: result.finalContent.length,
      isNew: false,
    };
    nextFiles = upsertFile(nextFiles, updated);
    byPath.set(path, updated);
    appliedChanges.push({
      path,
      kind: result.unchanged ? 'skip' : 'edit',
      description: result.unchanged ? 'edit produced no content change' : 'applied SEARCH/REPLACE edit',
    });
  }

  for (const malformed of extracted.malformedEdits) {
    rejectedChanges.push({
      path: malformed,
      reason: extracted.malformedEditReasons[malformed] ?? 'malformed edit fence',
    });
  }

  return { files: nextFiles, extracted, appliedChanges, rejectedChanges };
}
