/**
 * Regression tests for the TerminalPanel ANSI / control-code cleanup
 * helper (`cleanControlCodes`).
 *
 * Before the fix, the terminal panel emitted raw artefacts like:
 *
 *   ⠋ [?25l[1G[0K Installing dependencies…[?25h
 *
 * because the ANSI regex only matched SGR (color) sequences with the
 * `m` final letter, letting cursor-movement (`G`), clear-line (`K`),
 * hide/show-cursor (`?25l`/`?25h`), bell (`\x07`), backspace (`\b`), and
 * carriage-return-based spinner frames leak straight into the DOM.
 *
 * The fix strips all CSI escapes that are NOT SGR, drops OSC sequences,
 * collapses CR-based progress spinners to the latest frame, and removes
 * other C0 control characters that can't safely render in a `<div>`.
 */

import { describe, it, expect } from 'vitest';
import { cleanControlCodes } from '@/lib/terminal/ansi';

describe('cleanControlCodes — SGR is preserved', () => {
  it('keeps color codes (final letter `m`) verbatim', () => {
    const input = '\x1B[31mERR\x1B[0m: failed';
    const out = cleanControlCodes(input);
    // The SGR sequences must survive so tokenizeAnsi can colorise them.
    expect(out).toContain('\x1B[31m');
    expect(out).toContain('\x1B[0m');
    expect(out).toContain('ERR');
    expect(out).toContain(': failed');
  });

  it('keeps multi-parameter SGR (e.g. bold+colour)', () => {
    const input = '\x1B[1;33mWARN\x1B[0m';
    expect(cleanControlCodes(input)).toBe(input);
  });
});

describe('REGRESSION — non-SGR CSI escapes must be stripped', () => {
  it('strips cursor-position codes like `[1G`', () => {
    const input = 'before\x1B[1Gafter';
    expect(cleanControlCodes(input)).toBe('beforeafter');
  });

  it('strips clear-line codes like `[0K` and `[2K`', () => {
    expect(cleanControlCodes('foo\x1B[0Kbar')).toBe('foobar');
    expect(cleanControlCodes('foo\x1B[2Kbar')).toBe('foobar');
  });

  it('strips hide/show-cursor codes `[?25l` and `[?25h`', () => {
    const input = '\x1B[?25lspinner\x1B[?25h';
    expect(cleanControlCodes(input)).toBe('spinner');
  });

  it('strips cursor-up/down/forward/back (A/B/C/D)', () => {
    expect(cleanControlCodes('A\x1B[1AB')).toBe('AB');
    expect(cleanControlCodes('A\x1B[3BC')).toBe('AC');
    expect(cleanControlCodes('A\x1B[5CB')).toBe('AB');
    expect(cleanControlCodes('A\x1B[2DC')).toBe('AC');
  });

  it('strips clear-screen `[2J`', () => {
    expect(cleanControlCodes('\x1B[2Jfresh')).toBe('fresh');
  });

  it('strips save/restore cursor `[s` and `[u`', () => {
    expect(cleanControlCodes('\x1B[sfoo\x1B[u')).toBe('foo');
  });
});

describe('REGRESSION — OSC sequences must be stripped', () => {
  it('strips title-setting OSC `\\x1B]0;title\\x07`', () => {
    const input = 'before\x1B]0;Setting Title\x07after';
    expect(cleanControlCodes(input)).toBe('beforeafter');
  });

  it('strips OSC terminated with ESC-backslash', () => {
    const input = 'before\x1B]2;Title\x1B\\after';
    expect(cleanControlCodes(input)).toBe('beforeafter');
  });
});

describe('REGRESSION — CR-based spinner frames collapse to latest', () => {
  it('keeps only the text after the LAST `\\r` on each line', () => {
    // Real example: yarn / npm spinners overwrite the same line.
    const input = '⠋ Building\r⠙ Building\r⠹ Building';
    expect(cleanControlCodes(input)).toBe('⠹ Building');
  });

  it('applies per-line — newlines are preserved as line boundaries', () => {
    const input = 'one\r1\ntwo\r2\nthree';
    expect(cleanControlCodes(input)).toBe('1\n2\nthree');
  });

  it('leaves text untouched when no `\\r` is present', () => {
    const input = 'plain log line\nanother line';
    expect(cleanControlCodes(input)).toBe(input);
  });
});

