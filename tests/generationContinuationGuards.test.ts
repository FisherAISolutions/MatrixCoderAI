import { describe, expect, it } from 'vitest';
import {
  BATCH_CONTINUATION_RETRY_LIMIT,
  assessContinuationCompleteness,
  buildContinuationRetryKey,
  filterActionableMissingPaths,
  normalizeContinuationPaths,
} from '@/lib/generation/continuationGuards';

describe('generation continuation guards', () => {
  it('ignores tiny code expressions when a continuation wrote the requested file', () => {
    const result = assessContinuationCompleteness({
      rawMissingPaths: ['readProfile(value.profile)'],
      knownPaths: ['src/types/fitness.ts'],
      completedPaths: ['src/lib/fitness-storage.ts'],
    });

    expect(result.acceptCompletedOutput).toBe(true);
    expect(result.actionableMissingPaths).toEqual([]);
    expect(result.reason).toBe('non-actionable-fragments');
  });

  it('removes paths that were already written by the same continuation', () => {
    expect(
      filterActionableMissingPaths(
        ['src/lib/fitness-storage.ts'],
        ['src/types/fitness.ts', 'src/lib/fitness-storage.ts']
      )
    ).toEqual([]);
  });

  it('keeps real missing project paths actionable', () => {
    expect(
      filterActionableMissingPaths(
        ['src/lib/fitness-storage.ts', 'readProfile(value.profile)'],
        ['src/types/fitness.ts']
      )
    ).toEqual(['src/lib/fitness-storage.ts']);
  });

  it('accepts the latest complete file after the retry limit', () => {
    const result = assessContinuationCompleteness({
      rawMissingPaths: ['src/lib/fitness-storage.ts'],
      knownPaths: ['src/types/fitness.ts'],
      completedPaths: ['src/lib/fitness-storage.ts'],
      retryCount: BATCH_CONTINUATION_RETRY_LIMIT,
    });

    expect(result.acceptCompletedOutput).toBe(true);
    expect(result.reason).toBe('non-actionable-fragments');
  });

  it('keeps hard unclosed fences blocking even when a file was completed', () => {
    const result = assessContinuationCompleteness({
      rawMissingPaths: ['readProfile(value.profile)'],
      knownPaths: ['src/types/fitness.ts'],
      completedPaths: ['src/lib/fitness-storage.ts'],
      hasUnclosedFenceWithoutPath: true,
    });

    expect(result.acceptCompletedOutput).toBe(false);
    expect(result.reason).toBe('hard-unclosed-fence');
  });

  it('builds stable retry keys without preserving code fragments', () => {
    const key = buildContinuationRetryKey(1, {
      reason: 'missing readProfile(value.profile)',
      lastCompletePath: 'src/lib/fitness-storage.ts',
      missingPaths: ['readProfile(value.profile)'],
    });

    expect(key).toBe('1:src/lib/fitness-storage.ts');
  });

  it('normalizes only real project paths', () => {
    expect(
      normalizeContinuationPaths([
        './src/lib/fitness-storage.ts',
        'readProfile(value.profile)',
        'ts://path: src/lib/fitness-storage.ts',
      ])
    ).toEqual(['src/lib/fitness-storage.ts']);
  });
});
