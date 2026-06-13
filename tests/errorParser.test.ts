import { describe, it, expect } from 'vitest';
import {
  parseValidationOutput,
  looksLikeFailure,
  extractFailureExcerpt,
  stripAnsi,
} from '@/lib/validation/errorParser';

describe('stripAnsi', () => {
  it('removes ANSI color codes', () => {
    const input = '\x1B[31merror\x1B[0m: something';
    expect(stripAnsi(input)).toBe('error: something');
  });
});

describe('parseValidationOutput — file-prefixed TS errors', () => {
  it('parses standard tsc errors with file:line:col', () => {
    const log = `src/app/page.tsx(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/lib/foo.ts(3,10): error TS2304: Cannot find name 'window'.`;
    const errs = parseValidationOutput(log, 'typescript');
    expect(errs).toHaveLength(2);
    expect(errs[0]).toMatchObject({
      file: 'src/app/page.tsx',
      line: 12,
      column: 5,
      code: 'TS2322',
      source: 'typescript',
    });
    expect(errs[1].code).toBe('TS2304');
  });
});

describe('parseValidationOutput — bare TS errors (REGRESSION TEST)', () => {
  it('parses TS5023, TS18003, TS6053 without file prefix', () => {
    // These are the "0 errors parsed" failure mode the user hit when
    // tsc couldn't even start (bad config, no input files, etc).
    const log = `error TS5023: Unknown compiler option 'foo'.
error TS18003: No inputs were found in config file '/tsconfig.json'.
error TS6053: File 'missing.ts' not found.`;
    const errs = parseValidationOutput(log, 'typescript');
    expect(errs.length).toBeGreaterThanOrEqual(3);
    const codes = errs.map((e) => e.code);
    expect(codes).toContain('TS5023');
    expect(codes).toContain('TS18003');
    expect(codes).toContain('TS6053');
  });
});

describe('parseValidationOutput — npm errors (REGRESSION TEST)', () => {
  it('parses npm ERR! and npm error lines', () => {
    const log = `npm ERR! code ENOENT
npm ERR! syscall open
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/some-pkg`;
    const errs = parseValidationOutput(log, 'unknown');
    expect(errs.length).toBeGreaterThanOrEqual(2);
    expect(errs.every((e) => e.source === 'module')).toBe(true);
    expect(errs.some((e) => e.message.includes('ENOENT'))).toBe(true);
    expect(errs.some((e) => e.message.includes('E404'))).toBe(true);
  });
});

describe('parseValidationOutput — command not found (REGRESSION TEST)', () => {
  it('catches "sh: tsc: not found" — the exact "0 errors" failure mode', () => {
    // The user-reported failure: AI scaffolds Next.js but omits
    // `typescript` from devDeps. tsc binary missing → shell error.
    // Before the fix, this matched no regex and looked like "0 errors".
    const log = `sh: tsc: not found
exit 127`;
    const errs = parseValidationOutput(log, 'typescript');
    expect(errs.length).toBeGreaterThanOrEqual(1);
    expect(errs[0].source).toBe('module');
    expect(errs[0].message).toMatch(/Command not found.*tsc/);
  });

  it('catches "command not found" in various shells', () => {
    const log = `bash: next: command not found`;
    const errs = parseValidationOutput(log, 'nextjs');
    expect(errs.length).toBeGreaterThanOrEqual(1);
    expect(errs[0].message).toMatch(/Command not found.*next/);
  });
});

describe('parseValidationOutput — module not found', () => {
  it('catches Next.js webpack module-not-found', () => {
    const log = `Module not found: Can't resolve 'framer-motion' in '/src/app'`;
    const errs = parseValidationOutput(log, 'nextjs');
    expect(errs.find((e) => e.message.includes('framer-motion'))).toBeTruthy();
  });

  it('catches generic "Cannot find module" from tsc', () => {
    const log = `Cannot find module 'foo' or its corresponding type declarations.`;
    const errs = parseValidationOutput(log, 'typescript');
    expect(errs.find((e) => e.message.includes('foo'))).toBeTruthy();
  });
});

describe('looksLikeFailure', () => {
  it('returns true for common failure indicators', () => {
    expect(looksLikeFailure('Failed to compile.\n\n./src/page.tsx:1:1')).toBe(true);
    expect(looksLikeFailure('build failed')).toBe(true);
    expect(looksLikeFailure('error TS5023: Unknown')).toBe(true);
    expect(looksLikeFailure('Module not found')).toBe(true);
    expect(looksLikeFailure('npm ERR! something')).toBe(true);
    expect(looksLikeFailure('command not found: tsc')).toBe(true);
    expect(looksLikeFailure('Found 3 errors in 2 files')).toBe(true);
  });

  it('returns false for clean / success output', () => {
    expect(looksLikeFailure('Compiled successfully.')).toBe(false);
    expect(looksLikeFailure('')).toBe(false);
    expect(looksLikeFailure('Generating static pages (8/8)')).toBe(false);
  });
});

describe('extractFailureExcerpt', () => {
  it('returns the whole log when under maxChars', () => {
    expect(extractFailureExcerpt('short log', 1000)).toBe('short log');
  });

  it('centres around the LAST error marker when truncating', () => {
    // Build a log where the actual error is at the end.
    const head = 'info line\n'.repeat(500);
    const tail = '\nerror TS5023: Unknown compiler option\nbad config';
    const log = head + tail;

    const excerpt = extractFailureExcerpt(log, 500);
    expect(excerpt.length).toBeLessThanOrEqual(550); // 500 + ellipsis padding
    expect(excerpt).toContain('TS5023');
  });

  it('returns "(no output)" for empty input', () => {
    expect(extractFailureExcerpt('', 100)).toBe('(no output)');
  });

  it('falls back to tail when no error markers present', () => {
    const log = 'plain info line\n'.repeat(200);
    const excerpt = extractFailureExcerpt(log, 200);
    expect(excerpt.length).toBeLessThanOrEqual(250);
    // Last line should be near the end of the log
    expect(excerpt.endsWith('plain info line\n') || excerpt.endsWith('plain info line')).toBe(true);
  });
});
