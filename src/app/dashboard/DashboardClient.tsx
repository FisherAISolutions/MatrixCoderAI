'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Blocks,
  CheckCircle2,
  Clock3,
  FolderKanban,
  MessageSquare,
  Rocket,
  Ruler,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  loadDeploymentWorkspaceSnapshot,
  type DeploymentStatus,
  type DeploymentWorkspaceSnapshot,
} from '@/lib/deployment/workspaceStatus';
import { peekMatrixBuildSuiteChatHandoff } from '@/lib/build-suite/chatHandoff';
import WorkflowNav from '@/components/workflow/WorkflowNav';
import {
  BUILD_SUITE_SAVED_BUILDS_STORAGE_KEY,
  type BuildSuiteSavedBuild,
} from '@/lib/build-suite/savedBuilds';

interface BuildSuiteSnapshot {
  type: 'handoff' | 'saved-build';
  name: string;
  createdAt?: string;
  updatedAt?: string;
  detail: string;
}

interface ActionCardConfig {
  title: string;
  description: string;
  href?: string;
  icon: LucideIcon;
  status?: string;
  accent: string;
}

const ACTION_CARDS: ActionCardConfig[] = [
  {
    title: 'Start in Workspace',
    description: 'Open the chat, files, validation, terminal, and generated app preview.',
    href: '/chat-workspace',
    icon: MessageSquare,
    status: 'Ready',
    accent: 'from-matrix-green/25 to-cyan-400/10',
  },
  {
    title: 'Start with Matrix Build Suite',
    description: 'Browse app templates, enhancements, live previews, and prompt handoff.',
    href: '/matrix-build-suite',
    icon: Blocks,
    status: 'Ready',
    accent: 'from-purple-400/25 to-matrix-green/10',
  },
  {
    title: 'Open Deployment Center',
    description: 'Review readiness, export a ZIP, run production checks, and prepare deploys.',
    href: '/deployment-center',
    icon: Rocket,
    status: 'Ready',
    accent: 'from-emerald-400/20 to-blue-400/10',
  },
  {
    title: 'Blueprint Studio',
    description: 'Plan app architecture, pages, data models, and product flows visually.',
    href: '/blueprint-studio',
    icon: Ruler,
    status: 'Ready',
    accent: 'from-amber-300/15 to-matrix-green/5',
  },
  {
    title: 'Projects',
    description: 'Manage saved generated projects, versions, exports, and shared workspaces.',
    href: '/projects',
    icon: FolderKanban,
    status: 'Ready',
    accent: 'from-sky-400/15 to-matrix-green/5',
  },
];

function formatDate(value?: string): string {
  if (!value) return 'Not available yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function normalizeStatus(status?: DeploymentStatus): string {
  if (!status) return 'unknown';
  return status;
}

function statusClassName(status?: DeploymentStatus): string {
  switch (status) {
    case 'passed':
      return 'border-matrix-green bg-matrix-green-ghost text-matrix-green';
    case 'failed':
      return 'border-red-400/70 bg-red-500/10 text-red-200';
    case 'running':
      return 'border-cyan-300/70 bg-cyan-400/10 text-cyan-100';
    case 'pending':
      return 'border-yellow-300/60 bg-yellow-300/10 text-yellow-100';
    default:
      return 'border-matrix-border bg-matrix-panel text-matrix-green-muted';
  }
}

function readBuildSuiteSnapshot(): BuildSuiteSnapshot | null {
  if (typeof window === 'undefined') return null;

  for (const storage of [window.sessionStorage, window.localStorage]) {
    const handoff = peekMatrixBuildSuiteChatHandoff(storage);
    if (handoff) {
      return {
        type: 'handoff',
        name: handoff.blueprintDraft ? 'Blueprint ready for chat' : 'Prompt ready for chat',
        createdAt: handoff.createdAt,
        detail: `${handoff.prompt.trim().length.toLocaleString()} prompt characters${
          handoff.buildManifest ? ' - Build Manifest included' : ''
        }`,
      };
    }
  }

  const savedRaw = window.localStorage.getItem(BUILD_SUITE_SAVED_BUILDS_STORAGE_KEY);
  if (!savedRaw) return null;

  try {
    const parsed = JSON.parse(savedRaw);
    if (!Array.isArray(parsed)) return null;
    const builds = parsed
      .filter((item): item is BuildSuiteSavedBuild => {
        return (
          item &&
          typeof item === 'object' &&
          typeof item.name === 'string' &&
          typeof item.updatedAt === 'string' &&
          typeof item.finalPrompt === 'string'
        );
      })
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    const latest = builds[0];
    if (!latest) return null;

    return {
      type: 'saved-build',
      name: latest.name,
      createdAt: latest.createdAt,
      updatedAt: latest.updatedAt,
      detail: `${latest.finalPrompt.length.toLocaleString()} prompt characters${
        latest.favorite ? ' - favorite' : ''
      }`,
    };
  } catch {
    return null;
  }
}

