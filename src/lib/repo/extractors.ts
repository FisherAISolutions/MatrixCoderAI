/**
 * Assistant-response parsers.
 *
 *  Two kinds of structured output are recognized:
 *
 *  1. CREATE — full-file body in a fenced code block. Existing format from
 *     Phase 1; preserved verbatim so all current AI-create flows keep working.
 *
 *     Form A:  ```ts\n// path: src/foo.ts\n<content>```
 *     Form B:  ```ts\n<content with first-3-lines containing src/foo.ts>```
 *     Form C:  bare ```ts code``` (best-effort filename inference)
 *
 *  2. EDIT  — SEARCH / REPLACE patch for an existing file. New in Phase 3.
 *
 *     ```edit:src/foo.ts
 *     <<<<<<< SEARCH
 *     old code
 *     =======
 *     new code
 *     >>>>>>> REPLACE
 *     ```
 *
 *     Multiple edit fences for the same path = multiple edits applied in order.
 *
 *  All paths are validated to start with `src/` or contain a `/` segment, and
 *  duplicate filenames within a single CREATE pass are de-duplicated.
 */

export interface ExtractedCreate {
  path: string;
  name: string;
  content: string;
  language: string;
}

export interface ExtractedEdit {
  path: string;
  search: string;
  replace: string;
}

export interface ExtractedResponse {
  creates: ExtractedCreate[];
  edits: ExtractedEdit[];
  /**
   * Paths the AI tried to edit via an `edit:<path>` fence whose body
   * did NOT contain a usable SEARCH/REPLACE block (missing
   * `<<<<<<< SEARCH` marker, missing `=======`, missing
   * `>>>>>>> REPLACE`, or empty SEARCH).
   *
   * The previous behaviour was to silently `console.warn` and drop
   * the fence — the user then saw the AI's prose ("Files written: …")
   * but no actual mutation happened. Surfacing these to the caller
   * lets ChatComposer emit a HARD, persistent patch-failure message
   * so the user knows the AI's response was malformed.
   */
  malformedEdits: string[];
  /**
   * Per-path diagnostic explaining WHY the fence was rejected.
   *
   * 2026-01 added so ChatComposer can show the user the exact missing
   * marker (e.g. "Patch rejected: missing `<<<<<<< SEARCH` marker.")
   * instead of a generic "missing required markers" blob. Keys mirror
   * `malformedEdits`. Callers that don't need diagnostics can ignore
   * this field.
   */
  malformedEditReasons: Record<string, string>;
}

export interface ResponseCompletenessIssue {
  kind: 'unclosed-fence' | 'unextracted-path' | 'unextracted-listed-file';
  path?: string;
  message: string;
}

export interface ResponseCompletenessAudit {
  ok: boolean;
  blocking: boolean;
  issues: ResponseCompletenessIssue[];
  lastCompletePath?: string;
}

// ---------- EDIT block parsing ----------

