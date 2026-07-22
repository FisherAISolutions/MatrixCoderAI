import type { BuildContract } from '@/lib/build-contract';
import type { CapabilityResolutionResult } from '@/lib/capabilities';
import {
  addIntelligenceRecord,
  type IntelligenceBlueprintContextPacket,
  type MatrixIntelligenceCore,
} from '@/lib/intelligence-core';
import type {
  BlueprintDraft,
  BlueprintWarning,
} from './blueprintDraft';

export const BLUEPRINT_APPROVAL_RECORD_KEY = 'blueprint-approved-draft';

export interface BlueprintApprovalGateResult {
  status: 'approved' | 'blocked';
  canStartBuild: boolean;
  approved: boolean;
  reasons: string[];
  warnings: BlueprintWarning[];
  staleStateIndicators: string[];
  capabilityConflictMessages: string[];
}

function blueprintApprovalRecord(core: MatrixIntelligenceCore) {
  return core.conversation.records.find(
    (record) =>
      !record.replacedBy &&
      record.key === BLUEPRINT_APPROVAL_RECORD_KEY &&
      record.status === 'approved'
  );
}

export function isBlueprintApproved(
  core: MatrixIntelligenceCore | null | undefined,
  draft: BlueprintDraft
): boolean {
  if (!core) return false;
  const record = blueprintApprovalRecord(core);
  if (!record || !record.value || typeof record.value !== 'object') return false;
  const value = record.value as {
    draftId?: unknown;
    draftUpdatedAt?: unknown;
  };
  return (
    value.draftId === draft.id &&
    value.draftUpdatedAt === draft.updatedAt
  );
}

export function markBlueprintApproved(
  core: MatrixIntelligenceCore,
  draft: BlueprintDraft,
  now = new Date()
): MatrixIntelligenceCore {
  const approvedAt = now.toISOString();
  const withApproval = addIntelligenceRecord(core, {
    domain: 'conversation',
    category: 'decision',
    key: BLUEPRINT_APPROVAL_RECORD_KEY,
    value: {
      draftId: draft.id,
      draftUpdatedAt: draft.updatedAt,
      approvedAt,
    },
    source: {
      kind: 'user-approved',
      id: draft.id,
      version: draft.metadataVersion,
      updatedAt: approvedAt,
    },
    status: 'approved',
    userApproved: true,
    confidence: 1,
    validationStrategy: 'user-approval',
    now,
  });

  return addIntelligenceRecord(withApproval, {
    domain: 'working',
    category: 'summary',
    key: 'blueprint-stage',
    value: 'approved-for-workspace-handoff',
    source: {
      kind: 'working',
      id: draft.id,
      version: draft.metadataVersion,
      updatedAt: approvedAt,
    },
    status: 'verified',
    confidence: 1,
    validationStrategy: 'none',
    now,
  });
}

export function createBlueprintApprovalGate(options: {
  draft: BlueprintDraft;
  warnings: BlueprintWarning[];
  buildContract?: BuildContract | null;
  capabilityResolution?: CapabilityResolutionResult | null;
  intelligenceCore?: MatrixIntelligenceCore | null;
  packet?: IntelligenceBlueprintContextPacket | null;
}): BlueprintApprovalGateResult {
  const reasons: string[] = [];
  const blockingWarnings = options.warnings.filter(
    (warning) => warning.severity === 'error'
  );
  const capabilityConflictMessages = (
    options.capabilityResolution?.conflicts ?? []
  )
    .filter((conflict) => conflict.severity === 'error')
    .map((conflict) => conflict.explanation);

  if (blockingWarnings.length) {
    reasons.push('Resolve Blueprint errors before approval.');
  }
  if (!options.buildContract) {
    reasons.push('Build Contract has not been created for this Blueprint.');
  }
  if (!options.capabilityResolution) {
    reasons.push('Capabilities have not been resolved for this Blueprint.');
  }
  if (
    options.buildContract?.sourceBlueprintDraft?.updatedAt &&
    options.buildContract.sourceBlueprintDraft.updatedAt !==
      options.draft.updatedAt
  ) {
    reasons.push('Blueprint changed after the current Build Contract was created.');
  }
  if (
    options.buildContract &&
    options.capabilityResolution &&
    (options.capabilityResolution.contractId !== options.buildContract.id ||
      options.capabilityResolution.contractVersion !==
        options.buildContract.contractVersion)
  ) {
    reasons.push('Capability resolution is stale for the current Build Contract.');
  }
  if (capabilityConflictMessages.length) {
    reasons.push('Capability conflicts must be resolved before handoff.');
  }
  const approved = isBlueprintApproved(options.intelligenceCore, options.draft);
  if (!approved) {
    reasons.push('Approve the Blueprint technical plan before sending it to Workspace.');
  }

  const canStartBuild = reasons.length === 0;
  return {
    status: canStartBuild ? 'approved' : 'blocked',
    canStartBuild,
    approved,
    reasons,
    warnings: options.warnings,
    staleStateIndicators: options.packet?.staleStateIndicators ?? [],
    capabilityConflictMessages,
  };
}
