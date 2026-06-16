/**
 * WebContainer singleton manager.
 *
 * Phase 1: Build Validation + Auto-Fix Loop
 *
 * Owns a single WebContainer instance for the page, mirrors the in-memory
 * CodePilot file tree into the container's virtual FS, and exposes
 * `runCommand` for executing `yarn install`, `tsc`, `next build`, etc.
 *
 * Design constraints (per problem statement):
 *  - Headless: no terminal panel yet (that's Phase 3).
 *  - Lazy boot: never block app startup — boot on first validation call.
 *  - Graceful unsupported-browser fallback: validation reports a clear
 *    skip-status rather than crashing.
 *  - Survives across multiple AI turns: install runs once per session;
 *    subsequent validations only sync changed files and re-run tsc/build.
 *
 * NOTHING in this module touches the Matrix UI, file tree DOM, Monaco,
 * or Supabase persistence. It is a pure execution layer.
 */

import type { WebContainer, WebContainerProcess, FileSystemTree } from '@webcontainer/api';
import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';
import { completePreviewStage } from '@/lib/preview/diagnostics';

export type LogLevel = 'info' | 'stdout' | 'stderr' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  text: string;
  timestamp: number;
}

export type LogSink = (entry: LogEntry) => void;

export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  combined: string;
  /** True if the WebContainer infrastructure failed (boot, spawn, etc.). */
  infrastructureError?: string;
  /** True if the command was killed via the returned `kill` handle. */
  killed?: boolean;
}

export interface MountedFileAudit {
  ok: boolean;
  expectedCount: number;
  mountedCount: number;
  expectedPaths: string[];
  mountedPaths: string[];
  missing: string[];
  extra: string[];
}

/**
 * Optional process-level callback. Called once the WebContainer process
 * has actually spawned. Callers can stash the kill function and trigger
 * it later (e.g. terminal "stop" button, AbortController integration).
 *
 * Important: do NOT hold this reference past process exit — the
 * underlying WebContainer process is gone.
 */
export type ProcessHandleSink = (handle: { kill: () => void }) => void;

export interface SupportInfo {
  supported: boolean;
  reason?: string;
}

/**
 * Detect whether WebContainer can run in the current browser.
 *
 * WebContainer requires:
 *   - SharedArrayBuffer (cross-origin isolated)
 *   - A modern browser (Chrome/Edge/Firefox/Safari TP)
 *   - Not running on the server (SSR)
 */
export function detectWebContainerSupport(): SupportInfo {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Server-side render — WebContainer is browser-only.' };
  }
  if (typeof SharedArrayBuffer === 'undefined') {
    return {
      supported: false,
      reason:
        'SharedArrayBuffer unavailable — page is not cross-origin isolated (missing COOP/COEP headers).',
    };
  }
  if (!('crossOriginIsolated' in window) || !(window as any).crossOriginIsolated) {
    return {
      supported: false,
      reason: 'crossOriginIsolated=false — COOP/COEP headers required.',
    };
  }
  return { supported: true };
}

const WEBCONTAINER_SHELL_SHIMS = new Set(['npm', 'yarn', 'npx', 'pnpm', 'node']);

function shellQuote(value: string): string {
  if (value === '') return "''";
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toShellCommand(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(' ');
}

function displayCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ').trim();
}

/**
 * WebContainer exposes package-manager binaries as shell shims. In some
 * browser/runtime builds those shims are visible to `jsh` but not directly
 * spawnable through `wc.spawn('npm', ...)`, yielding exit 127 or the opaque
 * unsigned -2 abort code. Route those known shims through `jsh -c` everywhere
 * so validation, preview, and the manual terminal agree.
 */
export function resolveWebContainerSpawn(command: string, args: string[]): {
  command: string;
  args: string[];
} {
  if (command === 'jsh') return { command, args };
  if (!WEBCONTAINER_SHELL_SHIMS.has(command)) return { command, args };
  return { command: 'jsh', args: ['-c', toShellCommand(command, args)] };
}

// ---------- File-tree → WebContainer FileSystemTree conversion ----------

/**
 * Convert the flat list of CodePilot FileNodes into the nested
 * FileSystemTree shape WebContainer expects.
 *
 * Folders are inferred from path segments; missing intermediate folders
 * are created automatically.
 */
