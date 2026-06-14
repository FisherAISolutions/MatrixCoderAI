/**
 * Parser for TypeScript (`tsc --noEmit`) and Next.js build error output.
 *
 * The validation engine captures the combined stdout/stderr of these
 * tools and feeds it here. We pull out structured `{ file, line, column,
 * message, code }` entries so the auto-fix prompt can present them
 * cleanly to the AI without leaking ANSI codes or unrelated noise.
 *
 * The parser is intentionally permissive — false positives are OK
 * because the AI is robust to noise; false negatives (missing a real
 * error) would let the loop terminate falsely as "success".
 */

export type ErrorSource =
  | 'typescript'
  | 'nextjs'
  | 'eslint'
  | 'module'
  | 'imports'
  | 'quality'
  | 'styling'
  | 'unknown';

export interface ParsedError {
  source: ErrorSource;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  /** Original raw chunk this was parsed from — kept for the AI prompt. */
  raw: string;
}

// Strip ANSI escape sequences (tsc & next emit colored output by default).
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

// ---------- TypeScript: `path/to/file.ts(LINE,COL): error TSxxxx: message` ----------
// Positional groups: 1=file, 2=line, 3=column, 4=code, 5=message
const TSC_REGEX = /^([^\s:()][^\n:()]*?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;

// ---------- Bare TS errors without a file prefix (TS5023, TS18003, etc.) ----------
// Examples:
//   error TS5023: Unknown compiler option 'foo'.
//   error TS18003: No inputs were found in config file '/path/tsconfig.json'.
//   error TS6053: File 'foo.ts' not found.
const TSC_BARE_REGEX = /(?:^|\n)\s*error\s+(TS\d+):\s+(.+?)(?=\n|$)/g;

// ---------- npm errors ----------
//   npm ERR! code ENOENT
//   npm error code E404
//   npm WARN ...
const NPM_ERROR_REGEX = /(?:^|\n)\s*npm\s+(?:ERR!|error)\s+(.+?)(?=\n|$)/g;

// ---------- Shell "command not found" — common when tsc/next aren't installed ----------
const SHELL_NOT_FOUND_REGEX =
  /(?:^|\n)\s*(?:sh|bash|env)?\s*:?\s*([\w@/.-]+)\s*:\s*(?:command not found|not found|No such file or directory)/g;

// ---------- Next.js: `Failed to compile.` block, then a series of file-headed messages ----------
// We match individual file errors emitted by Next.js / webpack / SWC.
//
//   ./src/app/page.tsx:12:5
//   Type error: ...
//   Module not found: Can't resolve 'foo'
const NEXT_FILE_HEAD_REGEX = /^\.?\/?([^\s:]+\.(?:tsx?|jsx?|css|mjs|cjs)):(\d+):(\d+)/m;
const MODULE_NOT_FOUND_REGEX = /Module not found:\s+(?:Error:\s+)?Can't resolve\s+'([^']+)'(?:\s+in\s+'([^']+)')?/g;
const CANNOT_FIND_MODULE_REGEX = /Cannot find module\s+'([^']+)'/g;
const IMPORT_TRACE_FILE_REGEX = /Import trace for requested module:\s*\n\s*\.?\/?([^\s\n]+\.(?:tsx?|jsx?|css|mjs|cjs))/g;
const CSS_LOADER_RESOURCE_REGEX = /(?:^|!|\.\/)(src\/app\/[^!\s'"`]+\.css|app\/[^!\s'"`]+\.css)/g;

// ---------- Next.js prerender / export errors (App Router) ----------
//   Error occurred prerendering page "/add". Read more: ...
//   Export encountered an error on /add/page: /add, exiting the build.
//   Invariant: Missing workStore in createPrerenderParamsForClientSegment
const PRERENDER_PAGE_REGEX = /Error occurred prerendering page "([^"]+)"/g;
const EXPORT_PAGE_ERROR_REGEX = /Export encountered (?:an error|errors) on ([^\s,:]+)/g;
const WORKSTORE_INVARIANT_REGEX = /Invariant: Missing workStore in (\w+)/g;
const WORK_UNIT_ASYNC_STORAGE_REGEX = /Invariant:\s*Expected workUnitAsyncStorage to have a store/i;
const CLIENT_REFERENCE_MANIFEST_REGEX = /Invariant:\s*Expected clientReferenceManifest to be defined/i;

/**
 * Parse the combined output of one validation step.
 *
 * @param output raw combined stdout/stderr (ANSI codes are stripped automatically)
 * @param source which tool produced the output (helps classify ambiguous lines)
 */
