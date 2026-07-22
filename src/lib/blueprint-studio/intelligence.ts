import {
  createBuildContract,
  type BuildContract,
} from '@/lib/build-contract';
import {
  resolveCapabilities,
  type CapabilityResolutionResult,
} from '@/lib/capabilities';
import {
  createBlueprintIntelligencePacket,
  createIntelligenceCore,
  type IntelligenceBlueprintContextPacket,
  type MatrixIntelligenceCore,
} from '@/lib/intelligence-core';
import type { BuildManifest } from '@/lib/build-suite/buildManifest';
import type { ArchitectDraft } from '@/lib/matrix-ai-architect/types';
import {
  createBlueprintApprovalGate,
  markBlueprintApproved,
  type BlueprintApprovalGateResult,
} from './approvalGate';
import {
  validateBlueprintDraft,
  type BlueprintDraft,
  type BlueprintWarning,
} from './blueprintDraft';
import {
  diffBuildContracts,
  diffCapabilityResolutions,
  type BuildContractDiff,
  type CapabilityResolutionDiff,
} from './diffs';

export interface BlueprintTechnicalReviewSection {
  id: string;
  title: string;
  status: 'ready' | 'warning' | 'blocked';
  summary: string;
  details: string[];
}

export interface BlueprintTechnicalPlanResult {
  buildContract: BuildContract;
  capabilityResolution: CapabilityResolutionResult;
  intelligenceCore: MatrixIntelligenceCore;
  packet: IntelligenceBlueprintContextPacket;
  warnings: BlueprintWarning[];
  gate: BlueprintApprovalGateResult;
  contractDiff: BuildContractDiff;
  capabilityDiff: CapabilityResolutionDiff;
  sections: BlueprintTechnicalReviewSection[];
}

export interface BlueprintTechnicalPlanOptions {
  projectId: string;
  projectName?: string;
  workspaceId?: string;
  architectDraft?: ArchitectDraft | null;
  buildManifest?: BuildManifest | null;
  blueprintDraft: BlueprintDraft;
  existingBuildContract?: BuildContract | null;
  existingCapabilityResolution?: CapabilityResolutionResult | null;
  existingIntelligenceCore?: MatrixIntelligenceCore | null;
  now?: Date;
}

function statusFromIssues(hasBlocker: boolean, hasWarning: boolean) {
  if (hasBlocker) return 'blocked' as const;
  if (hasWarning) return 'warning' as const;
  return 'ready' as const;
}

export function createBlueprintTechnicalReviewSections(
  plan: Omit<
    BlueprintTechnicalPlanResult,
    'sections' | 'gate' | 'contractDiff' | 'capabilityDiff'
  > & {
    gate: BlueprintApprovalGateResult;
    contractDiff: BuildContractDiff;
    capabilityDiff: CapabilityResolutionDiff;
  }
): BlueprintTechnicalReviewSection[] {
  const required = plan.buildContract.requirements.filter(
    (requirement) => requirement.status === 'required'
  ).length;
  const optional = plan.buildContract.requirements.length - required;
  const conflicts = plan.capabilityResolution.conflicts.filter(
    (conflict) => conflict.severity === 'error'
  );

  return [
    {
      id: 'contract',
      title: 'Build Contract',
      status: statusFromIssues(plan.gate.warnings.some((w) => w.severity === 'error'), plan.gate.warnings.length > 0),
      summary: `${required} required requirements and ${optional} optional capabilities are ready for approval.`,
      details: [
        `${plan.buildContract.routes.length} route(s)`,
        `${plan.buildContract.dataModels.length} data model(s)`,
        `${plan.buildContract.apis.length} API expectation(s)`,
        `${plan.contractDiff.addedRequirements.length} new requirement(s) since the last approved contract`,
      ],
    },
    {
      id: 'capabilities',
      title: 'Capability Resolution',
      status: statusFromIssues(conflicts.length > 0, plan.capabilityResolution.warnings.length > 0),
      summary: `${plan.capabilityResolution.capabilities.length} capability decisions were resolved from the contract.`,
      details: [
        `${plan.capabilityDiff.addedCapabilities.length} newly resolved capability/capabilities`,
        `${plan.capabilityResolution.providerRecommendations.length} provider recommendation(s)`,
        `${plan.capabilityResolution.conflicts.length} conflict(s)`,
      ],
    },
    {
      id: 'intelligence',
      title: 'Matrix Intelligence Packet',
      status: statusFromIssues(
        plan.packet.staleStateIndicators.length > 0,
        plan.packet.unresolvedQuestions.length > 0
      ),
      summary:
        'Blueprint Studio can hand structured planning context to Workspace without changing the generated prompt.',
      details: [
        `${plan.packet.approvedFeatures.length} approved feature signal(s)`,
        `${plan.packet.rejectedFeatures.length} rejected feature signal(s)`,
        `${plan.packet.staleStateIndicators.length} stale planning indicator(s)`,
      ],
    },
  ];
}

