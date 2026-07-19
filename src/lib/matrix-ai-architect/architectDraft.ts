import {
  createBlueprintDraftFromManifest,
  saveBlueprintDraft,
  type BlueprintDataModel,
  type BlueprintDraft,
  type BlueprintDraftItem,
  type BlueprintRouteItem,
} from '@/lib/blueprint-studio/blueprintDraft';
import {
  ARCHITECT_RECOMMENDATION_RULES,
  serviceRuleToRecommendation,
  type ArchitectServiceRecommendationRule,
} from './recommendationRules';
import {
  ARCHITECT_DRAFT_METADATA_VERSION,
  type ArchitectAnswers,
  type ArchitectApiSpec,
  type ArchitectDataModelSpec,
  type ArchitectDraft,
  type ArchitectDraftCreateOptions,
  type ArchitectRecommendation,
  type ArchitectRouteSpec,
  type ArchitectSpecification,
  type ArchitectBudgetMode,
} from './types';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const MATRIX_ARCHITECT_DRAFT_STORAGE_KEY =
  'matrix-ai-architect:draft';
export const MATRIX_ARCHITECT_BLUEPRINT_HANDOFF_KEY =
  'matrix-ai-architect:blueprint-handoff';

export interface ArchitectBlueprintHandoff {
  source: 'matrix-ai-architect';
  architectDraftId: string;
  architectUpdatedAt: string;
  blueprintDraft: BlueprintDraft;
  createdAt: string;
}

export interface ArchitectBlueprintHandoffResult {
  blueprintDraft: BlueprintDraft;
  skipped: boolean;
  reason?: string;
}

export function createDefaultArchitectAnswers(): ArchitectAnswers {
  return {
    appIdea: '',
    investmentLevel: 'free-first',
    primaryUsers: '',
    accountsRequired: false,
    adminPanel: false,
    mobileSupport: ['responsive-web'],
    payments: false,
    notifications: [],
    aiFeatures: [],
    offlineSupport: false,
    database: 'hybrid',
    publicWebsite: true,
    dashboard: true,
    crm: false,
    scheduling: false,
    analytics: false,
    auth: 'none',
    deploymentTarget: 'nextjs-web',
    integrations: [],
    customRequirements: '',
  };
}

