import type { AgentType } from '@/app/chat-workspace/components/types';

export type WorkspaceGenerationMode =
  | 'single-request'
  | 'task-driven'
  | 'planning-required';

export interface SelectWorkspaceGenerationModeOptions {
  request: string;
  agent: AgentType;
  existingFileCount: number;
  hasApprovedBuildContract: boolean;
}

export function isLargeApplicationBuildRequest(
  request: string,
  agent: AgentType,
  existingFileCount: number
): boolean {
  if (agent !== 'coding') return false;

  const normalized = request.toLowerCase();
  const wantsApplication =
    /\b(build|create|make|scaffold|generate|set up|implement)\b/.test(normalized) &&
    /\b(app|application|site|website|dashboard|tracker|manager|crm|portal|pages?|platform|software)\b/.test(
      normalized
    );
  const hasMultiFeatureScope =
    /\b(3\s+pages|three\s+pages|multiple\s+pages|dashboard|history|edit|delete|filter|localstorage|components?|full app|complete app|production-ready|routes?)\b/.test(
      normalized
    );

  return wantsApplication && (hasMultiFeatureScope || existingFileCount < 8);
}

export function selectWorkspaceGenerationMode(
  options: SelectWorkspaceGenerationModeOptions
): WorkspaceGenerationMode {
  if (
    !isLargeApplicationBuildRequest(
      options.request,
      options.agent,
      options.existingFileCount
    )
  ) {
    return 'single-request';
  }

  return options.hasApprovedBuildContract ? 'task-driven' : 'planning-required';
}