// Match ```edit:<path>\n<body>``` — body must contain SEARCH/REPLACE markers
const EDIT_FENCE_REGEX =
  /```edit:\s*([^\s`]+)\s*\n([\s\S]*?)```/g;

// Inside an edit body, match one or more SEARCH / REPLACE pairs
const SEARCH_REPLACE_REGEX =
  /<{5,}\s*SEARCH\s*\n([\s\S]*?)\n={5,}\s*\n([\s\S]*?)\n>{5,}\s*REPLACE/g;

/**
 * Normalize a path emitted by the AI inside an `edit:` fence.
 *
 * Models are inconsistent: any one of `src/foo.ts`, `./src/foo.ts`,
 * `/src/foo.ts`, `src\foo.ts`, or `  src/foo.ts ` may appear for the same
 * file. The downstream pipeline (ChatComposer → byPath map) does exact
 * string compares against `FileNode.path`, which are always stored as
 * forward-slash, no-prefix paths (e.g. `src/app/layout.tsx`). Any
 * mismatch causes the patch to silently target "no file" and the AI's
 * "Patched file successfully" assertion becomes a lie.
 *
 * This fixes the primary bug reported in PROBLEM_STATEMENT — path
 * normalization mismatch between extractor output and file tree keys.
 */
export function normalizeEditPath(raw: string): string {
  let p = raw.trim();
  if (!p) return p;
  // Windows separators → POSIX
  p = p.replace(/\\/g, '/');
  // Strip surrounding quotes/backticks the model sometimes emits
  p = p.replace(/^["'`]+|["'`]+$/g, '');
  // Collapse repeated leading "./" and "/" so "././src/foo" → "src/foo"
  // and "/src/foo" → "src/foo".
  // Do this iteratively because a single regex pass can leave artefacts
  // like "./" → ""  but "././" → "./" — looping ensures convergence.
  // (At most 3 iterations in practice; cap defensively to avoid infinite
  // loops on adversarial input.)
  for (let i = 0; i < 8; i++) {
    const before = p;
    p = p.replace(/^\.\/+/, '');
    p = p.replace(/^\/+/, '');
    if (p === before) break;
  }
  // Collapse internal "//" runs that occasionally creep in
  p = p.replace(/\/{2,}/g, '/');
  return p;
}

function extractEdits(content: string): {
  edits: ExtractedEdit[];
  malformedEdits: string[];
  malformedEditReasons: Record<string, string>;
} {
  const out: ExtractedEdit[] = [];
  const malformed: string[] = [];
  const reasons: Record<string, string> = {};
  EDIT_FENCE_REGEX.lastIndex = 0;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = EDIT_FENCE_REGEX.exec(content)) !== null) {
    const rawPath = fenceMatch[1];
    const normalizedPath = normalizeEditPath(rawPath);
    const body = fenceMatch[2];
    if (!normalizedPath) continue;

    // Minimal, prefixed debug trace so we can see exactly what the model
    // emitted vs. what we'll try to look up in the file tree. Kept on
    // info-level (not warn) so it never trips error monitors but is
    // visible in the browser console when investigating patch issues.
    if (rawPath.trim() !== normalizedPath) {
      console.info(
        `[extractor] normalized edit path "${rawPath.trim()}" → "${normalizedPath}"`
      );
    }

    SEARCH_REPLACE_REGEX.lastIndex = 0;
    let srMatch: RegExpExecArray | null;
    let foundAny = false;
    while ((srMatch = SEARCH_REPLACE_REGEX.exec(body)) !== null) {
      const [, search, replace] = srMatch;
      out.push({ path: normalizedPath, search, replace });
      foundAny = true;
    }

    if (!foundAny) {
      // BUG FIX (2026-01) — silent `console.warn` only. The user saw the
      // AI's prose ("Files written: …") but no mutation actually
      // happened. Track these as MALFORMED so ChatComposer can emit a
      // hard, persistent patch-failure system message.
      //
      // Diagnostic upgrade — instead of "missing required markers"
      // (generic), figure out WHICH markers are missing and report it
      // exactly. The Coding Agent has been repeatedly forgetting the
      // `<<<<<<< SEARCH` opener, so a specific reason makes the next
      // retry far more likely to succeed.
      const hasOpen = /<{5,}\s*SEARCH/.test(body);
      const hasMid = /={5,}/.test(body);
      const hasClose = />{5,}\s*REPLACE/.test(body);
      let reason = '';
      if (!hasOpen && hasMid && hasClose) {
        // Most common AI mistake — body starts with the existing code
        // line, then `=======`, then replacement, then `>>>>>>> REPLACE`.
        reason =
          'Patch rejected: missing `<<<<<<< SEARCH` marker. The first ' +
          'line of every edit body MUST be `<<<<<<< SEARCH` on its own ' +
          'line, immediately followed by the exact existing code.';
      } else if (hasOpen && !hasMid && hasClose) {
        reason =
          'Patch rejected: missing `=======` separator between the ' +
          'SEARCH and REPLACE blocks.';
      } else if (hasOpen && hasMid && !hasClose) {
        reason =
          'Patch rejected: missing `>>>>>>> REPLACE` marker at the end ' +
          'of the replacement code.';
      } else if (!hasOpen && !hasMid && !hasClose) {
        reason =
          'Patch rejected: the edit fence contained no SEARCH/REPLACE ' +
          'markers at all. Use the documented `<<<<<<< SEARCH` / ' +
          '`=======` / `>>>>>>> REPLACE` format.';
      } else {
        reason =
          'Patch rejected: SEARCH/REPLACE markers were present but the ' +
          'block could not be parsed. Make sure each marker is on its ' +
          'own line and appears in the order SEARCH → ======= → REPLACE.';
      }
      console.warn(
        `[extractor] edit fence for "${normalizedPath}" — ${reason}`
      );
      if (!malformed.includes(normalizedPath)) malformed.push(normalizedPath);
      // Preserve the first reason if multiple fences target the same
      // path (typical AI behaviour: it copies the same broken pattern
      // through every edit).
      if (!reasons[normalizedPath]) reasons[normalizedPath] = reason;
    }
  }
  return { edits: out, malformedEdits: malformed, malformedEditReasons: reasons };
}

