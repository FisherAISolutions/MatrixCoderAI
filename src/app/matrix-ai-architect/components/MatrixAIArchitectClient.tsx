'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BrainCircuit, CheckCircle2, Save, SlidersHorizontal, Sparkles } from 'lucide-react';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import {
  applyArchitectConversationEnvelopeToCore,
  ARCHITECT_QUESTIONS,
  approveArchitectConversationForBlueprint,
  createArchitectConversationResponseEnvelope,
  ensureArchitectConversation,
  getArchitectServiceRecommendations,
  handoffArchitectDraftToBlueprint,
  loadArchitectProjectState,
  recordArchitectStructuredEdit,
  saveArchitectProjectDraft,
  type ArchitectAnswers,
  type ArchitectConversationExtraction,
  type ArchitectDraft,
} from '@/lib/matrix-ai-architect';
import type { MatrixIntelligenceCore } from '@/lib/intelligence-core';
import ArchitectConversationPanel from './ArchitectConversationPanel';
import ArchitectQuestionPanel from './ArchitectQuestionPanel';
import ArchitectSummaryPanel from './ArchitectSummaryPanel';

type SaveStatus = 'loading' | 'saved' | 'saving' | 'failed' | 'handoff-skipped';

function formatDate(value?: string): string {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function MatrixAIArchitectClient() {
  const router = useRouter();
  const [draft, setDraft] = useState<ArchitectDraft | null>(null);
  const [intelligenceCore, setIntelligenceCore] =
    useState<MatrixIntelligenceCore | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [message, setMessage] = useState('Loading Architect Draft...');

  useEffect(() => {
    const state = loadArchitectProjectState(window.localStorage);
    setDraft(ensureArchitectConversation(state.draft));
    setIntelligenceCore(state.intelligenceCore);
    setSaveStatus('saved');
    setMessage(
      state.context.currentProjectName || state.snapshot?.name
        ? 'Architect Draft loaded for the active project.'
        : 'Architect Draft ready. Create or open a project when you want this plan attached to one.'
    );
  }, []);

  useEffect(() => {
    if (!draft) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      try {
        saveArchitectProjectDraft(window.localStorage, draft, {
          intelligenceCore,
        });
        setSaveStatus('saved');
        setMessage('Architect Draft saved to the current project context.');
      } catch (error) {
        setSaveStatus('failed');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Architect Draft could not be saved.'
        );
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [draft, intelligenceCore]);

  const recommendations = useMemo(
    () => (draft ? getArchitectServiceRecommendations(draft.answers) : []),
    [draft]
  );

  const handleChange = <K extends keyof ArchitectAnswers>(
    key: K,
    value: ArchitectAnswers[K]
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const next = recordArchitectStructuredEdit(current, key, value);
      applyIntelligenceUpdate({
        beforeDraft: current,
        afterDraft: next,
        extraction: {
          updatedAnswers: { [key]: value } as Partial<ArchitectAnswers>,
          newRequirements: key === 'customRequirements' && typeof value === 'string'
            ? [value]
            : [],
          rejectedRecommendations: [],
          unresolvedQuestions: [],
          confidence: 90,
        },
        userInput: `Structured edit: ${String(key)}`,
        naturalLanguageResponse:
          next.conversation?.messages.at(-1)?.content ??
          'Structured Architect answer updated.',
      });
      return next;
    });
  };

  const applyIntelligenceUpdate = (input: {
    beforeDraft: ArchitectDraft;
    afterDraft: ArchitectDraft;
    extraction: ArchitectConversationExtraction;
    userInput: string;
    naturalLanguageResponse: string;
  }) => {
    const conversation = input.afterDraft.conversation;
    if (!conversation) return;
    const envelope = createArchitectConversationResponseEnvelope({
      beforeDraft: input.beforeDraft,
      afterDraft: input.afterDraft,
      conversation,
      extraction: input.extraction,
      userInput: input.userInput,
      naturalLanguageResponse: input.naturalLanguageResponse,
    });
    setIntelligenceCore((current) => {
      if (!current) return current;
      const result = applyArchitectConversationEnvelopeToCore(current, envelope, {
        expectedProjectId: current.projectId,
      });
      if (result.skipped) return current;
      return result.core;
    });
  };

  const handleHandoff = () => {
    if (!draft) return;
    if (!draft.conversation?.approvedForBlueprint) {
      const approved = approveArchitectConversationForBlueprint(draft);
      setDraft(approved);
      applyIntelligenceUpdate({
        beforeDraft: draft,
        afterDraft: approved,
        extraction: {
          updatedAnswers: {},
          newRequirements: [],
          rejectedRecommendations: [],
          unresolvedQuestions: [],
          confidence: 96,
        },
        userInput: 'Approve Architect plan for Blueprint Studio.',
        naturalLanguageResponse: 'Architect plan approved for Blueprint Studio handoff.',
      });
      setSaveStatus('saved');
      setMessage(
        'Architect plan approved. Click Send to Blueprint Studio when you are ready.'
      );
      return;
    }

    const localResult = handoffArchitectDraftToBlueprint(window.localStorage, draft);

    if (localResult.skipped) {
      setSaveStatus('handoff-skipped');
      setMessage(
        localResult.reason ??
          'Blueprint Studio has newer edits. Architect handoff was not applied.'
      );
      return;
    }

    handoffArchitectDraftToBlueprint(window.sessionStorage, draft);
    setSaveStatus('saved');
    setMessage('Architect plan sent to Blueprint Studio. Review it before generation.');
    router.push('/blueprint-studio');
  };

  if (!draft) {
    return (
      <div className="min-h-full bg-[#f8fafc] p-8 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-hidden bg-[#f8fafc] text-slate-950">
      <div className="border-b border-slate-200 bg-white/90 px-4 py-6 backdrop-blur md:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-700">
                <BrainCircuit size={16} aria-hidden="true" />
                Matrix AI Architect
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                Plan the product before Matrix Coder generates it.
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate-600 md:text-base">
                Talk through your idea with a guided product architect. The
                conversation updates structured routes, data models,
                recommendations, and a Blueprint-ready plan without changing
                generation behavior.
              </p>
            </div>
            <div className="min-w-64 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Save size={16} aria-hidden="true" />
                {saveStatus === 'saving' ? 'Saving...' : 'Architect Draft'}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{message}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Updated {formatDate(draft.updatedAt)}
              </p>
            </div>
          </div>

          <WorkflowNav
            context={{
              hasProject: Boolean(draft.projectId),
              hasArchitectDraft: true,
              hasBuildManifest: Boolean(draft.sourceBuildManifest),
            }}
            className="border-slate-200 bg-white text-slate-700 [&_p]:text-slate-700"
          />
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)] lg:px-10">
        <section className="space-y-5">
          <ArchitectConversationPanel
            draft={draft}
            onDraftChange={setDraft}
            onStatusMessage={setMessage}
            onConversationIntelligenceUpdate={applyIntelligenceUpdate}
          />

          <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  Structured answers
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  Quick controls and advanced editing
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Use these controls when you want to inspect or edit the
                  structured plan directly.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 transition group-open:bg-slate-950 group-open:text-white">
                Open
              </span>
            </summary>
            <div className="mt-5">
              <ArchitectQuestionPanel
                questions={ARCHITECT_QUESTIONS}
                answers={draft.answers}
                onChange={handleChange}
              />
            </div>
          </details>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-700">
                  <Sparkles size={14} aria-hidden="true" />
                  Explicit handoff
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  Ready for Blueprint Studio
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Architect will not overwrite Blueprint Studio until you send
                  this draft forward.
                </p>
              </div>
              <CheckCircle2 className="text-emerald-500" size={22} aria-hidden="true" />
            </div>
            {saveStatus === 'handoff-skipped' ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                {message}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleHandoff}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                {draft.conversation?.approvedForBlueprint
                  ? 'Send to Blueprint Studio'
                  : 'Approve Architect Plan'}
                <ArrowRight size={16} />
              </button>
              <Link
                href="/projects"
                className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-400"
              >
                Back to Projects
              </Link>
            </div>
          </div>

          <ArchitectSummaryPanel
            draft={draft}
            serviceRecommendations={recommendations}
          />
        </aside>
      </main>
    </div>
  );
}
