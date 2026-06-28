'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Cloud,
  Download,
  Globe2,
  Rocket,
  Smartphone,
  XCircle,
} from 'lucide-react';
import {
  loadDeploymentWorkspaceSnapshot,
  type DeploymentStatus,
  type DeploymentWorkspaceSnapshot,
} from '@/lib/deployment/workspaceStatus';
import {
  createProjectZipBlob,
  projectZipFileName,
} from '@/lib/deployment/projectZip';
import {
  createInitialProductionCheckSteps,
  exportFilesToFileNodes,
  productionCheckFromValidationResult,
  type ProductionCheckOverallStatus,
  type ProductionCheckStatus,
  type ProductionCheckStep,
} from '@/lib/deployment/productionCheck';
import {
  getVercelReadiness,
  type VercelReadinessStatus,
} from '@/lib/deployment/vercelReadiness';
import {
  getAndroidReadiness,
  type AndroidReadinessStatus,
} from '@/lib/deployment/androidReadiness';
import {
  addDeploymentHistoryEntry,
  loadDeploymentHistory,
  type AddDeploymentHistoryEntryInput,
  type DeploymentHistoryEntry,
  type DeploymentHistoryStatus,
} from '@/lib/deployment/deploymentHistory';
import { runValidation } from '@/lib/validation';

const emptySnapshot: DeploymentWorkspaceSnapshot = {
  projectName: 'Current Workspace',
  framework: 'Unknown',
  generationStatus: 'pending',
  validationStatus: 'pending',
  buildStatus: 'pending',
  previewStatus: 'pending',
  fileCount: 0,
  routeCount: 0,
  generatedFilePaths: [],
  exportFiles: [],
  checklist: {
    projectGenerated: 'pending',
    importsValid: 'pending',
    typeScriptPasses: 'pending',
    buildPasses: 'pending',
    runtimeSmokePasses: 'pending',
    generatedQualityPasses: 'pending',
    readyForDeployment: 'pending',
  },
};

type DownloadStatus = 'Ready' | 'Preparing' | 'Downloaded' | 'Failed';

const deploymentOptions = [
  {
    title: 'Web Export',
    description:
      'Prepare the current generated workspace as a production-ready web build package.',
    status: 'Coming soon',
    icon: Globe2,
    accent: 'text-matrix-blue',
  },
  {
    title: 'Vercel Deployment',
    description:
      'Connect a Vercel account and launch the selected Next.js project from Matrix Coder AI.',
    status: 'Not connected yet',
    icon: Cloud,
    accent: 'text-matrix-green',
  },
  {
    title: 'Android / Capacitor',
    description:
      'Package the generated project for Android when mobile export is enabled.',
    status: 'Coming soon',
    icon: Smartphone,
    accent: 'text-matrix-purple',
  },
  {
    title: 'Project Files / Download',
    description:
      'Export the generated source files as a portable project archive for local development.',
    status: 'Coming soon',
    icon: Download,
    accent: 'text-matrix-amber',
  },
];

const checklistItems: Array<{
  key: keyof DeploymentWorkspaceSnapshot['checklist'];
  label: string;
}> = [
  { key: 'projectGenerated', label: 'Project generated' },
  { key: 'importsValid', label: 'Imports valid' },
  { key: 'typeScriptPasses', label: 'TypeScript passes' },
  { key: 'buildPasses', label: 'Build passes' },
  { key: 'runtimeSmokePasses', label: 'Runtime smoke passes' },
  { key: 'generatedQualityPasses', label: 'Generated quality passes' },
  { key: 'readyForDeployment', label: 'Ready for deployment' },
];

function statusLabel(status: DeploymentStatus): string {
  switch (status) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'pending':
      return 'Pending';
    default:
      return 'Unknown';
  }
}

function statusClasses(status: DeploymentStatus): string {
  switch (status) {
    case 'passed':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'failed':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'running':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'pending':
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-card';
  }
}

