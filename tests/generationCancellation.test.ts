import { describe, expect, it, vi } from 'vitest';
import {
  createAbortError,
  createGenerationCancellationScope,
  isAbortLikeError,
  throwIfCancelled,
} from '@/lib/generation/cancellation';

describe('generation cancellation scope', () => {
  it('clears pending timers when cancelled', () => {
    vi.useFakeTimers();
    try {
      const scope = createGenerationCancellationScope('test-scope');
      const callback = vi.fn();

      scope.setTimer(callback, 1000);
      scope.cancel('Cancelled by user');
      vi.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();
      expect(scope.isCancelled()).toBe(true);
      expect(String(scope.signal.reason)).toBe('Cancelled by user');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not schedule new timers after cancellation', () => {
    vi.useFakeTimers();
    try {
      const scope = createGenerationCancellationScope('cancelled-scope');
      const callback = vi.fn();

      scope.cancel();
      const timer = scope.setTimer(callback, 10);
      vi.advanceTimersByTime(10);

      expect(timer).toBeNull();
      expect(callback).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws and detects abort-like errors', () => {
    const controller = new AbortController();
    controller.abort('Cancelled by user');

    expect(() => throwIfCancelled(controller.signal)).toThrow(/Cancelled by user/);
    expect(isAbortLikeError(createAbortError())).toBe(true);
    expect(isAbortLikeError(new Error('request aborted'))).toBe(true);
    expect(isAbortLikeError(new Error('ordinary failure'))).toBe(false);
  });
});
