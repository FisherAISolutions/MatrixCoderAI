'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Braces,
  Cable,
  FolderTree,
  GitBranch,
  Layers3,
  Lock,
  Map,
  Route,
  Workflow,
} from 'lucide-react';
import {
  createBlueprintSummary,
  readBuildManifestFromHandoffStorage,
  type BlueprintSummary,
  type BlueprintSummaryGroup,
} from '@/lib/build-suite/blueprintSummary';

const WORKFLOW_CARDS = [
  {
    title: 'Review app blueprint',
    description: 'A future command center for turning Build Suite selections into a structured implementation map.',
    icon: Map,
  },
  {
    title: 'Routes',
    description: 'Inspect intended pages, route groups, navigation patterns, and App Router structure.',
    icon: Route,
  },
  {
    title: 'Data models',
    description: 'Outline entities, fields, relationships, storage choices, and persistence boundaries.',
    icon: Braces,
  },
  {
    title: 'Components',
    description: 'Plan reusable UI, feature modules, shared layout, and client/server component boundaries.',
    icon: Layers3,
  },
  {
    title: 'Integrations',
    description: 'Review external services such as auth, payments, AI, storage, maps, messaging, and analytics.',
    icon: Cable,
  },
  {
    title: 'User flows',
    description: 'Map common workflows, empty states, key actions, and mobile behavior before generation.',
    icon: Workflow,
  },
  {
    title: 'Folder structure',
    description: 'Preview the intended src/app, src/components, src/lib, and src/types organization.',
    icon: FolderTree,
  },
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function BlueprintGroupCard({ group }: { group: BlueprintSummaryGroup }) {
  return (
    <section className="border border-matrix-border bg-matrix-panel/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-matrix-green neon-text-glow">
            {group.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-matrix-readable">
            {group.description}
          </p>
        </div>
        <span className="border border-matrix-border px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-matrix-green-muted">
          Read only
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {group.items.map((item) => (
          <span
            key={item}
            className="border border-matrix-border bg-matrix-bg/60 px-3 py-2 text-xs font-semibold text-matrix-green"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function BlueprintStudioClient() {
  const [summary, setSummary] = useState<BlueprintSummary | null>(null);

  useEffect(() => {
    const manifest = readBuildManifestFromHandoffStorage(window.localStorage);
    setSummary(manifest ? createBlueprintSummary(manifest) : null);
  }, []);

  return (
    <div className="min-h-full overflow-x-hidden bg-matrix-bg px-4 py-8 text-matrix-green md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="border border-matrix-border bg-matrix-panel/60 p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <p className="text-[11px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Matrix Blueprint Studio
              </p>
              <h1 className="mt-3 text-3xl font-bold text-matrix-green neon-text-glow md:text-5xl">
                Blueprint Studio
              </h1>
              <p className="mt-4 text-sm leading-7 text-matrix-readable md:text-base">
                A read-only foundation for reviewing app structure before generation.
                Editing and generation handoff are intentionally disabled in this pass.
              </p>
            </div>
            <div className="flex items-center gap-3 border border-matrix-border bg-matrix-bg/70 px-4 py-3">
              <Lock size={18} aria-hidden="true" />
              <span className="text-xs uppercase tracking-[0.2em] text-matrix-green-muted">
                Foundation only
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {WORKFLOW_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="border border-matrix-border bg-matrix-panel/70 p-5 transition-colors hover:border-matrix-green"
              >
                <div className="flex h-11 w-11 items-center justify-center border border-matrix-border bg-matrix-bg text-matrix-green">
                  <Icon size={18} aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-base font-bold text-matrix-green">
                  {card.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-matrix-readable">
                  {card.description}
                </p>
              </div>
            );
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="border border-matrix-border bg-matrix-panel/70 p-5">
            <div className="flex items-center gap-3">
              <GitBranch size={18} aria-hidden="true" />
              <h2 className="text-xl font-bold text-matrix-green">
                Current manifest summary
              </h2>
            </div>
            {summary ? (
              <div className="mt-5 space-y-4">
                <div className="border border-matrix-border bg-matrix-bg/60 p-4">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-matrix-green-muted">
                    App type
                  </p>
                  <p className="mt-2 text-2xl font-bold text-matrix-green neon-text-glow">
                    {summary.appName}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-matrix-border bg-matrix-bg/60 p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                      Source
                    </p>
                    <p className="mt-2 font-bold text-matrix-green">
                      {summary.source}
                    </p>
                  </div>
                  <div className="border border-matrix-border bg-matrix-bg/60 p-4">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                      Created
                    </p>
                    <p className="mt-2 font-bold text-matrix-green">
                      {formatDate(summary.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="border border-matrix-border bg-matrix-bg/60 p-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                    Metadata version
                  </p>
                  <p className="mt-2 font-bold text-matrix-green">
                    {summary.metadataVersion}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 border border-matrix-border bg-matrix-bg/60 p-5">
                <Boxes size={22} aria-hidden="true" />
                <h3 className="mt-4 text-lg font-bold text-matrix-green">
                  No Build Manifest found
                </h3>
                <p className="mt-3 text-sm leading-6 text-matrix-readable">
                  Create a configuration in Matrix Build Suite and use Insert into
                  Chat. Blueprint Studio will show a read-only summary here while
                  the handoff is still available.
                </p>
                <Link
                  href="/matrix-build-suite"
                  className="mt-5 inline-flex border border-matrix-green px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-matrix-green transition-colors hover:bg-matrix-green-ghost"
                >
                  Open Matrix Build Suite
                </Link>
              </div>
            )}
          </div>

          <div className="grid gap-4">
            {summary ? (
              summary.groups.map((group) => (
                <BlueprintGroupCard key={group.title} group={group} />
              ))
            ) : (
              <section className="border border-matrix-border bg-matrix-panel/70 p-5">
                <h2 className="text-xl font-bold text-matrix-green">
                  Future blueprint areas
                </h2>
                <p className="mt-3 text-sm leading-6 text-matrix-readable">
                  Routes, data models, components, integrations, user flows, and
                  folder structure will appear here as soon as a Build Manifest is
                  available.
                </p>
              </section>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
