import type { BuildContract, BuildContractRequirement } from '@/lib/build-contract';
import type {
  CapabilityConflict,
  CapabilityResolutionResult,
  CapabilityResolutionWarning,
  ResolvedCapability,
} from '@/lib/capabilities';

export interface BuildContractRequirementDiffEntry {
  stableId: string;
  type: BuildContractRequirement['type'];
  title: string;
  status: 'added' | 'removed' | 'modified';
  source: BuildContractRequirement['source'];
  before?: BuildContractRequirement;
  after?: BuildContractRequirement;
}

export interface BuildContractDiff {
  addedRequirements: BuildContractRequirementDiffEntry[];
  removedRequirements: BuildContractRequirementDiffEntry[];
  modifiedRequirements: BuildContractRequirementDiffEntry[];
  unchangedRequirementIds: string[];
  newlyRequiredCapabilities: string[];
  noLongerRequiredCapabilities: string[];
}

export interface CapabilityResolutionDiff {
  addedCapabilities: ResolvedCapability[];
  removedCapabilities: ResolvedCapability[];
  unchangedCapabilityIds: string[];
  conflicts: CapabilityConflict[];
  warnings: CapabilityResolutionWarning[];
}

function requirementComparable(requirement: BuildContractRequirement): string {
  return JSON.stringify({
    type: requirement.type,
    title: requirement.title,
    description: requirement.description,
    status: requirement.status,
    source: requirement.source,
    validationStrategy: requirement.validationStrategy,
  });
}

function entry(
  status: BuildContractRequirementDiffEntry['status'],
  before: BuildContractRequirement | undefined,
  after: BuildContractRequirement | undefined
): BuildContractRequirementDiffEntry {
  const requirement = after ?? before;
  if (!requirement) {
    throw new Error('Build Contract diff entry requires a requirement.');
  }
  return {
    stableId: requirement.stableId,
    type: requirement.type,
    title: requirement.title,
    source: requirement.source,
    status,
    before,
    after,
  };
}

function diffStrings(before: string[] = [], after: string[] = []): {
  added: string[];
  removed: string[];
} {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((item) => !beforeSet.has(item)),
    removed: before.filter((item) => !afterSet.has(item)),
  };
}

export function diffBuildContracts(
  before?: BuildContract | null,
  after?: BuildContract | null
): BuildContractDiff {
  const beforeRequirements = new Map(
    (before?.requirements ?? []).map((requirement) => [
      requirement.stableId,
      requirement,
    ])
  );
  const afterRequirements = new Map(
    (after?.requirements ?? []).map((requirement) => [
      requirement.stableId,
      requirement,
    ])
  );

  const addedRequirements: BuildContractRequirementDiffEntry[] = [];
  const removedRequirements: BuildContractRequirementDiffEntry[] = [];
  const modifiedRequirements: BuildContractRequirementDiffEntry[] = [];
  const unchangedRequirementIds: string[] = [];

  for (const [stableId, afterRequirement] of afterRequirements) {
    const beforeRequirement = beforeRequirements.get(stableId);
    if (!beforeRequirement) {
      addedRequirements.push(entry('added', undefined, afterRequirement));
      continue;
    }
    if (
      requirementComparable(beforeRequirement) !==
      requirementComparable(afterRequirement)
    ) {
      modifiedRequirements.push(
        entry('modified', beforeRequirement, afterRequirement)
      );
      continue;
    }
    unchangedRequirementIds.push(stableId);
  }

  for (const [stableId, beforeRequirement] of beforeRequirements) {
    if (!afterRequirements.has(stableId)) {
      removedRequirements.push(entry('removed', beforeRequirement, undefined));
    }
  }

  const capabilityDiff = diffStrings(
    before?.requiredCapabilities,
    after?.requiredCapabilities
  );

  return {
    addedRequirements,
    removedRequirements,
    modifiedRequirements,
    unchangedRequirementIds,
    newlyRequiredCapabilities: capabilityDiff.added,
    noLongerRequiredCapabilities: capabilityDiff.removed,
  };
}

export function diffCapabilityResolutions(
  before?: CapabilityResolutionResult | null,
  after?: CapabilityResolutionResult | null
): CapabilityResolutionDiff {
  const beforeCapabilities = new Map(
    (before?.capabilities ?? []).map((capability) => [
      capability.capabilityId,
      capability,
    ])
  );
  const afterCapabilities = new Map(
    (after?.capabilities ?? []).map((capability) => [
      capability.capabilityId,
      capability,
    ])
  );

  return {
    addedCapabilities: [...afterCapabilities]
      .filter(([id]) => !beforeCapabilities.has(id))
      .map(([, capability]) => capability),
    removedCapabilities: [...beforeCapabilities]
      .filter(([id]) => !afterCapabilities.has(id))
      .map(([, capability]) => capability),
    unchangedCapabilityIds: [...afterCapabilities]
      .filter(([id]) => beforeCapabilities.has(id))
      .map(([id]) => id),
    conflicts: after?.conflicts ?? [],
    warnings: after?.warnings ?? [],
  };
}
