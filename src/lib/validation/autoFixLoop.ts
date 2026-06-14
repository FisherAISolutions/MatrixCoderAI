/**
 * Auto-Fix Loop orchestrator.
 *
 * After the Coding Agent emits CREATEs/EDITs and the user-facing patcher
 * applies them, this loop:
 *
 *   1. runs the real validation pipeline inside the WebContainer
 *   2. if it fails, sends the parsed errors back to the LLM (via the
 *      existing /api/ai/chat-completion route, in non-streaming mode)
 *   3. extracts SEARCH/REPLACE patches from the LLM response and applies
 *      them through the same `applyEditSequence` path used by the
 *      normal Coding Agent flow — guarantees identical patch semantics
 *   4. retries up to AUTO_FIX_MAX_ATTEMPTS times or until the build
 *      passes
 *
 * Visible feedback:
 *   - `onStatus` for the AgentStatusBar's transient activity row
 *   - `onChatMessage` for permanent system messages in the chat
 *
 * Concurrency safety:
 *   - A module-level lock prevents two loops from running in parallel.
 *     The lock is per-page and reset when the loop completes (success,
 *     failure, or thrown error).
 *
 * Disable toggle:
 *   - `AUTO_FIX_ENABLED` constant + per-call `enabled` option. Set to
 *     `false` to short-circuit the loop without touching call sites.
 */

import { getChatCompletion } from '@/lib/ai/chatCompletion';
import {
  extractFromAssistantResponse,
  normalizeEditPath,
} from '@/lib/repo/extractors';
import { applyEditSequence } from '@/lib/repo/patcher';
import { flattenTree } from '@/lib/repo/heuristics';
import { planAppRouterRootNormalization } from '@/lib/repo/appRouterRoot';
import type { FileNode } from '@/app/chat-workspace/components/types';
import { runValidation, type ValidationResult, type ParsedError } from './engine';
import { extractFailureExcerpt } from './errorParser';
import { applyDeterministicFixes } from './deterministicFixes';
import {
  AUTO_FIX_SYSTEM_PROMPT,
  buildAutoFixUserPrompt,
} from './autoFixPrompt';
import { prefixedId } from '@/lib/uuid';

/** Master kill switch — flip to false to disable the loop project-wide. */
export const AUTO_FIX_ENABLED = true;

/** Maximum auto-fix attempts after the initial validation. */
export const AUTO_FIX_MAX_ATTEMPTS = 3;

/** Provider + model for the auto-fix calls. Centralised in
 *  `src/lib/ai/modelConfig.ts` (2026-01 quality-upgrade pass) so the
 *  entire app upgrades in one place. */
import { AI_PROVIDER as AUTO_FIX_PROVIDER, AUTO_FIX_MODEL } from '@/lib/ai/modelConfig';

/** Hard ceiling on tokens we allow the auto-fix LLM call to spend. */
const AUTO_FIX_MAX_TOKENS = 4096;

export interface ChatSystemMessage {
  id: string;
  role: 'system';
  content: string;
  timestamp: string;
}

export interface AutoFixLoopOptions {
  /** Current file tree (the loop will mutate copies of this in-memory). */
  files: FileNode[];
  /** Surface transient status (e.g. "Running type-check…"). */
  onStatus: (label: string | null) => void;
  /** Append a permanent chat message — the user must see what happened. */
  onChatMessage: (msg: ChatSystemMessage) => void;
  /** Apply a patched file back into React state / Supabase. */
  onUpdateFile: (file: FileNode) => void;
  /** Add a brand new file (used when the AI fixes "missing local file"). */
  onAddFile: (file: FileNode) => void;
  /** Delete obsolete files, used for App Router root normalization. */
  onDeleteFile?: (fileId: string) => void;
  /** Per-call disable toggle (defaults to AUTO_FIX_ENABLED). */
  enabled?: boolean;
  /** Override max retries (for tests). */
  maxAttempts?: number;
  /** Skip `next build`; type-check only (much faster). */
  typeCheckOnly?: boolean;
  /**
   * After a successful build, start the dev server and verify the
   * root route loads without a Next.js error overlay / React crash
   * banner. Failures here re-enter the auto-fix loop just like build
   * failures. Off by default for backward compatibility.
   */
  runtimeSmoke?: boolean;
  /** Original user request, used to judge and repair placeholder generated files. */
  requirements?: string;
}