export function parseValidationOutput(
  output: string,
  source: ErrorSource = 'unknown'
): ParsedError[] {
  const clean = stripAnsi(output);
  const errors: ParsedError[] = [];
  const seenKeys = new Set<string>();

  const push = (e: ParsedError) => {
    const key = `${e.source}|${e.file ?? ''}|${e.line ?? ''}|${e.code ?? ''}|${e.message}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    errors.push(e);
  };

  // ---- TypeScript-style errors (also emitted by Next.js when ts-check fails) ----
  TSC_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TSC_REGEX.exec(clean)) !== null) {
    const [, file, line, column, code, message] = m;
    push({
      source: source === 'unknown' ? 'typescript' : source,
      file,
      line: Number(line),
      column: Number(column),
      code,
      message: message.trim(),
      raw: m[0],
    });
  }

  // ---- Bare TS errors (no file prefix) — TS5023, TS18003, TS6053, etc. ----
  TSC_BARE_REGEX.lastIndex = 0;
  while ((m = TSC_BARE_REGEX.exec(clean)) !== null) {
    const [, code, message] = m;
    push({
      source: source === 'unknown' ? 'typescript' : source,
      code,
      message: message.trim(),
      raw: m[0].trim(),
    });
  }

  // ---- npm errors (install failed, package not found, etc.) ----
  NPM_ERROR_REGEX.lastIndex = 0;
  while ((m = NPM_ERROR_REGEX.exec(clean)) !== null) {
    const [, message] = m;
    push({
      source: 'module',
      message: `npm: ${message.trim()}`,
      raw: m[0].trim(),
    });
  }

  // ---- Missing binary (tsc/next/eslint not installed) ----
  SHELL_NOT_FOUND_REGEX.lastIndex = 0;
  while ((m = SHELL_NOT_FOUND_REGEX.exec(clean)) !== null) {
    const [, binary] = m;
    push({
      source: 'module',
      message: `Command not found: ${binary} — the binary isn't in node_modules/.bin. Add the package that provides it (typescript, next, eslint, etc.) to package.json.`,
      raw: m[0].trim(),
    });
  }

  // ---- Module resolution errors ----
  MODULE_NOT_FOUND_REGEX.lastIndex = 0;
  while ((m = MODULE_NOT_FOUND_REGEX.exec(clean)) !== null) {
    push({
      source: 'module',
      message: `Module not found: ${m[1]}${m[2] ? ` (imported from ${m[2]})` : ''}`,
      raw: m[0],
    });
  }
  CANNOT_FIND_MODULE_REGEX.lastIndex = 0;
  while ((m = CANNOT_FIND_MODULE_REGEX.exec(clean)) !== null) {
    push({
      source: 'module',
      message: `Cannot find module: ${m[1]}`,
      raw: m[0],
    });
  }
  IMPORT_TRACE_FILE_REGEX.lastIndex = 0;
  while ((m = IMPORT_TRACE_FILE_REGEX.exec(clean)) !== null) {
    push({
      source: source === 'unknown' ? 'nextjs' : source,
      file: m[1],
      message:
        'Build failed while compiling this module. Inspect this file for malformed syntax, misplaced directives, or imports pasted after executable code.',
      raw: m[0],
    });
  }
  CSS_LOADER_RESOURCE_REGEX.lastIndex = 0;
  while ((m = CSS_LOADER_RESOURCE_REGEX.exec(clean)) !== null) {
    push({
      source: source === 'unknown' ? 'nextjs' : source,
      file: m[1],
      message:
        'Build failed while compiling this CSS module. Inspect this file for unsafe @apply usage, malformed syntax, or PostCSS/Tailwind incompatibilities.',
      raw: m[0],
    });
  }

  // ---- Next.js prerender / export-time errors (App Router) ----
  PRERENDER_PAGE_REGEX.lastIndex = 0;
  while ((m = PRERENDER_PAGE_REGEX.exec(clean)) !== null) {
    push({
      source: 'nextjs',
      message: `Prerender failed for route "${m[1]}" — almost always a client/server boundary issue (the route page was made a Client Component, or a client hook reads params/searchParams during static export). Keep the page a Server Component and move interactive logic into a 'use client' child.`,
      raw: m[0],
    });
  }
  EXPORT_PAGE_ERROR_REGEX.lastIndex = 0;
  while ((m = EXPORT_PAGE_ERROR_REGEX.exec(clean)) !== null) {
    push({
      source: 'nextjs',
      message: `Static export failed for ${m[1]} — the page threw while prerendering. Fix the client/server boundary instead of suppressing the error.`,
      raw: m[0],
    });
  }
  WORKSTORE_INVARIANT_REGEX.lastIndex = 0;
  while ((m = WORKSTORE_INVARIANT_REGEX.exec(clean)) !== null) {
    push({
      source: 'nextjs',
      message: `Next.js invariant "Missing workStore in ${m[1]}" — a Client Component route is being statically prerendered while reading server-only context (params/searchParams). Convert the route page back to a Server Component and pass the values to a 'use client' child as props.`,
      raw: m[0],
    });
  }
  if (WORK_UNIT_ASYNC_STORAGE_REGEX.test(clean)) {
    push({
      source: 'nextjs',
      message:
        'Next.js invariant "Expected workUnitAsyncStorage to have a store" — usually triggered when a route is prerendered with an invalid App Router boundary or Next 15 page props. Check duplicate route aliases first, then ensure route pages stay Server Components and await params/searchParams before reading them.',
      raw:
        clean.match(/Invariant:\s*Expected workUnitAsyncStorage to have a store[^\n]*/i)?.[0] ??
        'Expected workUnitAsyncStorage to have a store',
    });
  }
  if (CLIENT_REFERENCE_MANIFEST_REGEX.test(clean)) {
    push({
      source: 'nextjs',
      message:
        'Next.js invariant "Expected clientReferenceManifest to be defined" — often caused by duplicate effective App Router pages, especially a root page plus a route-group page such as src/app/page.tsx and src/app/(dashboard)/page.tsx both resolving to "/". Check duplicate routes before patching client/server boundaries.',
      raw: clean.match(/Invariant:\s*Expected clientReferenceManifest to be defined[^\n]*/i)?.[0] ?? 'Expected clientReferenceManifest to be defined',
    });
  }

  // ---- Next.js build errors that don't match the TS regex above ----
  // We split on blank lines and look for blocks that start with a file
  // reference and contain "error" or "Type error".
  if (source === 'nextjs' || source === 'unknown') {
    const blocks = clean.split(/\n\s*\n/);
    for (const block of blocks) {
      const head = block.match(NEXT_FILE_HEAD_REGEX);
      if (!head) continue;
      const file = head[1];
      const line = Number(head[2]);
      const column = Number(head[3]);

      // Skip blocks already covered by the TS regex.
      const dupe = errors.some(
        (e) => e.file === file && e.line === line && e.column === column
      );
      if (dupe) continue;

      // Pull the first non-header line as the message.
      const rest = block
        .split('\n')
        .slice(1)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join(' ')
        .slice(0, 400);
      if (!rest) continue;

      push({
        source: 'nextjs',
        file,
        line,
        column,
        message: rest,
        raw: block.trim(),
      });
    }
  }

  return errors;
}

