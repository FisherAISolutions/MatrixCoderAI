import type { BuildManifest } from '@/lib/build-suite/buildManifest';
import type {
  BlueprintDataModel,
  BlueprintDraft,
  BlueprintDraftItem,
  BlueprintRouteItem,
} from '@/lib/blueprint-studio/blueprintDraft';
import type {
  ArchitectApiSpec,
  ArchitectDataModelSpec,
  ArchitectDraft,
  ArchitectRouteSpec,
} from '@/lib/matrix-ai-architect/types';
import {
  BUILD_CONTRACT_METADATA_VERSION,
  BUILD_CONTRACT_SCHEMA_VERSION,
  type BuildContract,
  type BuildContractApi,
  type BuildContractCapabilityStatus,
  type BuildContractCreateOptions,
  type BuildContractDataModel,
  type BuildContractRequirement,
  type BuildContractRequirementType,
  type BuildContractRoute,
  type BuildContractSourceKind,
  type BuildContractSourceReference,
  type BuildContractValidationStrategy,
} from './types';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^-+|-+$/g, '');
}

function stableRequirementId(
  type: BuildContractRequirementType,
  target: string
): string {
  const normalized = slugify(target || 'default')
    .replace(/\//g, '-')
    .replace(/^-+|-+$/g, '');
  return `req-${type}-${normalized || 'root'}`;
}

function normalizeRoutePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, '/').replace(/\/$/, '');
  return collapsed || '/';
}

