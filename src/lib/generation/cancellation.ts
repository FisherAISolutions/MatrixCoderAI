export type CancellationTimer = ReturnType<typeof setTimeout>;

export interface GenerationCancellationScope {
  id: string;
  controller: AbortController;
  signal: AbortSignal;
  isCancelled: () => boolean;
  cancel: (reason?: string) => void;
  setTimer: (callback: () => void, delayMs: number) => CancellationTimer | null;
  clearTimers: () => void;
}

let scopeSequence = 0;

export function createAbortError(message = 'Cancelled by user'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      /aborted|cancelled|canceled/i.test(error.message)
    );
  }
  return /aborted|cancelled|canceled/i.test(String(error));
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(String(signal.reason ?? 'Cancelled by user'));
  }
}

export function createGenerationCancellationScope(
  id = `generation-${Date.now()}-${++scopeSequence}`
): GenerationCancellationScope {
  const controller = new AbortController();
  const timers = new Set<CancellationTimer>();

  const clearTimers = () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
  };

  const scope: GenerationCancellationScope = {
    id,
    controller,
    signal: controller.signal,
    isCancelled: () => controller.signal.aborted,
    cancel: (reason = 'Cancelled by user') => {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
      clearTimers();
    },
    setTimer: (callback, delayMs) => {
      if (controller.signal.aborted) return null;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!controller.signal.aborted) {
          callback();
        }
      }, delayMs);
      timers.add(timer);
      return timer;
    },
    clearTimers,
  };

  controller.signal.addEventListener('abort', clearTimers, { once: true });
  return scope;
}
