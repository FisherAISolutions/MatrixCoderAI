import { describe, expect, it } from 'vitest';
import type {
  ChatMessage,
  FileNode,
} from '@/app/chat-workspace/components/types';
import { buildDeploymentWorkspaceSnapshot } from '@/lib/deployment/workspaceStatus';

function file(path: string, content = ''): FileNode {
  const name = path.split('/').pop() ?? path;
  return {
    id: path,
    name,
    path,
    type: 'file',
    content,
    size: content.length,
    lastModified: '2026-06-28T12:00:00.000Z',
  };
}

function message(content: string, timestamp = '2026-06-28T12:01:00.000Z'): ChatMessage {
  return {
    id: content.slice(0, 12),
    role: 'assistant',
    content,
    timestamp,
  };
}

describe('deployment workspace status snapshot', () => {
  it('summarizes a generated Next.js workspace with passing validation', () => {
    const snapshot = buildDeploymentWorkspaceSnapshot({
      sessionId: 'workspace-1',
      projectName: 'Fitness Tracker',
      files: [
        file('package.json', '{"dependencies":{"next":"15.1.11"}}'),
        file('src/app/page.tsx', 'export default function Page() { return null; }'),
        file('src/app/workouts/page.tsx', 'export default function Page() { return null; }'),
      ],
      messages: [
        message('Validation passed - imports, build, runtime smoke, and style audit are green.'),
        message('Preview Connected OK'),
      ],
    });

    expect(snapshot.projectName).toBe('Fitness Tracker');
    expect(snapshot.framework).toBe('Next.js');
    expect(snapshot.fileCount).toBe(3);
    expect(snapshot.routeCount).toBe(2);
    expect(snapshot.exportFiles.map((exportFile) => exportFile.path)).toEqual([
      'package.json',
      'src/app/page.tsx',
      'src/app/workouts/page.tsx',
    ]);
    expect(snapshot.generationStatus).toBe('passed');
    expect(snapshot.validationStatus).toBe('passed');
    expect(snapshot.buildStatus).toBe('passed');
    expect(snapshot.previewStatus).toBe('passed');
    expect(snapshot.checklist.readyForDeployment).toBe('passed');
  });

  it('keeps failed statuses when the latest validation message failed', () => {
    const snapshot = buildDeploymentWorkspaceSnapshot({
      projectName: 'Broken App',
      files: [
        file('package.json', '{"dependencies":{"next":"15.1.11"}}'),
        file('src/app/page.tsx', 'export default function Page() { return null; }'),
      ],
      messages: [message('Failed at Build: next build exited with code 1')],
    });

    expect(snapshot.generationStatus).toBe('passed');
    expect(snapshot.validationStatus).toBe('failed');
    expect(snapshot.buildStatus).toBe('failed');
    expect(snapshot.checklist.readyForDeployment).toBe('failed');
  });

  it('does not assume success when no generated project is available', () => {
    const snapshot = buildDeploymentWorkspaceSnapshot({
      projectName: 'Empty Workspace',
      files: [],
      messages: [],
    });

    expect(snapshot.framework).toBe('Unknown');
    expect(snapshot.generationStatus).toBe('pending');
    expect(snapshot.validationStatus).toBe('pending');
    expect(snapshot.previewStatus).toBe('pending');
    expect(snapshot.checklist.readyForDeployment).toBe('pending');
  });

  it('marks generation as running while a project is still being generated', () => {
    const snapshot = buildDeploymentWorkspaceSnapshot({
      files: [],
      messages: [],
      isGenerating: true,
    });

    expect(snapshot.generationStatus).toBe('running');
    expect(snapshot.validationStatus).toBe('running');
    expect(snapshot.checklist.readyForDeployment).toBe('running');
  });
});
