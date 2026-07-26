'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleStop,
  Clock3,
  Code2,
  FileCode2,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  SkipForward,
  Wrench,
} from 'lucide-react';

import {
  createGuidedBuildOperationalSummary,
  createGuidedBuildState,
  type GuidedBuildMilestoneStatus,
} from '@/lib/guided-build';
import {
  loadMatrixProjectWorkspaceContext,
  type MatrixProjectWorkspaceContext,
} from '@/lib/projects/projectStore';
import type { WorkspaceTaskDrivenBuildController } from '../hooks/useTaskDrivenBuild';
import GuidedBuildInspector, {
  type GuidedInspectorView,
} from './GuidedBuildInspector';

interface Props {
  sessionId: string;
  controller: WorkspaceTaskDrivenBuildController;
  onOpenAdvanced: () => void;
}

function milestoneTone(status: GuidedBuildMilestoneStatus): string {
  if (status === 'passed' || status === 'skipped') {
    return 'border-emerald-400/35 bg-emerald-500/[0.06]';
  }
  if (status === 'running' || status === 'validating' || status === 'ready') {
    return 'border-cyan-300/35 bg-cyan-500/[0.06]';
  }
  if (status === 'recoverable' || status === 'blocked' || status === 'failed') {
    return 'border-amber-300/45 bg-amber-500/[0.08]';
  }
  if (status === 'cancelled') {
    return 'border-rose-300/40 bg-rose-500/[0.07]';
  }
  return 'border-matrix-border bg-matrix-panel/45';
}

function InspectorButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded border px-3 py-2 text-xs uppercase tracking-[0.14em] transition-colors ${
        active
          ? 'border-matrix-green bg-matrix-green-ghost text-matrix-green'
          : 'border-matrix-border text-matrix-green-muted hover:border-matrix-green/60 hover:text-matrix-green'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function GuidedBuildWorkspace({
  sessionId,
  controller,
  onOpenAdvanced,
}: Props) {
  const [context, setContext] =
    useState<MatrixProjectWorkspaceContext | null>(null);
  const [inspectorView, setInspectorView] =
    useState<GuidedInspectorView>('technical');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setContext(loadMatrixProjectWorkspaceContext(window.localStorage));
  }, [controller.revision, sessionId]);

  const guidedState = useMemo(
    () =>
      createGuidedBuildState({
        taskGraph: context?.taskGraph,
        engineeringMemory: context?.engineeringMemory,
        projectId: context?.currentProjectId,
        projectName: context?.currentProjectName,
      }),
    [context]
  );
  const currentMilestone = guidedState.milestones.find(
    (milestone) => milestone.id === guidedState.currentMilestoneId
  );
  const currentTechnical = currentMilestone?.primaryTaskId
    ? guidedState.technicalDetails.find(
        (detail) => detail.taskId === currentMilestone.primaryTaskId
      )
    : undefined;
  const operational = createGuidedBuildOperationalSummary({
    guidedState,
    repositoryModel: context?.repositoryModel,
    engineeringMemory: context?.engineeringMemory,
    active: controller.active,
  });
  const actionTaskId = currentMilestone?.primaryTaskId;

  return (
    <main
      className="h-full overflow-y-auto bg-matrix-bg px-4 py-5 sm:px-6 lg:px-8"
      data-testid="guided-build-workspace"
    >
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="overflow-hidden rounded-md border border-matrix-border bg-matrix-panel/70">
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.26em] text-matrix-green">
                Guided Build
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-matrix-green sm:text-3xl">
                {currentMilestone?.title ?? 'Planning your application'}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-matrix-green-muted">
                {currentMilestone?.explanation ??
                  'Matrix is preparing a bounded engineering plan.'}
              </p>
              <p className="mt-3 text-sm text-matrix-green">
                Current task: {operational.currentTask}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
              {!controller.active && controller.available ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded border border-matrix-green bg-matrix-green px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black hover:bg-matrix-green/90"
                  onClick={() => void controller.start()}
                >
                  <Play size={14} />
                  {guidedState.overallStatus === 'not-started'
                    ? 'Start build'
                    : 'Continue build'}
                </button>
              ) : null}
              {actionTaskId && currentMilestone?.canResume && !controller.active ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded border border-cyan-300/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-cyan-100"
                  onClick={() => void controller.resume(actionTaskId)}
                >
                  <Play size={14} />
                  Resume
                </button>
              ) : null}
              {actionTaskId && currentMilestone?.canRetry && !controller.active ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded border border-amber-300/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-amber-100"
                  onClick={() => void controller.retryTask(actionTaskId)}
                >
                  <RotateCcw size={14} />
                  Retry task
                </button>
              ) : null}
              {controller.active ? (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded border border-amber-300/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-amber-100"
                    onClick={controller.pause}
                  >
                    <Pause size={14} />
                    Pause
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded border border-rose-300/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-rose-100"
                    onClick={controller.cancel}
                  >
                    <CircleStop size={14} />
                    Cancel
                  </button>
                </>
              ) : null}
              {actionTaskId && currentMilestone?.canSkip && !controller.active ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded border border-matrix-border px-4 py-2 text-xs uppercase tracking-[0.14em] text-matrix-green-muted"
                  onClick={() => void controller.skipOptionalTask(actionTaskId)}
                >
                  <SkipForward size={14} />
                  Skip optional
                </button>
              ) : null}
              <button
                type="button"
                className="flex items-center gap-2 rounded border border-matrix-border px-4 py-2 text-xs uppercase tracking-[0.14em] text-matrix-green-muted hover:border-matrix-green/60 hover:text-matrix-green"
                onClick={onOpenAdvanced}
              >
                <Code2 size={14} />
                Advanced mode
              </button>
            </div>
          </div>

          <div className="border-t border-matrix-border px-5 py-4">
            <div className="mb-2 flex items-center justify-between text-xs text-matrix-green-muted">
              <span>{controller.statusMessage}</span>
              <span>{guidedState.progress.percentComplete}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-matrix-green-ghost">
              <div
                className="h-full bg-matrix-green transition-all duration-500"
                style={{ width: `${guidedState.progress.percentComplete}%` }}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Completed tasks',
              value: operational.completedTasks,
              detail: `${guidedState.progress.total} total`,
              icon: <CheckCircle2 size={16} />,
            },
            {
              label: 'Remaining tasks',
              value: operational.remainingTasks,
              detail: `${guidedState.progress.blocked} blocked`,
              icon: <ListChecks size={16} />,
            },
            {
              label: 'Estimated time',
              value: operational.estimatedTime,
              detail: 'Task-based estimate',
              icon: <Clock3 size={16} />,
            },
            {
              label: 'Repository',
              value: operational.repositoryStatus,
              detail: operational.repositoryDetail,
              icon: <FileCode2 size={16} />,
            },
          ].map((item) => (
            <article
              key={item.label}
              className="rounded-md border border-matrix-border bg-matrix-panel/60 p-4"
            >
              <div className="flex items-center gap-2 text-matrix-green">
                {item.icon}
                <p className="text-[10px] uppercase tracking-[0.18em]">
                  {item.label}
                </p>
              </div>
              <p className="mt-3 text-lg font-semibold text-matrix-green">
                {item.value}
              </p>
              <p className="mt-1 text-xs leading-5 text-matrix-green-muted">
                {item.detail}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <article className="rounded-md border border-matrix-border bg-matrix-panel/60 p-4">
            <div className="flex items-center gap-2 text-cyan-100">
              <ShieldCheck size={16} />
              <p className="text-[10px] uppercase tracking-[0.18em]">
                Current validation
              </p>
            </div>
            <p className="mt-3 text-sm leading-6 text-matrix-green-muted">
              {operational.currentValidation}
            </p>
          </article>
          <article className="rounded-md border border-matrix-border bg-matrix-panel/60 p-4">
            <div className="flex items-center gap-2 text-amber-100">
              <Wrench size={16} />
              <p className="text-[10px] uppercase tracking-[0.18em]">
                Current repair
              </p>
            </div>
            <p className="mt-3 text-sm leading-6 text-matrix-green-muted">
              {operational.currentRepair}
            </p>
          </article>
          <article className="rounded-md border border-matrix-border bg-matrix-panel/60 p-4">
            <div className="flex items-center gap-2 text-matrix-green">
              <Code2 size={16} />
              <p className="text-[10px] uppercase tracking-[0.18em]">
                Build status
              </p>
            </div>
            <p className="mt-3 text-sm capitalize leading-6 text-matrix-green-muted">
              {guidedState.overallStatus.replace(/-/g, ' ')}
            </p>
          </article>
        </section>

        {currentMilestone?.importantWarning ? (
          <div className="flex gap-3 rounded-md border border-amber-300/40 bg-amber-500/[0.08] p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 flex-shrink-0" size={17} />
            <div>
              <p className="font-semibold">This milestone needs attention</p>
              <p className="mt-1 leading-6">{currentMilestone.importantWarning}</p>
            </div>
          </div>
        ) : null}

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
                Engineering plan
              </p>
              <h2 className="mt-1 text-lg font-semibold text-matrix-green">
                Milestones
              </h2>
            </div>
            <p className="text-xs text-matrix-green-muted">
              Passed work remains preserved after interruption or failure.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {guidedState.milestones.map((milestone, index) => (
              <article
                key={milestone.id}
                className={`rounded-md border p-4 ${milestoneTone(milestone.status)}`}
                data-testid="guided-workspace-milestone"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-matrix-green-muted">
                    Step {index + 1}
                  </span>
                  <span className="rounded border border-current/25 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-matrix-green-muted">
                    {milestone.status.replace(/-/g, ' ')}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold text-matrix-green">
                  {milestone.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-matrix-green-muted">
                  {milestone.explanation}
                </p>
                <p className="mt-3 text-xs text-matrix-green">
                  {milestone.currentAction}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <InspectorButton
              active={inspectorView === 'technical'}
              icon={<Code2 size={14} />}
              label="Technical details"
              onClick={() => setInspectorView('technical')}
            />
            <InspectorButton
              active={inspectorView === 'repository'}
              icon={<FileCode2 size={14} />}
              label="View repository"
              onClick={() => setInspectorView('repository')}
            />
            <InspectorButton
              active={inspectorView === 'logs'}
              icon={<ScrollText size={14} />}
              label="View logs"
              onClick={() => setInspectorView('logs')}
            />
          </div>
          <GuidedBuildInspector
            view={inspectorView}
            context={context}
            guidedState={guidedState}
            currentTechnical={currentTechnical}
            onOpenAdvanced={onOpenAdvanced}
          />
        </section>
      </div>
    </main>
  );
}
