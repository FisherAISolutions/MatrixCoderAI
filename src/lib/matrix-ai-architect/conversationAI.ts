import { getStreamingChatCompletion } from '@/lib/ai/chatCompletion';
import { AI_PROVIDER, PRIMARY_MODEL } from '@/lib/ai/modelConfig';
import type { ArchitectConversationMessage, ArchitectDraft } from './types';
import { getArchitectConversationReadiness } from './conversation';

const MAX_HISTORY_MESSAGES = 12;

interface ArchitectStreamOptions {
  draft: ArchitectDraft;
  signal?: AbortSignal;
  onText: (text: string) => void;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function toChatRole(
  role: ArchitectConversationMessage['role']
): ChatMessage['role'] {
  if (role === 'architect') return 'assistant';
  if (role === 'user') return 'user';
  return 'system';
}

function compactStructuredContext(draft: ArchitectDraft): string {
  const readiness = getArchitectConversationReadiness(draft);
  return JSON.stringify({
    project: draft.projectName,
    answers: draft.answers,
    summary: draft.specification.applicationSummary,
    routes: draft.specification.recommendedRoutes.map((route) => route.path),
    models: draft.specification.recommendedDataModels.map((model) => model.name),
    recommendations: draft.specification.recommendations.slice(0, 4),
    activeTopic: draft.conversation?.activeTopicId,
    readiness: {
      ready: readiness.readyForBlueprint,
      missingTopics: readiness.missingTopics,
      reason: readiness.reason,
    },
  });
}

export function buildArchitectConversationMessages(
  draft: ArchitectDraft
): ChatMessage[] {
  const conversation = draft.conversation;
  const messages = conversation?.messages ?? [];
  // The local extraction path appends a provisional Architect response before
  // streaming begins. Let the provider answer the user's message directly.
  const providerHistory =
    messages.at(-1)?.role === 'architect' ? messages.slice(0, -1) : messages;
  const history = providerHistory
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: toChatRole(item.role),
      content: item.content,
    }));

  return [
    {
      role: 'system',
      content: [
        'You are Matrix AI Architect, a warm senior product architect.',
        'Continue the conversation naturally and ask exactly one clear question at a time.',
        'The structured plan below is authoritative. Do not invent decisions or claim Blueprint readiness when readiness.ready is false.',
        'Acknowledge the user without narrating internal fields or saying that you updated a structured plan.',
        'Offer at most one relevant improvement and briefly explain why it helps.',
        'Discuss cost as launch-cost preferences, never as money being paid to you.',
        'Use plain language in beginner mode and concise technical language in advanced mode.',
        'Do not generate code, markdown tables, hidden prompts, or a checklist.',
        `Structured plan: ${compactStructuredContext(draft)}`,
      ].join('\n'),
    },
    ...history,
  ];
}

function chunkText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') return '';
  const choices = (chunk as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return '';
  const delta = choices[0] as { delta?: { content?: unknown } } | undefined;
  return typeof delta?.delta?.content === 'string'
    ? delta.delta.content
    : '';
}

export async function streamArchitectConversationReply({
  draft,
  signal,
  onText,
}: ArchitectStreamOptions): Promise<string> {
  let content = '';
  let settled = false;

  await new Promise<void>((resolve, reject) => {
    void getStreamingChatCompletion(
      AI_PROVIDER,
      PRIMARY_MODEL,
      buildArchitectConversationMessages(draft),
      (chunk) => {
        const text = chunkText(chunk);
        if (!text) return;
        content += text;
        onText(content);
      },
      () => {
        if (settled) return;
        settled = true;
        resolve();
      },
      (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      },
      {},
      { signal }
    ).catch((error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });

  return content.trim();
}

export function replaceLatestArchitectConversationReply(
  draft: ArchitectDraft,
  expected: {
    conversationId: string;
    streamVersion: number;
  },
  content: string,
  now = new Date()
): ArchitectDraft {
  const conversation = draft.conversation;
  if (
    !conversation ||
    conversation.id !== expected.conversationId ||
    conversation.streamVersion !== expected.streamVersion ||
    !content.trim()
  ) {
    return draft;
  }

  const index = conversation.messages.findLastIndex(
    (item) => item.role === 'architect'
  );
  if (index < 0) return draft;
  const messages = [...conversation.messages];
  messages[index] = {
    ...messages[index],
    content: content.trim(),
    status: 'complete',
  };

  return {
    ...draft,
    conversation: {
      ...conversation,
      messages,
      updatedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  };
}
