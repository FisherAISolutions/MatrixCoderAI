import { describe, expect, it } from 'vitest';
import {
  createFileNodeFromCreate,
  planCreateFileApplications,
  updateFileNodeFromCreate,
} from '@/lib/generation/fileApplication';
import type { FileNode } from '@/app/chat-workspace/components/types';
import type { ExtractedCreate } from '@/lib/repo/extractors';

const create = (path: string, content = 'export default function Page() { return null; }'): ExtractedCreate => ({
  path,
  name: path.split('/').pop() ?? 'file.ts',
  language: path.endsWith('.tsx') ? 'tsx' : 'ts',
  content,
});

const existingFile = (path: string, content = 'export const value = 1;'): FileNode => ({
  id: `file-${path}`,
  name: path.split('/').pop() ?? 'file.ts',
  path,
  type: 'file',
  language: 'typescript',
  isNew: false,
  content,
  lastModified: '2026-01-01T00:00:00.000Z',
  size: content.length,
});

describe('generation file application planning', () => {
  it('plans a new file create with a sanitized path', () => {
    const plans = planCreateFileApplications({
      existingFiles: [],
      creates: [create('./src/app/page.tsx')],
    });

    expect(plans).toMatchObject([
      { status: 'create', path: 'src/app/page.tsx', reason: 'new file path' },
    ]);
  });

  it('updates an existing file instead of creating a duplicate path', () => {
    const existing = existingFile('src/lib/data.ts', 'export const value = 1;');
    const plans = planCreateFileApplications({
      existingFiles: [existing],
      creates: [create('src/lib/data.ts', 'export const value = 2;')],
    });

    expect(plans[0]).toMatchObject({
      status: 'update',
      path: 'src/lib/data.ts',
      existing,
    });
  });

  it('skips identical existing files', () => {
    const existing = existingFile('src/lib/data.ts', 'export const value = 1;');
    const plans = planCreateFileApplications({
      existingFiles: [existing],
      creates: [create('src/lib/data.ts', 'export const value = 1;')],
    });

    expect(plans).toMatchObject([
      { status: 'skip', path: 'src/lib/data.ts', reason: 'identical file already exists' },
    ]);
  });

  it('skips duplicate create paths in one assistant response', () => {
    const plans = planCreateFileApplications({
      existingFiles: [],
      creates: [create('src/app/page.tsx'), create('./src/app/page.tsx')],
    });

    expect(plans.map((plan) => plan.status)).toEqual(['create', 'skip']);
    expect(plans[1].reason).toBe('duplicate create path in the same response');
  });

  it('rejects empty content, unsafe paths, and leaked patch markers', () => {
    const plans = planCreateFileApplications({
      existingFiles: [],
      creates: [
        create('src/app/empty.tsx', '   '),
        create('../outside.ts', 'export const value = 1;'),
        create('src/app/leak.tsx', '<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE'),
      ],
    });

    expect(plans.map((plan) => plan.status)).toEqual(['reject', 'reject', 'reject']);
    expect(plans[0].reason).toBe('empty file content is not allowed');
    expect(plans[1].reason).toBe('path failed project path validation');
    expect(plans[2].reason).toContain('SEARCH/REPLACE marker leaked');
  });

  it('creates and updates FileNode snapshots without mutating originals', () => {
    const newNode = createFileNodeFromCreate(create('src/app/page.tsx'), {
      id: 'file-new',
      nowIso: '2026-01-02T00:00:00.000Z',
    });
    const existing = existingFile('src/lib/data.ts', 'old');
    const updated = updateFileNodeFromCreate(
      existing,
      create('src/lib/data.ts', 'new'),
      '2026-01-03T00:00:00.000Z'
    );

    expect(newNode).toMatchObject({ id: 'file-new', path: 'src/app/page.tsx', isNew: true });
    expect(updated).toMatchObject({ id: existing.id, path: existing.path, content: 'new', isNew: false });
    expect(existing.content).toBe('old');
  });
});