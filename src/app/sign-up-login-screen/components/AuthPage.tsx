'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Home } from 'lucide-react';
import MatrixRain from './MatrixRain';
import LoginForm from './LoginForm';
import SignUpForm from './SignUpForm';
import AppLogo from '@/components/ui/AppLogo';

export default function AuthPage() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-matrix-bg">
      {/* Home button — pinned top-left over both layouts. The auth route
       *  used to be a dead end (no way back to the marketing site); a
       *  small, always-visible Home control fixes that without touching
       *  the existing split-panel structure. */}
      <Link
        href="/"
        className="fixed top-5 left-5 z-30 inline-flex items-center gap-2 px-3 py-1.5 border border-matrix-border bg-matrix-bg/80 backdrop-blur-sm text-matrix-green-muted hover:text-matrix-green hover:border-matrix-green text-[11px] uppercase tracking-[0.32em] transition-colors"
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
      <div className="hidden lg:flex flex-col relative w-[55%] overflow-hidden border-r border-matrix-border">
        <MatrixRain />
        {/* Overlay content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-10 pointer-events-none">
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
            <div className="text-matrix-green-muted text-xs font-mono leading-relaxed max-w-sm">
              <span className="text-matrix-green">$</span> Three specialized agents. One orchestrator.
              Full file generation. Persistent memory across sessions.
              <span className="terminal-cursor" />
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Auth Form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 relative overflow-y-auto z-10">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-3 mb-8">
          <AppLogo size={32} />
          <span className="text-matrix-green font-mono text-lg font-bold neon-text-glow tracking-widest">
            MATRIX CODER AI
          </span>
        </div>

        <div className="w-full max-w-sm">
          {/* Tab toggle */}
          <div className="flex mb-6 neon-border-muted border rounded-sm overflow-hidden">
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={`tab-${t}`}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-mono tracking-widest uppercase transition-all duration-150 ${
                  tab === t
                    ? 'bg-matrix-green text-black font-bold' :'text-matrix-green-muted hover:text-matrix-green hover:bg-matrix-green-ghost'
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