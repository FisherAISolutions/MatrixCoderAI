import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STYLE_INSPIRATION_PREFILL_KEY,
  buildTemporaryStyleImagePath,
  consumeStylePromptForWorkspace,
  storeStylePromptForWorkspace,
  validateStyleImage,
} from '@/lib/styleInspiration';

describe('styleInspiration utilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts supported image files under the size limit', () => {
    expect(
      validateStyleImage({
        name: 'dashboard.png',
        type: 'image/png',
        size: 1024,
      })
    ).toBeNull();
  });

  it('rejects unsupported files', () => {
    expect(
      validateStyleImage({
        name: 'notes.svg',
        type: 'image/svg+xml',
        size: 1024,
      })
    ).toContain('PNG, JPG, or WebP');
  });

  it('builds user-scoped temporary storage paths with safe file names', () => {
    const path = buildTemporaryStyleImagePath('user-123', 'My Screen Shot!.PNG');
    expect(path).toMatch(/^user-123\/temp\/\d+-[a-z0-9]+-my-screen-shot.png$/);
  });

  it('stores and consumes a style prompt once', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });

    storeStylePromptForWorkspace('Build with this visual brief.');

    expect(store.get(STYLE_INSPIRATION_PREFILL_KEY)).toBe('Build with this visual brief.');
    expect(consumeStylePromptForWorkspace()).toBe('Build with this visual brief.');
    expect(consumeStylePromptForWorkspace()).toBeNull();
  });
});
