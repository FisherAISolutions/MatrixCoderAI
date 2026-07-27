'use client';

import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { MATRIX_RELEASE } from '@/lib/release/releaseInfo';

export default function LandingFooter() {
  return (
    <footer className="relative z-10 mt-16 border-t border-matrix-border">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center lg:px-10">
        <div className="flex items-center gap-3">
          <AppLogo size={28} />
          <div>
            <p className="text-sm font-bold tracking-[0.32em] text-matrix-green neon-text-glow">
              MATRIX CODER AI
            </p>
            <p className="text-[10px] uppercase tracking-[0.28em] text-matrix-green-muted">
              // multi-agent ai workspace
            </p>
          </div>
        </div>

        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.32em] text-matrix-green-muted"
        >
          <a href="#features" className="transition-colors hover:text-matrix-green">
            features
          </a>
          <a href="#workflow" className="transition-colors hover:text-matrix-green">
            workflow
          </a>
          <a href="#faq" className="transition-colors hover:text-matrix-green">
            faq
          </a>
          <Link
            href="/support"
            className="transition-colors hover:text-matrix-green"
          >
            support
          </Link>
          <Link
            href="/legal/privacy"
            className="transition-colors hover:text-matrix-green"
          >
            privacy
          </Link>
          <Link
            href="/sign-up-login-screen"
            className="transition-colors hover:text-matrix-green"
            data-testid="footer-signin-link"
          >
            sign in
          </Link>
          <Link
            href="/sign-up-login-screen"
            className="text-matrix-green transition-colors hover:text-matrix-green-bright"
            data-testid="footer-signup-link"
          >
            start building
          </Link>
        </nav>
      </div>

      <div className="border-t border-matrix-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-6 py-5 text-[10px] uppercase tracking-[0.32em] text-matrix-green-muted sm:flex-row sm:items-center lg:px-10">
          <p>
            // {new Date().getFullYear()} matrix coder ai ·{' '}
            {MATRIX_RELEASE.channel} · v{MATRIX_RELEASE.version}
          </p>
          <p className="opacity-70">built inside matrix coder ai</p>
        </div>
      </div>
    </footer>
  );
}
