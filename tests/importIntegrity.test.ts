import { describe, expect, it } from 'vitest';
import { runImportIntegrityAudit } from '@/lib/validation/importIntegrity';
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

describe('runImportIntegrityAudit', () => {
  it('fails when an alias import references a generated file that does not exist', () => {
    const result = runImportIntegrityAudit([
      file(
        'src/app/history/page.tsx',
        `import HistoryPage from '@/components/HistoryPage';\nexport default HistoryPage;`
      ),
    ]);

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      {
        fromFile: 'src/app/history/page.tsx',
        specifier: '@/components/HistoryPage',
        expectedBasePath: 'src/components/HistoryPage',
        suggestedCreatePath: 'src/components/HistoryPage.tsx',
      },
    ]);
    expect(result.errors[0].message).toContain('Suggested create path: src/components/HistoryPage.tsx');
    expect(result.errors[0].message).toContain('Create the missing file or correct the import path');
  });

  it('passes when an extensionless alias import resolves to a TSX file', () => {
    const result = runImportIntegrityAudit([
      file(
        'src/app/history/page.tsx',
        `import HistoryPage from '@/components/HistoryPage';\nexport default HistoryPage;`
      ),
      file('src/components/HistoryPage.tsx', 'export default function HistoryPage() { return null; }'),
    ]);

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('passes when a relative import resolves to a directory index file', () => {
    const result = runImportIntegrityAudit([
      file('src/components/Card.tsx', `import { formatDate } from '../lib/date';`),
      file('src/lib/date/index.ts', 'export const formatDate = () => "";'),
    ]);

    expect(result.ok).toBe(true);
  });

  it('ignores package imports but checks local side-effect imports', () => {
    const result = runImportIntegrityAudit([
      file('src/app/page.tsx', `import React from 'react';\nimport './missing.css';`),
    ]);

    expect(result.ok).toBe(false);
    expect(result.missing[0]).toMatchObject({
      fromFile: 'src/app/page.tsx',
      specifier: './missing.css',
      expectedBasePath: 'src/app/missing.css',
      suggestedCreatePath: 'src/app/missing.css',
    });
  });

  it('suggests .ts files for missing lib imports', () => {
    const result = runImportIntegrityAudit([
      file('src/components/Dashboard.tsx', `import { useCalorieEntries } from '@/lib/useCalorieEntries';`),
    ]);

    expect(result.ok).toBe(false);
    expect(result.missing[0]).toMatchObject({
      expectedBasePath: 'src/lib/useCalorieEntries',
      suggestedCreatePath: 'src/lib/useCalorieEntries.ts',
    });
  });
});