// ---------- CREATE block parsing (preserves Phase-1 behavior) ----------

// ```<lang>\n(// path: ...|# path: ...|<!-- path: ... -->|/* path: ... */)\n<code>```
//
// Path matcher is intentionally permissive: any non-whitespace token that
// contains a "." (extension) — covers root files (package.json, README.md,
// next.config.mjs, .env), nested paths (src/foo.ts, app/page.tsx,
// components/ui/Button.tsx), config files (tailwind.config.ts,
// postcss.config.js, vite.config.ts), and CSS (app/globals.css). The
// downstream `sanitizeCreatePath` call below rejects path traversal /
// absolute paths defensively.
//
// Comment-prefix alternation supports:
//   - `// path: foo.ts`              (TS/JS/TSX/JSX)
//   - `# path: foo.yml`              (YAML, shell, env)
//   - `<!-- path: foo.html -->`      (HTML/JSX comments)
//   - `/* path: foo.css */`          (CSS / block JS comments)
const CREATE_WITH_PATH_REGEX =
  /```(\w+)[^\n]*\n(?:\/\/\s*|#\s*|<!--\s*|\/\*\s*)?(?:path|file):\s*([^\n*]+?)\s*(?:\*\/|-->)?\s*\n([\s\S]*?)```/gm;

// Bare ```<lang> ... ``` — used as fallback inference
const BARE_FENCE_REGEX = /```(\w+)\n([\s\S]*?)```/g;

// Inline path inside the first 3 lines of code — matches both root files
// (package.json, tailwind.config.ts) AND nested paths. Restricting only to
// `src/...` here would drop scaffold files emitted without an explicit
// `// path:` annotation, which is the bug from PROBLEM_STATEMENT #4.
const INLINE_PATH_REGEX =
  /((?:src|app|components|lib|hooks|types|styles|public|pages|server|api|tests|__tests__|supabase|prisma)\/[\w/.-]+\.\w+|(?:^|\s)(?:package\.json|tsconfig(?:\..+)?\.json|next\.config\.(?:m?js|ts)|vite\.config\.(?:m?js|ts)|tailwind\.config\.(?:m?js|ts|cjs)|postcss\.config\.(?:m?js|ts|cjs)|README\.md|index\.html|\.eslintrc(?:\.\w+)?|\.prettierrc(?:\.\w+)?|\.gitignore|\.env(?:\..+)?))/;

/**
 * Validate + normalize an AI-emitted file path for CREATE.
 *
 * Accepts:
 *   - Root-level files:           package.json, README.md, next.config.ts
 *   - Nested paths:               src/foo.ts, app/page.tsx, components/ui/Button.tsx
 *   - Hidden config files:        .eslintrc, .gitignore, .env
 *
 * Rejects (returns null):
 *   - Absolute paths:             /etc/passwd, C:/Windows
 *   - Path traversal:             ../escape.ts, foo/../bar
 *   - Empty / whitespace-only
 *   - URLs:                       https://…
 *   - Files without a name segment
 */