export interface AutoFixLoopResult {
  ran: boolean;
  succeeded: boolean;
  attempts: number;
  finalValidation?: ValidationResult;
  /** Set when the loop refused to run (lock held, disabled, no support). */
  skippedReason?: string;
}

// ---------- Module-level concurrency lock ----------

let loopInProgress = false;

/** True if an auto-fix loop is currently running. */
export function isAutoFixRunning(): boolean {
  return loopInProgress;
}

// ---------- Helpers ----------

function nowIso(): string {
  return new Date().toISOString();
}

function sysMsg(content: string): ChatSystemMessage {
  return {
    id: prefixedId('msg-autofix'),
    role: 'system',
    content,
    timestamp: nowIso(),
  };
}

function summarizeErrors(errors: ParsedError[]): string {
  if (errors.length === 0) return '_(no structured errors parsed — see the raw log below)_';
  const head = errors.slice(0, 5);
  const rest = errors.length - head.length;
  const list = head
    .map((e, i) => {
      const loc =
        e.file && e.line
          ? `\`${e.file}:${e.line}\``
          : e.file
          ? `\`${e.file}\``
          : '';
      return `${i + 1}. ${loc} — ${e.message.slice(0, 180)}`;
    })
    .join('\n');
  return rest > 0 ? `${list}\n_…and ${rest} more_` : list;
}

/**
 * Render a "what actually happened" excerpt of the failed step's log
 * for inclusion in a chat message. The user sees this directly; the
 * AI also sees it via the prompt builder.
 */
function renderRawExcerpt(label: string, log: string | undefined): string {
  if (!log || log.trim().length === 0) return '';
  const excerpt = extractFailureExcerpt(log, 1800);
  return `\n\n<details><summary>📄 Raw \`${label}\` output (click to expand)</summary>\n\n\`\`\`\n${excerpt}\n\`\`\`\n\n</details>`;
}

/**
 * Required user-facing message when the sandbox (NOT the code) killed
 * the install — WebContainer abort, OOM, network, COOP/COEP, etc.
 */
function sandboxInstallFailureMessage(f: { kind: string; reason: string }): string {
  return (
    `**Browser sandbox install failed.** This may be a WebContainer limitation, not an app code failure. Download the project and run \`npm install\` locally.\n\n` +
    '```bash\nnpm install\nnpm run dev\n```\n\n' +
    `_Classification: \`${f.kind}\` — ${f.reason}_\n\n` +
    `Use the **Download ZIP** card in the Preview panel to grab the project. Local installs often succeed even when the browser sandbox cannot.`
  );
}

/**
 * Apply the LLM's SEARCH/REPLACE response against an in-memory file list.
 * Returns the updated list + a report of what changed.
 */
