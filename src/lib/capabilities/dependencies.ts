import { capabilityRegistry } from './registry';
import type {
  CapabilityResolutionWarning,
  ResolvedCapability,
} from './types';

function mergeCapability(
  map: Map<string, ResolvedCapability>,
  capability: ResolvedCapability
): ResolvedCapability {
  const existing = map.get(capability.capabilityId);
  if (!existing) {
    const cloned = {
      ...capability,
      sourceRequirementIds: [...capability.sourceRequirementIds],
      addedByCapabilityIds: [...capability.addedByCapabilityIds],
      addedByDomainPackIds: [...capability.addedByDomainPackIds],
    };
    map.set(capability.capabilityId, cloned);
    return cloned;
  }

  existing.sourceRequirementIds = [
    ...new Set([...existing.sourceRequirementIds, ...capability.sourceRequirementIds]),
  ];
  existing.addedByCapabilityIds = [
    ...new Set([...existing.addedByCapabilityIds, ...capability.addedByCapabilityIds]),
  ];
  existing.addedByDomainPackIds = [
    ...new Set([...existing.addedByDomainPackIds, ...capability.addedByDomainPackIds]),
  ];
  if (capability.status === 'required') existing.status = 'required';
  if (existing.source === 'dependency' && capability.source !== 'dependency') {
    existing.source = capability.source;
  }
  return existing;
}

export function sortCapabilitiesDeterministically(
  capabilities: ResolvedCapability[]
): ResolvedCapability[] {
  const registryOrder = new Map(
    Array.from(capabilityRegistry.keys()).map((id, index) => [id, index])
  );
  return [...capabilities].sort((a, b) => {
    const aIndex = registryOrder.get(a.capabilityId) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = registryOrder.get(b.capabilityId) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.capabilityId.localeCompare(b.capabilityId);
  });
}

export function expandCapabilityDependencies(
  capabilities: ResolvedCapability[]
): {
  capabilities: ResolvedCapability[];
  expandedDependencies: ResolvedCapability[];
  warnings: CapabilityResolutionWarning[];
} {
  const byId = new Map<string, ResolvedCapability>();
  const warnings: CapabilityResolutionWarning[] = [];
  capabilities.forEach((capability) => mergeCapability(byId, capability));

  const expand = (
    capabilityId: string,
    requiredByParent: boolean,
    parentId: string | null,
    stack: string[]
  ) => {
    const definition = capabilityRegistry.get(capabilityId);
    if (!definition) {
      warnings.push({
        code: 'missing-definition',
        capabilityId,
        message: `Capability definition is missing for ${capabilityId}.`,
      });
      return;
    }

    for (const dependencyId of definition.dependencyCapabilityIds) {
      if (stack.includes(dependencyId)) {
        warnings.push({
          code: 'dependency-cycle',
          capabilityId: dependencyId,
          message: `Capability dependency cycle detected: ${[...stack, dependencyId].join(' -> ')}.`,
        });
        continue;
      }

      const dependencyStatus = requiredByParent ? 'required' : 'optional';
      mergeCapability(byId, {
        capabilityId: dependencyId,
        status: dependencyStatus,
        sourceRequirementIds: [],
        source: 'dependency',
        addedByCapabilityIds: parentId ? [parentId] : [capabilityId],
        addedByDomainPackIds: [],
      });
      expand(dependencyId, requiredByParent, capabilityId, [...stack, dependencyId]);
    }
  };

  for (const capability of [...byId.values()]) {
    expand(
      capability.capabilityId,
      capability.status === 'required',
      capability.capabilityId,
      [capability.capabilityId]
    );
  }

  const expandedDependencies = Array.from(byId.values()).filter(
    (capability) =>
      capability.source === 'dependency' ||
      capability.addedByCapabilityIds.length > 0
  );

  return {
    capabilities: sortCapabilitiesDeterministically(Array.from(byId.values())),
    expandedDependencies: sortCapabilitiesDeterministically(expandedDependencies),
    warnings,
  };
}
