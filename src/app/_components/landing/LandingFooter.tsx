'use client';
/**
 * Landing-page Footer.
 *
 * Brand row + minimal nav + colophon. Kept short — most users on a
 * landing page either convert or bounce; the footer should not become
 * a distraction.
 */

import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';

export default function LandingFooter() {
  return (
    <footer className="relative z-10 border-t border-matrix-border mt-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <AppLogo size={28} />
          <div>
            <p className="text-matrix-green text-sm font-bold tracking-[0.32em] neon-text-glow">
              MATRIX CODER AI
            </p>
            <p className="text-[10px] uppercase tracking-[0.28em] text-matrix-green-muted">
              // multi-agent ai workspace
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.32em] text-matrix-green-muted">
          <a href="#features" className="hover:text-matrix-green transition-colors">
            features
          </a>
          <a href="#workflow" className="hover:text-matrix-green transition-colors">
            workflow
          </a>
          <a href="#faq" className="hover:text-matrix-green transition-colors">
            faq
          </a>
          <Link
            href="/sign-up-login-screen"
            className="hover:text-matrix-green transition-colors"
            data-testid="footer-signin-link"
          >
            sign in
          </Link>
          <Link
            href="/sign-up-login-screen"
            className="text-matrix-green hover:text-matrix-green-bright transition-colors"
            data-testid="footer-signup-link"
          >
            start building
          </Link>
        </nav>
      </div>

      <div className="border-t border-matrix-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] uppercase tracking-[0.32em] text-matrix-green-muted">
          <p>// © {new Date().getFullYear()} matrix coder ai · all systems online</p>
          <p className="opacity-70">
            ↳ built inside matrix coder ai
          </p>
        </div>
      </div>
    </footer>
  );
}
