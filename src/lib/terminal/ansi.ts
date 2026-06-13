/**
 * ANSI / control-code sanitizer for the TerminalPanel.
 *
 * Strips terminal artefacts that can't safely render in a plain DOM
 * <div> — cursor moves, line clears, hide/show cursor, OSC titles,
 * bell, backspace, etc. Keeps SGR colour escapes intact so the
 * downstream tokenizer can colourise them.
 *
 * Also applies minimal `\r` (carriage-return) semantics: text after the
 * LAST `\r` on a line wins, collapsing spinner-style progress updates
 * ("⠋ Building", "⠙ Building", "⠹ Building") into the latest frame.
 *
 * BUG #3 FIX (2026-01) — the previous regex only handled SGR (`m`
 * suffix), letting `[1G`, `[0K`, `[?25l`, OSC titles, and CR-based
 * spinner frames bleed straight into the log. This module is now the
 * SINGLE source of truth — TerminalPanel imports from here.
 *
 * Kept as a pure `.ts` helper (no JSX, no React) so it can be unit
 * tested directly without spinning up a Vite JSX transform.
 */

// CSI sequence: ESC [ <params> <intermediate?> <final letter>
// eslint-disable-next-line no-control-regex
const CSI_REGEX = /\x1B\[([0-9;?]*)([A-Za-z])/g;
// OSC sequence: ESC ] <text> BEL  (or ESC ] <text> ESC \)
// eslint-disable-next-line no-control-regex
const OSC_REGEX = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g;
// Stray ESC + single-char (charset selectors like `\x1B(B`).
// eslint-disable-next-line no-control-regex
const ESC_SHORT_REGEX = /\x1B[()][AB012]/g;
// Other C0 control characters we want to drop entirely (bell, backspace
// can't render, vertical tab, form feed, …). We KEEP `\t`, `\n`, and
// intentionally process `\r` separately below.
// eslint-disable-next-line no-control-regex
const C0_DROP_REGEX = /[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F\x7F]/g;

/**
 * Strip terminal control codes EXCEPT SGR (which carries colour info
 * for the downstream tokenizer). See module docstring for details.
 */
export function cleanControlCodes(input: string): string {
  if (!input) return input;
  let out = input;

  // 1. Drop OSC sequences (terminal title, hyperlinks).
  OSC_REGEX.lastIndex = 0;
  out = out.replace(OSC_REGEX, '');

  // 2. Replace CSI sequences:
  //    - SGR (final letter `m`) → keep verbatim.
  //    - Everything else (G/K/H/J/A/B/C/D/f/s/u/h/l/?) → drop.
  CSI_REGEX.lastIndex = 0;
  out = out.replace(CSI_REGEX, (full, _params, finalChar) => {
    return finalChar === 'm' ? full : '';
  });

  // 3. Drop ESC charset selectors like `\x1B(B`.
  ESC_SHORT_REGEX.lastIndex = 0;
  out = out.replace(ESC_SHORT_REGEX, '');

  // 4. Apply carriage-return semantics per line.
  if (out.includes('\r')) {
    out = out
      .split('\n')
      .map((line) => {
        const idx = line.lastIndexOf('\r');
        return idx >= 0 ? line.slice(idx + 1) : line;
      })
      .join('\n');
  }

  // 5. Drop remaining low-ASCII control characters (bell, backspace …).
  C0_DROP_REGEX.lastIndex = 0;
  out = out.replace(C0_DROP_REGEX, '');

  return out;
}
