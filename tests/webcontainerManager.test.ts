/**
 * Unit tests for the WebContainer manager surface — focused on the
 * NON-WebContainer code paths (pure helpers + types). The real WC
 * boot/spawn flow requires a browser with SharedArrayBuffer and
 * cannot run in node, so we deliberately exercise only the pieces
 * that have meaningful logic outside the WC instance.
 */

import { describe, it, expect } from 'vitest';
import {
  buildFileSystemTree,
  detectWebContainerSupport,
  resolveWebContainerSpawn,
} from '@/lib/webcontainer/manager';
import type { FileNode } from '@/app/chat-workspace/components/types';

function file(path: string, content: string): FileNode {
  return { id: path, name: path.split('/').pop()!, path, type: 'file', content };
}

describe('detectWebContainerSupport', () => {
  it('reports unsupported when running outside a browser (SSR)', () => {
    // We are running in node, so `typeof window === 'undefined'` and
    // the helper must report unsupported with a clear reason.
    const r = detectWebContainerSupport();
    expect(r.supported).toBe(false);
    expect(r.reason).toMatch(/Server-side|SharedArrayBuffer|cross-origin/i);
  });
});

describe('buildFileSystemTree', () => {
  it('produces a nested FileSystemTree from flat FileNodes', () => {
    const tree = buildFileSystemTree([
      file('package.json', '{"name":"demo"}'),
      file('src/app/page.tsx', 'export default function Page() {}'),
      file('src/app/layout.tsx', 'export default function Layout() {}'),
      file('src/lib/foo.ts', 'export const foo = 1;'),
    ]);
    // Root-level package.json present as a file
    expect((tree['package.json'] as { file: { contents: string } }).file.contents).toBe(
      '{"name":"demo"}'
    );
    // Nested src directory present
    const srcDir = (tree['src'] as { directory: Record<string, unknown> }).directory;
    expect(srcDir).toBeDefined();
    const appDir = (srcDir['app'] as { directory: Record<string, unknown> }).directory;
    expect(appDir['page.tsx']).toBeDefined();
    expect(appDir['layout.tsx']).toBeDefined();
    const libDir = (srcDir['lib'] as { directory: Record<string, unknown> }).directory;
    expect(libDir['foo.ts']).toBeDefined();
  });

  it('skips files with non-string content (folders, binaries)', () => {
    const tree = buildFileSystemTree([
      // intentionally malformed — missing content
      { id: 'a', name: 'a.bin', path: 'a.bin', type: 'file' } as FileNode,
      file('b.txt', 'ok'),
    ]);
    expect(tree['a.bin']).toBeUndefined();
    expect(tree['b.txt']).toBeDefined();
  });

  it('handles deep paths without losing intermediate directories', () => {
    const tree = buildFileSystemTree([
      file('a/b/c/d/e.ts', 'export {};'),
    ]);
    const a = (tree['a'] as { directory: Record<string, unknown> }).directory;
    const b = (a['b'] as { directory: Record<string, unknown> }).directory;
    const c = (b['c'] as { directory: Record<string, unknown> }).directory;
    const d = (c['d'] as { directory: Record<string, unknown> }).directory;
    expect(d['e.ts']).toBeDefined();
  });
});

describe('resolveWebContainerSpawn', () => {
  it('routes package-manager shims through jsh', () => {
    expect(resolveWebContainerSpawn('npm', ['install', '--no-audit'])).toEqual({
      command: 'jsh',
      args: ['-c', 'npm install --no-audit'],
    });
    expect(resolveWebContainerSpawn('npx', ['--yes', 'tsc', '--noEmit'])).toEqual({
      command: 'jsh',
      args: ['-c', 'npx --yes tsc --noEmit'],
    });
  });

  it('preserves direct commands and already-shell-routed commands', () => {
    expect(resolveWebContainerSpawn('ls', ['-la'])).toEqual({
      command: 'ls',
      args: ['-la'],
    });
    expect(resolveWebContainerSpawn('jsh', ['-c', 'npm install && npm run dev'])).toEqual({
      command: 'jsh',
      args: ['-c', 'npm install && npm run dev'],
    });
  });
});
