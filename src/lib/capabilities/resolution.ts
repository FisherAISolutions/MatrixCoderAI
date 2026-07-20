import type { BuildContract } from '@/lib/build-contract';
import type { ArchitectBudgetMode } from '@/lib/matrix-ai-architect/types';
import {
  capabilitiesFromDomainPackContributions,
  detectCapabilitiesFromContract,
  detectUnresolvedCustomRequirements,
} from './detection';
import { applyDomainPacks } from './domainPacks';
import {
  expandCapabilityDependencies,
  sortCapabilitiesDeterministically,
} from './dependencies';
import { detectCapabilityConflicts } from './conflicts';
import { recommendProviders } from './recommendations';
import type {
  CapabilityDomainPack,
  CapabilityResolutionOptions,
  CapabilityResolutionResult,
  CapabilityResolutionWarning,
  ResolvedCapability,
} from './types';
import {
  CAPABILITY_REGISTRY_VERSION,
  CAPABILITY_RESOLUTION_SCHEMA_VERSION,
} from './types';

function mergeCapabilities(
  capabilities: ResolvedCapability[]
): ResolvedCapability[] {
  const byId = new Map<string, ResolvedCapability>();

  capabilities.forEach((capability) => {
    const existing = byId.get(capability.capabilityId);
    if (!existing) {
      byId.set(capability.capabilityId, {
        ...capability,
        sourceRequirementIds: [...capability.sourceRequirementIds],
        addedByCapabilityIds: [...capability.addedByCapabilityIds],
        addedByDomainPackIds: [...capability.addedByDomainPackIds],
      });
      return;
    }

    existing.sourceRequirementIds = [
      ...new Set([
        ...existing.sourceRequirementIds,
        ...capability.sourceRequirementIds,
      ]),
    ];
    existing.addedByCapabilityIds = [
      ...new Set([
        ...existing.addedByCapabilityIds,
        ...capability.addedByCapabilityIds,
      ]),
    ];
    existing.addedByDomainPackIds = [
      ...new Set([
        ...existing.addedByDomainPackIds,
        ...capability.addedByDomainPackIds,
      ]),
    ];
    if (capability.status === 'required') existing.status = 'required';
    if (existing.source === 'dependency' && capability.source !== 'dependency') {
      existing.source = capability.source;
    }
  });

  return sortCapabilitiesDeterministically(Array.from(byId.values()));
}

function inferBudgetMode(contract: BuildContract): ArchitectBudgetMode | undefined {
  const text = [
    contract.constraints.join(' '),
    contract.projectSummary,
    contract.acceptanceCriteria.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  if (/free-first|free tier|local-first|prototype|avoid paid-only/.test(text)) {
    return 'free-first';
  }
  if (/lean|low-cost|low cost|upgrade path/.test(text)) {
    return 'lean';
  }
  if (/growth|scale|scalable|operational readiness|monitoring/.test(text)) {
    return 'growth';
  }
  if (/professional|managed services|launch risk/.test(text)) {
    return 'professional';
  }
  return undefined;
}

function sourceRequirementIdsFor(capabilities: ResolvedCapability[]): string[] {
  return Array.from(
    new Set(capabilities.flatMap((capability) => capability.sourceRequirementIds))
  ).sort();
}

function unresolvedWarnings(
  contract: BuildContract,
  capabilityIds: Set<string>
): {
  unresolvedCustomRequirements: string[];
  warnings: CapabilityResolutionWarning[];
} {
  const unresolved = detectUnresolvedCustomRequirements(contract, capabilityIds);
  return {
    unresolvedCustomRequirements: unresolved.unresolved,
    warnings: unresolved.warnings,
  };
}

export function resolveCapabilities(
  contract: BuildContract,
  options: CapabilityResolutionOptions = {}
): CapabilityResolutionResult {
  const now = options.now ?? new Date();
  const detectedCapabilities = sortCapabilitiesDeterministically(
    detectCapabilitiesFromContract(contract)
  );
  const domainPackContributions = applyDomainPacks(
    contract,
    options.domainPacks as CapabilityDomainPack[] | undefined
  );
  const domainCapabilities = capabilitiesFromDomainPackContributions(
    domainPackContributions,
    contract
  );
  const initialCapabilities = mergeCapabilities([
    ...detectedCapabilities,
    ...domainCapabilities,
  ]);
  const expanded = expandCapabilityDependencies(initialCapabilities);
  const capabilityIds = new Set(
    expanded.capabilities.map((capability) => capability.capabilityId)
  );
  const unresolved = unresolvedWarnings(contract, capabilityIds);
  const budgetMode = options.budgetMode ?? inferBudgetMode(contract);

  return {
    schemaVersion: CAPABILITY_RESOLUTION_SCHEMA_VERSION,
    registryVersion: CAPABILITY_REGISTRY_VERSION,
    contractId: contract.id,
    contractVersion: contract.contractVersion,
    capabilities: expanded.capabilities,
    detectedCapabilities,
    expandedDependencies: expanded.expandedDependencies,
    providerRecommendations: recommendProviders(
      expanded.capabilities,
      budgetMode
    ),
    conflicts: detectCapabilityConflicts(expanded.capabilities, contract),
    warnings: [...expanded.warnings, ...unresolved.warnings],
    sourceRequirementIds: sourceRequirementIdsFor(expanded.capabilities),
    domainPackContributions,
    unresolvedCustomRequirements: unresolved.unresolvedCustomRequirements,
    createdAt: now.toISOString(),
  };
}

