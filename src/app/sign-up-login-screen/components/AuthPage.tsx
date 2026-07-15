'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Home } from 'lucide-react';
import { Toaster } from 'sonner';
import MatrixRain from './MatrixRain';
import LoginForm from './LoginForm';
import SignUpForm from './SignUpForm';
import AppLogo from '@/components/ui/AppLogo';

export default function AuthPage() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#020604] text-matrix-green">
      <Toaster position="top-right" richColors closeButton />
      {/* Home button — pinned top-left over both layouts. The auth route
       *  used to be a dead end (no way back to the marketing site); a
       *  small, always-visible Home control fixes that without touching
       *  the existing split-panel structure. */}
      <Link
        href="/"
        className="fixed top-5 left-5 z-30 inline-flex items-center gap-2 rounded-full border border-matrix-border bg-matrix-bg/85 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-matrix-green-muted shadow-[0_0_24px_rgba(0,255,102,0.08)] backdrop-blur-sm transition-colors hover:border-matrix-green hover:text-matrix-green"
        data-testid="auth-home-btn"
        aria-label="Back to landing page"
      >
        <Home size={11} />
        Home
      </Link>
      {/* Mobile / narrow-viewport Matrix Rain — full-screen background.
       *  The desktop layout below renders its own MatrixRain inside the
       *  left panel (only at lg+ widths because that panel is
       *  `hidden lg:flex`). On narrower viewports that panel disappears
       *  entirely, which made the login screen look un-themed. This
       *  fixed-positioned canvas restores the streaming-characters
       *  background on every viewport without changing the desktop
       *  split-panel design. */}
      <div className="lg:hidden fixed inset-0 z-0 pointer-events-none">
        <MatrixRain />
        <div className="absolute inset-0 bg-matrix-bg/70" aria-hidden="true" />
      </div>

      {/* Left Panel — Matrix Rain */}
      <div className="hidden lg:flex flex-col relative w-[57%] overflow-hidden border-r border-matrix-border/80 bg-matrix-bg">
        <MatrixRain />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(0,255,102,0.16),transparent_32%),linear-gradient(135deg,rgba(0,255,102,0.08),rgba(0,0,0,0.4))]" aria-hidden="true" />
        {/* Overlay content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-12 pointer-events-none">
          <div className="flex items-center gap-3">
            <AppLogo size={36} />
            <span className="text-matrix-green font-mono text-xl font-bold neon-text-glow tracking-widest">
              MATRIX CODER AI
            </span>
          </div>
          <div>
            <div className="mb-6">
              <div className="text-matrix-green-muted text-xs font-mono tracking-widest uppercase mb-3">
                // SYSTEM STATUS
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Planning Agent', status: 'ONLINE', color: 'text-matrix-blue' },
                  { label: 'Coding Agent', status: 'ONLINE', color: 'text-matrix-green' },
                  { label: 'Reviewing Agent', status: 'ONLINE', color: 'text-matrix-amber' },
                  { label: 'Orchestrator', status: 'ACTIVE', color: 'text-matrix-purple' },
                  { label: 'Memory System', status: '3-STAGE', color: 'text-matrix-green' },
                ].map((item) => (
                  <div key={`status-${item.label}`} className="flex items-center gap-3 text-xs font-mono">
                    <span className="w-2 h-2 rounded-full bg-matrix-green animate-pulse-green flex-shrink-0" />
                    <span className="text-matrix-green-muted w-36">{item.label}</span>
                    <span className={`${item.color} font-bold tracking-widest`}>{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="max-w-md rounded-2xl border border-matrix-border/70 bg-matrix-bg/65 p-5 text-xs font-mono leading-relaxed text-matrix-readable shadow-[0_0_40px_rgba(0,255,102,0.10)] backdrop-blur">
              <span className="text-matrix-green">$</span> Three specialized agents. One orchestrator.
              Full file generation. Persistent memory across sessions.
              <span className="terminal-cursor" />
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Auth Form */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_70%_20%,rgba(0,255,102,0.10),transparent_28%)] px-6 py-10">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-3 mb-8">
          <AppLogo size={32} />
          <span className="text-matrix-green font-mono text-lg font-bold neon-text-glow tracking-widest">
            MATRIX CODER AI
          </span>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-matrix-border/80 bg-matrix-bg/78 p-5 shadow-[0_0_50px_rgba(0,255,102,0.14)] backdrop-blur-xl sm:p-6">
          <div className="mb-5 border-b border-matrix-border/70 pb-4">
            <p className="text-[10px] uppercase tracking-[0.36em] text-matrix-green-muted">Secure access</p>
            <h1 className="mt-2 text-2xl font-bold uppercase tracking-[0.12em] text-matrix-green neon-text-glow">
              {tab === 'login' ? 'Welcome back' : 'Create workspace'}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-matrix-readable">
              Sign in to restore your projects, generated files, build suite prompts, and deployment tools.
            </p>
          </div>
          {/* Tab toggle */}
          <div className="mb-6 flex overflow-hidden rounded-xl border border-matrix-border/80 bg-matrix-panel/50 p-1">
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={`tab-${t}`}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-2.5 text-xs font-mono tracking-widest uppercase transition-all duration-150 ${
                  tab === t
                    ? 'bg-matrix-green text-black font-bold shadow-[0_0_24px_rgba(0,255,102,0.25)]' : 'text-matrix-green-muted hover:text-matrix-green hover:bg-matrix-green-ghost'
                }`}
              >
                {t === 'login' ? '// LOGIN' : '// SIGN UP'}
              </button>
            ))}
          </div>

          {/* Form */}
          <div className="animate-fade-in" key={tab}>
            {tab === 'login' ? (
              <LoginForm onSwitchToSignup={() => setTab('signup')} />
            ) : (
              <SignUpForm onSwitchToLogin={() => setTab('login')} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
