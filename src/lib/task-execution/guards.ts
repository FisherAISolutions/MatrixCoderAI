import { normalizeRepositoryPath, repositoryPathMatchesScope } from '@/lib/repository-model';
import { sanitizeProjectPath } from '@/lib/repo/extractors';
import type { TaskGraphTask } from '@/lib/task-graph';

export interface FileScopeDecision {
  ok: boolean;
  path: string;
  reason?: string;
}

export function validateTaskMutationPath(rawPath: string): FileScopeDecision {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return { ok: false, path: rawPath, reason: 'empty path' };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^[a-zA-Z]:[/\\]/.test(trimmed)) {
    return { ok: false, path: trimmed, reason: 'absolute paths and URLs are not allowed' };
  }
  if (trimmed.replace(/\\/g, '/').split('/').includes('..')) {
    return { ok: false, path: trimmed, reason: 'path traversal is not allowed' };
  }
  const sanitized = sanitizeProjectPath(trimmed);
  if (!sanitized) {
    return { ok: false, path: trimmed, reason: 'path failed project path validation' };
  }
  return { ok: true, path: normalizeRepositoryPath(sanitized) };
}

export function isPathAllowedForTask(
  path: string,
  task: TaskGraphTask
): FileScopeDecision {
  const safe = validateTaskMutationPath(path);
  if (!safe.ok) return safe;

  const normalizedExpected = new Set(
    task.expectedFiles.map((expected) => normalizeRepositoryPath(expected))
  );
  if (normalizedExpected.has(safe.path)) {
    return { ok: true, path: safe.path };
  }

  const scopes = task.allowedFileScope.map((scope) => normalizeRepositoryPath(scope));
  if (scopes.some((scope) => repositoryPathMatchesScope(safe.path, scope))) {
    return { ok: true, path: safe.path };
  }

  return {
    ok: false,
    path: safe.path,
    reason: `path is outside this task's allowed file scope`,
  };
}

export function isProtectedPath(path: string, protectedPaths: string[]): boolean {
  const normalized = normalizeRepositoryPath(path);
  return protectedPaths
    .map((protectedPath) => normalizeRepositoryPath(protectedPath))
    .includes(normalized);
}

