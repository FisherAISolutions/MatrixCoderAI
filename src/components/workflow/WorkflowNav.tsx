'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import {
  getContinueBuildTarget,
  getWorkflowNeighbors,
  type WorkflowContext,
} from '@/lib/workflow/workflowContinuity';

interface WorkflowNavProps {
  context?: WorkflowContext;
  className?: string;
}

export default function WorkflowNav({
  context,
  className = '',
}: WorkflowNavProps) {
  const pathname = usePathname();
  const { current, previous, next } = getWorkflowNeighbors(pathname);
  const continueTarget = getContinueBuildTarget(context ?? {});

  if (!current && !context) return null;

  return (
    <section
      className={[
        'flex flex-wrap items-center justify-between gap-3 border border-matrix-border bg-matrix-panel/60 px-4 py-3 text-xs text-matrix-readable',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Matrix Coder workflow"
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.28em] text-matrix-green-muted">
          Workflow
        </p>
        <p className="mt-1 truncate font-semibold text-matrix-green">
          {current
            ? `${current.label}: ${current.description}`
            : 'Continue your Matrix Coder build'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {previous ? (
          <Link
            href={previous.href}
            className="inline-flex items-center gap-2 border border-matrix-border bg-matrix-bg/70 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-matrix-green-muted transition hover:border-matrix-green hover:text-matrix-green"
            data-testid="workflow-previous"
          >
            <ArrowLeft size={12} />
            {previous.label}
          </Link>
        ) : null}
        <Link
          href={continueTarget.href}
          className="inline-flex items-center gap-2 border border-matrix-green bg-matrix-green px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-matrix-bg transition hover:bg-matrix-green-bright"
          data-testid="workflow-continue"
        >
          <Play size={12} />
          Continue Build
        </Link>
        {next ? (
          <Link
            href={next.href}
            className="inline-flex items-center gap-2 border border-matrix-border bg-matrix-bg/70 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-matrix-green-muted transition hover:border-matrix-green hover:text-matrix-green"
            data-testid="workflow-next"
          >
            {next.label}
            <ArrowRight size={12} />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
