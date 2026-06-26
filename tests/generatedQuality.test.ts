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

function fallbackRoutePage(slug: string): FileNode {
  const title = slug.charAt(0).toUpperCase() + slug.slice(1);
  return file(
    `src/app/${slug}/page.tsx`,
    `// MATRIX_CODER_FALLBACK_ROUTE
import Link from 'next/link';

export const metadata = { title: '${title}' };

export default function ${title}Page() {
  return (
    <main>
      <Link href="/">Back to dashboard</Link>
      <h1>${title}</h1>
      <p>Route-ready content area for ${slug} details and actions.</p>
    </main>
  );
}
`
  );
}

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

  it('fails before type-check when a generated file contains leaked patch markers', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      tsconfig,
      file(
        'src/app/page.tsx',
        `export default function Page() {\n<<<<<<< SEARCH\n  return <main />;\n=======\n  return <section />;\n>>>>>>> REPLACE\n}`
      ),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      source: 'quality',
      file: 'src/app/page.tsx',
    });
    expect(result.errors[0].message).toMatch(/SEARCH\/REPLACE markers/);
  });

  it('fails imported files with explicit stub markers', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      tsconfig,
      file('src/app/history/page.tsx', `import HistoryPage from '@/components/HistoryPage';\nexport default HistoryPage;`),
      file('src/components/HistoryPage.tsx', `export default function HistoryPage() { throw new Error('Not implemented'); }`),
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

  it('does not fail short valid Tailwind globals or functional note helpers as placeholders', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/layout.tsx', `import './globals.css';\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }`),
        file('src/app/page.tsx', `import { getNotes } from '@/lib/notesStorage';\nimport { seedNotes } from '@/lib/seedNotes';\nimport EditNoteModal from '@/components/modals/EditNoteModal';\nexport default function Page(){ return <main><EditNoteModal open={false} onClose={() => {}} onSave={() => {}} />{getNotes().length + seedNotes.length}</main>; }`),
        file('src/app/add-note/page.tsx', `export default function AddNotePage(){ return <main>Add note</main>; }`),
        file('src/app/history/page.tsx', `export default function HistoryPage(){ return <main>History</main>; }`),
        file('src/app/globals.css', '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'),
        file(
          'src/lib/notesStorage.ts',
          `import type { Note } from '@/types/note';\nconst KEY = 'notes';\nexport function getNotes(): Note[] { if (typeof window === 'undefined') return []; return JSON.parse(localStorage.getItem(KEY) || '[]'); }\nexport function saveNotes(notes: Note[]) { localStorage.setItem(KEY, JSON.stringify(notes)); }`
        ),
        file(
          'src/lib/seedNotes.ts',
          `import type { Note } from '@/types/note';\nexport const seedNotes: Note[] = [{ id: '1', title: 'Welcome', body: 'First note', updatedAt: Date.now() }];`
        ),
        file('src/types/note.ts', 'export interface Note { id: string; title: string; body: string; updatedAt: number }'),
        file(
          'src/components/modals/EditNoteModal.tsx',
          `'use client';\nexport default function EditNoteModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) { if (!open) return null; return <section><input placeholder="Note title" /><button onClick={onSave}>Save</button><button onClick={onClose}>Cancel</button></section>; }`
        ),
      ],
      'Build a notes app with add-note page, history page, Tailwind, TypeScript, and localStorage.'
    );

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

  it('does not treat hyphenated quality adjectives as requested route names', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/page.tsx', 'export default function Page(){ return <main />; }'),
      ],
      'Create a modern AI SaaS analytics dashboard with professional production-quality UI.'
    );

    expect(result.errors.some((error) => error.file === 'src/app/production-quality/page.tsx')).toBe(false);
    expect(result.log).not.toMatch(/production-quality/);
  });

  it('keeps explicit notes routes required for the notes benchmark', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/page.tsx', 'export default function Page(){ return <main />; }'),
      ],
      'Create a simple Next.js notes app with Home page, Add Note page at /add-note, and Notes History page at /history.'
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/add-note/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/history/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/note/page.tsx')).toBe(false);
  });

  it('does not force notes routes for a fitness tracker', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/page.tsx', 'export default function Page(){ return <main />; }'),
      ],
      'Build a fitness tracker app with workouts, progress charts, personal plans, nutrition summaries, and a training timer.'
    );

    expect(result.errors.some((error) => error.file === 'src/app/add-note/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/history/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/add/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/edit/page.tsx')).toBe(false);
  });

  it('requires explicitly requested fitness domain routes without adding history', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/page.tsx', 'export default function Page(){ return <main />; }'),
      ],
      'Build a fitness tracker with pages: workouts, progress, timer, calories.'
    );

    expect(result.errors.some((error) => error.file === 'src/app/workouts/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/progress/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/timer/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/calories/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/history/page.tsx')).toBe(false);
  });

  it('does not treat search edit delete and localStorage as a history route requirement', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/page.tsx', 'export default function Page(){ return <main />; }'),
      ],
      'Build a CRM tool with search, edit, delete, and localStorage persistence for contacts.'
    );

    expect(result.errors.some((error) => error.file === 'src/app/history/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/add-note/page.tsx')).toBe(false);
  });

  it('does not turn route-name instructions or negative route examples into required pages', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/page.tsx', 'export default function Page(){ return <main />; }'),
      ],
      'Build a fitness tracker with workouts, progress, timer, and calories. Preserve requested route names exactly. Do not create /add-note, /history, /preserve, or /names; they were not part of the original requested route set.'
    );

    expect(result.errors.some((error) => error.file === 'src/app/preserve/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/names/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/add-note/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/history/page.tsx')).toBe(false);
  });

  it('requires every explicitly listed CRM slash route and ignores the root slash bullet', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file('src/app/page.tsx', 'export default function Page(){ return <main />; }'),
        file('src/app/contacts/page.tsx', 'export default function Contacts(){ return <main />; }'),
        file('src/app/companies/page.tsx', 'export default function Companies(){ return <main />; }'),
      ],
      'Build a Personal CRM application. Requirements: Routes: * / * /contacts * /companies * /tasks * /pipeline Features: Dashboard (/) Contacts (/contacts) Companies (/companies) Tasks (/tasks) Pipeline (/pipeline). Preserve route names exactly. Do not create /add-note. Do not create /history.'
    );

    expect(result.errors.some((error) => error.file === 'src/app/-/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/tasks/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/pipeline/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/add-note/page.tsx')).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/history/page.tsx')).toBe(false);
  });

  it('fails generated navigation links that point to missing app routes', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file(
          'src/app/page.tsx',
          `import Link from 'next/link';

export default function Page() {
  return (
    <nav>
      <Link href="/contacts">Contacts</Link>
      <Link href="/tasks">Tasks</Link>
      <Link href="/pipeline">Pipeline</Link>
    </nav>
  );
}`
        ),
        file('src/app/contacts/page.tsx', 'export default function Contacts(){ return <main />; }'),
      ],
      'Build a Personal CRM application with routes /, /contacts, /tasks, and /pipeline.'
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/tasks/page.tsx')).toBe(true);
    expect(result.errors.some((error) => error.file === 'src/app/pipeline/page.tsx')).toBe(true);
  });

  it('fails when home navigation uses same-page anchors instead of linking existing primary app routes', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file(
          'src/app/page.tsx',
          `import Link from 'next/link';

export default function Page() {
  return (
    <main>
      <nav>
        <Link href="#features">Features</Link>
        <Link href="#plan">Plan</Link>
        <Link href="#progress">Progress</Link>
      </nav>
      <section id="features">Feature cards</section>
      <section id="plan">Plan section</section>
      <section id="progress">Progress teaser</section>
    </main>
  );
}`
        ),
        file('src/app/dashboard/page.tsx', 'export default function Dashboard(){ return <main>Dashboard app screen</main>; }'),
        file('src/app/workouts/page.tsx', 'export default function Workouts(){ return <main>Workouts app screen</main>; }'),
      ],
      'Build a fitness tracker with dashboard and workouts pages.'
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) =>
      error.file === 'src/app/page.tsx' &&
      /does not link to existing primary route \/dashboard/.test(error.message)
    )).toBe(true);
    expect(result.errors.some((error) =>
      error.file === 'src/app/page.tsx' &&
      /does not link to existing primary route \/workouts/.test(error.message)
    )).toBe(true);
  });

  it('passes when home navigation includes real route links alongside landing-page anchors', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file(
          'src/app/page.tsx',
          `import Link from 'next/link';

export default function Page() {
  return (
    <main>
      <nav>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/workouts">Workouts</Link>
        <Link href="#features">Features</Link>
      </nav>
      <section id="features">Feature cards</section>
    </main>
  );
}`
        ),
        file('src/app/dashboard/page.tsx', 'export default function Dashboard(){ return <main>Dashboard app screen</main>; }'),
        file('src/app/workouts/page.tsx', 'export default function Workouts(){ return <main>Workouts app screen</main>; }'),
      ],
      'Build a fitness tracker with dashboard and workouts pages.'
    );

    expect(result.ok).toBe(true);
  });

  it('fails unnamed fallback component files before validation can pass', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      tsconfig,
      file('src/app/page.tsx', 'export default function Page(){ return <main />; }'),
      file('src/components/Component0.tsx', 'export default function Component0(){ return <section />; }'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/components/Component0.tsx')).toBe(true);
    expect(result.log).toMatch(/unnamed fallback file/i);
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

  it('fails route pages with pasted client code after server code before build', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      tsconfig,
      file(
        'src/app/add-note/page.tsx',
        `import { NoteForm } from '@/components/NoteForm';

export default function AddNotePage() {
  return <AddNoteClient />;
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

function AddNoteClient() {
  const [loading, setLoading] = useState(false);
  return <NoteForm busy={loading} />;
}
`
      ),
      file('src/components/NoteForm.tsx', `'use client';\nexport function NoteForm(){ return <form />; }`),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.file === 'src/app/add-note/page.tsx')).toBe(true);
    expect(result.errors.some((error) => /misplaced 'use client'|import statement after executable code/i.test(error.message))).toBe(true);
  });

  it('does not flag valid multi-line import blocks as late imports', () => {
    const result = runGeneratedQualityAudit([
      pkg,
      tsconfig,
      file(
        'src/components/notes-workflows.tsx',
        `'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatNoteTimestamp, searchNotes, sortNotesByDate, validateNoteDraft } from '@/lib/note-utils';
import {
  addStoredNote,
  deleteStoredNote,
  readStoredNotes,
  seedNotesIfEmpty,
  updateStoredNote,
} from '@/lib/notes-storage';
import type { Note, NoteDraft, NoteSortDirection, StorageResult } from '@/types/note';

type HistoryFilter = 'all' | 'recent' | 'long-form';

export function NotesWorkflows() {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  useEffect(() => {
    seedNotesIfEmpty();
  }, []);
  return <button onClick={() => setFilter('recent')}>{filter}</button>;
}
`
      ),
      file('src/lib/note-utils.ts', 'export function formatNoteTimestamp(){ return ""; }\nexport function searchNotes(){ return []; }\nexport function sortNotesByDate(){ return []; }\nexport function validateNoteDraft(){ return true; }'),
      file('src/lib/notes-storage.ts', 'export function addStoredNote(){}\nexport function deleteStoredNote(){}\nexport function readStoredNotes(){ return []; }\nexport function seedNotesIfEmpty(){}\nexport function updateStoredNote(){}'),
      file('src/types/note.ts', 'export interface Note { id: string }\nexport interface NoteDraft { title: string }\nexport type NoteSortDirection = "asc" | "desc";\nexport interface StorageResult { ok: boolean }'),
    ]);

    expect(result.ok).toBe(true);
  });

  it('fails a deterministic fallback dashboard route for an expense tracker primary app screen', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file(
          'src/app/page.tsx',
          `import Link from 'next/link';

export default function Page() {
  return <Link href="/dashboard">Open dashboard</Link>;
}
`
        ),
        fallbackRoutePage('dashboard'),
      ],
      'Build me an Expense Tracker app.'
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) =>
      error.file === 'src/app/dashboard/page.tsx' &&
      /Primary route \/dashboard is only a deterministic fallback page/.test(error.message)
    )).toBe(true);
  });

  it('fails deterministic fallback progress and goals routes for fitness primary app screens', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file(
          'src/app/page.tsx',
          `import Link from 'next/link';

export default function Page() {
  return (
    <nav>
      <Link href="/workouts">Workouts</Link>
      <Link href="/nutrition">Nutrition</Link>
      <Link href="/progress">Progress</Link>
      <Link href="/goals">Goals</Link>
    </nav>
  );
}
`
        ),
        file('src/app/workouts/page.tsx', 'export default function Workouts(){ return <main>Workout logging app screen</main>; }'),
        file('src/app/nutrition/page.tsx', 'export default function Nutrition(){ return <main>Nutrition tracking app screen</main>; }'),
        fallbackRoutePage('progress'),
        fallbackRoutePage('goals'),
      ],
      'Build me a fitness tracking app with multiple screens.'
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) =>
      error.file === 'src/app/progress/page.tsx' &&
      /Primary route \/progress is only a deterministic fallback page/.test(error.message)
    )).toBe(true);
    expect(result.errors.some((error) =>
      error.file === 'src/app/goals/page.tsx' &&
      /Primary route \/goals is only a deterministic fallback page/.test(error.message)
    )).toBe(true);
  });

  it('allows an incidental deterministic fallback route when it is not a primary app screen', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file(
          'src/app/page.tsx',
          `import Link from 'next/link';

export default function Page() {
  return <Link href="/privacy">Privacy</Link>;
}
`
        ),
        fallbackRoutePage('privacy'),
      ],
      'Build me a simple landing page.'
    );

    expect(result.ok).toBe(true);
  });

  it('passes when a primary linked route is replaced with a real implementation', () => {
    const result = runGeneratedQualityAudit(
      [
        pkg,
        tsconfig,
        file(
          'src/app/page.tsx',
          `import Link from 'next/link';

export default function Page() {
  return <Link href="/dashboard">Open dashboard</Link>;
}
`
        ),
        file(
          'src/app/dashboard/page.tsx',
          `export const metadata = { title: 'Expense dashboard' };

export default function DashboardPage() {
  return (
    <main>
      <h1>Monthly expense dashboard</h1>
      <section>
        <h2>Balance summary</h2>
        <p>Income, expenses, savings rate, recent transactions, and budget progress.</p>
      </section>
    </main>
  );
}
`
        ),
      ],
      'Build me an Expense Tracker app.'
    );

    expect(result.ok).toBe(true);
  });
});
