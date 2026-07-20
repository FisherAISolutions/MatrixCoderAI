import type {
  BuildContract,
  BuildContractRequirement,
} from '@/lib/build-contract';
import type {
  CapabilityDetectionContext,
  CapabilityDomainPackContribution,
  CapabilityResolutionWarning,
  ResolvedCapability,
} from './types';

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function addRequirementTrace(
  map: Map<string, Set<string>>,
  capabilityId: string,
  requirementIds: string[]
): void {
  if (!map.has(capabilityId)) map.set(capabilityId, new Set<string>());
  const set = map.get(capabilityId)!;
  requirementIds.forEach((id) => set.add(id));
}

function matchingRequirementIds(
  requirements: BuildContractRequirement[],
  patterns: RegExp[],
  types?: BuildContractRequirement['type'][]
): string[] {
  return requirements
    .filter((requirement) => {
      if (types && !types.includes(requirement.type)) return false;
      const text = `${requirement.type} ${requirement.title} ${requirement.description}`.toLowerCase();
      return hasAny(text, patterns);
    })
    .map((requirement) => requirement.stableId);
}

function createTextIndex(contract: BuildContract): string {
  return [
    contract.targetFramework,
    contract.project.projectName,
    contract.projectSummary,
    contract.authentication,
    contract.deploymentTarget,
    contract.routes.map((route) => `${route.path} ${route.label} ${route.purpose ?? ''}`).join(' '),
    contract.layouts.join(' '),
    contract.navigation.join(' '),
    contract.dataModels
      .map((model) => `${model.name} ${model.fields.join(' ')} ${model.purpose ?? ''}`)
      .join(' '),
    contract.relationships.join(' '),
    contract.apis.map((api) => `${api.path} ${api.methods.join(' ')} ${api.purpose ?? ''}`).join(' '),
    contract.integrations.join(' '),
    contract.aiCapabilities.join(' '),
    contract.storageRequirements.join(' '),
    contract.billingRequirements.join(' '),
    contract.backgroundJobs.join(' '),
    contract.environmentVariableNames.join(' '),
    contract.acceptanceCriteria.join(' '),
    contract.constraints.join(' '),
    contract.requirements
      .map((requirement) => `${requirement.type} ${requirement.title} ${requirement.description}`)
      .join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function traceStructuredRequirements(contract: BuildContract): Map<string, Set<string>> {
  const traces = new Map<string, Set<string>>();
  const allRequirements = contract.requirements;

  addRequirementTrace(
    traces,
    'framework-nextjs',
    matchingRequirementIds(allRequirements, [/next\.?js|app router|src\/app/i])
  );
  addRequirementTrace(
    traces,
    'typescript',
    matchingRequirementIds(allRequirements, [/typescript|type.?check|typed/i])
  );
  addRequirementTrace(
    traces,
    'responsive-ui',
    matchingRequirementIds(allRequirements, [/responsive|mobile/i], [
      'responsive',
      'visual',
      'acceptance',
    ])
  );
  addRequirementTrace(
    traces,
    'authentication',
    matchingRequirementIds(allRequirements, [/auth|account|sign.?in|user identity/i], [
      'authentication',
      'integration',
      'data-model',
    ])
  );
  addRequirementTrace(
    traces,
    'role-based-access',
    matchingRequirementIds(allRequirements, [/role|permission|admin/i], [
      'role-permission',
      'authentication',
      'data-model',
    ])
  );
  addRequirementTrace(
    traces,
    'database',
    allRequirements
      .filter((requirement) => ['data-model', 'storage', 'relationship'].includes(requirement.type))
      .map((requirement) => requirement.stableId)
  );
  addRequirementTrace(
    traces,
    'supabase-database',
    matchingRequirementIds(allRequirements, [/supabase|postgres/i])
  );
  addRequirementTrace(
    traces,
    'file-storage',
    matchingRequirementIds(allRequirements, [/file|asset|media|photo|image|upload|storage/i], [
      'storage',
      'data-model',
      'integration',
      'acceptance',
    ])
  );
  addRequirementTrace(
    traces,
    'image-upload',
    matchingRequirementIds(allRequirements, [/image upload|photo upload|upload.*image|uploaded photo/i])
  );
  addRequirementTrace(
    traces,
    'text-ai-generation',
    matchingRequirementIds(allRequirements, [/ai|story generation|text generation|openai|anthropic|gemini/i], [
      'ai-capability',
      'integration',
      'api',
    ])
  );
  addRequirementTrace(
    traces,
    'image-ai-generation',
    matchingRequirementIds(allRequirements, [/image generation|illustration|generate.*image/i], [
      'ai-capability',
      'integration',
      'api',
    ])
  );
  addRequirementTrace(
    traces,
    'billing',
    matchingRequirementIds(allRequirements, [/billing|payment|stripe|checkout/i], [
      'billing',
      'integration',
      'environment-variable',
    ])
  );
  addRequirementTrace(
    traces,
    'subscriptions',
    matchingRequirementIds(allRequirements, [/subscription|plan|recurring/i])
  );
  addRequirementTrace(
    traces,
    'transactional-email',
    matchingRequirementIds(allRequirements, [/email|resend|receipt/i])
  );
  addRequirementTrace(
    traces,
    'notifications',
    matchingRequirementIds(allRequirements, [/notification|alert|reminder/i])
  );
  addRequirementTrace(
    traces,
    'analytics',
    matchingRequirementIds(allRequirements, [/analytics|metric|report|chart/i])
  );
  addRequirementTrace(
    traces,
    'monitoring',
    matchingRequirementIds(allRequirements, [/monitoring|observability|error reporting/i])
  );
  addRequirementTrace(
    traces,
    'background-jobs',
    matchingRequirementIds(allRequirements, [/background|queue|async|worker/i], [
      'background-job',
      'api',
      'constraint',
    ])
  );
  addRequirementTrace(
    traces,
    'scheduled-jobs',
    matchingRequirementIds(allRequirements, [/schedule|cron|recurring job/i])
  );
  addRequirementTrace(
    traces,
    'search',
    matchingRequirementIds(allRequirements, [/search|filter|query/i])
  );
  addRequirementTrace(
    traces,
    'admin-dashboard',
    matchingRequirementIds(allRequirements, [/admin|dashboard/i], [
      'route',
      'layout',
      'role-permission',
    ])
  );
  addRequirementTrace(
    traces,
    'crud',
    matchingRequirementIds(allRequirements, [/create|edit|delete|crud|manage|record/i], [
      'data-model',
      'acceptance',
      'route',
    ])
  );
  addRequirementTrace(
    traces,
    'rich-editor',
    matchingRequirementIds(allRequirements, [/rich editor|rich text|content editor/i])
  );
  addRequirementTrace(
    traces,
    'page-editor',
    matchingRequirementIds(allRequirements, [/page editor|page-by-page|story page|editable page/i])
  );
  addRequirementTrace(
    traces,
    'media-library',
    matchingRequirementIds(allRequirements, [/media library|asset library|gallery/i])
  );
  addRequirementTrace(
    traces,
    'deployment-vercel',
    matchingRequirementIds(allRequirements, [/vercel/i], ['deployment', 'integration'])
  );

  return traces;
}

export function createCapabilityDetectionContext(
  contract: BuildContract
): CapabilityDetectionContext {
  return {
    contract,
    textIndex: createTextIndex(contract),
    requirementIdsByCapability: traceStructuredRequirements(contract),
  };
}

function makeResolved(
  capabilityId: string,
  status: ResolvedCapability['status'],
  sourceRequirementIds: string[],
  source: ResolvedCapability['source'],
  addedByDomainPackIds: string[] = []
): ResolvedCapability {
  return {
    capabilityId,
    status,
    sourceRequirementIds: [...new Set(sourceRequirementIds)],
    source,
    addedByCapabilityIds: [],
    addedByDomainPackIds,
  };
}

export function detectCapabilitiesFromContract(
  contract: BuildContract
): ResolvedCapability[] {
  const context = createCapabilityDetectionContext(contract);
  const detected = new Map<string, ResolvedCapability>();
  const add = (capabilityId: string, status: ResolvedCapability['status'] = 'optional') => {
    const sourceRequirementIds = Array.from(
      context.requirementIdsByCapability.get(capabilityId) ?? []
    );
    const existing = detected.get(capabilityId);
    if (existing) {
      existing.sourceRequirementIds = [
        ...new Set([...existing.sourceRequirementIds, ...sourceRequirementIds]),
      ];
      if (status === 'required') existing.status = 'required';
      return;
    }
    detected.set(capabilityId, makeResolved(capabilityId, status, sourceRequirementIds, 'contract'));
  };

  add('framework-nextjs', 'required');
  add('typescript', 'required');
  add('responsive-ui', 'required');

  if (!/no authentication required/i.test(contract.authentication)) {
    add('authentication', 'required');
  }
  if (contract.rolesAndPermissions.length > 1) {
    add('role-based-access', 'required');
  }
  if (contract.dataModels.length || contract.storageRequirements.length) {
    add('database', contract.dataModels.length ? 'required' : 'optional');
  }
  if (
    contract.integrations.some((item) => /supabase/i.test(item)) ||
    contract.environmentVariableNames.some((item) => /supabase/i.test(item))
  ) {
    add('supabase-database', 'required');
  }
  if (
    hasAny(context.textIndex, [/file storage|asset|media|photo|image|upload|supabase storage/])
  ) {
    add('file-storage', 'optional');
  }
  if (hasAny(context.textIndex, [/image upload|photo upload|upload.*image/])) {
    add('image-upload', 'optional');
  }
  if (hasAny(context.textIndex, [/text generation|story generation|ai story|openai|anthropic|gemini/])) {
    add('text-ai-generation', 'optional');
  }
  if (hasAny(context.textIndex, [/image generation|ai image|illustration/])) {
    add('image-ai-generation', 'optional');
  }
  if (contract.billingRequirements.length || hasAny(context.textIndex, [/stripe|billing|payment/])) {
    add('billing', contract.billingRequirements.length ? 'required' : 'optional');
  }
  if (hasAny(context.textIndex, [/subscription|recurring plan|paid plan/])) {
    add('subscriptions', 'optional');
  }
  if (hasAny(context.textIndex, [/email|resend|receipt/])) {
    add('transactional-email', 'optional');
  }
  if (hasAny(context.textIndex, [/notification|alert|reminder/])) {
    add('notifications', 'optional');
  }
  if (hasAny(context.textIndex, [/analytics|metrics|reports|dashboard chart/])) {
    add('analytics', 'optional');
  }
  if (hasAny(context.textIndex, [/monitoring|observability|error reporting/])) {
    add('monitoring', 'optional');
  }
  if (contract.backgroundJobs.length || hasAny(context.textIndex, [/background job|queue|worker/])) {
    add('background-jobs', 'optional');
  }
  if (hasAny(context.textIndex, [/scheduled job|cron|schedule/])) {
    add('scheduled-jobs', 'optional');
  }
  if (hasAny(context.textIndex, [/search|filter/])) {
    add('search', 'optional');
  }
  if (
    contract.routes.some((route) => /dashboard|admin/.test(route.path)) ||
    contract.rolesAndPermissions.some((role) => /admin/i.test(role))
  ) {
    add('admin-dashboard', 'optional');
  }
  if (contract.dataModels.length || hasAny(context.textIndex, [/create|edit|delete|crud/])) {
    add('crud', contract.dataModels.length ? 'required' : 'optional');
  }
  if (hasAny(context.textIndex, [/rich editor|rich text/])) {
    add('rich-editor', 'optional');
  }
  if (hasAny(context.textIndex, [/page-by-page|page editor|story page|editable page/])) {
    add('page-editor', 'optional');
  }
  if (hasAny(context.textIndex, [/media library|asset library|gallery/])) {
    add('media-library', 'optional');
  }
  if (/vercel/i.test(contract.deploymentTarget)) {
    add('deployment-vercel', 'required');
  }

  return Array.from(detected.values());
}

export function capabilitiesFromDomainPackContributions(
  contributions: CapabilityDomainPackContribution[],
  contract: BuildContract
): ResolvedCapability[] {
  const context = createCapabilityDetectionContext(contract);
  const byCapability = new Map<string, ResolvedCapability>();

  contributions.forEach((contribution) => {
    contribution.capabilityIds.forEach((capabilityId) => {
      const requirementIds = Array.from(
        context.requirementIdsByCapability.get(capabilityId) ?? []
      );
      const existing = byCapability.get(capabilityId);
      if (existing) {
        existing.sourceRequirementIds = [
          ...new Set([...existing.sourceRequirementIds, ...requirementIds]),
        ];
        existing.addedByDomainPackIds = [
          ...new Set([...existing.addedByDomainPackIds, contribution.domainPackId]),
        ];
        return;
      }
      byCapability.set(
        capabilityId,
        makeResolved(capabilityId, 'optional', requirementIds, 'domain-pack', [
          contribution.domainPackId,
        ])
      );
    });
  });

  return Array.from(byCapability.values());
}

export function detectUnresolvedCustomRequirements(
  contract: BuildContract,
  resolvedCapabilityIds: Set<string>
): { unresolved: string[]; warnings: CapabilityResolutionWarning[] } {
  const customRequirements = contract.requirements.filter((requirement) =>
    ['acceptance', 'constraint'].includes(requirement.type)
  );
  const unresolved = customRequirements
    .filter((requirement) => {
      const text = `${requirement.title} ${requirement.description}`.toLowerCase();
      if (/next|typescript|responsive|route|navigation|quality|build|src\/app/.test(text)) {
        return false;
      }
      if (/billing|subscription/.test(text)) return !resolvedCapabilityIds.has('billing');
      if (/ai|generation/.test(text)) return !resolvedCapabilityIds.has('text-ai-generation');
      if (/upload|media|image/.test(text)) return !resolvedCapabilityIds.has('file-storage');
      return text.length > 20;
    })
    .map((requirement) => requirement.title);

  return {
    unresolved,
    warnings: unresolved.map((requirementTitle) => ({
      code: 'unresolved-custom-requirement',
      message: `No specific capability definition matched custom requirement "${requirementTitle}".`,
    })),
  };
}
