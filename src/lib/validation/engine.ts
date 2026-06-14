/**
 * Validation engine — runs the real build/type-check pipeline against the
 * current file tree inside a WebContainer and returns a structured result.
 *
 * Phase 1 pipeline:
 *   1. Boot WebContainer (lazy, once per page lifetime)
 *   2. Sync the current file tree
 *   3. `npm install` (cached after first success)
 *   4. `npx tsc --noEmit`           — fast type-only pass
 *   5. `npx next build`             — only if type-check passed
 *
 * Stops at the first failing step (no point building if types are broken).
 * Returns structured errors plus the raw log so the AI sees real output.
 */

import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  bootWebContainer,
  detectWebContainerSupport,
  ensureDependenciesInstalled,
  getMountedFileAudit,
  isBooted,
  mountFiles,
  runCommand,
  spawnBackground,
  syncFiles,
  waitForNextServerReady,
  type LogEntry,
  type LogSink,
  type RunCommandResult,
} from '@/lib/webcontainer/manager';
import { pushTerminalLog } from '@/lib/terminal/store';
import { extractImports, flattenTree } from '@/lib/repo/heuristics';
import {
  looksLikeFailure,
  parseValidationOutput,
  stripAnsi,
  extractFailureExcerpt,
  type ParsedError,
} from './errorParser';
import { runStyleAudit } from './styleAudit';
import { runImportIntegrityAudit } from './importIntegrity';
import { runGeneratedQualityAudit } from './generatedQuality';
import { classifyInstallFailure, type InstallFailureInfo } from './installFailure';
import { findCssSanityIssues } from '@/lib/repo/cssSanitizer';
import { setSandboxStatus } from '@/lib/webcontainer/sandboxStatus';
import {
  beginPreviewStage,
  completePreviewStage,
  failPreviewStage,
  resetPreviewStages,
  skipRunningPreviewStages,
  skipPreviewStage,
  type PreviewDiagnosticStage,
} from '@/lib/preview/diagnostics';

export type ValidationStep =
  | 'support-check'
  | 'boot'
  | 'mount'
  | 'import-integrity'
  | 'generated-quality'
  | 'install'
  | 'type-check'
  | 'css-sanity'
  | 'build'
  | 'style-audit'
  | 'runtime-smoke';

export interface StepResult {
  step: ValidationStep;
  status: 'ok' | 'failed' | 'skipped';
  exitCode?: number;
  durationMs: number;
  errors: ParsedError[];
  /** Truncated raw output for downstream AI prompts. */
  log: string;
  /** Set when WebContainer infrastructure itself failed (not a build error). */
  infrastructureError?: string;
}

export interface ValidationResult {
  success: boolean;
  /** True if validation could not run at all (unsupported browser, boot failed). */
  skipped: boolean;
  skipReason?: string;
  /**
   * Set when the install step failed. Non-auto-fixable classes
   * (environment / network / unknown) also set `skipped=true` so the
   * auto-fix loop NEVER treats a sandbox limitation as broken code.
   */
  installFailure?: InstallFailureInfo;
  steps: StepResult[];
  /** Flattened error list across all failed steps. */
  errors: ParsedError[];
  /** Full combined log across every step. */
  combinedLog: string;
  durationMs: number;
}

export interface ValidationOptions {
  /** Step-level progress updates ("Installing dependencies…", etc.). */
  onStatus?: (label: string) => void;
  /** Raw log line stream (for future terminal panel). */
  onLog?: LogSink;
  /** Skip `next build` and only run type-check (faster). */
  typeCheckOnly?: boolean;
  /** Hard cap to abort if the whole validation takes too long. */
  overallTimeoutMs?: number;
  /**
   * After a successful build, start the dev server, fetch the root
   * route, and treat a non-2xx response / Next.js error overlay /
   * React crash banner as a validation failure.
   *
   * 2026-01 runtime-smoke pass — addresses the "builds but fails at
   * runtime" gap (outdated <Link><a>, missing 'use client', metadata
   * misuse, etc.). The smoke step runs ONLY when prior steps passed
   * and the browser supports WebContainer's server-ready / fetch
   * combo. Defaults to OFF so existing callers keep their current
   * pipeline. Pass `runtimeSmoke: true` to opt in.
   */
  runtimeSmoke?: boolean;
  /** Override for the smoke-test timeout (server-ready + fetch). */
  runtimeSmokeTimeoutMs?: number;
  /** Original user request for requirement-aware quality checks. */
  requirements?: string;
}

const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000; // overall inactivity watchdog

// Per-command inactivity timeouts. Output activity resets these timers.
const INSTALL_TIMEOUT_MS = 8 * 60 * 1000;
const TYPECHECK_TIMEOUT_MS = 2 * 60 * 1000;
const BUILD_TIMEOUT_MS = 8 * 60 * 1000;