export function createBlueprintTechnicalPlan(
  options: BlueprintTechnicalPlanOptions
): BlueprintTechnicalPlanResult {
  const now = options.now ?? new Date();
  const warnings = validateBlueprintDraft(options.blueprintDraft);
  const buildContract = createBuildContract({
    projectId: options.projectId,
    projectName: options.projectName ?? options.blueprintDraft.projectName,
    workspaceId: options.workspaceId,
    architectDraft: options.architectDraft,
    buildManifest: options.buildManifest,
    blueprintDraft: options.blueprintDraft,
    existingContract: options.existingBuildContract,
    now,
  });
  const capabilityResolution = resolveCapabilities(buildContract, { now });
  const intelligenceCore = createIntelligenceCore({
    projectId: options.projectId,
    projectName: options.projectName ?? options.blueprintDraft.projectName,
    architectDraft: options.architectDraft,
    buildManifest: options.buildManifest,
    blueprintDraft: options.blueprintDraft,
    buildContract,
    capabilityResolution,
    existingCore: options.existingIntelligenceCore,
    now,
  });
  const packet = createBlueprintIntelligencePacket(intelligenceCore, {
    architectDraft: options.architectDraft,
    buildManifest: options.buildManifest,
    blueprintDraft: options.blueprintDraft,
    buildContract,
    capabilityResolution,
    now,
  });
  const gate = createBlueprintApprovalGate({
    draft: options.blueprintDraft,
    warnings,
    buildContract: options.existingBuildContract,
    capabilityResolution: options.existingCapabilityResolution,
    intelligenceCore: options.existingIntelligenceCore,
    packet,
  });
  const contractDiff = diffBuildContracts(
    options.existingBuildContract,
    buildContract
  );
  const capabilityDiff = diffCapabilityResolutions(
    options.existingCapabilityResolution,
    capabilityResolution
  );
  const resultWithoutSections = {
    buildContract,
    capabilityResolution,
    intelligenceCore,
    packet,
    warnings,
    gate,
    contractDiff,
    capabilityDiff,
  };

  return {
    ...resultWithoutSections,
    sections: createBlueprintTechnicalReviewSections(resultWithoutSections),
  };
}

export function approveBlueprintTechnicalPlan(
  options: BlueprintTechnicalPlanOptions
): BlueprintTechnicalPlanResult {
  const plan = createBlueprintTechnicalPlan(options);
  const approvedCore = markBlueprintApproved(
    plan.intelligenceCore,
    options.blueprintDraft,
    options.now
  );
  const approvedPacket = createBlueprintIntelligencePacket(approvedCore, {
    architectDraft: options.architectDraft,
    buildManifest: options.buildManifest,
    blueprintDraft: options.blueprintDraft,
    buildContract: plan.buildContract,
    capabilityResolution: plan.capabilityResolution,
    now: options.now,
  });
  const gate = createBlueprintApprovalGate({
    draft: options.blueprintDraft,
    warnings: plan.warnings,
    buildContract: plan.buildContract,
    capabilityResolution: plan.capabilityResolution,
    intelligenceCore: approvedCore,
    packet: approvedPacket,
  });
  const resultWithoutSections = {
    ...plan,
    intelligenceCore: approvedCore,
    packet: approvedPacket,
    gate,
  };

  return {
    ...resultWithoutSections,
    sections: createBlueprintTechnicalReviewSections(resultWithoutSections),
  };
}
