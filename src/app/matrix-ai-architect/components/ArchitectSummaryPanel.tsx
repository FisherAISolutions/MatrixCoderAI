'use client';

import { BarChart3, CheckCircle2, Database, FolderTree, Route, ShieldCheck } from 'lucide-react';
import type { ArchitectDraft, ArchitectServiceRecommendationRule } from '@/lib/matrix-ai-architect';

function CostPill({ value }: { value: string }) {
  return (
    <span className="rounded-full border border-slate-700/80 bg-slate-900 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
      {value} estimate
    </span>
  );
}

export default function ArchitectSummaryPanel({
  draft,
  serviceRecommendations,
}: {
  draft: ArchitectDraft;
  serviceRecommendations: ArchitectServiceRecommendationRule[];
}) {
  const spec = draft.specification;
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-slate-950 via-slate-950 to-emerald-950/25 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300/80">
          Live application spec
        </p>
        <h2 className="mt-3 text-2xl font-bold text-slate-50">
          {draft.projectName}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {spec.applicationSummary}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <Route size={17} className="text-emerald-300" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold text-slate-50">
              {spec.recommendedRoutes.length}
            </p>
            <p className="text-xs text-slate-400">routes</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <Database size={17} className="text-cyan-300" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold text-slate-50">
              {spec.recommendedDataModels.length}
            </p>
            <p className="text-xs text-slate-400">data models</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <BarChart3 size={17} className="text-purple-300" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold text-slate-50">
              {spec.estimatedAiPasses}
            </p>
            <p className="text-xs text-slate-400">AI passes</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <ShieldCheck size={17} className="text-amber-200" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold text-slate-50">
              {spec.confidenceScore}%
            </p>
            <p className="text-xs text-slate-400">confidence</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
          Recommended architecture
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {spec.recommendedArchitecture}
        </p>
        <div className="mt-4 space-y-2">
          {spec.recommendedFolderStructure.map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/55 p-3 text-sm text-slate-300"
            >
              <FolderTree size={16} className="mt-0.5 text-emerald-300" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
          Routes
        </p>
        <div className="mt-4 space-y-2">
          {spec.recommendedRoutes.map((item) => (
            <div
              key={item.path}
              className="rounded-xl border border-slate-800 bg-slate-900/55 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-100">{item.path}</p>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  {item.priority}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">{item.purpose}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/55 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
          Service recommendations
        </p>
        <div className="mt-4 space-y-3">
          {serviceRecommendations.map((item) => (
            <article
              key={`${item.category}-${item.recommendedOption}`}
              className="rounded-xl border border-slate-800 bg-slate-900/55 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-100">
                  {item.recommendedOption}
                </h3>
                <CostPill value={item.estimatedCostBand} />
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-emerald-300/80">
                {item.category} · confidence {item.confidence}%
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.reason}</p>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/65 p-3 text-xs leading-5 text-slate-400">
                Lower-cost alternative: {item.lowerCostAlternative}.{' '}
                {item.hasFreeTier ? 'Free tier available.' : 'No free tier assumed.'}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-slate-400">
                {item.assumptions.map((assumption) => (
                  <li key={assumption} className="flex gap-2">
                    <CheckCircle2 size={13} className="mt-0.5 text-emerald-300" />
                    <span>{assumption}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