describe('REGRESSION — stray C0 control characters are dropped', () => {
  it('drops the bell character `\\x07`', () => {
    expect(cleanControlCodes('alert\x07!')).toBe('alert!');
  });

  it('drops backspace `\\b` (cannot render in plain DOM)', () => {
    expect(cleanControlCodes('foo\x08bar')).toBe('foobar');
  });

  it('drops ESC charset selectors like `\\x1B(B`', () => {
    expect(cleanControlCodes('\x1B(Btext')).toBe('text');
  });

  it('keeps tab and newline (they render meaningfully)', () => {
    expect(cleanControlCodes('a\tb\nc')).toBe('a\tb\nc');
  });
});

describe('cleanControlCodes — composition (real-world npm output)', () => {
  it('cleans the exact failure-mode line from the bug report', () => {
    // Approximation of what `npm install` actually emits with a spinner:
    //   ESC[?25l ⠋ install ESC[1G ESC[0K ESC[?25h
    const input =
      '\x1B[?25l⠋ install\x1B[1G\x1B[0K⠙ install\x1B[1G\x1B[0K⠹ install done\x1B[?25h';
    const out = cleanControlCodes(input);
    expect(out).not.toMatch(/\[1G/);
    expect(out).not.toMatch(/\[0K/);
    expect(out).not.toMatch(/\?25l/);
    expect(out).not.toMatch(/\?25h/);
    // The cleaned line should contain only the final spinner frame's
    // text — no escape junk.
    expect(out).toContain('install done');
  });

  it('keeps the SGR colour wrapping intact through the cleanup', () => {
    // Realistic mix: SGR + cursor + spinner + clear.
    const input =
      '\x1B[?25l\x1B[31m✖\x1B[0m \x1B[1G\x1B[0Kbuild failed\x1B[?25h';
    const out = cleanControlCodes(input);
    expect(out).toContain('\x1B[31m');
    expect(out).toContain('\x1B[0m');
    expect(out).toContain('build failed');
    expect(out).not.toMatch(/\?25/);
    expect(out).not.toMatch(/\[1G/);
    expect(out).not.toMatch(/\[0K/);
  });

  it('returns the input unchanged for a plain string with no controls', () => {
    expect(cleanControlCodes('hello world\n')).toBe('hello world\n');
  });

  it('handles empty / null-ish input', () => {
    expect(cleanControlCodes('')).toBe('');
  });

  it('REGRESSION — chunk containing ONLY control codes becomes empty (TerminalPanel must NOT fall back to raw text)', () => {
    // Real bug: WebContainer streams emit chunks like `\x1B[1G` and
    // `\x1B[0K` AS THEIR OWN CHUNK. Each chunk becomes its own
    // TerminalLine. Before the fix, when tokenizeAnsi(text) returned
    // an empty segments array, TerminalPanel rendered `line.text`
    // verbatim — and the user saw `[1G`, `[0K` on screen because the
    // leading ESC byte is invisible.
    //
    // Contract this test enforces: control-only chunks clean to "".
    // Combined with the render-side change to return `null` when
    // segs.length === 0, the user sees nothing instead of `[1G`.
    expect(cleanControlCodes('\x1B[1G')).toBe('');
    expect(cleanControlCodes('\x1B[0K')).toBe('');
    expect(cleanControlCodes('\x1B[?25l')).toBe('');
    expect(cleanControlCodes('\x1B[?25h')).toBe('');
    expect(cleanControlCodes('\x1B[2K')).toBe('');
    expect(cleanControlCodes('\x1B[1G\x1B[0K')).toBe('');
    // And a chunk that combines a leading control with a real char
    // keeps the real char (so output is partially visible, not empty).
    expect(cleanControlCodes('\x1B[1G|')).toBe('|');
  });
});