export function buildFileSystemTree(files: FileNode[]): FileSystemTree {
  const root: FileSystemTree = {};
  const filesOnly = flattenTree(files).filter((f) => f.type === 'file');

  for (const f of filesOnly) {
    if (typeof f.content !== 'string') continue;
    const segs = f.path.split('/').filter(Boolean);
    if (segs.length === 0) continue;

    let cursor: FileSystemTree = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      const existing = cursor[seg];
      if (existing && 'directory' in existing) {
        cursor = existing.directory;
      } else {
        const dir: FileSystemTree = {};
        cursor[seg] = { directory: dir };
        cursor = dir;
      }
    }
    const fileName = segs[segs.length - 1];
    cursor[fileName] = { file: { contents: f.content } };
  }

  return root;
}

// ---------- Singleton state ----------

interface ManagerState {
  instance: WebContainer | null;
  bootPromise: Promise<WebContainer> | null;
  installed: boolean;
  installingPromise: Promise<RunCommandResult> | null;
  /** Fingerprint of package.json + lockfiles at last successful install. */
  installHash: string | null;
  /** path → last-synced content, used to skip redundant writeFile calls */
  syncedContent: Map<string, string>;
}

const state: ManagerState = {
  instance: null,
  bootPromise: null,
  installed: false,
  installingPromise: null,
  installHash: null,
  syncedContent: new Map(),
};

function filePaths(files: FileNode[]): string[] {
  return flattenTree(files)
    .filter((f) => f.type === 'file' && typeof f.content === 'string')
    .map((f) => f.path)
    .sort();
}

async function readMountedFilePathsFromFs(
  wc: WebContainer,
  dir = ''
): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = (await wc.fs.readdir(dir || '.', { withFileTypes: true })) as Array<{
      name: string;
      isDirectory: () => boolean;
      isFile: () => boolean;
    }>;
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await readMountedFilePathsFromFs(wc, path)));
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out.sort();
}

function buildMountedAudit(expectedPaths: string[], mountedPaths: string[]): MountedFileAudit {
  const expected = new Set(expectedPaths);
  const mounted = new Set(mountedPaths);
  const missing = expectedPaths.filter((path) => !mounted.has(path));
  const extra = mountedPaths.filter((path) => !expected.has(path));
  return {
    ok: missing.length === 0,
    expectedCount: expectedPaths.length,
    mountedCount: mountedPaths.length,
    expectedPaths,
    mountedPaths,
    missing,
    extra,
  };
}

/** Reset the singleton — primarily for tests. */
export function __resetWebContainerForTests() {
  state.instance = null;
  state.bootPromise = null;
  state.installed = false;
  state.installingPromise = null;
  state.installHash = null;
  state.syncedContent.clear();
}

/**
 * Lazily boot the WebContainer. Subsequent calls return the same instance.
 * Boot can take 3-10 seconds — show a status message before calling.
 */
export async function bootWebContainer(): Promise<WebContainer> {
  if (state.instance) return state.instance;
  if (state.bootPromise) return state.bootPromise;

  const support = detectWebContainerSupport();
  if (!support.supported) {
    throw new Error(`WebContainer unsupported: ${support.reason}`);
  }

  state.bootPromise = (async () => {
    // Lazy import — keeps the bundle out of the SSR critical path and
    // avoids parsing the WC blob on browsers that won't use it.
    const { WebContainer } = await import('@webcontainer/api');
    const wc = await WebContainer.boot();
    state.instance = wc;
    // Wire up the server-ready listener once per boot so the preview
    // panel sees dev-server URLs without needing an explicit hook-up.
    registerServerReadyOnce(wc);
    return wc;
  })();

  try {
    return await state.bootPromise;
  } catch (err) {
    state.bootPromise = null;
    throw err;
  }
}

/**
 * Mount the entire current file tree into the WebContainer.
 * Idempotent — replaces the working tree.
 *
 * On first call after boot, this also primes `syncedContent` so subsequent
 * `syncFiles` calls only write what actually changed.
 */
export async function mountFiles(files: FileNode[]): Promise<void> {
  const wc = await bootWebContainer();
  const tree = buildFileSystemTree(files);
  await wc.mount(tree);

  state.syncedContent.clear();
  for (const f of flattenTree(files)) {
    if (f.type === 'file' && typeof f.content === 'string') {
      state.syncedContent.set(f.path, f.content);
    }
  }
}

