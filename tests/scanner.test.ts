import { describe, it, expect } from 'vitest';
import {
  scanFileImports,
  scanProjectImports,
  specifierToPackageName,
} from '@/lib/dependencies/scanner';
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

describe('specifierToPackageName', () => {
  it('returns null for relative imports', () => {
    expect(specifierToPackageName('./foo')).toBeNull();
    expect(specifierToPackageName('../bar/baz')).toBeNull();
  });

  it('returns null for path-alias imports', () => {
    expect(specifierToPackageName('@/lib/foo')).toBeNull();
    expect(specifierToPackageName('@/components/Button')).toBeNull();
  });

  it('returns null for node built-ins', () => {
    expect(specifierToPackageName('fs')).toBeNull();
    expect(specifierToPackageName('path')).toBeNull();
    expect(specifierToPackageName('node:fs/promises')).toBeNull();
    expect(specifierToPackageName('crypto')).toBeNull();
  });

  it('returns null for URL-protocol imports', () => {
    expect(specifierToPackageName('https://esm.sh/react')).toBeNull();
    expect(specifierToPackageName('data:text/javascript,foo')).toBeNull();
  });

  it('returns scoped package names correctly', () => {
    expect(specifierToPackageName('@radix-ui/react-dialog')).toBe('@radix-ui/react-dialog');
    expect(specifierToPackageName('@radix-ui/react-dialog/dist/foo')).toBe('@radix-ui/react-dialog');
    expect(specifierToPackageName('@scope/pkg')).toBe('@scope/pkg');
  });

  it('returns bare package names for unscoped packages', () => {
    expect(specifierToPackageName('react')).toBe('react');
    expect(specifierToPackageName('framer-motion')).toBe('framer-motion');
    expect(specifierToPackageName('framer-motion/dist/es/animation')).toBe('framer-motion');
  });

  it('returns base package for next/* virtual modules', () => {
    expect(specifierToPackageName('next/image')).toBe('next');
    expect(specifierToPackageName('next/font/google')).toBe('next');
  });

  it('handles scoped packages without subpath gracefully', () => {
    expect(specifierToPackageName('@scope')).toBeNull();
  });
});

describe('scanFileImports', () => {
  it('extracts ES module imports', () => {
    const refs = scanFileImports(
      'src/a.tsx',
      `import { motion } from 'framer-motion';\nimport React from 'react';`
    );
    const names = refs.map((r) => r.packageName).sort();
    expect(names).toEqual(['framer-motion', 'react']);
  });

  it('extracts side-effect imports', () => {
    const refs = scanFileImports(
      'src/styles.ts',
      `import 'tailwindcss/tailwind.css';\nimport 'react-toastify/dist/ReactToastify.css';`
    );
    const names = refs.map((r) => r.packageName).sort();
    expect(names).toContain('tailwindcss');
    expect(names).toContain('react-toastify');
  });

  it('extracts dynamic imports', () => {
    const refs = scanFileImports(
      'src/lazy.ts',
      `const mod = await import('zustand');`
    );
    expect(refs.find((r) => r.packageName === 'zustand')).toBeTruthy();
  });

  it('extracts CommonJS require calls', () => {
    const refs = scanFileImports(
      'src/cjs.js',
      `const path = require('path');\nconst lodash = require('lodash');`
    );
    const names = refs.map((r) => r.packageName);
    expect(names).toContain('lodash');
    expect(names).not.toContain('path'); // built-in
  });

  it('extracts re-exports from another module', () => {
    const refs = scanFileImports(
      'src/index.ts',
      `export { Button } from '@radix-ui/react-dialog';`
    );
    expect(refs[0].packageName).toBe('@radix-ui/react-dialog');
  });

  it('ignores relative + alias imports', () => {
    const refs = scanFileImports(
      'src/x.tsx',
      `import { foo } from './foo';\nimport { bar } from '@/lib/bar';\nimport { z } from 'zod';`
    );
    const names = refs.map((r) => r.packageName);
    expect(names).toEqual(['zod']);
  });
});

describe('scanProjectImports', () => {
  it('aggregates imports across files, dedupes by package, tracks importedBy', () => {
    const tree: FileNode[] = [
      file('src/a.tsx', `import { motion } from 'framer-motion';\nimport React from 'react';`),
      file('src/b.tsx', `import { AnimatePresence } from 'framer-motion';`),
      file('package.json', '{}'), // non-code file ignored
      file('src/c.ts', `import { create } from 'zustand';`),
    ];
    const refs = scanProjectImports(tree);
    const names = refs.map((r) => r.packageName).sort();
    expect(names).toEqual(['framer-motion', 'react', 'zustand']);

    const framer = refs.find((r) => r.packageName === 'framer-motion')!;
    expect(framer.importedBy.sort()).toEqual(['src/a.tsx', 'src/b.tsx']);
  });

  it('skips non-code file extensions', () => {
    const tree: FileNode[] = [
      file('README.md', `import { foo } from 'should-not-detect';`),
      file('app/globals.css', `@import 'tailwindcss';`),
    ];
    expect(scanProjectImports(tree)).toEqual([]);
  });
});