/**
 * Heuristic — does the raw output indicate any kind of failure even if
 * we couldn't parse a structured error? Used as a safety net so we
 * never report "success" when tsc/next clearly failed.
 */
export function looksLikeFailure(output: string): boolean {
  const clean = stripAnsi(output).toLowerCase();
  return (
    clean.includes('failed to compile') ||
    clean.includes('build failed') ||
    /\berror\s+ts\d+\b/i.test(clean) ||
    clean.includes('module not found') ||
    clean.includes('cannot find module') ||
    clean.includes('import trace for requested module') ||
    clean.includes('command not found') ||
    clean.includes('npm err!') ||
    clean.includes('npm error') ||
    clean.includes('error occurred prerendering') ||
    clean.includes('export encountered an error') ||
    clean.includes('missing workstore') ||
    clean.includes('expected workunitasyncstorage to have a store') ||
    clean.includes('expected clientreferencemanifest to be defined') ||
    /\b\d+\s+errors?\b/.test(clean)
  );
}

/**
 * Pick a representative excerpt of the raw failure output, useful for
 * surfacing the actual error to the USER in chat (not just to the AI
 * in the prompt). We try to find the last "error" line and return a
 * window around it; if we can't, we return the tail of the output.
 */
export function extractFailureExcerpt(output: string, maxChars = 2000): string {
  const clean = stripAnsi(output).trimEnd();
  if (clean.length === 0) return '(no output)';
  if (clean.length <= maxChars) return clean;

  // Look for the LAST occurrence of "error" / "failed" / "Error:" so
  // the excerpt centres around the actual failure rather than info-
  // level noise at the start of the log.
  const markers = [' error ', ' Error:', 'Error:', 'failed', 'FAIL', 'ERR!'];
  let lastIdx = -1;
  for (const marker of markers) {
    const i = clean.lastIndexOf(marker);
    if (i > lastIdx) lastIdx = i;
  }
  if (lastIdx < 0) {
    return clean.slice(-maxChars);
  }

  const start = Math.max(0, lastIdx - Math.floor(maxChars * 0.3));
  const end = Math.min(clean.length, start + maxChars);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < clean.length ? ' …' : '';
  return `${prefix}${clean.slice(start, end)}${suffix}`;
}
