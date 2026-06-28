import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  createProjectZipBlob,
  isProjectExportPath,
  normalizeExportPath,
  projectZipFileName,
  selectProjectExportFiles,
} from '@/lib/deployment/projectZip';

describe('project ZIP export helpers', () => {
  it('normalizes safe relative paths and rejects unsafe paths', () => {
    expect(normalizeExportPath('./src/app/page.tsx')).toBe('src/app/page.tsx');
    expect(normalizeExportPath('src\\app\\page.tsx')).toBe('src/app/page.tsx');
    expect(normalizeExportPath('/src/app/page.tsx')).toBeNull();
    expect(normalizeExportPath('../package.json')).toBeNull();
    expect(normalizeExportPath('C:/project/package.json')).toBeNull();
  });

  it('allows generated project files and rejects host or build metadata', () => {
    expect(isProjectExportPath('package.json')).toBe(true);
    expect(isProjectExportPath('tsconfig.json')).toBe(true);
    expect(isProjectExportPath('src/app/page.tsx')).toBe(true);
    expect(isProjectExportPath('public/icon.svg')).toBe(true);

    expect(isProjectExportPath('.env')).toBe(false);
    expect(isProjectExportPath('.next/server/app/page.js')).toBe(false);
    expect(isProjectExportPath('node_modules/next/package.json')).toBe(false);
    expect(isProjectExportPath('supabase/migrations/demo.sql')).toBe(false);
    expect(isProjectExportPath('tests/generated.test.ts')).toBe(false);
  });

  it('selects sorted exportable files with contents', () => {
    const selected = selectProjectExportFiles([
      { path: 'src/app/page.tsx', content: 'page' },
      { path: '.env', content: 'secret' },
      { path: 'package.json', content: '{}' },
      { path: 'src/app/empty.tsx' },
      { path: 'node_modules/react/index.js', content: 'react' },
    ]);

    expect(selected).toEqual([
      { path: 'package.json', content: '{}' },
      { path: 'src/app/page.tsx', content: 'page' },
    ]);
  });

  it('creates a ZIP containing the selected project paths', async () => {
    const blob = await createProjectZipBlob([
      { path: 'package.json', content: '{}' },
      { path: 'src/app/page.tsx', content: 'export default function Page() {}' },
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    await expect(zip.file('package.json')?.async('string')).resolves.toBe('{}');
    await expect(zip.file('src/app/page.tsx')?.async('string')).resolves.toContain(
      'Page'
    );
    expect(zip.file('.env')).toBeNull();
  });

  it('builds a stable project ZIP filename', () => {
    expect(projectZipFileName('Fitness Tracker')).toBe('fitness-tracker.zip');
    expect(projectZipFileName('')).toBe('matrix-coder-project.zip');
  });
});
