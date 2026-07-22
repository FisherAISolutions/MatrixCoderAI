import {
  deserializeBuildManifest,
  serializeBuildManifest,
  type BuildManifest,
} from './buildManifest';
import {
  deserializeBlueprintDraft,
  serializeBlueprintDraft,
  type BlueprintDraft,
} from '@/lib/blueprint-studio/blueprintDraft';
import {
  deserializeBuildContract,
  serializeBuildContract,
  type BuildContract,
} from '@/lib/build-contract';
import {
  deserializeCapabilityResolution,
  serializeCapabilityResolution,
  type CapabilityResolutionResult,
} from '@/lib/capabilities';
import {
  deserializeArchitectDraft,
  serializeArchitectDraft,
} from '@/lib/matrix-ai-architect/architectDraft';
import type { ArchitectDraft } from '@/lib/matrix-ai-architect/types';
import {
  deserializeIntelligenceCore,
  serializeIntelligenceCore,
  type MatrixIntelligenceCore,
} from '@/lib/intelligence-core';

export const MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY =
  'matrix-build-suite:chat-prompt-handoff';

export const MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE =
  'Matrix Build Suite prompt loaded. Review and press Send when ready.';

export interface MatrixBuildSuiteChatHandoff {
  source: 'matrix-build-suite';
  prompt: string;
  buildManifest?: BuildManifest;
  blueprintDraft?: BlueprintDraft;
  architectDraft?: ArchitectDraft;
  buildContract?: BuildContract;
  capabilityResolution?: CapabilityResolutionResult;
  intelligenceCore?: MatrixIntelligenceCore;
  createdAt: string;
  message: string;
}

export interface MatrixBuildSuiteChatHandoffPlanningState {
  architectDraft?: ArchitectDraft | null;
  buildContract?: BuildContract | null;
  capabilityResolution?: CapabilityResolutionResult | null;
  intelligenceCore?: MatrixIntelligenceCore | null;
}

type WritableStorage = Pick<Storage, 'setItem'>;
type ReadableStorage = Pick<Storage, 'getItem' | 'removeItem'>;
type PeekableStorage = Pick<Storage, 'getItem'>;

export function createMatrixBuildSuiteChatHandoff(
  prompt: string,
  now = new Date(),
  buildManifest?: BuildManifest,
  blueprintDraft?: BlueprintDraft,
  planningState: MatrixBuildSuiteChatHandoffPlanningState = {}
): MatrixBuildSuiteChatHandoff {
  if (!prompt.trim()) {
    throw new Error('Matrix Build Suite prompt is empty.');
  }

  const handoff: MatrixBuildSuiteChatHandoff = {
    source: 'matrix-build-suite',
    prompt,
    createdAt: now.toISOString(),
    message: MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE,
  };

  if (buildManifest) {
    handoff.buildManifest = buildManifest;
  }
  if (blueprintDraft) {
    handoff.blueprintDraft = blueprintDraft;
  }
  if (planningState.architectDraft) {
    handoff.architectDraft = planningState.architectDraft;
  }
  if (planningState.buildContract) {
    handoff.buildContract = planningState.buildContract;
  }
  if (planningState.capabilityResolution) {
    handoff.capabilityResolution = planningState.capabilityResolution;
  }
  if (planningState.intelligenceCore) {
    handoff.intelligenceCore = planningState.intelligenceCore;
  }

  return handoff;
}

