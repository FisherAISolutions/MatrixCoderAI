/**
 * Matrix Coder AI — central model configuration.
 *
 * 2026-01 quality-upgrade pass — single source of truth for which OpenAI
 * model powers each agent. Previously these were hardcoded as `'gpt-4o'`
 * in two places (ChatComposer + autoFixLoop), which made it tricky to
 * upgrade safely.
 *
 * Defaults are chosen to maximize Next.js 15 / App Router correctness:
 *
 *   PRIMARY_MODEL   — used by the Planning, Coding, Reviewing, and
 *                     Orchestrator agents. Default: gpt-4.1. This is a
 *                     significant upgrade over gpt-4o for code
 *                     generation:
 *                       - far better Next.js 15 / App Router knowledge
 *                         (no <a> inside <Link>, metadata export, 'use
 *                         client' awareness, App Router API routes)
 *                       - better SEARCH/REPLACE compliance — fewer
 *                         missing-marker errors observed in practice
 *                       - tighter TypeScript output (no implicit any,
 *                         strict null checks respected)
 *                     gpt-4.1 is fully supported by `openai@4.x` SDK
 *                     and accepts the same `max_tokens` parameter.
 *
 *   AUTO_FIX_MODEL  — used by the auto-fix repair loop. Default: same
 *                     as PRIMARY_MODEL. We deliberately use a powerful
 *                     model here because the loop only fires when
 *                     validation has already failed, and a smarter
 *                     model resolves failures in fewer attempts.
 *
 * Override at deploy time without changing code:
 *
 *   NEXT_PUBLIC_AI_MODEL=gpt-5             # any OpenAI model id
 *   NEXT_PUBLIC_AI_AUTOFIX_MODEL=gpt-4.1   # falls back to PRIMARY_MODEL
 *
 * Recommended future upgrade path:
 *
 *   - gpt-5.x family (when available on the user's API plan) gives a
 *     further jump in reasoning quality. To try it: set
 *     NEXT_PUBLIC_AI_MODEL=gpt-5 and rebuild. No code change required.
 */

const PRIMARY_DEFAULT = 'gpt-4.1';

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const v = process.env?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export const PRIMARY_MODEL: string =
  readEnv('NEXT_PUBLIC_AI_MODEL') ?? PRIMARY_DEFAULT;

export const AUTO_FIX_MODEL: string =
  readEnv('NEXT_PUBLIC_AI_AUTOFIX_MODEL') ?? PRIMARY_MODEL;

/** Provider id passed to the chat-completion API route. */
export const AI_PROVIDER = 'OPEN_AI';