/**
 * Sync ONLY the files whose content has changed since the last sync.
 *
 * Returns the list of paths that were actually written. Caller can log
 * this for visibility.
 */
export async function syncFiles(files: FileNode[]): Promise<string[]> {
  const wc = await bootWebContainer();
  const flat = flattenTree(files).filter(
    (f) => f.type === 'file' && typeof f.content === 'string'
  );

  const written: string[] = [];
  const seen = new Set<string>();

  for (const f of flat) {
    seen.add(f.path);
    const prev = state.syncedContent.get(f.path);
    if (prev === f.content) continue;

    // Ensure parent directory exists. WC's writeFile fails if the dir
    // is missing, so we mkdir -p first.
    const segs = f.path.split('/').filter(Boolean);
    if (segs.length > 1) {
      const dir = segs.slice(0, -1).join('/');
      try {
        await wc.fs.mkdir(dir, { recursive: true });
      } catch {
        // Best-effort — writeFile will surface the real error.
      }
    }

    await wc.fs.writeFile(f.path, f.content!);
    state.syncedContent.set(f.path, f.content!);
    written.push(f.path);
  }

  // Detect deletions — files we had previously synced but are no longer
  // in the tree. Phase 1 keeps this simple; multi-delete cleanup can be
  // added later if it becomes necessary.
  for (const path of Array.from(state.syncedContent.keys())) {
    if (!seen.has(path)) {
      try {
        await wc.fs.rm(path, { force: true });
      } catch {
        // ignore — file may already be gone
      }
      state.syncedContent.delete(path);
    }
  }

  return written;
}

export async function getMountedFileAudit(files: FileNode[]): Promise<MountedFileAudit> {
  const wc = await bootWebContainer();
  const expectedPaths = filePaths(files);
  let mountedPaths = await readMountedFilePathsFromFs(wc);
  if (mountedPaths.length === 0 && state.syncedContent.size > 0) {
    mountedPaths = Array.from(state.syncedContent.keys()).sort();
  }
  return buildMountedAudit(expectedPaths, mountedPaths);
}

/**
 * Run a command inside the WebContainer and collect stdout/stderr.
 *
 * WebContainer's spawn API only exposes a single combined output stream,
 * so we capture the combined text and (best-effort) also keep it as
 * stdout for downstream parsers. Tools like tsc and next.js write
 * errors to stdout anyway, so this is sufficient for Phase 1 parsing.
 */
