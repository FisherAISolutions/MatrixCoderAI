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
  background: #f9fafb;
  color: #111827;
}

::-webkit-scrollbar {
  width: 8px;
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 9999px;
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

const UNSAFE_APPLY_SELECTOR_REGEX = /::(?:-webkit-scrollbar(?:-thumb|-track|-corner)?|before|after)\b/i;
const RULE_START_REGEX = /^\s*([^@{}][^{]*?)\s*\{\s*$/;

const APPLY_CLASS_DECLARATIONS: Record<string, string[]> = {
  'w-2': ['width: 8px;'],
  'bg-transparent': ['background: transparent;'],
  'bg-gray-50': ['background: #f9fafb;'],
  'bg-gray-100': ['background: #f3f4f6;'],
  'bg-gray-200': ['background: #e5e7eb;'],
  'bg-gray-300': ['background: #d1d5db;'],
  'text-gray-900': ['color: #111827;'],
  rounded: ['border-radius: 0.25rem;'],
  'rounded-full': ['border-radius: 9999px;'],
};

function applyClassesToCss(classes: string[]): string[] | null {
  const declarations: string[] = [];
  for (const className of classes) {
    const mapped = APPLY_CLASS_DECLARATIONS[className];
    if (!mapped) return null;
    declarations.push(...mapped);
  }
  return declarations;
}

function rewriteUnsafePseudoApply(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  const selectorStack: Array<{ selector: string; depth: number }> = [];

  for (const line of lines) {
    const ruleStart = line.match(RULE_START_REGEX);
    if (ruleStart) {
      selectorStack.push({ selector: ruleStart[1], depth: 1 });
      out.push(line);
      continue;
    }

    const active = selectorStack[selectorStack.length - 1];
    const apply = line.match(/^(\s*)@apply\s+([^;]+);\s*$/);
    if (active && apply && UNSAFE_APPLY_SELECTOR_REGEX.test(active.selector)) {
      const declarations = applyClassesToCss(apply[2].trim().split(/\s+/));
      if (declarations) {
        out.push(...declarations.map((declaration) => `${apply[1]}${declaration}`));
      } else {
        out.push(line);
      }
    } else {
      out.push(line);
    }

    if (active) {
      const opens = (line.match(/{/g) ?? []).length;
      const closes = (line.match(/}/g) ?? []).length;
      active.depth += opens - closes;
      if (active.depth <= 0) selectorStack.pop();
    }
  }

  return out.join('\n');
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

  cleaned = rewriteUnsafePseudoApply(cleaned);

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

function unsafePseudoApplyIssues(file: FileNode & { content: string }): CssSanityIssue[] {
  const issues: CssSanityIssue[] = [];
  const lines = file.content.split(/\r?\n/);
  const selectorStack: Array<{ selector: string; depth: number }> = [];

  lines.forEach((line, index) => {
    const ruleStart = line.match(RULE_START_REGEX);
    if (ruleStart) {
      selectorStack.push({ selector: ruleStart[1], depth: 1 });
      return;
    }

    const active = selectorStack[selectorStack.length - 1];
    if (active && UNSAFE_APPLY_SELECTOR_REGEX.test(active.selector) && /^\s*@apply\b/.test(line)) {
      issues.push({
        path: file.path,
        line: index + 1,
        reason: `Tailwind @apply is unsafe inside pseudo-element selector "${active.selector.trim()}". Use plain CSS properties instead.`,
        snippet: snippetAround(lines, index),
      });
    }

    if (active) {
      const opens = (line.match(/{/g) ?? []).length;
      const closes = (line.match(/}/g) ?? []).length;
      active.depth += opens - closes;
      if (active.depth <= 0) selectorStack.pop();
    }
  });

  return issues;
}

export function findCssSanityIssues(files: FileNode[]): CssSanityIssue[] {
  const issues: CssSanityIssue[] = [];
  const cssFiles = flattenTree(files).filter(
    (file): file is FileNode & { content: string } =>
      file.type === 'file' && typeof file.content === 'string' && isCssPath(file.path)
  );

  for (const file of cssFiles) {
    issues.push(...unsafePseudoApplyIssues(file));
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
