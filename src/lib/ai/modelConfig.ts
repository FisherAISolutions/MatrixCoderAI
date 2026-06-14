/**
 * Matrix Coder AI central model configuration.
 *
 * PRIMARY_MODEL powers Planning, Coding, Reviewing, and Orchestrator.
 * AUTO_FIX_MODEL powers the validation repair loop.
 *
 * Override at deploy time without changing code:
 *
 *   NEXT_PUBLIC_AI_MODEL=gpt-5.5
 *   NEXT_PUBLIC_AI_AUTOFIX_MODEL=gpt-5.5
 */

const PRIMARY_DEFAULT = 'gpt-5.5';

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

