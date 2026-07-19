import { describe, expect, it } from 'vitest';
import type { BuildManifest } from '@/lib/build-suite/buildManifest';
import { loadBlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import {
  applyArchitectBlueprintHandoff,
  createArchitectDraft,
  createBlueprintDraftFromArchitectDraft,
  getArchitectServiceRecommendations,
  updateArchitectAnswer,
  type ArchitectDraft,
} from '@/lib/matrix-ai-architect';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function withAnswers(draft: ArchitectDraft): ArchitectDraft {
  let next = updateArchitectAnswer(
    draft,
    'appIdea',
    'Build a personal CRM for founders with contacts, companies, tasks, and pipeline.',
    new Date('2026-07-19T10:01:00.000Z')
  );
  next = updateArchitectAnswer(next, 'crm', true, new Date('2026-07-19T10:02:00.000Z'));
  next = updateArchitectAnswer(
    next,
    'accountsRequired',
    true,
    new Date('2026-07-19T10:03:00.000Z')
  );
  return next;
}

describe('Matrix AI Architect domain logic', () => {
  it('changes service recommendations when budget tier changes', () => {
    const base = withAnswers(
      createArchitectDraft({ now: new Date('2026-07-19T10:00:00.000Z') })
    );
    const freeFirst = updateArchitectAnswer(
      base,
      'investmentLevel',
      'free-first',
      new Date('2026-07-19T10:04:00.000Z')
    );
    const professional = updateArchitectAnswer(
      base,
      'investmentLevel',
      'professional',
      new Date('2026-07-19T10:05:00.000Z')
    );

    expect(
      getArchitectServiceRecommendations(freeFirst.answers).some((item) =>
        /localStorage/i.test(item.recommendedOption)
      )
    ).toBe(true);
    expect(
      getArchitectServiceRecommendations(professional.answers).some((item) =>
        /Supabase Postgres/i.test(item.recommendedOption)
      )
    ).toBe(true);
  });

  it('keeps free-first plans away from paid-only defaults when suitable', () => {
    const draft = updateArchitectAnswer(
      createArchitectDraft({ now: new Date('2026-07-19T10:00:00.000Z') }),
      'investmentLevel',
      'free-first',
      new Date('2026-07-19T10:01:00.000Z')
    );

    const recommendations = getArchitectServiceRecommendations(draft.answers);
    expect(recommendations.every((item) => item.hasFreeTier)).toBe(true);
    expect(recommendations.some((item) => item.category === 'billing')).toBe(false);
  });

  it('allows professional and growth tiers to recommend managed services', () => {
    let draft = withAnswers(
      createArchitectDraft({ now: new Date('2026-07-19T10:00:00.000Z') })
    );
    draft = updateArchitectAnswer(
      draft,
      'investmentLevel',
      'growth',
      new Date('2026-07-19T10:04:00.000Z')
    );

    const recommendations = getArchitectServiceRecommendations(draft.answers);
    expect(recommendations.map((item) => item.recommendedOption)).toEqual(
      expect.arrayContaining(['Supabase Postgres', 'Supabase Auth', 'Vercel'])
    );
  });

  it('hands off an Architect Draft into a populated Blueprint Draft', () => {
    const storage = createMemoryStorage();
    const draft = withAnswers(
      createArchitectDraft({ now: new Date('2026-07-19T10:00:00.000Z') })
    );

    const result = applyArchitectBlueprintHandoff(
      storage,
      draft,
      null,
      new Date('2026-07-19T10:10:00.000Z')
    );
    const stored = loadBlueprintDraft(storage);

    expect(result.skipped).toBe(false);
    expect(stored?.projectName).toContain('personal CRM');
    expect(stored?.routes.map((route) => route.path)).toEqual(
      expect.arrayContaining(['/', '/contacts', '/companies', '/tasks', '/pipeline'])
    );
  });

  it('does not mutate an existing Build Manifest while creating Blueprint data', () => {
    const manifest = {
      metadataVersion: 'test',
      selection: { appTypeId: 'crm' },
      appType: { id: 'crm', label: 'CRM' },
      components: [],
      integrations: [],
      navigation: { inferredPattern: 'crm' },
    } as unknown as BuildManifest;
    const before = JSON.stringify(manifest);
    const draft = createArchitectDraft({
      sourceBuildManifest: manifest,
      now: new Date('2026-07-19T10:00:00.000Z'),
    });

    createBlueprintDraftFromArchitectDraft(draft);

    expect(JSON.stringify(manifest)).toBe(before);
  });

  it('does not overwrite a newer Blueprint Draft with stale Architect handoff', () => {
    const storage = createMemoryStorage();
    const draft = withAnswers(
      createArchitectDraft({ now: new Date('2026-07-19T10:00:00.000Z') })
    );
    const newerBlueprint = {
      ...createBlueprintDraftFromArchitectDraft(draft, new Date('2026-07-19T10:10:00.000Z')),
      updatedAt: '2026-07-19T11:00:00.000Z',
      projectName: 'Newer Blueprint',
    };

    const result = applyArchitectBlueprintHandoff(
      storage,
      draft,
      newerBlueprint,
      new Date('2026-07-19T10:20:00.000Z')
    );

    expect(result.skipped).toBe(true);
    expect(result.blueprintDraft.projectName).toBe('Newer Blueprint');
    expect(loadBlueprintDraft(storage)).toBeNull();
  });
});
