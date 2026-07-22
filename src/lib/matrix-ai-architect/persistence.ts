import {
  applyArchitectBlueprintHandoff,
  createArchitectDraft,
  type ArchitectBlueprintHandoffResult,
  type ArchitectDraft,
} from '@/lib/matrix-ai-architect';
import {
  loadMatrixProjectWorkspaceContext,
  loadMatrixProjectWorkspaceSnapshot,
  saveMatrixProjectWorkspaceContext,
  saveMatrixProjectWorkspaceSnapshot,
  type MatrixProjectWorkspaceContext,
  type MatrixProjectWorkspaceSnapshot,
} from '@/lib/projects/projectStore';
import {
  loadBlueprintDraft,
  saveBlueprintDraft,
  type BlueprintDraft,
} from '@/lib/blueprint-studio/blueprintDraft';
import type { MatrixIntelligenceCore } from '@/lib/intelligence-core';
import { initializeArchitectIntelligenceCore } from './intelligence';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ArchitectProjectState {
  context: MatrixProjectWorkspaceContext;
  snapshot: MatrixProjectWorkspaceSnapshot | null;
  draft: ArchitectDraft;
  intelligenceCore: MatrixIntelligenceCore;
}

function getExistingBlueprintDraft(storage: StorageLike): BlueprintDraft | null {
  const context = loadMatrixProjectWorkspaceContext(storage);
  return context.blueprintDraft ?? loadBlueprintDraft(storage);
}

export function loadArchitectProjectState(
  storage: StorageLike,
  now = new Date()
): ArchitectProjectState {
  const context = loadMatrixProjectWorkspaceContext(storage);
  const snapshot = loadMatrixProjectWorkspaceSnapshot(storage);
  const draft =
    context.architectDraft ??
    snapshot?.architectDraft ??
    createArchitectDraft({
      projectId: context.currentProjectId ?? snapshot?.projectId,
      projectName: context.currentProjectName ?? snapshot?.name,
      sourceBuildManifest: context.buildManifest ?? snapshot?.buildManifest,
      now,
    });
  const projectId =
    context.currentProjectId ??
    snapshot?.projectId ??
    draft.projectId ??
    'local-architect-project';
  const intelligenceCore = initializeArchitectIntelligenceCore({
    projectId,
    architectDraft: draft,
    existingCore: context.intelligenceCore ?? snapshot?.intelligenceCore ?? null,
    buildContract: context.buildContract ?? snapshot?.buildContract ?? null,
    now,
  });

  return { context, snapshot, draft, intelligenceCore };
}

export function saveArchitectProjectDraft(
  storage: StorageLike,
  draft: ArchitectDraft,
  options: {
    now?: Date;
    intelligenceCore?: MatrixIntelligenceCore | null;
  } = {}
): void {
  const now = options.now ?? new Date();
  const context = loadMatrixProjectWorkspaceContext(storage);
  const snapshot = loadMatrixProjectWorkspaceSnapshot(storage);
  const persistedCore =
    options.intelligenceCore ?? context.intelligenceCore ?? snapshot?.intelligenceCore;

  saveMatrixProjectWorkspaceContext(storage, {
    ...context,
    currentProjectId: context.currentProjectId ?? draft.projectId,
    currentProjectName: context.currentProjectName ?? draft.projectName,
    architectDraft: draft,
    intelligenceCore: persistedCore,
  });

  if (snapshot) {
    saveMatrixProjectWorkspaceSnapshot(storage, {
      ...snapshot,
      name: snapshot.name || draft.projectName,
      architectDraft: draft,
      intelligenceCore: persistedCore,
      updatedAt: now.toISOString(),
    });
  }
}

export function handoffArchitectDraftToBlueprint(
  storage: StorageLike,
  draft: ArchitectDraft,
  now = new Date()
): ArchitectBlueprintHandoffResult {
  const context = loadMatrixProjectWorkspaceContext(storage);
  const snapshot = loadMatrixProjectWorkspaceSnapshot(storage);
  const existingBlueprint = context.blueprintDraft ?? snapshot?.blueprintDraft ?? getExistingBlueprintDraft(storage);
  const result = applyArchitectBlueprintHandoff(storage, draft, existingBlueprint, now);
  const persistedCore = context.intelligenceCore ?? snapshot?.intelligenceCore;

  if (result.skipped) return result;

  saveBlueprintDraft(storage, result.blueprintDraft);
  saveMatrixProjectWorkspaceContext(storage, {
    ...context,
    currentProjectId: context.currentProjectId ?? draft.projectId,
    currentProjectName: context.currentProjectName ?? draft.projectName,
    buildManifest: context.buildManifest ?? draft.sourceBuildManifest,
    architectDraft: draft,
    blueprintDraft: result.blueprintDraft,
    intelligenceCore: persistedCore,
  });

  if (snapshot) {
    saveMatrixProjectWorkspaceSnapshot(storage, {
      ...snapshot,
      name: snapshot.name || draft.projectName,
      buildManifest: snapshot.buildManifest ?? draft.sourceBuildManifest,
      architectDraft: draft,
      blueprintDraft: result.blueprintDraft,
      intelligenceCore: persistedCore,
      updatedAt: now.toISOString(),
    });
  }

  return result;
}
