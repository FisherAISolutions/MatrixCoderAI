import { sanitizeProjectPath } from '@/lib/repo/extractors';

export const BATCH_CONTINUATION_RETRY_LIMIT = 2;

export interface ContinuationAssessmentInput {
  rawMissingPaths: Array<string | null | undefined>;
  knownPaths: Iterable<string>;
  completedPaths: Iterable<string>;
  hasUnclosedFenceWithoutPath?: boolean;
  retryCount?: number;
}

export interface ContinuationAssessment {
  acceptCompletedOutput: boolean;
  actionableMissingPaths: string[];
  reason:
    | 'actionable-missing-paths'
    | 'hard-unclosed-fence'
    | 'non-actionable-fragments'
    | 'retry-limit';
}

export function normalizeContinuationPaths(
  paths: Array<string | null | undefined>
): string[] {
  const out: string[] = [];
  for (const raw of paths) {
    if (!raw) continue;
    const clean = sanitizeProjectPath(raw);
    if (!clean || out.includes(clean)) continue;
    out.push(clean);
  }
  return out;
}

export function filterActionableMissingPaths(
  paths: Array<string | null | undefined>,
  knownPaths: Iterable<string>
): string[] {
  const known = new Set(Array.from(knownPaths).map((path) => sanitizeProjectPath(path) ?? path));
  return normalizeContinuationPaths(paths).filter((path) => !known.has(path));
}

export function buildContinuationRetryKey(
  batchIndex: number,
  continuation: {
    lastCompletePath?: string | null;
    reason: string;
    missingPaths?: string[];
  }
): string {
  const missing = normalizeContinuationPaths(continuation.missingPaths ?? []);
  const target =
    missing.join('|') ||
    sanitizeProjectPath(continuation.lastCompletePath ?? '') ||
    continuation.reason.replace(/\s+/g, ' ').slice(0, 120);
  return `${batchIndex}:${target}`;
}

export function assessContinuationCompleteness(
  input: ContinuationAssessmentInput
): ContinuationAssessment {
  const completed = normalizeContinuationPaths(Array.from(input.completedPaths));
  const known = [
    ...Array.from(input.knownPaths),
    ...completed,
  ];
  const actionableMissingPaths = filterActionableMissingPaths(
    input.rawMissingPaths,
    known
  );

  if (input.hasUnclosedFenceWithoutPath) {
    return {
      acceptCompletedOutput: false,
      actionableMissingPaths,
      reason: 'hard-unclosed-fence',
    };
  }

  if (completed.length > 0 && actionableMissingPaths.length === 0) {
    return {
      acceptCompletedOutput: true,
      actionableMissingPaths,
      reason: 'non-actionable-fragments',
    };
  }

  if (
    completed.length > 0 &&
    (input.retryCount ?? 0) >= BATCH_CONTINUATION_RETRY_LIMIT
  ) {
    return {
      acceptCompletedOutput: true,
      actionableMissingPaths,
      reason: 'retry-limit',
    };
  }

  return {
    acceptCompletedOutput: false,
    actionableMissingPaths,
    reason: 'actionable-missing-paths',
  };
}
