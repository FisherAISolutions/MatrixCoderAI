import type { BlueprintDraft } from './blueprintDraft';

export interface BlueprintChangeImpact {
  affectedRoutes: string[];
  affectedModels: string[];
  affectedIntegrations: string[];
  providerChanges: string[];
  destructiveChanges: string[];
  requiresConfirmation: boolean;
  reasons: string[];
}

const PROVIDER_TERMS = [
  'supabase',
  'firebase',
  'vercel',
  'stripe',
  'clerk',
  'auth',
  'openai',
  'anthropic',
  'gemini',
  'storage',
  'billing',
  'database',
  'deployment',
];

function names(values: Array<{ name: string }>): string[] {
  return values.map((value) => value.name.trim()).filter(Boolean);
}

function removed(before: string[], after: string[]): string[] {
  const afterSet = new Set(after.map((item) => item.toLowerCase()));
  return before.filter((item) => !afterSet.has(item.toLowerCase()));
}

function changedProviderTerms(beforeText: string, afterText: string): string[] {
  return PROVIDER_TERMS.filter((term) => {
    const had = beforeText.includes(term);
    const has = afterText.includes(term);
    return had !== has;
  });
}

export function analyzeBlueprintChangeImpact(
  beforeDraft: BlueprintDraft,
  afterDraft: BlueprintDraft
): BlueprintChangeImpact {
  const affectedRoutes = removed(
    beforeDraft.routes.map((route) => route.path),
    afterDraft.routes.map((route) => route.path)
  );
  const affectedModels = removed(
    names(beforeDraft.dataModels),
    names(afterDraft.dataModels)
  );
  const affectedIntegrations = removed(
    names(beforeDraft.integrations),
    names(afterDraft.integrations)
  );

  const beforeText = JSON.stringify({
    integrations: beforeDraft.integrations,
    deploymentTarget: beforeDraft.deploymentTarget,
  }).toLowerCase();
  const afterText = JSON.stringify({
    integrations: afterDraft.integrations,
    deploymentTarget: afterDraft.deploymentTarget,
  }).toLowerCase();
  const providerChanges = changedProviderTerms(beforeText, afterText);

  const destructiveChanges = [
    ...affectedRoutes.map((route) => `Removed route ${route}`),
    ...affectedModels.map((model) => `Removed data model ${model}`),
    ...affectedIntegrations.map(
      (integration) => `Removed integration ${integration}`
    ),
  ];
  const reasons = [
    ...destructiveChanges,
    ...providerChanges.map((term) => `Changed provider planning for ${term}`),
  ];

  return {
    affectedRoutes,
    affectedModels,
    affectedIntegrations,
    providerChanges,
    destructiveChanges,
    requiresConfirmation: reasons.length > 0,
    reasons,
  };
}
