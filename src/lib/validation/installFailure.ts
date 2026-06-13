/**
 * Install failure classification (June 2026 reliability pass).
 *
 * `npm install` inside the WebContainer can fail for reasons that have
 * NOTHING to do with the generated app's code — the canonical example
 * is `jsh -c npm install` aborting with exit 4294967294 (0xFFFFFFFE,
 * i.e. -2 as an unsigned 32-bit int: the process was killed before it
 * produced a clean exit). Sending such failures to the AI auto-fix
 * loop "as if the code were broken" wastes attempts and gaslights the
 * user — the same project often installs fine locally.
 *
 * This module classifies an install failure into:
 *   - dependency-conflict   → REAL code/manifest problem; auto-fixable
 *   - missing-package-json  → REAL manifest problem; auto-fixable
 *   - environment           → WebContainer/browser sandbox limitation
 *   - network               → registry unreachable from the sandbox
 *   - unknown               → cannot tell; treated as NOT auto-fixable
 *
 * Only auto-fixable classes are forwarded to the auto-fix loop. The
 * rest produce a "Browser sandbox install failed — run locally" state
 * (chat message + Preview-panel fallback card with a ZIP download).
 */

export type InstallFailureKind =
  | 'dependency-conflict'
  | 'missing-package-json'
  | 'environment'
  | 'network'
  | 'unknown';

export interface InstallFailureInfo {
  kind: InstallFailureKind;
  /** Human-readable, user-facing explanation. */
  reason: string;
  /** Should this failure be sent to the AI auto-fix loop? */
  autoFixable: boolean;
}

/**
 * Exit codes that indicate the process was aborted/killed rather than
 * exiting with a real tool error:
 *   4294967294 / 4294967295  — unsigned wraps of -2 / -1 (WC abort)
 *   134 — SIGABRT, 137 — SIGKILL (OOM killer), 139 — SIGSEGV
 */
const ABORT_EXIT_CODES = new Set([4294967294, 4294967295, -2, 134, 137, 139]);

const DEP_CONFLICT_RE =
  /eresolve|unable to resolve dependency tree|conflicting peer dependency|peer dep(?:endency)?\s+conflict|could not resolve|etarget|notarget|no matching version found|e404|404 not found/i;

const MISSING_PKG_RE =
  /could not read package\.json|enoent.*package\.json|no such file or directory.*package\.json|package\.json.*(?:not found|missing)/i;

const NETWORK_RE =
  /enotfound|etimedout|econnreset|econnrefused|eai_again|enetunreach|getaddrinfo|socket hang up|fetch failed|network (?:error|failure|request failed)/i;

const ENV_LOG_RE =
  /out of memory|enomem|quota.?exceeded|webassembly.*(?:memory|instantiat)|sigkill|sigsegv|aborted\(\)|core dumped/i;

const ENV_INFRA_RE =
  /sharedarraybuffer|cross-?origin|coop|coep|webcontainer|boot failed|memory/i;

export function classifyInstallFailure(
  exitCode: number,
  log: string,
  infrastructureError?: string
): InstallFailureInfo {
  const text = log ?? '';
  const infra = infrastructureError ?? '';

  // 1. Hard abort exit codes / infrastructure-level failures → environment.
  if (ABORT_EXIT_CODES.has(exitCode)) {
    return {
      kind: 'environment',
      reason: `The browser sandbox aborted the install process (exit ${exitCode}) before producing a clean exit. This is typically a WebContainer limitation (memory pressure, browser sandbox behavior, or unsupported command) — not an app code failure.`,
      autoFixable: false,
    };
  }
  if (infra && ENV_INFRA_RE.test(infra)) {
    return {
      kind: 'environment',
      reason: `WebContainer infrastructure failure: ${infra}`,
      autoFixable: false,
    };
  }
  if (exitCode !== 0 && text.trim().length === 0) {
    return {
      kind: 'environment',
      reason: `The install process exited (${exitCode}) without producing any output — the sandbox likely killed it before npm could run. This is a WebContainer limitation, not an app code failure.`,
      autoFixable: false,
    };
  }

  // 2. Manifest missing — a real, fixable project problem.
  if (MISSING_PKG_RE.test(text)) {
    return {
      kind: 'missing-package-json',
      reason: 'package.json is missing or unreadable — npm has nothing to install from.',
      autoFixable: true,
    };
  }

  // 3. Dependency conflict — real, fixable manifest problem (checked
  //    BEFORE network because npm appends generic network hints to
  //    almost every error).
  if (DEP_CONFLICT_RE.test(text)) {
    return {
      kind: 'dependency-conflict',
      reason: 'npm could not resolve the dependency tree — a version conflict (or unpublishable version) in package.json.',
      autoFixable: true,
    };
  }

  // 4. Network — the sandbox cannot reach the registry. Not a code bug.
  if (NETWORK_RE.test(text) || NETWORK_RE.test(infra)) {
    return {
      kind: 'network',
      reason: 'npm could not reach the package registry from the browser sandbox (network failure). The project itself may be fine.',
      autoFixable: false,
    };
  }

  // 5. Environment patterns in the log (OOM, wasm memory, signals).
  if (ENV_LOG_RE.test(text)) {
    return {
      kind: 'environment',
      reason: 'The install was killed by a sandbox resource limit (memory/quota). This is a WebContainer limitation, not an app code failure.',
      autoFixable: false,
    };
  }

  // 6. Unknown — do NOT gaslight the auto-fix loop with it.
  return {
    kind: 'unknown',
    reason: `npm install failed (exit ${exitCode}) for an unrecognised reason. The project may still install fine locally.`,
    autoFixable: false,
  };
}