// System-level path segments that should never appear at the root of a
// scaffold path. If we see one of these as the FIRST segment after
// stripping a leading "/", we know we're looking at a leaked system
// path (e.g. `/etc/passwd`) rather than a project file.
const FORBIDDEN_ROOT_SEGMENTS = new Set([
  'etc', 'usr', 'var', 'bin', 'sbin', 'tmp', 'home', 'root', 'proc',
  'dev', 'sys', 'boot', 'opt', 'mnt', 'media', 'lost+found',
  // Windows top-level dirs (these can show up after a regex strips the drive letter)
  'windows', 'program files', 'programdata', 'users',
]);

function sanitizeCreatePath(raw: string): string | null {
  let p = raw.trim();
  if (!p) return null;
  // Strip surrounding quotes/backticks the model sometimes emits
  p = p.replace(/^["'`]+|["'`]+$/g, '');
  // Reject URLs
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return null;
  // Reject absolute Windows paths (drive letter + separator)
  if (/^[a-zA-Z]:[/\\]/.test(p)) return null;
  // Normalize separators
  p = p.replace(/\\/g, '/');
  // Strip leading "./" and "/" runs. Note: an AI sometimes emits
  // `/src/foo.ts` when it meant `src/foo.ts`; we tolerate that by
  // stripping the leading `/`, BUT then check the first segment
  // against FORBIDDEN_ROOT_SEGMENTS so leaked system paths like
  // `/etc/passwd` still get rejected.
  for (let i = 0; i < 8; i++) {
    const before = p;
    p = p.replace(/^\.\/+/, '');
    p = p.replace(/^\/+/, '');
    if (p === before) break;
  }
  p = p.replace(/\/{2,}/g, '/');
  if (!p) return null;
  // Reject traversal / empty segments
  const segs = p.split('/');
  for (const s of segs) {
    if (s === '..' || s === '') return null;
  }
  // Reject paths whose first segment is a known system folder
  if (FORBIDDEN_ROOT_SEGMENTS.has(segs[0].toLowerCase())) return null;
  // Final segment must be a real filename (not "." or "..")
  const last = segs[segs.length - 1];
  if (!last || last === '.' || last === '..') return null;
  // Reject paths whose final segment has no extension AND isn't a known
  // extensionless project file (Dockerfile, Makefile, etc.). This stops
  // garbage like the literal word "config" being picked up as a path.
  if (!last.includes('.')) {
    const EXTENSIONLESS_ALLOWED = new Set([
      'Dockerfile', 'Makefile', 'Procfile', 'LICENSE', 'CHANGELOG', 'AUTHORS',
    ]);
    if (!EXTENSIONLESS_ALLOWED.has(last)) return null;
  }
  return p;
}

function inferFallbackPath(code: string, language: string, idx: number): string {
  if (code.includes('export default function') || code.includes('export const')) {
    return `src/components/Component${idx}.${language === 'typescript' ? 'tsx' : language}`;
  }
  if (code.includes('interface ') || code.includes('type ')) {
    return `src/types/types${idx}.${language === 'typescript' ? 'ts' : language}`;
  }
  if (code.includes('export async function') || code.includes('export function')) {
    return `src/lib/utils${idx}.${language === 'typescript' ? 'ts' : language}`;
  }
  return `src/generated${idx}.${language}`;
}

/**
 * Strip every edit fence out of the input string so they aren't re-parsed
 * as CREATEs by the bare-fence pass.
 */
function stripEditFences(content: string): string {
  return content.replace(EDIT_FENCE_REGEX, '');
}

function extractCreates(content: string): ExtractedCreate[] {
  const out: ExtractedCreate[] = [];
  const seen = new Set<string>();

  // Pass 1: explicit `// path:` annotations.
  //
  // PROBLEM_STATEMENT #4/#5 fix — the previous gate required either
  // `cleanPath.startsWith('src/')` OR a "/" in the path, which silently
  // dropped root-level scaffold files like `package.json`, `README.md`,
  // `next.config.ts`, `tailwind.config.ts`, etc. We now run the path
  // through `sanitizeCreatePath` which accepts root files but still
  // rejects path traversal and absolute paths.
  CREATE_WITH_PATH_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CREATE_WITH_PATH_REGEX.exec(content)) !== null) {
    const [, language, filePath, code] = m;
    const cleanPath = sanitizeCreatePath(filePath);
    if (!cleanPath) {
      console.warn(
        `[extractor] rejecting create path "${filePath.trim()}" (failed sanitization)`
      );
      continue;
    }
    if (seen.has(cleanPath)) continue;
    const name = cleanPath.split('/').pop() ?? cleanPath;
    if (!name) continue;
    console.info(`[extractor] create file "${cleanPath}" (lang=${language || 'unknown'})`);
    out.push({
      path: cleanPath,
      name,
      content: code.trim(),
      language: language || 'typescript',
    });
    seen.add(cleanPath);
  }

  if (out.length > 0) return out;

  // Pass 2: bare fences with inline path reference, then fallback inference.
  // The inline regex now also recognises root config files (package.json,
  // tailwind.config.ts, etc.) — see INLINE_PATH_REGEX above.
  //
  // A fence that DOES contain a `// path:` (or `# path:` / `<!-- path:`)
  // annotation but whose path was REJECTED by sanitizeCreatePath in
  // Pass 1 must NOT be silently rerouted to an inferred fallback path —
  // that would let `// path: /etc/passwd` become `src/generated0.ts`.
  // We detect those fences and skip them entirely.
  const HAS_PATH_ANNOTATION = /^\s*(?:\/\/|#|\/\*|<!--)\s*(?:path|file)\s*:/m;
  BARE_FENCE_REGEX.lastIndex = 0;
  while ((m = BARE_FENCE_REGEX.exec(content)) !== null) {
    const [, language, code] = m;
    const codeLines = code.split('\n');

    let filePath: string | null = null;
    for (let i = 0; i < Math.min(3, codeLines.length); i++) {
      const pathMatch = codeLines[i].match(INLINE_PATH_REGEX);
      if (pathMatch) {
        // group 1 may include a leading whitespace from the alt branch
        filePath = pathMatch[1].trim();
        break;
      }
    }

    if (!filePath) {
      // If the fence had an explicit path annotation but Pass 1
      // rejected it, do not fall back to inferred paths.
      if (HAS_PATH_ANNOTATION.test(code.split('\n').slice(0, 3).join('\n'))) {
        continue;
      }
      filePath = inferFallbackPath(code, language, out.length);
    }

    const cleanPath = sanitizeCreatePath(filePath);
    if (!cleanPath) continue;
    if (seen.has(cleanPath)) continue;
    const name = cleanPath.split('/').pop() ?? cleanPath;
    if (!name) continue;
    out.push({
      path: cleanPath,
      name,
      content: code.trim(),
      language: language || 'typescript',
    });
    seen.add(cleanPath);
  }

  return out;
}

export function extractFromAssistantResponse(content: string): ExtractedResponse {
  const { edits, malformedEdits, malformedEditReasons } = extractEdits(content);
  // CREATE pass must not double-count the bodies of edit fences
  const stripped = stripEditFences(content);
  const creates = extractCreates(stripped);
  return { creates, edits, malformedEdits, malformedEditReasons };
}

function collectPathAnnotations(content: string): string[] {
  const paths: string[] = [];
  const regex =
    /(?:\/\/\s*|#\s*|<!--\s*|\/\*\s*)?(?:path|file):\s*([^\n*]+?)\s*(?:\*\/|-->)?(?=\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const clean = sanitizeCreatePath(m[1]);
    if (clean && !paths.includes(clean)) paths.push(clean);
  }
  return paths;
}

function collectFilesWrittenList(content: string): string[] {
  const marker = content.match(/files\s+written\s*:/i);
  if (!marker || marker.index === undefined) return [];
  const rest = content.slice(marker.index + marker[0].length);
  const paths: string[] = [];
  const lineRegex = /^\s*(?:[-*]\s*)?`?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)`?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(rest)) !== null) {
    const clean = sanitizeCreatePath(m[1]);
    if (clean && !paths.includes(clean)) paths.push(clean);
  }
  return paths;
}

