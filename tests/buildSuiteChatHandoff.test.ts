import { describe, expect, it } from 'vitest';
import {
  MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY,
  MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE,
  createMatrixBuildSuiteChatHandoff,
  peekMatrixBuildSuiteChatHandoff,
  readMatrixBuildSuiteChatHandoff,
  writeMatrixBuildSuiteChatHandoff,
} from '@/lib/build-suite/chatHandoff';
import { createBuildManifest } from '@/lib/build-suite/buildManifest';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';
import { createBlueprintDraftFromManifest } from '@/lib/blueprint-studio/blueprintDraft';
import { createBuildContract } from '@/lib/build-contract';
import { resolveCapabilities } from '@/lib/capabilities';
import { createIntelligenceCore } from '@/lib/intelligence-core';
import {
  createArchitectDraft,
  updateArchitectAnswer,
} from '@/lib/matrix-ai-architect';

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

  it('writes and reads approved structured planning state without changing prompt text', () => {
    const storage = new MemoryStorage();
    const prompt = 'Build from the approved Blueprint.';
    const selection: BuildSuiteSelection = {
      appTypeId: 'personal-crm',
      appearance: 'dark',
      paletteId: 'dark-matrix-green',
      styleId: 'quiet-saas',
      layoutId: 'sidebar-workspace',
      componentIds: ['data-tables'],
      aiFeatureIds: [],
      integrationIds: ['local-storage'],
      animationId: 'minimal-motion',
      mobileId: 'responsive-web',
    };
    const buildManifest = createBuildManifest({
      selection,
      now: new Date('2026-07-07T12:00:00.000Z'),
    });
    let architectDraft = createArchitectDraft({
      projectId: 'project-1',
      projectName: 'Founder CRM',
      now: new Date('2026-07-07T12:01:00.000Z'),
    });
    architectDraft = updateArchitectAnswer(
      architectDraft,
      'appIdea',
      'Build a personal CRM with contacts, companies, tasks, and pipeline.',
      new Date('2026-07-07T12:02:00.000Z')
    );
    const blueprintDraft = createBlueprintDraftFromManifest(
      buildManifest,
      new Date('2026-07-07T12:03:00.000Z')
    );
    const buildContract = createBuildContract({
      projectId: 'project-1',
      architectDraft,
      buildManifest,
      blueprintDraft,
      now: new Date('2026-07-07T12:04:00.000Z'),
    });
    const capabilityResolution = resolveCapabilities(buildContract, {
      now: new Date('2026-07-07T12:05:00.000Z'),
    });
    const intelligenceCore = createIntelligenceCore({
      projectId: 'project-1',
      architectDraft,
      buildManifest,
      blueprintDraft,
      buildContract,
      capabilityResolution,
      now: new Date('2026-07-07T12:06:00.000Z'),
    });

    writeMatrixBuildSuiteChatHandoff(
      storage,
      prompt,
      new Date('2026-07-07T12:07:00.000Z'),
      buildManifest,
      blueprintDraft,
      {
        architectDraft,
        buildContract,
        capabilityResolution,
        intelligenceCore,
      }
    );

    const handoff = readMatrixBuildSuiteChatHandoff(storage);

    expect(handoff?.prompt).toBe(prompt);
    expect(handoff?.buildManifest).toEqual(buildManifest);
    expect(handoff?.blueprintDraft?.id).toBe(blueprintDraft.id);
    expect(handoff?.architectDraft?.id).toBe(architectDraft.id);
    expect(handoff?.buildContract?.id).toBe(buildContract.id);
    expect(handoff?.capabilityResolution?.contractId).toBe(buildContract.id);
    expect(handoff?.intelligenceCore?.projectId).toBe('project-1');
  });

  it('peeks at a handoff without consuming it', () => {
    const storage = new MemoryStorage();
    const prompt = 'Prompt ready for dashboard status';

    writeMatrixBuildSuiteChatHandoff(
      storage,
      prompt,
      new Date('2026-07-02T12:00:00.000Z')
    );

    const peeked = peekMatrixBuildSuiteChatHandoff(storage);

    expect(peeked?.prompt).toBe(prompt);
    expect(storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY)).not.toBeNull();
    expect(readMatrixBuildSuiteChatHandoff(storage)?.prompt).toBe(prompt);
    expect(storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY)).toBeNull();
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
