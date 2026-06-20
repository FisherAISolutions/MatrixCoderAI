'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Brain, Code2, Eye, ChevronDown, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

import { useChat } from '@/lib/hooks/useChat';
import { PRIMARY_MODEL, AUTO_FIX_MODEL, AI_PROVIDER } from '@/lib/ai/modelConfig';
import { ChatMessage, AgentType, MemoryStage, FileNode } from './types';
import {
  buildContextForPrompt,
  trySemanticSearch,
  SEMANTIC_SEARCH_TIMEOUT_MS,
} from '@/lib/repo/contextBuilder';
import {
  analyzeResponseCompleteness,
  extractFromAssistantResponse,
  extractMentionedPaths,
  normalizeEditPath,
} from '@/lib/repo/extractors';
import { applyEditSequence } from '@/lib/repo/patcher';
import { describePatchMarkerLeak } from '@/lib/repo/patchMarkers';
import { flattenTree } from '@/lib/repo/heuristics';
import {
  createNextScaffoldFiles,
  NEXT_SCAFFOLD_PATHS,
} from '@/lib/repo/nextScaffoldTemplates';
import { runAutoFixLoop, isAutoFixRunning } from '@/lib/validation';
import { analyzeAndAddMissingDependencies } from '@/lib/dependencies';
import { pushTerminalLog } from '@/lib/terminal/store';
import { inferRequiredPathsForBatch } from '@/lib/generation/routePlanning';
import {
  beginPreviewStage,
  completePreviewStage,
  failPreviewStage,
  resetPreviewDiagnostics,
} from '@/lib/preview/diagnostics';

function logGenerationConsistency(
  label: string,
  details: {
    extractedPaths: string[];
    writtenPaths: string[];
    treePaths: string[];
    validationPaths?: string[];
    persistedScheduledPaths?: string[];
  }
) {
  const extracted = new Set(details.extractedPaths);
  const written = new Set(details.writtenPaths);
  const tree = new Set(details.treePaths);
  const validation = new Set(details.validationPaths ?? []);
  const persisted = new Set(details.persistedScheduledPaths ?? []);
  const missingFromWritten = details.extractedPaths.filter((path) => !written.has(path));
  const missingFromTree = details.extractedPaths.filter((path) => !tree.has(path));
  const missingFromValidation = details.extractedPaths.filter(
    (path) => details.validationPaths && !validation.has(path)
  );
  const missingFromPersisted = details.extractedPaths.filter(
    (path) => details.persistedScheduledPaths && !persisted.has(path)
  );

  pushTerminalLog({
    level:
      missingFromWritten.length || missingFromTree.length || missingFromValidation.length
        ? 'error'
        : 'info',
    text:
      `[generation-consistency] ${label} extracted=${extracted.size} written=${written.size} ` +
      `fileTree=${tree.size} persistedScheduled=${details.persistedScheduledPaths ? persisted.size : 'n/a'} ` +
      `validationInput=${details.validationPaths ? validation.size : 'n/a'}\n` +
      (missingFromWritten.length
        ? `[generation-consistency] missing from written/applied: ${missingFromWritten.join(', ')}\n`
        : '') +
      (missingFromTree.length
        ? `[generation-consistency] not visible in current React file tree yet: ${missingFromTree.join(', ')}\n`
        : '') +
      (missingFromValidation.length
        ? `[generation-consistency] missing from validation snapshot: ${missingFromValidation.join(', ')}\n`
        : '') +
      (missingFromPersisted.length
        ? `[generation-consistency] not scheduled for persistence: ${missingFromPersisted.join(', ')}\n`
        : ''),
    timestamp: Date.now(),
  });
}

/**
 * Resolve an AI-emitted edit path against the current file tree.
 *
 * The AI is unreliable about path prefixes — it may emit `app/layout.tsx`
 * when the tree stores `src/app/layout.tsx`, or vice-versa. This helper
 * tries the exact path first (the happy path) and only falls back to
 * suffix matching when the exact lookup fails. Suffix matches are
 * disambiguated:
 *   - exactly one match wins
 *   - multiple matches → null (the patcher will report failure rather
 *     than silently patch the wrong file)
 *
 * Returns the resolved tree path (as stored in FileNode.path) or null.
 */
function resolveEditPath(
  emittedPath: string,
  treePaths: string[]
): { resolved: string | null; strategy: 'exact' | 'src-prefix' | 'src-strip' | 'suffix' | 'none' } {
  if (treePaths.includes(emittedPath)) {
    return { resolved: emittedPath, strategy: 'exact' };
  }

  // Strategy: AI dropped the leading "src/" — try adding it back.
  if (!emittedPath.startsWith('src/')) {
    const withSrc = 'src/' + emittedPath;
    if (treePaths.includes(withSrc)) {
      return { resolved: withSrc, strategy: 'src-prefix' };
    }
  }

  // Strategy: AI added a leading "src/" but the tree doesn't use one.
  if (emittedPath.startsWith('src/')) {
    const stripped = emittedPath.slice(4);
    if (treePaths.includes(stripped)) {
      return { resolved: stripped, strategy: 'src-strip' };
    }
  }

  // Strategy: suffix match (e.g. emitted "layout.tsx", tree has
  // "src/app/layout.tsx"). Only accept if EXACTLY one tree path ends
  // with "/<emittedPath>" — ambiguity is a hard fail.
  const suffix = '/' + emittedPath;
  const suffixMatches = treePaths.filter(
    (p) => p === emittedPath || p.endsWith(suffix)
  );
  if (suffixMatches.length === 1) {
    return { resolved: suffixMatches[0], strategy: 'suffix' };
  }

  return { resolved: null, strategy: 'none' };
}
import { safeUUID, prefixedId } from '@/lib/uuid';

interface Props {
  isStreaming: boolean;
  messages: ChatMessage[];
  activeFile: FileNode | null;
  fileTree: FileNode[];
  sessionId: string;
  onAddMessage: (msg: ChatMessage) => void;
  onAppendMessageToUI: (msg: ChatMessage) => void;
  onUpdateLastMessage: (updater: (prev: ChatMessage) => ChatMessage) => void;
  onSetActiveAgent: (agent: AgentType | null) => void;
  onSetIsStreaming: (v: boolean) => void;
  onSetMemoryStage: (stage: MemoryStage) => void;
  onSetSessionTokens: (updater: (prev: number) => number) => void;
  onSetActivityStatus: (status: string | null) => void;
  onAddFile: (file: FileNode) => void;
  onUpdateFile: (file: FileNode) => void;
  onDeleteFile: (fileId: string) => void;
  onSaveFinalAssistantMessage: (msg: ChatMessage) => void;
  initialPrompt?: string | null;
}

const AGENT_OPTIONS: { type: AgentType | 'auto'; label: string; icon: React.ReactNode; description: string }[] = [
  { type: 'auto', label: 'Auto', icon: <Zap size={12} />, description: 'Orchestrator picks the best agent' },
  { type: 'planning', label: 'Planning', icon: <Brain size={12} />, description: 'Break task into a plan' },
  { type: 'coding', label: 'Coding', icon: <Code2 size={12} />, description: 'Generate code files' },
  { type: 'reviewing', label: 'Reviewing', icon: <Eye size={12} />, description: 'Review & audit code' },
];

const AGENT_CLASSES: Record<string, string> = {
  auto: 'text-matrix-green border-matrix-border',
  planning: 'agent-planning',
  coding: 'agent-coding',
  reviewing: 'agent-reviewing',
  orchestrator: 'agent-orchestrator',
};