function applyAutoFixResponse(
  files: FileNode[],
  responseText: string,
  onUpdateFile: (f: FileNode) => void,
  onAddFile: (f: FileNode) => void
): { mutated: boolean; applied: number; failed: number; createdCount: number; report: string[] } {
  const { edits, creates, malformedEdits, malformedEditReasons } = extractFromAssistantResponse(responseText);
  const report: string[] = [];
  let applied = 0;
  let failed = 0;
  let mutated = false;

  // Surface malformed edit fences (missing <<<<<<< SEARCH / ======= /
  // >>>>>>> REPLACE markers) directly in the report so the user sees
  // why the auto-fix iteration could not progress. Use the per-path
  // diagnostic from the extractor so the message names the specific
  // marker that was missing (most common: `<<<<<<< SEARCH`).
  for (const p of malformedEdits) {
    const reason =
      malformedEditReasons[p] ??
      'fence missing SEARCH/REPLACE markers; skipped';
    report.push(`[malformed] \`${p}\` — ${reason}`);
    failed++;
  }

  if (edits.length === 0 && creates.length === 0) {
    return { mutated: false, applied: 0, failed, createdCount: 0, report };
  }

  const flat = flattenTree(files);
  const byPath = new Map(
    flat.filter((f) => f.type === 'file').map((f) => [f.path, f])
  );
  const treePaths = Array.from(byPath.keys());

  // Group edits by resolved path so multiple SEARCH/REPLACE blocks against
  // the same file are applied sequentially (mirrors ChatComposer logic).
  const editsByPath = new Map<string, typeof edits>();
  for (const e of edits) {
    const normalized = normalizeEditPath(e.path);
    // Try exact, then suffix match.
    let resolved: string | null = null;
    if (treePaths.includes(normalized)) {
      resolved = normalized;
    } else {
      const suffixMatches = treePaths.filter(
        (p) => p === normalized || p.endsWith('/' + normalized)
      );
      if (suffixMatches.length === 1) resolved = suffixMatches[0];
    }
    const key = resolved ?? normalized;
    const arr = editsByPath.get(key) ?? [];
    arr.push({ ...e, path: key });
    editsByPath.set(key, arr);
  }

  editsByPath.forEach((fileEdits, path) => {
    const target = byPath.get(path);
    if (!target || typeof target.content !== 'string') {
      report.push(`[skip] \`${path}\` not in tree`);
      failed += fileEdits.length;
      return;
    }
    const { finalContent, applied: a, failed: f } = applyEditSequence(
      target.content,
      fileEdits
    );
    if (a === 0) {
      report.push(
        `[fail] \`${path}\` — ${fileEdits.length} block(s) did not match`
      );
      failed += fileEdits.length;
      return;
    }
    applied += a;
    failed += f.length;
    const updated: FileNode = {
      ...target,
      content: finalContent,
      size: finalContent.length,
      lastModified: nowIso(),
      isNew: false,
    };
    onUpdateFile(updated);
    byPath.set(path, updated);
    mutated = true;
    report.push(
      `[ok]   \`${path}\` — ${a}/${fileEdits.length} block(s) applied${f.length ? ` (${f.length} failed)` : ''}`
    );
  });

  // CREATEs from the auto-fix path are rare but allowed (e.g. AI generating
  // a missing local file referenced by a broken import).
  let createdCount = 0;
  for (const c of creates) {
    if (byPath.has(c.path)) continue; // refuse to overwrite via CREATE
    onAddFile({
      id: prefixedId('file'),
      name: c.name,
      path: c.path,
      type: 'file',
      language: c.language as FileNode['language'],
      isNew: true,
      content: c.content,
      lastModified: nowIso(),
      size: c.content.length,
    });
    createdCount++;
    mutated = true;
    report.push(`[new]  \`${c.path}\` — created (${c.content.length} chars)`);
  }

  return { mutated, applied, failed, createdCount, report };
}

/**
 * Build the current file list with any mutations applied so far. We
 * always re-flatten the original tree the caller passed in — they will
 * have updated it via `onUpdateFile`, but the React state lives outside
 * this module. To keep things consistent, the loop maintains its own
 * mutable copy of the file map and rebuilds a FileNode[] for each
 * validation pass.
 */
function rebuildFiles(map: Map<string, FileNode>): FileNode[] {
  return Array.from(map.values());
}

