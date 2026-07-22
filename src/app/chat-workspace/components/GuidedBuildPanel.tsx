'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from 'lucide-react';
import {
  createGuidedBuildState,
  type GuidedBuildState,
} from '@/lib/guided-build';
import {
  loadMatrixProjectWorkspaceContext,
  type MatrixProjectWorkspaceContext,
} from '@/lib/projects/projectStore';
import type { WorkspaceTaskDrivenBuildController } from '../hooks/useTaskDrivenBuild';

type ViewMode = 'simple' | 'technical';

interface Props {
  sessionId: string;
  isStreaming: boolean;
  controller: WorkspaceTaskDrivenBuildController;
}

function statusClass(status: string): string {
  if (status === 'passed' || status === 'skipped') {
    return 'border-emerald-400/50 text-emerald-200 bg-emerald-500/10';
  }
  if (status === 'running' || status === 'validating' || status === 'ready') {
    return 'border-cyan-300/50 text-cyan-100 bg-cyan-500/10';
  }
  if (status === 'recoverable' || status === 'blocked' || status === 'failed') {
    return 'border-amber-300/60 text-amber-100 bg-amber-500/10';
  }
  if (status === 'cancelled') {
    return 'border-rose-300/60 text-rose-100 bg-rose-500/10';
  }
  return 'border-matrix-border text-matrix-green-muted bg-matrix-panel/60';
}

