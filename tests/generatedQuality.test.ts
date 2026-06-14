import { describe, expect, it } from 'vitest';
import { runGeneratedQualityAudit } from '@/lib/validation/generatedQuality';
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

const pkg = file(
  'package.json',
  JSON.stringify({
    scripts: { dev: 'next dev', build: 'next build', start: 'next start', 'type-check': 'tsc --noEmit' },
    dependencies: { next: '^15.1.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: { typescript: '^5.0.0', tailwindcss: '^3.4.0' },
  })
);
const tsconfig = file(
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      baseUrl: '.',
      paths: { '@/*': ['./src/*'] },
    },
  })
);

describe('runGeneratedQualityAudit', () => {
  it('fails generated apps without package.json before install/build', () => {
    const result = runGeneratedQualityAudit([
      file('src/app/page.tsx', 'export default function Page() { return null; }'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      source: 'quality',
      file: 'package.json',
    });
    expect(result.errors[0].message).toMatch(/package\.json is required/i);
  });

  it('fails tsconfig when @/* alias cannot resolve src files', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      file('tsconfig.json', '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}'),
      file('src/app/page.tsx', `import type { Task } from '@/types/task';\nexport default function Page(){ return null; }`),
      file('src/types/task.ts', 'export interface Task { id: string }'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.file === 'tsconfig.json')).toBe(true);
    expect(result.log).toMatch(/baseUrl|paths/);
  });

  it('fails imported tiny placeholder components', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      tsconfig,
      file('src/app/history/page.tsx', `import HistoryPage from '@/components/HistoryPage';\nexport default HistoryPage;`),
      file('src/components/HistoryPage.tsx', `export default function HistoryPage() { return <main>History</main>; }`),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/components/HistoryPage.tsx')).toBe(true);
    expect(result.log).toMatch(/placeholder/i);
  });

  it('does not fail compact but functional imported components as placeholders', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      tsconfig,
      file('src/app/page.tsx', `import TaskForm from '@/components/TaskForm';\nexport default function Page(){ return <TaskForm />; }`),
      file(
        'src/components/TaskForm.tsx',
        `'use client';\nimport { useState } from 'react';\nexport default function TaskForm(){const [title,setTitle]=useState('');return <form onSubmit={(event)=>event.preventDefault()}><input value={title} onChange={(event)=>setTitle(event.target.value)} /><button>Add</button></form>;}`
      ),
    ]);

    expect(result.ok).toBe(true);
  });

  it('fails HistoryPage when requested behavior is missing', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/history/page.tsx', `import HistoryPage from '@/components/HistoryPage';\nexport default HistoryPage;`),
        file(
          'src/components/HistoryPage.tsx',
          `
'use client';
export default function HistoryPage() {
  const entries = [];
  return <main className="p-6"><input aria-label="Search" /></main>;
}
`
        ),
      ],
      'Build a calorie tracker HistoryPage with search, filter, edit, delete, and localStorage wiring.'
    );

    expect(result.ok).toBe(false);
    const message = result.errors.map((error) => error.message).join('\n');
    expect(message).toMatch(/filter/);
    expect(message).toMatch(/edit/);
    expect(message).toMatch(/delete/);
    expect(message).toMatch(/localstorage/i);
  });

  it('fails placeholder globals.css without full Tailwind directives', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      file('src/app/globals.css', 'body { margin: 0; }'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      file: 'src/app/globals.css',
    });
    expect(result.errors[0].message).toMatch(/@tailwind base/);
  });

  it('fails config-only scaffolds when requested pages are missing', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        file('next.config.mjs', 'export default {};'),
        file('tsconfig.json', '{}'),
        file('tailwind.config.ts', 'export default { content: [] };'),
        file('postcss.config.js', 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };'),
        file('app/globals.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'),
      ],
      'Build a calorie tracker with 3 pages: dashboard, add entry, and history with edit/delete.'
    );

    expect(result.ok).toBe(false);
    const messages = result.errors.map((error) => error.message).join('\n');
    expect(messages).toMatch(/dashboard page/);
    expect(messages).toMatch(/add entry page/);
    expect(messages).toMatch(/history page/);
  });

  it('passes a functional HistoryPage and full Tailwind globals', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/history/page.tsx', `import HistoryPage from '@/components/HistoryPage';\nexport default HistoryPage;`),
        file('src/app/globals.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'),
        file(
          'src/components/HistoryPage.tsx',
          `
'use client';
import { useEffect, useMemo, useState } from 'react';

export default function HistoryPage() {
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    setEntries(JSON.parse(localStorage.getItem('entries') || '[]'));
  }, []);
  const visible = useMemo(() => entries.filter(() => search || filter), [entries, search, filter]);
  const editEntry = () => setEntries(visible);
  const deleteEntry = () => setEntries([]);
  return <main className="min-h-screen p-6"><input value={search} onChange={(event) => setSearch(event.target.value)} /><button onClick={editEntry}>Edit</button><button onClick={deleteEntry}>Delete</button></main>;
}
`
        ),
      ],
      'Build a calorie tracker HistoryPage with search, filter, edit, delete, and localStorage wiring.'
    );

    expect(result.ok).toBe(true);
  });

  it('fails when an explicitly requested route slug is replaced by a different alias', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/add/page.tsx', 'export default function Add(){ return <main />; }'),
      ],
      'Build a task manager with add-task page'
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/add-task/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/add/page.tsx')).toBe(true);
  });

  it('does not demand generic add route when explicit add-note route exists', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/add-note/page.tsx', 'export default function AddNote(){ return <main />; }'),
      ],
      'Build a notes app with dashboard, add-note page, history page, Tailwind, TypeScript, and localStorage.'
    );

    expect(result.errors.some((error) => error.file === 'src/app/add/page.tsx')).toBe(false);
  });

  it('fails duplicate semantic route aliases before build', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/add/page.tsx', 'export default function Add(){ return <main />; }'),
        file('src/app/add-task/page.tsx', 'export default function AddTask(){ return <main />; }'),
      ],
      'Build a task manager with add-task page'
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => /Duplicate semantic routes/.test(error.message))).toBe(true);
  });

  it('fails add plus add-note as duplicate route aliases before build', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/add/page.tsx', 'export default function Add(){ return <main />; }'),
        file('src/app/add-note/page.tsx', 'export default function AddNote(){ return <main />; }'),
      ],
      'Build a notes app with add-note page'
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/add/page.tsx')).toBe(true);
    expect(result.errors.some((error) => /add-note|duplicate/i.test(error.message))).toBe(true);
  });
});
