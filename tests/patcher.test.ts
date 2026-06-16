/**
 * Regression tests for the SEARCH/REPLACE patcher (`src/lib/repo/patcher.ts`).
 *
 * These cover the bugs that produced the user-visible
 * "patcher claimed success but the file didn't change" failure mode:
 *
 *   1. `String.prototype.replace(str, str)` interprets `$&`, `$1`, `$$`,
 *      `$'`, `` $` ``. If the AI emits any of these in REPLACE (legal in
 *      TS — template literals, regex, JSX placeholders), the file would
 *      get silently corrupted. Fixed via the new `literalReplaceFirst`
 *      helper that always returns the replacement string verbatim.
 *
 *   2. When `search === replace`, the patcher used to return
 *      `success: true` AND a `strategy: 'exact'`. Callers incremented
 *      their "applied" counter and pretended a change happened. We now
 *      return `strategy: 'noop'` and `applyEditSequence` exposes both a
 *      `noopCount` and a defensive `unchanged: boolean` flag so callers
 *      can distinguish "real change applied" from "AI re-emitted the
 *      same code".
 *
 *   3. When EVERY edit fails to match, `applied` is 0 — callers should
 *      treat this as a HARD failure (no file mutation, surface to user).
 */

import { describe, it, expect } from 'vitest';
import { applyEdit, applyEditSequence } from '@/lib/repo/patcher';

describe('applyEdit — basic happy path', () => {
  it('replaces an exact substring on the first occurrence only', () => {
    const original = `const x = 1;\nconst x = 2;`;
    const r = applyEdit(original, {
      path: 'foo.ts',
      search: 'const x = 1;',
      replace: 'const x = 99;',
    });
    expect(r.success).toBe(true);
    expect(r.strategy).toBe('exact');
    expect(r.newContent).toBe(`const x = 99;\nconst x = 2;`);
  });

  it('preserves indentation when matching by trimmed lines', () => {
    const original = `function f() {\n    const a = 1;\n}`;
    const r = applyEdit(original, {
      path: 'foo.ts',
      search: `const a = 1;`,
      replace: `const a = 42;`,
    });
    expect(r.success).toBe(true);
    expect(r.newContent).toMatch(/const a = 42;/);
  });
});

describe('REGRESSION — $-pattern interpolation in REPLACE must be literal', () => {
  // Bug: `String.prototype.replace(string, string)` interprets these
  // dollar patterns in the replacement string. Real-world code routinely
  // contains them, so any patch using them used to corrupt the file.
  it('treats `$&` in REPLACE as literal text, not "the matched substring"', () => {
    const original = `const a = 1;`;
    const r = applyEdit(original, {
      path: 'foo.ts',
      search: `const a = 1;`,
      // If we used unsafe replace, `$&` would expand to the matched
      // substring → `const x = const a = 1;`. With the literal-replace
      // helper, `$&` stays verbatim.
      replace: `const x = $&;`,
    });
    expect(r.success).toBe(true);
    expect(r.newContent).toBe(`const x = $&;`);
    expect(r.newContent).not.toContain('const a = 1;');
  });

  it('treats `$1` in REPLACE as literal text', () => {
    const original = `// placeholder`;
    const r = applyEdit(original, {
      path: 'foo.ts',
      search: `// placeholder`,
      replace: `template_$1_end`,
    });
    expect(r.success).toBe(true);
    expect(r.newContent).toBe(`template_$1_end`);
  });

  it('treats `$$` in REPLACE as literal text (not a single $)', () => {
    const original = `const price = 0;`;
    const r = applyEdit(original, {
      path: 'foo.ts',
      search: `const price = 0;`,
      replace: `const price = '$$100';`,
    });
    expect(r.success).toBe(true);
    expect(r.newContent).toBe(`const price = '$$100';`);
  });

  it("handles template-literal placeholders with `${...}` (the most common real case)", () => {
    const original = `const greeting = 'hi';`;
    const replace = 'const greeting = `hello ${name}`;';
    const r = applyEdit(original, {
      path: 'foo.ts',
      search: `const greeting = 'hi';`,
      replace,
    });
    expect(r.success).toBe(true);
    expect(r.newContent).toBe(replace);
  });
});

describe('REGRESSION — no-op edit (search === replace) must NOT pretend success', () => {
  it('marks identical search/replace with strategy "noop"', () => {
    const original = `const x = 1;`;
    const r = applyEdit(original, {
      path: 'foo.ts',
      search: `const x = 1;`,
      replace: `const x = 1;`,
    });
    expect(r.success).toBe(true);
    expect(r.strategy).toBe('noop');
    expect(r.newContent).toBe(original);
  });

  it('applyEditSequence reports noopCount and unchanged flag', () => {
    const original = `const x = 1;\nconst y = 2;`;
    const result = applyEditSequence(original, [
      { path: 'foo.ts', search: `const x = 1;`, replace: `const x = 1;` },
      { path: 'foo.ts', search: `const y = 2;`, replace: `const y = 2;` },
    ]);
    expect(result.applied).toBe(2);
    expect(result.noopCount).toBe(2);
    expect(result.unchanged).toBe(true);
    expect(result.finalContent).toBe(original);
  });

  it('applyEditSequence reports unchanged=false when ANY edit produces a real change', () => {
    const original = `const x = 1;\nconst y = 2;`;
    const result = applyEditSequence(original, [
      { path: 'foo.ts', search: `const x = 1;`, replace: `const x = 1;` }, // noop
      { path: 'foo.ts', search: `const y = 2;`, replace: `const y = 999;` }, // real
    ]);
    expect(result.applied).toBe(2);
    expect(result.noopCount).toBe(1);
    expect(result.unchanged).toBe(false);
    expect(result.finalContent).toContain('const y = 999;');
  });
});

