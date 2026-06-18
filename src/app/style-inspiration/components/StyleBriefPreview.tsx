'use client';

import { Clipboard, Sparkles } from 'lucide-react';
import type { StyleProfileDraft } from '@/lib/styleInspiration';

interface Props {
  draft: StyleProfileDraft | null;
  onSave: () => void;
  onStartWorkspace: () => void;
  saving?: boolean;
  starting?: boolean;
}

export default function StyleBriefPreview({
  draft,
  onSave,
  onStartWorkspace,
  saving,
  starting,
}: Props) {
  if (!draft) {
    return (
      <section className="border border-matrix-border bg-matrix-card p-5">
        <div className="flex items-center gap-2 text-matrix-green">
          <Sparkles size={16} />
          <h2 className="text-sm font-mono uppercase tracking-[0.24em]">Style brief preview</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-matrix-green-muted">
          Upload screenshots, add your notes, and Matrix Coder will turn the references into an
          original design direction you can reuse.
        </p>
      </section>
    );
  }

  const brief = draft.styleBrief;

  return (
    <section className="border border-matrix-border bg-matrix-card p-5">
      <div className="flex flex-col gap-3 border-b border-matrix-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-matrix-green">
            <Sparkles size={16} />
            <h2 className="text-sm font-mono uppercase tracking-[0.24em]">{draft.title}</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-matrix-green-muted">{brief.summary}</p>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(draft.promptBlock)}
          className="inline-flex items-center gap-2 border border-matrix-border px-3 py-2 text-xs font-mono text-matrix-green-muted transition-colors hover:border-matrix-green hover:text-matrix-green"
        >
          <Clipboard size={13} />
          Copy prompt
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BriefBlock title="Visual direction" body={brief.visualDirection} />
        <BriefBlock title="Typography" body={brief.typography} />
        <BriefBlock title="Layout" body={brief.layout} />
        <BriefList title="Color palette" items={brief.colorPalette} />
        <BriefList title="Components" items={brief.components} />
        <BriefList title="Interactions" items={brief.interactions} />
        <BriefList title="Implementation notes" items={brief.implementationNotes} />
        <BriefList title="Avoid" items={brief.avoid} />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center border border-matrix-green bg-matrix-green px-4 py-2 text-sm font-mono font-bold text-matrix-bg transition-colors hover:bg-matrix-green-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving profile...' : 'Save style profile'}
        </button>
        <button
          type="button"
          onClick={onStartWorkspace}
          disabled={starting}
          className="inline-flex items-center justify-center border border-matrix-border px-4 py-2 text-sm font-mono text-matrix-green transition-colors hover:border-matrix-green hover:bg-matrix-green-ghost disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? 'Starting workspace...' : 'Start new workspace with this style'}
        </button>
      </div>
    </section>
  );
}

function BriefBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-matrix-border bg-matrix-bg/60 p-4">
      <h3 className="text-xs font-mono uppercase tracking-[0.22em] text-matrix-green">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-matrix-green-muted">{body}</p>
    </div>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border border-matrix-border bg-matrix-bg/60 p-4">
      <h3 className="text-xs font-mono uppercase tracking-[0.22em] text-matrix-green">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-matrix-green-muted">
        {items.map((item) => (
          <li key={`${title}-${item}`}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}
