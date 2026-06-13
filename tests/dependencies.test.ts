import { describe, it, expect } from 'vitest';
import {
  parsePackageJson,
  stringifyPackageJson,
  addDependencies,
  findPackageJsonNode,
} from '@/lib/dependencies/packageJson';
import { pickVersionFor, isLikelyDevDep, KNOWN_PACKAGES } from '@/lib/dependencies/registry';
import { analyzeAndAddMissingDependencies } from '@/lib/dependencies/resolver';
import type { FileNode } from '@/app/chat-workspace/components/types';

function file(path: string, content: string): FileNode {
  return { id: path, name: path.split('/').pop()!, path, type: 'file', content };
}

describe('registry', () => {
  it('returns versions for known packages with correct devDeps flag', () => {
    expect(pickVersionFor('react').version).toBe('^19.1.0');
    expect(pickVersionFor('react').devDeps).toBe(false);
    expect(pickVersionFor('typescript').version).toBe('^5.7.0');
    expect(pickVersionFor('typescript').devDeps).toBe(true);
    expect(pickVersionFor('@types/react').devDeps).toBe(true);
    expect(pickVersionFor('framer-motion').version).toMatch(/^\^11\./);
  });

  it('falls back to "latest" with sensible devDeps heuristic for unknowns', () => {
    expect(pickVersionFor('totally-made-up-pkg-xyz').version).toBe('latest');
    expect(pickVersionFor('totally-made-up-pkg-xyz').devDeps).toBe(false);
    expect(pickVersionFor('@types/random').devDeps).toBe(true);
    expect(pickVersionFor('eslint-plugin-foo').devDeps).toBe(true);
  });

  it('isLikelyDevDep catches common dev-only patterns', () => {
    expect(isLikelyDevDep('@types/lodash')).toBe(true);
    expect(isLikelyDevDep('eslint-plugin-react')).toBe(true);
    expect(isLikelyDevDep('@typescript-eslint/parser')).toBe(true);
    expect(isLikelyDevDep('typescript')).toBe(true);
    expect(isLikelyDevDep('vite')).toBe(true);
    expect(isLikelyDevDep('react')).toBe(false);
    expect(isLikelyDevDep('framer-motion')).toBe(false);
  });

  it('uses VALID published react/react-dom ranges (regression: 19.0.0 was claimed to not exist)', () => {
    // ^19.1.0 picks up 19.1.x and 19.2.x — both confirmed published on npm.
    expect(KNOWN_PACKAGES['react'].version).toBe('^19.1.0');
    expect(KNOWN_PACKAGES['react-dom'].version).toBe('^19.1.0');
  });
});

describe('parsePackageJson', () => {
  it('detects 2-space indentation', () => {
    const raw = '{\n  "name": "x",\n  "version": "1.0.0"\n}\n';
    const parsed = parsePackageJson(raw);
    expect(parsed?.indent).toBe(2);
    expect(parsed?.hasTrailingNewline).toBe(true);
  });

  it('detects 4-space indentation', () => {
    const raw = '{\n    "name": "x"\n}';
    const parsed = parsePackageJson(raw);
    expect(parsed?.indent).toBe(4);
    expect(parsed?.hasTrailingNewline).toBe(false);
  });

  it('detects tab indentation', () => {
    const raw = '{\n\t"name": "x"\n}';
    const parsed = parsePackageJson(raw);
    expect(parsed?.indent).toBe('\t');
  });

  it('returns null on malformed JSON', () => {
    expect(parsePackageJson('{ "name": missing-quotes }')).toBeNull();
  });

  it('round-trips through stringify preserving structure', () => {
    const raw = '{\n  "name": "demo",\n  "dependencies": {\n    "react": "^19.0.0"\n  }\n}\n';
    const parsed = parsePackageJson(raw)!;
    const out = stringifyPackageJson(parsed);
    expect(out).toBe(raw);
  });
});

describe('addDependencies', () => {
  it('adds new entries to the correct section', () => {
    const parsed = parsePackageJson('{"name":"x"}')!;
    const result = addDependencies(parsed, [
      { name: 'react', version: '^19.1.0' },
      { name: 'typescript', version: '^5.7.0', devDeps: true },
    ]);
    expect(result.changed).toBe(true);
    expect(result.added).toEqual([
      { name: 'react', version: '^19.1.0', section: 'dependencies' },
      { name: 'typescript', version: '^5.7.0', section: 'devDependencies' },
    ]);
    expect(parsed.shape.dependencies).toEqual({ react: '^19.1.0' });
    expect(parsed.shape.devDependencies).toEqual({ typescript: '^5.7.0' });
  });

  it('NEVER overwrites existing entries (idempotent)', () => {
    const parsed = parsePackageJson(
      '{"dependencies":{"react":"^18.2.0"},"devDependencies":{"typescript":"^5.0.0"}}'
    )!;
    const result = addDependencies(parsed, [
      { name: 'react', version: '^19.1.0' },
      { name: 'typescript', version: '^5.7.0', devDeps: true },
    ]);
    expect(result.changed).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    expect(parsed.shape.dependencies?.react).toBe('^18.2.0'); // unchanged
    expect(parsed.shape.devDependencies?.typescript).toBe('^5.0.0'); // unchanged
  });

  it('respects peerDependencies as existing', () => {
    const parsed = parsePackageJson(
      '{"peerDependencies":{"react":"*"}}'
    )!;
    const result = addDependencies(parsed, [{ name: 'react', version: '^19.0.0' }]);
    expect(result.changed).toBe(false);
    expect(result.skipped[0].reason).toBe('already-present');
  });
});

