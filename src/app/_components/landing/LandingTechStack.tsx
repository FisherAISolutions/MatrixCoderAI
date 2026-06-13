'use client';
/**
 * Landing-page Tech Stack ribbon.
 *
 * Short pitch + a wordmark row. No external SVGs / brand assets — clean
 * monospace labels so we don't have to manage trademark approvals.
 */

const STACK = [
  { name: 'Next.js 15', sub: 'App Router' },
  { name: 'TypeScript', sub: 'strict' },
  { name: 'React 19', sub: 'server + client' },
  { name: 'Tailwind', sub: 'matrix theme' },
  { name: 'Supabase', sub: 'auth + storage' },
  { name: 'OpenAI', sub: 'gpt-4.1 default' },
  { name: 'WebContainer', sub: 'in-browser sandbox' },
  { name: 'Monaco', sub: 'edit anywhere' },
];

export default function LandingTechStack() {
  return (
    <div data-testid="landing-stack">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-matrix-border">
        {STACK.map((s) => (
          <div
            key={s.name}
            className="bg-matrix-bg px-5 py-7 text-center hover:bg-matrix-card transition-colors"
          >
            <p className="text-base sm:text-lg font-bold tracking-[0.05em] text-matrix-green neon-text-glow">
              {s.name}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.32em] text-matrix-green-muted">
              // {s.sub}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-matrix-readable">
        Every project Matrix Coder AI produces is a real Next.js 15 + TypeScript app. Download the zip, push to GitHub, deploy to
        Vercel — your code is yours, no proprietary build pipeline, no vendor lock-in.
      </p>
    </div>
  );
}
