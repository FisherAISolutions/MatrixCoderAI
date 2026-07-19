'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BrainCircuit, CheckCircle2, Save, Sparkles } from 'lucide-react';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import {
  ARCHITECT_QUESTIONS,
  getArchitectServiceRecommendations,
  handoffArchitectDraftToBlueprint,
  loadArchitectProjectState,
  saveArchitectProjectDraft,
  updateArchitectAnswer,
  type ArchitectAnswers,
  type ArchitectDraft,
} from '@/lib/matrix-ai-architect';
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [message, setMessage] = useState('Loading Architect Draft...');

  useEffect(() => {
    const state = loadArchitectProjectState(window.localStorage);
    setDraft(state.draft);
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
        saveArchitectProjectDraft(window.localStorage, draft);
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
  }, [draft]);

  const recommendations = useMemo(
    () => (draft ? getArchitectServiceRecommendations(draft.answers) : []),
    [draft]
  );

  const handleChange = <K extends keyof ArchitectAnswers>(
    key: K,
    value: ArchitectAnswers[K]
  ) => {
    setDraft((current) =>
      current ? updateArchitectAnswer(current, key, value) : current
    );
  };

  const handleHandoff = () => {
    if (!draft) return;
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
                Answer a few product and launch questions. Architect turns them
                into structured routes, data models, recommendations, and a
                Blueprint-ready plan without changing generation behavior.
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

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)] lg:px-10">
        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                  Guided planning
                </p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  Requirements interview
                </h2>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                Structured draft
              </span>
            </div>
          </div>
          <ArchitectQuestionPanel
            questions={ARCHITECT_QUESTIONS}
            answers={draft.answers}
            onChange={handleChange}
          />
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
                Send to Blueprint Studio
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
