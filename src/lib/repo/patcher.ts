/**
 * Pure file-patcher.
 *
 *  applyEdit(original, edit) → { success, newContent?, reason? }
 *
 *  Tries in order, stopping at the first success:
 *    1. Exact substring match (most reliable)
 *    2. Line-ending-normalized match  (CRLF / LF differences)
 *    3. Trailing-whitespace-stripped match
 *    4. Per-line trimmed match  (last-resort, preserves replacement indentation
 *       by aligning with the indent of the matched first line in the original)
 *
 *  Always replaces only the FIRST occurrence — if the model wants to patch
 *  multiple places it must emit multiple SEARCH/REPLACE blocks.
 *
 *  BUG FIX (2026-01) — `String.prototype.replace(string, string)` interprets
 *  `$&`, `$1`, `$$`, `$'`, `` $` `` in the REPLACE string. When the AI emits
 *  any of those characters in a SEARCH/REPLACE block (perfectly legal in
 *  TypeScript: template literals, regex constructors, JSX placeholders),
 *  the replacement was silently corrupted — the patcher reported "applied"
 *  but the file contained garbage. We now use the function-form callback
 *  `replace(search, () => replace)` which treats the return value as a
 *  literal, no interpolation. This matches what every patch consumer
 *  actually wants.
 */

import type { ExtractedEdit } from './extractors';
import { sanitizeCssContent } from './cssSanitizer';

export interface PatchResult {
  success: boolean;
  newContent?: string;
  reason?: string;
  strategy?: 'exact' | 'eol' | 'trailing-ws' | 'line-trim' | 'noop';
}

/**
 * Drop-in replacement for `haystack.replace(needle, replacement)` that
 * is SAFE against `$`-pattern interpolation. Always replaces only the
 * first occurrence (same as the string-form of `replace`).
 */
function literalReplaceFirst(
  haystack: string,
  needle: string,
  replacement: string
): string {
  const idx = haystack.indexOf(needle);
  if (idx < 0) return haystack;
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

function normalizeEol(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripTrailingWs(s: string): string {
  return s.replace(/[ \t]+(?=\n)/g, '').replace(/[ \t]+$/g, '');
}

function lineTrim(s: string): string {
  return s.split('\n').map((l) => l.trim()).join('\n');
}

function indexOfTrimmedLines(
  haystack: string,
  needle: string
): { startLine: number; endLine: number; baseIndent: string } | null {
  const hLines = haystack.split('\n');
  const nLines = needle.split('\n').map((l) => l.trim()).filter((_, i, arr) => {
    // keep all lines including empties in the middle; but trim leading/trailing empties
    if (i === 0 || i === arr.length - 1) return arr[i].trim().length > 0;
    return true;
  });
  if (nLines.length === 0) return null;

  for (let i = 0; i <= hLines.length - nLines.length; i++) {
    let matched = true;
    for (let j = 0; j < nLines.length; j++) {
      if (hLines[i + j].trim() !== nLines[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      const firstLine = hLines[i];
      const indentMatch = firstLine.match(/^[ \t]*/);
      const baseIndent = indentMatch ? indentMatch[0] : '';
      return { startLine: i, endLine: i + nLines.length - 1, baseIndent };
    }
  }
  return null;
}

function reindentReplacement(replace: string, baseIndent: string): string {
  if (!baseIndent) return replace;
  const lines = replace.split('\n');
  // Detect existing min indent in replace so we don't double-indent
  const indents = lines.filter((l) => l.trim().length > 0).map((l) => l.match(/^[ \t]*/)?.[0] ?? '');
  const minLen = indents.length > 0 ? Math.min(...indents.map((s) => s.length)) : 0;
  return lines
    .map((l) => (l.trim().length === 0 ? l : baseIndent + l.slice(minLen)))
    .join('\n');
}

export function applyEdit(original: string, edit: ExtractedEdit): PatchResult {
  const replace = sanitizeCssContent(edit.path, edit.replace);
  if (!edit.search) {
    return { success: false, reason: 'SEARCH block was empty' };
  }
  // Trivial early-out: SEARCH equals REPLACE → no-op success.
  // Flag this clearly so callers can distinguish "AI re-emitted the
  // same code" from "AI made an actual change".
  if (edit.search === replace) {
    return { success: true, newContent: original, strategy: 'noop' };
  }

  // Strategy 1: exact substring (literal — no $-pattern interpolation)
  if (original.includes(edit.search)) {
    return {
      success: true,
      newContent: literalReplaceFirst(original, edit.search, replace),
      strategy: 'exact',
    };
  }

  // Strategy 2: EOL-normalized
  const eolOriginal = normalizeEol(original);
  const eolSearch = normalizeEol(edit.search);
  if (eolOriginal.includes(eolSearch)) {
    const eolReplace = normalizeEol(replace);
    return {
      success: true,
      newContent: literalReplaceFirst(eolOriginal, eolSearch, eolReplace),
      strategy: 'eol',
    };
  }

  // Strategy 3: trailing-whitespace-stripped
  const tsOriginal = stripTrailingWs(eolOriginal);
  const tsSearch = stripTrailingWs(eolSearch);
  if (tsSearch && tsOriginal.includes(tsSearch)) {
    const tsReplace = stripTrailingWs(normalizeEol(replace));
    return {
      success: true,
      newContent: literalReplaceFirst(tsOriginal, tsSearch, tsReplace),
      strategy: 'trailing-ws',
    };
  }

  // Strategy 4: per-line trimmed (preserve indent from original first matched line)
  const lt = indexOfTrimmedLines(eolOriginal, eolSearch);
  if (lt) {
    const hLines = eolOriginal.split('\n');
    const newReplace = reindentReplacement(normalizeEol(replace), lt.baseIndent);
    const before = hLines.slice(0, lt.startLine).join('\n');
    const after = hLines.slice(lt.endLine + 1).join('\n');
    const out = [before, newReplace, after].filter((s, i) => i !== 1 || s.length > 0).join('\n');
    return {
      success: true,
      newContent: out,
      strategy: 'line-trim',
    };
  }

  return {
    success: false,
    reason:
      'SEARCH block did not match any region of the file (tried exact, EOL-normalized, whitespace-stripped, and per-line trimmed).',
  };
}

export function applyEditSequence(
  original: string,
  edits: ExtractedEdit[]
): {
  finalContent: string;
  applied: number;
  /** Edits that matched but produced no actual change (search === replace). */
  noopCount: number;
  failed: Array<{ edit: ExtractedEdit; reason: string }>;
  strategies: string[];
  /** True if the returned `finalContent` is byte-identical to `original`. */
  unchanged: boolean;
} {
  let current = original;
  let applied = 0;
  let noopCount = 0;
  const failed: Array<{ edit: ExtractedEdit; reason: string }> = [];
  const strategies: string[] = [];

  for (const e of edits) {
    const r = applyEdit(current, e);
    if (r.success && typeof r.newContent === 'string') {
      current = r.newContent;
      applied++;
      if (r.strategy === 'noop') noopCount++;
      if (r.strategy) strategies.push(r.strategy);
    } else {
      failed.push({
        edit: e,
        reason: r.reason ?? 'unknown patcher failure',
      });
    }
  }
  return {
    finalContent: current,
    applied,
    noopCount,
    failed,
    strategies,
    unchanged: current === original,
  };
}
