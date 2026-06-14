import { describe, expect, it } from 'vitest';
import {
  createNextScaffoldFiles,
  NEXT_SCAFFOLD_PATHS,
  NEXT_SCAFFOLD_TEMPLATES,
} from '@/lib/repo/nextScaffoldTemplates';

describe('Next scaffold templates', () => {
  it('creates all protected scaffold files from deterministic templates', () => {
    const files = createNextScaffoldFiles('2026-06-14T00:00:00.000Z');

    expect(files.map((file) => file.path)).toEqual([...NEXT_SCAFFOLD_PATHS]);
    expect(files.every((file) => file.type === 'file')).toBe(true);
    expect(files.every((file) => file.content && file.content.length > 0)).toBe(true);
  });

  it('uses a valid package.json with core Next dependencies and scripts', () => {
    const pkg = JSON.parse(NEXT_SCAFFOLD_TEMPLATES['package.json'].content);

    expect(pkg.scripts).toMatchObject({
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      'type-check': 'tsc --noEmit',
    });
    expect(pkg.dependencies).toMatchObject({
      next: '15.1.11',
      react: '19.0.3',
      'react-dom': '19.0.3',
    });
    expect(pkg.devDependencies).toHaveProperty('typescript');
    expect(pkg.devDependencies).toHaveProperty('tailwindcss');
  });

  it('uses the src path alias required by generated imports', () => {
    const tsconfig = JSON.parse(NEXT_SCAFFOLD_TEMPLATES['tsconfig.json'].content);

    expect(tsconfig.compilerOptions.baseUrl).toBe('.');
    expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./src/*']);
  });

  it('keeps globals.css safe and free of Tailwind @apply', () => {
    const css = NEXT_SCAFFOLD_TEMPLATES['src/app/globals.css'].content;

    expect(css).toContain('@tailwind base;');
    expect(css).toContain('@tailwind components;');
    expect(css).toContain('@tailwind utilities;');
    expect(css).toContain('::-webkit-scrollbar');
    expect(css).not.toContain('@apply');
  });

  it('imports globals.css from the root layout', () => {
    const layout = NEXT_SCAFFOLD_TEMPLATES['src/app/layout.tsx'].content;

    expect(layout).toContain("import './globals.css';");
    expect(layout).toContain('export const metadata');
  });
});