function labelFromRoute(path: string): string {
  const normalized = normalizeRoutePath(path);
  if (normalized === '/') return 'Home';
  return normalized
    .slice(1)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function itemNames(items?: BlueprintDraftItem[]): string[] {
  return (items ?? [])
    .map((item) => item.name?.trim())
    .filter((item): item is string => Boolean(item));
}

function sourceRef(
  kind: BuildContractSourceReference['kind'],
  value?: { id?: string; metadataVersion?: string; createdAt?: string; updatedAt?: string } | null
): BuildContractSourceReference | undefined {
  if (!value) return undefined;
  return {
    kind,
    id: value.id,
    metadataVersion: value.metadataVersion,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function blueprintRoutes(blueprintDraft?: BlueprintDraft | null): BuildContractRoute[] {
  return (blueprintDraft?.routes ?? [])
    .map((route): BuildContractRoute | null => {
      const path = normalizeRoutePath(route.path);
      if (!path) return null;
      return {
        path,
        label: route.name || labelFromRoute(path),
        purpose: route.description,
        required: true,
        source: 'blueprint',
      };
    })
    .filter((route): route is BuildContractRoute => Boolean(route));
}

function architectRoutes(architectDraft?: ArchitectDraft | null): BuildContractRoute[] {
  return (architectDraft?.specification.recommendedRoutes ?? [])
    .map((route): BuildContractRoute | null => {
      const path = normalizeRoutePath(route.path);
      if (!path) return null;
      return {
        path,
        label: route.label || labelFromRoute(path),
        purpose: route.purpose,
        required: route.priority !== 'secondary',
        source: 'architect',
      };
    })
    .filter((route): route is BuildContractRoute => Boolean(route));
}

function manifestRoutes(buildManifest?: BuildManifest | null): BuildContractRoute[] {
  if (!buildManifest) return [];
  const appTypeText = [
    buildManifest.appType?.id,
    buildManifest.appType?.label,
    buildManifest.selection.appTypeId,
    buildManifest.navigation.inferredPattern,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const routes = new Set<string>(['/']);

  if (/\b(crm|customer|contact)\b/.test(appTypeText)) {
    ['/contacts', '/companies', '/tasks', '/pipeline'].forEach((route) =>
      routes.add(route)
    );
  }
  if (/\b(fitness|wellness|habit)\b/.test(appTypeText)) {
    ['/workouts', '/progress'].forEach((route) => routes.add(route));
  }
  if (/\b(ecommerce|commerce|store|shop)\b/.test(appTypeText)) {
    ['/products', '/orders', '/customers'].forEach((route) => routes.add(route));
  }
  if (/\b(dashboard|analytics|admin|saas)\b/.test(appTypeText)) {
    routes.add('/dashboard');
  }

  return Array.from(routes).map((path) => ({
    path,
    label: labelFromRoute(path),
    required: path === '/',
    source: 'build-manifest' as const,
  }));
}

function mergeRoutes(
  blueprintDraft?: BlueprintDraft | null,
  architectDraft?: ArchitectDraft | null,
  buildManifest?: BuildManifest | null
): BuildContractRoute[] {
  const routes = [
    ...blueprintRoutes(blueprintDraft),
    ...architectRoutes(architectDraft),
    ...manifestRoutes(buildManifest),
    { path: '/', label: 'Home', required: true, source: 'platform-default' as const },
  ];
  const byPath = new Map<string, BuildContractRoute>();

  for (const route of routes) {
    const path = normalizeRoutePath(route.path);
    if (!path || byPath.has(path)) continue;
    byPath.set(path, { ...route, path });
  }

  return Array.from(byPath.values());
}

function blueprintModels(blueprintDraft?: BlueprintDraft | null): BuildContractDataModel[] {
  return (blueprintDraft?.dataModels ?? []).map((model) => ({
    name: model.name,
    fields: Array.isArray(model.fields) ? [...model.fields] : [],
    purpose: model.description,
    source: 'blueprint',
  }));
}

function architectModels(architectDraft?: ArchitectDraft | null): BuildContractDataModel[] {
  return (architectDraft?.specification.recommendedDataModels ?? []).map((model) => ({
    name: model.name,
    fields: [...model.fields],
    purpose: model.purpose,
    source: 'architect',
  }));
}

function mergeModels(
  blueprintDraft?: BlueprintDraft | null,
  architectDraft?: ArchitectDraft | null
): BuildContractDataModel[] {
  const byName = new Map<string, BuildContractDataModel>();
  for (const model of [
    ...blueprintModels(blueprintDraft),
    ...architectModels(architectDraft),
  ]) {
    const key = model.name.trim().toLowerCase();
    if (!key || byName.has(key)) continue;
    byName.set(key, model);
  }
  return Array.from(byName.values());
}

function mergeApis(architectDraft?: ArchitectDraft | null): BuildContractApi[] {
  return (architectDraft?.specification.recommendedApis ?? []).map((api) => ({
    path: api.path,
    methods: [...api.methods],
    purpose: api.purpose,
    source: 'architect',
  }));
}

function manifestNames(items?: BuildManifest['components']): string[] {
  return (items ?? []).map((item) => item.label).filter(Boolean);
}

function findFirst<T>(...values: Array<T | undefined | null | ''>): T | undefined {
  return values.find((value): value is T => Boolean(value));
}

function sourceFor(
  blueprintValue: unknown,
  architectValue: unknown,
  manifestValue: unknown
): BuildContractSourceKind {
  if (Boolean(blueprintValue)) return 'blueprint';
  if (Boolean(architectValue)) return 'architect';
  if (Boolean(manifestValue)) return 'build-manifest';
  return 'platform-default';
}

function requirement(
  type: BuildContractRequirementType,
  target: string,
  title: string,
  description: string,
  status: BuildContractCapabilityStatus,
  source: BuildContractSourceKind,
  validationStrategy: BuildContractValidationStrategy
): BuildContractRequirement {
  return {
    stableId: stableRequirementId(type, target),
    type,
    title,
    description,
    status,
    source,
    validationStrategy,
    completionStatus: 'pending',
    evidenceReferences:
      type === 'route'
        ? [{ kind: 'route', ref: target }]
        : [{ kind: 'source', ref: source }],
  };
}

function createRequirements(contract: Omit<BuildContract, 'requirements'>): BuildContractRequirement[] {
  const requirements: BuildContractRequirement[] = [];

  for (const route of contract.routes) {
    requirements.push(
      requirement(
        'route',
        route.path,
        `Route ${route.path}`,
        route.purpose || `${route.label} route must exist as an App Router page.`,
        route.required ? 'required' : 'optional',
        route.source,
        'route-exists'
      )
    );
  }
  for (const model of contract.dataModels) {
    requirements.push(
      requirement(
        'data-model',
        model.name,
        `Data model: ${model.name}`,
        `${model.name} model should include ${model.fields.join(', ') || 'the approved fields'}.`,
        'required',
        model.source,
        'content-check'
      )
    );
  }
  contract.relationships.forEach((relationship) => {
    requirements.push(
      requirement(
        'relationship',
        relationship,
        `Relationship: ${relationship}`,
        relationship,
        'required',
        contract.dataModels.some((model) => model.source === 'blueprint')
          ? 'blueprint'
          : 'platform-default',
        'content-check'
      )
    );
  });
  contract.apis.forEach((api) => {
    requirements.push(
      requirement(
        'api',
        api.path,
        `API ${api.path}`,
        `${api.methods.join(', ')} endpoint for ${api.purpose || 'approved server workflow'}.`,
        'required',
        api.source,
        'file-exists'
      )
    );
  });
  contract.rolesAndPermissions.forEach((role) => {
    requirements.push(
      requirement(
        'role-permission',
        role,
        `Role or permission: ${role}`,
        `${role} should be represented in the approved auth and navigation plan.`,
        /no authentication/i.test(contract.authentication) ? 'optional' : 'required',
        'blueprint',
        'manual-review'
      )
    );
  });
  contract.storageRequirements.forEach((storage) => {
    requirements.push(
      requirement(
        'storage',
        storage,
        `Storage: ${storage}`,
        storage,
        'required',
        'architect',
        'content-check'
      )
    );
  });
  contract.billingRequirements.forEach((billing) => {
    requirements.push(
      requirement(
        'billing',
        billing,
        `Billing: ${billing}`,
        billing,
        'required',
        'architect',
        'manual-review'
      )
    );
  });
  contract.backgroundJobs.forEach((job) => {
    requirements.push(
      requirement(
        'background-job',
        job,
        `Background job: ${job}`,
        job,
        'optional',
        'architect',
        'manual-review'
      )
    );
  });
  contract.integrations.forEach((name) => {
    requirements.push(
      requirement(
        'integration',
        name,
        `Integration: ${name}`,
        `${name} must be represented without exposing secrets client-side.`,
        'optional',
        'blueprint',
        'manual-review'
      )
    );
  });
  contract.aiCapabilities.forEach((name) => {
    requirements.push(
      requirement(
        'ai-capability',
        name,
        `AI capability: ${name}`,
        `${name} should be included only with guarded usage and clear user control.`,
        'optional',
        'architect',
        'manual-review'
      )
    );
  });
  contract.environmentVariableNames.forEach((name) => {
    requirements.push(
      requirement(
        'environment-variable',
        name,
        `Environment variable: ${name}`,
        `${name} should be documented and never hard-coded.`,
        'required',
        'platform-default',
        'config-check'
      )
    );
  });

  requirements.push(
    requirement(
      'layout',
      contract.layouts.join('|') || 'responsive-app-layout',
      'Approved layout',
      `Use ${contract.layouts.join(', ') || 'a responsive application layout'}.`,
      'required',
      contract.visualRequirements.source,
      'generated-quality'
    ),
    requirement(
      'navigation',
      contract.navigation.join('|') || 'primary-route-navigation',
      'Primary navigation',
      'Navigation must link to required App Router routes instead of replacing them with same-page anchors.',
      'required',
      contract.navigation.length ? 'blueprint' : 'platform-default',
      'generated-quality'
    ),
    requirement(
      'authentication',
      contract.authentication,
      'Authentication plan',
      contract.authentication,
      /no authentication/i.test(contract.authentication) ? 'optional' : 'required',
      sourceFor(contract.rolesAndPermissions.length, contract.authentication, null),
      'manual-review'
    ),
    requirement(
      'deployment',
      contract.deploymentTarget,
      'Deployment target',
      contract.deploymentTarget,
      'required',
      sourceFor(null, contract.deploymentTarget, null),
      'build'
    ),
    requirement(
      'visual',
      'visual-consistency',
      'Visual consistency',
      'Primary routes should follow the approved appearance, palette, UI style, and layout.',
      'required',
      contract.visualRequirements.source,
      'generated-quality'
    ),
    requirement(
      'responsive',
      'responsive-design',
      'Responsive design',
      contract.responsiveRequirements.expectations.join(' '),
      'required',
      contract.responsiveRequirements.source,
      'generated-quality'
    ),
    requirement(
      'accessibility',
      'accessibility-baseline',
      'Accessibility baseline',
      contract.accessibilityExpectations.expectations.join(' '),
      'required',
      contract.accessibilityExpectations.source,
      'manual-review'
    )
  );

  contract.constraints.forEach((constraint) => {
    requirements.push(
      requirement(
        'constraint',
        constraint,
        constraint,
        constraint,
        'required',
        'platform-default',
        'generated-quality'
      )
    );
  });
  contract.acceptanceCriteria.forEach((criterion) => {
    requirements.push(
      requirement(
        'acceptance',
        criterion,
        criterion,
        criterion,
        'required',
        'platform-default',
        'generated-quality'
      )
    );
  });

  const byId = new Map<string, BuildContractRequirement>();
  for (const item of requirements) {
    if (!byId.has(item.stableId)) byId.set(item.stableId, item);
  }
  return Array.from(byId.values());
}

function budgetConstraints(architectDraft?: ArchitectDraft | null): string[] {
  const budget = architectDraft?.answers.investmentLevel;
  if (budget === 'free-first') {
    return [
      'Prefer free-tier or local-first services unless the approved Blueprint explicitly requires a paid integration.',
      'Avoid paid-only defaults for prototype builds.',
    ];
  }
  if (budget === 'lean') {
    return ['Prefer low-cost managed services with clear upgrade paths.'];
  }
  if (budget === 'professional') {
    return ['Managed services are acceptable when they reduce launch risk.'];
  }
  if (budget === 'growth') {
    return ['Plan for scalable managed services, monitoring, and operational readiness.'];
  }
  return [];
}

export function createBuildContract(options: BuildContractCreateOptions): BuildContract {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const { architectDraft, buildManifest, blueprintDraft } = options;
  const projectName = findFirst(
    options.projectName,
    blueprintDraft?.projectName,
    architectDraft?.projectName,
    buildManifest?.appType?.label,
    'Untitled Matrix App'
  )!;
  const projectSummary = findFirst(
    blueprintDraft?.appDescription,
    architectDraft?.specification.applicationSummary,
    buildManifest?.appType?.label
      ? `Build a ${buildManifest.appType.label}.`
      : undefined,
    'Approved Matrix Coder AI application.'
  )!;
  const routes = mergeRoutes(blueprintDraft, architectDraft, buildManifest);
  const dataModels = mergeModels(blueprintDraft, architectDraft);
  const apis = mergeApis(architectDraft);
  const integrations = [
    ...itemNames(blueprintDraft?.integrations),
    ...manifestNames(buildManifest?.integrations),
    ...(architectDraft?.specification.recommendedIntegrations ?? []),
  ].filter((value, index, all) => all.indexOf(value) === index);
  const aiCapabilities = [
    ...(architectDraft?.answers.aiFeatures ?? []),
    ...manifestNames(buildManifest?.aiFeatures),
  ].filter((value, index, all) => all.indexOf(value) === index);
  const layouts = [
    ...itemNames(blueprintDraft?.folderStructure).filter((name) =>
      /layout|shell|sidebar|navigation|app/i.test(name)
    ),
    buildManifest?.layout?.label,
    buildManifest?.navigation.inferredPattern,
  ].filter((value): value is string => Boolean(value));
  const navigation = itemNames(blueprintDraft?.navigation);
  const authentication =
    blueprintDraft?.userRoles.length || architectDraft?.answers.accountsRequired
      ? architectDraft?.specification.recommendedAuth ??
        'User accounts with role-aware access where needed.'
      : 'No authentication required for the first version.';
  const rolesAndPermissions = itemNames(blueprintDraft?.userRoles);
  const billingRequirements =
    architectDraft?.answers.payments ||
    integrations.some((item) => /stripe|billing|payment/i.test(item))
      ? ['Billing/subscription model and safe payment integration path.']
      : [];
  const storageRequirements =
    architectDraft?.answers.database === 'local-first' ||
    architectDraft?.answers.investmentLevel === 'free-first'
      ? ['Local-first persistence with an upgrade path.']
      : ['Project-scoped persistence suitable for the approved data models.'];
  const backgroundJobs =
    integrations.filter((item) => /job|schedule|queue|sync|cron/i.test(item));
  const environmentVariableNames = [
    ...(integrations.some((item) => /supabase/i.test(item))
      ? ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
      : []),
    ...(integrations.some((item) => /stripe/i.test(item))
      ? ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
      : []),
    ...(aiCapabilities.length || integrations.some((item) => /openai/i.test(item))
      ? ['OPENAI_API_KEY']
      : []),
  ];
  const visualSource = sourceFor(null, null, buildManifest?.uiStyle);
  const responsiveSource = sourceFor(null, architectDraft?.answers.mobileSupport.length, buildManifest?.mobileFeatures);
  const constraints = [
    'Use Next.js App Router with src/app only.',
    'Keep app route page.tsx files as Server Components.',
    "Put hooks, state, forms, browser APIs, and localStorage inside 'use client' child components.",
    'Preserve approved route names exactly.',
    ...budgetConstraints(architectDraft),
  ];
  const requiredCapabilities = [
    'Project generated',
    'Imports valid',
    'TypeScript passes',
    'Build passes',
    'Runtime smoke passes',
    'Generated quality passes',
  ];
  const optionalCapabilities = [
    ...integrations,
    ...aiCapabilities,
    ...backgroundJobs,
  ].filter((value, index, all) => all.indexOf(value) === index);

  const partialContract: Omit<BuildContract, 'requirements'> = {
    schemaVersion: BUILD_CONTRACT_SCHEMA_VERSION,
    metadataVersion: BUILD_CONTRACT_METADATA_VERSION,
    contractVersion: (options.existingContract?.contractVersion ?? 0) + 1,
    id:
      options.existingContract?.id ??
      `build-contract-${options.projectId ?? (slugify(projectName) || 'project')}`,
    project: {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      projectName,
    },
    projectSummary,
    sourceArchitectDraft: sourceRef('architect', architectDraft),
    sourceBuildManifest: sourceRef('build-manifest', buildManifest),
    sourceBlueprintDraft: sourceRef('blueprint', blueprintDraft),
    targetFramework: 'Next.js 15 App Router',
    routes,
    layouts: layouts.length ? layouts : ['Responsive app layout'],
    navigation,
    dataModels,
    relationships: dataModels.length > 1 ? ['Relationships should follow approved model references and route workflows.'] : [],
    authentication,
    rolesAndPermissions,
    apis,
    integrations,
    aiCapabilities,
    storageRequirements,
    billingRequirements,
    backgroundJobs,
    environmentVariableNames,
    deploymentTarget:
      blueprintDraft?.deploymentTarget ||
      architectDraft?.specification.recommendedDeployment ||
      'Next.js web app',
    visualRequirements: {
      appearance: buildManifest?.appearance,
      palette: buildManifest?.colorPalette?.label,
      uiStyle: buildManifest?.uiStyle?.label,
      layout: buildManifest?.layout?.label,
      source: visualSource,
    },
    responsiveRequirements: {
      mobileSupport:
        architectDraft?.answers.mobileSupport ??
        (buildManifest?.mobileFeatures ? [buildManifest.mobileFeatures.label] : ['responsive-web']),
      expectations: [
        'Primary workflows must work on desktop and mobile widths.',
        'Text and controls must not overlap or clip.',
      ],
      source: responsiveSource,
    },
    accessibilityExpectations: {
      expectations: [
        'Interactive controls should have accessible labels or visible text.',
        'Color contrast should be suitable for the approved theme.',
        'Keyboard navigation should remain usable for primary workflows.',
      ],
      source: 'platform-default',
    },
    acceptanceCriteria: [
      'All required routes exist and render useful app content.',
      'All required data models are represented in typed state or storage helpers.',
      'Primary navigation reaches real App Router pages.',
      'Production validation passes before reporting completion.',
    ],
    constraints,
    optionalCapabilities,
    requiredCapabilities,
    createdAt: options.existingContract?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  return {
    ...partialContract,
    requirements: createRequirements(partialContract),
  };
}

export { stableRequirementId };
