import { describe, expect, it } from 'vitest';
import {
  addIntelligenceRecord,
  allIntelligenceRecords,
  createEmptyIntelligenceCore,
  resolveIntelligenceDecision,
} from '@/lib/intelligence-core';
import {
  applyArchitectConversationEnvelopeToCore,
  applyArchitectConversationTurn,
  buildArchitectIntelligencePacket,
  createArchitectConversationResponseEnvelope,
  createArchitectDraft,
  ensureArchitectConversation,
  loadArchitectProjectState,
  parseArchitectConversationResponseEnvelope,
  recordArchitectRecommendationDecision,
  updateArchitectAnswer,
  type ArchitectDraft,
} from '@/lib/matrix-ai-architect';
import {
  MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY,
  saveMatrixProjectWorkspaceContext,
} from '@/lib/projects/projectStore';

const NOW = new Date('2026-07-22T12:00:00.000Z');

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

function turnEnvelope(draft: ArchitectDraft, userInput: string) {
  const conversation = draft.conversation!;
  const result = applyArchitectConversationTurn({
    draft,
    conversation,
    userInput,
    now: NOW,
    streamVersion: conversation.streamVersion,
  });
  return {
    result,
    envelope: createArchitectConversationResponseEnvelope({
      beforeDraft: draft,
      afterDraft: result.draft,
      conversation: result.conversation,
      extraction: result.extraction,
      userInput,
      naturalLanguageResponse:
        result.conversation.messages.at(-1)?.content ?? 'Architect response.',
      now: NOW,
    }),
  };
}