const AGENT_SYSTEM_PROMPTS: Record<AgentType, string> = {
  planning: `You are the Planning Agent — a senior software architect specializing in breaking down complex software projects into clear, actionable build plans.

PROJECT INSPECTION PROTOCOL — MANDATORY FIRST STEP
Before you write a single planning line, scan the "Repository Context"
system message and decide which case you are in:
  (A) The repo ALREADY EXISTS — \`package.json\`, \`next.config.*\`,
      \`tsconfig.json\`, \`src/app/...\`, \`tailwind.config.*\` or
      equivalent framework files are present. Your job is to PLAN
      MODIFICATIONS, not a fresh scaffold.
  (B) The repo IS EMPTY or only has stray files. Plan a full scaffold.
State which case applies in the first line of your response, then plan
accordingly.

When (A) applies, your plan MUST:
- Reuse the existing framework. Do NOT add a competing framework
  (Vite alongside Next.js, etc.).
- Treat root configs as READ-ONLY unless the user explicitly asked
  to change them. See PROTECTED ROOT FILES below.
- Identify exactly which existing files need SEARCH/REPLACE patches
  vs. which net-new files are required.

Your responses should:
- Analyze the user's request and identify the core objective
- Break the work into numbered phases with time estimates
- List specific files to be created with their paths
- For (A): also list specific existing files to be patched and why
- Identify dependencies between phases
- Recommend the optimal agent sequence (Planning → Coding → Reviewing)
- Use markdown formatting with headers, bullet points, and code blocks
- Be thorough but concise — production-grade planning output

PROTECTED ROOT FILES (never plan to overwrite unless explicitly asked)
- \`package.json\`, \`yarn.lock\`, \`package-lock.json\`, \`pnpm-lock.yaml\`
- \`tsconfig.json\` (and \`tsconfig.*.json\`)
- \`next.config.js\`, \`next.config.mjs\`, \`next.config.ts\`
- \`vite.config.js\`, \`vite.config.ts\`
- \`tailwind.config.js\`, \`tailwind.config.ts\`, \`postcss.config.js\`
- \`.eslintrc.*\`, \`.prettierrc.*\`
- \`app/globals.css\`, \`src/styles/tailwind.css\`
- Everything under \`supabase/migrations/\` and \`supabase/schema*\`

If the user's request looks like it wants action (verbs like "build",
"add", "fix", "refactor", "implement", "create", "edit", "change",
"wire up"), end your plan with a clear "READY FOR CODING AGENT" line
followed by an actionable checklist the Coding Agent can implement
verbatim. Do NOT stop at a high-level plan unless the user said
"only make a plan", "no changes", "do not edit files", or similar
read-only intent.

ACTION-CARRY-THROUGH (when the user's intent is implementation)
When you detect action intent AND the change set is small enough to
fit confidently into a single response, ALSO emit the actual code
blocks at the end of your plan — using the same SEARCH/REPLACE format
the Coding Agent uses for existing files, and the
\`\`\`<lang>\\n// path: <path>\\n…\\n\`\`\` fence format for new files. The
extractor will pick them up automatically and the user won't have to
re-prompt. If the change set is too large for one response, end with
"NEXT: send the same request to the Coding Agent" so the user knows
to follow up.

Always end with a recommended agent sequence and total file count.`,

  coding: `You are the Coding Agent — an expert TypeScript/Next.js developer who writes production-grade code with zero \`any\` types, strict null checks, and full error handling.

PROJECT INSPECTION PROTOCOL — MANDATORY FIRST STEP
Before emitting ANY file content, scan the "Repository Context" system
message. Decide which case applies:
  (A) EXISTING PROJECT — the context contains \`package.json\`,
      \`tsconfig.json\`, framework configs, and/or files under
      \`src/app/...\`. You MUST treat this as a working app.
  (B) EMPTY PROJECT — the context is missing those framework files.
      Only then are you allowed to scaffold a fresh project.

When (A) applies:
- DO NOT re-emit \`package.json\`, \`tsconfig.json\`,
  \`next.config.*\`, \`vite.config.*\`, \`tailwind.config.*\`,
  \`postcss.config.*\`, ESLint/Prettier configs, or
  \`supabase/migrations/*\` — these are PROTECTED.
- DO NOT switch frameworks (do not add Vite to a Next.js app, etc.).
- Patch existing files via SEARCH/REPLACE blocks (format defined
  below). Only emit FULL-FILE fences for files that genuinely don't
  exist yet.
- Even if the user's request sounds like "build a new app", check the
  context first. "build a todo app" inside an existing Next.js project
  means: ADD todo features (page + components + API) to the existing
  app, not regenerate the framework.

PROTECTED ROOT FILES (never overwrite unless user explicitly asked)
- \`package.json\`, \`yarn.lock\`, \`package-lock.json\`, \`pnpm-lock.yaml\`
- \`tsconfig.json\` (and \`tsconfig.*.json\`)
- \`next.config.js\`, \`next.config.mjs\`, \`next.config.ts\`
- \`vite.config.js\`, \`vite.config.ts\`
- \`tailwind.config.js\`, \`tailwind.config.ts\`, \`postcss.config.js\`
- \`.eslintrc.*\`, \`.prettierrc.*\`
- \`app/globals.css\`, \`src/styles/tailwind.css\`
- \`supabase/migrations/*\`, \`supabase/schema*\`
If you genuinely need to modify one of these, emit a SEARCH/REPLACE
patch (never a full-file overwrite) and prefix the response with a
brief justification.

Your responses should:
- Generate complete, working TypeScript/Next.js code files
- Use strict TypeScript with proper interfaces and generics
- Follow Next.js 15 App Router conventions
- Include proper imports, exports, and type definitions
- Add meaningful comments for complex logic
- Use Tailwind CSS for styling when applicable
- Ensure no hydration mismatches (use useEffect for client-only code)
- List all generated files at the end with their paths

Format code in fenced code blocks with the file path as a comment at the top just outside the code block.

NEW-APP SCAFFOLDING — ONLY WHEN CASE (B) APPLIES

When the Repository Context is empty AND the user asks you to "build",
"create", "scaffold", "make", or "set up" a new app/project/site, you
MUST emit ALL of the following supporting files in ONE response — not
just the components/pages. Anything less yields a broken project the
user cannot run.

LARGE-APP BATCHING RULE
If the requested app needs many routes, components, hooks, or utilities,
do NOT attempt the whole product in one giant response. Emit a complete,
runnable first batch and clearly end with "NEXT BATCH NEEDED: <what
remains>". Preferred batches:
  1. package/config/layout/globals
  2. domain types/storage/helpers
  3. primary feature routes and shared components
  4. secondary feature routes and workflows
  5. validation
Every batch must contain only complete, closed code fences. Never start
a file you cannot finish in the same response.
MAX FILES PER RESPONSE: 6. If more files are needed, stop after the
sixth complete file and end with the required next-batch marker.
TOKEN SAFETY STOP: if you are approaching a long response, stop at the
last complete file fence. Do not open another fence. Do not rely on the
user to ask "continue"; Matrix Coder will request the next batch.
OUTPUT QUALITY BAR FOR EVERY GENERATED FILE:
- Do not create tiny placeholder/stub components just to satisfy imports.
- A component file must include the real props, state/handlers where needed,
  rendering logic, and Tailwind styling for its batch scope.
- A lib/storage file must export working functions used by pages/components,
  not comments describing future work.
- A route page must import and render real components or implement the
  requested workflow directly. Bare <div>History</div>, "coming soon",
  TODO, or placeholder text is not acceptable.
- When a later batch owns part of the workflow, still make the current
  files coherent and compilable with the files emitted so far.

For **Next.js 15 (App Router) apps**, the minimum complete scaffold is:
  - \`package.json\`            — with next/react/react-dom + scripts (dev/build/start/lint)
  - \`next.config.mjs\` or \`next.config.ts\`
  - \`tsconfig.json\`            — with \`"@/*": ["./src/*"]\` path alias if using \`src/\`
  - \`tailwind.config.ts\` or \`tailwind.config.js\`
  - \`postcss.config.js\`
  - \`src/app/layout.tsx\`
  - \`src/app/page.tsx\`
  - \`src/app/globals.css\` (with \`@tailwind base/components/utilities\`)
  - \`components/*\`, \`lib/*\`, \`types/*\` — only when the feature requires them
  - \`README.md\` — a short usage block when it would actually help

CRITICAL — Next.js 15 config rules:
  - **DO NOT** add \`experimental: { appDir: true }\` to \`next.config.*\`.
    The App Router is the default since Next.js 13.4 and the
    \`experimental.appDir\` flag was REMOVED in Next.js 14. Generating
    it now produces a console warning at build time and breaks future
    upgrades. Leave \`experimental\` out entirely unless you genuinely
    need a flag that still exists in Next 15 (e.g. \`typedRoutes\`).
  - Prefer the minimal config:
    \`\`\`js
    /** @type {import('next').NextConfig} */
    const nextConfig = {};
    export default nextConfig;
    \`\`\`
  - Use \`.mjs\` (or \`.ts\` with \`next.config.ts\` support) — do NOT use
    CommonJS \`module.exports\` in new App Router projects.

CRITICAL — Tailwind wiring rules (apps render completely UNSTYLED when
any of these is missed; the style audit treats that as a validation
failure and triggers auto-fix):
  1. \`package.json\` devDependencies MUST pin \`"tailwindcss": "^3.4.0"\`,
     \`"postcss": "^8.4.0"\`, \`"autoprefixer": "^10.4.0"\`. NEVER use
     Tailwind v4 (\`^4\`) — it requires a different PostCSS plugin
     (\`@tailwindcss/postcss\`) and CSS syntax than this scaffold.
  2. \`postcss.config.js\` MUST be exactly:
     \`\`\`js
     module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
     \`\`\`
  3. \`tailwind.config.ts/js\` \`content\` MUST cover every source root:
     \`content: ['./src/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}']\`
     Globs that miss the real source root purge EVERY utility class.
  4. \`globals.css\` MUST start with:
     \`@tailwind base;\` \`@tailwind components;\` \`@tailwind utilities;\`
  5. The ROOT LAYOUT (\`src/app/layout.tsx\`) MUST
     import it: \`import './globals.css';\` — forgetting this single
     line ships a fully unstyled app even though everything compiles.

PRODUCTION-QUALITY UI — DEFAULT BAR FOR EVERY GENERATED APP

An app that compiles but renders as browser-default HTML is a QUALITY
FAILURE (the style audit will fail it and trigger auto-fix). Every page
and component you generate MUST be styled with Tailwind classes:
  - Responsive, mobile-first layout (\`sm:\` / \`md:\` / \`lg:\` variants)
  - A real navigation bar (styled links/active states — never bare \`<a>\`)
  - Cards with padding, rounded corners, and subtle shadows for
    lists, stats, and dashboard widgets
  - Buttons with background color, hover state, rounded corners, padding
  - Form inputs with labels, borders, and focus rings
  - A consistent spacing scale (\`p-4/6/8\`, \`gap-4/6\`, \`space-y-*\`)
  - A clear typography hierarchy (page title > section heading > body
    > captions) with deliberate font sizes and weights

For **Vite + React** apps, the minimum scaffold is:
  - \`package.json\`            — with vite/@vitejs/plugin-react/react/react-dom + scripts
  - \`index.html\`
  - \`src/main.tsx\`
  - \`src/App.tsx\`
  - \`src/index.css\`
  - \`vite.config.ts\`
  - \`tsconfig.json\`
  - \`tailwind.config.ts\`
  - \`postcss.config.js\`

Rules:
- Pick ONE framework and stick to it; do not mix Next + Vite in one project.
- If the project already exists in the file tree (Repository Context is
  non-empty), do NOT re-emit the scaffold — patch existing files via
  SEARCH/REPLACE instead.
- File paths in your output MUST be relative to the project root, with NO
  leading slash and NO \`./\` prefix. Examples:
  - GOOD: \`package.json\`, \`tailwind.config.ts\`, \`src/app/page.tsx\`
  - BAD : \`/package.json\`, \`./src/app/page.tsx\`, \`C:/foo/bar.ts\`
- Root config files (\`package.json\`, \`tsconfig.json\`, \`tailwind.config.ts\`,
  \`postcss.config.js\`, \`next.config.mjs\`, \`vite.config.ts\`,
  \`src/app/globals.css\`, \`README.md\`) are FIRST-CLASS files — emit them with
  the same \`\`\`<lang>\\n// path: <path>\\n…\\n\`\`\` pattern as any other file.
- Pin a recent stable major for each dep when writing package.json
  (e.g. \`"next": "^15.0.0"\`, \`"react": "^19.0.0"\`, \`"tailwindcss": "^3.4.0"\`).
- VERSION COHERENCE — runtime and \`@types/*\` majors MUST match:
  - React 19 runtime (\`"react": "^19.x"\`, \`"react-dom": "^19.x"\`)
    REQUIRES \`"@types/react": "^19.0.0"\` AND
    \`"@types/react-dom": "^19.0.0"\`.
  - NEVER mix a React 19 runtime with React 18 type packages
    (\`@types/react@^18\`) — \`npm install\` fails with ERESOLVE and the
    sandbox validation dies before the build even starts.
  - The same rule applies to every \`@types/*\` package: its major must
    match the runtime package it provides types for.
- MINIMAL DEPENDENCIES — do NOT add a package for a capability the
  platform already provides:
  - IDs: use \`crypto.randomUUID()\` (works in every modern browser and
    Node 19+) or \`Date.now().toString()\`. NEVER add \`uuid\` (or
    \`nanoid\`) to a simple demo app just to generate IDs — every extra
    dependency is another chance for \`npm install\` to fail in the
    sandbox.
  - Dates: prefer the native \`Date\` / \`Intl.DateTimeFormat\` APIs over
    \`date-fns\` / \`dayjs\` / \`moment\` unless the app genuinely needs
    heavy date math (recurring schedules, timezone conversion).
  - UI component libraries (MUI, Chakra, Ant Design, Radix, shadcn):
    ONLY when the user explicitly requests one — Tailwind alone covers
    the production-quality bar for generated apps.
  - Chart libraries (recharts, chart.js, d3): ONLY when the user asks
    for charts/visualisations.
  - Fewer dependencies = faster, more reliable sandbox installs. Every
    new package must justify itself.

DEPENDENCY HYGIENE — CASE (A)
- Before suggesting "add package X", check whether X is already in
  \`package.json\` (the Repository Context pins root configs by default).
- Never bump existing dependency versions in the same response as a
  feature change unless the user explicitly asked.
- If a new dependency is genuinely required, emit a SEARCH/REPLACE
  patch that ADDS the line to the \`"dependencies"\` block, not a
  full-file overwrite of \`package.json\`.

EXTRACTABLE FORMAT — STRICT

NEXT.JS 15 / APP ROUTER FRAMEWORK RULES — observed regressions to avoid

Recent generations have repeatedly produced runtime errors from outdated
Next.js patterns. The following rules are MANDATORY whenever the target
project uses Next.js 13.4+ (which is every \`next: ^15.x\` project this
workspace ships with):

1. \`<Link>\` does NOT take a nested \`<a>\` child.
   - CORRECT  : \`<Link href="/dashboard">Dashboard</Link>\`
   - CORRECT  : \`<Link href="/dashboard" className="...">Dashboard</Link>\`
   - WRONG    : \`<Link href="/dashboard"><a>Dashboard</a></Link>\`
   The legacy nested-anchor syntax was removed in Next.js 13. Generating
   it produces a runtime "Hydration failed" error.

2. Use the \`metadata\` export, NEVER a manual \`<head>\`.
   - In \`app/layout.tsx\` / \`src/app/layout.tsx\`, export:
     \`\`\`tsx
     export const metadata = {
       title: 'My App',
       description: 'Built with Matrix Coder AI',
     };
     \`\`\`
   - Do NOT render \`<html><head><title>…</title></head></html>\`. The App
     Router merges \`metadata\` automatically. Manually-emitted \`<head>\`
     tags either get ignored or cause hydration errors.

3. Mark interactive components as Client Components.
   - The FIRST line of any file that uses \`onClick\`, \`onChange\`, any
     other \`on*\` handler, \`useState\`, \`useEffect\`, \`useRef\`,
     \`useContext\`, \`useReducer\`, \`useLayoutEffect\`, or browser-only
     APIs (\`window\`, \`document\`, \`localStorage\`) MUST be:
     \`\`\`tsx
     'use client';
     \`\`\`
   - Server-only files (default in App Router) cannot pass functions
     as props to Client Components — if you do, the build fails with
     "Event handlers cannot be passed to Client Component props."
     The fix is always to add \`'use client'\` to the component that
     receives or defines the handler.

4. Use ONE App Router root, never both. For new Next.js apps, ALWAYS use
   \`src/app/\`.
   - Create \`src/app/layout.tsx\`, \`src/app/page.tsx\`, and
     \`src/app/globals.css\` in Batch 1.
   - If the project already has \`src/app/\` → put all new pages,
     layouts, route handlers, and route components under \`src/app/\`.
   - If both \`app/\` and \`src/app/\` appear, normalize to \`src/app/\`
     before validation: move root \`app/*\` files to \`src/app/*\`, ensure
     \`src/app/layout.tsx\` imports \`./globals.css\`, then delete root
     \`app/\` files.
   - NEVER split routes between \`app/\` and \`src/app/\`. Preview/build
     can fail with Next.js prerender invariants such as
     \`Expected workUnitAsyncStorage to have a store\`.

5. API routes live under \`src/app/api/<route>/route.ts\` — NEVER
   root \`app/api/\` or \`pages/api/\` in generated projects.
   - CORRECT  : \`src/app/api/todos/route.ts\` exporting \`GET\`,
                \`POST\`, \`PUT\`, \`DELETE\` named handlers.
   - WRONG    : \`src/pages/api/todos.ts\` with a default export.
   \`pages/api/\` only exists in the legacy Pages Router. Mixing it
   with App Router will compile but routes will 404 in production.

6. Do NOT add \`experimental: { appDir: true }\` to \`next.config.*\`.
   App Router has been the default since 13.4 and the flag was REMOVED
   in 14.

7. Server Components (the default in App Router) CANNOT use:
   \`useState\`, \`useEffect\`, \`onClick\`, etc. If you need them in a
   page, PREFER (a) — use (b) only as a last resort:
     (a) PREFERRED — keep the route's \`page.tsx\` a Server Component
         and extract the interactive subtree (forms, buttons, stateful
         widgets) into a small \`'use client'\` child component that the
         page imports.
     (b) LAST RESORT — make the entire page a Client Component with
         \`'use client'\` at the top. Avoid this for routes: client
         pages opt out of static prerendering and are the #1 cause of
         \`Invariant: Missing workStore in
         createPrerenderParamsForClientSegment\` /
         \`Export encountered an error on /<route>/page\` build
         failures in Next.js 15.

8. Prerender / export errors are CLIENT-SERVER BOUNDARY bugs.
   If \`next build\` fails with \`Error occurred prerendering page\`,
   \`Export encountered an error on /<route>/page\`, or
   \`Invariant: Missing workStore …\`, fix the boundary — never weaken
   the build:
   - Convert the route page back to a Server Component and move the
     interactive parts into a \`'use client'\` child component.
   - Do NOT read \`useSearchParams\` / \`useParams\` inside a client page
     when the server page can receive \`params\` / \`searchParams\` as
     props and pass plain values down.
   - Only add \`export const dynamic = 'force-dynamic'\` when the page
     genuinely cannot be prerendered (request-time data) — never as a
     blanket "fix".

ACTION EXECUTION — when the user asks you to do something runnable

If the user's request is "start the app", "run the dev server", "run
npm install", "build the project", or any other terminal action, do
NOT just describe what they should type. Output a single fenced
command block that the workspace's terminal can run with one click,
like this:

  \`\`\`bash
  npm install && npm run dev
  \`\`\`

Keep the command minimal (one block, ≤2 commands chained with \`&&\`).
Pair it with a one-line explanation. The user will click "Run" in the
terminal panel; the WebContainer takes it from there.

BEFORE-RESPOND VALIDATOR — final mental pass before sending

Every file you emit MUST be inside a fenced code block annotated with
the file path on the first line. The extractor recognises any of:

\`\`\`json
// path: package.json
{
  "name": "my-app",
  ...
}
\`\`\`

\`\`\`tsx
// path: src/app/page.tsx
export default function Page() { return <main>…</main>; }
\`\`\`

\`\`\`css
/* path: src/app/globals.css  →  use a /* ... */ comment for CSS */
@tailwind base;
@tailwind components;
@tailwind utilities;
\`\`\`

You may also use \`# path: …\` (for files where \`//\` isn't a comment, like
\`.env\` or YAML), or \`<!-- path: … -->\` for HTML.

FILE MODIFICATIONS — STRONGLY PREFERRED FOR EXISTING FILES

When a "Repository Context" system message lists files that already exist in
the project, do NOT regenerate them as full files. Emit one or more SEARCH /
REPLACE patch blocks instead. The patches will be applied directly to the
in-database file content.

THE ONLY VALID EDIT BLOCK FORMAT — copy this skeleton exactly

\`\`\`edit:<path-to-existing-file>
<<<<<<< SEARCH
<exact code that currently exists in the file>
=======
<the replacement code>
>>>>>>> REPLACE
\`\`\`

Every edit body MUST begin with the literal line \`<<<<<<< SEARCH\`. There
is NO valid edit shape that omits it. If you find yourself about to emit
an edit fence whose first body line is anything other than
\`<<<<<<< SEARCH\`, STOP and prepend it.

All three markers are required and must appear in exactly this order, each
on its own line:

  1. \`<<<<<<< SEARCH\`   — seven \`<\`, the word SEARCH, on its own line,
                           as the FIRST line of the edit body, directly
                           above the existing code you are replacing.
  2. \`=======\`          — seven \`=\`, on its own line, between the
                           existing code and the replacement code.
  3. \`>>>>>>> REPLACE\`  — seven \`>\`, the word REPLACE, on its own line,
                           directly after the replacement code, as the
                           LAST line of the edit body.

Multiple SEARCH/REPLACE pairs inside one \`\`\`edit:<path>\`\`\` fence are
allowed; each pair must use all three markers.

WORKED EXAMPLE — the kind of output the patcher accepts

\`\`\`edit:app/layout.tsx
<<<<<<< SEARCH
<body className="bg-gray-100">
=======
<body className={\`\${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-100 text-black'}\`}>
>>>>>>> REPLACE
\`\`\`

Notice the FIRST line of the body is \`<<<<<<< SEARCH\`, not the existing
code. The existing code begins on the SECOND line.

PRE-EMISSION SELF-CHECK — run this every time before you send your reply
For every \`\`\`edit:<path>\`\`\` fence in your draft response, verify:
  □ Line 1 of the body is exactly \`<<<<<<< SEARCH\`
  □ The exact existing code is on the lines below \`<<<<<<< SEARCH\`
  □ A line containing exactly \`=======\` separates SEARCH from REPLACE
  □ The replacement code follows \`=======\`
  □ The LAST line of the body is exactly \`>>>>>>> REPLACE\`
If any box is unchecked, regenerate the block before responding.

Rules for SEARCH/REPLACE blocks:
- The SEARCH block must be an EXACT substring of the current file content
  (whitespace will be tolerated, but stick to the verbatim text when possible).
- Keep SEARCH blocks small and unique — usually the function, JSX element,
  import line, or statement you are changing, plus a couple of surrounding
  lines for uniqueness.
- Never SEARCH for boilerplate that appears multiple times.
- For pure insertions, SEARCH for the line you want to insert AFTER and
  include it in the REPLACE block too.
- For deletions, leave REPLACE empty between the markers.
- ONLY emit a full-file fenced block (\`\`\`ts // path: ...\`\`\`) when the file
  does NOT exist yet OR you are intentionally creating a new file.

BEFORE-EDIT CHECKLIST — mandatory mental pass before emitting any edit
1. Confirm the file you are about to edit is actually listed in the
   "Repository Context" system message. If it is NOT listed, you are
   probably creating a new file — emit a full-file fence, not an edit.
2. Re-read the EXACT text you intend to replace and copy it character-
   for-character into the SEARCH block. Do not paraphrase, do not
   "tidy up" indentation, do not collapse blank lines.
3. If you are renaming a symbol (variable, function, component, file
   path), emit ONE edit per touch-point that contains JUST enough
   surrounding context to be unique. Do NOT regenerate the whole file.
4. When you ADD an import or change an import path, emit a small
   targeted edit that touches ONLY the import line(s). When you
   REMOVE an export, also patch every importer in the same response
   (one edit per importer).
5. When the same line genuinely appears multiple times, expand the
   SEARCH block upward/downward until it is unique. Never trust
   that "the patcher will figure out which one I meant".
6. If your proposed change does not actually differ from the existing
   code, do NOT emit an edit — the patcher detects this and surfaces
   it as a HARD failure to the user.

RENAME / IMPORT / EXPORT handling
- File renames: at this time the workspace performs same-folder
  renames through the sidebar; you should NOT try to rename files
  through an edit block. Instead, ask the user to rename the file
  (or do it yourself through the create+delete pattern only when
  strictly necessary).
- Renaming a symbol exported from one file: patch the export site
  AND every importer in the same response. Group them as separate
  \`\`\`edit:<path>\`\`\` fences.
- Re-organizing imports: prefer a single SEARCH/REPLACE block per
  file that captures the original import group as SEARCH and the
  reorganized group as REPLACE.

Always end your response with a short bulleted summary of what was changed.

BEFORE-RESPOND VALIDATOR — run this checklist once before sending
□ For every existing-file edit, the body has \`<<<<<<< SEARCH\` /
  \`=======\` / \`>>>>>>> REPLACE\` markers, each on its own line, in
  that order.
□ The SEARCH block is a verbatim substring of the current file content.
□ No PROTECTED root file (\`package.json\`, \`tsconfig.json\`,
  \`next.config.*\`, \`tailwind.config.*\`, \`postcss.config.*\`,
  ESLint/Prettier configs, \`supabase/migrations/*\`) was overwritten
  unless the user explicitly asked.
□ Every Client-side feature (\`onClick\`, hooks, browser APIs) lives
  in a file whose FIRST line is \`'use client';\`.
□ No route \`page.tsx\` contains a second pasted client block after the
  server page. If a page needs hooks, create a separate child component
  file with \`'use client';\` as its first statement and import it.
□ No file has \`import\` declarations after executable code.
□ No \`<Link>\` contains a nested \`<a>\` child.
□ Layouts use the \`metadata\` export, not a manual \`<head>\`.
□ API routes are under \`app/api/<name>/route.ts\`, not \`pages/api/\`.
□ The whole project uses ONE App Router root (\`src/app/\` OR \`app/\`,
  never both).
□ The root layout imports the global stylesheet
  (\`import './globals.css';\`).
□ Every page/component is styled with Tailwind utility classes —
  responsive layout, styled nav/cards/buttons/forms — never bare
  browser-default HTML.

If any box is unchecked, regenerate the offending block(s) before
responding.`,

  reviewing: `You are the Reviewing Agent — a senior code reviewer and security auditor who provides thorough, actionable code reviews of THIS workspace.

PROJECT INSPECTION PROTOCOL — MANDATORY FIRST STEP
You are reviewing a real, existing project that the user has loaded
into Matrix Coder AI. The "Repository Context" system message lists
the actual files. Your review MUST be grounded in those files.

DO NOT:
- Recommend \`npx create-next-app\` or any other scaffolding command.
- Paste generic Next.js tutorial examples (no boilerplate
  \`pages/index.tsx\` snippets, no "first install Next.js" preamble).
- Compare the project against a hypothetical clean scaffold.
- Generate code unrelated to the files in context.
- Suggest installing dependencies that are already in \`package.json\`.

DO:
- Open every file in the Repository Context and review THAT file.
- Cite real file paths and real line ranges from the context.
- If the user asked for a fix (verbs like "fix", "patch", "resolve",
  "repair") and you found concrete issues, INCLUDE SEARCH/REPLACE
  patches alongside the review (same format the Coding Agent uses)
  so the workspace can apply them directly. Do not stop at
  "you should change X" when the user asked for the change.
- If validation cannot run (e.g. SharedArrayBuffer / COOP / COEP
  unavailable), state the exact reason and STOP — do not generate
  example apps to compensate.

Your responses should:
- Assign an overall score out of 10
- Identify strengths: type safety, performance, security patterns
- List issues by severity: [HIGH], [MEDIUM], [LOW]
- Show diff-style fixes for each issue (or full SEARCH/REPLACE
  patches when the user asked to fix, not just review)
- Include a security audit table covering: SQL injection, XSS, auth token exposure, RLS policies
- Check for: missing error boundaries, race conditions, memory leaks, accessibility
- Provide a clear recommendation (deploy-ready vs. fix before deploy)

Use markdown tables, diff blocks, and clear section headers.

EDIT-COMPLIANCE REVIEW — additional pass when the user asks you to
review an AI-generated change set
- Verify that every modification of an existing file uses the
  SEARCH/REPLACE format with all three markers present in the correct
  order: \`<<<<<<< SEARCH\`, \`=======\`, \`>>>>>>> REPLACE\`.
- Flag any full-file fence that targets a path that already exists in
  the Repository Context — it should have been an edit.
- Flag any rename / move that touches the symbol's export site but
  forgets one or more importers; list each missed importer explicitly.
- Flag any edit whose SEARCH and REPLACE blocks are byte-identical
  (no-op) — the patcher refuses these.
- Flag any attempt to overwrite a PROTECTED root file (\`package.json\`,
  \`tsconfig.json\`, \`next.config.*\`, \`tailwind.config.*\`,
  \`postcss.config.*\`, ESLint/Prettier configs, \`supabase/migrations/*\`)
  when the user did not explicitly request that change.`,

  orchestrator: `You are the Orchestrator — you analyze user intent and route to the optimal agent. Keep responses brief.

PROJECT INSPECTION PROTOCOL
Before recommending a route, glance at the "Repository Context" so
you know whether the user is operating on an existing project (most
of the time) or a fresh scaffold (rare).

ROUTING POLICY
- Action verbs ("build", "add", "fix", "implement", "create",
  "edit", "change", "refactor", "wire up", "scaffold") → route to
  the Coding Agent (with optional pre-pass from Planning).
- Pure analysis verbs ("plan", "design", "outline", "spec",
  "estimate") → route to Planning, but include a "READY FOR CODING
  AGENT" tail block so the workflow can hand off.
- Pure inspection verbs ("review", "audit", "lint", "check",
  "explain") → route to Reviewing, but include SEARCH/REPLACE fix
  blocks when the user explicitly asked to fix the issues found.
- Read-only intent ("only plan", "do not edit", "no changes",
  "tell me what is wrong but don't fix it") → honor it; do NOT
  hand off to Coding.
- Avoid infinite loops between Reviewer and Coder: a single
  review→code pass is enough; do not chain more than that without
  explicit user direction.`,
};

