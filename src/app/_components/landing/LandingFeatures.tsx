'use client';
/**
 * Landing-page Features grid.
 *
 * 8 product features (real ones, not marketing fluff) arranged in a 4x2
 * grid on desktop, 2x4 on tablet, single column on mobile. Each card uses
 * the neon-border treatment so they sit on the dark Matrix backdrop
 * without looking flat.
 */

import {
  Bot,
  GitMerge,
  Cpu,
  Eye,
  Terminal as TerminalIcon,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';

interface Feature {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: Bot,
    title: 'Multi-agent orchestration',
    body: 'Planning, Coding, Reviewing, and Orchestrator agents collaborate per turn. The Planner scopes; the Coder writes; the Reviewer hardens. You ship.',
  },
  {
    icon: GitMerge,
    title: 'SEARCH / REPLACE patching',
    body: 'Existing files are surgically patched — not regenerated. Four fallback strategies (exact, EOL-normalised, whitespace-stripped, line-trimmed) keep diffs minimal.',
  },
  {
    icon: Cpu,
    title: 'In-browser sandbox',
    body: 'WebContainer runs `npm install`, `tsc --noEmit`, and `next build` right in the tab. No remote VM. No "deploys-then-fails" feedback loops.',
  },
  {
    icon: Eye,
    title: 'Live preview panel',
    body: 'Click Run Dev Server, and your generated app loads inside the workspace. Refresh, expand, or pop it open in a new tab — no extra config.',
  },
  {
    icon: TerminalIcon,
    title: 'Real terminal',
    body: 'npm, yarn, npx, pnpm — all routed through jsh and streamed live. Exit-code messages explain failures in human English instead of bare numbers.',
  },
  {
    icon: ShieldCheck,
    title: 'Runtime smoke test',
    body: 'After a green build we start the dev server, fetch `/`, and scan for Next.js error overlays — so "builds fine" actually means "runs fine".',
  },
  {
    icon: Workflow,
    title: 'Auto-fix repair loop',
    body: 'Failed builds are handed back to the AI with the raw compiler output. Three tightly-scoped retries patch most issues without ever waking the user.',
  },
  {
    icon: Sparkles,
    title: 'GPT-4.1 by default',
    body: 'Tuned prompts paired with OpenAI`s latest reasoning model produce framework-correct, Next.js 15-aware code from prompt one. Upgrade to GPT-5 with one env var.',
  },
];

export default function LandingFeatures() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-matrix-border"
      data-testid="landing-features-grid"
    >
      {FEATURES.map((f) => (
        <FeatureCard key={f.title} {...f} />
      ))}
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body }: Feature) {
  return (
    <div className="group relative bg-matrix-bg p-6 lg:p-7 min-h-[180px] flex flex-col gap-3 hover:bg-matrix-card transition-colors">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center border border-matrix-green text-matrix-green group-hover:bg-matrix-green-ghost transition-colors">
          <Icon size={15} />
        </span>
        <span className="text-[11px] uppercase tracking-[0.32em] text-matrix-green-muted">
          {title}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-matrix-readable">{body}</p>
      {/* Hairline accent bottom-left — keeps the grid alive on hover */}
      <span className="absolute bottom-0 left-0 h-px w-0 bg-matrix-green group-hover:w-full transition-all duration-500" />
    </div>
  );
}