/**
 * Detect partial/truncated assistant code-generation responses before
 * callers write the subset of files we happened to extract from closed
 * fences. A single unclosed code fence means the final file may be cut
 * off, so validation must not start yet.
 */
export function analyzeResponseCompleteness(
  content: string,
  extracted: ExtractedResponse = extractFromAssistantResponse(content)
): ResponseCompletenessAudit {
  const issues: ResponseCompletenessIssue[] = [];
  const extractedPaths = new Set([
    ...extracted.creates.map((c) => c.path),
    ...extracted.edits.map((e) => e.path),
  ]);
  const completePaths = [...extractedPaths];
  const fenceCount = (content.match(/```/g) ?? []).length;

  if (fenceCount % 2 === 1) {
    const tail = content.slice(content.lastIndexOf('```'));
    const pathMatch = tail.match(/(?:\/\/\s*|#\s*|<!--\s*|\/\*\s*)?(?:path|file):\s*([^\n*]+?)\s*(?:\*\/|-->)?(?=\n|$)/);
    const path = pathMatch ? sanitizeCreatePath(pathMatch[1]) ?? undefined : undefined;
    issues.push({
      kind: 'unclosed-fence',
      path,
      message: path
        ? `The response ended inside an unclosed code fence for ${path}.`
        : 'The response ended inside an unclosed code fence.',
    });
  }

  for (const path of collectPathAnnotations(content)) {
    if (!extractedPaths.has(path)) {
      issues.push({
        kind: 'unextracted-path',
        path,
        message: `${path} was annotated with // path: but was not extracted as a complete file.`,
      });
    }
  }

  for (const path of collectFilesWrittenList(content)) {
    if (!extractedPaths.has(path)) {
      issues.push({
        kind: 'unextracted-listed-file',
        path,
        message: `${path} was listed as written but was not extracted/applied.`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    blocking: issues.length > 0,
    issues,
    lastCompletePath: completePaths[completePaths.length - 1],
  };
}

/**
 * Phase-1 file-paths-mentioned-in-text extractor (preserved for message.files).
 *
 * PROBLEM_STATEMENT #5 fix — used to be `src/`-only, which dropped
 * scaffold-file mentions (`package.json`, `tailwind.config.ts`, etc.) from
 * the file-chip rail underneath assistant messages. We now match both
 * common project subtrees AND a curated list of well-known root files.
 * The two-branch alternation keeps false-positive rates low.
 */
const PATH_MENTION_REGEX =
  /(?:\/\/\s*|#\s*)?((?:src|app|components|lib|hooks|types|styles|public|pages|server|api|tests|__tests__|supabase|prisma)\/[\w/.-]+\.\w+|(?:^|[\s`(])(?:package\.json|tsconfig(?:\..+)?\.json|next\.config\.(?:m?js|ts)|vite\.config\.(?:m?js|ts)|tailwind\.config\.(?:m?js|ts|cjs)|postcss\.config\.(?:m?js|ts|cjs)|README\.md|index\.html|\.eslintrc(?:\.\w+)?|\.prettierrc(?:\.\w+)?|\.gitignore|\.env(?:\..+)?))/g;

export function extractMentionedPaths(content: string, max: number = 6): string[] {
  const paths: string[] = [];
  PATH_MENTION_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_MENTION_REGEX.exec(content)) !== null) {
    const p = m[1].trim();
    if (!p) continue;
    if (!paths.includes(p)) paths.push(p);
    if (paths.length >= max) break;
  }
  return paths;
}