function StatusPill({ status }: { status: DeploymentStatus }) {
  return (
    <span
      className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${statusClasses(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function productionStatusClasses(status: ProductionCheckStatus | ProductionCheckOverallStatus): string {
  switch (status) {
    case 'passed':
    case 'Passed':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'failed':
    case 'Failed':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'running':
    case 'Running':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'skipped':
      return 'border-matrix-amber text-matrix-amber bg-matrix-amber/10';
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
  }
}

function productionStatusLabel(status: ProductionCheckStatus): string {
  switch (status) {
    case 'not-run':
      return 'Not run';
    case 'running':
      return 'Running';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
  }
}

function vercelStatusClasses(status: VercelReadinessStatus): string {
  switch (status) {
    case 'Ready to connect':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'Failed production check':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'Needs production check':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'Not ready':
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
  }
}

function androidStatusClasses(status: AndroidReadinessStatus): string {
  switch (status) {
    case 'Ready to configure':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'Failed production check':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'Needs production check':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'Not ready':
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
  }
}

function historyStatusClasses(status: DeploymentHistoryStatus): string {
  switch (status) {
    case 'Ready':
    case 'Passed':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'Failed':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'Running':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'Not ready':
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
    case 'Info':
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-card';
  }
}

function ChecklistIcon({ status }: { status: DeploymentStatus }) {
  if (status === 'passed') {
    return <CheckCircle2 size={17} className="text-matrix-green-bright" />;
  }
  if (status === 'failed') {
    return <XCircle size={17} className="text-red-300" />;
  }
  return <CircleDashed size={17} className="text-matrix-green-muted" />;
}

function formatDate(value?: string): string {
  if (!value) return 'Not available yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function DeploymentCenterClient() {
  const [snapshot, setSnapshot] =
    useState<DeploymentWorkspaceSnapshot>(emptySnapshot);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('Ready');
  const [productionStatus, setProductionStatus] =
    useState<ProductionCheckOverallStatus>('Not run');
  const [productionSteps, setProductionSteps] = useState<ProductionCheckStep[]>(
    () => createInitialProductionCheckSteps()
  );
  const [productionMessage, setProductionMessage] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<DeploymentHistoryEntry[]>(
    []
  );
  const readinessHistoryKeys = useRef(new Set<string>());

  useEffect(() => {
    const refresh = () => {
      setSnapshot(loadDeploymentWorkspaceSnapshot() ?? emptySnapshot);
      setHistoryEntries(loadDeploymentHistory());
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const ready = snapshot.checklist.readyForDeployment === 'passed';
  const exportFiles = snapshot.exportFiles ?? [];
  const canDownload = exportFiles.length > 0 && downloadStatus !== 'Preparing';
  const vercelReadiness = getVercelReadiness({
    hasProjectFiles: exportFiles.length > 0,
    productionStatus,
  });
  const androidReadiness = getAndroidReadiness({
    hasProjectFiles: exportFiles.length > 0,
    framework: snapshot.framework,
    productionStatus,
  });
  const projectDescriptor =
    snapshot.framework === 'Unknown'
      ? snapshot.projectName
      : `${snapshot.projectName} (${snapshot.framework})`;

  function recordHistory(input: AddDeploymentHistoryEntryInput) {
    setHistoryEntries(addDeploymentHistoryEntry(input));
  }

  useEffect(() => {
    const key = `vercel:${vercelReadiness.status}:${vercelReadiness.message}`;
    if (readinessHistoryKeys.current.has(key)) return;
    readinessHistoryKeys.current.add(key);
    recordHistory({
      action: 'Vercel readiness checked',
      status:
        vercelReadiness.status === 'Ready to connect'
          ? 'Ready'
          : vercelReadiness.status === 'Failed production check'
            ? 'Failed'
            : 'Not ready',
      details: `${vercelReadiness.status}: ${vercelReadiness.message}`,
    });
  }, [vercelReadiness.message, vercelReadiness.status]);

  useEffect(() => {
    const key = `android:${androidReadiness.status}:${androidReadiness.message}`;
    if (readinessHistoryKeys.current.has(key)) return;
    readinessHistoryKeys.current.add(key);
    recordHistory({
      action: 'Android readiness checked',
      status:
        androidReadiness.status === 'Ready to configure'
          ? 'Ready'
          : androidReadiness.status === 'Failed production check'
            ? 'Failed'
            : 'Not ready',
      details: `${androidReadiness.status}: ${androidReadiness.message}`,
    });
  }, [androidReadiness.message, androidReadiness.status]);

  const handleDownloadProject = async () => {
    if (!canDownload) return;
    setDownloadStatus('Preparing');
    try {
      const blob = await createProjectZipBlob(exportFiles);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = projectZipFileName(snapshot.projectName);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDownloadStatus('Downloaded');
      recordHistory({
        action: 'ZIP downloaded',
        status: 'Passed',
        details: `${exportFiles.length} files exported as ${projectZipFileName(
          snapshot.projectName
        )}.`,
      });
    } catch (error) {
      console.error('Project ZIP export failed:', error);
      setDownloadStatus('Failed');
      recordHistory({
        action: 'ZIP downloaded',
        status: 'Failed',
        details:
          error instanceof Error ? error.message : 'Project ZIP export failed.',
      });
    }
  };

  const handleProductionCheck = async () => {
    if (exportFiles.length === 0 || productionStatus === 'Running') return;
    setProductionStatus('Running');
    setProductionSteps(createInitialProductionCheckSteps('running'));
    setProductionMessage('Running production readiness check...');
    recordHistory({
      action: 'Production check started',
      status: 'Running',
      details: 'Running install, type check, build, runtime smoke, and quality checks.',
    });

    try {
      const result = await runValidation(exportFilesToFileNodes(exportFiles), {
        runtimeSmoke: true,
        requirements: '',
        onStatus: (label) => setProductionMessage(label),
      });
      const summary = productionCheckFromValidationResult(result);
      setProductionStatus(summary.status);
      setProductionSteps(summary.steps);
      setProductionMessage(summary.message ?? null);
      recordHistory({
        action:
          summary.status === 'Passed'
            ? 'Production check passed'
            : 'Production check failed',
        status: summary.status === 'Passed' ? 'Passed' : 'Failed',
        details: summary.message ?? 'Production readiness check completed.',
      });
    } catch (error) {
      setProductionStatus('Failed');
      setProductionSteps((steps) =>
        steps.map((step) =>
          step.status === 'running' ? { ...step, status: 'failed' } : step
        )
      );
      setProductionMessage(
        error instanceof Error ? error.message : 'Production check failed.'
      );
      recordHistory({
        action: 'Production check failed',
        status: 'Failed',
        details:
          error instanceof Error ? error.message : 'Production check failed.',
      });
    }
  };

  return (
    <main className="h-screen overflow-y-auto bg-matrix-bg text-matrix-green">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-matrix-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center border border-matrix-green bg-matrix-green-ghost text-matrix-green shadow-neon-sm">
              <Rocket size={20} />
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.42em] text-matrix-green-muted">
                Matrix Coder AI
              </p>
              <h1 className="text-3xl font-bold tracking-wide text-matrix-green-bright sm:text-4xl">
                Deployment Center
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-matrix-green-muted">
                Deployment readiness for {projectDescriptor}. Real deployment
                integrations are still disabled.
              </p>
            </div>
          </div>

          <Link
            href="/chat-workspace"
            className="inline-flex w-fit items-center gap-2 border border-matrix-border px-3 py-2 text-xs uppercase tracking-[0.28em] text-matrix-green-muted transition-colors hover:border-matrix-green hover:text-matrix-green"
          >
            <ArrowLeft size={13} />
            Workspace
          </Link>
        </header>

        <section className="mb-6 grid gap-4 border border-matrix-border bg-matrix-card/80 p-4 shadow-neon-sm md:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
              Project
            </p>
            <p className="mt-2 text-lg font-semibold text-matrix-green-bright">
              {snapshot.projectName}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
              Framework
            </p>
            <p className="mt-2 text-lg font-semibold text-matrix-green-bright">
              {snapshot.framework}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
              Files
            </p>
            <p className="mt-2 text-lg font-semibold text-matrix-green-bright">
              {snapshot.fileCount} files / {snapshot.routeCount} routes
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
              Last Generated
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-matrix-green-bright">
              {formatDate(snapshot.lastGeneratedAt)}
            </p>
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          {[
            ['Generation', snapshot.generationStatus],
            ['Validation', snapshot.validationStatus],
            ['Build', snapshot.buildStatus],
            ['Preview', snapshot.previewStatus],
          ].map(([label, status]) => (
            <article
              key={label}
              className="border border-matrix-border bg-matrix-card p-4 shadow-neon-sm"
            >
              <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-matrix-green-muted">
                {label}
              </p>
              <StatusPill status={status as DeploymentStatus} />
            </article>
          ))}
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Deployment Readiness
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                {ready ? 'Ready when deployment is enabled' : 'Checks still pending'}
              </h2>
            </div>
            <StatusPill status={snapshot.checklist.readyForDeployment} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {checklistItems.map((item) => {
              const status = snapshot.checklist[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 border border-matrix-border bg-matrix-bg/70 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <ChecklistIcon status={status} />
                    <span className="text-sm font-medium text-matrix-green-bright">
                      {item.label}
                    </span>
                  </div>
                  <StatusPill status={status} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Production Build Check
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                Run readiness validation before export or deploy
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-matrix-green-muted">
                Uses the existing Matrix Coder validation pipeline against the
                current generated project files. Nothing is deployed.
              </p>
              {productionMessage && (
                <p className="mt-3 text-xs leading-5 text-matrix-green-muted">
                  {productionMessage}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span
                className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${productionStatusClasses(productionStatus)}`}
              >
                {productionStatus}
              </span>
              <button
                type="button"
                onClick={handleProductionCheck}
                disabled={exportFiles.length === 0 || productionStatus === 'Running'}
                className="inline-flex items-center justify-center gap-2 border border-matrix-green bg-matrix-green-ghost px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-bright transition-colors hover:bg-matrix-green/20 disabled:cursor-not-allowed disabled:border-matrix-border disabled:bg-matrix-bg disabled:text-matrix-green-muted"
              >
                <Rocket size={14} />
                Run Production Check
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {productionSteps.map((step) => (
              <div
                key={step.key}
                className="border border-matrix-border bg-matrix-bg/70 p-3"
                title={step.message}
              >
                <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  {step.label}
                </p>
                <span
                  className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${productionStatusClasses(step.status)}`}
                >
                  {productionStatusLabel(step.status)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Vercel Deployment
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                Prepare this project for Vercel
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-matrix-green-muted">
                {vercelReadiness.message}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span
                className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${vercelStatusClasses(vercelReadiness.status)}`}
              >
                {vercelReadiness.status}
              </span>
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 border border-matrix-border bg-matrix-bg px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-muted"
              >
                <Cloud size={14} />
                Connect Vercel - Coming next
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              ['Vercel project name', 'Not connected yet'],
              ['Production URL', 'Not available yet'],
              ['Last deployment time', 'No deployments yet'],
              ['Deployment logs', 'Logs will appear after first deployment'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border border-matrix-border bg-matrix-bg/70 p-4"
              >
                <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  {label}
                </p>
                <p className="text-sm font-semibold leading-6 text-matrix-green-bright">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Android / Capacitor
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                Prepare this project for Android
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-matrix-green-muted">
                {androidReadiness.message}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span
                className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${androidStatusClasses(androidReadiness.status)}`}
              >
                {androidReadiness.status}
              </span>
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 border border-matrix-border bg-matrix-bg px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-muted"
              >
                <Smartphone size={14} />
                Configure Android - Coming next
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {[
              ['App name', snapshot.projectName],
              ['App ID / package name', 'Not configured yet'],
              ['Android project path', 'Not generated yet'],
              ['APK / AAB status', 'No Android build yet'],
              ['Last Android build time', 'No builds yet'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border border-matrix-border bg-matrix-bg/70 p-4"
              >
                <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  {label}
                </p>
                <p className="text-sm font-semibold leading-6 text-matrix-green-bright">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Deployment Activity
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                Recent actions
              </h2>
            </div>
            <span className="border border-matrix-border bg-matrix-bg px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
              Session history
            </span>
          </div>

          {historyEntries.length === 0 ? (
            <div className="border border-matrix-border bg-matrix-bg/70 p-4 text-sm text-matrix-green-muted">
              No Deployment Center actions have been recorded in this session.
            </div>
          ) : (
            <div className="space-y-3">
              {historyEntries.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-3 border border-matrix-border bg-matrix-bg/70 p-4 md:grid-cols-[160px_1fr_auto]"
                >
                  <p className="text-xs leading-5 text-matrix-green-muted">
                    {formatDate(entry.timestamp)}
                  </p>
                  <div>
                    <p className="text-sm font-semibold text-matrix-green-bright">
                      {entry.action}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-matrix-green-muted">
                      {entry.details}
                    </p>
                  </div>
                  <span
                    className={`inline-flex h-fit items-center justify-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${historyStatusClasses(entry.status)}`}
                  >
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid flex-1 gap-4 md:grid-cols-2">
          {deploymentOptions.map((option) => {
            const Icon = option.icon;
            const isDownloadOption = option.title === 'Project Files / Download';
            const optionStatus = isDownloadOption
              ? exportFiles.length > 0
                ? downloadStatus
                : 'No project files'
              : option.status;
            return (
              <article
                key={option.title}
                className="flex min-h-[220px] flex-col justify-between border border-matrix-border bg-matrix-card p-5 shadow-neon-sm transition-colors hover:border-matrix-green"
              >
                <div>
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center border border-current bg-matrix-green-ghost ${option.accent}`}
                    >
                      <Icon size={19} />
                    </div>
                    <span className="border border-matrix-border bg-matrix-bg px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                      {optionStatus}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold tracking-wide text-matrix-green-bright">
                    {option.title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-matrix-green-muted">
                    {option.description}
                  </p>
                  {isDownloadOption && (
                    <button
                      type="button"
                      onClick={handleDownloadProject}
                      disabled={!canDownload}
                      className="mt-5 inline-flex items-center gap-2 border border-matrix-green bg-matrix-green-ghost px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-bright transition-colors hover:bg-matrix-green/20 disabled:cursor-not-allowed disabled:border-matrix-border disabled:bg-matrix-bg disabled:text-matrix-green-muted"
                    >
                      <Download size={14} />
                      Download Project ZIP
                    </button>
                  )}
                </div>

                <div className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-matrix-green-muted">
                  <Archive size={12} />
                  {isDownloadOption
                    ? `${exportFiles.length} exportable files`
                    : ready
                      ? 'Project checks passed'
                      : 'Waiting on readiness checks'}
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
