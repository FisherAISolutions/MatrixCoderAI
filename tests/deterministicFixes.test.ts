import { describe, expect, it } from 'vitest';
import type { FileNode } from '@/app/chat-workspace/components/types';
import { applyDeterministicFixes } from '@/lib/validation/deterministicFixes';
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
});
