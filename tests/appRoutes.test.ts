import { describe, expect, it } from 'vitest';
import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  effectiveAppRoute,
  findDuplicateEffectiveAppRoutes,
} from '@/lib/repo/appRoutes';
import { runGeneratedQualityAudit } from '@/lib/validation/generatedQuality';
import { applyDeterministicFixes } from '@/lib/validation/deterministicFixes';
import type { ValidationResult } from '@/lib/validation/engine';

const file = (path: string, content = 'export default function Page(){ return <main />; }'): FileNode => ({
  id: path,
  name: path.split('/').pop() ?? path,
  path,
  type: 'file',
  content,
});

const pkg = file('package.json', '{"scripts":{"build":"next build"}}');
const tsconfig = file('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}');

function validation(message: string): ValidationResult {
  return {
    success: false,
    skipped: false,
    steps: [],
    errors: [{ source: 'quality', file: 'src/app/page.tsx', message, raw: message }],
    combinedLog: message,
    durationMs: 0,
  };
}

describe('App Router effective route detection', () => {
  it('ignores route-group folders when computing URL routes', () => {
    expect(effectiveAppRoute('src/app/(dashboard)/page.tsx')).toBe('/');
    expect(effectiveAppRoute('src/app/(dashboard)/add-note/page.tsx')).toBe('/add-note');
  });

  it('detects src/app/page and src/app/(dashboard)/page as duplicate root routes', () => {
    expect(
      findDuplicateEffectiveAppRoutes([
        file('src/app/page.tsx'),
        file('src/app/(dashboard)/page.tsx'),
      ])
    ).toEqual([
      {
        route: '/',
        paths: ['src/app/page.tsx', 'src/app/(dashboard)/page.tsx'],
        deletePaths: ['src/app/page.tsx'],
      },
    ]);
  });

  it('generated-quality fails duplicate effective routes before build', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      tsconfig,
      file('src/app/page.tsx'),
      file('src/app/(dashboard)/page.tsx'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => /Duplicate App Router pages/.test(error.message))).toBe(true);
  });

  it('deterministic fixes remove the scaffold root page duplicate', () => {
    const report = applyDeterministicFixes(
      [
        file('src/app/page.tsx'),
        file('src/app/(dashboard)/page.tsx'),
      ],
      validation('Duplicate App Router pages resolve to "/": src/app/page.tsx, src/app/(dashboard)/page.tsx.')
    );

    expect(report.mutated).toBe(true);
    expect(report.deletes.map((item) => item.file.path)).toEqual(['src/app/page.tsx']);
  });
});
