import { describe, expect, it } from 'vitest';
import type { FileNode } from '@/app/chat-workspace/components/types';
import { applyDeterministicFixes } from '@/lib/validation/deterministicFixes';
import { runGeneratedQualityAudit } from '@/lib/validation/generatedQuality';
import type { ValidationResult } from '@/lib/validation/engine';

const file = (path: string, content: string): FileNode => ({
  id: path,
  name: path.split('/').pop() ?? path,
  path,
  type: 'file',
  content,
});

function validation(filePath: string, message: string): ValidationResult {
  return {
    success: false,
    skipped: false,
    steps: [],
    errors: [
      {
        source: 'typescript',
        file: filePath,
        message,
        raw: message,
      },
    ],
    combinedLog: message,
    durationMs: 0,
  };
}

function qualityValidation(files: FileNode[], requirements = ''): ValidationResult {
  const audit = runGeneratedQualityAudit(files, requirements);
  return {
    success: audit.ok,
    skipped: false,
    steps: [
      {
        step: 'generated-quality',
        status: audit.ok ? 'ok' : 'failed',
        durationMs: 0,
        errors: audit.errors,
        log: audit.log,
      },
    ],
    errors: audit.errors,
    combinedLog: audit.log,
    durationMs: 0,
  };
}

describe('applyDeterministicFixes', () => {
  it('adds missing React hook imports from exact TypeScript errors', () => {
    const report = applyDeterministicFixes(
      [file('src/components/Form.tsx', "'use client';\nexport function Form(){ const [x] = useState(''); return x; }")],
      validation('src/components/Form.tsx', "Cannot find name 'useState'.")
    );

    expect(report.mutated).toBe(true);
    expect(report.updates[0].file.content).toContain("import { useState } from 'react';");
  });

  it('adds missing next/link default import', () => {
    const report = applyDeterministicFixes(
      [file('src/app/page.tsx', 'export default function Page(){ return <Link href="/dashboard">Dashboard</Link>; }')],
      validation('src/app/page.tsx', "Cannot find name 'Link'.")
    );

    expect(report.mutated).toBe(true);
    expect(report.updates[0].file.content).toContain("import Link from 'next/link';");
  });

  it('creates missing linked App Router route pages before AI auto-fix', () => {
    const files = [
      file('package.json', '{"scripts":{"build":"next build"}}'),
      file('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}'),
      file(
        'src/app/page.tsx',
        `import Link from 'next/link';

export default function Page() {
  return (
    <nav>
      <Link href="/nutrition">Nutrition</Link>
      <Link href="/progress">Progress</Link>
      <Link href="/goals">Goals</Link>
    </nav>
  );
}`
      ),
      file('src/app/globals.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'),
    ];

    const report = applyDeterministicFixes(files, qualityValidation(files));

    expect(report.mutated).toBe(true);
    expect(report.creates.map((item) => item.file.path).sort()).toEqual([
      'src/app/goals/page.tsx',
      'src/app/nutrition/page.tsx',
      'src/app/progress/page.tsx',
    ]);

    for (const create of report.creates) {
      expect(create.file.content).toContain('// MATRIX_CODER_FALLBACK_ROUTE');
      expect(create.file.content).toContain("import Link from 'next/link';");
      expect(create.file.content).toContain('export const metadata');
      expect(create.file.content).toContain('href="/"');
      expect(create.file.content).not.toContain("'use client'");
      expect(create.file.content).not.toMatch(/\bTODO\b|placeholder/i);
    }

    const repairedAudit = runGeneratedQualityAudit([
      ...files,
      ...report.creates.map((item) => item.file),
    ]);
    expect(repairedAudit.errors.some((error) => /Generated navigation links/.test(error.message))).toBe(false);
  });

  it('removes duplicate route aliases from route consistency errors', () => {
    const report = applyDeterministicFixes(
      [
        file('src/app/add-note/page.tsx', 'export default function AddNote(){ return <main />; }'),
        file('src/app/add/page.tsx', 'export default function Add(){ return <main />; }'),
      ],
      validation(
        'src/app/add/page.tsx',
        'Route consistency failure: request uses "add-note" but duplicate alias src/app/add/page.tsx also exists. Keep one route name and update links/imports to match.'
      )
    );

    expect(report.mutated).toBe(true);
    expect(report.deletes.map((item) => item.file.path)).toEqual(['src/app/add/page.tsx']);
  });

  it('maps Next generated PageProps errors back to the source route page', () => {
    const report = applyDeterministicFixes(
      [
        file(
          'src/app/add-note/page.tsx',
          `type AddNotePageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

export default function AddNotePage({ searchParams }: AddNotePageProps) {
  const editId = typeof searchParams?.edit === 'string' ? searchParams.edit : '';
  return <main>{editId}</main>;
}
`
        ),
      ],
      validation(
        '.next/types/app/add-note/page.ts',
        "Type 'AddNotePageProps' does not satisfy the constraint 'PageProps'. Types of property 'searchParams' are incompatible. Type '{ [key: string]: string | string[] | undefined; } | undefined' is not assignable to type 'Promise<any> | undefined'."
      )
    );

    expect(report.mutated).toBe(true);
    expect(report.updates[0].file.path).toBe('src/app/add-note/page.tsx');
    expect(report.updates[0].file.content).toContain(
      'searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;'
    );
    expect(report.updates[0].file.content).toContain(
      'export default async function AddNotePage'
    );
    expect(report.updates[0].file.content).toContain(
      'const resolvedSearchParams = await searchParams;'
    );
    expect(report.updates[0].file.content).toContain('resolvedSearchParams?.edit');
  });

  it('replaces globals.css with a safe fallback after CSS build failures', () => {
    const report = applyDeterministicFixes(
      [
        file(
          'src/app/globals.css',
          `@tailwind base;
@tailwind components;
@tailwind utilities;

::-webkit-scrollbar {
  @apply w-2 bg-transparent;
}
`
        ),
      ],
      validation(
        'src/app/globals.css',
        'Build failed while compiling this CSS module. css-loader postcss-loader webpack errors'
      )
    );

    expect(report.mutated).toBe(true);
    expect(report.updates[0].file.path).toBe('src/app/globals.css');
    expect(report.updates[0].file.content).toContain('background: #f9fafb;');
    expect(report.updates[0].file.content).toContain('::-webkit-scrollbar');
    expect(report.updates[0].file.content).not.toContain('@apply');
  });

  it('moves pasted client directives and imports before executable code', () => {
    const report = applyDeterministicFixes(
      [
        file(
          'src/components/notes-workspace.tsx',
          `export function helper() {
  return 'notes';
}

'use client';
import { useMemo, useState } from 'react';
import type { Note } from '@/types/note';

export default function NotesWorkspace({ notes }: { notes: Note[] }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => notes.filter((note) => note.title.includes(query)), [notes, query]);
  return <input value={query} onChange={(event) => setQuery(event.target.value)} />;
}
`
        ),
      ],
      validation(
        'src/components/notes-workspace.tsx',
        "src/components/notes-workspace.tsx contains an import statement after executable code. ES imports must stay at the top of the module."
      )
    );

    expect(report.mutated).toBe(true);
    expect(report.updates[0].file.content).toMatch(
      /^'use client';\nimport \{ useMemo, useState \} from 'react';\nimport type \{ Note \} from '@\/types\/note';/
    );
    expect(report.updates[0].file.content).toContain('export function helper()');
  });
});