/**
 * Stable, collision-free ID generator. Backed by crypto.randomUUID() via
 * safeUUID (see /app/src/lib/uuid.ts). Replaces the legacy
 * `${prefix}-${Date.now()}-${Math.floor(Math.random()*9999)}` scheme which
 * routinely produced duplicate React keys when several IDs were minted in
 * the same millisecond (e.g. fan-out setTimeout loops).
 */
function generateId(prefix: string): string {
  return prefixedId(prefix);
}

/** Total budget (ms) for repo-context construction (heuristics + semantic). */
const CONTEXT_BUILD_TIMEOUT_MS = 5000;

/**
 * Auto-route the user's message to the most appropriate agent.
 *
 * 2026-01 orchestration fix — action verbs ("build", "add", "fix",
 * "implement", "create", "edit", "change", "refactor", "wire up",
 * "scaffold") ALWAYS win, even when the message also contains
 * planning-like nouns ("plan", "structure") or review-like nouns
 * ("audit", "bug"). This prevents requests like "fix the bug" or
 * "build a todo page" from getting stuck in the Planning or
 * Reviewing agent with no follow-through to actual edits.
 *
 * Read-only intent phrases ("only plan", "do not edit", "no changes",
 * "review only") bypass this and stay on the Planning/Reviewing
 * agent, honoring the user's explicit constraint.
 */
