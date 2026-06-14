/**
 * Prompt builder for the auto-fix loop.
 *
 * Given a set of build/type-check errors and the current file tree,
 * produces a "Coding Agent" prompt that instructs the AI to emit
 * SEARCH/REPLACE patches (and ONLY patches — no full-file rewrites).
 *
 * The prompt format is intentionally aligned with the existing
 * Coding Agent system prompt in ChatComposer.tsx so the AI's response
 * flows through the same extractor (`extractFromAssistantResponse`).
 */

import type { ParsedError } from './errorParser';
import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';

const MAX_FILE_CONTENT_CHARS = 6000;
const MAX_ATTACHED_FILES = 8;
const MAX_ERRORS_IN_PROMPT = 25;
const MAX_RAW_LOG_CHARS = 6000;

// Matches prerender/export failures that name a ROUTE rather than a
// file — e.g. `Error occurred prerendering page "/add"` and
// `Export encountered an error on /add/page: /add, exiting the build.`
const PRERENDER_ROUTE_REGEX =
  /(?:prerendering page "([^"]+)"|Export encountered (?:an error|errors) on ([^\s,:]+))/g;

/**
 * Map an App Router route (e.g. `/add` or `/add/page`) to the file
 * paths most likely to contain it, across both `src/app/` and `app/`
 * roots. Includes the root layout — boundary bugs often live there.
 */
