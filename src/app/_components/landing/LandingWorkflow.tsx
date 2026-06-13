'use client';
/**
 * Landing-page Workflow / screenshot showcase.
 *
 * Three alternating left/right blocks, each with a screenshot placeholder
 * and a step description. Replace the placeholder src/labels with real
 * captures from the workspace when you're ready.
 */

import ScreenshotPlaceholder from './ScreenshotPlaceholder';
import { MessageSquareCode, FileCode2, MonitorPlay } from 'lucide-react';

interface Step {
  index: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
  screenshotLabel: string;
  screenshotHint: string;
  screenshotSrc: string;
  reverse?: boolean;
}

const STEPS: Step[] = [
  {
    index: '01',
    icon: MessageSquareCode,
    title: 'Describe the app you want.',
    body:
      'Type the request the way you`d brief a teammate. The Planning Agent breaks it into phases; the Coding Agent emits full files for net-new projects or SEARCH/REPLACE patches for existing ones. Every change is visible in real time.',
    screenshotLabel: 'Chat → AI generation',
    screenshotHint: 'REPLACE WITH workspace-chat.png (recommended: 1920×1080)',
    screenshotSrc: '/assets/landing/workspace-chat.png',
  },
  {
    index: '02',
    icon: FileCode2,
    title: 'Open any file. Edit by hand or by chat.',
    body:
      'Click a file in the tree to view it. Hit Edit to swap in Monaco — the same editor that powers VS Code. The viewer is resizable, fullscreen-able, and stays in sync when the AI patches the file underneath you.',
    screenshotLabel: 'Monaco editor + file tree',
    screenshotHint: 'REPLACE WITH workspace-editor.png (recommended: 1920×1080)',
    screenshotSrc: '/assets/landing/workspace-editor.png',
    reverse: true,
  },
  {
    index: '03',
    icon: MonitorPlay,
    title: 'One click. Live preview.',
    body:
      'Open the Preview panel, hit Run Dev Server, and watch your generated app load in the embedded iframe. Refresh, expand, pop out — and if a runtime crash slips through, the auto-fix loop hands the stack trace back to the AI.',
    screenshotLabel: 'Live preview panel',
    screenshotHint: 'REPLACE WITH workspace-preview.png (recommended: 1920×1080)',
    screenshotSrc: '/assets/landing/workspace-preview.png',
  },
];

export default function LandingWorkflow() {
  return (
    <div className="flex flex-col gap-16 lg:gap-24">
      {STEPS.map((s) => (
        <Row key={s.index} {...s} />
      ))}
    </div>
  );
}

function Row({ index, icon: Icon, title, body, screenshotLabel, screenshotHint, screenshotSrc, reverse }: Step) {
  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center ${
        reverse ? 'lg:[&>div:first-child]:order-2' : ''
      }`}
    >
      {/* Copy */}
      <div>
        <div className="flex items-center gap-3 text-matrix-green-muted">
          <span className="text-xs tracking-[0.5em]">STEP {index}</span>
          <span className="h-px flex-1 max-w-[60px] bg-matrix-border" />
          <span className="inline-flex h-7 w-7 items-center justify-center border border-matrix-border text-matrix-green">
            <Icon size={13} />
          </span>
        </div>
        <h3 className="mt-5 text-2xl sm:text-3xl font-bold tracking-[0.03em] text-matrix-green neon-text-glow">
          {title}
        </h3>
        <p className="mt-4 text-sm sm:text-base leading-relaxed text-matrix-readable">
          {body}
        </p>
      </div>

      {/* Screenshot placeholder */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute -inset-1.5"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 50%, rgba(0,255,102,0.12), rgba(0,255,102,0) 70%)',
          }}
        />
        <div className="relative aspect-[16/10] border border-matrix-border bg-matrix-card overflow-hidden">
          <div className="h-7 border-b border-matrix-border bg-matrix-surface flex items-center px-3 gap-1.5">
            <span className="h-2 w-2 rounded-full bg-matrix-red opacity-80" />
            <span className="h-2 w-2 rounded-full bg-matrix-amber opacity-80" />
            <span className="h-2 w-2 rounded-full bg-matrix-green" />
          </div>
          <ScreenshotPlaceholder
            label={screenshotLabel}
            hint={screenshotHint}
            src={screenshotSrc}
            alt={screenshotLabel}
          />
        </div>
      </div>
    </div>
  );
}
