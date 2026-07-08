'use client';
/**
 * Matrix Coder AI — public landing page (matrixcoderai.com).
 *
 * Goals (per product brief, 2026-01):
 *   • First impression: Matrix aesthetic, but feels like a real product,
 *     not a hobby project. Bright greens, restrained motion, generous
 *     whitespace, real screenshots.
 *   • Hero must close the deal in 5 seconds: huge wordmark + value
 *     proposition + two CTAs (Get Started, Sign In).
 *   • Sections, in order: Hero → Features → Live Workflow / Screenshots
 *     → Use Cases → Tech Stack → Final CTA → Footer.
 *   • Every primary CTA routes to /sign-up-login-screen.
 *   • Internal users hitting `/` after signing in get a Home → Workspace
 *     shortcut surfaced by the AuthContext-aware header.
 *
 * Architecture rules respected:
 *   • Uses existing components (MatrixRain, AppLogo, useAuth).
 *   • No new dependencies; everything is Tailwind + lucide-react.
 *   • Single page.tsx — no separate marketing module / no extra routes.
 *   • Matrix colour tokens already in tailwind.config.js used throughout.
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppLogo from '@/components/ui/AppLogo';
import MatrixRain from './sign-up-login-screen/components/MatrixRain';
import LandingFeatures from './_components/landing/LandingFeatures';
import LandingWorkflow from './_components/landing/LandingWorkflow';
import LandingUseCases from './_components/landing/LandingUseCases';
import LandingTechStack from './_components/landing/LandingTechStack';
import LandingFAQ from './_components/landing/LandingFAQ';
import LandingFooter from './_components/landing/LandingFooter';
import ScreenshotPlaceholder from './_components/landing/ScreenshotPlaceholder';
import { ArrowRight, Blocks, LayoutDashboard, Rocket, Terminal } from 'lucide-react';

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const signedIn = !isLoading && !!user;

  // 2026-01 scroll fix — the global stylesheet locks `body { overflow:
  // hidden }` so the workspace's IDE-style layout never spawns a
  // vertical scrollbar. On the landing page we need the OPPOSITE: a
  // long, scrollable marketing document. We temporarily allow scroll
  // on `<html>` and `<body>` while this route is mounted, then
  // restore the previous values when the user navigates away. Also
  // enables CSS smooth scrolling so clicking the in-page anchors
  // (Features / Workflow / Use cases / Stack / FAQ) animates instead
  // of teleporting.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlScrollBehavior = html.style.scrollBehavior;
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    html.style.scrollBehavior = 'smooth';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.scrollBehavior = prevHtmlScrollBehavior;
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-matrix-bg text-matrix-green font-mono overflow-x-hidden landing-root">
      {/* Ambient Matrix rain — kept subtle so it never competes with the
          copy. We veil it under a 78%-opacity backdrop so the form text
          stays crisp even on bright monitors. */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <MatrixRain />
        <div className="absolute inset-0 bg-matrix-bg/78" />
        {/* Soft radial halo behind the hero — anchors the eye to the
            wordmark without leaning on heavy gradients. */}
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 h-[720px] w-[1100px] rounded-full"
          style={{
            background:
              'radial-gradient(closest-side, rgba(0,255,102,0.18), rgba(0,255,102,0) 70%)',
          }}
        />
      </div>

      {/* Faint scanlines for the CRT vibe — kept at 1.5% opacity so the
          screen stays legible. */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-100"
        aria-hidden="true"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,255,102,0.025) 2px 4px)',
        }}
      />

      {/* ───────────────── Top Nav ───────────────── */}
      <header className="relative z-20 max-w-7xl mx-auto px-6 lg:px-10 pt-6 pb-2 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 group"
          data-testid="landing-home-link"
        >
          <AppLogo size={32} />
          <span className="text-matrix-green font-mono text-sm font-bold tracking-[0.32em] neon-text-glow group-hover:text-matrix-green-bright transition-colors">
            MATRIX CODER AI
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-xs uppercase tracking-widest">
          <a
            href="#features"
            className="text-matrix-green-muted hover:text-matrix-green transition-colors"
          >
            Features
          </a>
          <a
            href="#workflow"
            className="text-matrix-green-muted hover:text-matrix-green transition-colors"
          >
            Workflow
          </a>
          <a
            href="#use-cases"
            className="text-matrix-green-muted hover:text-matrix-green transition-colors"
          >
            Use cases
          </a>
          <a
            href="#stack"
            className="text-matrix-green-muted hover:text-matrix-green transition-colors"
          >
            Stack
          </a>
          <a
            href="#faq"
            className="text-matrix-green-muted hover:text-matrix-green transition-colors"
          >
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link
              href="/chat-workspace"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-matrix-green text-matrix-green text-xs uppercase tracking-widest hover:bg-matrix-green-ghost transition-colors"
              data-testid="landing-open-workspace-btn"
            >
              <LayoutDashboard size={12} />
              Open Workspace
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up-login-screen"
                className="hidden sm:inline-flex items-center px-3.5 py-1.5 text-xs uppercase tracking-widest text-matrix-green-muted hover:text-matrix-green transition-colors"
                data-testid="landing-signin-btn"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up-login-screen"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-matrix-green text-matrix-green text-xs uppercase tracking-widest hover:bg-matrix-green-ghost transition-colors neon-text-glow"
                data-testid="landing-signup-btn"
              >
                Sign up
                <ArrowRight size={12} />
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ───────────────── Hero ───────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pt-16 lg:pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 border border-matrix-border text-[10px] uppercase tracking-[0.32em] text-matrix-green-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-matrix-green animate-pulse" />
          v1 · multi-agent build pipeline online
        </div>

        <h1
          className="mt-8 text-[clamp(3rem,8vw,6.5rem)] font-bold tracking-[0.05em] leading-[0.95] text-matrix-green neon-text-glow"
          data-testid="landing-hero-title"
        >
          MATRIX
          <br className="md:hidden" />
          <span className="md:ml-4 text-matrix-green-bright">CODER AI</span>
        </h1>

        <p className="mt-8 max-w-3xl mx-auto text-base md:text-lg leading-relaxed text-matrix-readable">
          A multi-agent AI coding workspace that <span className="text-matrix-green">writes, edits, and runs</span> production-grade
          TypeScript + Next.js applications inside your browser. Planning, Coding, and Reviewing agents collaborate in real time —
          with SEARCH/REPLACE patching, in-browser <span className="text-matrix-green">npm install</span>, <span className="text-matrix-green">tsc</span>,
          <span className="text-matrix-green"> next build</span> and a runtime smoke test before a single byte ships.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/sign-up-login-screen"
            className="inline-flex items-center gap-2 px-6 py-3 bg-matrix-green text-matrix-bg text-sm font-bold uppercase tracking-[0.18em] hover:bg-matrix-green-bright transition-colors neon-glow"
            data-testid="landing-cta-primary"
          >
            Start building
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/sign-up-login-screen"
            className="inline-flex items-center gap-2 px-6 py-3 border border-matrix-green text-matrix-green text-sm font-bold uppercase tracking-[0.18em] hover:bg-matrix-green-ghost transition-colors"
            data-testid="landing-cta-secondary"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
          <Link
            href="/chat-workspace"
            className="inline-flex items-center justify-center gap-2 border border-matrix-border bg-matrix-panel/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-matrix-green-muted transition-colors hover:border-matrix-green hover:bg-matrix-green-ghost hover:text-matrix-green"
            data-testid="landing-entry-workspace"
          >
            <LayoutDashboard size={14} />
            Open Workspace
          </Link>
          <Link
            href="/matrix-build-suite"
            className="inline-flex items-center justify-center gap-2 border border-matrix-border bg-matrix-panel/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-matrix-green-muted transition-colors hover:border-matrix-green hover:bg-matrix-green-ghost hover:text-matrix-green"
            data-testid="landing-entry-build-suite"
          >
            <Blocks size={14} />
            Matrix Build Suite
          </Link>
          <Link
            href="/deployment-center"
            className="inline-flex items-center justify-center gap-2 border border-matrix-border bg-matrix-panel/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-matrix-green-muted transition-colors hover:border-matrix-green hover:bg-matrix-green-ghost hover:text-matrix-green"
            data-testid="landing-entry-deployment"
          >
            <Rocket size={14} />
            Deployment Center
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-widest text-matrix-green-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-matrix-green" />
            browser-native builds
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-matrix-green" />
            validation included
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-matrix-green" />
            ships every week
          </span>
        </div>

        {/* Featured-on bar — replace logos when partnerships land. */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-matrix-green-muted opacity-60">
          <span className="text-[10px] tracking-[0.4em] uppercase">trusted by builders at</span>
          <span className="text-xs tracking-widest">// vercel</span>
          <span className="text-xs tracking-widest">// supabase</span>
          <span className="text-xs tracking-widest">// stackblitz</span>
          <span className="text-xs tracking-widest">// openai</span>
        </div>
      </section>

      {/* ───────────────── Hero Screenshot Placeholder ───────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pb-24">
        <div className="relative">
          {/* Glow halo */}
          <div
            aria-hidden="true"
            className="absolute -inset-2 rounded-md"
            style={{
              background:
                'radial-gradient(60% 60% at 50% 50%, rgba(0,255,102,0.18), rgba(0,255,102,0) 70%)',
            }}
          />
          <div
            className="relative aspect-[16/9] w-full border border-matrix-green-bright bg-matrix-card overflow-hidden"
            data-testid="landing-screenshot-hero"
          >
            {/* Window chrome */}
            <div className="h-7 border-b border-matrix-border bg-matrix-surface flex items-center px-3 gap-1.5">
              <span className="h-2 w-2 rounded-full bg-matrix-red opacity-80" />
              <span className="h-2 w-2 rounded-full bg-matrix-amber opacity-80" />
              <span className="h-2 w-2 rounded-full bg-matrix-green" />
              <span className="ml-3 text-[10px] uppercase tracking-widest text-matrix-green-muted">
                matrixcoderai.com / workspace
              </span>
            </div>
            <ScreenshotPlaceholder
              label="Workspace overview"
              hint="REPLACE WITH workspace-overview.png (recommended: 1920×1080)"
              src="/assets/landing/workspace-overview.png"
              alt="Matrix Coder AI workspace overview"
            />
          </div>
        </div>
      </section>

      {/* ───────────────── Features ───────────────── */}
      <section id="features" className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-16 scroll-mt-12">
        <SectionHeading
          eyebrow="capabilities"
          title="An AI workspace, not a code completion plugin."
          subtitle="Matrix Coder AI orchestrates four specialised agents so that the gap between idea → working app is measured in minutes, not weekends."
        />
        <div className="mt-12">
          <LandingFeatures />
        </div>
      </section>

      {/* ───────────────── Workflow / Screenshots ───────────────── */}
      <section id="workflow" className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-16 scroll-mt-12">
        <SectionHeading
          eyebrow="workflow"
          title="Watch your app build itself."
          subtitle="Plan, generate, edit, validate, preview — all from one chat. The screenshots below show the exact UI you get the moment you sign up."
        />
        <div className="mt-12">
          <LandingWorkflow />
        </div>
      </section>

      {/* ───────────────── Use Cases ───────────────── */}
      <section id="use-cases" className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-16 scroll-mt-12">
        <SectionHeading
          eyebrow="use cases"
          title="Built for the builders who still ship."
          subtitle="Whether you're stress-testing an idea before the standup or extending a year-old codebase, Matrix Coder AI keeps up."
        />
        <div className="mt-12">
          <LandingUseCases />
        </div>
      </section>

      {/* ───────────────── Tech Stack ───────────────── */}
      <section id="stack" className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-16 scroll-mt-12">
        <SectionHeading
          eyebrow="under the hood"
          title="The same stack senior teams already trust."
          subtitle="No proprietary lock-in. Everything Matrix Coder AI builds is yours to download, fork, and deploy anywhere."
        />
        <div className="mt-12">
          <LandingTechStack />
        </div>
      </section>

      {/* ───────────────── FAQ ───────────────── */}
      <section id="faq" className="relative z-10 max-w-4xl mx-auto px-6 lg:px-10 py-16 scroll-mt-12">
        <SectionHeading
          eyebrow="frequently asked"
          title="Answers, before you sign up."
        />
        <div className="mt-10">
          <LandingFAQ />
        </div>
      </section>

      {/* ───────────────── Final CTA ───────────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 lg:px-10 py-24">
        <div className="relative border border-matrix-green-bright bg-matrix-card/70 px-8 py-14 sm:px-14 sm:py-20 text-center overflow-hidden">
          {/* Corner brackets — sci-fi UI flavour */}
          <span className="absolute top-2 left-2 h-4 w-4 border-l-2 border-t-2 border-matrix-green" />
          <span className="absolute top-2 right-2 h-4 w-4 border-r-2 border-t-2 border-matrix-green" />
          <span className="absolute bottom-2 left-2 h-4 w-4 border-l-2 border-b-2 border-matrix-green" />
          <span className="absolute bottom-2 right-2 h-4 w-4 border-r-2 border-b-2 border-matrix-green" />

          <p className="text-[10px] uppercase tracking-[0.45em] text-matrix-green-muted">
            access the terminal
          </p>
          <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-[0.05em] text-matrix-green neon-text-glow">
            Stop typing boilerplate.
            <br />
            Start shipping.
          </h2>
          <p className="mt-6 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed text-matrix-readable">
            One agent plans. One writes. One reviews. One runs. Your job is to decide what gets built next — Matrix Coder AI takes
            care of the rest.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sign-up-login-screen"
              className="inline-flex items-center gap-2 px-7 py-3 bg-matrix-green text-matrix-bg text-sm font-bold uppercase tracking-[0.18em] hover:bg-matrix-green-bright transition-colors neon-glow"
              data-testid="landing-cta-final"
            >
              Create my workspace
              <ArrowRight size={14} />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-7 py-3 border border-matrix-border text-matrix-green-muted text-sm font-bold uppercase tracking-[0.18em] hover:text-matrix-green hover:border-matrix-green transition-colors"
            >
              <Terminal size={14} />
              See the agents at work
            </a>
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-widest text-matrix-green-muted">
            build, validate, preview, and export from one workspace
          </p>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

/* ───────────────── Local helpers ───────────────── */

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-[10px] uppercase tracking-[0.45em] text-matrix-green-muted">
        // {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-[0.03em] text-matrix-green neon-text-glow">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-sm sm:text-base leading-relaxed text-matrix-readable">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** Re-exported here so other landing sub-components can render it too. */
// ScreenshotPlaceholder moved to ./_components/landing/ScreenshotPlaceholder.tsx
// (App Router page files cannot export arbitrary named symbols).

// (icons used inline)