describe('Matrix AI Architect Intelligence Core integration', () => {
  it('builds an Architect Intelligence Packet with planning context only', () => {
    let core = createEmptyIntelligenceCore('project-1', NOW);
    core = addIntelligenceRecord(core, {
      domain: 'project',
      category: 'goal',
      key: 'project-purpose',
      value: 'Build a CRM for founders',
      source: { kind: 'user-approved' },
      status: 'approved',
      userApproved: true,
      now: NOW,
    });
    core = addIntelligenceRecord(core, {
      domain: 'engineering',
      category: 'repository-fact',
      key: 'src/app/page.tsx',
      value: 'repository implementation detail',
      source: { kind: 'repository' },
      status: 'verified',
      now: NOW,
    });

    const packet = buildArchitectIntelligencePacket(core, null, NOW);

    expect(packet.kind).toBe('architect');
    expect(packet.projectContext.map((record) => record.key)).toContain(
      'project-purpose'
    );
    expect(packet.relevantMemory.some((record) => record.domain === 'engineering')).toBe(
      false
    );
    expect(packet.visionPrinciples.length).toBeGreaterThan(0);
  });

  it('updates Architect Draft and Brain records together from a conversation turn', () => {
    const draft = ensureArchitectConversation(
      createArchitectDraft({ projectId: 'project-1', now: NOW }),
      NOW
    );
    const core = createEmptyIntelligenceCore('project-1', NOW);
    const { result, envelope } = turnEnvelope(
      draft,
      'A booking scheduler for barbers and small salons.'
    );

    const applied = applyArchitectConversationEnvelopeToCore(core, envelope, {
      expectedProjectId: 'project-1',
    });

    expect(result.draft.answers.appIdea).toContain('booking scheduler');
    expect(applied.applied).toBe(true);
    expect(
      resolveIntelligenceDecision(applied.core, {
        domain: 'project',
        category: 'goal',
        key: 'project-purpose',
      }).record?.value
    ).toContain('booking scheduler');
  });

  it('stores accepted and rejected recommendation decisions', () => {
    let draft = ensureArchitectConversation(
      createArchitectDraft({ projectId: 'project-1', now: NOW }),
      NOW
    );
    draft = recordArchitectRecommendationDecision(
      draft,
      'database: Supabase Postgres',
      'accepted',
      undefined,
      NOW
    );
    draft = recordArchitectRecommendationDecision(
      draft,
      'billing: Stripe Checkout',
      'rejected',
      undefined,
      NOW
    );
    const core = createEmptyIntelligenceCore('project-1', NOW);
    const envelope = createArchitectConversationResponseEnvelope({
      beforeDraft: draft,
      afterDraft: draft,
      conversation: draft.conversation!,
      extraction: {
        updatedAnswers: {},
        newRequirements: [],
        rejectedRecommendations: ['billing: Stripe Checkout'],
        unresolvedQuestions: [],
        confidence: 92,
      },
      userInput: 'Record recommendation decisions',
      naturalLanguageResponse: 'Recommendation decisions recorded.',
      now: NOW,
    });

    const applied = applyArchitectConversationEnvelopeToCore(core, envelope, {
      expectedProjectId: 'project-1',
    });
    const records = allIntelligenceRecords(applied.core);

    expect(
      records.some(
        (record) =>
          record.key === 'accepted-recommendation-database-supabase-postgres' &&
          record.status === 'approved'
      )
    ).toBe(true);
    expect(
      records.some(
        (record) =>
          record.key === 'rejected-recommendation-billing-stripe-checkout' &&
          record.status === 'rejected'
      )
    ).toBe(true);
  });

  it('does not repeat a rejected recommendation in the next conversation response', () => {
    let draft = ensureArchitectConversation(
      createArchitectDraft({ projectId: 'project-1', now: NOW }),
      NOW
    );
    draft = updateArchitectAnswer(draft, 'accountsRequired', true, NOW);
    draft = updateArchitectAnswer(draft, 'investmentLevel', 'professional', NOW);
    draft = recordArchitectRecommendationDecision(
      draft,
      'database: Supabase Postgres',
      'rejected',
      undefined,
      NOW
    );

    const result = applyArchitectConversationTurn({
      draft,
      conversation: draft.conversation!,
      userInput: 'The main users are solo founders.',
      now: new Date('2026-07-22T12:01:00.000Z'),
      streamVersion: draft.conversation!.streamVersion,
    });

    expect(result.conversation.messages.at(-1)?.content).not.toContain(
      'Supabase Postgres'
    );
  });

  it('supersedes older product decisions when the user corrects them', () => {
    let draft = ensureArchitectConversation(
      createArchitectDraft({ projectId: 'project-1', now: NOW }),
      NOW
    );
    draft = updateArchitectAnswer(draft, 'payments', true, NOW);
    let core = createEmptyIntelligenceCore('project-1', NOW);
    core = addIntelligenceRecord(core, {
      domain: 'product',
      category: 'decision',
      key: 'payments',
      value: true,
      source: { kind: 'architect' },
      status: 'approved',
      now: NOW,
    });

    const { envelope } = turnEnvelope(draft, 'Actually no payments for now.');
    const applied = applyArchitectConversationEnvelopeToCore(core, envelope, {
      expectedProjectId: 'project-1',
    });
    const decision = resolveIntelligenceDecision(applied.core, {
      domain: 'product',
      category: 'decision',
      key: 'payments',
    });

    expect(decision.record?.value).toBe(false);
    expect(decision.record?.source.kind).toBe('user-correction');
    expect(
      applied.core.product.records.some(
        (record) => record.value === true && record.replacedBy
      )
    ).toBe(true);
  });

  it('ignores stale stream envelopes and envelopes from another project', () => {
    const draft = ensureArchitectConversation(
      createArchitectDraft({ projectId: 'project-1', now: NOW }),
      NOW
    );
    const core = createEmptyIntelligenceCore('project-1', NOW);
    const { envelope } = turnEnvelope(draft, 'A CRM for consultants.');

    expect(
      applyArchitectConversationEnvelopeToCore(core, {
        ...envelope,
        streamVersion: 1,
      }, {
        expectedProjectId: 'project-1',
        expectedStreamVersion: 2,
      }).skipped
    ).toBe(true);
    expect(
      applyArchitectConversationEnvelopeToCore(core, {
        ...envelope,
        projectId: 'project-2',
      }, {
        expectedProjectId: 'project-1',
      }).skipped
    ).toBe(true);
  });

  it('does not corrupt state when structured envelope parsing fails', () => {
    const parsed = parseArchitectConversationResponseEnvelope(
      '{"naturalLanguageResponse":"I can still answer safely."}'
    );

    expect(parsed.envelope).toBeNull();
    expect(parsed.naturalLanguageResponse).toBe('I can still answer safely.');
    expect(parsed.error).toContain('Malformed');
  });

  it('excludes likely secrets from Brain records', () => {
    const draft = ensureArchitectConversation(
      createArchitectDraft({ projectId: 'project-1', now: NOW }),
      NOW
    );
    const next = updateArchitectAnswer(
      draft,
      'customRequirements',
      'Use API key sk-abcdefghijklmnopqrstuvwxyz123456',
      NOW
    );
    const envelope = createArchitectConversationResponseEnvelope({
      beforeDraft: draft,
      afterDraft: next,
      conversation: next.conversation!,
      extraction: {
        updatedAnswers: {
          customRequirements: 'Use API key sk-abcdefghijklmnopqrstuvwxyz123456',
        },
        newRequirements: [],
        rejectedRecommendations: [],
        unresolvedQuestions: [],
        confidence: 80,
      },
      userInput: 'Use API key sk-abcdefghijklmnopqrstuvwxyz123456',
      naturalLanguageResponse: 'That looks like a secret.',
      now: NOW,
    });

    const applied = applyArchitectConversationEnvelopeToCore(
      createEmptyIntelligenceCore('project-1', NOW),
      envelope,
      { expectedProjectId: 'project-1' }
    );

    expect(applied.warnings.join(' ')).toContain('secret');
    expect(
      JSON.stringify(allIntelligenceRecords(applied.core))
    ).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('initializes Intelligence Core for older Architect projects without one', () => {
    const storage = createMemoryStorage();
    const draft = ensureArchitectConversation(
      createArchitectDraft({
        projectId: 'older-project',
        projectName: 'Older Project',
        now: NOW,
      }),
      NOW
    );
    saveMatrixProjectWorkspaceContext(storage, {
      currentProjectId: 'older-project',
      currentProjectName: 'Older Project',
      architectDraft: draft,
    });

    const rawBefore = storage.getItem(MATRIX_PROJECTS_WORKSPACE_CONTEXT_KEY);
    expect(rawBefore).not.toContain('intelligenceCore');

    const state = loadArchitectProjectState(storage, NOW);

    expect(state.intelligenceCore.projectId).toBe('older-project');
    expect(state.draft.conversation?.messages).toHaveLength(1);
  });
});