function createId(prefix: string, now: Date): string {
  return `${prefix}-${now.getTime().toString(36)}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCase(value: string): string {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function appText(answers: ArchitectAnswers): string {
  return [
    answers.appIdea,
    answers.primaryUsers,
    answers.customRequirements,
    answers.integrations.join(' '),
    answers.aiFeatures.join(' '),
  ]
    .join(' ')
    .toLowerCase();
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function route(path: string, purpose: string, priority: 'primary' | 'secondary' = 'primary'): ArchitectRouteSpec {
  return {
    path,
    label: path === '/' ? 'Home' : titleCase(path.slice(1)),
    purpose,
    priority,
  };
}

function dedupeRoutes(routes: ArchitectRouteSpec[]): ArchitectRouteSpec[] {
  const seen = new Set<string>();
  return routes.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

function inferRoutes(answers: ArchitectAnswers): ArchitectRouteSpec[] {
  const text = appText(answers);
  const routes: ArchitectRouteSpec[] = [
    route('/', answers.publicWebsite ? 'Public overview and entry point.' : 'Main app home.'),
  ];

  if (answers.dashboard || includesAny(text, ['dashboard', 'admin', 'analytics', 'saas'])) {
    routes.push(route('/dashboard', 'Operational overview, metrics, and next actions.'));
  }
  if (answers.crm || includesAny(text, ['crm', 'contact', 'pipeline', 'deal'])) {
    routes.push(
      route('/contacts', 'Manage people, relationship notes, search, and follow-ups.'),
      route('/companies', 'Track company/account records and related contacts.'),
      route('/tasks', 'Manage follow-ups, reminders, and action items.'),
      route('/pipeline', 'Move deals or opportunities through stages.')
    );
  }
  if (answers.scheduling || includesAny(text, ['booking', 'schedule', 'appointment', 'calendar'])) {
    routes.push(
      route('/calendar', 'Calendar and availability overview.'),
      route('/appointments', 'Create and manage bookings or appointments.'),
      route('/clients', 'Manage client profiles and booking history.')
    );
  }
  if (includesAny(text, ['fitness', 'workout', 'calorie', 'nutrition', 'habit', 'goal'])) {
    routes.push(
      route('/workouts', 'Log and manage workouts or habits.'),
      route('/progress', 'Review trends, stats, and milestones.'),
      route('/goals', 'Set goals and monitor progress.'),
      route('/nutrition', 'Track meals, calories, hydration, or macros.', 'secondary')
    );
  }
  if (includesAny(text, ['expense', 'finance', 'budget', 'transaction'])) {
    routes.push(
      route('/transactions', 'Add, edit, search, and categorize transactions.'),
      route('/budgets', 'Plan and monitor budget categories.'),
      route('/reports', 'Review spending trends and summary reports.')
    );
  }
  if (includesAny(text, ['ecommerce', 'store', 'shop', 'product', 'order'])) {
    routes.push(
      route('/products', 'Manage product catalog, stock, and status.'),
      route('/orders', 'Review order flow and fulfillment status.'),
      route('/customers', 'Manage customer records and purchase history.')
    );
  }
  if (answers.adminPanel) {
    routes.push(route('/admin', 'Admin controls for content, users, and settings.', 'secondary'));
  }
  if (answers.accountsRequired || answers.auth !== 'none') {
    routes.push(route('/settings', 'Account, profile, and app preferences.', 'secondary'));
  }

  return dedupeRoutes(routes).slice(0, 8);
}

function model(name: string, fields: string[], purpose: string): ArchitectDataModelSpec {
  return { name, fields, purpose };
}

function inferDataModels(answers: ArchitectAnswers): ArchitectDataModelSpec[] {
  const text = appText(answers);
  const models: ArchitectDataModelSpec[] = [];

  if (answers.accountsRequired || answers.auth !== 'none') {
    models.push(model('User', ['id', 'email', 'name', 'role', 'createdAt'], 'Account identity and permissions.'));
  }
  if (answers.crm || includesAny(text, ['crm', 'contact', 'pipeline', 'deal'])) {
    models.push(
      model('Contact', ['id', 'name', 'email', 'phone', 'companyId', 'status', 'notes'], 'Relationship records.'),
      model('Company', ['id', 'name', 'website', 'industry', 'notes'], 'Company/account records.'),
      model('Task', ['id', 'title', 'dueDate', 'status', 'contactId'], 'Follow-ups and reminders.'),
      model('Deal', ['id', 'name', 'stage', 'value', 'companyId'], 'Pipeline opportunities.')
    );
  }
  if (answers.payments || answers.integrations.includes('stripe')) {
    models.push(model('Subscription', ['id', 'userId', 'plan', 'status', 'renewalDate'], 'Billing and plan access.'));
  }
  if (includesAny(text, ['fitness', 'workout', 'calorie', 'nutrition', 'habit', 'goal'])) {
    models.push(
      model('Workout', ['id', 'title', 'type', 'duration', 'date', 'notes'], 'Training log entries.'),
      model('Goal', ['id', 'title', 'target', 'progress', 'dueDate'], 'Goal tracking.'),
      model('ProgressEntry', ['id', 'metric', 'value', 'date'], 'Progress measurements.')
    );
  }
  if (includesAny(text, ['expense', 'finance', 'budget', 'transaction'])) {
    models.push(
      model('Transaction', ['id', 'title', 'amount', 'category', 'type', 'date', 'note'], 'Income and expense records.'),
      model('Budget', ['id', 'category', 'limit', 'period'], 'Budget planning.')
    );
  }
  if (models.length === 0) {
    models.push(model('Record', ['id', 'name', 'status', 'notes', 'createdAt'], 'Primary app data.'));
  }

  return models.slice(0, 8);
}

function inferApis(answers: ArchitectAnswers): ArchitectApiSpec[] {
  const apis: ArchitectApiSpec[] = [];
  if (answers.accountsRequired || answers.auth !== 'none') {
    apis.push({
      path: '/api/profile',
      purpose: 'Load and update account/profile data.',
      methods: ['GET', 'PATCH'],
    });
  }
  if (answers.payments || answers.integrations.includes('stripe')) {
    apis.push({
      path: '/api/billing',
      purpose: 'Future billing checkout and subscription status endpoint.',
      methods: ['POST', 'GET'],
    });
  }
  if (answers.aiFeatures.length > 0) {
    apis.push({
      path: '/api/ai',
      purpose: 'Guarded AI feature endpoint with usage controls.',
      methods: ['POST'],
    });
  }
  return apis;
}

function recommendationSignals(answers: ArchitectAnswers): string[] {
  const signals = [
    answers.accountsRequired ? 'accounts' : 'no-accounts',
    answers.adminPanel ? 'admin' : '',
    answers.offlineSupport ? 'offline' : '',
    answers.payments ? 'payments billing subscription stripe' : '',
    answers.dashboard ? 'dashboard' : '',
    answers.analytics ? 'analytics' : '',
    answers.database,
    answers.deploymentTarget,
    answers.auth,
    ...answers.notifications,
    ...answers.aiFeatures,
    ...answers.integrations,
    appText(answers),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return signals.split(/\s+/).filter(Boolean);
}

export function getArchitectServiceRecommendations(
  answers: ArchitectAnswers
): ArchitectServiceRecommendationRule[] {
  const signals = new Set(recommendationSignals(answers));
  const candidates = ARCHITECT_RECOMMENDATION_RULES.filter((rule) => {
    if (!rule.budgetModes.includes(answers.investmentLevel)) return false;
    return rule.signals.some((signal) => signals.has(signal));
  });

  const byCategory = new Map<string, ArchitectServiceRecommendationRule>();
  for (const rule of candidates) {
    const existing = byCategory.get(rule.category);
    if (!existing || rule.confidence > existing.confidence) {
      byCategory.set(rule.category, rule);
    }
  }

  if (!byCategory.has('deployment') && answers.investmentLevel !== 'free-first') {
    const deployment = ARCHITECT_RECOMMENDATION_RULES.find(
      (rule) => rule.category === 'deployment'
    );
    if (deployment) byCategory.set('deployment', deployment);
  }

  return Array.from(byCategory.values()).sort(
    (a, b) => b.confidence - a.confidence
  );
}

function baseRecommendations(answers: ArchitectAnswers): ArchitectRecommendation[] {
  const recommendations: ArchitectRecommendation[] = [
    {
      title: 'Keep route pages as Server Components',
      description:
        "Place hooks, browser APIs, forms, and localStorage inside 'use client' child components.",
      confidence: 95,
      category: 'architecture',
    },
  ];

  if (answers.investmentLevel === 'free-first') {
    recommendations.push({
      title: 'Launch free-first with local persistence',
      description:
        'Use localStorage or mock data first, then upgrade to managed services when the app proves demand.',
      confidence: 89,
      category: 'cost',
    });
  }
  if (answers.mobileSupport.includes('android-capacitor')) {
    recommendations.push({
      title: 'Keep mobile screens shallow and responsive',
      description:
        'A mobile-ready web app will make the future Capacitor path easier.',
      confidence: 78,
      category: 'ux',
    });
  }

  return recommendations;
}

export function buildArchitectSpecification(
  answers: ArchitectAnswers
): ArchitectSpecification {
  const routes = inferRoutes(answers);
  const models = inferDataModels(answers);
  const serviceRecommendations = getArchitectServiceRecommendations(answers);
  const complexityScore =
    routes.length +
    models.length +
    answers.integrations.length +
    answers.aiFeatures.length +
    (answers.accountsRequired ? 2 : 0) +
    (answers.payments ? 2 : 0) +
    (answers.adminPanel ? 1 : 0);
  const estimatedComplexity =
    complexityScore >= 18
      ? 'platform'
      : complexityScore >= 12
      ? 'large'
      : complexityScore >= 7
      ? 'medium'
      : 'small';

  return {
    applicationSummary:
      answers.appIdea.trim() ||
      'A new Matrix Coder AI application planned through Matrix AI Architect.',
    recommendedArchitecture:
      'Next.js 15 App Router with src/app only, Server Component route pages, client child components for interactivity, typed domain helpers, and project-scoped persistence.',
    recommendedFolderStructure: [
      'src/app - App Router routes and server page shells',
      'src/components - reusable UI and client workflow components',
      'src/lib - storage, domain logic, validation helpers, and API wrappers',
      'src/types - shared TypeScript types',
    ],
    recommendedRoutes: routes,
    recommendedDataModels: models,
    recommendedComponents: [
      'App shell/navigation',
      'Dashboard summary cards',
      'CRUD forms',
      'Search and filters',
      ...(answers.analytics ? ['Charts and metrics'] : []),
      ...(answers.notifications.length ? ['Notification center'] : []),
      ...(answers.aiFeatures.length ? ['AI assistant panel'] : []),
    ],
    recommendedApis: inferApis(answers),
    recommendedIntegrations: serviceRecommendations.map(
      (rule) => rule.recommendedOption
    ),
    recommendedAuth:
      answers.accountsRequired || answers.auth !== 'none'
        ? 'User accounts with role-aware access where needed.'
        : 'No authentication required for the first version.',
    recommendedDeployment:
      answers.deploymentTarget === 'zip-export'
        ? 'Start with project ZIP export and run production checks before hosting.'
        : answers.deploymentTarget === 'vercel'
        ? 'Prepare for Vercel deployment after production checks pass.'
        : 'Next.js web deployment with production checks before release.',
    estimatedComplexity,
    estimatedGenerationSize:
      estimatedComplexity === 'platform' || estimatedComplexity === 'large'
        ? 'expanded'
        : estimatedComplexity === 'medium'
        ? 'standard'
        : 'compact',
    estimatedAiPasses:
      estimatedComplexity === 'platform'
        ? 5
        : estimatedComplexity === 'large'
        ? 4
        : estimatedComplexity === 'medium'
        ? 3
        : 2,
    confidenceScore: Math.max(
      52,
      Math.min(94, 62 + routes.length * 3 + models.length * 2)
    ),
    recommendations: [
      ...baseRecommendations(answers),
      ...serviceRecommendations.map(serviceRuleToRecommendation),
    ],
  };
}

export function createArchitectDraft(
  options: ArchitectDraftCreateOptions = {}
): ArchitectDraft {
  const now = options.now ?? new Date();
  const answers = createDefaultArchitectAnswers();
  return {
    id: createId('architect', now),
    projectId: options.projectId,
    projectName: options.projectName?.trim() || 'Untitled Matrix App',
    answers,
    specification: buildArchitectSpecification(answers),
    sourceBuildManifest: options.sourceBuildManifest,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    metadataVersion: ARCHITECT_DRAFT_METADATA_VERSION,
  };
}

export function updateArchitectAnswer<K extends keyof ArchitectAnswers>(
  draft: ArchitectDraft,
  key: K,
  value: ArchitectAnswers[K],
  now = new Date()
): ArchitectDraft {
  const answers = { ...draft.answers, [key]: value };
  return {
    ...draft,
    projectName:
      key === 'appIdea' && typeof value === 'string' && value.trim()
        ? value.trim().split(/[.!?\n]/)[0]?.slice(0, 64) || draft.projectName
        : draft.projectName,
    answers,
    specification: buildArchitectSpecification(answers),
    updatedAt: now.toISOString(),
  };
}

function blueprintItem(prefix: string, name: string, description?: string): BlueprintDraftItem {
  return {
    id: `${prefix}-${slugify(name) || 'item'}`,
    name,
    description,
  };
}

function blueprintRoute(routeSpec: ArchitectRouteSpec): BlueprintRouteItem {
  return {
    id: `route-${slugify(routeSpec.path === '/' ? 'home' : routeSpec.path) || 'home'}`,
    name: routeSpec.label,
    path: routeSpec.path,
    description: routeSpec.purpose,
  };
}

function blueprintModel(modelSpec: ArchitectDataModelSpec): BlueprintDataModel {
  return {
    id: `model-${slugify(modelSpec.name) || 'record'}`,
    name: modelSpec.name,
    fields: [...modelSpec.fields],
    description: modelSpec.purpose,
  };
}

export function createBlueprintDraftFromArchitectDraft(
  architectDraft: ArchitectDraft,
  now = new Date()
): BlueprintDraft {
  const base = createBlueprintDraftFromManifest(
    architectDraft.sourceBuildManifest ?? null,
    now
  );
  const spec = architectDraft.specification;
  return {
    ...base,
    projectName: architectDraft.projectName,
    appDescription: [
      spec.applicationSummary,
      '',
      spec.recommendedArchitecture,
      architectDraft.answers.customRequirements
        ? `Additional requirements: ${architectDraft.answers.customRequirements}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    routes: spec.recommendedRoutes.map(blueprintRoute),
    dataModels: spec.recommendedDataModels.map(blueprintModel),
    components: spec.recommendedComponents.map((name) =>
      blueprintItem('component', name)
    ),
    integrations: spec.recommendedIntegrations.map((name) =>
      blueprintItem('integration', name)
    ),
    userRoles:
      architectDraft.answers.accountsRequired || architectDraft.answers.auth !== 'none'
        ? [
            blueprintItem('role', 'Admin', 'Manages users, settings, and core records.'),
            blueprintItem('role', 'User', 'Uses the primary application workflows.'),
          ]
        : [blueprintItem('role', 'Local User', 'Uses the app without account setup.')],
    navigation: spec.recommendedRoutes.map((item) =>
      blueprintItem('navigation', item.label, `Link to ${item.path}`)
    ),
    folderStructure: spec.recommendedFolderStructure.map((item) =>
      blueprintItem('folder', item.split(' - ')[0] ?? item, item)
    ),
    deploymentTarget: spec.recommendedDeployment,
    updatedAt: now.toISOString(),
  };
}

