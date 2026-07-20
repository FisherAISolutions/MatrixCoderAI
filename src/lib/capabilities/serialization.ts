import type {
  CapabilityConflict,
  CapabilityDomainPackContribution,
  CapabilityProviderRecommendation,
  CapabilityResolutionResult,
  CapabilityResolutionWarning,
  ResolvedCapability,
} from './types';
import {
  CAPABILITY_REGISTRY_VERSION,
  CAPABILITY_RESOLUTION_SCHEMA_VERSION,
} from './types';

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function safeResolvedCapabilities(value: unknown): ResolvedCapability[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ResolvedCapability | null => {
      if (!item || typeof item !== 'object') return null;
      const parsed = item as Partial<ResolvedCapability>;
      if (typeof parsed.capabilityId !== 'string') return null;
      return {
        capabilityId: parsed.capabilityId,
        status: parsed.status === 'required' ? 'required' : 'optional',
        sourceRequirementIds: safeStringArray(parsed.sourceRequirementIds),
        source:
          parsed.source === 'dependency' ||
          parsed.source === 'domain-pack' ||
          parsed.source === 'contract'
            ? parsed.source
            : 'contract',
        addedByCapabilityIds: safeStringArray(parsed.addedByCapabilityIds),
        addedByDomainPackIds: safeStringArray(parsed.addedByDomainPackIds),
      };
    })
    .filter((item): item is ResolvedCapability => Boolean(item));
}

function safeWarnings(value: unknown): CapabilityResolutionWarning[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CapabilityResolutionWarning | null => {
      if (!item || typeof item !== 'object') return null;
      const parsed = item as Partial<CapabilityResolutionWarning>;
      if (
        parsed.code !== 'missing-definition' &&
        parsed.code !== 'dependency-cycle' &&
        parsed.code !== 'unresolved-custom-requirement' &&
        parsed.code !== 'unknown-domain'
      ) {
        return null;
      }
      return {
        code: parsed.code,
        message: safeString(parsed.message),
        capabilityId: safeOptionalString(parsed.capabilityId),
        requirementId: safeOptionalString(parsed.requirementId),
      };
    })
    .filter((item): item is CapabilityResolutionWarning => Boolean(item));
}

function safeConflicts(value: unknown): CapabilityConflict[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CapabilityConflict | null => {
      if (!item || typeof item !== 'object') return null;
      const parsed = item as Partial<CapabilityConflict>;
      if (
        parsed.severity !== 'warning' &&
        parsed.severity !== 'error'
      ) {
        return null;
      }
      return {
        capabilityIds: safeStringArray(parsed.capabilityIds),
        severity: parsed.severity,
        explanation: safeString(parsed.explanation),
        recommendedResolution: safeString(parsed.recommendedResolution),
      };
    })
    .filter((item): item is CapabilityConflict => Boolean(item));
}

function safeProviderRecommendations(
  value: unknown
): CapabilityProviderRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CapabilityProviderRecommendation | null => {
      if (!item || typeof item !== 'object') return null;
      const parsed = item as Partial<CapabilityProviderRecommendation>;
      if (typeof parsed.category !== 'string') return null;
      return {
        category: parsed.category as CapabilityProviderRecommendation['category'],
        recommendedOption: safeString(parsed.recommendedOption),
        lowerCostAlternative: safeString(parsed.lowerCostAlternative),
        reason: safeString(parsed.reason),
        estimatedCostBand:
          parsed.estimatedCostBand === 'free' ||
          parsed.estimatedCostBand === 'low' ||
          parsed.estimatedCostBand === 'moderate' ||
          parsed.estimatedCostBand === 'high' ||
          parsed.estimatedCostBand === 'enterprise/custom'
            ? parsed.estimatedCostBand
            : 'low',
        hasFreeTier: parsed.hasFreeTier === true,
        confidence: safeNumber(parsed.confidence, 0),
        assumptions: safeStringArray(parsed.assumptions),
        relevantCapabilityIds: safeStringArray(parsed.relevantCapabilityIds),
      };
    })
    .filter((item): item is CapabilityProviderRecommendation => Boolean(item));
}

function safeDomainPackContributions(
  value: unknown
): CapabilityDomainPackContribution[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CapabilityDomainPackContribution | null => {
      if (!item || typeof item !== 'object') return null;
      const parsed = item as Partial<CapabilityDomainPackContribution>;
      if (typeof parsed.domainPackId !== 'string') return null;
      return {
        domainPackId: parsed.domainPackId,
        capabilityIds: safeStringArray(parsed.capabilityIds),
        domainEntities: safeStringArray(parsed.domainEntities),
        acceptanceCriteria: safeStringArray(parsed.acceptanceCriteria),
        riskChecks: safeStringArray(parsed.riskChecks),
        uxPatterns: safeStringArray(parsed.uxPatterns),
        terminology: safeStringArray(parsed.terminology),
        recommendations: safeStringArray(parsed.recommendations),
      };
    })
    .filter((item): item is CapabilityDomainPackContribution => Boolean(item));
}

export function serializeCapabilityResolution(
  resolution: CapabilityResolutionResult
): string {
  return JSON.stringify(resolution);
}

export function deserializeCapabilityResolution(
  raw: string
): CapabilityResolutionResult | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CapabilityResolutionResult>;
    if (
      parsed.schemaVersion !== CAPABILITY_RESOLUTION_SCHEMA_VERSION ||
      parsed.registryVersion !== CAPABILITY_REGISTRY_VERSION ||
      typeof parsed.contractId !== 'string'
    ) {
      return null;
    }

    return {
      schemaVersion: CAPABILITY_RESOLUTION_SCHEMA_VERSION,
      registryVersion: CAPABILITY_REGISTRY_VERSION,
      contractId: parsed.contractId,
      contractVersion: safeNumber(parsed.contractVersion, 1),
      capabilities: safeResolvedCapabilities(parsed.capabilities),
      detectedCapabilities: safeResolvedCapabilities(parsed.detectedCapabilities),
      expandedDependencies: safeResolvedCapabilities(parsed.expandedDependencies),
      providerRecommendations: safeProviderRecommendations(
        parsed.providerRecommendations
      ),
      conflicts: safeConflicts(parsed.conflicts),
      warnings: safeWarnings(parsed.warnings),
      sourceRequirementIds: safeStringArray(parsed.sourceRequirementIds),
      domainPackContributions: safeDomainPackContributions(
        parsed.domainPackContributions
      ),
      unresolvedCustomRequirements: safeStringArray(
        parsed.unresolvedCustomRequirements
      ),
      createdAt: safeString(parsed.createdAt, new Date(0).toISOString()),
    };
  } catch {
    return null;
  }
}
