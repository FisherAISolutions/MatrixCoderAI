'use client';
/**
 * Landing-page Use Cases.
 *
 * Six personas/jobs-to-be-done. Each is a real workflow Matrix Coder AI
 * already supports today; nothing aspirational.
 */

import {
  Rocket,
  RefreshCcw,
  GraduationCap,
  Building2,
  PencilRuler,
  TimerReset,
} from 'lucide-react';

const USE_CASES = [
  {
    icon: Rocket,
    title: 'Bootstrap a Next.js app in 90 seconds',
    body:
      'Tell the agent what to build. It scaffolds package.json, tsconfig, tailwind, an App Router layout, and a homepage — then validates the whole stack before handing it over.',
  },
  {
    icon: RefreshCcw,
    title: 'Extend a legacy codebase',
    body:
      'Import any GitHub repo or drag in a zip. The Repository Context layer feeds the AI exactly the files it needs, so refactors land as minimal patches — not rewrites.',
  },
  {
    icon: PencilRuler,
    title: 'Prototype before standup',
    body:
      'Stress-test product ideas without leaving your browser. Generate, edit, run, screenshot, share the export. Discard if it doesn`t survive contact with reality.',
  },
  {
    icon: GraduationCap,
    title: 'Learn modern React patterns',
    body:
      'Ask the Reviewing Agent why a piece of code is structured the way it is. Get a security audit, a perf walkthrough, and concrete diffs — not generic textbook answers.',
  },
  {
    icon: Building2,
    title: 'Build internal tools without ops',
    body:
      'CRUD dashboards, admin panels, automation scripts. Everything generated is real Next.js — clone the export into your own infra when you outgrow the sandbox.',
  },
  {
    icon: TimerReset,
    title: 'Cut the "blank page" tax',
    body:
      'Boilerplate, auth pages, table layouts, API route plumbing — the parts of every project that aren`t the actual product. Matrix Coder AI ships them in seconds so you don`t have to.',
  },
];

export default function LandingUseCases() {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-matrix-border"
      data-testid="landing-usecases-grid"
    >
      {USE_CASES.map((u) => (
        <div
          key={u.title}
          className="group relative bg-matrix-bg p-7 lg:p-8 flex flex-col gap-4 hover:bg-matrix-card transition-colors"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center border border-matrix-green text-matrix-green group-hover:bg-matrix-green-ghost transition-colors">
            <u.icon size={16} />
          </span>
          <h3 className="text-base tracking-[0.04em] uppercase font-bold text-matrix-green neon-text-glow">
            {u.title}
          </h3>
          <p className="text-sm leading-relaxed text-matrix-readable">{u.body}</p>
        </div>
      ))}
    </div>
  );
}