function StatusPill({
  label,
  status,
}: {
  label: string;
  status?: DeploymentStatus;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border border-matrix-border bg-matrix-panel/60 px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
        {label}
      </span>
      <span
        className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusClassName(
          status
        )}`}
      >
        {normalizeStatus(status)}
      </span>
    </div>
  );
}

function ActionCard({ card }: { card: ActionCardConfig }) {
  const Icon = card.icon;
  const content = (
    <div
      className={`group relative h-full overflow-hidden border border-matrix-border bg-matrix-panel/70 p-5 transition-all duration-200 hover:-translate-y-1 hover:border-matrix-green hover:shadow-[0_0_30px_rgba(0,255,102,0.12)] ${
        card.href ? '' : 'opacity-75'
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center border border-matrix-border bg-matrix-bg text-matrix-green transition-colors group-hover:border-matrix-green">
          <Icon size={20} aria-hidden="true" />
        </div>
        {card.status && (
          <span className="border border-matrix-border px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-matrix-green-muted">
            {card.status}
          </span>
        )}
      </div>
      <h2 className="mt-5 text-lg font-bold text-matrix-green neon-text-glow">
        {card.title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-matrix-readable">{card.description}</p>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-matrix-green">
        {card.href ? 'Open' : 'Coming soon'}
      </p>
    </div>
  );

  if (!card.href) return <div aria-disabled="true">{content}</div>;

  return (
    <Link href={card.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matrix-green">
      {content}
    </Link>
  );
}

function ProjectStatusCard({
  snapshot,
}: {
  snapshot: DeploymentWorkspaceSnapshot | null;
}) {
  if (!snapshot) {
    return (
      <section className="border border-matrix-border bg-matrix-panel/70 p-5">
        <div className="flex items-center gap-3">
          <Rocket size={18} aria-hidden="true" />
          <h2 className="text-lg font-bold text-matrix-green">Last generated project</h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-matrix-readable">
          No generated project snapshot is available yet. Start in Workspace to create one,
          then this card will show the project name, framework, routes, and latest status.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-matrix-border bg-matrix-panel/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-matrix-green-muted">
            Last generated project
          </p>
          <h2 className="mt-2 text-2xl font-bold text-matrix-green neon-text-glow">
            {snapshot.projectName}
          </h2>
        </div>
        <span className="border border-matrix-border px-3 py-1 text-xs uppercase tracking-[0.18em] text-matrix-green-muted">
          {snapshot.framework}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <StatusPill label="Generation" status={snapshot.generationStatus} />
        <StatusPill label="Validation" status={snapshot.validationStatus} />
        <StatusPill label="Build" status={snapshot.buildStatus} />
        <StatusPill label="Preview" status={snapshot.previewStatus} />
      </div>

      <div className="mt-5 grid gap-3 border-t border-matrix-border pt-5 text-sm text-matrix-readable sm:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
            Files
          </p>
          <p className="mt-1 font-bold text-matrix-green">{snapshot.fileCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
            Routes
          </p>
          <p className="mt-1 font-bold text-matrix-green">{snapshot.routeCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
            Last generated
          </p>
          <p className="mt-1 font-bold text-matrix-green">
            {formatDate(snapshot.lastGeneratedAt)}
          </p>
        </div>
      </div>
    </section>
  );
}

function BuildSuiteStatusCard({
  buildSuite,
}: {
  buildSuite: BuildSuiteSnapshot | null;
}) {
  return (
    <section className="border border-matrix-border bg-matrix-panel/70 p-5">
      <div className="flex items-center gap-3">
        <Sparkles size={18} aria-hidden="true" />
        <h2 className="text-lg font-bold text-matrix-green">Build Suite activity</h2>
      </div>
      {buildSuite ? (
        <div className="mt-4 space-y-3 text-sm text-matrix-readable">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-bold text-matrix-green">{buildSuite.name}</p>
            <span className="border border-matrix-border px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-matrix-green-muted">
              {buildSuite.type === 'handoff' ? 'Chat handoff' : 'Saved build'}
            </span>
          </div>
          <p>{buildSuite.detail}</p>
          <p className="text-xs text-matrix-green-muted">
            {buildSuite.updatedAt
              ? `Updated ${formatDate(buildSuite.updatedAt)}`
              : `Created ${formatDate(buildSuite.createdAt)}`}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-matrix-readable">
          No Build Suite prompt or saved build is available yet. Open Matrix Build
          Suite to create a guided app configuration.
        </p>
      )}
    </section>
  );
}

function DeploymentReadinessCard({
  snapshot,
}: {
  snapshot: DeploymentWorkspaceSnapshot | null;
}) {
  const checklist = snapshot?.checklist;
  const ready = checklist?.readyForDeployment ?? 'pending';

  return (
    <section className="border border-matrix-border bg-matrix-panel/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={18} aria-hidden="true" />
          <h2 className="text-lg font-bold text-matrix-green">Deployment readiness</h2>
        </div>
        <span
          className={`border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusClassName(
            ready
          )}`}
        >
          {normalizeStatus(ready)}
        </span>
      </div>

      {checklist ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <StatusPill label="Project generated" status={checklist.projectGenerated} />
          <StatusPill label="Imports valid" status={checklist.importsValid} />
          <StatusPill label="TypeScript" status={checklist.typeScriptPasses} />
          <StatusPill label="Build" status={checklist.buildPasses} />
          <StatusPill label="Runtime smoke" status={checklist.runtimeSmokePasses} />
          <StatusPill label="Quality" status={checklist.generatedQualityPasses} />
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-matrix-readable">
          Run a generation and production check to populate deployment readiness.
        </p>
      )}
    </section>
  );
}

export default function DashboardClient() {
  const [snapshot, setSnapshot] = useState<DeploymentWorkspaceSnapshot | null>(null);
  const [buildSuite, setBuildSuite] = useState<BuildSuiteSnapshot | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  useEffect(() => {
    setSnapshot(loadDeploymentWorkspaceSnapshot());
    setBuildSuite(readBuildSuiteSnapshot());
    setLoadedAt(new Date().toISOString());
  }, []);

  const subtitle = useMemo(() => {
    if (!loadedAt) return 'Choose a starting point for your next app.';
    return `Workspace snapshot refreshed ${formatDate(loadedAt)}.`;
  }, [loadedAt]);

  return (
    <div className="min-h-full overflow-x-hidden bg-matrix-bg px-4 py-8 text-matrix-green md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="border border-matrix-border bg-matrix-panel/60 p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Matrix Coder AI
              </p>
              <h1 className="mt-3 text-3xl font-bold text-matrix-green neon-text-glow md:text-5xl">
                Dashboard
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-matrix-readable md:text-base">
                Start a new generation, shape an app visually, review deployment
                readiness, or return to your latest workspace.
              </p>
            </div>
            <div className="border border-matrix-border bg-matrix-bg/70 px-4 py-3 text-xs uppercase tracking-[0.2em] text-matrix-green-muted">
              <Clock3 className="mb-2" size={18} aria-hidden="true" />
              {subtitle}
            </div>
          </div>
        </header>

        <WorkflowNav
          context={{
            hasBuildManifest: Boolean(buildSuite),
            hasBlueprintDraft: buildSuite?.type === 'handoff',
            hasGeneratedProject: Boolean(snapshot),
            deploymentReady: snapshot?.checklist.readyForDeployment === 'passed',
          }}
        />

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-matrix-green">Where to start</h2>
            <span className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
              Action cards
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {ACTION_CARDS.map((card) => (
              <ActionCard key={card.title} card={card} />
            ))}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <ProjectStatusCard snapshot={snapshot} />
          <div className="grid gap-5">
            <BuildSuiteStatusCard buildSuite={buildSuite} />
            <DeploymentReadinessCard snapshot={snapshot} />
          </div>
        </section>
      </div>
    </div>
  );
}
