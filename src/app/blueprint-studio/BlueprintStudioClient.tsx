'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Boxes,
  Braces,
  Cable,
  FolderTree,
  GitBranch,
  Layers3,
  Plus,
  Route,
  Save,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { readBuildManifestFromHandoffStorage } from '@/lib/build-suite/blueprintSummary';
import { writeMatrixBuildSuiteChatHandoff } from '@/lib/build-suite/chatHandoff';
import type { BuildManifest } from '@/lib/build-suite/buildManifest';
import {
  addBlueprintDataModel,
  addBlueprintListItem,
  addBlueprintRoute,
  buildBlueprintGenerationPrompt,
  createBlueprintDraftFromManifest,
  loadBlueprintDraft,
  removeBlueprintDataModel,
  removeBlueprintListItem,
  removeBlueprintRoute,
  reorderBlueprintListItem,
  reorderBlueprintRoutes,
  saveBlueprintDraft,
  touchBlueprintDraft,
  updateBlueprintDataModel,
  updateBlueprintListItem,
  updateBlueprintRoute,
  validateBlueprintDraft,
  type BlueprintDataModel,
  type BlueprintDraft,
  type BlueprintDraftItem,
  type BlueprintDraftListKey,
  type BlueprintRouteItem,
} from '@/lib/blueprint-studio/blueprintDraft';

const LIST_SECTIONS: Array<{
  key: BlueprintDraftListKey;
  title: string;
  description: string;
  icon: typeof Layers3;
  addLabel: string;
}> = [
  {
    key: 'components',
    title: 'Components',
    description: 'Reusable UI and feature modules the app should generate.',
    icon: Layers3,
    addLabel: 'Add component',
  },
  {
    key: 'integrations',
    title: 'Integrations',
    description: 'External services, APIs, auth, storage, payments, and AI tools.',
    icon: Cable,
    addLabel: 'Add integration',
  },
  {
    key: 'userRoles',
    title: 'User roles',
    description: 'Primary account types and permissions the app should account for.',
    icon: Users,
    addLabel: 'Add role',
  },
  {
    key: 'navigation',
    title: 'Navigation',
    description: 'Menus, primary links, and user movement through the app.',
    icon: GitBranch,
    addLabel: 'Add nav item',
  },
  {
    key: 'folderStructure',
    title: 'Folder structure',
    description: 'Expected folders and ownership boundaries for the generated code.',
    icon: FolderTree,
    addLabel: 'Add folder',
  },
];

function readManifestFromAvailableStorage(): BuildManifest | null {
  if (typeof window === 'undefined') return null;
  return (
    readBuildManifestFromHandoffStorage(window.sessionStorage) ??
    readBuildManifestFromHandoffStorage(window.localStorage)
  );
}

function loadDraftFromAvailableStorage(): BlueprintDraft | null {
  if (typeof window === 'undefined') return null;
  return (
    loadBlueprintDraft(window.sessionStorage) ??
    loadBlueprintDraft(window.localStorage)
  );
}

function persistDraft(draft: BlueprintDraft): void {
  if (typeof window === 'undefined') return;
  saveBlueprintDraft(window.sessionStorage, draft);
  saveBlueprintDraft(window.localStorage, draft);
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-700/80 bg-[#10151c] px-3 py-2 text-sm font-medium text-slate-100 caret-matrix-green outline-none transition-colors placeholder:text-slate-500 focus:border-matrix-green/80 focus:bg-[#111923] focus:ring-1 focus:ring-matrix-green/25 ${
        props.className ?? ''
      }`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full resize-y rounded-lg border border-slate-700/80 bg-[#10151c] px-3 py-2 text-sm leading-6 text-slate-100 caret-matrix-green outline-none transition-colors placeholder:text-slate-500 focus:border-matrix-green/80 focus:bg-[#111923] focus:ring-1 focus:ring-matrix-green/25 ${
        props.className ?? ''
      }`}
    />
  );
}

function SmallButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/70 text-slate-300 transition-colors hover:border-matrix-green/70 hover:bg-matrix-green-ghost/70 hover:text-matrix-green disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Layers3;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800/90 border-l-violet-400/40 bg-[#0d1117]/92 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-400/10 text-violet-200">
            <Icon size={17} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              {description}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}