const ACTION_VERB_REGEX =
  /\b(build|add|fix|implement|create|edit|change|refactor|wire up|scaffold|generate|patch|update|remove|delete|rename|migrate|hook up|connect|inject|integrate)\b/i;
const READ_ONLY_INTENT_REGEX =
  /\b(only (?:plan|review)|do not edit|don'?t edit|no changes|no edits|review only|plan only|tell me what is wrong but don'?t fix)\b/i;

function detectAgent(text: string): AgentType {
  const lower = text.toLowerCase();

  // Honor explicit read-only intent first.
  if (READ_ONLY_INTENT_REGEX.test(lower)) {
    if (lower.includes('review') || lower.includes('audit') || lower.includes('lint') || lower.includes('check')) {
      return 'reviewing';
    }
    return 'planning';
  }

  // Action verbs short-circuit to Coding so we never strand the user
  // with a plan/review when they asked for an implementation.
  if (ACTION_VERB_REGEX.test(lower)) {
    return 'coding';
  }

  if (lower.includes('plan') || lower.includes('architect') || lower.includes('design') || lower.includes('structure')) {
    return 'planning';
  }
  if (lower.includes('review') || lower.includes('audit') || lower.includes('bug') || lower.includes('security') || lower.includes('check')) {
    return 'reviewing';
  }
  return 'coding';
}

function extractFilePaths(content: string): string[] {
  // Kept for backwards compatibility; delegates to shared extractor.
  return extractMentionedPaths(content);
}

interface GenerationBatch {
  id: number;
  title: string;
  scope: string;
}

interface ActiveBatchGeneration {
  active: boolean;
  baseRequest: string;
  repoContextString: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  memStage: MemoryStage;
  batches: GenerationBatch[];
  index: number;
}

const GENERATION_MAX_COMPLETION_TOKENS = 8192;
const BATCH_MAX_FILES = 3;

const LARGE_APP_BATCHES: GenerationBatch[] = [
  {
    id: 1,
    title: 'root page shell',
    scope:
      'Core Next.js scaffold files are already created by Matrix Coder from deterministic templates. Do NOT emit package.json, tsconfig.json, next.config.mjs, postcss.config.js, tailwind.config.ts, src/app/globals.css, or src/app/layout.tsx. Create only src/app/page.tsx if the app needs a root homepage shell. Never create root app/ files.',
  },
  {
    id: 2,
    title: 'domain types/storage/helpers',
    scope:
      'Create only domain-specific shared types, localStorage/storage helpers, seed helpers, and small reusable utilities. Do not create route pages in this batch.',
  },
  {
    id: 3,
    title: 'primary feature routes and shared components',
    scope:
      'Create only the root experience, primary requested feature routes, and shared UI components needed by the product domain. Use route names from the user request; do not invent notes-style add/edit/history routes unless they are explicitly requested.',
  },
  {
    id: 4,
    title: 'secondary feature routes and workflows',
    scope:
      'Create only secondary requested feature routes and their immediate workflow components. Preserve exact route names from the request, such as /add-note, /history, /workouts, /progress, /timer, /settings, or CRM/SaaS domain routes. Include search, filter, edit, delete, and localStorage wiring where the requested workflow naturally needs them, without forcing a history route.',
  },
  {
    id: 5,
    title: 'validation',
    scope:
      'Create only small missing glue files or corrections discovered from prior batches. Do not duplicate files already emitted. End with a concise final file list.',
  },
];

const NEXT_SCAFFOLD_PATH_SET = new Set<string>(NEXT_SCAFFOLD_PATHS);

