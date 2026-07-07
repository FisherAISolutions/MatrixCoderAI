import { describe, expect, it } from 'vitest';
import {
  MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY,
  MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE,
  createMatrixBuildSuiteChatHandoff,
  readMatrixBuildSuiteChatHandoff,
  writeMatrixBuildSuiteChatHandoff,
} from '@/lib/build-suite/chatHandoff';
import { createBuildManifest } from '@/lib/build-suite/buildManifest';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('Matrix Build Suite chat handoff', () => {
  it('creates a handoff without changing the prompt text', () => {
    const prompt = 'Build a complete app.\nKeep routes exact.';
    const handoff = createMatrixBuildSuiteChatHandoff(
      prompt,
      new Date('2026-07-02T12:00:00.000Z')
    );

    expect(handoff).toEqual({
      source: 'matrix-build-suite',
      prompt,
      createdAt: '2026-07-02T12:00:00.000Z',
      message: MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE,
    });
  });

  it('writes, reads, and clears a prompt handoff once', () => {
    const storage = new MemoryStorage();
    const prompt = 'Generated Matrix Build Suite prompt';

    writeMatrixBuildSuiteChatHandoff(
      storage,
      prompt,
      new Date('2026-07-02T12:00:00.000Z')
    );

    const handoff = readMatrixBuildSuiteChatHandoff(storage);

    expect(handoff?.prompt).toBe(prompt);
    expect(handoff?.message).toBe(MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE);
    expect(storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY)).toBeNull();
    expect(readMatrixBuildSuiteChatHandoff(storage)).toBeNull();
  });

  it('writes and reads a Build Manifest without changing prompt handoff text', () => {
    const storage = new MemoryStorage();
    const prompt = 'Generated Matrix Build Suite prompt';
    const selection: BuildSuiteSelection = {
      appTypeId: 'personal-crm',
      appearance: 'dark',
      paletteId: 'dark-matrix-green',
      styleId: 'quiet-saas',
      layoutId: 'sidebar-workspace',
      componentIds: ['data-tables'],
      aiFeatureIds: ['smart-summaries'],
      integrationIds: ['local-storage'],
      animationId: 'minimal-motion',
      mobileId: 'responsive-web',
    };
    const buildManifest = createBuildManifest({
      selection,
      savedBuildId: 'saved-build-1',
      now: new Date('2026-07-07T12:00:00.000Z'),
    });

    writeMatrixBuildSuiteChatHandoff(
      storage,
      prompt,
      new Date('2026-07-02T12:00:00.000Z'),
      buildManifest
    );

    const handoff = readMatrixBuildSuiteChatHandoff(storage);

    expect(handoff?.prompt).toBe(prompt);
    expect(handoff?.buildManifest).toEqual(buildManifest);
    expect(handoff?.buildManifest?.source).toBe('saved-build');
    expect(handoff?.buildManifest?.selection.appTypeId).toBe('personal-crm');
  });

  it('rejects an empty prompt before writing', () => {
    const storage = new MemoryStorage();

    expect(() => writeMatrixBuildSuiteChatHandoff(storage, '   ')).toThrow(
      'Matrix Build Suite prompt is empty.'
    );
    expect(storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY)).toBeNull();
  });

  it('ignores and clears invalid handoff payloads', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY,
      JSON.stringify({ source: 'other-tool', prompt: 'nope' })
    );

    expect(readMatrixBuildSuiteChatHandoff(storage)).toBeNull();
    expect(storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY)).toBeNull();
  });
});