function RouteEditor({
  route,
  index,
  count,
  onUpdate,
  onRemove,
  onMove,
}: {
  route: BlueprintRouteItem;
  index: number;
  count: number;
  onUpdate: (id: string, patch: Partial<BlueprintRouteItem>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-slate-800/90 bg-slate-950/45 p-3 lg:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-2">
        <FieldLabel>Route path</FieldLabel>
        <TextInput
          value={route.path}
          onChange={(event) => onUpdate(route.id, { path: event.target.value })}
          placeholder="/dashboard"
        />
      </div>
      <div className="space-y-2">
        <FieldLabel>Label</FieldLabel>
        <TextInput
          value={route.name}
          onChange={(event) => onUpdate(route.id, { name: event.target.value })}
          placeholder="Dashboard"
        />
      </div>
      <div className="flex items-end gap-2">
        <SmallButton
          title="Move route up"
          disabled={index === 0}
          onClick={() => onMove(route.id, -1)}
        >
          <ArrowUp size={15} aria-hidden="true" />
        </SmallButton>
        <SmallButton
          title="Move route down"
          disabled={index === count - 1}
          onClick={() => onMove(route.id, 1)}
        >
          <ArrowDown size={15} aria-hidden="true" />
        </SmallButton>
        <SmallButton title="Remove route" onClick={() => onRemove(route.id)}>
          <Trash2 size={15} aria-hidden="true" />
        </SmallButton>
      </div>
    </div>
  );
}

function DataModelEditor({
  model,
  index,
  count,
  onUpdate,
  onRemove,
  onMove,
}: {
  model: BlueprintDataModel;
  index: number;
  count: number;
  onUpdate: (id: string, patch: Partial<BlueprintDataModel>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-slate-800/90 bg-slate-950/45 p-3 lg:grid-cols-[0.8fr_1.2fr_auto]">
      <div className="space-y-2">
        <FieldLabel>Model</FieldLabel>
        <TextInput
          value={model.name}
          onChange={(event) => onUpdate(model.id, { name: event.target.value })}
          placeholder="Contact"
        />
      </div>
      <div className="space-y-2">
        <FieldLabel>Fields</FieldLabel>
        <TextInput
          value={model.fields.join(', ')}
          onChange={(event) =>
            onUpdate(model.id, {
              fields: event.target.value
                .split(',')
                .map((field) => field.trim())
                .filter(Boolean),
            })
          }
          placeholder="name, email, status"
        />
      </div>
      <div className="flex items-end gap-2">
        <SmallButton
          title="Move model up"
          disabled={index === 0}
          onClick={() => onMove(model.id, -1)}
        >
          <ArrowUp size={15} aria-hidden="true" />
        </SmallButton>
        <SmallButton
          title="Move model down"
          disabled={index === count - 1}
          onClick={() => onMove(model.id, 1)}
        >
          <ArrowDown size={15} aria-hidden="true" />
        </SmallButton>
        <SmallButton title="Remove model" onClick={() => onRemove(model.id)}>
          <Trash2 size={15} aria-hidden="true" />
        </SmallButton>
      </div>
    </div>
  );
}

function ListItemEditor({
  item,
  index,
  count,
  onUpdate,
  onRemove,
  onMove,
}: {
  item: BlueprintDraftItem;
  index: number;
  count: number;
  onUpdate: (id: string, patch: Partial<BlueprintDraftItem>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-slate-800/90 bg-slate-950/45 p-3 lg:grid-cols-[0.8fr_1.2fr_auto]">
      <div className="space-y-2">
        <FieldLabel>Name</FieldLabel>
        <TextInput
          value={item.name}
          onChange={(event) => onUpdate(item.id, { name: event.target.value })}
          placeholder="Item name"
        />
      </div>
      <div className="space-y-2">
        <FieldLabel>Description</FieldLabel>
        <TextInput
          value={item.description ?? ''}
          onChange={(event) =>
            onUpdate(item.id, { description: event.target.value })
          }
          placeholder="Optional detail"
        />
      </div>
      <div className="flex items-end gap-2">
        <SmallButton
          title="Move item up"
          disabled={index === 0}
          onClick={() => onMove(item.id, -1)}
        >
          <ArrowUp size={15} aria-hidden="true" />
        </SmallButton>
        <SmallButton
          title="Move item down"
          disabled={index === count - 1}
          onClick={() => onMove(item.id, 1)}
        >
          <ArrowDown size={15} aria-hidden="true" />
        </SmallButton>
        <SmallButton title="Remove item" onClick={() => onRemove(item.id)}>
          <Trash2 size={15} aria-hidden="true" />
        </SmallButton>
      </div>
    </div>
  );
}

export default function BlueprintStudioClient() {
  const router = useRouter();
  const [sourceManifest, setSourceManifest] = useState<BuildManifest | null>(null);
  const [draft, setDraft] = useState<BlueprintDraft | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    const manifest = readManifestFromAvailableStorage();
    const storedDraft = loadDraftFromAvailableStorage();
    const initialDraft = storedDraft ?? createBlueprintDraftFromManifest(manifest);
    setSourceManifest(manifest);
    setDraft(initialDraft);
    persistDraft(initialDraft);
  }, []);

  const warnings = useMemo(
    () => (draft ? validateBlueprintDraft(draft) : []),
    [draft]
  );

  function commit(nextDraft: BlueprintDraft, message = 'Blueprint draft saved') {
    setDraft(nextDraft);
    persistDraft(nextDraft);
    setSavedMessage(message);
  }

  function patchDraft(patch: Partial<BlueprintDraft>) {
    if (!draft) return;
    commit(touchBlueprintDraft({ ...draft, ...patch }));
  }

  function moveDataModel(id: string, direction: -1 | 1) {
    if (!draft) return;
    const models = [...draft.dataModels];
    const index = models.findIndex((model) => model.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= models.length) return;
    [models[index], models[nextIndex]] = [models[nextIndex], models[index]];
    commit(touchBlueprintDraft({ ...draft, dataModels: models }));
  }

  function resetFromManifest() {
    const nextDraft = createBlueprintDraftFromManifest(sourceManifest);
    commit(nextDraft, 'Blueprint draft reset from Build Manifest');
  }

  function sendBlueprintToWorkspace() {
    if (!draft) return;
    const prompt = buildBlueprintGenerationPrompt(draft);
    persistDraft(draft);
    writeMatrixBuildSuiteChatHandoff(
      window.sessionStorage,
      prompt,
      new Date(),
      draft.sourceManifest ?? sourceManifest ?? undefined,
      draft
    );
    router.push('/chat-workspace');
  }

  if (!draft) {
    return (
      <div className="min-h-full bg-[#06090d] px-4 py-8 text-slate-100">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-800/90 bg-[#0d1117]/92 p-8">
          <Boxes size={22} aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-100">
            Loading Blueprint Studio
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-hidden bg-[#06090d] px-4 py-8 text-slate-100 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-800/90 bg-[#0d1117]/92 p-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)] md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-4xl">
              <p className="text-[11px] uppercase tracking-[0.30em] text-violet-300">
                Matrix Blueprint Studio
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-100 md:text-4xl">
                Approve the build before generation
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate-400 md:text-base">
                Edit the blueprint draft, review warnings, then send the approved
                plan to the workspace. The original Build Manifest stays intact.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/matrix-build-suite"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-matrix-green/70 hover:bg-matrix-green-ghost/70 hover:text-matrix-green"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Build Suite
              </Link>
              <button
                type="button"
                onClick={resetFromManifest}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-matrix-green/70 hover:bg-matrix-green-ghost/70 hover:text-matrix-green"
              >
                <Save size={15} aria-hidden="true" />
                Reset draft
              </button>
              <button
                type="button"
                onClick={sendBlueprintToWorkspace}
                className="inline-flex items-center gap-2 rounded-lg border border-matrix-green/70 bg-matrix-green px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-black transition-colors hover:bg-matrix-green-bright"
              >
                <Send size={15} aria-hidden="true" />
                Send Blueprint to Workspace
              </button>
            </div>
          </div>
          {savedMessage ? (
            <p className="mt-5 rounded-lg border border-slate-800/90 bg-slate-950/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {savedMessage}
            </p>
          ) : null}
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel
            title="Project"
            description="Name the app and describe what Matrix Coder should build."
            icon={Braces}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Project name</FieldLabel>
                <TextInput
                  value={draft.projectName}
                  onChange={(event) =>
                    patchDraft({ projectName: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>Deployment target</FieldLabel>
                <TextInput
                  value={draft.deploymentTarget}
                  onChange={(event) =>
                    patchDraft({ deploymentTarget: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel>App description</FieldLabel>
              <TextArea
                value={draft.appDescription}
                onChange={(event) =>
                  patchDraft({ appDescription: event.target.value })
                }
              />
            </div>
          </Panel>

          <Panel
            title="Warnings"
            description="Lightweight checks before sending the blueprint to generation."
            icon={AlertTriangle}
          >
            {warnings.length ? (
              warnings.map((warning) => (
                <div
                  key={`${warning.code}-${warning.target ?? warning.message}`}
                  className="border border-amber-400/40 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100"
                >
                  <span className="font-bold uppercase tracking-[0.18em]">
                    {warning.severity}
                  </span>
                  <p className="mt-1">{warning.message}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/45 p-4 text-sm font-semibold text-slate-300">
                No blueprint warnings detected.
              </div>
            )}
          </Panel>
        </section>

        <Panel
          title="Routes"
          description="Add, rename, remove, and reorder App Router pages."
          icon={Route}
        >
          {draft.routes.map((route, index) => (
            <RouteEditor
              key={route.id}
              route={route}
              index={index}
              count={draft.routes.length}
              onUpdate={(id, patch) =>
                commit(updateBlueprintRoute(draft, id, patch))
              }
              onRemove={(id) => commit(removeBlueprintRoute(draft, id))}
              onMove={(id, direction) =>
                commit(reorderBlueprintRoutes(draft, id, direction))
              }
            />
          ))}
          <button
            type="button"
            onClick={() => commit(addBlueprintRoute(draft, '/new-route'))}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-matrix-green/70 hover:bg-matrix-green-ghost/70 hover:text-matrix-green"
          >
            <Plus size={15} aria-hidden="true" />
            Add route
          </button>
        </Panel>

        <Panel
          title="Data models"
          description="Define entities and fields the generated app should support."
          icon={Braces}
        >
          {draft.dataModels.map((model, index) => (
            <DataModelEditor
              key={model.id}
              model={model}
              index={index}
              count={draft.dataModels.length}
              onUpdate={(id, patch) =>
                commit(updateBlueprintDataModel(draft, id, patch))
              }
              onRemove={(id) => commit(removeBlueprintDataModel(draft, id))}
              onMove={moveDataModel}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              commit(addBlueprintDataModel(draft, 'New Model', ['id', 'name']))
            }
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-matrix-green/70 hover:bg-matrix-green-ghost/70 hover:text-matrix-green"
          >
            <Plus size={15} aria-hidden="true" />
            Add model
          </button>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          {LIST_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Panel
                key={section.key}
                title={section.title}
                description={section.description}
                icon={Icon}
              >
                {draft[section.key].map((item, index) => (
                  <ListItemEditor
                    key={item.id}
                    item={item}
                    index={index}
                    count={draft[section.key].length}
                    onUpdate={(id, patch) =>
                      commit(updateBlueprintListItem(draft, section.key, id, patch))
                    }
                    onRemove={(id) =>
                      commit(removeBlueprintListItem(draft, section.key, id))
                    }
                    onMove={(id, direction) =>
                      commit(
                        reorderBlueprintListItem(draft, section.key, id, direction)
                      )
                    }
                  />
                ))}
                <button
                  type="button"
                  onClick={() =>
                    commit(addBlueprintListItem(draft, section.key, 'New item'))
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-matrix-green/70 hover:bg-matrix-green-ghost/70 hover:text-matrix-green"
                >
                  <Plus size={15} aria-hidden="true" />
                  {section.addLabel}
                </button>
              </Panel>
            );
          })}
        </div>
      </div>
    </div>
  );
}
