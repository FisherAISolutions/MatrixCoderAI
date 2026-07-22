import { describe, expect, it } from 'vitest';
import {
  applyArchitectConversationTurn,
  approveArchitectConversationForBlueprint,
  createArchitectConversation,
  createArchitectDraft,
  deserializeArchitectDraft,
  ensureArchitectConversation,
  getArchitectConversationReadiness,
  recordArchitectRecommendationDecision,
  recordArchitectStructuredEdit,
  serializeArchitectDraft,
  setArchitectConversationExperienceLevel,
  updateArchitectAnswer,
} from '@/lib/matrix-ai-architect';

const NOW = new Date('2026-07-20T12:00:00.000Z');

describe('Matrix AI Architect conversation', () => {
  it('starts with a first greeting and one clear question', () => {
    const draft = createArchitectDraft({ now: NOW });
    const conversation = createArchitectConversation(draft, NOW);

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0].role).toBe('architect');
    expect(conversation.messages[0].content).toContain('Welcome to Matrix AI Architect');
    expect(conversation.messages[0].content).toContain('What are you building?');
    expect(conversation.activeTopicId).toBe('appIdea');
  });

  it('updates structured answers from a one-question flow', () => {
    const draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    const conversation = draft.conversation!;

    const result = applyArchitectConversationTurn({
      draft,
      conversation,
      userInput: 'A fitness tracker for coaches and gym members.',
      now: new Date('2026-07-20T12:01:00.000Z'),
      streamVersion: conversation.streamVersion,
    });

    expect(result.stale).toBe(false);
    expect(result.draft.answers.appIdea).toContain('fitness tracker');
    expect(result.conversation.answeredTopicIds).toContain('appIdea');
    expect(result.conversation.activeTopicId).toBe('investmentLevel');
    expect(result.conversation.messages.at(-1)?.content).toContain(
      'free or low-cost'
    );
    expect(result.conversation.messages.at(-1)?.content).not.toContain(
      'Blueprint review'
    );
    expect(getArchitectConversationReadiness(result.draft).readyForBlueprint).toBe(
      false
    );
  });

  it('asks a follow-up instead of writing ambiguous answers', () => {
    const draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    const conversation = draft.conversation!;

    const result = applyArchitectConversationTurn({
      draft,
      conversation,
      userInput: 'yes',
      now: new Date('2026-07-20T12:02:00.000Z'),
      streamVersion: conversation.streamVersion,
    });

    expect(result.draft.answers.appIdea).toBe('');
    expect(result.conversation.activeTopicId).toBe('appIdea');
    expect(result.conversation.unresolvedQuestions.at(-1)?.reason).toContain(
      'too ambiguous'
    );
  });

  it('makes budget-aware recommendations for free-first planning', () => {
    let draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    let conversation = draft.conversation!;

    let result = applyArchitectConversationTurn({
      draft,
      conversation,
      userInput: 'A booking scheduler for solo consultants.',
      now: new Date('2026-07-20T12:03:00.000Z'),
      streamVersion: conversation.streamVersion,
    });
    draft = result.draft;
    conversation = result.conversation;

    result = applyArchitectConversationTurn({
      draft,
      conversation,
      userInput: 'Free-first prototype, I want to avoid paid tools at launch.',
      now: new Date('2026-07-20T12:04:00.000Z'),
      streamVersion: conversation.streamVersion,
    });

    expect(result.draft.answers.investmentLevel).toBe('free-first');
    expect(result.draft.specification.recommendations.some((item) =>
      item.title.toLowerCase().includes('free-first')
    )).toBe(true);
    expect(result.conversation.messages.at(-1)?.content.toLowerCase()).toContain(
      'free'
    );
  });

  it('allows conversational correction of an earlier answer', () => {
    let draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    draft = updateArchitectAnswer(draft, 'payments', true, NOW);
    draft = updateArchitectAnswer(draft, 'integrations', ['stripe'], NOW);
    const conversation = draft.conversation!;

    const result = applyArchitectConversationTurn({
      draft,
      conversation,
      userInput: 'Actually no payments or Stripe for now.',
      now: new Date('2026-07-20T12:05:00.000Z'),
      streamVersion: conversation.streamVersion,
    });

    expect(result.draft.answers.payments).toBe(false);
    expect(result.draft.answers.integrations).not.toContain('stripe');
  });

  it('survives refresh through Architect Draft serialization', () => {
    const draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    const restored = deserializeArchitectDraft(serializeArchitectDraft(draft));

    expect(restored?.conversation?.messages[0].content).toContain(
      'Welcome to Matrix AI Architect'
    );
    expect(restored?.conversation?.draftId).toBe(draft.id);
  });

  it('ignores stale stream callbacks', () => {
    const draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    const conversation = draft.conversation!;

    const result = applyArchitectConversationTurn({
      draft,
      conversation,
      userInput: 'A CRM for founders.',
      now: new Date('2026-07-20T12:06:00.000Z'),
      streamVersion: conversation.streamVersion - 1,
    });

    expect(result.stale).toBe(true);
    expect(result.draft.answers.appIdea).toBe('');
  });

  it('requires explicit approval before Blueprint handoff', () => {
    let draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    draft = updateArchitectAnswer(draft, 'appIdea', 'A CRM for small teams', NOW);
    draft = updateArchitectAnswer(draft, 'primaryUsers', 'small business owners', NOW);
    draft = recordArchitectStructuredEdit(draft, 'investmentLevel', 'professional', NOW);

    expect(draft.conversation?.approvedForBlueprint).toBe(false);

    const approved = approveArchitectConversationForBlueprint(draft, NOW);

    expect(approved.conversation?.approvedForBlueprint).toBe(true);
    expect(approved.conversation?.messages.at(-1)?.content).toContain('approved');
  });

  it('supports advanced user mode without changing generation behavior', () => {
    let draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    draft = setArchitectConversationExperienceLevel(draft, 'advanced', NOW);

    expect(draft.conversation?.experienceLevel).toBe('advanced');

    const result = applyArchitectConversationTurn({
      draft,
      conversation: draft.conversation!,
      userInput: 'A SaaS analytics dashboard for product teams.',
      now: new Date('2026-07-20T12:07:00.000Z'),
      streamVersion: draft.conversation!.streamVersion,
    });

    expect(result.conversation.messages.at(-1)?.content.toLowerCase()).toContain(
      'recommend'
    );
    expect(result.conversation.approvedForBlueprint).toBe(false);
  });

  it('knows when enough structured data exists for an initial Build Contract', () => {
    let draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    draft = updateArchitectAnswer(draft, 'appIdea', 'A personal CRM', NOW);
    draft = updateArchitectAnswer(draft, 'primaryUsers', 'solo founders', NOW);
    draft = updateArchitectAnswer(draft, 'database', 'cloud-database', NOW);
    draft = updateArchitectAnswer(draft, 'deploymentTarget', 'vercel', NOW);
    draft = {
      ...draft,
      conversation: {
        ...draft.conversation!,
        answeredTopicIds: [
          'appIdea',
          'investmentLevel',
          'primaryUsers',
          'accountsRequired',
          'database',
          'deploymentTarget',
        ],
      },
    };

    const readiness = getArchitectConversationReadiness(draft);

    expect(readiness.readyForBlueprint).toBe(true);
    expect(readiness.canCreateInitialBuildContract).toBe(true);
  });

  it('does not duplicate recommendation decision messages on repeated clicks', () => {
    let draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    draft = recordArchitectRecommendationDecision(
      draft,
      'Launch free-first with local persistence',
      'accepted',
      undefined,
      NOW
    );
    const messageCount = draft.conversation?.messages.length ?? 0;

    const repeated = recordArchitectRecommendationDecision(
      draft,
      'Launch free-first with local persistence',
      'accepted',
      undefined,
      new Date('2026-07-20T12:08:00.000Z')
    );

    expect(repeated).toBe(draft);
    expect(repeated.conversation?.acceptedRecommendations).toHaveLength(1);
    expect(repeated.conversation?.messages).toHaveLength(messageCount);
  });
});
