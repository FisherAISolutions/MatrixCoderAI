'use client';

import { CheckCircle2, GitCompareArrows, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BlueprintApprovalGateResult } from '@/lib/blueprint-studio/approvalGate';
import type {
  BlueprintTechnicalReviewSection,
} from '@/lib/blueprint-studio/intelligence';
import type {
  BuildContractDiff,
  CapabilityResolutionDiff,
} from '@/lib/blueprint-studio/diffs';

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'ready' | 'warning' | 'blocked';
}) {
  const classes =
    tone === 'ready'
      ? 'border-matrix-green/50 bg-matrix-green/12 text-matrix-green'
      : tone === 'warning'
        ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
        : 'border-rose-300/40 bg-rose-300/10 text-rose-200';
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${classes}`}
    >
      {children}
    </span>
  );
}

export default function BlueprintPlanningReviewPanel({
  sections,
  gate,
  contractDiff,
  capabilityDiff,
  approved,
  onApprove,
  onSendToWorkspace,
}: {
  sections: BlueprintTechnicalReviewSection[];
  gate: BlueprintApprovalGateResult;
  contractDiff: BuildContractDiff;
  capabilityDiff: CapabilityResolutionDiff;
  approved: boolean;
  onApprove: () => void;
  onSendToWorkspace: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-800/90 border-l-matrix-green/45 bg-[#0d1117]/92 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-matrix-green">
            Technical approval gate
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">
            Review the approved plan before Workspace
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Blueprint Studio now derives the Build Contract, resolves capabilities,
            and packages Matrix Intelligence context before generation. The prompt
            stays unchanged until you explicitly approve this review.
          </p>
        </div>
        <StatusPill tone={gate.canStartBuild ? 'ready' : 'blocked'}>
          {gate.canStartBuild ? 'Approved' : 'Needs approval'}
        </StatusPill>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {sections.map((section) => (
          <article
            key={section.id}
            className="rounded-xl border border-slate-800/90 bg-slate-950/45 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">
                {section.title}
              </h3>
              <StatusPill tone={section.status}>{section.status}</StatusPill>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {section.summary}
            </p>
            <ul className="mt-3 space-y-2 text-xs text-slate-500">
              {section.details.map((detail) => (
                <li key={detail} className="flex gap-2">
                  <CheckCircle2
                    size={14}
                    className="mt-0.5 shrink-0 text-matrix-green"
                    aria-hidden="true"
                  />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800/90 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <GitCompareArrows size={16} aria-hidden="true" />
            Contract and capability impact
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {contractDiff.addedRequirements.length} new requirement(s),{' '}
            {contractDiff.modifiedRequirements.length} changed requirement(s), and{' '}
            {capabilityDiff.addedCapabilities.length} new capability/capabilities
            will be carried forward.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800/90 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <LockKeyhole size={16} aria-hidden="true" />
            Handoff protections
          </div>
          {gate.reasons.length ? (
            <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-200">
              {gate.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-400">
              The approved Blueprint, Build Contract, capabilities, and Matrix
              Intelligence packet are ready for Workspace.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onApprove}
          className="inline-flex items-center gap-2 rounded-lg border border-matrix-green/70 bg-matrix-green px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-matrix-green-bright"
        >
          <ShieldCheck size={15} aria-hidden="true" />
          {approved ? 'Re-approve plan' : 'Approve technical plan'}
        </button>
        <button
          type="button"
          disabled={!gate.canStartBuild}
          onClick={onSendToWorkspace}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/70 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-matrix-green/70 hover:bg-matrix-green-ghost/70 hover:text-matrix-green disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Send size={15} aria-hidden="true" />
          Send approved Blueprint
        </button>
      </div>
    </section>
  );
}
