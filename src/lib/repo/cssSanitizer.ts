import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from './heuristics';

const PATCH_MARKER_LINE = /^\s*(?:<{5,}\s*SEARCH|={5,}|>{5,}\s*REPLACE)\s*$/i;
const FENCE_LINE = /^\s*```(?:css)?\s*$/i;
const JS_PATH_COMMENT_LINE = /^\s*\/\/\s*(?:path|file)\s*:/i;

export const FALLBACK_GLOBALS_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
}
`;

export interface CssSanityIssue {
  path: string;
  line: number;
  reason: string;
  snippet: string;
}

export function isCssPath(path: string): boolean {
  return path.endsWith('.css');
}

function isGlobalsCssPath(path: string): boolean {
  return /(?:^|\/)globals\.css$/i.test(path);
}

export function sanitizeCssContent(path: string, content: string): string {
  if (!isCssPath(path)) return content;

  const hadPatchMarker = content
    .split(/\r?\n/)
    .some((line) => PATCH_MARKER_LINE.test(line));
  let cleaned = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => !FENCE_LINE.test(line))
    .filter((line) => !JS_PATH_COMMENT_LINE.test(line))
    .filter((line) => !PATCH_MARKER_LINE.test(line))
    .join('\n')
    .trim();

  if (isGlobalsCssPath(path)) {
    const hasTailwind =
      /@tailwind\s+base\s*;/.test(cleaned) &&
      /@tailwind\s+components\s*;/.test(cleaned) &&
      /@tailwind\s+utilities\s*;/.test(cleaned);
    if (!hasTailwind && hadPatchMarker) {
      cleaned = FALLBACK_GLOBALS_CSS.trimEnd();
    }
  }

  return cleaned.endsWith('\n') ? cleaned : `${cleaned}\n`;
}

function snippetAround(lines: string[], lineIndex: number, radius = 5): string {
  const start = Math.max(0, lineIndex - radius);
  const end = Math.min(lines.length, lineIndex + radius + 1);
  return lines
    .slice(start, end)
    .map((line, i) => `${String(start + i + 1).padStart(4, ' ')} | ${line}`)
    .join('\n');
}

function looksLikeLooseProse(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(?:\/\*|\*|\/\/|@|[.#:[*&>,+~]|[a-z-]+\s*:|[{}]|--)/i.test(trimmed)) {
    return false;
  }
  if (/^[a-z][\w-]*(?:,\s*[a-z][\w-]*)*\s*\{?$/i.test(trimmed)) return false;
  return /\s/.test(trimmed) && /[a-z]{3,}/i.test(trimmed) && !/[{}:;]/.test(trimmed);
}

export function findCssSanityIssues(files: FileNode[]): CssSanityIssue[] {
  const issues: CssSanityIssue[] = [];
  const cssFiles = flattenTree(files).filter(
    (file): file is FileNode & { content: string } =>
      file.type === 'file' && typeof file.content === 'string' && isCssPath(file.path)
  );

  for (const file of cssFiles) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      let reason = '';
      if (PATCH_MARKER_LINE.test(line)) {
        reason = 'SEARCH/REPLACE patch marker leaked into CSS.';
      } else if (FENCE_LINE.test(line)) {
        reason = 'Markdown code fence leaked into CSS.';
      } else if (JS_PATH_COMMENT_LINE.test(line)) {
        reason = '`// path:` metadata leaked into CSS.';
      } else if (looksLikeLooseProse(line)) {
        reason = 'Non-CSS prose appears in CSS.';
      }
      if (!reason) return;
      issues.push({
        path: file.path,
        line: index + 1,
        reason,
        snippet: snippetAround(lines, index),
      });
    });
  }

  return issues;
}
