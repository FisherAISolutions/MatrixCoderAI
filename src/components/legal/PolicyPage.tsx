import Link from 'next/link';
import type { ReactNode } from 'react';
import AppLogo from '@/components/ui/AppLogo';

export function PolicyPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen overflow-y-auto bg-[#05070a] px-5 py-10 text-slate-100 sm:px-8">
      <article className="mx-auto max-w-4xl">
        <header className="border-b border-slate-800 pb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-3 text-sm font-bold uppercase tracking-[0.2em] text-matrix-green"
          >
            <AppLogo size={30} />
            Matrix Coder AI
          </Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
            Private-beta draft - professional review required
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">{summary}</p>
        </header>
        <div className="space-y-8 py-8 text-sm leading-7 text-slate-300">
          {children}
        </div>
        <footer className="flex flex-wrap gap-4 border-t border-slate-800 py-6 text-xs text-slate-500">
          <Link href="/legal/terms" className="hover:text-matrix-green">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-matrix-green">
            Privacy
          </Link>
          <Link href="/legal/acceptable-use" className="hover:text-matrix-green">
            Acceptable use
          </Link>
          <Link href="/legal/ai-content" className="hover:text-matrix-green">
            AI content
          </Link>
          <Link href="/support" className="hover:text-matrix-green">
            Support
          </Link>
        </footer>
      </article>
    </main>
  );
}

export function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
