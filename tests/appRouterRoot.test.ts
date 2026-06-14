import { describe, expect, it } from 'vitest';
import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  ensureLayoutImportsGlobals,
  hasMixedAppRouterRoots,
  planAppRouterRootNormalization,
} from '@/lib/repo/appRouterRoot';
import { runGeneratedQualityAudit } from '@/lib/validation/generatedQuality';

const file = (path: string, content: string): FileNode => ({
  id: path,
  name: path.split('/').pop() ?? path,
  path,
  parentPath: path.split('/').slice(0, -1).join('/'),
  type: 'file',
  content,
  language: path.endsWith('.css') ? 'css' : 'typescript',
  size: content.length,
  lastModified: new Date().toISOString(),
});

describe('App Router root normalization', () => {
  it('detects mixed root app and src/app trees', () => {
    expect(
      hasMixedAppRouterRoots([
        file('app/page.tsx', 'export default function Page() { return null; }'),
        file('src/app/history/page.tsx', 'export default function History() { return null; }'),
      ])
    ).toBe(true);
  });

  it('plans moves from app/* into src/app/* and deletes old root files', () => {
    const plan = planAppRouterRootNormalization([
      file('app/layout.tsx', 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }'),
      file('app/page.tsx', 'export default function Page() { return <main />; }'),
      file('app/globals.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'),
      file('src/app/history/page.tsx', 'export default function History() { return <main />; }'),
    ]);

    expect(plan.mixed).toBe(true);
    expect(plan.upserts.map((item) => item.file.path)).toEqual(
      expect.arrayContaining(['src/app/layout.tsx', 'src/app/page.tsx', 'src/app/globals.css'])
    );
    expect(plan.deleteIds).toEqual(
      expect.arrayContaining(['app/layout.tsx', 'app/page.tsx', 'app/globals.css'])
    );
    expect(plan.upserts.find((item) => item.file.path === 'src/app/layout.tsx')?.file.content).toContain(
      "import './globals.css';"
    );
  });

  it('generated-quality fails before build when both App Router roots exist', () => {
    const result = runGeneratedQualityAudit([
      file('package.json', '{"scripts":{"build":"next build"}}'),
      file('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}'),
      file('app/page.tsx', 'export default function Page() { return <main />; }'),
      file('src/app/history/page.tsx', 'export default function History() { return <main />; }'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => /Mixed App Router roots/.test(error.message))).toBe(true);
  });

  it('does not duplicate globals import when layout already imports it', () => {
    const content = "import './globals.css';\nexport default function Layout() { return null; }";
    expect(ensureLayoutImportsGlobals(content)).toBe(content);
  });
});