export function createArchitectBlueprintHandoff(
  architectDraft: ArchitectDraft,
  now = new Date()
): ArchitectBlueprintHandoff {
  return {
    source: 'matrix-ai-architect',
    architectDraftId: architectDraft.id,
    architectUpdatedAt: architectDraft.updatedAt,
    blueprintDraft: createBlueprintDraftFromArchitectDraft(architectDraft, now),
    createdAt: now.toISOString(),
  };
}

export function applyArchitectBlueprintHandoff(
  storage: Pick<StorageLike, 'setItem'>,
  architectDraft: ArchitectDraft,
  existingBlueprintDraft?: BlueprintDraft | null,
  now = new Date()
): ArchitectBlueprintHandoffResult {
  if (
    existingBlueprintDraft &&
    Date.parse(existingBlueprintDraft.updatedAt) > Date.parse(architectDraft.updatedAt)
  ) {
    return {
      blueprintDraft: existingBlueprintDraft,
      skipped: true,
      reason:
        'Blueprint Studio has newer edits. Architect handoff was not applied.',
    };
  }

  const handoff = createArchitectBlueprintHandoff(architectDraft, now);
  saveBlueprintDraft(storage, handoff.blueprintDraft);
  storage.setItem(MATRIX_ARCHITECT_BLUEPRINT_HANDOFF_KEY, JSON.stringify(handoff));
  return { blueprintDraft: handoff.blueprintDraft, skipped: false };
}