describe('findPackageJsonNode', () => {
  it('finds the root package.json', () => {
    const tree: FileNode[] = [
      file('package.json', '{}'),
      file('src/a.tsx', ''),
    ];
    expect(findPackageJsonNode(tree)?.path).toBe('package.json');
  });

  it('returns null when no package.json exists', () => {
    const tree: FileNode[] = [file('src/a.tsx', '')];
    expect(findPackageJsonNode(tree)).toBeNull();
  });
});

describe('analyzeAndAddMissingDependencies (integration)', () => {
  it('detects missing imported packages and adds them', () => {
    const tree: FileNode[] = [
      file(
        'package.json',
        JSON.stringify({ name: 'demo', dependencies: { react: '^19.1.0' } }, null, 2)
      ),
      file('src/Hero.tsx', `import { motion } from 'framer-motion';\nimport { create } from 'zustand';`),
    ];

    let updated: FileNode | null = null;
    const result = analyzeAndAddMissingDependencies({
      files: tree,
      onUpdateFile: (f) => {
        updated = f;
      },
    });

    expect(result.mutated).toBe(true);
    expect(result.added.map((a) => a.name).sort()).toEqual(
      expect.arrayContaining(['framer-motion', 'zustand'])
    );
    expect(updated).not.toBeNull();
    expect(updated!.path).toBe('package.json');
    const newPkg = JSON.parse(updated!.content!);
    expect(newPkg.dependencies['framer-motion']).toMatch(/^\^11\./);
    expect(newPkg.dependencies['zustand']).toMatch(/^\^5\./);
    expect(newPkg.dependencies['react']).toBe('^19.1.0'); // unchanged
  });

  it('REGRESSION: adds project-shape deps (typescript, @types/react, etc.) when tsconfig.json exists', () => {
    // Reproduces the user-reported failure: AI scaffolds Next.js but
    // omits `typescript` from package.json, so `tsc` is not in
    // node_modules/.bin and type-check fails with "0 errors parsed".
    const tree: FileNode[] = [
      file(
        'package.json',
        JSON.stringify(
          { name: 'demo', dependencies: { next: '^15.1.0', react: '^19.1.0', 'react-dom': '^19.1.0' } },
          null,
          2
        )
      ),
      file('tsconfig.json', '{"compilerOptions":{"jsx":"preserve"}}'),
      file('next.config.mjs', 'export default {};'),
      file('app/layout.tsx', 'export default function Layout() { return null; }'),
    ];

    let updated: FileNode | null = null;
    const result = analyzeAndAddMissingDependencies({
      files: tree,
      onUpdateFile: (f) => {
        updated = f;
      },
    });

    expect(result.mutated).toBe(true);
    const newPkg = JSON.parse(updated!.content!);
    // These four are the critical "project-shape" deps that Next.js +
    // TypeScript projects ALWAYS need but are easy for the AI to forget.
    expect(newPkg.devDependencies.typescript).toBeDefined();
    expect(newPkg.devDependencies['@types/react']).toBeDefined();
    expect(newPkg.devDependencies['@types/react-dom']).toBeDefined();
    expect(newPkg.devDependencies['@types/node']).toBeDefined();
  });

  it('adds tailwindcss/postcss/autoprefixer when their configs exist', () => {
    const tree: FileNode[] = [
      file('package.json', JSON.stringify({ name: 'demo' }, null, 2)),
      file('tailwind.config.js', 'module.exports = {};'),
      file('postcss.config.js', 'module.exports = {};'),
    ];
    let updated: FileNode | null = null;
    analyzeAndAddMissingDependencies({
      files: tree,
      onUpdateFile: (f) => {
        updated = f;
      },
    });
    const newPkg = JSON.parse(updated!.content!);
    expect(newPkg.devDependencies.tailwindcss).toBeDefined();
    expect(newPkg.devDependencies.postcss).toBeDefined();
    expect(newPkg.devDependencies.autoprefixer).toBeDefined();
  });

  it('returns mutated=false when no missing deps + nothing inferred', () => {
    const tree: FileNode[] = [
      file(
        'package.json',
        JSON.stringify(
          { name: 'demo', dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0' } },
          null,
          2
        )
      ),
      // No tsconfig, no next config, no .ts files — nothing to infer.
      file('src/app.jsx', `import React from 'react';`),
    ];
    let called = false;
    const result = analyzeAndAddMissingDependencies({
      files: tree,
      onUpdateFile: () => {
        called = true;
      },
    });
    expect(result.mutated).toBe(false);
    expect(called).toBe(false);
  });

  it('handles invalid package.json gracefully', () => {
    const tree: FileNode[] = [
      file('package.json', '{ not valid json }'),
      file('src/a.tsx', `import { motion } from 'framer-motion';`),
    ];
    const result = analyzeAndAddMissingDependencies({
      files: tree,
      onUpdateFile: () => {
        throw new Error('should not be called');
      },
    });
    expect(result.mutated).toBe(false);
    expect(result.chatSummary).toMatch(/not valid JSON/);
  });

  it('handles missing package.json gracefully', () => {
    const tree: FileNode[] = [
      file('src/a.tsx', `import { motion } from 'framer-motion';`),
    ];
    const result = analyzeAndAddMissingDependencies({
      files: tree,
      onUpdateFile: () => {
        throw new Error('should not be called');
      },
    });
    expect(result.mutated).toBe(false);
    expect(result.chatSummary).toMatch(/no `package.json` found/);
  });
});