export default function GuidedBuildPanel({
  sessionId,
  isStreaming,
  controller,
}: Props) {
  const [context, setContext] = useState<MatrixProjectWorkspaceContext | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('simple');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setContext(loadMatrixProjectWorkspaceContext(window.localStorage));
  }, [controller.revision, sessionId]);

  const guidedState: GuidedBuildState | null = useMemo(() => {
    if (!context?.taskGraph && !context?.engineeringMemory?.taskGraph) return null;
    return createGuidedBuildState({
      taskGraph: context.taskGraph,
      engineeringMemory: context.engineeringMemory,
      projectId: context.currentProjectId,
      projectName: context.currentProjectName,
    });
  }, [context]);

  const graph = context?.taskGraph ?? context?.engineeringMemory?.taskGraph;
  const currentMilestone = guidedState?.milestones.find(
    (milestone) => milestone.id === guidedState.currentMilestoneId
  );
  const currentTechnical = currentMilestone?.primaryTaskId
    ? guidedState?.technicalDetails.find(
        (detail) => detail.taskId === currentMilestone.primaryTaskId
      )
    : undefined;
  const contractReview = context?.contractReviewReport;
  const reviewCounts = contractReview
    ? contractReview.requirementReports.reduce(
        (counts, requirement) => {
          if (requirement.status === 'satisfied') counts.satisfied += 1;
          else if (requirement.status === 'blocked') counts.blocked += 1;
          else if (requirement.required) counts.remaining += 1;
          return counts;
        },
        { satisfied: 0, remaining: 0, blocked: 0 }
      )
    : null;

  if (!guidedState || !graph) return null;

  const actionTaskId = currentMilestone?.primaryTaskId;

  return (
    <section
      className="border-b border-matrix-border bg-matrix-panel/70"
      data-testid="guided-build-panel"
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-2 text-left font-mono text-xs text-matrix-green"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="tracking-[0.24em] uppercase">Guided Build</span>
        <span
          className={`rounded-sm border px-2 py-0.5 uppercase ${statusClass(
            guidedState.overallStatus
          )}`}
        >
          {guidedState.overallStatus.replace(/-/g, ' ')}
        </span>
        <span className="hidden min-w-0 flex-1 truncate text-matrix-green-muted sm:block">
          {currentMilestone?.title ?? 'Planning your application'} -{' '}
          {currentMilestone?.currentAction ?? 'Waiting'}
        </span>
        <span className="ml-auto text-matrix-green-muted">
          {guidedState.progress.percentComplete}%
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded ? (
        <div className="space-y-3 px-4 pb-4">
          <div className="h-1 overflow-hidden rounded-full bg-matrix-green-ghost">
            <div
              className="h-full bg-matrix-green transition-all"
              style={{ width: `${guidedState.progress.percentComplete}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-sm border px-3 py-1 font-mono text-xs uppercase ${
                viewMode === 'simple'
                  ? 'border-matrix-green text-matrix-green'
                  : 'border-matrix-border text-matrix-green-muted'
              }`}
              onClick={() => setViewMode('simple')}
            >
              Simple
            </button>
            <button
              type="button"
              className={`rounded-sm border px-3 py-1 font-mono text-xs uppercase ${
                viewMode === 'technical'
                  ? 'border-matrix-green text-matrix-green'
                  : 'border-matrix-border text-matrix-green-muted'
              }`}
              onClick={() => setViewMode('technical')}
            >
              Technical
            </button>

            <div className="ml-auto flex flex-wrap gap-2">
              {!controller.active && controller.available ? (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-sm border border-matrix-green/70 px-3 py-1 font-mono text-xs uppercase text-matrix-green"
                  onClick={() => void controller.start()}
                >
                  <Play size={12} />
                  Start build
                </button>
              ) : null}
              {actionTaskId && currentMilestone?.canRetry ? (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-sm border border-amber-300/60 px-3 py-1 font-mono text-xs uppercase text-amber-100"
                  onClick={() => void controller.retryTask(actionTaskId)}
                >
                  <RotateCcw size={12} />
                  Retry
                </button>
              ) : null}
              {actionTaskId && currentMilestone?.canResume ? (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-sm border border-cyan-300/60 px-3 py-1 font-mono text-xs uppercase text-cyan-100"
                  onClick={() => void controller.resume(actionTaskId)}
                >
                  <RotateCcw size={12} />
                  Resume
                </button>
              ) : null}
              {actionTaskId && currentMilestone?.canSkip ? (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-sm border border-matrix-border px-3 py-1 font-mono text-xs uppercase text-matrix-green-muted"
                  onClick={() => void controller.skipOptionalTask(actionTaskId)}
                >
                  <SkipForward size={12} />
                  Skip optional
                </button>
              ) : null}
              {guidedState.actions.cancellableTaskIds.length ? (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-sm border border-rose-300/60 px-3 py-1 font-mono text-xs uppercase text-rose-100 disabled:opacity-50"
                  disabled={!controller.active && isStreaming}
                  title="Pause the active guided build after preserving completed work."
                  onClick={() => controller.cancel()}
                >
                  <Pause size={12} />
                  Pause
                </button>
              ) : null}
            </div>
          </div>

          <p className="font-mono text-xs text-matrix-green-muted">
            {controller.statusMessage}
          </p>

          {contractReview && reviewCounts ? (
            <div
              className={`rounded-sm border p-3 font-mono text-xs ${
                contractReview.completionAllowed
                  ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-100'
                  : 'border-amber-300/50 bg-amber-500/10 text-amber-100'
              }`}
              data-testid="guided-build-contract-review"
            >
              <div className="flex items-center gap-2">
                {contractReview.completionAllowed ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <AlertTriangle size={14} />
                )}
                <strong>
                  {contractReview.completionAllowed
                    ? 'Build Contract satisfied'
                    : 'Final review found remaining work'}
                </strong>
              </div>
              <p className="mt-2">
                {reviewCounts.satisfied} satisfied, {reviewCounts.remaining}{' '}
                required item(s) remaining, {reviewCounts.blocked} blocked.
              </p>
              {!contractReview.completionAllowed &&
              contractReview.summary.whatRemains[0] ? (
                <p className="mt-1 text-current/80">
                  Next: {contractReview.summary.whatRemains[0]}
                </p>
              ) : null}
            </div>
          ) : null}

          {viewMode === 'simple' ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {guidedState.milestones.map((milestone) => (
                <article
                  key={milestone.id}
                  className={`rounded-sm border p-3 ${statusClass(milestone.status)}`}
                  data-testid="guided-build-milestone"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
                      {milestone.title}
                    </h3>
                    <span className="rounded-sm border border-current/40 px-2 py-0.5 font-mono text-[10px] uppercase">
                      {milestone.status.replace(/-/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-matrix-green-muted">
                    {milestone.explanation}
                  </p>
                  <p className="mt-2 font-mono text-xs text-matrix-green">
                    Current action: {milestone.currentAction}
                  </p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/30">
                    <div
                      className="h-full bg-current transition-all"
                      style={{ width: `${milestone.progress}%` }}
                    />
                  </div>
                  {milestone.importantWarning ? (
                    <p className="mt-2 flex gap-2 text-xs text-amber-100">
                      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                      <span>{milestone.importantWarning}</span>
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-sm border border-matrix-border bg-black/20 p-3">
              {currentTechnical ? (
                <div className="grid gap-3 text-sm text-matrix-green-muted lg:grid-cols-2">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.22em] text-matrix-green">
                      {currentTechnical.taskId}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-matrix-green">
                      {currentTechnical.title}
                    </h3>
                    <p className="mt-1">
                      Discipline: {currentTechnical.discipline} - Status:{' '}
                      {currentTechnical.status}
                    </p>
                    <p>
                      Retries: {currentTechnical.retries.current}/
                      {currentTechnical.retries.maximum}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.22em] text-matrix-green">
                      Validation
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {currentTechnical.validationCommands.length ? (
                        currentTechnical.validationCommands.map((command) => (
                          <li key={command}>{command}</li>
                        ))
                      ) : (
                        <li>No task-specific command recorded.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.22em] text-matrix-green">
                      Files changed
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {currentTechnical.filesChanged.length ? (
                        currentTechnical.filesChanged.map((file) => (
                          <li key={file}>{file}</li>
                        ))
                      ) : (
                        <li>No file evidence recorded yet.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.22em] text-matrix-green">
                      Repository context
                    </p>
                    <p className="mt-1">
                      Scope:{' '}
                      {currentTechnical.repositoryContext.allowedFileScope.join(', ') ||
                        'Not specified'}
                    </p>
                    <p>
                      Expected:{' '}
                      {currentTechnical.repositoryContext.expectedFiles.join(', ') ||
                        'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.22em] text-matrix-green">
                      Acceptance criteria
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {currentTechnical.acceptanceCriteria.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.22em] text-matrix-green">
                      Exact errors
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {currentTechnical.exactErrors.length ? (
                        currentTechnical.exactErrors.map((error) => (
                          <li key={error}>{error}</li>
                        ))
                      ) : (
                        <li>No errors recorded for the current task.</li>
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-matrix-green-muted">
                  No technical task is selected yet.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
