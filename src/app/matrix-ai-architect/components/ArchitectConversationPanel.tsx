'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import {
  applyArchitectConversationTurn,
  getArchitectConversationReadiness,
  recordArchitectRecommendationDecision,
  replaceLatestArchitectConversationReply,
  setArchitectConversationExperienceLevel,
  streamArchitectConversationReply,
  type ArchitectConversationExtraction,
  type ArchitectDraft,
  type ArchitectExperienceLevel,
} from '@/lib/matrix-ai-architect';

interface ArchitectConversationPanelProps {
  draft: ArchitectDraft;
  onDraftChange: (draft: ArchitectDraft) => void;
  onStatusMessage?: (message: string) => void;
  onConversationIntelligenceUpdate?: (input: {
    beforeDraft: ArchitectDraft;
    afterDraft: ArchitectDraft;
    extraction: ArchitectConversationExtraction;
    userInput: string;
    naturalLanguageResponse: string;
  }) => void;
}

function decisionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function levelCopy(level: ArchitectExperienceLevel): string {
  return level === 'advanced'
    ? 'Advanced mode uses more technical planning language.'
    : 'Beginner mode keeps questions plain and avoids jargon.';
}

export default function ArchitectConversationPanel({
  draft,
  onDraftChange,
  onStatusMessage,
  onConversationIntelligenceUpdate,
}: ArchitectConversationPanelProps) {
  const conversation = draft.conversation;
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedId, setStreamedId] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState('');
  const streamRunRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const readiness = useMemo(
    () => getArchitectConversationReadiness(draft, conversation),
    [conversation, draft]
  );

  useEffect(() => {
    return () => {
      streamRunRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [conversation?.id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!conversation || !input.trim() || isStreaming) return;
    const userInput = input.trim();
    const result = applyArchitectConversationTurn({
      draft,
      conversation,
      userInput,
      streamVersion: conversation.streamVersion,
    });
    if (result.stale) return;

    setInput('');
    onDraftChange(result.draft);
    const fallbackResponse =
      result.conversation.messages.at(-1)?.content ??
      'I have recorded that. Let us keep shaping the plan.';
    const latestMessage = result.conversation.messages.at(-1);
    if (!latestMessage || latestMessage.role !== 'architect') return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = streamRunRef.current + 1;
    streamRunRef.current = runId;
    setIsStreaming(true);
    setStreamedId(latestMessage.id);
    setStreamedText('');
    onStatusMessage?.('Matrix AI Architect is thinking...');

    let finalDraft = result.draft;
    let naturalLanguageResponse = fallbackResponse;
    try {
      const streamed = await streamArchitectConversationReply({
        draft: result.draft,
        signal: controller.signal,
        onText: (text) => {
          if (streamRunRef.current !== runId || controller.signal.aborted) return;
          setStreamedText(text);
        },
      });
      if (streamRunRef.current !== runId || controller.signal.aborted) return;
      if (streamed) {
        naturalLanguageResponse = streamed;
        finalDraft = replaceLatestArchitectConversationReply(
          result.draft,
          {
            conversationId: result.conversation.id,
            streamVersion: result.conversation.streamVersion,
          },
          streamed
        );
        onDraftChange(finalDraft);
      }
      onStatusMessage?.(
        result.extraction.confidence > 50
          ? 'Architect updated the project understanding from your answer.'
          : 'Architect needs a little more clarity before changing the plan.'
      );
    } catch (error) {
      if (streamRunRef.current !== runId || controller.signal.aborted) return;
      onStatusMessage?.(
        'Live Architect response was unavailable, so Matrix preserved the safe local planning response.'
      );
    } finally {
      if (streamRunRef.current === runId) {
        setIsStreaming(false);
        setStreamedId(null);
        setStreamedText('');
        abortRef.current = null;
      }
    }

    if (streamRunRef.current !== runId || controller.signal.aborted) return;
    onConversationIntelligenceUpdate?.({
      beforeDraft: draft,
      afterDraft: finalDraft,
      extraction: result.extraction,
      userInput,
      naturalLanguageResponse,
    });
  };

  const setLevel = (level: ArchitectExperienceLevel) => {
    onDraftChange(setArchitectConversationExperienceLevel(draft, level));
    onStatusMessage?.(levelCopy(level));
  };

  const recordDecision = (title: string, decision: 'accepted' | 'rejected') => {
    const nextDraft = recordArchitectRecommendationDecision(draft, title, decision);
    if (nextDraft === draft) {
      onStatusMessage?.(
        decision === 'accepted'
          ? 'Recommendation is already accepted.'
          : 'Recommendation is already skipped.'
      );
      return;
    }
    onDraftChange(nextDraft);
    onConversationIntelligenceUpdate?.({
      beforeDraft: draft,
      afterDraft: nextDraft,
      extraction: {
        updatedAnswers: {},
        newRequirements: [],
        rejectedRecommendations: decision === 'rejected' ? [title] : [],
        unresolvedQuestions: [],
        confidence: 92,
      },
      userInput: `${decision === 'accepted' ? 'Accept' : 'Reject'} recommendation: ${title}`,
      naturalLanguageResponse:
        nextDraft.conversation?.messages.at(-1)?.content ??
        `${decision === 'accepted' ? 'Accepted' : 'Rejected'} recommendation: ${title}.`,
    });
    onStatusMessage?.(
      decision === 'accepted'
        ? 'Recommendation accepted into the Architect conversation.'
        : 'Recommendation rejected and kept out of the plan.'
    );
  };

  const accepted = new Set(
    conversation?.acceptedRecommendations.map((item) => item.recommendationId)
  );
  const rejected = new Set(
    conversation?.rejectedRecommendations.map((item) => item.recommendationId)
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-300">
              <Sparkles size={14} aria-hidden="true" />
              Guided Architect Conversation
            </p>
            <h2 className="mt-3 text-2xl font-bold">
              Tell me what you want to build.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              I will ask one question at a time, update the structured Architect
              Draft behind the scenes, and wait for your approval before sending
              anything to Blueprint Studio.
            </p>
          </div>
          <div className="flex rounded-2xl border border-white/10 bg-white/5 p-1">
            {(['beginner', 'advanced'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setLevel(level)}
                className={`rounded-xl px-3 py-2 text-xs font-bold capitalize transition ${
                  conversation?.experienceLevel === level
                    ? 'bg-emerald-300 text-slate-950'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Confidence
            </p>
            <p className="mt-1 text-2xl font-bold text-white">{readiness.confidence}%</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Blueprint
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {readiness.readyForBlueprint ? 'Ready to review' : 'Still gathering'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Contract seed
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {readiness.canCreateInitialBuildContract ? 'Enough data' : 'Needs answers'}
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-[560px] space-y-4 overflow-y-auto bg-slate-50 p-5">
        {(conversation?.messages ?? []).map((item) => {
          const isArchitect = item.role === 'architect';
          const isSystem = item.role === 'system';
          const isStreaming = item.id === streamedId && isArchitect;
          const content = isStreaming
            ? streamedText || 'Thinking through your answer...'
            : item.content;
          return (
            <article
              key={item.id}
              className={`flex gap-3 ${isArchitect || isSystem ? '' : 'justify-end'}`}
            >
              {isArchitect || isSystem ? (
                <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-emerald-300">
                  <Bot size={16} aria-hidden="true" />
                </div>
              ) : null}
              <div
                className={`max-w-[82%] rounded-2xl border p-4 text-sm leading-6 ${
                  isSystem
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : isArchitect
                    ? 'border-slate-200 bg-white text-slate-700 shadow-sm'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-950'
                }`}
              >
                {content}
                {isStreaming && content.length < item.content.length ? (
                  <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-emerald-400 align-middle" />
                ) : null}
              </div>
              {!isArchitect && !isSystem ? (
                <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <User size={16} aria-hidden="true" />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-5">
        {conversation?.unresolvedQuestions.length ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            Last clarification: {conversation.unresolvedQuestions.at(-1)?.reason}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 md:flex-row">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Reply in plain English. You can also correct earlier answers, like 'actually no payments for now'."
            className="min-h-24 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isStreaming ? 'Thinking' : 'Send'}
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      </form>

      <div className="border-t border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
              Recommended next enhancements
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Accept or reject suggestions without sending anything to generation.
            </p>
          </div>
          {readiness.readyForBlueprint ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 size={14} aria-hidden="true" />
              Ready for approval
            </span>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {draft.specification.recommendations.slice(0, 3).map((item) => {
            const id = decisionId(item.title);
            const state = accepted.has(id)
              ? 'accepted'
              : rejected.has(id)
              ? 'rejected'
              : 'open';
            return (
              <article
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                  <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    {item.confidence}%
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {item.description}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => recordDecision(item.title, 'accepted')}
                    disabled={state === 'accepted' || isStreaming}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${
                      state === 'accepted'
                        ? 'cursor-not-allowed bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    <Check size={13} /> Add
                  </button>
                  <button
                    type="button"
                    onClick={() => recordDecision(item.title, 'rejected')}
                    disabled={state === 'rejected' || isStreaming}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${
                      state === 'rejected'
                        ? 'cursor-not-allowed bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    <X size={13} /> Skip
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