describe('REGRESSION — failed edits must NOT pretend success', () => {
  it('returns success:false when SEARCH does not match', () => {
    const original = `const x = 1;`;
    const r = applyEdit(original, {
      path: 'foo.ts',
      search: `THIS DOES NOT EXIST`,
      replace: `whatever`,
    });
    expect(r.success).toBe(false);
    expect(r.newContent).toBeUndefined();
    expect(r.reason).toBeTruthy();
  });

  it('applyEditSequence reports applied=0, unchanged=true when ALL edits fail', () => {
    const original = `const x = 1;`;
    const result = applyEditSequence(original, [
      { path: 'foo.ts', search: `no-match`, replace: `whatever` },
      { path: 'foo.ts', search: `also-no-match`, replace: `whatever` },
    ]);
    expect(result.applied).toBe(0);
    expect(result.noopCount).toBe(0);
    expect(result.unchanged).toBe(true);
    expect(result.failed).toHaveLength(2);
    expect(result.finalContent).toBe(original);
  });

  it('applyEditSequence applies the successful edits and records the failures', () => {
    const original = `keep me\nchange me`;
    const result = applyEditSequence(original, [
      { path: 'foo.ts', search: `not in file`, replace: `whatever` },
      { path: 'foo.ts', search: `change me`, replace: `changed!` },
    ]);
    expect(result.applied).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.unchanged).toBe(false);
    expect(result.finalContent).toBe(`keep me\nchanged!`);
  });
});

describe('REGRESSION — patch markers must never be saved into files', () => {
  it('applies multiple SEARCH/REPLACE edits cleanly without marker leakage', () => {
    const original = `const a = 1;\nconst b = 2;\n`;
    const result = applyEditSequence(original, [
      { path: 'src/app/page.tsx', search: `const a = 1;`, replace: `const a = 10;` },
      { path: 'src/app/page.tsx', search: `const b = 2;`, replace: `const b = 20;` },
    ]);

    expect(result.applied).toBe(2);
    expect(result.rejected).toBeUndefined();
    expect(result.finalContent).toBe(`const a = 10;\nconst b = 20;\n`);
    expect(result.finalContent).not.toMatch(/<<<<<<<|=======|>>>>>>>/);
  });

  it('rejects a replacement that would leave an orphan marker in TSX', () => {
    const original = `export default function Page() {\n  return <main />;\n}\n`;
    const result = applyEditSequence(original, [
      {
        path: 'src/app/page.tsx',
        search: `  return <main />;`,
        replace: `  return <section />;\n=======`,
      },
    ]);

    expect(result.rejected).toMatch(/SEARCH\/REPLACE marker leaked/);
    expect(result.applied).toBe(0);
    expect(result.unchanged).toBe(true);
    expect(result.finalContent).toBe(original);
  });

  it('does not mutate content when patch application fails', () => {
    const original = `const ok = true;\n`;
    const result = applyEditSequence(original, [
      {
        path: 'src/app/page.tsx',
        search: `const missing = true;`,
        replace: `const missing = false;\n>>>>>>> REPLACE`,
      },
    ]);

    expect(result.applied).toBe(0);
    expect(result.finalContent).toBe(original);
    expect(result.unchanged).toBe(true);
  });

  it('allows auto-fix style patches that remove all existing leaked markers', () => {
    const original = `import Link from 'next/link';\n<<<<<<< SEARCH\nexport default function Page() {\n=======\nexport default function Page() {\n  return <main />;\n}\n>>>>>>> REPLACE\n`;
    const clean = `import Link from 'next/link';\nexport default function Page() {\n  return <main />;\n}\n`;
    const result = applyEditSequence(original, [
      {
        path: 'src/app/page.tsx',
        search: original,
        replace: clean,
      },
    ]);

    expect(result.applied).toBe(1);
    expect(result.rejected).toBeUndefined();
    expect(result.finalContent).toBe(clean);
  });

  it('rejects partial cleanup that leaves any marker behind', () => {
    const original = `<<<<<<< SEARCH\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> REPLACE\n`;
    const result = applyEditSequence(original, [
      {
        path: 'src/app/page.tsx',
        search: `<<<<<<< SEARCH\n`,
        replace: '',
      },
    ]);

    expect(result.rejected).toMatch(/SEARCH\/REPLACE marker leaked/);
    expect(result.finalContent).toBe(original);
  });
});

describe('REGRESSION — CSS patches must not leak SEARCH/REPLACE markers', () => {
  it('strips accidental patch separators from app/globals.css replacement content', () => {
    const original = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`;
    const result = applyEditSequence(original, [
      {
        path: 'app/globals.css',
        search: original,
        replace: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n=======\n`,
      },
    ]);

    expect(result.applied).toBe(1);
    expect(result.finalContent).toBe(
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
    );
    expect(result.finalContent).not.toContain('=======');
  });
});