function dedupeGeneratedPaths(paths: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of paths) {
    if (!raw) continue;
    const clean = raw
      .trim()
      .replace(/^["'`]+|["'`,.;:]+$/g, '')
      .replace(/\\/g, '/')
      .replace(/^\.\/+/, '')
      .replace(/\/{2,}/g, '/');
    if (!clean || out.includes(clean)) continue;
    out.push(clean);
  }
  return out;
}

function missingRequiredPathsForBatch(
  state: ActiveBatchGeneration,
  fileTree: FileNode[],
  mutatedFilesByPath: Map<string, FileNode>
): string[] {
  const batch = state.batches[state.index];
  if (!batch || batch.title === 'validation') return [];
  const required = inferRequiredPathsForBatch(state.baseRequest, batch);
  if (required.length === 0) return [];

  const currentPaths = new Set(
    flattenTree(fileTree)
      .filter((file) => file.type === 'file')
      .map((file) => file.path)
  );
  for (const path of mutatedFilesByPath.keys()) {
    currentPaths.add(path);
  }

  return required.filter((path) => !currentPaths.has(path));
}

function shouldBatchGenerationRequest(text: string, agent: AgentType, files: FileNode[]): boolean {
  if (agent !== 'coding') return false;
  const lower = text.toLowerCase();
  const wantsApp =
    /\b(build|create|make|scaffold|generate|set up)\b/.test(lower) &&
    /\b(app|application|site|dashboard|tracker|manager|crm|portal|pages?)\b/.test(lower);
  const impliesManyFiles =
    /\b(3\s+pages|three\s+pages|dashboard|history|edit|delete|filter|localstorage|components?|full app|complete app)\b/.test(lower);
  const existingFiles = flattenTree(files).filter((file) => file.type === 'file').length;
  return wantsApp && (impliesManyFiles || existingFiles < 8);
}

function buildBatchPrompt(
  baseRequest: string,
  batch: GenerationBatch,
  index: number,
  total: number,
  continuation?: { lastCompletePath?: string | null; reason: string; missingPaths?: string[] }
): string {
  const requiredPaths = inferRequiredPathsForBatch(baseRequest, batch);
  const missingPaths = dedupeGeneratedPaths(continuation?.missingPaths ?? []);
  return [
    `Original user request:\n${baseRequest}`,
    '',
    `AUTOMATIC BATCHED GENERATION - Batch ${index + 1} of ${total}: ${batch.title}`,
    '',
    `Scope for this response:\n${batch.scope}`,
    requiredPaths.length
      ? `Required file(s) before this batch can be marked complete:\n${requiredPaths.map((path) => `- ${path}`).join('\n')}`
      : '',
    '',
    'Hard limits for this response:',
    `- Emit at most ${BATCH_MAX_FILES} files.`,
    '- Emit only complete, closed code fences.',
    '- Stop before the response becomes long enough to risk truncation.',
    '- Do not start a file unless you can finish it in this same response.',
    '- Do not run validation or claim validation passed.',
    '- Do not ask the user to say continue.',
    '- Do not emit files outside this batch scope.',
    `- Do not emit deterministic scaffold files: ${NEXT_SCAFFOLD_PATHS.join(', ')}. Matrix Coder creates these from templates before generation.`,
    '- If a needed file belongs to a later batch, list it under NEXT BATCH NOTES instead of creating it now.',
    continuation
      ? `Continuation repair: the previous response was incomplete (${continuation.reason}). Files successfully parsed before the truncation have already been saved. Continue the same batch plan and emit only the missing, truncated, or still-required file(s)${missingPaths.length ? `: ${missingPaths.join(', ')}` : continuation.lastCompletePath ? ` after ${continuation.lastCompletePath}` : ''}. Do not re-emit files that were already completed.`
      : '',
    '',
    index < total - 1
      ? `End with exactly: NEXT BATCH ${index + 2} READY`
      : 'End with exactly: BATCHED GENERATION COMPLETE',
  ]
    .filter(Boolean)
    .join('\n');
}

export default function ChatComposer({
  isStreaming,
  messages,
  activeFile,
  fileTree,
  sessionId,
  onAddMessage,
  onAppendMessageToUI,
  onUpdateLastMessage,
  onSetActiveAgent,
  onSetIsStreaming,
  onSetMemoryStage,
  onSetSessionTokens,
  onSetActivityStatus,
  onAddFile,
  onUpdateFile,
  onDeleteFile,
  onSaveFinalAssistantMessage,
  initialPrompt,
}: Props) {
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentType | 'auto'>('auto');
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamMsgIdRef = useRef<string>('');
  const accumulatedRef = useRef<string>('');
  const agentRef = useRef<AgentType>('coding');
  // Last user text — kept so we can restore the composer for retry when
  // the AI request fails (hardening pass #6).
  const lastUserTextRef = useRef<string>('');
  // Track whether streaming has begun producing content so we can flip the
  // activity message from "Sending request to AI…" → "Streaming response…".
  const streamingMessageShownRef = useRef<boolean>(false);
  const batchGenerationRef = useRef<ActiveBatchGeneration | null>(null);
  const consumedInitialPromptRef = useRef(false);

  const { response, isLoading, error, sendMessage } = useChat(AI_PROVIDER, PRIMARY_MODEL, true);

  useEffect(() => {
    if (consumedInitialPromptRef.current || !initialPrompt?.trim()) return;
    consumedInitialPromptRef.current = true;
    setInput((current) => (current.trim() ? current : initialPrompt.trim()));
  }, [initialPrompt]);

  useEffect(() => {
    pushTerminalLog({
      level: 'info',
      text: `[AI] Primary Model: ${PRIMARY_MODEL}\n[AI] Auto Fix Model: ${AUTO_FIX_MODEL}\n`,
      timestamp: Date.now(),
    });
  }, []);

  const launchAgentRequest = useCallback(
    (
      agent: AgentType,
      prompt: string,
      options: {
        repoContextString?: string;
        conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
        memStage: MemoryStage;
        status?: string;
        batchLabel?: string;
      }
    ) => {
      if (isLoading || streamMsgIdRef.current) {
        pushTerminalLog({
          level: 'warn',
          text: `[generation-batch] skipped overlapping send while another AI request is active\n`,
          timestamp: Date.now(),
        });
        return;
      }
      const streamMsgId = generateId('msg');

      agentRef.current = agent;
      streamMsgIdRef.current = streamMsgId;
      accumulatedRef.current = '';
      streamingMessageShownRef.current = false;

      onSetActiveAgent(agent);
      onSetIsStreaming(true);
      onSetActivityStatus(options.status ?? 'Sending request to AI...');

      onAppendMessageToUI({
        id: streamMsgId,
        role: 'assistant',
        agent,
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
        memoryStage: options.memStage,
      });

      const apiMessages = [
        {
          role: 'system' as const,
          content: AGENT_SYSTEM_PROMPTS[agent],
        },
        ...(options.repoContextString
          ? [{ role: 'system' as const, content: options.repoContextString }]
          : []),
        ...(options.conversationHistory ?? []),
        {
          role: 'user' as const,
          content: prompt,
        },
      ];

      if (options.batchLabel) {
        pushTerminalLog({
          level: 'info',
          text: `[generation-batch] request ${options.batchLabel}\n`,
          timestamp: Date.now(),
        });
      }

      sendMessage(apiMessages, {
        max_completion_tokens: GENERATION_MAX_COMPLETION_TOKENS,
      });
    },
    [
      onAppendMessageToUI,
      onSetActiveAgent,
      onSetActivityStatus,
      onSetIsStreaming,
      isLoading,
      sendMessage,
    ]
  );

  const continueBatchGeneration = useCallback(
    (continuation?: { lastCompletePath?: string | null; reason: string; missingPaths?: string[] }) => {
      const state = batchGenerationRef.current;
      if (!state?.active) return;
      const batch = state.batches[state.index];
      if (!batch) return;
      const prompt = buildBatchPrompt(
        state.baseRequest,
        batch,
        state.index,
        state.batches.length,
        continuation
      );
      launchAgentRequest('coding', prompt, {
        repoContextString: state.repoContextString,
        conversationHistory: state.conversationHistory,
        memStage: state.memStage,
        status: continuation
          ? `Repairing batch ${state.index + 1}...`
          : `Generating batch ${state.index + 1}/${state.batches.length}...`,
        batchLabel: `${state.index + 1}/${state.batches.length} ${batch.title}`,
      });
    },
    [launchAgentRequest]
  );

  useEffect(() => {
    if (error) {
      const errMsg = error.message ?? 'AI response failed';
      toast.error(errMsg);
      onSetIsStreaming(false);
      onSetActiveAgent(null);
      onSetActivityStatus(null);
      streamingMessageShownRef.current = false;

      // Mark the empty streaming placeholder as a visible failure so the
      // user sees what went wrong inline (not just a transient toast).
      if (streamMsgIdRef.current) {
        onUpdateLastMessage((prev) => ({
          ...prev,
          isStreaming: false,
          content:
            prev.content && prev.content.length > 0
              ? `${prev.content}\n\n_// AI request failed mid-stream: ${errMsg}_`
              : `_// AI request failed: ${errMsg}_`,
        }));
      }

      // Append a visible system message offering retry guidance.
      // BUG #2 FIX (2026-01) — persist this so a refresh doesn't hide
      // the failure context from the user.
      if (batchGenerationRef.current?.active) {
        onAddMessage({
          id: prefixedId('msg'),
          role: 'system',
          content:
            `Automatic batch generation stopped because the AI request failed - **${errMsg}**.\n\n` +
            `Auto-continuation could not complete. Retry the original request or ask the Coding Agent to continue the current batch.`,
          timestamp: new Date().toISOString(),
        });
        batchGenerationRef.current.active = false;
        streamMsgIdRef.current = '';
        accumulatedRef.current = '';
        return;
      }

      onAddMessage({
        id: prefixedId('msg'),
        role: 'system',
        content:
          `AI request failed — **${errMsg}**.\n\n` +
          `Your last message has been restored to the composer. Edit it (or leave it as-is) and press Enter to retry. ` +
          `If the failure persists, check your API key in \`.env\` or try a smaller request.`,
        timestamp: new Date().toISOString(),
      });

      // Restore the last user text so the user can hit Enter to retry.
      if (lastUserTextRef.current) {
        setInput(lastUserTextRef.current);
      }

      // Reset stream tracking so the next send isn't confused.
      streamMsgIdRef.current = '';
      accumulatedRef.current = '';
    }
  }, [
    error,
    onSetIsStreaming,
    onSetActiveAgent,
    onSetActivityStatus,
    onUpdateLastMessage,
    onAddMessage,
  ]);

  useEffect(() => {
    if (!streamMsgIdRef.current) return;

    accumulatedRef.current = response;

    // First content chunk → flip activity status to "Streaming response…"
    if (response && !streamingMessageShownRef.current) {
      streamingMessageShownRef.current = true;
      onSetActivityStatus('Streaming response…');
    }

    onUpdateLastMessage((prev) =>
      prev.content === response
        ? prev
        : {
            ...prev,
            content: response,
          }
    );
  }, [response, onUpdateLastMessage, onSetActivityStatus]);

  useEffect(() => {
    if (!isLoading && streamMsgIdRef.current) {
      // 2026-01 INFINITE-LOOP FIX
      //
      // This effect's body calls `onUpdateFile`/`onAddFile`, which mutate
      // `fileTree` — a dependency of this very effect. Without guarding,
      // the first mutation re-fires the effect synchronously while
      // `streamMsgIdRef.current` is still set, causing the entire body
      // (extractors + patchers + auto-fix kickoff) to run again on every
      // subsequent file mutation. React aborts with "Maximum update
      // depth exceeded" once 50 stacked renders have happened.
      //
      // Fix: capture the stream id into a local AND clear the ref at the
      // very top of the body BEFORE any state-mutating call. Subsequent
      // re-fires (triggered by fileTree updates inside this same handler)
      // see `streamMsgIdRef.current === ''` and short-circuit.
      const streamId = streamMsgIdRef.current;
      streamMsgIdRef.current = '';

      const finalContent = accumulatedRef.current;
      const tokenCount = Math.floor(finalContent.length / 4);

      const finalFiles =
        agentRef.current === 'coding'
          ? extractMentionedPaths(finalContent)
          : [];

      onUpdateLastMessage((prev) => ({
        ...prev,
        isStreaming: false,
        tokenCount,
        files: finalFiles,
      }));

      // DB-only persist. The message ALREADY exists in UI state (it was
      // appended via onAppendMessageToUI before streaming and updated
      // in-place via onUpdateLastMessage). Calling addMessage here would
      // re-append it and produce the duplicate-assistant-message bug.
      onSaveFinalAssistantMessage({
        id: streamId,
        role: 'assistant',
        agent: agentRef.current,
        content: finalContent,
        timestamp: new Date().toISOString(),
        isStreaming: false,
        tokenCount,
        files: finalFiles,
      });

      onSetSessionTokens((prev) => prev + tokenCount + 50);
      onSetIsStreaming(false);
      onSetActiveAgent(null);

      const shouldExtractFiles = agentRef.current === 'coding';
      const activeBatchGeneration = batchGenerationRef.current?.active
        ? batchGenerationRef.current
        : null;
      if (activeBatchGeneration) {
        activeBatchGeneration.conversationHistory = [
          ...activeBatchGeneration.conversationHistory,
          {
            role: 'assistant' as const,
            content: finalContent.slice(0, 12000),
          },
        ].slice(-8);
      }

      // Track post-mutation file state so we can hand a consistent
      // snapshot to the auto-fix loop without depending on React-state
      // timing. The loop runs after all edits + creates have been
      // applied to the in-React tree.
      const mutatedFilesByPath = new Map<string, FileNode>();
      let appliedAnyEdit = false;
      let createdAny = false;
      let createsCount = 0;
      let extractedPathsForDiagnostics: string[] = [];
      let persistedScheduledPathsForDiagnostics: string[] = [];
      let ignoredProtectedScaffoldCount = 0;
      let incompleteBatchContinuation:
        | { lastCompletePath?: string | null; reason: string; missingPaths?: string[] }
        | null = null;

      if (shouldExtractFiles) {
        const activeBatch = activeBatchGeneration;
        if (!activeBatch || activeBatch.index === 0) {
          resetPreviewDiagnostics();
        }
        beginPreviewStage(
          'generation',
          activeBatch
            ? `Coding Agent batch ${activeBatch.index + 1}/${activeBatch.batches.length} received; extracting generated files.`
            : 'Coding Agent response received; extracting generated files.'
        );
        const extracted = extractFromAssistantResponse(finalContent);
        const protectedCreates = activeBatch
          ? extracted.creates.filter((file) => NEXT_SCAFFOLD_PATH_SET.has(file.path))
          : [];
        const protectedEdits = activeBatch
          ? extracted.edits.filter((edit) => NEXT_SCAFFOLD_PATH_SET.has(normalizeEditPath(edit.path)))
          : [];
        ignoredProtectedScaffoldCount = protectedCreates.length + protectedEdits.length;
        const creates = activeBatch
          ? extracted.creates.filter((file) => !NEXT_SCAFFOLD_PATH_SET.has(file.path))
          : extracted.creates;
        const edits = activeBatch
          ? extracted.edits.filter((edit) => !NEXT_SCAFFOLD_PATH_SET.has(normalizeEditPath(edit.path)))
          : extracted.edits;
        const { malformedEdits, malformedEditReasons } = extracted;
        if (ignoredProtectedScaffoldCount > 0) {
          pushTerminalLog({
            level: 'warn',
            text:
              `[scaffold-template] ignored ${ignoredProtectedScaffoldCount} LLM-emitted scaffold action(s): ` +
              `${[...protectedCreates.map((file) => file.path), ...protectedEdits.map((edit) => normalizeEditPath(edit.path))].join(', ')}\n`,
            timestamp: Date.now(),
          });
        }
        extractedPathsForDiagnostics = Array.from(
          new Set([...creates.map((file) => file.path), ...edits.map((edit) => edit.path)])
        );
        const completeness = analyzeResponseCompleteness(finalContent, extracted);

        if (completeness.blocking) {
          const reason = completeness.issues.map((issue) => issue.message).join(' ');
          const missingPaths = dedupeGeneratedPaths(
            completeness.issues.map((issue) => issue.path)
          );

          if (activeBatch && (creates.length > 0 || edits.length > 0)) {
            incompleteBatchContinuation = {
              lastCompletePath: completeness.lastCompletePath,
              reason,
              missingPaths,
            };
            pushTerminalLog({
              level: 'warn',
              text:
                `[generation-batch] partial batch=${activeBatch.index + 1}/${activeBatch.batches.length} ` +
                `preserving=${creates.length + edits.length} missing=${missingPaths.join(', ') || 'unknown'} ` +
                `reason="${reason.replace(/\s+/g, ' ').slice(0, 400)}"\n`,
              timestamp: Date.now(),
            });
            onAddMessage({
              id: prefixedId('msg'),
              role: 'system',
              content:
                `**Generation batch incomplete - preserving completed files**\n\n` +
                `Batch ${activeBatch.index + 1}/${activeBatch.batches.length} was truncated or internally inconsistent. ` +
                `Matrix Coder will save the ${creates.length + edits.length} complete file action(s) already parsed, keep validation paused, and request only the missing/truncated file(s)${missingPaths.length ? `: ${missingPaths.map((path) => `\`${path}\``).join(', ')}` : ''}.`,
              timestamp: new Date().toISOString(),
            });
            toast.error('Batch response was incomplete; saving complete files and continuing.');
          } else {
            failPreviewStage(
              'generation',
              completeness.issues.map((issue) => issue.message).join(' ')
            );
            if (activeBatch) {
            onAddMessage({
              id: prefixedId('msg'),
              role: 'system',
              content:
                `**Generation batch incomplete - auto-continuing**\n\n` +
                `Batch ${activeBatch.index + 1}/${activeBatch.batches.length} was truncated or internally inconsistent, so no files from that response were written and validation remains paused.\n\n` +
                `Matrix Coder is requesting a repaired continuation from the last complete file${completeness.lastCompletePath ? ` (\`${completeness.lastCompletePath}\`)` : ''}.`,
              timestamp: new Date().toISOString(),
            });
            pushTerminalLog({
              level: 'warn',
              text:
                `[generation-batch] incomplete batch=${activeBatch.index + 1}/${activeBatch.batches.length} ` +
                `lastComplete=${completeness.lastCompletePath ?? 'none'} reason="${reason.replace(/\s+/g, ' ').slice(0, 400)}"\n`,
              timestamp: Date.now(),
            });
            toast.error('Batch response was incomplete; auto-continuing.');
            onSetActivityStatus('Repairing incomplete generation batch...');
            setTimeout(() => {
              continueBatchGeneration({
                lastCompletePath: completeness.lastCompletePath,
                reason,
                missingPaths,
              });
            }, 600);
            accumulatedRef.current = '';
            streamingMessageShownRef.current = false;
            return;
            }
          const issueLines = completeness.issues
            .slice(0, 12)
            .map((issue) => `- ${issue.path ? `\`${issue.path}\` — ` : ''}${issue.message}`)
            .join('\n');
          onAddMessage({
            id: prefixedId('msg'),
            role: 'system',
            content:
              `**Generation incomplete — validation paused**\n\n` +
              `The Coding Agent response appears truncated or internally inconsistent, so no files were written and validation was not started.\n\n` +
              `${issueLines}\n\n` +
              `Ask the Coding Agent to continue from the last complete file${completeness.lastCompletePath ? ` (\`${completeness.lastCompletePath}\`)` : ''}. ` +
              `For large apps, continue in smaller batches: scaffold/config/layout, domain types/helpers, primary feature routes, secondary workflows, then validation.`,
            timestamp: new Date().toISOString(),
          });
          toast.error('Generation response was incomplete; validation paused.');
          onSetActivityStatus(null);
          streamMsgIdRef.current = '';
          accumulatedRef.current = '';
          streamingMessageShownRef.current = false;
          return;
          }
        }

        // ----- Malformed edit fences (missing SEARCH/REPLACE markers) -----
        // BUG FIX (2026-01) — previously these failures were only
        // `console.warn`-ed inside the extractor. The user saw the AI's
        // prose ("Files written: …") and assumed the edits had landed,
        // when in reality NOTHING was applied. We now emit a HARD,
        // persistent system message naming every malformed fence so the
        // user can ask the AI to retry with the correct format.
        if (malformedEdits.length > 0) {
          // Per-path diagnostic lines — show the SPECIFIC marker that
          // was missing so the AI's next attempt is far more likely to
          // succeed. Falls back to a generic note when the extractor
          // didn't give us a precise reason.
          const detailLines = malformedEdits
            .map((p) => {
              const r =
                malformedEditReasons[p] ??
                'Patch rejected: required SEARCH/REPLACE markers missing.';
              return `- \`${p}\` — ${r}`;
            })
            .join('\n');
          onAddMessage({
            id: prefixedId('msg'),
            role: 'system',
            content:
              `**Patch failure — malformed SEARCH/REPLACE blocks** ❌\n\n` +
              `**No files were modified.**\n\n` +
              `${detailLines}\n\n` +
              `Ask the agent to retry. The exact, required format is:\n\n` +
              '```\n' +
              '```edit:src/foo.ts\n' +
              '<<<<<<< SEARCH\n' +
              '<exact existing code>\n' +
              '=======\n' +
              '<replacement>\n' +
              '>>>>>>> REPLACE\n' +
              '```\n' +
              '```\n\n' +
              `All three markers — \`<<<<<<< SEARCH\`, \`=======\`, ` +
              `\`>>>>>>> REPLACE\` — are mandatory and must each appear ` +
              `on their own line in that exact order.`,
            timestamp: new Date().toISOString(),
          });
          // Toast prefers the most actionable reason if all malformed
          // fences share the same diagnostic, otherwise generic.
          const uniqueReasons = Array.from(
            new Set(malformedEdits.map((p) => malformedEditReasons[p] ?? ''))
          ).filter(Boolean);
          if (uniqueReasons.length === 1) {
            toast.error(uniqueReasons[0]);
          } else {
            toast.error(
              `AI emitted ${malformedEdits.length} malformed edit${malformedEdits.length === 1 ? '' : 's'} — see chat for details`
            );
          }
        }

        // ----- Apply EDITS first -----
        if (edits.length > 0) {
          onSetActivityStatus('Applying file edits…');

          // Build a path → file map from the current tree
          const flat = flattenTree(fileTree);
          const byPath = new Map(flat.map((f) => [f.path, f]));
          const treePaths = Array.from(byPath.keys());

          // Resolve AI-emitted paths against the tree FIRST (handles
          // missing/extra "src/" prefix, leading "./", suffix matches).
          // Then group by the resolved canonical path so multiple
          // SEARCH/REPLACEs against the same file apply sequentially.
          const editsByPath = new Map<string, typeof edits>();
          for (const e of edits) {
            // Defence-in-depth: extractor already normalizes, but if a
            // caller hand-rolled an edit, normalize again here.
            const normalized = normalizeEditPath(e.path);
            const { resolved, strategy } = resolveEditPath(normalized, treePaths);
            console.info(
              `[patcher] edit path: emitted="${e.path}" normalized="${normalized}" resolved="${resolved ?? '<none>'}" strategy=${strategy}`
            );

            // Key the group by the resolved tree path (if found) or by
            // the normalized emitted path (if not — the failure handler
            // below will report it).
            const key = resolved ?? normalized;
            const arr = editsByPath.get(key) ?? [];
            // Rewrite the edit so downstream consumers see the resolved
            // path, not the AI's raw emission.
            arr.push({ ...e, path: key });
            editsByPath.set(key, arr);
          }

          // Collect per-file patch outcomes so we can emit ONE visible
          // system message at the end (not just transient toasts).
          // Hardening pass #2 — visible patch failure handling.
          const patchReports: string[] = [];

          editsByPath.forEach((fileEdits, path) => {
            const targetFile = byPath.get(path);
            if (!targetFile || typeof targetFile.content !== 'string') {
              console.warn(`[patcher] target file not found in tree: ${path}`);
              toast.error(`AI tried to edit "${path}" but it isn't in the project`);
              patchReports.push(
                `[FAILED] \`${path}\` — file is not in the project. ` +
                  `The agent tried to apply ${fileEdits.length} edit${fileEdits.length === 1 ? '' : 's'} to a path that doesn't exist. ` +
                  `Ask the agent to create the file first, or check the path spelling.`
              );
              return;
            }
            const { finalContent: patched, applied, noopCount, failed, strategies, unchanged, rejected } =
              applyEditSequence(targetFile.content, fileEdits);
            if (rejected || applied === 0 || unchanged) {
              // CRITICAL: do NOT mutate the file when no edit produced a
              // real change. This is both the "every block failed to
              // match" case AND the "all blocks were no-op SEARCH===REPLACE"
              // case — both of which used to silently claim success.
              const reasonBits: string[] = [];
              if (rejected) {
                reasonBits.push(rejected);
              } else if (applied === 0) {
                reasonBits.push(
                  `none of the ${fileEdits.length} SEARCH/REPLACE block${fileEdits.length === 1 ? '' : 's'} matched the current file content`
                );
                const sampleReason = failed[0]?.reason ?? 'unknown patcher error';
                reasonBits.push(`(${sampleReason})`);
              } else if (unchanged) {
                reasonBits.push(
                  `${applied}/${fileEdits.length} block${fileEdits.length === 1 ? '' : 's'} matched but the REPLACE was byte-identical to SEARCH (no change)`
                );
              }
              console.warn(`[patcher] no real change for ${path}: ${reasonBits.join(' ')}`);
              toast.error(`Could not patch ${path} — ${reasonBits[0]}`);
              patchReports.push(
                `[FAILED] \`${path}\` — ${reasonBits.join(' ')}. **The file was NOT modified.** Ask the agent to re-emit the edit with a smaller, exact SEARCH block taken from the current file, or to regenerate the file from scratch.`
              );
              return;
            }
            // Build the updated FileNode immutably. Preserve the
            // original id/path/name so the downstream updateFile()
            // matchers (by id AND by path) hit cleanly, and so the
            // sidebar's tree node identity is preserved across patches.
            const updated: FileNode = {
              ...targetFile,
              content: patched,
              size: patched.length,
              lastModified: new Date().toISOString(),
              isNew: false,
            };
            console.info(
              `[patcher] applying ${applied}/${fileEdits.length} edits to ${path} (id=${targetFile.id}, strategies=${strategies.join(',')}, noopCount=${noopCount}, sizeBefore=${targetFile.content.length}, sizeAfter=${patched.length})`
            );
            onUpdateFile(updated);
            mutatedFilesByPath.set(path, updated);
            appliedAnyEdit = true;
            const summary =
              failed.length > 0
                ? `Patched ${path} (${applied}/${fileEdits.length} edits, strategies: ${strategies.join(', ')})`
                : `Patched ${path} (${applied} edit${applied === 1 ? '' : 's'})`;
            console.info(`[patcher] ${summary}`);
            toast.success(summary);
            if (failed.length > 0) {
              toast.error(`${failed.length} edit block(s) failed to match in ${path}`);
              const sampleReason = failed[0]?.reason ?? 'unknown patcher error';
              patchReports.push(
                `[PARTIAL] \`${path}\` — applied ${applied}/${fileEdits.length} edits. ` +
                  `${failed.length} block${failed.length === 1 ? '' : 's'} failed to match (${sampleReason}). ` +
                  `Ask the agent to re-emit just the failed block${failed.length === 1 ? '' : 's'}.`
              );
            }
          });

          // Emit a single consolidated system message so failures are
          // visible in the chat (not just in dismissible toasts).
          // Hardening pass #2 — visible patch failure handling.
          // BUG #2 FIX (2026-01) — use onAddMessage so the report
          // SURVIVES a page refresh; previously it was UI-only and
          // disappeared when the user reloaded.
          if (patchReports.length > 0) {
            onAddMessage({
              id: prefixedId('msg'),
              role: 'system',
              content: `**Patch report**\n\n${patchReports.join('\n\n')}`,
              timestamp: new Date().toISOString(),
            });
          }
        }

        // ----- Apply CREATES (existing behavior) -----
        if (creates.length > 0) {
          onSetActivityStatus('Saving files…');
          console.info(
            `[Files] Created ${creates.length} new file(s) from ${agentRef.current} agent`
          );
        }
        creates.forEach((file, idx) => {
          setTimeout(() => {
            const markerLeak = describePatchMarkerLeak(file.content);
            if (markerLeak) {
              console.warn(`[Files] rejected create for ${file.path}: ${markerLeak}`);
              toast.error(`Rejected ${file.path} because patch markers leaked into the file`);
              onAddMessage({
                id: prefixedId('msg'),
                role: 'system',
                content: `**File rejected**\n\n\`${file.path}\` was not saved because ${markerLeak}. Ask the agent to continue with a clean full-file block.`,
                timestamp: new Date().toISOString(),
              });
              return;
            }
            onAddFile({
              id: `file-${safeUUID()}`,
              name: file.name,
              path: file.path,
              type: 'file',
              language: file.language as any,
              isNew: true,
              content: file.content,
              lastModified: new Date().toISOString(),
              size: file.content.length,
            });
          }, idx * 200);
        });
        if (creates.length > 0) {
          const safeCreates = creates.filter((file) => !describePatchMarkerLeak(file.content));
          createdAny = safeCreates.length > 0;
          createsCount = safeCreates.length;
          persistedScheduledPathsForDiagnostics.push(...safeCreates.map((file) => file.path));
          for (const c of safeCreates) {
            mutatedFilesByPath.set(c.path, {
              id: `file-${safeUUID()}`,
              name: c.name,
              path: c.path,
              type: 'file',
              language: c.language as any,
              isNew: true,
              content: c.content,
              lastModified: new Date().toISOString(),
              size: c.content.length,
            });
          }
        }

        persistedScheduledPathsForDiagnostics.push(...Array.from(mutatedFilesByPath.keys()));

        if (appliedAnyEdit || createdAny) {
          completePreviewStage(
            'generation',
            `Applied ${edits.length} edit block(s) and ${createsCount} created file(s).`
          );
        } else if (malformedEdits.length > 0) {
          failPreviewStage(
            'generation',
            `No files were written because ${malformedEdits.length} edit block(s) were malformed.`
          );
        } else if (activeBatchGeneration && ignoredProtectedScaffoldCount > 0) {
          completePreviewStage(
            'generation',
            `Ignored ${ignoredProtectedScaffoldCount} protected scaffold file action(s); deterministic templates already own those files.`
          );
        } else {
          failPreviewStage(
            'generation',
            'Coding Agent response did not produce any complete file edits or creates.'
          );
        }

        logGenerationConsistency('after-write', {
          extractedPaths: extractedPathsForDiagnostics,
          writtenPaths: Array.from(mutatedFilesByPath.keys()),
          treePaths: flattenTree(fileTree)
            .filter((file) => file.type === 'file')
            .map((file) => file.path),
          persistedScheduledPaths: Array.from(new Set(persistedScheduledPathsForDiagnostics)),
        });

        // Clear activity status once all create timeouts have fired.
        if (creates.length > 0) {
          setTimeout(() => onSetActivityStatus(null), creates.length * 200 + 300);
        } else {
          onSetActivityStatus(null);
        }

        if (activeBatchGeneration && !incompleteBatchContinuation) {
          const missingRequiredPaths = missingRequiredPathsForBatch(
            activeBatchGeneration,
            fileTree,
            mutatedFilesByPath
          );
          if (missingRequiredPaths.length > 0) {
            const writtenPaths = Array.from(mutatedFilesByPath.keys());
            incompleteBatchContinuation = {
              lastCompletePath: writtenPaths[writtenPaths.length - 1] ?? null,
              reason:
                `Batch ${activeBatchGeneration.index + 1} cannot complete until required file(s) exist: ` +
                missingRequiredPaths.join(', '),
              missingPaths: missingRequiredPaths,
            };
            pushTerminalLog({
              level: 'warn',
              text:
                `[generation-batch] required file gate batch=${activeBatchGeneration.index + 1}/${activeBatchGeneration.batches.length} ` +
                `missing=${missingRequiredPaths.join(', ')}; validation remains paused\n`,
              timestamp: Date.now(),
            });
            onAddMessage({
              id: prefixedId('msg'),
              role: 'system',
              content:
                `**Generation batch still needs required files**\n\n` +
                `Batch ${activeBatchGeneration.index + 1}/${activeBatchGeneration.batches.length} cannot be marked complete yet. ` +
                `Matrix Coder will continue the same batch and generate: ${missingRequiredPaths
                  .map((path) => `\`${path}\``)
                  .join(', ')}.`,
              timestamp: new Date().toISOString(),
            });
          }
        }

        if (incompleteBatchContinuation && activeBatchGeneration) {
          const launchDelay = createdAny ? createsCount * 200 + 600 : 600;
          pushTerminalLog({
            level: 'warn',
            text:
              `[generation-batch] validation paused for incomplete batch; ` +
              `continuing missing=${dedupeGeneratedPaths(incompleteBatchContinuation.missingPaths ?? []).join(', ') || 'unknown'}\n`,
            timestamp: Date.now(),
          });
          setTimeout(() => {
            continueBatchGeneration(incompleteBatchContinuation ?? undefined);
          }, launchDelay);
          streamMsgIdRef.current = '';
          accumulatedRef.current = '';
          streamingMessageShownRef.current = false;
          return;
        }
      } else {
        onSetActivityStatus(null);
      }

      // -------------------------------------------------------------
      // Phase 1 — Build Validation + Auto-Fix Loop
      //
      // After the Coding Agent has applied its edits/creates, run the
      // real type-check + build inside the WebContainer. On failure,
      // ask the AI for SEARCH/REPLACE patches, apply them, and retry
      // up to 3 times. The loop reports progress via:
      //   - onSetActivityStatus  (transient row in AgentStatusBar)
      //   - onAppendMessageToUI  (permanent system messages in chat)
      //
      // Concurrency: runAutoFixLoop holds its own module-level lock
      // (isAutoFixRunning()), so multiple assistant turns in flight
      // cannot stack.
      // -------------------------------------------------------------
      if ((appliedAnyEdit || createdAny || ignoredProtectedScaffoldCount > 0) && activeBatchGeneration) {
        const isFinalBatch =
          activeBatchGeneration.index >= activeBatchGeneration.batches.length - 1;
        const launchDelay = createdAny ? createsCount * 200 + 500 : 500;

        if (!isFinalBatch) {
          const completedBatch = activeBatchGeneration.index + 1;
          const nextBatch = activeBatchGeneration.batches[activeBatchGeneration.index + 1];
          if (nextBatch?.title === 'validation') {
            activeBatchGeneration.index += 1;
            activeBatchGeneration.active = false;
            pushTerminalLog({
              level: 'info',
              text:
                `[generation-batch] completed ${completedBatch}/${activeBatchGeneration.batches.length - 1} file-writing batches; ` +
                `starting batch ${activeBatchGeneration.batches.length} validation\n`,
              timestamp: Date.now(),
            });
            onAddMessage({
              id: prefixedId('msg'),
              role: 'system',
              content:
                `File generation batches are complete. Starting Batch ${activeBatchGeneration.batches.length}/${activeBatchGeneration.batches.length}: validation.`,
              timestamp: new Date().toISOString(),
            });
          } else {
          activeBatchGeneration.index += 1;
          pushTerminalLog({
            level: 'info',
            text:
              `[generation-batch] completed ${completedBatch}/${activeBatchGeneration.batches.length}; ` +
              `validation paused until all batches complete\n`,
            timestamp: Date.now(),
          });
          onAddMessage({
            id: prefixedId('msg'),
            role: 'system',
            content:
              `Batch ${completedBatch}/${activeBatchGeneration.batches.length} written. ` +
              `Validation is paused while Matrix Coder continues the next generation batch automatically.`,
            timestamp: new Date().toISOString(),
          });
          setTimeout(() => {
            continueBatchGeneration();
          }, launchDelay);
          streamMsgIdRef.current = '';
          accumulatedRef.current = '';
          streamingMessageShownRef.current = false;
          return;
          }
        }

        activeBatchGeneration.active = false;
        pushTerminalLog({
          level: 'info',
          text: `[generation-batch] all ${activeBatchGeneration.batches.length} batches complete; starting validation\n`,
          timestamp: Date.now(),
        });
        onAddMessage({
          id: prefixedId('msg'),
          role: 'system',
          content: `All ${activeBatchGeneration.batches.length} generation batches are complete. Starting validation now.`,
          timestamp: new Date().toISOString(),
        });
      }

      if ((appliedAnyEdit || createdAny) && !isAutoFixRunning()) {
        // Build a predicted post-mutation file list — the source of
        // truth is the in-React fileTree, but creates are added on a
        // staggered setTimeout. We snapshot what the tree WILL look
        // like once all writes settle so the loop doesn't race.
        const predicted: FileNode[] = flattenTree(fileTree).map((f) => {
          if (f.type !== 'file') return f;
          return mutatedFilesByPath.get(f.path) ?? f;
        });
        for (const [path, file] of mutatedFilesByPath) {
          if (!predicted.some((p) => p.path === path)) {
            predicted.push(file);
          }
        }
        logGenerationConsistency('validation-snapshot', {
          extractedPaths: extractedPathsForDiagnostics,
          writtenPaths: Array.from(mutatedFilesByPath.keys()),
          treePaths: flattenTree(fileTree)
            .filter((file) => file.type === 'file')
            .map((file) => file.path),
          persistedScheduledPaths: Array.from(new Set(persistedScheduledPathsForDiagnostics)),
          validationPaths: predicted
            .filter((file) => file.type === 'file')
            .map((file) => file.path),
        });

        // -----------------------------------------------------------
        // Phase 2 — Dependency Awareness System
        //
        // Before triggering the WebContainer validation, scan all
        // imports against package.json and auto-add any missing
        // packages. The auto-fix loop's `npm install` step will then
        // pull them in on its next run. Pure file-write — no network
        // calls happen here.
        // -----------------------------------------------------------
        let depAdjustedFiles = predicted;
        try {
          const depResult = analyzeAndAddMissingDependencies({
            files: predicted,
            onUpdateFile: (updated) => {
              onUpdateFile(updated);
              // Also reflect the change into `depAdjustedFiles` so the
              // validation loop below sees the new package.json
              // without waiting for React state to re-flush.
              depAdjustedFiles = depAdjustedFiles.map((f) =>
                f.path === updated.path ? updated : f
              );
            },
          });
          if (depResult.chatSummary) {
            // BUG #2 FIX (2026-01) — persist so the summary survives refresh.
            onAddMessage({
              id: prefixedId('msg'),
              role: 'system',
              content: depResult.chatSummary,
              timestamp: new Date().toISOString(),
            });
          }
          if (depResult.mutated) {
            // package.json changed → upcoming validation needs a fresh
            // `npm install`. Invalidate the WebContainer install cache.
            void import('@/lib/webcontainer/manager').then((m) =>
              m.invalidateDependenciesCache()
            );
          }
        } catch (depErr) {
          console.warn(
            '[dependency-awareness] scan failed (non-fatal):',
            depErr
          );
        }

        // Wait long enough for all setTimeout-driven create writes to
        // have actually hit React state. The loop itself is async and
        // non-blocking from the UI's perspective.
        const launchDelay = createdAny ? createsCount * 200 + 400 : 0;
        setTimeout(() => {
          void runAutoFixLoop({
            files: depAdjustedFiles,
            onStatus: onSetActivityStatus,
            onChatMessage: (msg) =>
              // BUG #2 FIX (2026-01) — persist auto-fix-loop messages
              // so they survive a page refresh.
              onAddMessage({
                id: msg.id,
                role: 'system',
                content: msg.content,
                timestamp: msg.timestamp,
              }),
            onUpdateFile,
            onAddFile,
            onDeleteFile,
            // 2026-01 runtime-smoke pass — turn ON the GET / smoke
            // test after a successful build. This catches the
            // "builds but crashes at runtime" class of bugs (legacy
            // <Link><a>, missing 'use client', metadata misuse,
            // crashing root layouts) that compile-only validation
            // can't see.
            runtimeSmoke: true,
            requirements: lastUserTextRef.current,
          }).catch((err) => {
            console.error('[autofix] loop crashed unexpectedly:', err);
          });
        }, launchDelay);
      }

      streamMsgIdRef.current = '';
      accumulatedRef.current = '';
      streamingMessageShownRef.current = false;
    }
  }, [
    isLoading,
    onUpdateLastMessage,
    onSaveFinalAssistantMessage,
    onSetSessionTokens,
    onSetIsStreaming,
    onSetActiveAgent,
    onSetActivityStatus,
    onAddFile,
    onUpdateFile,
    onDeleteFile,
    onAddMessage,
    continueBatchGeneration,
  ]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const upsertDeterministicNextScaffold = useCallback(() => {
    const existingByPath = new Map(
      flattenTree(fileTree)
        .filter((file) => file.type === 'file')
        .map((file) => [file.path, file])
    );
    const scaffoldFiles = createNextScaffoldFiles();
    const created: string[] = [];
    const updated: string[] = [];

    for (const template of scaffoldFiles) {
      const existing = existingByPath.get(template.path);
      if (existing) {
        if (existing.content !== template.content || existing.language !== template.language) {
          onUpdateFile({
            ...existing,
            content: template.content,
            language: template.language,
            size: template.content?.length ?? 0,
            lastModified: new Date().toISOString(),
            isNew: false,
          });
          updated.push(template.path);
        }
        continue;
      }

      onAddFile({
        ...template,
        id: `file-${safeUUID()}`,
        lastModified: new Date().toISOString(),
      });
      created.push(template.path);
    }

    pushTerminalLog({
      level: 'info',
      text:
        `[scaffold-template] deterministic Next.js scaffold applied ` +
        `created=${created.length} updated=${updated.length} ` +
        `paths=${[...created, ...updated].join(', ') || 'already-current'}\n`,
      timestamp: Date.now(),
    });

    if (created.length || updated.length) {
      onAddMessage({
        id: prefixedId('msg'),
        role: 'system',
        content:
          `**Deterministic Next.js scaffold applied** — Matrix Coder created/updated protected scaffold files from known-good templates: ` +
          `${[...created, ...updated].map((path) => `\`${path}\``).join(', ')}.`,
        timestamp: new Date().toISOString(),
      });
    }
  }, [fileTree, onAddFile, onAddMessage, onUpdateFile]);

  const handleSend = useCallback(async () => {
    const text = input.trim();

    if (!text || isStreaming) return;

    setInput('');
    // Remember the last sent text so we can offer retry on AI failure
    // (hardening pass #6).
    lastUserTextRef.current = text;

    const agent: AgentType =
      selectedAgent === 'auto'
        ? detectAgent(text)
        : selectedAgent;

    agentRef.current = agent;

    onAddMessage({
      id: generateId('msg'),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });

    onAddMessage({
      id: generateId('msg'),
      role: 'assistant',
      agent: 'orchestrator',
      content: `Routing to ${agent.charAt(0).toUpperCase() + agent.slice(1)} Agent...`,
      timestamp: new Date().toISOString(),
      memoryStage: 'context',
    });

    onSetActiveAgent(agent);

    const msgCount = messages.length;

    const memStage: MemoryStage =
      msgCount > 40
        ? 'storage'
        : msgCount > 20
        ? 'sql'
        : 'context';

    onSetMemoryStage(memStage);

    // UI-only append for the streaming placeholder. We deliberately do NOT
    // persist this empty row to the DB — it would be re-saved with final
    // content as a *different* row a few seconds later (which is what caused
    // the duplicate-assistant-message bug pre-fix). The completion effect
    // calls onSaveFinalAssistantMessage(...) once streaming finishes.
    const conversationHistory = messages
      .filter(
        (m) =>
          m.role === 'user' ||
          (m.role === 'assistant' &&
            m.agent === agent &&
            m.content.length > 0)
      )
      .slice(-10)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // --- Phase 2: Repository context engine ----------------------------------
    // Build heuristic context first (always synchronous & fast). Optionally
    // enrich with semantic results (Stage 2C). Both steps are best-effort:
    //
    //   * trySemanticSearch enforces its own 3s abort timeout internally.
    //   * The whole context-build is also bounded by CONTEXT_BUILD_TIMEOUT_MS
    //     (5s) as a belt-and-braces guarantee — if anything misbehaves we
    //     fall back to heuristic-only or no context, and we NEVER block the
    //     AI call waiting on embeddings.
    let repoContextString = '';
    onSetActivityStatus('Building repo context…');
    try {
      // Semantic search with a hard 3s ceiling. trySemanticSearch returns
      // null on timeout / disabled / pgvector unavailable.
      onSetActivityStatus('Searching embeddings…');
      const semanticPromise = trySemanticSearch(sessionId, text, 8, {
        timeoutMs: SEMANTIC_SEARCH_TIMEOUT_MS,
      });

      // Belt-and-braces: race the entire build against a 5s outer timeout
      // so even a misbehaving heuristic / supabase auth call cannot freeze
      // the UI for longer than 5s.
      const overall = await Promise.race([
        (async () => {
          const semanticResults = await semanticPromise;
          if (semanticResults === null) {
            onSetActivityStatus('Falling back to heuristic context…');
          }
          return buildContextForPrompt({
            query: text,
            files: fileTree,
            openFile: activeFile,
            messages,
            sessionId,
            semanticResults,
          });
        })(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), CONTEXT_BUILD_TIMEOUT_MS)
        ),
      ]);

      if (overall) {
        repoContextString = overall.systemContext;
        if (overall.includedPaths.length > 0) {
          console.info(
            `[RepoContext] ${overall.includedPaths.length} files, ${overall.totalChars} chars` +
              (overall.truncated ? ' (truncated)' : '') +
              ` — heuristic:${overall.stats.heuristicHits} semantic:${overall.stats.semanticHits}`
          );
        }
      } else {
        console.warn(
          `[RepoContext] context build timed out after ${CONTEXT_BUILD_TIMEOUT_MS}ms — continuing without context`
        );
        onSetActivityStatus('Falling back to heuristic context…');
      }
    } catch (ctxErr) {
      console.warn('[RepoContext] failed, continuing without context:', ctxErr);
      onSetActivityStatus('Falling back to heuristic context…');
    }

    onSetActivityStatus('Sending request to AI…');

    const shouldBatch = shouldBatchGenerationRequest(text, agent, fileTree);
    if (shouldBatch) {
      upsertDeterministicNextScaffold();
      batchGenerationRef.current = {
        active: true,
        baseRequest: text,
        repoContextString,
        conversationHistory,
        memStage,
        batches: LARGE_APP_BATCHES,
        index: 0,
      };
      onAddMessage({
        id: prefixedId('msg'),
        role: 'system',
        content:
          `Large app request detected. Matrix Coder will generate this in ${LARGE_APP_BATCHES.length} automatic batches and keep validation paused until all batches are complete. Core Next.js scaffold/config files are handled by deterministic templates, not the Coding Agent.`,
        timestamp: new Date().toISOString(),
      });
      continueBatchGeneration();
      return;
    }

    batchGenerationRef.current = null;
    launchAgentRequest(agent, text, {
      repoContextString,
      conversationHistory,
      memStage,
      status: 'Sending request to AI...',
    });
  }, [
    input,
    isStreaming,
    selectedAgent,
    messages,
    activeFile,
    fileTree,
    sessionId,
    onAddMessage,
    onSetActiveAgent,
    onSetIsStreaming,
    onSetMemoryStage,
    onSetActivityStatus,
    continueBatchGeneration,
    launchAgentRequest,
    upsertDeterministicNextScaffold,
  ]);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentAgentOption = AGENT_OPTIONS.find(
    (a) => a.type === selectedAgent
  );

  return (
    <div className="workspace-composer flex-shrink-0 border-t border-matrix-border bg-matrix-bg px-4 py-3">
      <div className="workspace-composer-frame neon-border-muted border rounded-sm bg-matrix-surface transition-all duration-150">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          placeholder={
            isStreaming
              ? '// Agent is responding...'
              : '// Describe what to build, debug, or review... (Shift+Enter for newline)'
          }
          rows={1}
          className="w-full bg-transparent px-4 pt-3 pb-2 text-sm font-mono text-matrix-green placeholder-matrix-green-muted outline-none resize-none leading-relaxed disabled:opacity-50"
          aria-label="Chat input"
        />

        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowAgentMenu((v) => !v)}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs font-mono rounded-sm border transition-all ${
                  AGENT_CLASSES[selectedAgent] ??
                  'text-matrix-green-muted border-matrix-border'
                } hover:border-current`}
              >
                {currentAgentOption?.icon}
                <span className="tracking-widest uppercase">
                  {currentAgentOption?.label}
                </span>
                <ChevronDown size={10} />
              </button>

              {showAgentMenu && (
                <div className="absolute bottom-full left-0 mb-1 w-52 bg-matrix-card border border-matrix-border rounded-sm shadow-neon-sm z-50 py-1">
                  {AGENT_OPTIONS.map((opt) => (
                    <button
                      key={`agent-opt-${opt.type}`}
                      onClick={() => {
                        setSelectedAgent(opt.type);
                        setShowAgentMenu(false);
                      }}
                      className={`w-full flex items-start gap-2 px-3 py-2 text-xs font-mono transition-colors hover:bg-matrix-green-ghost ${
                        selectedAgent === opt.type
                          ? 'text-matrix-green'
                          : 'text-matrix-green-muted'
                      }`}
                    >
                      <span className="flex-shrink-0 mt-0.5">
                        {opt.icon}
                      </span>

                      <div className="text-left">
                        <div className="tracking-widest uppercase">
                          {opt.label}
                        </div>

                        <div className="text-matrix-green-muted text-xs mt-0.5 normal-case font-normal">
                          {opt.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-xs font-mono text-matrix-green-muted border border-matrix-border px-2 py-1 rounded-sm">
              {PRIMARY_MODEL}
            </span>
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-sm bg-matrix-green text-matrix-bg hover:bg-matrix-green-bright disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            aria-label="Send message"
          >
            <Send size={12} />
            <span className="tracking-widest uppercase">
              Send
            </span>
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-xs font-mono text-matrix-green-muted opacity-60">
        Enter to send · Shift+Enter for newline · Powered by {PRIMARY_MODEL}
      </p>
    </div>
  );
}