export async function runCommand(
  command: string,
  args: string[],
  options: {
    onLog?: LogSink;
    cwd?: string;
    env?: Record<string, string>;
    /** Inactivity timeout (ms). Output activity resets the timer. On
     *  expiry the process is killed and an infrastructureError is
     *  reported. Defaults to no timeout. */
    timeoutMs?: number;
    /**
     * Receives `{ kill }` once the process has spawned. Lets callers
     * cancel a long-running process (terminal stop button, etc.).
     * Called at most once per command.
     */
    onProcess?: ProcessHandleSink;
  } = {}
): Promise<RunCommandResult> {
  const { onLog, cwd, env, timeoutMs, onProcess } = options;

  let wc: WebContainer;
  try {
    wc = await bootWebContainer();
  } catch (err) {
    return {
      exitCode: -1,
      stdout: '',
      stderr: '',
      combined: '',
      infrastructureError:
        err instanceof Error ? err.message : 'WebContainer boot failed',
    };
  }

  onLog?.({
    level: 'info',
    text: `$ ${command} ${args.join(' ')}\n`,
    timestamp: Date.now(),
  });

  const startedAt = performance.now();
  const spawnSpec = resolveWebContainerSpawn(command, args);
  onLog?.({
    level: 'info',
    text:
      `[cmd] cwd=${cwd ?? '/'} requested="${displayCommand(command, args)}" ` +
      `executed="${displayCommand(spawnSpec.command, spawnSpec.args)}"\n`,
    timestamp: Date.now(),
  });

  let proc: WebContainerProcess;
  try {
    proc = await wc.spawn(spawnSpec.command, spawnSpec.args, {
      cwd,
      env,
      output: true,
    });
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    onLog?.({
      level: 'error',
      text:
        `[cmd] spawn failed after ${elapsedMs}ms cwd=${cwd ?? '/'} ` +
        `executed="${displayCommand(spawnSpec.command, spawnSpec.args)}" ` +
        `stderr=(WebContainer exposes a combined output stream only)\n`,
      timestamp: Date.now(),
    });
    return {
      exitCode: -1,
      stdout: '',
      stderr: '',
      combined: '',
      infrastructureError:
        err instanceof Error ? err.message : `spawn failed: ${command}`,
    };
  }

  // Track user-initiated kills separately from timeout-driven kills so
  // we can attribute the exit reason precisely in the result.
  let userKilled = false;
  const killHandle = {
    kill: () => {
      userKilled = true;
      try {
        proc.kill();
      } catch {
        // best-effort — process may already have exited
      }
    },
  };
  onProcess?.(killHandle);

  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const armTimeout = () => {
    if (!timeoutMs || timeoutMs <= 0) return;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {
        // best-effort
      }
    }, timeoutMs);
  };

  let combined = '';
  const sink = new WritableStream<string>({
    write(chunk) {
      combined += chunk;
      armTimeout();
      onLog?.({ level: 'stdout', text: chunk, timestamp: Date.now() });
    },
  });

  const pipePromise = proc.output.pipeTo(sink).catch(() => {
    // Swallow — pipeTo can throw on early process exit.
  });

  armTimeout();

  const exitCode = await proc.exit;
  if (timeoutHandle) clearTimeout(timeoutHandle);
  await pipePromise;
  const elapsedMs = Math.round(performance.now() - startedAt);

  if (timedOut) {
    onLog?.({
      level: 'error',
      text:
        `→ timeout after ${timeoutMs}ms — process killed\n` +
        `[cmd] elapsed=${elapsedMs}ms exit=${exitCode ?? -1} stderr=(WebContainer exposes a combined output stream only)\n`,
      timestamp: Date.now(),
    });
    return {
      exitCode: exitCode ?? -1,
      stdout: combined,
      stderr: '',
      combined,
      infrastructureError: `Command "${command} ${args.join(' ')}" produced no output for ${timeoutMs}ms and was treated as stalled.`,
    };
  }

  if (userKilled) {
    onLog?.({
      level: 'warn',
      text:
        `→ killed by user (exit ${exitCode})\n` +
        `[cmd] elapsed=${elapsedMs}ms exit=${exitCode ?? -1} stderr=(WebContainer exposes a combined output stream only)\n`,
      timestamp: Date.now(),
    });
    return {
      exitCode: exitCode ?? -1,
      stdout: combined,
      stderr: '',
      combined,
      killed: true,
    };
  }

  onLog?.({
    level: exitCode === 0 ? 'info' : 'error',
    text:
      `→ exit ${exitCode}\n` +
      `[cmd] elapsed=${elapsedMs}ms exit=${exitCode} stderr=(WebContainer exposes a combined output stream only)\n`,
    timestamp: Date.now(),
  });

  return {
    exitCode,
    stdout: combined,
    stderr: '',
    combined,
  };
}

/**
 * Files whose content determines whether a fresh install is needed.
 * Hashing them lets `ensureDependenciesInstalled` skip redundant full
 * installs (the slowest, flakiest step in the sandbox) when nothing
 * dependency-related changed.
 */
const DEPENDENCY_MANIFEST_FILES = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
] as const;

/**
 * Cheap FNV-1a fingerprint over package.json + lockfile contents.
 * Stable across runs; changes iff dependency-relevant content changes.
 */