// Runtime smoke: dev server boot (45s) + HTTP fetch (10s). Tighter than
// install because by this point dependencies are warm and the build has
// already succeeded — `next dev` should bind quickly.
const SMOKE_DEFAULT_TIMEOUT_MS = 90 * 1000;
const SMOKE_FETCH_TIMEOUT_MS = 10 * 1000;
const SMOKE_POST_READY_DELAY_MS = 1500;

const MAX_LOG_CHARS_PER_STEP = 8000; // trim noise before sending to AI

function truncateLog(s: string, max = MAX_LOG_CHARS_PER_STEP): string {
  if (s.length <= max) return s;
  const head = s.slice(0, Math.floor(max * 0.4));
  const tail = s.slice(-Math.floor(max * 0.6));
  return `${head}\n\n[… ${s.length - max} chars elided …]\n\n${tail}`;
}

/**
 * Detect a Next.js / React runtime crash by sniffing the rendered HTML
 * for known overlay or error-banner markers. Conservative — false
 * positives here would block the user even when the app is fine.
 */
function detectRuntimeOverlay(html: string): { found: boolean; reason: string | null } {
  if (!html || html.length < 50) {
    return { found: true, reason: 'Empty / truncated HTML response from dev server.' };
  }
  // Next.js dev-mode error overlay markers (App Router + Pages Router).
  if (/<nextjs-portal\b/i.test(html)) {
    return { found: true, reason: 'Next.js error overlay detected (<nextjs-portal>) in initial render.' };
  }
  if (/__nextjs_original-stack-frame/i.test(html)) {
    return { found: true, reason: 'Next.js error overlay frames detected in initial render.' };
  }
  // React production crash banner.
  if (/Application error: a (?:client|server)-side exception has occurred/i.test(html)) {
    return { found: true, reason: 'React runtime crash banner ("Application error: …") in initial render.' };
  }
  // Generic "Error:" wrapping inside an HTML document body usually means
  // Next.js piped an unhandled exception straight to the response.
  if (/<title>\s*Error\s*<\/title>/i.test(html) && /<h1[^>]*>\s*(?:Application error|Internal Server Error|Server Error)/i.test(html)) {
    return { found: true, reason: 'Server-rendered Error page in initial response.' };
  }
  return { found: false, reason: null };
}

/**
 * Best-effort HTTP fetch with an explicit AbortController + timeout.
 *
 * Returns the response status, response body (first 4 KB), and a flag
 * indicating whether the fetch itself errored (network failure, timed
 * out, etc.) as opposed to returning a non-2xx status.
 */