export function writeMatrixBuildSuiteChatHandoff(
  storage: WritableStorage,
  prompt: string,
  now = new Date(),
  buildManifest?: BuildManifest,
  blueprintDraft?: BlueprintDraft,
  planningState: MatrixBuildSuiteChatHandoffPlanningState = {}
): MatrixBuildSuiteChatHandoff {
  const handoff = createMatrixBuildSuiteChatHandoff(
    prompt,
    now,
    buildManifest,
    blueprintDraft,
    planningState
  );
  storage.setItem(
    MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY,
    JSON.stringify({
      ...handoff,
      ...(buildManifest
        ? { buildManifest: JSON.parse(serializeBuildManifest(buildManifest)) }
        : {}),
      ...(blueprintDraft
        ? { blueprintDraft: JSON.parse(serializeBlueprintDraft(blueprintDraft)) }
        : {}),
      ...(planningState.architectDraft
        ? {
            architectDraft: JSON.parse(
              serializeArchitectDraft(planningState.architectDraft)
            ),
          }
        : {}),
      ...(planningState.buildContract
        ? {
            buildContract: JSON.parse(
              serializeBuildContract(planningState.buildContract)
            ),
          }
        : {}),
      ...(planningState.capabilityResolution
        ? {
            capabilityResolution: JSON.parse(
              serializeCapabilityResolution(
                planningState.capabilityResolution
              )
            ),
          }
        : {}),
      ...(planningState.intelligenceCore
        ? {
            intelligenceCore: JSON.parse(
              serializeIntelligenceCore(planningState.intelligenceCore)
            ),
          }
        : {}),
    })
  );
  return handoff;
}

export function clearMatrixBuildSuiteChatHandoff(
  storage: Pick<Storage, 'removeItem'>
): void {
  storage.removeItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY);
}

function parseMatrixBuildSuiteChatHandoff(
  raw: string
): MatrixBuildSuiteChatHandoff | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MatrixBuildSuiteChatHandoff>;
    if (
      parsed.source !== 'matrix-build-suite' ||
      typeof parsed.prompt !== 'string' ||
      !parsed.prompt.trim() ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }

    const buildManifest = parsed.buildManifest
      ? deserializeBuildManifest(JSON.stringify(parsed.buildManifest))
      : undefined;
    const blueprintDraft = parsed.blueprintDraft
      ? deserializeBlueprintDraft(JSON.stringify(parsed.blueprintDraft))
      : undefined;
    const architectDraft = parsed.architectDraft
      ? deserializeArchitectDraft(JSON.stringify(parsed.architectDraft))
      : undefined;
    const buildContract = parsed.buildContract
      ? deserializeBuildContract(JSON.stringify(parsed.buildContract))
      : undefined;
    const capabilityResolution = parsed.capabilityResolution
      ? deserializeCapabilityResolution(
          JSON.stringify(parsed.capabilityResolution)
        )
      : undefined;
    const intelligenceCore = parsed.intelligenceCore
      ? deserializeIntelligenceCore(JSON.stringify(parsed.intelligenceCore))
      : undefined;

    const handoff: MatrixBuildSuiteChatHandoff = {
      source: 'matrix-build-suite',
      prompt: parsed.prompt,
      createdAt: parsed.createdAt,
      message:
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message
          : MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE,
    };

    if (buildManifest) {
      handoff.buildManifest = buildManifest;
    }
    if (blueprintDraft) {
      handoff.blueprintDraft = blueprintDraft;
    }
    if (architectDraft) {
      handoff.architectDraft = architectDraft;
    }
    if (buildContract) {
      handoff.buildContract = buildContract;
    }
    if (capabilityResolution) {
      handoff.capabilityResolution = capabilityResolution;
    }
    if (intelligenceCore) {
      handoff.intelligenceCore = intelligenceCore;
    }

    return handoff;
  } catch {
    return null;
  }
}

export function peekMatrixBuildSuiteChatHandoff(
  storage: PeekableStorage
): MatrixBuildSuiteChatHandoff | null {
  const raw = storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY);
  if (!raw) return null;
  return parseMatrixBuildSuiteChatHandoff(raw);
}

export function readMatrixBuildSuiteChatHandoff(
  storage: ReadableStorage
): MatrixBuildSuiteChatHandoff | null {
  const raw = storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY);
  if (!raw) return null;

  storage.removeItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY);
  return parseMatrixBuildSuiteChatHandoff(raw);
}