export function serializeArchitectDraft(draft: ArchitectDraft): string {
  return JSON.stringify(draft);
}

export function deserializeArchitectDraft(raw: string): ArchitectDraft | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ArchitectDraft>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.projectName !== 'string' ||
      !parsed.answers ||
      !parsed.specification ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string' ||
      parsed.metadataVersion !== ARCHITECT_DRAFT_METADATA_VERSION
    ) {
      return null;
    }
    return parsed as ArchitectDraft;
  } catch {
    return null;
  }
}

export function saveArchitectDraft(
  storage: Pick<StorageLike, 'setItem'>,
  draft: ArchitectDraft
): void {
  storage.setItem(MATRIX_ARCHITECT_DRAFT_STORAGE_KEY, serializeArchitectDraft(draft));
}

export function loadArchitectDraft(
  storage: Pick<StorageLike, 'getItem'>
): ArchitectDraft | null {
  const raw = storage.getItem(MATRIX_ARCHITECT_DRAFT_STORAGE_KEY);
  return raw ? deserializeArchitectDraft(raw) : null;
}

export function clearArchitectDraft(
  storage: Pick<StorageLike, 'removeItem'>
): void {
  storage.removeItem(MATRIX_ARCHITECT_DRAFT_STORAGE_KEY);
}
