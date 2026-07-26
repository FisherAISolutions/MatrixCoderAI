import { describe, expect, it } from 'vitest';
import {
  applyArchitectConversationTurn,
  buildArchitectConversationMessages,
  createArchitectDraft,
  ensureArchitectConversation,
  replaceLatestArchitectConversationReply,
} from '@/lib/matrix-ai-architect';

const NOW = new Date('2026-07-24T12:00:00.000Z');

describe('Matrix AI Architect streaming conversation adapter', () => {
  it('keeps structured readiness authoritative and hides internal field narration', () => {
    const draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    const messages = buildArchitectConversationMessages(draft);
    const system = messages[0].content;

    expect(system).toContain('readiness.ready is false');
    expect(system).toContain('Do not invent decisions');
    expect(system).toContain('without narrating internal fields');
    expect(system).toContain('launch-cost preferences');
  });

  it('sends the latest user turn directly instead of the provisional local reply', () => {
    const draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    const result = applyArchitectConversationTurn({
      draft,
      conversation: draft.conversation!,
      userInput:
        'I want a scheduling app for independent tutors and their students.',
      now: new Date('2026-07-24T12:01:00.000Z'),
      streamVersion: draft.conversation!.streamVersion,
    });

    const messages = buildArchitectConversationMessages(result.draft);

    expect(messages.at(-1)).toEqual({
      role: 'user',
      content:
        'I want a scheduling app for independent tutors and their students.',
    });
    expect(messages.some((item) => item.content.includes('I updated'))).toBe(false);
  });

  it('replaces only the current conversation response and rejects stale streams', () => {
    const draft = ensureArchitectConversation(createArchitectDraft({ now: NOW }), NOW);
    const result = applyArchitectConversationTurn({
      draft,
      conversation: draft.conversation!,
      userInput: 'A booking app for local service businesses.',
      now: new Date('2026-07-24T12:02:00.000Z'),
      streamVersion: draft.conversation!.streamVersion,
    });
    const expected = {
      conversationId: result.conversation.id,
      streamVersion: result.conversation.streamVersion,
    };

    const replaced = replaceLatestArchitectConversationReply(
      result.draft,
      expected,
      'That sounds useful. Who will use the booking app most often?',
      new Date('2026-07-24T12:03:00.000Z')
    );
    expect(replaced.conversation?.messages.at(-1)?.content).toContain(
      'Who will use'
    );

    const stale = replaceLatestArchitectConversationReply(
      replaced,
      { ...expected, streamVersion: expected.streamVersion - 1 },
      'This stale response must not win.',
      new Date('2026-07-24T12:04:00.000Z')
    );
    expect(stale).toBe(replaced);
    expect(stale.conversation?.messages.at(-1)?.content).not.toContain('stale');
  });
});
