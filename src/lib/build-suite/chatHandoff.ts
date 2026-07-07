import {
  deserializeBuildManifest,
  serializeBuildManifest,
  type BuildManifest,
} from './buildManifest';

export const MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY =
  'matrix-build-suite:chat-prompt-handoff';

export const MATRIX_BUILD_SUITE_CHAT_HANDOFF_MESSAGE =
  'Matrix Build Suite prompt loaded. Review and press Send when ready.';

export interface MatrixBuildSuiteChatHandoff {
  source: 'matrix-build-suite';
  prompt: string;
  buildManifest?: BuildManifest;
  createdAt: string;
  message: string;
}

type WritableStorage = Pick<Storage, 'setItem'>;
type ReadableStorage = Pick<Storage, 'getItem' | 'removeItem'>;

export function createMatrixBuildSuiteChatHandoff(
  prompt: string,
  now = new Date(),
  buildManifest?: BuildManifest
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

  return handoff;
}

export function writeMatrixBuildSuiteChatHandoff(
  storage: WritableStorage,
  prompt: string,
  now = new Date(),
  buildManifest?: BuildManifest
): MatrixBuildSuiteChatHandoff {
  const handoff = createMatrixBuildSuiteChatHandoff(
    prompt,
    now,
    buildManifest
  );
  storage.setItem(
    MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY,
    JSON.stringify({
      ...handoff,
      ...(buildManifest
        ? { buildManifest: JSON.parse(serializeBuildManifest(buildManifest)) }
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

export function readMatrixBuildSuiteChatHandoff(
  storage: ReadableStorage
): MatrixBuildSuiteChatHandoff | null {
  const raw = storage.getItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY);
  if (!raw) return null;

  storage.removeItem(MATRIX_BUILD_SUITE_CHAT_HANDOFF_KEY);

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

    return handoff;
  } catch {
    return null;
  }
}
