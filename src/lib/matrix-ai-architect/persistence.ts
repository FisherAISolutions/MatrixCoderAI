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

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ArchitectProjectState {
  context: MatrixProjectWorkspaceContext;
  snapshot: MatrixProjectWorkspaceSnapshot | null;
  draft: ArchitectDraft;
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

  return { context, snapshot, draft };
}

export function saveArchitectProjectDraft(
  storage: StorageLike,
  draft: ArchitectDraft,
  now = new Date()
): void {
  const context = loadMatrixProjectWorkspaceContext(storage);
  const snapshot = loadMatrixProjectWorkspaceSnapshot(storage);

  saveMatrixProjectWorkspaceContext(storage, {
    ...context,
    currentProjectId: context.currentProjectId ?? draft.projectId,
    currentProjectName: context.currentProjectName ?? draft.projectName,
    architectDraft: draft,
  });

  if (snapshot) {
    saveMatrixProjectWorkspaceSnapshot(storage, {
      ...snapshot,
      name: snapshot.name || draft.projectName,
      architectDraft: draft,
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

  if (result.skipped) return result;

  saveBlueprintDraft(storage, result.blueprintDraft);
  saveMatrixProjectWorkspaceContext(storage, {
    ...context,
    currentProjectId: context.currentProjectId ?? draft.projectId,
    currentProjectName: context.currentProjectName ?? draft.projectName,
    buildManifest: context.buildManifest ?? draft.sourceBuildManifest,
    architectDraft: draft,
    blueprintDraft: result.blueprintDraft,
  });

  if (snapshot) {
    saveMatrixProjectWorkspaceSnapshot(storage, {
      ...snapshot,
      name: snapshot.name || draft.projectName,
      buildManifest: snapshot.buildManifest ?? draft.sourceBuildManifest,
      architectDraft: draft,
      blueprintDraft: result.blueprintDraft,
      updatedAt: now.toISOString(),
    });
  }

  return result;
}
