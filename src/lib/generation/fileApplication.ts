import type { FileNode, FileLanguage } from '@/app/chat-workspace/components/types';
import type { ExtractedCreate } from '@/lib/repo/extractors';
import { sanitizeProjectPath } from '@/lib/repo/extractors';
import { describePatchMarkerLeak } from '@/lib/repo/patchMarkers';

export type CreateFileApplicationStatus = 'create' | 'update' | 'skip' | 'reject';

export interface PlannedCreateFileApplication {
  status: CreateFileApplicationStatus;
  path: string;
  create: ExtractedCreate;
  existing?: FileNode;
  reason: string;
}

export interface PlanCreateFileApplicationsOptions {
  existingFiles: Iterable<FileNode>;
  creates: ExtractedCreate[];
}

function normalizeContent(content: string | undefined): string {
  return content ?? '';
}

function isEffectivelyEmpty(content: string): boolean {
  return content.trim().length === 0;
}

export function planCreateFileApplications({
  existingFiles,
  creates,
}: PlanCreateFileApplicationsOptions): PlannedCreateFileApplication[] {
  const existingByPath = new Map<string, FileNode>();
  for (const file of existingFiles) {
    if (file.type === 'file') existingByPath.set(file.path, file);
  }

  const seenInResponse = new Set<string>();
  const out: PlannedCreateFileApplication[] = [];

  for (const create of creates) {
    const cleanPath = sanitizeProjectPath(create.path);
    const path = cleanPath ?? create.path;

    if (!cleanPath) {
      out.push({
        status: 'reject',
        path,
        create,
        reason: 'path failed project path validation',
      });
      continue;
    }

    if (seenInResponse.has(cleanPath)) {
      out.push({
        status: 'skip',
        path: cleanPath,
        create,
        reason: 'duplicate create path in the same response',
      });
      continue;
    }
    seenInResponse.add(cleanPath);

    if (isEffectivelyEmpty(create.content)) {
      out.push({
        status: 'reject',
        path: cleanPath,
        create,
        reason: 'empty file content is not allowed',
      });
      continue;
    }

    const markerLeak = describePatchMarkerLeak(create.content);
    if (markerLeak) {
      out.push({
        status: 'reject',
        path: cleanPath,
        create,
        reason: markerLeak,
      });
      continue;
    }

    const existing = existingByPath.get(cleanPath);
    if (!existing) {
      out.push({
        status: 'create',
        path: cleanPath,
        create: { ...create, path: cleanPath },
        reason: 'new file path',
      });
      continue;
    }

    if (normalizeContent(existing.content) === create.content) {
      out.push({
        status: 'skip',
        path: cleanPath,
        create: { ...create, path: cleanPath },
        existing,
        reason: 'identical file already exists',
      });
      continue;
    }

    out.push({
      status: 'update',
      path: cleanPath,
      create: { ...create, path: cleanPath },
      existing,
      reason: 'full-file create targets an existing file with new content',
    });
  }

  return out;
}

export function createFileNodeFromCreate(
  create: ExtractedCreate,
  options: { id: string; nowIso: string }
): FileNode {
  return {
    id: options.id,
    name: create.name,
    path: create.path,
    type: 'file',
    language: create.language as FileLanguage,
    isNew: true,
    content: create.content,
    lastModified: options.nowIso,
    size: create.content.length,
  };
}

export function updateFileNodeFromCreate(
  existing: FileNode,
  create: ExtractedCreate,
  nowIso: string
): FileNode {
  return {
    ...existing,
    name: existing.name || create.name,
    language: create.language as FileLanguage,
    isNew: false,
    content: create.content,
    lastModified: nowIso,
    size: create.content.length,
  };
}