async function smokeFetch(url: string): Promise<{
  ok: boolean;
  status: number;
  body: string;
  networkError?: string;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SMOKE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      // dev server is in-browser; same fetch credentials handling as
      // the rest of the app, no cookies needed.
      credentials: 'omit',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const text = await resp.text().catch(() => '');
    return {
      ok: resp.ok,
      status: resp.status,
      body: text.slice(0, 4096),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: '',
      networkError:
        err instanceof Error
          ? err.name === 'AbortError'
            ? `fetch aborted after ${SMOKE_FETCH_TIMEOUT_MS}ms`
            : err.message
          : 'unknown fetch failure',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runRuntimeSmoke(
  onLog: LogSink,
  totalTimeoutMs: number
): Promise<StepResult> {
  const stepStart = performance.now();
  const readyTimeoutMs = Math.max(5000, totalTimeoutMs - SMOKE_FETCH_TIMEOUT_MS - SMOKE_POST_READY_DELAY_MS - 2000);
  beginPreviewStage('dev-server', 'Starting npm run dev for runtime smoke.');

  // Start the dev server in the background.
  let bg;
  try {
    bg = await spawnBackground('jsh', ['-c', 'npm run dev'], { onLog });
  } catch (err) {
    failPreviewStage(
      'dev-server',
      err instanceof Error ? err.message : 'failed to spawn dev server'
    );
    return {
      step: 'runtime-smoke',
      status: 'failed',
      durationMs: performance.now() - stepStart,
      errors: [],
      log: '',
      infrastructureError:
        err instanceof Error ? err.message : 'failed to spawn dev server',
    };
  }

  try {
    // Wait for server-ready (fired by manager.ts when the WC process
    // binds to any port).
    const info = await waitForNextServerReady(readyTimeoutMs);
    if (!info) {
      failPreviewStage(
        'dev-server',
        `Dev server did not report a preview URL within ${Math.round(readyTimeoutMs / 1000)}s.`
      );
      onLog({
        level: 'error',
        text: `[runtime-smoke] timed out waiting for server-ready (${readyTimeoutMs}ms)\n`,
        timestamp: Date.now(),
      });
      try {
        bg.kill();
      } catch {
        /* best-effort */
      }
      return {
        step: 'runtime-smoke',
        status: 'failed',
        durationMs: performance.now() - stepStart,
        errors: [
          {
            source: 'nextjs',
            message: `Dev server did not bind to a port within ${Math.round(readyTimeoutMs / 1000)}s. The generated app likely crashes on startup.`,
            raw: '',
          },
        ],
        log: '',
      };
    }

    onLog({
      level: 'info',
      text: `[runtime-smoke] server-ready at ${info.url}\n`,
      timestamp: Date.now(),
    });
    completePreviewStage('dev-server', `Server ready at ${info.url}.`);

    // Brief settle window so the first compile finishes before we hit /.
    await new Promise((r) => setTimeout(r, SMOKE_POST_READY_DELAY_MS));

    onLog({
      level: 'info',
      text: `[runtime-smoke] GET ${info.url}/\n`,
      timestamp: Date.now(),
    });

    const fetchResult = await smokeFetch(info.url);
    const overlay = detectRuntimeOverlay(fetchResult.body);

    const errors: ParsedError[] = [];

    if (fetchResult.networkError) {
      errors.push({
        source: 'nextjs',
        message: `Root route fetch failed: ${fetchResult.networkError}.`,
        raw: '',
      });
    } else if (!fetchResult.ok) {
      errors.push({
        source: 'nextjs',
        message: `GET / returned HTTP ${fetchResult.status} — root route is unreachable or the dev server crashed during the first request.`,
        raw: fetchResult.body.slice(0, 400),
      });
    }

    if (overlay.found && overlay.reason) {
      errors.push({
        source: 'nextjs',
        message: overlay.reason,
        raw: fetchResult.body.slice(0, 400),
      });
    }

    const failed = errors.length > 0;
    onLog({
      level: failed ? 'error' : 'info',
      text: failed
        ? `[runtime-smoke] FAILED — ${errors.length} runtime issue(s) detected\n`
        : `[runtime-smoke] OK — HTTP ${fetchResult.status}, no overlay/crash detected\n`,
      timestamp: Date.now(),
    });

    const result: StepResult = {
      step: 'runtime-smoke',
      status: failed ? 'failed' : 'ok',
      exitCode: fetchResult.status,
      durationMs: performance.now() - stepStart,
      errors,
      log: truncateLog(fetchResult.body || ''),
    };

    // 2026-01 — keep the dev server alive on SUCCESS so the user can
    // click straight into the Preview panel and see their app. On
    // failure we still kill it so the next smoke run (or auto-fix
    // re-validation) doesn't collide with a half-dead process. The
    // `server-ready` listener has already cached the URL into
    // `lastPreviewInfo`, so the Preview panel will pick it up
    // automatically the moment it subscribes.
    if (failed) {
      try {
        bg.kill();
      } catch {
        /* best-effort */
      }
    } else {
      onLog({
        level: 'info',
        text: `[runtime-smoke] dev server kept alive at ${info.url} — open the Preview panel to view it\n`,
        timestamp: Date.now(),
      });
    }

    return result;
  } catch (err) {
    // Defensive — `smokeFetch` already catches its own errors, but if
    // anything else in the body throws (it shouldn't), kill the
    // background process before re-raising.
    try {
      bg.kill();
    } catch {
      /* best-effort */
    }
    throw err;
  }
}

/**
 * Static style audit — free (no WebContainer commands). Returns null
 * when the project doesn't use Tailwind (audit not applicable).
 */
function runStyleAuditStep(files: FileNode[]): StepResult | null {
  const start = performance.now();
  const audit = runStyleAudit(files);
  if (!audit.applicable) return null;
  return {
    step: 'style-audit',
    status: audit.errors.length > 0 ? 'failed' : 'ok',
    durationMs: performance.now() - start,
    errors: audit.errors,
    log: truncateLog(audit.log),
  };
}

function runImportIntegrityStep(files: FileNode[], onLog?: LogSink): StepResult {
  const start = performance.now();
  const audit = runImportIntegrityAudit(files);
  onLog?.({
    level: audit.ok ? 'info' : 'error',
    text: audit.log,
    timestamp: Date.now(),
  });
  return {
    step: 'import-integrity',
    status: audit.ok ? 'ok' : 'failed',
    durationMs: performance.now() - start,
    errors: audit.errors,
    log: truncateLog(audit.log),
  };
}

function runGeneratedQualityStep(
  files: FileNode[],
  requirements: string,
  onLog?: LogSink
): StepResult {
  const start = performance.now();
  const audit = runGeneratedQualityAudit(files, requirements);
  onLog?.({
    level: audit.ok ? 'info' : 'error',
    text: audit.log + '\n',
    timestamp: Date.now(),
  });
  return {
    step: 'generated-quality',
    status: audit.ok ? 'ok' : 'failed',
    durationMs: performance.now() - start,
    errors: audit.errors,
    log: truncateLog(audit.log),
  };
}

function runCssSanityStep(files: FileNode[]): StepResult {
  const start = performance.now();
  const issues = findCssSanityIssues(files);
  if (issues.length === 0) {
    return {
      step: 'css-sanity',
      status: 'ok',
      durationMs: performance.now() - start,
      errors: [],
      log: '[css-sanity] CSS files are free of markdown fences, SEARCH/REPLACE markers, leaked path comments, and unsafe pseudo-element @apply usage.\n',
    };
  }

  const errors: ParsedError[] = issues.map((issue) => ({
    source: 'styling',
    file: issue.path,
    line: issue.line,
    message: `${issue.reason} Replace the file with valid CSS only.`,
    raw: `${issue.path}:${issue.line}\n${issue.snippet}`,
  }));
  return {
    step: 'css-sanity',
    status: 'failed',
    durationMs: performance.now() - start,
    errors,
    log:
      '[css-sanity] Invalid CSS content detected before build:\n' +
      issues
        .map(
          (issue) =>
            `${issue.path}:${issue.line} ${issue.reason}\n${issue.snippet}`
        )
        .join('\n\n') +
      '\n',
  };
}

function appendCssUnknownWordContext(files: FileNode[], result: StepResult): StepResult {
  if (
    result.status !== 'failed' ||
    !/(Unknown word|css-loader|postcss-loader|Build failed while compiling this module)/i.test(result.log)
  ) {
    return result;
  }
  const flat = flattenTree(files).filter(
    (file) => file.type === 'file' && typeof file.content === 'string'
  );
  const cssPaths = Array.from(result.log.matchAll(/\.?\/?((?:src\/)?app\/[^)\s'"`]+\.css|[^)\s'"`]+\/globals\.css)/g))
    .map((match) => match[1].replace(/^\.\//, ''));
  const cssPath = cssPaths.find((path) => !path.includes('node_modules'));
  const file =
    (cssPath
      ? flat.find((item) => item.path === cssPath) ??
        flat.find((item) => item.path.endsWith('/' + cssPath))
      : undefined) ??
    flat.find((item) => item.path.endsWith('/globals.css'));
  if (!file || typeof file.content !== 'string') return result;

  const lines = file.content.split(/\r?\n/);
  const sanityIssue = findCssSanityIssues([file])[0];
  const center = Math.max(0, (sanityIssue?.line ?? lines.length) - 1);
  const start = Math.max(0, center - 5);
  const end = Math.min(lines.length, center + 6);
  const snippet = lines
    .slice(start, end)
    .map((line, index) => `${String(start + index + 1).padStart(4, ' ')} | ${line}`)
    .join('\n');
  const fullContent =
    file.content.length > 4000
      ? `${file.content.slice(0, 4000)}\n/* ... ${file.content.length - 4000} chars truncated ... */`
      : file.content;
  const context =
    `\n[css-error-context] ${file.path} content during CSS build failure:\n` +
    `${fullContent}\n\n[css-error-context] ${file.path} focused snippet:\n${snippet}\n`;
  const error: ParsedError = {
    source: 'styling',
    file: file.path,
    line: sanityIssue?.line,
    message:
      'Next build failed while compiling CSS. The actual CSS content is included; replace unsafe @apply usage or fall back to plain CSS.',
    raw: context.trim(),
  };
  return {
    ...result,
    errors: [...result.errors, error],
    log: `${result.log}${context}`,
  };
}

function isEnvironmentTimeout(message?: string): boolean {
  return /timeout|timed out|stalled|no output|exceeded/i.test(message ?? '');
}

function parseTsconfig(content: string | undefined): {
  exists: boolean;
  validJson: boolean;
  baseUrl?: unknown;
  alias?: unknown;
  include?: unknown;
} {
  if (typeof content !== 'string') return { exists: false, validJson: false };
  try {
    const parsed = JSON.parse(content) as {
      compilerOptions?: { baseUrl?: unknown; paths?: Record<string, unknown> };
      include?: unknown;
    };
    return {
      exists: true,
      validJson: true,
      baseUrl: parsed.compilerOptions?.baseUrl,
      alias: parsed.compilerOptions?.paths?.['@/*'],
      include: parsed.include,
    };
  } catch {
    return { exists: true, validJson: false };
  }
}

function resolveAliasImport(specifier: string, mountedPaths: Set<string>): string | null {
  if (!specifier.startsWith('@/')) return null;
  const base = `src/${specifier.slice(2)}`;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.json`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
  return candidates.find((candidate) => mountedPaths.has(candidate)) ?? null;
}

export function findAliasImportsMissingFromMountedFs(
  files: FileNode[],
  mountedPaths: string[]
): Array<{ fromFile: string; specifier: string; expectedBasePath: string }> {
  const mounted = new Set(mountedPaths);
  const missing: Array<{ fromFile: string; specifier: string; expectedBasePath: string }> = [];
  const flat = flattenTree(files).filter(
    (file) => file.type === 'file' && typeof file.content === 'string'
  );

  for (const file of flat) {
    const ext = file.path.split('.').pop()?.toLowerCase();
    if (!ext || !['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) continue;
    for (const specifier of extractImports(file.content ?? '', file.language)) {
      if (!specifier.startsWith('@/')) continue;
      if (resolveAliasImport(specifier, mounted)) continue;
      missing.push({
        fromFile: file.path,
        specifier,
        expectedBasePath: `src/${specifier.slice(2)}`,
      });
    }
  }

  return missing;
}

export function looksLikeTscHelpOutput(output: string): boolean {
  const clean = stripAnsi(output);
  return (
    /You can learn about all of the compiler options/i.test(clean) ||
    /COMMON COMMANDS/i.test(clean) ||
    /tsc:\s+The TypeScript Compiler/i.test(clean)
  );
}

function buildTypeCheckDiscoveryError(files: FileNode[], mountedPaths: string[], output: string): ParsedError {
  const flat = flattenTree(files).filter(
    (file) => file.type === 'file' && typeof file.content === 'string'
  );
  const tsconfig = flat.find((file) => file.path === 'tsconfig.json');
  const config = parseTsconfig(tsconfig?.content);
  return {
    source: 'typescript',
    file: 'tsconfig.json',
    message:
      'TypeScript printed help text instead of checking the project. This usually means tsc did not discover a valid tsconfig.json or no input files were found. ' +
      `cwd=/, tsconfig exists=${config.exists ? 'yes' : 'no'}, validJson=${config.validJson ? 'yes' : 'no'}, ` +
      `baseUrl=${JSON.stringify(config.baseUrl)}, alias=${JSON.stringify(config.alias)}, include=${JSON.stringify(config.include)}, ` +
      `mountedFiles=${mountedPaths.length}.`,
    raw: truncateLog(output),
  };
}

function logTypeCheckPreflight(files: FileNode[], mountedPaths: string[], onLog: LogSink) {
  const flat = flattenTree(files).filter(
    (file) => file.type === 'file' && typeof file.content === 'string'
  );
  const tsconfig = flat.find((file) => file.path === 'tsconfig.json');
  const config = parseTsconfig(tsconfig?.content);
  const missingAliasTargets = findAliasImportsMissingFromMountedFs(files, mountedPaths);
  onLog({
    level: missingAliasTargets.length > 0 ? 'error' : 'info',
    text:
      `[type-check-preflight] cwd=/ mountedFiles=${mountedPaths.length} ` +
      `tsconfig=${config.exists ? 'yes' : 'no'} validJson=${config.validJson ? 'yes' : 'no'} ` +
      `baseUrl=${JSON.stringify(config.baseUrl)} alias=${JSON.stringify(config.alias)} ` +
      `include=${JSON.stringify(config.include)}\n` +
      `[type-check-preflight] mounted file sample: ${mountedPaths.slice(0, 80).join(', ')}${mountedPaths.length > 80 ? ', ...' : ''}\n` +
      (missingAliasTargets.length
        ? `[type-check-preflight] unresolved @/ imports in mounted FS:\n${missingAliasTargets
            .map(
              (item) =>
                `- ${item.fromFile} imports "${item.specifier}" -> expected ${item.expectedBasePath}`
            )
            .join('\n')}\n`
        : '[type-check-preflight] all @/ import targets exist in mounted FS\n'),
    timestamp: Date.now(),
  });
}

async function runStep(
  step: ValidationStep,
  command: string,
  args: string[],
  onLog?: LogSink,
  timeoutMs?: number
): Promise<StepResult> {
  const start = performance.now();
  const result: RunCommandResult = await runCommand(command, args, { onLog, timeoutMs });
  const durationMs = performance.now() - start;

  if (result.infrastructureError) {
    return {
      step,
      status: isEnvironmentTimeout(result.infrastructureError) ? 'skipped' : 'failed',
      durationMs,
      errors: [],
      log: truncateLog(result.combined),
      infrastructureError: result.infrastructureError,
    };
  }

  const source =
    step === 'type-check' ? 'typescript' : step === 'build' ? 'nextjs' : 'unknown';
  let errors = parseValidationOutput(result.combined, source);
  const failed =
    result.exitCode !== 0 ||
    errors.length > 0 ||
    looksLikeFailure(result.combined);
  if (failed && errors.length === 0) {
    errors = [
      {
        source,
        message: extractFailureExcerpt(result.combined, 1200),
        raw: truncateLog(result.combined),
      },
    ];
  }

  return {
    step,
    status: failed ? 'failed' : 'ok',
    exitCode: result.exitCode,
    durationMs,
    errors,
    log: truncateLog(result.combined),
  };
}

function beginStepDiagnostic(stage: PreviewDiagnosticStage, reason?: string) {
  beginPreviewStage(stage, reason);
}

function finishStepDiagnostic(stage: PreviewDiagnosticStage, result: StepResult) {
  const reason =
    result.infrastructureError ??
    result.errors[0]?.message ??
    (typeof result.exitCode === 'number' ? `exit ${result.exitCode}` : undefined);

  if (result.status === 'ok') {
    completePreviewStage(stage, reason);
  } else if (result.status === 'skipped') {
    skipPreviewStage(stage, reason ?? `${result.step} skipped.`);
  } else {
    failPreviewStage(stage, reason ?? `${result.step} failed.`);
  }
}

/**
 * Run the full validation pipeline against the provided file tree.
 *
 * Never throws — always resolves to a `ValidationResult`. Callers can
 * treat `success=false && skipped=false` as "real build failure" and
 * trigger the auto-fix loop.
 */
export async function runValidation(
  files: FileNode[],
  opts: ValidationOptions = {}
): Promise<ValidationResult> {
  const {
    onStatus,
    onLog,
    typeCheckOnly = false,
    overallTimeoutMs = DEFAULT_TIMEOUT_MS,
    runtimeSmoke = false,
    runtimeSmokeTimeoutMs = SMOKE_DEFAULT_TIMEOUT_MS,
    requirements = '',
  } = opts;
  const overallStart = performance.now();
  const steps: StepResult[] = [];
  const logs: string[] = [];
  resetPreviewStages([
    'import-integrity',
    'generated-quality',
    'install',
    'type-check',
    'build',
    'dev-server',
    'preview-connected',
  ]);

  const logChunks: LogEntry[] = [];
  let lastActivityAt = performance.now();
  const teeLog: LogSink = (entry) => {
    lastActivityAt = performance.now();
    logChunks.push(entry);
    // Always tee to the terminal panel store — keeps the live log
    // panel populated even when no explicit `onLog` is supplied.
    pushTerminalLog(entry);
    onLog?.(entry);
  };

  const finalize = (
    partial: Pick<ValidationResult, 'success' | 'skipped' | 'skipReason' | 'installFailure'>
  ): ValidationResult => ({
    ...partial,
    steps,
    errors: steps.flatMap((s) => s.errors),
    combinedLog: logChunks.map((c) => c.text).join(''),
    durationMs: performance.now() - overallStart,
  });

  // 1. Support check
  onStatus?.('Checking sandbox support…');
  const support = detectWebContainerSupport();
  steps.push({
    step: 'support-check',
    status: support.supported ? 'ok' : 'skipped',
    durationMs: 0,
    errors: [],
    log: support.reason ?? '',
  });
  if (!support.supported) {
    return finalize({ success: false, skipped: true, skipReason: support.reason });
  }

  // Wrap the rest in an inactivity watchdog, not a fixed wall-clock
  // timeout. Long `next build` runs can legitimately exceed 300s while
  // still streaming progress; only abort when the validation pipeline has
  // been silent for the configured window.
  let watchdogInterval: ReturnType<typeof setInterval> | null = null;
  const timeoutPromise = new Promise<ValidationResult>((resolve) => {
    watchdogInterval = setInterval(() => {
      if (performance.now() - lastActivityAt < overallTimeoutMs) return;
      if (watchdogInterval) clearInterval(watchdogInterval);
      const reason = `Validation produced no output for ${Math.round(overallTimeoutMs / 1000)}s and was treated as stalled.`;
      skipRunningPreviewStages(reason);
      resolve(
        finalize({
          success: false,
          skipped: true,
          skipReason: reason,
        })
      );
    }, 5000);
  });

  const workPromise = (async (): Promise<ValidationResult> => {
    let mountedPaths: string[] = [];
    // 2. Boot
    const wasBooted = isBooted();
    onStatus?.(wasBooted ? 'Syncing files into sandbox…' : 'Booting sandbox runtime…');
    const bootStart = performance.now();
    try {
      await bootWebContainer();
    } catch (err) {
      steps.push({
        step: 'boot',
        status: 'failed',
        durationMs: performance.now() - bootStart,
        errors: [],
        log: '',
        infrastructureError: err instanceof Error ? err.message : 'boot failed',
      });
      return finalize({
        success: false,
        skipped: true,
        skipReason: 'WebContainer failed to boot in this browser.',
      });
    }
    steps.push({
      step: 'boot',
      status: 'ok',
      durationMs: performance.now() - bootStart,
      errors: [],
      log: '',
    });

    // 3. Mount / sync files
    const mountStart = performance.now();
    try {
      if (!wasBooted) {
        await mountFiles(files);
      } else {
        const written = await syncFiles(files);
        teeLog({
          level: 'info',
          text: `[sync] ${written.length} file(s) updated\n`,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      steps.push({
        step: 'mount',
        status: 'failed',
        durationMs: performance.now() - mountStart,
        errors: [],
        log: '',
        infrastructureError: err instanceof Error ? err.message : 'mount failed',
      });
      return finalize({
        success: false,
        skipped: true,
        skipReason: 'Failed to mount the project into the sandbox.',
      });
    }
    steps.push({
      step: 'mount',
      status: 'ok',
      durationMs: performance.now() - mountStart,
      errors: [],
      log: '',
    });

    const mountAudit = await getMountedFileAudit(files);
    mountedPaths = mountAudit.mountedPaths;
    teeLog({
      level: mountAudit.ok ? 'info' : 'error',
      text:
        `[mount-audit] expected=${mountAudit.expectedCount} mounted=${mountAudit.mountedCount} ` +
        `missing=${mountAudit.missing.length} extra=${mountAudit.extra.length}\n` +
        (mountAudit.missing.length
          ? `[mount-audit] missing from WebContainer: ${mountAudit.missing.join(', ')}\n`
          : '') +
        `[mount-audit] mounted file sample: ${mountAudit.mountedPaths.slice(0, 120).join(', ')}${mountAudit.mountedPaths.length > 120 ? ', ...' : ''}\n`,
      timestamp: Date.now(),
    });
    if (!mountAudit.ok) {
      const mountError: ParsedError = {
        source: 'unknown',
        message:
          `WebContainer mount/sync mismatch: ${mountAudit.missing.length} file(s) exist in app state but not in the mounted filesystem. ` +
          `Missing: ${mountAudit.missing.join(', ')}`,
        raw: mountAudit.missing.join('\n'),
      };
      steps.push({
        step: 'mount',
        status: 'failed',
        durationMs: 0,
        errors: [mountError],
        log: mountError.message,
        infrastructureError: mountError.message,
      });
      return finalize({
        success: false,
        skipped: true,
        skipReason: mountError.message,
      });
    }

    // 4. Generated-file / import integrity audit. This catches missing
    // components like `@/components/HistoryPage` before the sandbox spends
    // minutes installing packages, and prevents false "success" reports
    // when the generator referenced a file it never wrote.
    onStatus?.('Checking generated file references...');
    beginStepDiagnostic('import-integrity', 'Scanning local imports against generated files.');
    const importStep = runImportIntegrityStep(files, teeLog);
    finishStepDiagnostic('import-integrity', importStep);
    steps.push(importStep);
    logs.push(importStep.log);
    if (importStep.status === 'failed') {
      return finalize({ success: false, skipped: false });
    }

    // 5. Generated quality audit. Import integrity is necessary but not
    // sufficient: a 3-line placeholder component can satisfy imports while
    // still failing the requested app behavior.
    onStatus?.('Checking generated file quality...');
    beginStepDiagnostic('generated-quality', 'Auditing generated files against request requirements.');
    const qualityStep = runGeneratedQualityStep(files, requirements, teeLog);
    finishStepDiagnostic('generated-quality', qualityStep);
    steps.push(qualityStep);
    logs.push(qualityStep.log);
    if (qualityStep.status === 'failed') {
      return finalize({ success: false, skipped: false });
    }

    // 6. Install deps (skipped when fingerprint + node_modules unchanged)
    onStatus?.('Installing dependencies…');
    beginStepDiagnostic('install', 'Installing project dependencies.');
    const installStart = performance.now();
    const installResult = await ensureDependenciesInstalled(teeLog, {
      timeoutMs: INSTALL_TIMEOUT_MS,
      files,
    });
    const installDurationMs = performance.now() - installStart;
    if (installResult.infrastructureError || installResult.exitCode !== 0) {
      // Classify BEFORE deciding what to do — a WebContainer abort
      // (exit 4294967294, OOM, COOP/COEP) is NOT proof the app is
      // broken, and must never enter the auto-fix loop as if it were.
      const failure = classifyInstallFailure(
        installResult.exitCode,
        installResult.combined ?? '',
        installResult.infrastructureError
      );
      const errs = failure.autoFixable
        ? parseValidationOutput(installResult.combined, 'module')
        : [];
      steps.push({
        step: 'install',
        status: 'failed',
        exitCode: installResult.exitCode,
        durationMs: installDurationMs,
        errors: errs,
        log: truncateLog(installResult.combined ?? ''),
        infrastructureError: installResult.infrastructureError,
      });
      finishStepDiagnostic('install', steps[steps.length - 1]);
      if (!failure.autoFixable) {
        setSandboxStatus({
          kind: 'env-failure',
          reason: failure.reason,
          failureKind: failure.kind,
        });
        return finalize({
          success: false,
          skipped: true,
          skipReason: failure.reason,
          installFailure: failure,
        });
      }
      return finalize({ success: false, skipped: false, installFailure: failure });
    }
    setSandboxStatus({ kind: 'ok' });
    steps.push({
      step: 'install',
      status: 'ok',
      exitCode: installResult.exitCode,
      durationMs: installDurationMs,
      errors: [],
      log: '',
    });
    finishStepDiagnostic('install', steps[steps.length - 1]);

    // 5. Type-check
    onStatus?.('Running type-check…');
    beginStepDiagnostic('type-check', 'Running TypeScript validation.');
    logTypeCheckPreflight(files, mountedPaths, teeLog);
    const tcResult = await runStep(
      'type-check',
      'npx',
      ['--yes', 'tsc', '--noEmit'],
      teeLog,
      TYPECHECK_TIMEOUT_MS
    );
    if (looksLikeTscHelpOutput(tcResult.log)) {
      const discoveryError = buildTypeCheckDiscoveryError(files, mountedPaths, tcResult.log);
      tcResult.status = 'failed';
      tcResult.errors = [discoveryError];
      tcResult.log = `${tcResult.log}\n\n${discoveryError.message}`;
    }
    finishStepDiagnostic('type-check', tcResult);
    steps.push(tcResult);
    logs.push(tcResult.log);
    if (tcResult.status === 'skipped') {
      return finalize({
        success: false,
        skipped: true,
        skipReason: tcResult.infrastructureError ?? 'Type-check was skipped because the sandbox command stalled.',
      });
    }
    if (tcResult.status === 'failed') {
      return finalize({ success: false, skipped: false });
    }

    // 6. CSS sanity. Catch leaked markdown / SEARCH/REPLACE markers and
    // unsafe pseudo-element @apply usage before spending time in Next build;
    // the log includes nearby source lines.
    onStatus?.('Checking CSS syntax inputs...');
    const cssSanityStep = runCssSanityStep(files);
    steps.push(cssSanityStep);
    logs.push(cssSanityStep.log);
    if (cssSanityStep.status === 'failed') {
      teeLog({
        level: 'error',
        text: cssSanityStep.log,
        timestamp: Date.now(),
      });
      return finalize({ success: false, skipped: false });
    }

    // 7. Build (optional)
    if (typeCheckOnly) {
      // Style audit still runs in fast mode — it is static and free,
      // and "compiles but renders unstyled" is a quality failure.
      onStatus?.('Auditing styling…');
      const fastStyleStep = runStyleAuditStep(files);
      if (fastStyleStep) {
        steps.push(fastStyleStep);
        logs.push(fastStyleStep.log);
        if (fastStyleStep.status === 'failed') {
          return finalize({ success: false, skipped: false });
        }
      }
      return finalize({ success: true, skipped: false });
    }
    onStatus?.('Running build…');
    beginStepDiagnostic('build', 'Running production build.');
    const buildResult = appendCssUnknownWordContext(files, await runStep(
      'build',
      'npx',
      ['--yes', 'next', 'build'],
      teeLog,
      BUILD_TIMEOUT_MS
    ));
    finishStepDiagnostic('build', buildResult);
    steps.push(buildResult);
    logs.push(buildResult.log);
    if (buildResult.status === 'skipped') {
      return finalize({
        success: false,
        skipped: true,
        skipReason: buildResult.infrastructureError ?? 'Build was skipped because the sandbox command stalled.',
      });
    }
    if (buildResult.status === 'failed') {
      return finalize({ success: false, skipped: false });
    }

    // 6.5. Style audit (static) — the app compiles, but does it ship
    // styling? Detects broken Tailwind wiring (globals.css not imported
    // by the layout, missing PostCSS config, content globs that purge
    // everything, components with zero utility classes). A failure here
    // feeds the auto-fix loop exactly like a build failure: an app that
    // renders as browser-default HTML is a quality failure.
    onStatus?.('Auditing styling…');
    const styleStep = runStyleAuditStep(files);
    if (styleStep) {
      steps.push(styleStep);
      logs.push(styleStep.log);
      if (styleStep.status === 'failed') {
        return finalize({ success: false, skipped: false });
      }
    }

    // 7. Runtime smoke (optional, opt-in via `runtimeSmoke: true`)
    //
    // Addresses the "builds but fails at runtime" gap. We start
    // `npm run dev`, wait for server-ready, fetch /, then look for
    // Next.js error overlays and React crash banners in the HTML. If
    // anything looks wrong, the step is marked failed and the
    // overall validation fails — feeding the auto-fix loop the exact
    // runtime diagnostic.
    if (runtimeSmoke) {
      onStatus?.('Running runtime smoke test…');
      const smokeResult = await runRuntimeSmoke(teeLog, runtimeSmokeTimeoutMs);
      steps.push(smokeResult);
      logs.push(smokeResult.log);
      if (smokeResult.status === 'failed') {
        return finalize({ success: false, skipped: false });
      }
    }

    return finalize({ success: true, skipped: false });
  })();

  const result = await Promise.race([workPromise, timeoutPromise]);
  if (watchdogInterval) clearInterval(watchdogInterval);
  return result;
}

/** Re-export the parsed error type for convenience. */
export type { ParsedError } from './errorParser';
