import { describe, expect, it } from 'vitest';
import {
  findAliasImportsMissingFromMountedFs,
  looksLikeTscHelpOutput,
} from '@/lib/validation/engine';
import type { FileNode } from '@/app/chat-workspace/components/types';

function file(path: string, content: string): FileNode {
  return {
    id: path,
    name: path.split('/').pop()!,
    path,
    type: 'file',
    content,
  };
}

describe('type-check preflight', () => {
  it('resolves @/types/task when the target file is mounted', () => {
    const files = [
      file(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@/*': ['./src/*'] },
          },
        })
      ),
      file('src/types/task.ts', 'export interface Task { id: string }'),
      file(
        'src/app/page.tsx',
        `import type { Task } from '@/types/task';\nexport default function Page({ task }: { task: Task }) { return <main>{task.id}</main>; }`
      ),
    ];

    expect(
      findAliasImportsMissingFromMountedFs(files, files.map((item) => item.path))
    ).toEqual([]);
  });

  it('reports mounted filesystem alias misses before tsc reports module-not-found', () => {
    const files = [
      file('src/types/task.ts', 'export interface Task { id: string }'),
      file(
        'src/app/page.tsx',
        `import type { Task } from '@/types/task';\nexport default function Page(){ return null; }`
      ),
    ];

    expect(findAliasImportsMissingFromMountedFs(files, ['src/app/page.tsx'])).toEqual([
      {
        fromFile: 'src/app/page.tsx',
        specifier: '@/types/task',
        expectedBasePath: 'src/types/task',
      },
    ]);
  });

  it('detects tsc help output as a project discovery failure', () => {
    expect(
      looksLikeTscHelpOutput(
        'Version 5.7.2\n\nCOMMON COMMANDS\n\nYou can learn about all of the compiler options at https://aka.ms/tsc'
      )
    ).toBe(true);
  });
});
