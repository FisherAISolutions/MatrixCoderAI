import { capabilityRegistry } from './registry';
import type { BuildContract } from '@/lib/build-contract';
import type { CapabilityConflict, ResolvedCapability } from './types';

function has(capabilityIds: Set<string>, capabilityId: string): boolean {
  return capabilityIds.has(capabilityId);
}

export function detectCapabilityConflicts(
  capabilities: ResolvedCapability[],
  contract?: BuildContract
): CapabilityConflict[] {
  const capabilityIds = new Set(capabilities.map((capability) => capability.capabilityId));
  const conflicts: CapabilityConflict[] = [];
  const seen = new Set<string>();

  capabilities.forEach((capability) => {
    const definition = capabilityRegistry.get(capability.capabilityId);
    definition?.conflictingCapabilityIds.forEach((conflictingCapabilityId) => {
      if (!capabilityIds.has(conflictingCapabilityId)) return;
      const key = [capability.capabilityId, conflictingCapabilityId].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      conflicts.push({
        capabilityIds: [capability.capabilityId, conflictingCapabilityId],
        severity: 'error',
        explanation: `${definition.displayName} conflicts with ${conflictingCapabilityId}.`,
        recommendedResolution: 'Choose one primary provider or split the responsibilities explicitly in the Build Contract.',
      });
    });
  });

  const text = contract
    ? [
        contract.storageRequirements.join(' '),
        contract.constraints.join(' '),
        contract.projectSummary,
      ]
        .join(' ')
        .toLowerCase()
    : '';

  if (
    /offline|local-first/.test(text) &&
    (has(capabilityIds, 'supabase-database') || has(capabilityIds, 'deployment-vercel'))
  ) {
    conflicts.push({
      capabilityIds: [
        ...(has(capabilityIds, 'supabase-database') ? ['supabase-database'] : []),
        ...(has(capabilityIds, 'deployment-vercel') ? ['deployment-vercel'] : []),
      ],
      severity: 'warning',
      explanation:
        'The contract includes offline or local-first language alongside managed online services.',
      recommendedResolution:
        'Keep local-first behavior explicit, and treat managed providers as sync or deployment options rather than mandatory runtime dependencies.',
    });
  }

  if (
    /long-running|persistent worker|vm|container/.test(text) &&
    has(capabilityIds, 'deployment-vercel')
  ) {
    conflicts.push({
      capabilityIds: ['deployment-vercel', 'background-jobs'],
      severity: 'warning',
      explanation:
        'The contract may need long-running compute, which is not the same assumption as a standard Vercel web deployment.',
      recommendedResolution:
        'Use a worker, queue, scheduled function, or container service for long-running jobs.',
    });
  }

  return conflicts;
}