export function computeDependencyFingerprint(files: FileNode[]): string {
  const flat = flattenTree(files).filter((f) => f.type === 'file');
  const parts: string[] = [];
  for (const name of DEPENDENCY_MANIFEST_FILES) {
    const f = flat.find((x) => x.path === name);
    if (f && typeof f.content === 'string') parts.push(`${name}:${f.content}`);
  }
  const s = parts.join('\u0000');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${s.length}:${h.toString(16)}`;
}

const NPM_INSTALL_ARGS = ['install', '--no-audit', '--no-fund', '--loglevel=error'];

/**
 * Pick the install command from the lockfiles actually present:
 *   pnpm-lock.yaml → pnpm install
 *   yarn.lock      → yarn install
 *   package-lock.json → npm ci (falls back to npm install when the
 *                       lock is out of sync with package.json)
 *   none           → npm install --no-audit --no-fund --loglevel=error
 */
function pickInstallCommand(files?: FileNode[]): {
  command: string;
  args: string[];
  label: string;
} {
  const paths = files
    ? new Set(
        flattenTree(files)
          .filter((f) => f.type === 'file')
          .map((f) => f.path)
      )
    : new Set<string>();
  if (paths.has('pnpm-lock.yaml')) {
    return { command: 'pnpm', args: ['install'], label: 'pnpm install' };
  }
  if (paths.has('yarn.lock')) {
    return { command: 'yarn', args: ['install'], label: 'yarn install' };
  }
  if (paths.has('package-lock.json')) {
    return {
      command: 'npm',
      args: ['ci', '--no-audit', '--no-fund', '--loglevel=error'],
      label: 'npm ci',
    };
  }
  return { command: 'npm', args: NPM_INSTALL_ARGS, label: 'npm install' };
}

function dependencyFilePresence(files?: FileNode[]): {
  packageJson: boolean;
  lockfiles: string[];
} {
  const paths = files
    ? new Set(
        flattenTree(files)
          .filter((f) => f.type === 'file')
          .map((f) => f.path)
      )
    : new Set<string>();
  return {
    packageJson: paths.has('package.json'),
    lockfiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].filter((path) =>
      paths.has(path)
    ),
  };
}

/** Does node_modules actually exist in the container FS? */
async function nodeModulesPresent(): Promise<boolean> {
  if (!state.instance) return state.installed; // not booted — trust the flag
  try {
    const entries = await state.instance.fs.readdir('node_modules');
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Ensure `node_modules/` is populated.
 *
 * Skip conditions (June 2026 reliability pass): the install is skipped
 * when ALL of these hold — a previous install succeeded this session,
 * the package.json/lockfile fingerprint is unchanged, and node_modules
 * still exists in the container FS. Anything else re-installs.
 *
 * Strategy: lockfile-aware command selection (pnpm/yarn/npm ci/npm
 * install), `npm ci` → `npm install` fallback on lock drift, and ONE
 * `--legacy-peer-deps` retry when npm reports ERESOLVE. Never --force.
 */
export async function ensureDependenciesInstalled(
  onLog?: LogSink,
  options: { force?: boolean; timeoutMs?: number; files?: FileNode[] } = {}
): Promise<RunCommandResult> {
  const fingerprint = options.files
    ? computeDependencyFingerprint(options.files)
    : null;

  if (state.installed && !options.force) {
    const unchanged = fingerprint === null || fingerprint === state.installHash;
    if (unchanged && (await nodeModulesPresent())) {
      onLog?.({
        level: 'info',
        text: '[deps] dependencies unchanged + node_modules present — skipping install\n',
        timestamp: Date.now(),
      });
      return { exitCode: 0, stdout: '', stderr: '', combined: '' };
    }
    onLog?.({
      level: 'info',
      text: unchanged
        ? '[deps] node_modules missing — re-installing\n'
        : '[deps] package.json / lockfile changed — re-installing\n',
      timestamp: Date.now(),
    });
    state.installed = false;
  }
  if (state.installingPromise) {
    return state.installingPromise;
  }

  state.installingPromise = (async () => {
    const { command, args, label } = pickInstallCommand(options.files);
    const presence = dependencyFilePresence(options.files);
    const spawnSpec = resolveWebContainerSpawn(command, args);
    onLog?.({
      level: 'info',
      text:
        `[deps] package.json=${presence.packageJson ? 'yes' : 'no'} ` +
        `lockfiles=${presence.lockfiles.length ? presence.lockfiles.join(',') : 'none'} ` +
        `cwd=/ command="${label}" executed="${displayCommand(spawnSpec.command, spawnSpec.args)}"\n` +
        `[deps] running ${label} (this may take 30-60s on first run)…\n`,
      timestamp: Date.now(),
    });
    let result = await runCommand(command, args, {
      onLog,
      timeoutMs: options.timeoutMs,
    });

    // npm ci with an out-of-sync lockfile → fall back to npm install.
    if (
      label === 'npm ci' &&
      result.exitCode !== 0 &&
      !result.infrastructureError &&
      /in sync|lock ?file|EUSAGE/i.test(result.combined)
    ) {
      onLog?.({
        level: 'warn',
        text: '[deps] npm ci failed (lockfile out of sync) — falling back to npm install\n',
        timestamp: Date.now(),
      });
      result = await runCommand('npm', NPM_INSTALL_ARGS, {
        onLog,
        timeoutMs: options.timeoutMs,
      });
    }

    // ERESOLVE → exactly ONE retry with --legacy-peer-deps. Never --force.
    if (
      result.exitCode !== 0 &&
      !result.infrastructureError &&
      command === 'npm' &&
      /ERESOLVE/i.test(result.combined)
    ) {
      onLog?.({
        level: 'warn',
        text: '[deps] ERESOLVE conflict — retrying once with --legacy-peer-deps\n',
        timestamp: Date.now(),
      });
      const retry = await runCommand(
        'npm',
        [...NPM_INSTALL_ARGS, '--legacy-peer-deps'],
        { onLog, timeoutMs: options.timeoutMs }
      );
      if (retry.exitCode === 0 && !retry.infrastructureError) {
        result = retry;
      } else {
        // Keep the original ERESOLVE evidence in the combined log so
        // downstream classification still sees the conflict.
        result = {
          ...retry,
          combined: `${result.combined}\n${retry.combined}`,
          stdout: `${result.stdout}\n${retry.stdout}`,
        };
      }
    }

    if (result.exitCode === 0 && !result.infrastructureError) {
      state.installed = true;
      state.installHash = fingerprint;
    }
    state.installingPromise = null;
    return result;
  })();

  return state.installingPromise;
}

/** Force a fresh dependency install on the next `ensureDependenciesInstalled`. */
export function invalidateDependenciesCache() {
  state.installed = false;
}

/** Indicates whether the WebContainer instance is currently booted. */
export function isBooted(): boolean {
  return state.instance !== null;
}

// ---------- Preview support (server-ready) ----------
//
// Matrix Coder AI preview panel (2026-01) — when the user runs
// `npm run dev` / `next dev` / `vite` inside the WebContainer, the
// `server-ready` event fires with `(port, url)`. We rebroadcast that
// to React subscribers so the embedded preview panel can mount an
// `<iframe src={url}>` without any new backend.
//
// Multiple subscribers are supported. Unsubscribe by calling the
// returned function. Subscribers receive the most-recent URL on
// subscribe (if one is already cached) so a panel that opens AFTER
// the dev server started still gets the URL.

export interface PreviewServerInfo {
  port: number;
  url: string;
  sequence: number;
  emittedAt: number;
}

let lastPreviewInfo: PreviewServerInfo | null = null;
const previewSubscribers = new Set<(info: PreviewServerInfo) => void>();
let serverReadyRegistered = false;
let serverReadySequence = 0;

function registerServerReadyOnce(wc: WebContainer) {
  if (serverReadyRegistered) return;
  serverReadyRegistered = true;
  try {
    wc.on('server-ready', (port: number, url: string) => {
      serverReadySequence += 1;
      lastPreviewInfo = {
        port,
        url,
        sequence: serverReadySequence,
        emittedAt: Date.now(),
      };
      completePreviewStage('dev-server', `Server ready on port ${port}: ${url}`);
      for (const cb of previewSubscribers) {
        try {
          cb(lastPreviewInfo);
        } catch (err) {
          console.warn('[preview] subscriber threw:', err);
        }
      }
    });
  } catch (err) {
    console.warn('[preview] failed to register server-ready listener:', err);
  }
}

export function subscribeToServerReady(
  cb: (info: PreviewServerInfo) => void
): () => void {
  previewSubscribers.add(cb);
  // Replay the most recent URL so late subscribers see it.
  if (lastPreviewInfo) {
    try {
      cb(lastPreviewInfo);
    } catch {
      /* swallow */
    }
  }
  // If WC is already booted, ensure the listener is wired up.
  if (state.instance) registerServerReadyOnce(state.instance);
  return () => {
    previewSubscribers.delete(cb);
  };
}

export function getLastPreviewInfo(): PreviewServerInfo | null {
  return lastPreviewInfo;
}

export function getServerReadySequence(): number {
  return serverReadySequence;
}

export function clearPreviewInfo() {
  lastPreviewInfo = null;
}

/**
 * Wait for the NEXT `server-ready` event after this call.
 *
 * 2026-01 runtime-smoke pass — the validation engine needs to start a
 * dev server, wait for its URL, then fetch it. Callers may pass the
 * server-ready sequence captured before they spawned the dev server;
 * the waiter accepts cached URLs only when they were emitted after
 * that baseline, which avoids stale URLs without missing fast starts.
 *
 * Resolves with the {port, url} pair, or `null` if the timeout elapses
 * before any server reports ready. Never rejects — callers don't have
 * to wrap in try/catch.
 */
export function waitForNextServerReady(
  timeoutMs: number,
  options: { afterSequence?: number } = {}
): Promise<PreviewServerInfo | null> {
  return new Promise((resolve) => {
    let settled = false;
    // 2026-01 BUG FIX — cache snapshot MUST be captured BEFORE we
    // subscribe. `subscribeToServerReady` synchronously replays the
    // most recent URL into the callback the moment a cached entry
    // exists, so referencing `cachedAtSubscribeTime` inside the
    // callback before this line ran put it in the temporal dead
    // zone, the callback threw, the inner try/catch in
    // `subscribeToServerReady` swallowed the error, and this
    // promise then hung until the timeout fired. Net effect: every
    // smoke run AFTER the first one falsely reported "Dev server
    // did not bind to a port within 60s".
    const afterSequence = options.afterSequence ?? serverReadySequence;
    if (lastPreviewInfo && lastPreviewInfo.sequence > afterSequence) {
      resolve(lastPreviewInfo);
      return;
    }
    const unsub = subscribeToServerReady((info) => {
      if (settled) return;
      // Skip the cached-replay tick — only honor freshly fired events.
      if (info.sequence <= afterSequence) {
        return;
      }
      settled = true;
      try {
        unsub();
      } catch {
        /* swallow */
      }
      resolve(info);
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        unsub();
      } catch {
        /* swallow */
      }
      resolve(null);
    }, Math.max(1000, timeoutMs));
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref?: () => void }).unref?.();
    }
  });
}

/**
 * Spawn a long-running command WITHOUT awaiting its exit. Returns a
 * lightweight handle the caller uses to read logs + kill the process.
 *
 * Used by the runtime-smoke validation step to start `npm run dev` and
 * then kill it after the HTTP check completes. NOT a replacement for
 * `runCommand` — anything that should block on a clean exit should
 * still use `runCommand`.
 */
export interface BackgroundProcess {
  kill: () => void;
  exited: Promise<number>;
}

export async function spawnBackground(
  command: string,
  args: string[],
  options: {
    onLog?: LogSink;
    cwd?: string;
    env?: Record<string, string>;
  } = {}
): Promise<BackgroundProcess> {
  const wc = await bootWebContainer();
  const { onLog, cwd, env } = options;
  onLog?.({
    level: 'info',
    text: `$ ${command} ${args.join(' ')}  (background)\n`,
    timestamp: Date.now(),
  });
  const spawnSpec = resolveWebContainerSpawn(command, args);
  const startedAt = performance.now();
  onLog?.({
    level: 'info',
    text:
      `[cmd] cwd=${cwd ?? '/'} requested="${displayCommand(command, args)}" ` +
      `executed="${displayCommand(spawnSpec.command, spawnSpec.args)}" background=true\n`,
    timestamp: Date.now(),
  });
  let proc: WebContainerProcess;
  try {
    proc = await wc.spawn(spawnSpec.command, spawnSpec.args, { cwd, env, output: true });
  } catch (err) {
    onLog?.({
      level: 'error',
      text:
        `[cmd] background spawn failed after ${Math.round(performance.now() - startedAt)}ms ` +
        `cwd=${cwd ?? '/'} executed="${displayCommand(spawnSpec.command, spawnSpec.args)}" ` +
        `stderr=(WebContainer exposes a combined output stream only)\n`,
      timestamp: Date.now(),
    });
    throw err;
  }
  const sink = new WritableStream<string>({
    write(chunk) {
      onLog?.({ level: 'stdout', text: chunk, timestamp: Date.now() });
    },
  });
  // Fire-and-forget pipe; never throws to the caller because callers
  // don't await the lifetime of a background process.
  proc.output.pipeTo(sink).catch(() => {
    /* swallow — process may exit before pipe completes */
  });
  return {
    kill: () => {
      try {
        proc.kill();
      } catch {
        /* best-effort */
      }
    },
    exited: proc.exit.then((exitCode) => {
      onLog?.({
        level: exitCode === 0 ? 'info' : 'error',
        text:
          `[cmd] background elapsed=${Math.round(performance.now() - startedAt)}ms ` +
          `exit=${exitCode} stderr=(WebContainer exposes a combined output stream only)\n`,
        timestamp: Date.now(),
      });
      return exitCode;
    }),
  };
}