function routeToPageCandidates(route: string): string[] {
  const cleaned = route
    .replace(/\/page$/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const seg = cleaned.length ? `/${cleaned}` : '';
  const out: string[] = [];
  for (const root of ['src/app', 'app']) {
    for (const ext of ['tsx', 'jsx', 'ts', 'js']) {
      out.push(`${root}${seg}/page.${ext}`);
    }
    out.push(`${root}/layout.tsx`);
  }
  return out;
}

export const AUTO_FIX_SYSTEM_PROMPT = `You are the Auto-Fix Coding Agent for CodePilot.

A build/type-check just FAILED inside a sandboxed WebContainer runtime.
The user did not type a new request — your only job is to fix the
errors listed below using **SEARCH/REPLACE patches** against existing
files, or **full-file CREATE fences** when validation reports a missing
local file.

STRICT RULES (violations make the auto-fix loop misfire):

1. For existing files, emit ONLY \`\`\`edit:<path>\`\`\` fences with one
   or more SEARCH/REPLACE blocks. For missing files, emit a full-file
   CREATE fence using this exact shape:

   \`\`\`tsx
   // path: src/components/MissingThing.tsx
   export default function MissingThing() {
     return null;
   }
   \`\`\`

   CREATE paths MUST include a real file extension such as \`.tsx\` or
   \`.ts\`. Do NOT use an extensionless path like
   \`src/components/MissingThing\`.

2. Use the EXACT format. Every edit body MUST begin with the literal
   line \`<<<<<<< SEARCH\` — never omit it. All three markers are
   mandatory and each must be on its own line in this exact order:

   \`\`\`edit:src/foo/bar.ts
   <<<<<<< SEARCH
   <verbatim slice of the current file>
   =======
   <fixed slice>
   >>>>>>> REPLACE
   \`\`\`

3. PRE-EMISSION SELF-CHECK — for every edit fence in your draft, verify:
     □ Line 1 of the body is exactly \`<<<<<<< SEARCH\`
     □ The verbatim existing code follows
     □ A line containing exactly \`=======\` separates SEARCH from REPLACE
     □ The replacement code follows \`=======\`
     □ The LAST line of the body is exactly \`>>>>>>> REPLACE\`
   If any box is unchecked, regenerate the block before responding.

4. The SEARCH block must be a verbatim, minimal substring of the
   current file content. Include just enough context for it to be
   unique — usually 2–6 lines around the bad statement.

5. Each error should be addressed with the smallest patch that
   resolves it. Do NOT refactor unrelated code.

6. If an error is "Module not found" or "Cannot find module", prefer
   either:
     (a) fixing the import path, or
     (b) creating the missing local file with a full-file fence.
   Do NOT modify package.json — dependency management is a separate
   system (Phase 2) and will be handled outside this loop.
   EXCEPTION: when the failed step is \`install\` due to a dependency
   version conflict (ERESOLVE), you MAY emit a minimal SEARCH/REPLACE
   patch against package.json that fixes ONLY the conflicting version
   range(s) (e.g. aligning \`@types/react\`'s major with \`react\`).
   Never add unrelated packages or rewrite the whole file.

7. Before diagnosing a Next.js prerender failure as a generic
   Client/Server Component boundary issue, check whether both \`app/\`
   and \`src/app/\` exist. Generated Next.js apps must use exactly ONE App
   Router root. Prefer \`src/app\`. If both roots exist, normalize first:
   move root \`app/layout.tsx\`, \`app/page.tsx\`, and \`app/globals.css\`
   into \`src/app/\`, ensure \`src/app/layout.tsx\` imports
   \`./globals.css\`, and delete the old root \`app/\` files.

8. Do NOT emit explanatory prose between fences. A short final
   bulleted summary (max 5 bullets) is allowed.

9. Never invent symbols. If you cannot determine the correct fix from
   the provided file contents, emit a SHORT \`SKIP:\` comment with the
   reason instead of guessing.

Remember: every patch you emit will be applied verbatim. Mismatched
SEARCH blocks are silently rejected by the patcher, and edit fences
missing \`<<<<<<< SEARCH\` are surfaced as "Patch rejected: missing
\`<<<<<<< SEARCH\` marker." to the user. Be precise.`;

interface BuildPromptOptions {
  errors: ParsedError[];
  files: FileNode[];
  attempt: number;
  maxAttempts: number;
  previousAttemptSummary?: string;
  /**
   * Step that failed (type-check / build / install). Used to phrase the
   * prompt so the AI knows which tool produced the log.
   */
  failedStep?: string;
  /**
   * Raw, truncated stdout/stderr from the failed step. ALWAYS included
   * verbatim in the prompt — the structured `errors` list can be empty
   * if our regex didn't match (e.g. compiler crash, transient
   * infrastructure issue, custom Next.js error format), and the AI
   * needs SOMETHING concrete to act on.
   */
  rawLog?: string;
  /** Set when WC infrastructure errored (boot/install/spawn fail). */
  infrastructureError?: string;
  /** Original user request, included for requirement-aware repairs. */
  requirements?: string;
}

/**
 * Pick the files most likely to be relevant for the failing errors.
 *
 * Strategy:
 *   1. Every file directly named in an error
 *   2. Plus a small set of "root config" files (tsconfig, package.json,
 *      next.config) so the AI can see the project's shape
 */
function selectRelevantFiles(
  errors: ParsedError[],
  files: FileNode[],
  extraLogText?: string
): FileNode[] {
  const flat = flattenTree(files).filter(
    (f) => f.type === 'file' && typeof f.content === 'string'
  );
  const byPath = new Map(flat.map((f) => [f.path, f]));

  const pick = new Set<string>();

  for (const err of errors) {
    if (!err.file) continue;
    if (byPath.has(err.file)) {
      pick.add(err.file);
      continue;
    }
    // Fuzzy match — error might use `./src/foo.ts` while tree stores `src/foo.ts`.
    const stripped = err.file.replace(/^\.\//, '').replace(/^\//, '');
    if (byPath.has(stripped)) {
      pick.add(stripped);
      continue;
    }
    const suffixMatch = flat.find((f) => f.path.endsWith('/' + stripped));
    if (suffixMatch) pick.add(suffixMatch.path);
  }

  // Prerender/export failures name a ROUTE, not a file — map the route
  // to its App Router page (and root layout) so the AI can actually
  // see the code that failed to prerender.
  const routeText =
    errors.map((e) => `${e.raw}\n${e.message}`).join('\n') +
    '\n' +
    (extraLogText ?? '');
  PRERENDER_ROUTE_REGEX.lastIndex = 0;
  let rm: RegExpExecArray | null;
  while ((rm = PRERENDER_ROUTE_REGEX.exec(routeText)) !== null) {
    const route = rm[1] ?? rm[2];
    if (!route) continue;
    for (const candidate of routeToPageCandidates(route)) {
      if (byPath.has(candidate)) pick.add(candidate);
    }
  }

  // Always include a couple of root configs (helps the AI when an error
  // hints at a path-alias issue or a missing type definition).
  for (const rootFile of [
    'tsconfig.json',
    'next.config.mjs',
    'next.config.ts',
    'package.json',
  ]) {
    if (byPath.has(rootFile)) pick.add(rootFile);
  }

  const ordered = Array.from(pick)
    .map((p) => byPath.get(p)!)
    .filter(Boolean)
    .slice(0, MAX_ATTACHED_FILES);

  return ordered;
}

function renderFileBlock(file: FileNode): string {
  const content = file.content ?? '';
  const truncated =
    content.length > MAX_FILE_CONTENT_CHARS
      ? content.slice(0, MAX_FILE_CONTENT_CHARS) +
        `\n\n/* [… ${content.length - MAX_FILE_CONTENT_CHARS} chars truncated …] */`
      : content;
  const ext = file.path.split('.').pop() ?? 'ts';
  return `\`\`\`${ext}
// path: ${file.path}
${truncated}
\`\`\``;
}

function renderError(err: ParsedError, idx: number): string {
  const loc =
    err.file && err.line
      ? `${err.file}:${err.line}${err.column ? ':' + err.column : ''}`
      : err.file ?? '(no file)';
  const code = err.code ? `[${err.code}] ` : '';
  return `${idx + 1}. (${err.source}) ${loc}\n   ${code}${err.message}`;
}

/**
 * Build the user-role prompt for one auto-fix attempt.
 *
 * The system prompt (AUTO_FIX_SYSTEM_PROMPT) is sent separately.
 */
export function buildAutoFixUserPrompt(opts: BuildPromptOptions): string {
  const {
    errors,
    files,
    attempt,
    maxAttempts,
    previousAttemptSummary,
    failedStep,
    rawLog,
    infrastructureError,
    requirements,
  } = opts;
  const errorsToShow = errors.slice(0, MAX_ERRORS_IN_PROMPT);
  const relevant = selectRelevantFiles(errors, files, rawLog);

  const prerenderFailure =
    /prerendering page|Export encountered (?:an error|errors) on |Missing workStore|createPrerenderParams/i.test(
      rawLog ?? ''
    );

  const errorsBlock = errorsToShow.length
    ? errorsToShow.map(renderError).join('\n\n')
    : '_(No structured errors were extracted from the tool output — diagnose the failure directly from the raw log below.)_';

  const filesBlock = relevant.length
    ? relevant.map(renderFileBlock).join('\n\n')
    : '(no relevant files available — emit a CREATE block if a file is missing)';

  const previousNote = previousAttemptSummary
    ? `\n\n## Previous attempt feedback\n${previousAttemptSummary}\n`
    : '';

  const moreErrorsNote =
    errors.length > errorsToShow.length
      ? `\n\n_Note: ${errors.length - errorsToShow.length} additional errors omitted for brevity. Fix the listed ones first._`
      : '';

  // Always include the raw log if available — this is what saved us
  // from the "0 errors, AI returns nothing" failure mode.
  const truncatedRaw =
    rawLog && rawLog.length > MAX_RAW_LOG_CHARS
      ? `${rawLog.slice(0, Math.floor(MAX_RAW_LOG_CHARS * 0.4))}\n\n[… ${rawLog.length - MAX_RAW_LOG_CHARS} chars elided …]\n\n${rawLog.slice(-Math.floor(MAX_RAW_LOG_CHARS * 0.6))}`
      : rawLog ?? '';

  const rawLogBlock = truncatedRaw
    ? `\n\n## Raw \`${failedStep ?? 'validation'}\` output\n\n\`\`\`\n${truncatedRaw}\n\`\`\``
    : '';

  // When the structured parser came up empty, the raw log is the only
  // signal — make acting on it MANDATORY so the AI never bails with
  // "no usable patches" while a concrete error sits in the log.
  const noStructuredErrorsMandate =
    errorsToShow.length === 0 && truncatedRaw
      ? `\n\n## ⚠ MANDATORY — no structured errors were parsed

Our parser could not extract structured errors from the tool output, so
the raw log above is your ONLY signal. You MUST still emit at least one
targeted SEARCH/REPLACE patch (or a full-file fence for a genuinely
missing file) that addresses the failure shown in the raw log. Read it
carefully — the error text, stack trace, and any route/file names it
mentions are all actionable. Responding with only prose or a bare
\`SKIP:\` is treated as a failed attempt. Use \`SKIP:\` ONLY when the log
shows a pure infrastructure failure (network outage, out-of-memory,
sandbox crash) that no source patch could possibly fix.`
      : '';

  const infraBlock = infrastructureError
    ? `\n\n## Sandbox infrastructure error\n\n> ${infrastructureError}\n\nThe build pipeline itself errored before it could finish. If this looks like a missing binary (\`tsc\` / \`next\` not found), the cause is almost always a broken \`package.json\` — fix dependencies/scripts. If it looks like a network or runtime error, emit a small \`SKIP:\` comment instead of guessing.`
    : '';

  const requirementsBlock = requirements?.trim()
    ? `\n\n## Original user request / requirements\n\n\`\`\`\n${requirements.trim().slice(0, 3000)}\n\`\`\``
    : '';

  return `# Auto-Fix Attempt ${attempt} / ${maxAttempts}

The ${failedStep ?? 'build'} step inside the sandbox FAILED. Emit
SEARCH/REPLACE patches to fix the problem. Do not rewrite unrelated
code.

${failedStep === 'runtime-smoke' ? `## Runtime smoke test failed

The project compiled (\`tsc\` + \`next build\` both succeeded), but the
dev server's root route returned an error or rendered a Next.js error
overlay. Almost always this is one of:

  - A page or layout uses \`useState\` / \`useEffect\` / \`onClick\` /
    browser APIs without \`'use client'\` at the top.
  - A \`<Link>\` wraps an \`<a>\` child (the legacy syntax). Use
    \`<Link href="...">text</Link>\` or
    \`<Link href="..." className="...">text</Link>\` instead.
  - \`app/layout.tsx\` renders a manual \`<head><title>…</title></head>\`
    instead of exporting \`metadata\`.
  - API routes live under \`src/pages/api/\` while the rest of the app
    uses App Router — move them to \`src/app/api/<name>/route.ts\`.
  - A Server Component (default in App Router) imports a Client
    Component and passes an inline handler to it — add \`'use client'\`
    to the component that defines the handler.

Cross-reference the raw response body shown below with the file
contents and emit minimal SEARCH/REPLACE patches that fix the
specific issue. Do NOT regenerate the framework.

` : ''}${failedStep === 'install' ? `## Dependency install failed

\`npm install\` failed inside the sandbox with a code-related cause.
If the raw log shows a version conflict (ERESOLVE / "unable to resolve
dependency tree"), emit a minimal SEARCH/REPLACE patch against
\`package.json\` that fixes ONLY the conflicting version range(s) — the
classic case is a \`@types/*\` major that doesn't match its runtime
package (e.g. \`@types/react@^18\` alongside \`react@^19\` → set the
types to \`^19.0.0\`). If the log shows package.json is missing or
unreadable, emit a full-file fence creating a valid one. Do NOT add
new packages, do NOT suggest \`--force\`, and do NOT remove
dependencies that the source code imports.

` : ''}${failedStep === 'import-integrity' ? `## Generated-file consistency audit failed

The generator wrote files that reference local modules which do not
exist in the generated file tree. This is NOT a successful generation.
For each missing local import, either:

  - create the missing file with a full-file fenced block, using the
    exact "Suggested create path" from the error, including its file
    extension, or
  - emit a minimal SEARCH/REPLACE patch that corrects the import to an
    existing file.

CREATE format reminder:

\`\`\`tsx
// path: src/components/HistoryPage.tsx
export default function HistoryPage() {
  return null;
}
\`\`\`

CREATE paths MUST include a real file extension such as \`.tsx\` or
\`.ts\`. Do not use extensionless paths like
\`src/components/HistoryPage\`.

Do not delete the route or remove meaningful UI just to make the import
disappear. If a route imports a missing component such as
\`@/components/HistoryPage\`, prefer creating that component unless an
equivalent component already exists under a different path.

` : ''}${failedStep === 'generated-quality' ? `## Generated quality audit failed

The app may compile, but generated files are too small, placeholder-like,
or missing required scaffold files. Import integrity alone is NOT enough.
Use the original user request below as the product spec and replace
stubs with functional implementations.

Rules for this repair:

  - If \`package.json\` is missing, create a real package.json with
    scripts for \`dev\`, \`build\`, \`start\`, and \`type-check\`, plus
    the required Next/React/Tailwind/TypeScript dependencies.
  - If \`globals.css\` is missing Tailwind, patch or create it with all
    three directives: \`@tailwind base;\`, \`@tailwind components;\`,
    and \`@tailwind utilities;\`.
  - If \`globals.css\` fails with \`Unknown word\`, leaked markdown fences,
    or leaked SEARCH/REPLACE markers, replace the entire file body with
    valid CSS only. The replacement body must NOT contain \`\`\`css\`,
    \`\`\`\`, \`// path:\`, \`<<<<<<< SEARCH\`, \`=======\`, or
    \`>>>>>>> REPLACE\` except for the required outer edit markers.
    Safe fallback content:

    @tailwind base;
    @tailwind components;
    @tailwind utilities;

    html,
    body {
      min-height: 100%;
    }

    body {
      margin: 0;
    }
  - Do NOT create tiny placeholders. Required generated components must
    contain state, handlers, rendering, and persistence needed by the
    request.
  - For \`HistoryPage\` in a calorie/entry tracker, implement search,
    filter, edit, delete, and localStorage wiring. A tiny \`return null\`
    or one-line \`<main>History</main>\` component is a failed repair.

` : ''}${failedStep === 'style-audit' ? `## Style audit failed — the app compiles but renders UNSTYLED

The build is green, but Tailwind styling is broken or missing. An app
that renders as browser-default HTML is a QUALITY FAILURE. Fix the
wiring and/or the markup with minimal patches:

  - The root layout (\`app/layout.tsx\` / \`src/app/layout.tsx\`) MUST
    import the global stylesheet: \`import './globals.css';\` — without
    this single line ZERO CSS loads.
  - \`globals.css\` (Tailwind v3) MUST start with the three directives:
    \`@tailwind base;\` \`@tailwind components;\` \`@tailwind utilities;\`
    and must contain CSS only. Never put markdown fences, path comments,
    prose, or SEARCH/REPLACE separators inside the CSS replacement body.
  - \`postcss.config.js\` MUST exist with
    \`plugins: { tailwindcss: {}, autoprefixer: {} }\`.
  - \`tailwind.config.*\` \`content\` globs MUST cover every source root,
    e.g. \`'./src/**/*.{js,ts,jsx,tsx,mdx}'\` and
    \`'./app/**/*.{js,ts,jsx,tsx,mdx}'\`.
  - Match the INSTALLED tailwind major: with \`tailwindcss@^3\` use the
    \`@tailwind\` directives + the \`tailwindcss\` PostCSS plugin; with
    \`^4\` use \`@import "tailwindcss";\` + \`@tailwindcss/postcss\`. Fix
    the CSS/config side to match — do NOT edit package.json.
  - If components have NO Tailwind classes at all, restyle them to a
    production-quality bar: responsive layout (sm:/md:/lg:), a styled
    navigation bar, cards (padding, rounded corners, shadow), buttons
    with hover states, form inputs with labels and focus rings, a
    consistent spacing scale, and a clear typography hierarchy.

` : ''}${prerenderFailure ? `## Next.js prerender / export failure detected

The raw log shows a prerender error (\`Error occurred prerendering
page\`, \`Export encountered an error on /<route>/page\`, or
\`Invariant: Missing workStore …\`). This is a CLIENT/SERVER BOUNDARY
problem, not a type error. Fix the boundary — do NOT weaken the build:

  - Keep the route's \`page.tsx\` a SERVER Component (no \`'use client'\`
    at the top of the page file). Move the interactive subtree (forms,
    buttons, stateful widgets) into a separate \`'use client'\` child
    component that the page imports and renders.
  - Do NOT make an entire route a Client Component just to use a hook —
    client pages opt out of static prerendering and trigger exactly
    this error.
  - Do NOT read \`useSearchParams\` / \`useParams\` in a client page when
    the server page can receive \`params\` / \`searchParams\` as props and
    pass plain values down.
  - Only add \`export const dynamic = 'force-dynamic'\` if the page truly
    cannot be rendered at build time (request-time data) — never as a
    blanket fix.

` : ''}## Structured errors (${errors.length})

${errorsBlock}${moreErrorsNote}${rawLogBlock}${noStructuredErrorsMandate}${infraBlock}${requirementsBlock}

## Current file contents

${filesBlock}
${previousNote}
## What to do next

Emit one or more \`\`\`edit:<path>\`\`\` fences (or full-file fences for
genuinely missing files). Address every error you can with certainty
from the raw output above. If you truly cannot determine the fix,
emit a SHORT \`SKIP: <reason>\` line instead of guessing — the loop
will gather more context and retry.`;
}