async function applyDeterministicAndRevalidate(
  lastValidation: ValidationResult,
  fileMap: Map<string, FileNode>,
  updateFile: (f: FileNode) => void,
  deleteFile: (f: FileNode) => void,
  onChatMessage: (msg: ChatSystemMessage) => void,
  onStatus: (label: string | null) => void,
  options: {
    typeCheckOnly: boolean;
    runtimeSmoke: boolean;
    requirements: string;
  }
): Promise<{ validation: ValidationResult; applied: boolean }> {
  const report = applyDeterministicFixes(rebuildFiles(fileMap), lastValidation);
  if (!report.mutated) return { validation: lastValidation, applied: false };

  for (const update of report.updates) {
    updateFile(update.file);
  }
  for (const removal of report.deletes) {
    deleteFile(removal.file);
  }
  onChatMessage(
    sysMsg(
      `**Deterministic auto-fix applied** — ${[
        ...report.updates.map((update) => `${update.reason} in \`${update.file.path}\``),
        ...report.deletes.map((removal) => removal.reason),
      ]
        .join('; ')}. Re-running validation before using an AI repair attempt.`
    )
  );
  onStatus('Re-validating deterministic fixes...');
  const validation = await runValidation(rebuildFiles(fileMap), {
    onStatus,
    typeCheckOnly: options.typeCheckOnly,
    runtimeSmoke: options.runtimeSmoke,
    requirements: options.requirements,
  });
  return { validation, applied: true };
}

// ---------- Public API ----------

/**
 * Run the build validation + auto-fix loop.
 *
 * Always resolves (never throws). If the loop refuses to run (disabled,
 * lock held, unsupported browser), it returns `ran=false` plus a
 * `skippedReason`. Callers should NOT try to retry on their own — the
 * loop already handles retries internally.
 */
export async function runAutoFixLoop(
  opts: AutoFixLoopOptions
): Promise<AutoFixLoopResult> {
  const {
    files: initialFiles,
    onStatus,
    onChatMessage,
    onUpdateFile,
    onAddFile,
    onDeleteFile,
    enabled = AUTO_FIX_ENABLED,
    maxAttempts = AUTO_FIX_MAX_ATTEMPTS,
    typeCheckOnly = false,
    runtimeSmoke = false,
    requirements = '',
  } = opts;

  if (!enabled) {
    return { ran: false, succeeded: false, attempts: 0, skippedReason: 'disabled' };
  }
  if (loopInProgress) {
    return { ran: false, succeeded: false, attempts: 0, skippedReason: 'already-running' };
  }
  loopInProgress = true;

  // Maintain a mutable local copy of the file map. Every mutation goes
  // out via the onUpdateFile / onAddFile callbacks AND into this map so
  // subsequent validations see the latest content.
  const fileMap = new Map<string, FileNode>();
  for (const f of flattenTree(initialFiles)) {
    if (f.type === 'file') fileMap.set(f.path, f);
  }

  const updateFile = (f: FileNode) => {
    fileMap.set(f.path, f);
    onUpdateFile(f);
  };
  const addFile = (f: FileNode) => {
    fileMap.set(f.path, f);
    onAddFile(f);
  };
  const deleteFile = (f: FileNode) => {
    fileMap.delete(f.path);
    onDeleteFile?.(f.id);
  };

  const rootPlan = planAppRouterRootNormalization(rebuildFiles(fileMap));
  if (rootPlan.mixed) {
    for (const item of rootPlan.upserts) {
      const existing = fileMap.get(item.file.path);
      if (existing) {
        updateFile({
          ...existing,
          content: item.file.content,
          size: item.file.content?.length,
          lastModified: item.file.lastModified,
        });
      } else {
        addFile(item.file);
      }
    }
    for (const rootFile of rootPlan.rootAppFiles) {
      deleteFile(rootFile);
    }
    onChatMessage(
      sysMsg(
        `**App Router root normalized** — moved duplicate \`app/\` files into \`src/app/\` and removed the old root before validation. Next.js apps must use exactly one App Router root.`
      )
    );
  }

  try {
    onChatMessage(
      sysMsg(
        `**Build validation started** — running \`tsc --noEmit\` and \`next build\`${runtimeSmoke ? ' and a runtime smoke test (GET /)' : ''} inside the WebContainer sandbox.${typeCheckOnly ? ' (type-check only)' : ''}`
      )
    );

    let lastValidation: ValidationResult | undefined;
    let previousAttemptSummary: string | undefined;

    // -------- Initial validation pass --------
    onStatus('Validating build…');
    lastValidation = await runValidation(rebuildFiles(fileMap), {
      onStatus,
      typeCheckOnly,
      runtimeSmoke,
      requirements,
    });

    if (lastValidation.skipped) {
      const reason = lastValidation.skipReason ?? 'unknown';
      if (lastValidation.installFailure) {
        // Sandbox/environment install failure — NOT a code failure.
        // Never enters the auto-fix loop; point the user at local run.
        onChatMessage(sysMsg(sandboxInstallFailureMessage(lastValidation.installFailure)));
      } else {
        onChatMessage(
          sysMsg(
            `**Validation skipped** — could not run in this browser.\n\n_Reason: ${reason}_\n\n` +
              `WebContainer needs cross-origin isolation (COOP/COEP headers) and a modern Chromium/Firefox/Safari build. ` +
              `Open the workspace in a top-level browser tab (not embedded in an iframe without the correct headers) and try again.`
          )
        );
      }
      onStatus(null);
      return {
        ran: false,
        succeeded: false,
        attempts: 0,
        finalValidation: lastValidation,
        skippedReason: reason,
      };
    }

    if (lastValidation.success) {
      onChatMessage(sysMsg('**Validation passed ✓** — imports, build, runtime smoke, and style audit are green on the first try.'));
      onStatus(null);
      return { ran: true, succeeded: true, attempts: 0, finalValidation: lastValidation };
    }

    const deterministicInitial = await applyDeterministicAndRevalidate(
      lastValidation,
      fileMap,
      updateFile,
      deleteFile,
      onChatMessage,
      onStatus,
      { typeCheckOnly, runtimeSmoke, requirements }
    );
    if (deterministicInitial.applied) {
      lastValidation = deterministicInitial.validation;
      if (lastValidation.skipped) {
        onStatus(null);
        return {
          ran: true,
          succeeded: false,
          attempts: 0,
          finalValidation: lastValidation,
          skippedReason: lastValidation.skipReason,
        };
      }
      if (lastValidation.success) {
        onChatMessage(sysMsg('**Validation passed ✓** — deterministic fixes resolved the issue before an AI repair attempt was needed.'));
        onStatus(null);
        return { ran: true, succeeded: true, attempts: 0, finalValidation: lastValidation };
      }
    }

    // -------- Initial failure report --------
    const firstFailedStep = lastValidation.steps.find((s) => s.status === 'failed');
    const stepLabel =
      firstFailedStep?.step === 'type-check'
        ? 'Type-check failed'
        : firstFailedStep?.step === 'build'
        ? 'Build failed'
        : firstFailedStep?.step === 'install'
        ? 'Dependency install failed'
        : firstFailedStep?.step === 'import-integrity'
        ? 'Generated-file consistency audit failed'
        : firstFailedStep?.step === 'generated-quality'
        ? 'Generated quality audit failed'
        : firstFailedStep?.step === 'style-audit'
        ? 'Style audit failed'
        : 'Validation failed';

    onChatMessage(
      sysMsg(
        `**${stepLabel}** (${lastValidation.errors.length} error${lastValidation.errors.length === 1 ? '' : 's'}). Starting auto-fix loop (max ${maxAttempts} attempts).\n\n${summarizeErrors(lastValidation.errors)}${renderRawExcerpt(firstFailedStep?.step ?? 'validation', firstFailedStep?.log)}`
      )
    );

    // -------- Retry loop --------
    let attempt = 0;
    let consecutiveNoPatchAttempts = 0;
    while (attempt < maxAttempts && lastValidation && !lastValidation.success) {
      const deterministic = await applyDeterministicAndRevalidate(
        lastValidation,
        fileMap,
        updateFile,
        deleteFile,
        onChatMessage,
        onStatus,
        { typeCheckOnly, runtimeSmoke, requirements }
      );
      if (deterministic.applied) {
        lastValidation = deterministic.validation;
        if (lastValidation.skipped) {
          onStatus(null);
          return {
            ran: true,
            succeeded: false,
            attempts: attempt,
            finalValidation: lastValidation,
            skippedReason: lastValidation.skipReason,
          };
        }
        if (lastValidation.success) {
          onChatMessage(
            sysMsg(
              `**Validation passed ✓** — deterministic fixes resolved the issue before auto-fix attempt ${attempt + 1}.`
            )
          );
          onStatus(null);
          return { ran: true, succeeded: true, attempts: attempt, finalValidation: lastValidation };
        }
      }
      attempt += 1;
      // Recompute the failing step against the LATEST validation (the
      // first iteration uses `firstFailedStep` above, subsequent
      // iterations need to re-derive from the post-attempt result).
      const currentFailedStep = lastValidation.steps.find(
        (s) => s.status === 'failed'
      ) ?? firstFailedStep;

      onStatus(`Auto-fix attempt ${attempt}/${maxAttempts} — calling AI…`);
      onChatMessage(
        sysMsg(`**Auto-fix attempt ${attempt}/${maxAttempts} started.**`)
      );

      const userPrompt = buildAutoFixUserPrompt({
        errors: lastValidation.errors,
        files: rebuildFiles(fileMap),
        attempt,
        maxAttempts,
        previousAttemptSummary,
        failedStep: currentFailedStep?.step,
        requirements,
        // Prefer the failing step's own log; fall back to the combined
        // log if the step didn't capture one.
        rawLog:
          currentFailedStep?.log && currentFailedStep.log.length > 0
            ? currentFailedStep.log
            : lastValidation.combinedLog,
        infrastructureError: currentFailedStep?.infrastructureError,
      });

      let aiResponseText = '';
      try {
        const aiResult = await getChatCompletion(
          AUTO_FIX_PROVIDER,
          AUTO_FIX_MODEL,
          [
            { role: 'system', content: AUTO_FIX_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          { max_completion_tokens: AUTO_FIX_MAX_TOKENS }
        );
        aiResponseText =
          (aiResult as any)?.choices?.[0]?.message?.content ?? '';
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed';
        onChatMessage(
          sysMsg(
            `**Auto-fix attempt ${attempt}/${maxAttempts} failed** — the AI request errored out (${msg}). Stopping the loop.`
          )
        );
        onStatus(null);
        return {
          ran: true,
          succeeded: false,
          attempts: attempt,
          finalValidation: lastValidation,
        };
      }

      if (!aiResponseText.trim()) {
        onChatMessage(
          sysMsg(
            `**Auto-fix attempt ${attempt}/${maxAttempts}** — the AI returned an empty response. Stopping the loop.`
          )
        );
        onStatus(null);
        return {
          ran: true,
          succeeded: false,
          attempts: attempt,
          finalValidation: lastValidation,
        };
      }

      onStatus(`Auto-fix attempt ${attempt}/${maxAttempts} — applying patches…`);
      const patchReport = applyAutoFixResponse(
        rebuildFiles(fileMap),
        aiResponseText,
        updateFile,
        addFile
      );

      if (!patchReport.mutated) {
        consecutiveNoPatchAttempts += 1;
        // A no-patch response wastes an attempt but is often recoverable:
        // re-prompt once with the raw log front-and-centre and a hard
        // "you MUST emit a patch" mandate. Only give up after two
        // consecutive no-patch responses (or when attempts run out).
        if (attempt < maxAttempts && consecutiveNoPatchAttempts < 2) {
          onChatMessage(
            sysMsg(
              `**Auto-fix attempt ${attempt}/${maxAttempts}** — the AI did not emit any usable patches. Retrying with the raw failure log and stronger instructions.`
            )
          );
          previousAttemptSummary = `Attempt ${attempt} produced NO usable patches — that is a failure. The validation output has NOT changed; the same raw log is included above. You MUST emit at least one targeted \`\`\`edit:<path>\`\`\` SEARCH/REPLACE patch (or a full-file fence for a genuinely missing file) derived from the raw log. Responding with prose, questions, or a bare \`SKIP:\` again will abort the loop.`;
          // Files are unchanged — skip re-validation and go straight to
          // the next AI attempt.
          continue;
        }
        onChatMessage(
          sysMsg(
            `**Auto-fix attempt ${attempt}/${maxAttempts}** — the AI did not emit any usable patches.\n\n_The loop has no way to make progress without patches, stopping here._`
          )
        );
        onStatus(null);
        return {
          ran: true,
          succeeded: false,
          attempts: attempt,
          finalValidation: lastValidation,
        };
      }
      consecutiveNoPatchAttempts = 0;

      const patchLines = patchReport.report.slice(0, 12).join('\n');
      onChatMessage(
        sysMsg(
          `**Auto-fix attempt ${attempt}/${maxAttempts} applied patches** — ${patchReport.applied} block(s) applied, ${patchReport.failed} failed, ${patchReport.createdCount} new file(s).\n\n\`\`\`\n${patchLines}\n\`\`\``
        )
      );

      previousAttemptSummary = `Attempt ${attempt} applied ${patchReport.applied} patches across ${patchReport.report.length} file action(s). ${patchReport.failed} block(s) failed to match. The validation result below shows what's still broken.`;

      // Re-validate.
      onStatus(`Re-validating after attempt ${attempt}…`);
      lastValidation = await runValidation(rebuildFiles(fileMap), {
        onStatus,
        typeCheckOnly,
        runtimeSmoke,
        requirements,
      });

      // Mid-loop sandbox failure (e.g. the re-install was aborted by
      // the WebContainer) — stop cleanly instead of burning attempts
      // against an environment problem.
      if (lastValidation.skipped) {
        onChatMessage(
          sysMsg(
            lastValidation.installFailure
              ? sandboxInstallFailureMessage(lastValidation.installFailure)
              : `**Validation could not re-run** — ${lastValidation.skipReason ?? 'sandbox unavailable'}. Stopping the auto-fix loop.`
          )
        );
        onStatus(null);
        return {
          ran: true,
          succeeded: false,
          attempts: attempt,
          finalValidation: lastValidation,
        };
      }

      if (lastValidation.success) {
        onChatMessage(
          sysMsg(
            `**Validation passed ✓** — imports, build, runtime smoke, and style audit are green after ${attempt} auto-fix attempt${attempt === 1 ? '' : 's'}.`
          )
        );
        onStatus(null);
        return { ran: true, succeeded: true, attempts: attempt, finalValidation: lastValidation };
      }

      // Still failing — surface the new error list before next loop.
      const stillFailing = lastValidation.errors.length;
      const stepNow = lastValidation.steps.find((s) => s.status === 'failed');
      const labelNow =
        stepNow?.step === 'type-check'
          ? 'Type-check still failing'
          : stepNow?.step === 'build'
          ? 'Build still failing'
          : stepNow?.step === 'import-integrity'
          ? 'Generated-file consistency audit still failing'
          : stepNow?.step === 'generated-quality'
          ? 'Generated quality audit still failing'
          : stepNow?.step === 'style-audit'
          ? 'Style audit still failing'
          : 'Validation still failing';
      onChatMessage(
        sysMsg(
          `**${labelNow}** after attempt ${attempt} (${stillFailing} error${stillFailing === 1 ? '' : 's'}).\n\n${summarizeErrors(lastValidation.errors)}${renderRawExcerpt(stepNow?.step ?? 'validation', stepNow?.log)}`
        )
      );
    }

    // Loop exhausted without success.
    onChatMessage(
      sysMsg(
        `**Auto-fix stopped after ${maxAttempts} attempts.** The build is still failing — review the errors above and patch manually, or send a new request to the Coding Agent with more context.`
      )
    );
    onStatus(null);
    return {
      ran: true,
      succeeded: false,
      attempts: maxAttempts,
      finalValidation: lastValidation,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    onChatMessage(
      sysMsg(
        `**Auto-fix loop crashed** — ${msg}. The loop has been reset; future requests will work normally.`
      )
    );
    onStatus(null);
    return {
      ran: true,
      succeeded: false,
      attempts: 0,
      skippedReason: `loop-crashed: ${msg}`,
    };
  } finally {
    loopInProgress = false;
  }
}
