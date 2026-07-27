import {
  createBlueprintDraftFromManifest,
  type BlueprintDataModel,
  type BlueprintDraft,
  type BlueprintDraftItem,
  type BlueprintRouteItem,
} from '@/lib/blueprint-studio/blueprintDraft';
import {
  createBuildContract,
  type BuildContract,
  type BuildContractApi,
  type BuildContractDataModel,
  type BuildContractRoute,
} from '@/lib/build-contract';
import { createTaskGraph, type TaskGraph, type TaskGraphTask } from '@/lib/task-graph';
import { resolveCapabilities } from '@/lib/capabilities';
import {
  addIntelligenceRecord,
  createIntelligenceCore,
} from '@/lib/intelligence-core';
import type { RepositoryModel } from '@/lib/repository-model';
import {
  createArchitectDraft,
  updateArchitectAnswer,
} from '@/lib/matrix-ai-architect/architectDraft';
import type {
  ArchitectDataModelSpec,
  ArchitectDraft,
} from '@/lib/matrix-ai-architect/types';
import {
  CHANGE_PLAN_METADATA_VERSION,
  CHANGE_PLAN_SCHEMA_VERSION,
  type BlueprintChangeSummary,
  type AppliedBuildChange,
  type ApplyApprovedChangePlanOptions,
  type BuildChangePlan,
  type BuildChangePlanStatus,
  type BuildChangeRequest,
  type BuildContractChangeSummary,
  type ChangeEffortEstimate,
  type ChangeIntent,
  type ChangeServiceCostEstimate,
  type ChangePlanApprovalRequirement,
  type ChangePlanRisk,
  type ChangePlanTaskSummary,
  type ChangeRequestSource,
  type CreateChangePlanOptions,
} from './types';

function createId(prefix: string, now: Date): string {
  return `${prefix}-${now.getTime().toString(36)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function isChangePlanApprovalMessage(value: string): boolean {
  return /^(approve|approved|approve change|apply change|go ahead|yes,? apply it|yes,? approve)$/i.test(
    value.trim()
  );
}

export function isChangePlanCancellationMessage(value: string): boolean {
  return /^(cancel|cancel change|discard change|never mind|nevermind|do not apply)$/i.test(
    value.trim()
  );
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function appendSentence(value: string, sentence: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().includes(sentence.toLowerCase())) return value;
  return trimmed ? `${trimmed}\n${sentence}` : sentence;
}

function fieldListWith(fields: string[], additions: string[]): string[] {
  const lower = new Set(fields.map((field) => field.toLowerCase()));
  const next = [...fields];
  additions.forEach((field) => {
    if (!lower.has(field.toLowerCase())) next.push(field);
  });
  return next;
}

function blueprintItem(prefix: string, name: string, description?: string): BlueprintDraftItem {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return {
    id: `${prefix}-${slug || 'item'}`,
    name,
    description,
  };
}

function blueprintRoute(
  path: string,
  name: string,
  description: string
): BlueprintRouteItem {
  return {
    ...blueprintItem('route', path === '/' ? 'home' : path),
    name,
    path,
    description,
  };
}

function modelKey(model: Pick<BlueprintDataModel, 'name'> | Pick<BuildContractDataModel, 'name'>): string {
  return model.name.trim().toLowerCase();
}

function routeKey(route: Pick<BuildContractRoute, 'path'>): string {
  return route.path.trim().toLowerCase() || '/';
}

function apiKey(api: Pick<BuildContractApi, 'path' | 'methods'>): string {
  return `${api.path.trim().toLowerCase()} ${api.methods.join(',').toLowerCase()}`;
}

function itemDiff<T>(
  before: T[],
  after: T[],
  key: (item: T) => string,
  fingerprint: (item: T) => string = (item) => JSON.stringify(item)
): { added: string[]; removed: string[]; changed: string[] } {
  const beforeMap = new Map(before.map((item) => [key(item), item]));
  const afterMap = new Map(after.map((item) => [key(item), item]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  afterMap.forEach((item, id) => {
    const previous = beforeMap.get(id);
    if (!previous) {
      added.push(id);
      return;
    }
    if (fingerprint(previous) !== fingerprint(item)) changed.push(id);
  });

  beforeMap.forEach((_item, id) => {
    if (!afterMap.has(id)) removed.push(id);
  });

  return { added: unique(added), removed: unique(removed), changed: unique(changed) };
}

function stringDiff(before: string[], after: string[]) {
  const beforeSet = new Set(before.map((item) => item.toLowerCase()));
  const afterSet = new Set(after.map((item) => item.toLowerCase()));
  return {
    added: unique(after.filter((item) => !beforeSet.has(item.toLowerCase()))),
    removed: unique(before.filter((item) => !afterSet.has(item.toLowerCase()))),
    changed: [],
  };
}

export function createBuildChangeRequest(
  userRequest: string,
  options: {
    projectId?: string;
    source?: ChangeRequestSource;
    now?: Date;
  } = {}
): BuildChangeRequest {
  const now = options.now ?? new Date();
  return {
    schemaVersion: CHANGE_PLAN_SCHEMA_VERSION,
    metadataVersion: CHANGE_PLAN_METADATA_VERSION,
    id: createId('change-request', now),
    projectId: options.projectId,
    userRequest,
    source: options.source ?? 'conversation',
    createdAt: now.toISOString(),
  };
}

export function interpretChangeRequest(userRequest: string): ChangeIntent {
  const text = normalizeText(userRequest);
  const destructive = /\b(remove|delete|drop|deprecate|disable|get rid of)\b/.test(text);
  const providerChange = includesAny(text, [
    'switch auth',
    'change auth',
    'use clerk',
    'use firebase',
    'switch database',
    'change database',
    'use postgres',
    'use supabase',
    'switch stripe',
    'change billing',
    'switch deployment',
    'deploy to',
  ]);
  const multiChildStory = includesAny(text, [
    'two children',
    '2 children',
    'multiple children',
    'more than one child',
    'children instead of one',
    'child profiles',
  ]);
  const subscriptions = includesAny(text, [
    'add subscriptions',
    'add subscription',
    'subscription plans',
    'recurring billing',
    'paid plans',
    'membership plans',
  ]);

  if (destructive) {
    return {
      kind: 'destructive-change',
      summary: 'The request may remove an existing route, model, provider, or feature.',
      confidence: 0.82,
      assumptions: ['Deletion requests need explicit approval before tasks can run.'],
    };
  }
  if (providerChange) {
    return {
      kind: 'provider-change',
      summary: 'The request appears to change an architecture or provider choice.',
      confidence: 0.78,
      assumptions: ['Provider changes can affect environment variables, data, and deployment.'],
    };
  }
  if (multiChildStory) {
    return {
      kind: 'localized-feature-change',
      summary:
        'Update the story domain so one story can support multiple child profiles.',
      confidence: 0.9,
      assumptions: [
        'Existing story features should be preserved.',
        'The change should update story data structures and related UI flows only.',
      ],
    };
  }
  if (subscriptions) {
    return {
      kind: 'localized-feature-change',
      summary:
        'Add subscription plans, customer billing state, and account billing workflows.',
      confidence: 0.93,
      assumptions: [
        'Existing product features and completed engineering tasks remain unchanged.',
        'Billing secrets and provider operations remain server-side.',
        'The selected billing provider can be changed before approval.',
      ],
    };
  }

  return {
    kind: 'localized-feature-change',
    summary: 'Treat this as a localized product change until the user approves broader architecture work.',
    confidence: 0.55,
    assumptions: ['Prefer targeted tasks over whole-application regeneration.'],
  };
}

function ensureSubscriptionsArchitect(
  draft: ArchitectDraft,
  now: Date
): ArchitectDraft {
  const requirement =
    'Change request: add recurring subscription plans and account billing management.';
  let next = updateArchitectAnswer(draft, 'payments', true, now);
  next = updateArchitectAnswer(
    next,
    'integrations',
    fieldListWith(next.answers.integrations, ['stripe']),
    now
  );
  next = updateArchitectAnswer(
    next,
    'customRequirements',
    appendSentence(next.answers.customRequirements, requirement),
    now
  );
  return next;
}

function ensureBlueprintRoute(
  routes: BlueprintRouteItem[],
  path: string,
  name: string,
  description: string
): { routes: BlueprintRouteItem[]; added: boolean } {
  if (routes.some((route) => route.path.toLowerCase() === path.toLowerCase())) {
    return { routes, added: false };
  }
  return {
    routes: [...routes, blueprintRoute(path, name, description)],
    added: true,
  };
}

function ensureBlueprintItem(
  items: BlueprintDraftItem[],
  prefix: string,
  name: string,
  description: string
): { items: BlueprintDraftItem[]; added: boolean } {
  if (items.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
    return { items, added: false };
  }
  return {
    items: [...items, blueprintItem(prefix, name, description)],
    added: true,
  };
}

function ensureSubscriptionsBlueprint(
  draft: BlueprintDraft,
  now: Date
): { draft: BlueprintDraft; summary: BlueprintChangeSummary } {
  let routes = draft.routes;
  const routesAdded: string[] = [];
  for (const route of [
    ['/pricing', 'Pricing', 'Compare available subscription plans.'],
    [
      '/account/billing',
      'Account Billing',
      'Manage the current plan, billing state, and subscription actions.',
    ],
  ] as const) {
    const result = ensureBlueprintRoute(routes, route[0], route[1], route[2]);
    routes = result.routes;
    if (result.added) routesAdded.push(route[0]);
  }

  let models = draft.dataModels;
  const modelsAdded: string[] = [];
  const modelsChanged: string[] = [];
  for (const model of [
    {
      name: 'Plan',
      fields: ['id', 'name', 'priceId', 'status', 'features'],
      description: 'Subscription plan configuration and entitlement metadata.',
    },
    {
      name: 'Subscription',
      fields: [
        'id',
        'userId',
        'planId',
        'providerCustomerId',
        'providerSubscriptionId',
        'status',
        'currentPeriodEnd',
      ],
      description: 'Account subscription lifecycle and provider references.',
    },
  ]) {
    const result = ensureModel(
      models,
      model.name,
      model.fields,
      model.description
    );
    models = result.models;
    if (result.added) modelsAdded.push(model.name);
    if (result.changed) modelsChanged.push(model.name);
  }

  let components = draft.components;
  const componentsAdded: string[] = [];
  for (const component of [
    [
      'Pricing Table',
      'Compare approved plans and start a subscription safely.',
    ],
    [
      'Subscription Manager',
      'Display subscription state and guarded account billing actions.',
    ],
  ] as const) {
    const result = ensureBlueprintItem(
      components,
      'component',
      component[0],
      component[1]
    );
    components = result.items;
    if (result.added) componentsAdded.push(component[0]);
  }

  const integration = ensureBlueprintItem(
    draft.integrations,
    'integration',
    'Stripe',
    'Server-side subscription billing provider with webhook reconciliation.'
  );

  let navigation = draft.navigation;
  for (const route of routesAdded) {
    navigation = ensureBlueprintItem(
      navigation,
      'navigation',
      route === '/pricing' ? 'Pricing' : 'Account Billing',
      `Link to ${route}`
    ).items;
  }

  return {
    draft: {
      ...draft,
      appDescription: appendSentence(
        draft.appDescription,
        'The approved product supports recurring subscription plans and account billing management.'
      ),
      routes,
      dataModels: models,
      components,
      integrations: integration.items,
      navigation,
      updatedAt: now.toISOString(),
    },
    summary: {
      changed:
        routesAdded.length > 0 ||
        modelsAdded.length > 0 ||
        modelsChanged.length > 0 ||
        componentsAdded.length > 0 ||
        integration.added,
      routesAdded: unique(routesAdded),
      routesRemoved: [],
      routesChanged: [],
      modelsAdded: unique(modelsAdded),
      modelsRemoved: [],
      modelsChanged: unique(modelsChanged),
      componentsAdded: unique(componentsAdded),
      componentsChanged: [],
      integrationsChanged: integration.added ? ['Stripe'] : [],
      summary:
        'Added subscription routes, billing models, account components, navigation, and provider planning.',
    },
  };
}

function ensureStoryMultipleChildrenArchitect(
  draft: ArchitectDraft,
  now: Date
): ArchitectDraft {
  const requirement =
    'Change request: stories should support multiple child profiles per story.';
  let next = updateArchitectAnswer(
    draft,
    'customRequirements',
    appendSentence(draft.answers.customRequirements, requirement),
    now
  );
  const storyModelIndex = next.specification.recommendedDataModels.findIndex((model) =>
    /story/i.test(model.name)
  );
  const storyFields = ['id', 'title', 'childProfileIds', 'pages', 'status'];

  if (storyModelIndex >= 0) {
    const models = [...next.specification.recommendedDataModels];
    const model = models[storyModelIndex];
    if (model) {
      models[storyModelIndex] = {
        ...model,
        fields: fieldListWith(model.fields, ['childProfileIds']),
        purpose:
          model.purpose ||
          'Stories can be associated with one or more child profiles.',
      };
      next = {
        ...next,
        specification: {
          ...next.specification,
          recommendedDataModels: models,
        },
      };
    }
  } else {
    next = {
      ...next,
      specification: {
        ...next.specification,
        recommendedDataModels: [
          ...next.specification.recommendedDataModels,
          {
            name: 'Story',
            fields: storyFields,
            purpose: 'Generated stories connected to one or more child profiles.',
          } satisfies ArchitectDataModelSpec,
        ],
      },
    };
  }

  if (!next.specification.recommendedDataModels.some((model) => /child/i.test(model.name))) {
    next = {
      ...next,
      specification: {
        ...next.specification,
        recommendedDataModels: [
          ...next.specification.recommendedDataModels,
          {
            name: 'ChildProfile',
            fields: ['id', 'name', 'age', 'interests', 'avatarUrl'],
            purpose: 'Profiles for children that can be attached to stories.',
          },
        ],
      },
    };
  }

  return {
    ...next,
    updatedAt: now.toISOString(),
  };
}

function ensureModel(
  models: BlueprintDataModel[],
  name: string,
  fields: string[],
  description: string
): { models: BlueprintDataModel[]; added: boolean; changed: boolean } {
  const index = models.findIndex((model) => model.name.toLowerCase() === name.toLowerCase());
  if (index < 0) {
    return {
      models: [
        ...models,
        {
          id: `model-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name,
          fields,
          description,
        },
      ],
      added: true,
      changed: false,
    };
  }

  const model = models[index];
  if (!model) return { models, added: false, changed: false };
  const nextFields = fieldListWith(model.fields, fields);
  const changed =
    nextFields.length !== model.fields.length || !model.description?.trim();
  if (!changed) return { models, added: false, changed: false };

  const nextModels = [...models];
  nextModels[index] = {
    ...model,
    fields: nextFields,
    description: model.description || description,
  };
  return { models: nextModels, added: false, changed: true };
}

function ensureStoryMultipleChildrenBlueprint(
  draft: BlueprintDraft,
  now: Date
): { draft: BlueprintDraft; summary: BlueprintChangeSummary } {
  let models = draft.dataModels;
  const addedModels: string[] = [];
  const changedModels: string[] = [];

  const story = ensureModel(
    models,
    'Story',
    ['id', 'title', 'childProfileIds', 'pages', 'status'],
    'Stories can be personalized for one or more child profiles.'
  );
  models = story.models;
  if (story.added) addedModels.push('Story');
  if (story.changed) changedModels.push('Story');

  const child = ensureModel(
    models,
    'ChildProfile',
    ['id', 'name', 'age', 'interests', 'avatarUrl'],
    'Reusable child profiles that can be attached to generated stories.'
  );
  models = child.models;
  if (child.added) addedModels.push('ChildProfile');
  if (child.changed) changedModels.push('ChildProfile');

  const components = [...draft.components];
  const componentNames = new Set(components.map((item) => item.name.toLowerCase()));
  const componentAdditions = [
    ['Child profile selector', 'Select one or more children while creating a story.'],
    ['Multi-child story summary', 'Show which child profiles are attached to a story.'],
  ] as const;
  const componentsAdded: string[] = [];
  componentAdditions.forEach(([name, description]) => {
    if (!componentNames.has(name.toLowerCase())) {
      components.push(blueprintItem('component', name, description));
      componentsAdded.push(name);
    }
  });

  const description = appendSentence(
    draft.appDescription,
    'Stories must support multiple child profiles without rebuilding unrelated features.'
  );

  return {
    draft: {
      ...draft,
      appDescription: description,
      dataModels: models,
      components,
      updatedAt: now.toISOString(),
    },
    summary: {
      changed: addedModels.length > 0 || changedModels.length > 0 || componentsAdded.length > 0,
      routesAdded: [],
      routesRemoved: [],
      routesChanged: [],
      modelsAdded: unique(addedModels),
      modelsRemoved: [],
      modelsChanged: unique(changedModels),
      componentsAdded: unique(componentsAdded),
      componentsChanged: [],
      integrationsChanged: [],
      summary: 'Updated story planning so stories can reference multiple child profiles.',
    },
  };
}

function unchangedBlueprintSummary(): BlueprintChangeSummary {
  return {
    changed: false,
    routesAdded: [],
    routesRemoved: [],
    routesChanged: [],
    modelsAdded: [],
    modelsRemoved: [],
    modelsChanged: [],
    componentsAdded: [],
    componentsChanged: [],
    integrationsChanged: [],
    summary: 'No deterministic Blueprint changes were inferred.',
  };
}

function createContractDiff(
  before: BuildContract | null | undefined,
  after: BuildContract
): BuildContractChangeSummary {
  const empty: BuildContract = before ?? {
    ...after,
    routes: [],
    dataModels: [],
    apis: [],
    integrations: [],
    optionalCapabilities: [],
    requiredCapabilities: [],
    requirements: [],
  };
  const routes = itemDiff(empty.routes, after.routes, routeKey);
  const dataModels = itemDiff(
    empty.dataModels,
    after.dataModels,
    modelKey,
    (model) => JSON.stringify([...model.fields].sort())
  );
  const apis = itemDiff(empty.apis, after.apis, apiKey);
  const integrations = stringDiff(empty.integrations, after.integrations);
  const capabilities = stringDiff(
    [...empty.requiredCapabilities, ...empty.optionalCapabilities],
    [...after.requiredCapabilities, ...after.optionalCapabilities]
  );
  const requirements = itemDiff(
    empty.requirements,
    after.requirements,
    (requirement) => requirement.stableId,
    (requirement) => `${requirement.title}:${requirement.description}:${requirement.status}`
  );
  const authenticationChanged = empty.authentication !== after.authentication;
  const billingChanged =
    JSON.stringify(empty.billingRequirements) !== JSON.stringify(after.billingRequirements);
  const deploymentTargetChanged = empty.deploymentTarget !== after.deploymentTarget;
  const databaseChanged =
    JSON.stringify(empty.storageRequirements) !== JSON.stringify(after.storageRequirements);

  const changedCount =
    routes.added.length +
    routes.removed.length +
    routes.changed.length +
    dataModels.added.length +
    dataModels.removed.length +
    dataModels.changed.length +
    apis.added.length +
    apis.removed.length +
    apis.changed.length +
    integrations.added.length +
    integrations.removed.length +
    capabilities.added.length +
    capabilities.removed.length +
    requirements.added.length +
    requirements.removed.length +
    requirements.changed.length;

  return {
    routes,
    dataModels,
    apis,
    integrations,
    capabilities,
    requirements,
    authenticationChanged,
    billingChanged,
    deploymentTargetChanged,
    databaseChanged,
    summary:
      changedCount > 0 ||
      authenticationChanged ||
      billingChanged ||
      deploymentTargetChanged ||
      databaseChanged
        ? 'Build Contract changed for the requested update.'
        : 'Build Contract did not need structural changes.',
  };
}

function taskSummary(
  task: TaskGraphTask,
  reason: string
): ChangePlanTaskSummary {
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    reason,
  };
}

function reconcileTasks(
  existingGraph: TaskGraph | null | undefined,
  nextGraph: TaskGraph,
  changedRequirementIds: string[] = []
): {
  newTasks: ChangePlanTaskSummary[];
  invalidatedTasks: ChangePlanTaskSummary[];
  preservedTasks: ChangePlanTaskSummary[];
} {
  const existingById = new Map(existingGraph?.tasks.map((task) => [task.id, task]) ?? []);
  const nextById = new Map(nextGraph.tasks.map((task) => [task.id, task]));
  const changedRequirements = new Set(changedRequirementIds);

  const newTasks: ChangePlanTaskSummary[] = [];
  const invalidatedTasks: ChangePlanTaskSummary[] = [];
  const preservedTasks: ChangePlanTaskSummary[] = [];

  nextGraph.tasks.forEach((task) => {
    const existing = existingById.get(task.id);
    if (!existing) {
      newTasks.push(taskSummary(task, 'Task is required by the updated contract.'));
      return;
    }
    if (existing.fingerprint !== task.fingerprint) {
      invalidatedTasks.push(
        taskSummary(existing, 'Task inputs changed and must be re-run.')
      );
      return;
    }
    if (
      task.sourceRequirementIds.some((requirementId) =>
        changedRequirements.has(requirementId)
      )
    ) {
      invalidatedTasks.push(
        taskSummary(existing, 'Approved requirement details changed and must be re-validated.')
      );
      return;
    }
    preservedTasks.push(
      taskSummary(existing, 'Task fingerprint is unchanged and existing progress is preserved.')
    );
  });

  existingById.forEach((task, id) => {
    if (!nextById.has(id)) {
      invalidatedTasks.push(
        taskSummary(task, 'Task is no longer part of the updated contract.')
      );
    }
  });

  return { newTasks, invalidatedTasks, preservedTasks };
}

function routeToFile(route: string): string {
  const cleaned = route === '/' ? '' : route.replace(/^\/+/, '').replace(/\/+$/, '');
  return cleaned ? `src/app/${cleaned}/page.tsx` : 'src/app/page.tsx';
}

function modelTokens(modelName: string): string[] {
  const lower = modelName.toLowerCase();
  const dashed = lower.replace(/[^a-z0-9]+/g, '-');
  const compact = lower.replace(/[^a-z0-9]+/g, '');
  return unique([lower, dashed, compact]);
}

function affectedFilesForChange(
  repositoryModel: RepositoryModel | null | undefined,
  routes: string[],
  models: string[],
  apis: string[]
): { affectedFiles: string[]; protectedUserEditedFiles: string[] } {
  const direct = new Set<string>();
  routes.forEach((route) => direct.add(routeToFile(route)));
  apis.forEach((api) => direct.add(api.replace(/^\/api\//, 'src/app/api/') + '/route.ts'));

  const tokens = models.flatMap(modelTokens);
  const affected = new Set<string>(direct);

  repositoryModel?.files.forEach((file) => {
    const path = file.path.toLowerCase();
    if (direct.has(file.path)) {
      affected.add(file.path);
      return;
    }
    if (
      tokens.some((token) => path.includes(token)) &&
      /^(src\/(lib|types|components|app)|supabase\/migrations|tests)\//.test(path)
    ) {
      affected.add(file.path);
    }
  });

  const protectedUserEditedFiles =
    repositoryModel?.files
      .filter((file) => file.userEdited && affected.has(file.path))
      .map((file) => file.path) ?? [];

  return {
    affectedFiles: unique(Array.from(affected)),
    protectedUserEditedFiles: unique(protectedUserEditedFiles),
  };
}

function inferAffectedCapabilities(intent: ChangeIntent, contractDiff: BuildContractChangeSummary): string[] {
  const capabilities = [...contractDiff.capabilities.added, ...contractDiff.capabilities.changed];
  if (/story|child/i.test(intent.summary)) {
    capabilities.push('child-profile-management', 'story-crud', 'story-creation-flow');
  }
  if (contractDiff.dataModels.added.length || contractDiff.dataModels.changed.length) {
    capabilities.push('data-models');
  }
  if (contractDiff.routes.added.length || contractDiff.routes.changed.length) {
    capabilities.push('app-routes');
  }
  if (/subscription|billing/i.test(intent.summary) || contractDiff.billingChanged) {
    capabilities.push('billing', 'subscriptions');
  }
  return unique(capabilities);
}

function affectedSystemsForChange(
  intent: ChangeIntent,
  contractDiff: BuildContractChangeSummary
): string[] {
  const systems: string[] = [];
  if (contractDiff.routes.added.length || contractDiff.routes.changed.length) {
    systems.push('App Router and navigation');
  }
  if (
    contractDiff.dataModels.added.length ||
    contractDiff.dataModels.changed.length
  ) {
    systems.push('Data model and persistence');
  }
  if (contractDiff.apis.added.length || contractDiff.apis.changed.length) {
    systems.push('Server APIs');
  }
  if (contractDiff.authenticationChanged) systems.push('Authentication');
  if (contractDiff.billingChanged || /subscription|billing/i.test(intent.summary)) {
    systems.push('Subscription billing');
  }
  if (contractDiff.integrations.added.length) {
    systems.push('Third-party integrations');
  }
  if (contractDiff.deploymentTargetChanged) systems.push('Deployment');
  return unique(systems);
}

function requiredChangesForPlan(
  blueprintChanges: BlueprintChangeSummary,
  contractDiff: BuildContractChangeSummary
): string[] {
  const changes: string[] = [];
  if (blueprintChanges.routesAdded.length) {
    changes.push(`Create routes: ${blueprintChanges.routesAdded.join(', ')}.`);
  }
  if (blueprintChanges.modelsAdded.length || blueprintChanges.modelsChanged.length) {
    changes.push(
      `Update data models: ${[
        ...blueprintChanges.modelsAdded,
        ...blueprintChanges.modelsChanged,
      ].join(', ')}.`
    );
  }
  if (blueprintChanges.componentsAdded.length) {
    changes.push(
      `Add UI workflows: ${blueprintChanges.componentsAdded.join(', ')}.`
    );
  }
  if (contractDiff.apis.added.length) {
    changes.push(`Add server APIs: ${contractDiff.apis.added.join(', ')}.`);
  }
  if (contractDiff.billingChanged) {
    changes.push(
      'Add server-only billing configuration, subscription lifecycle handling, and provider reconciliation.'
    );
  }
  return unique(changes);
}

function monthlyServiceEstimates(
  intent: ChangeIntent,
  contractDiff: BuildContractChangeSummary
): ChangeServiceCostEstimate[] {
  if (!contractDiff.billingChanged && !/subscription|billing/i.test(intent.summary)) {
    return [];
  }
  return [
    {
      category: 'billing',
      service: 'Payment and subscription provider',
      estimatedMonthlyCostBand: 'usage-based',
      freeTierAvailable: 'unknown',
      assumptions: [
        'Estimate only; provider charges generally vary with transaction volume and selected billing features.',
        'Existing hosting, database, email, and tax-compliance costs are not included.',
        'The provider choice can be changed before approval.',
      ],
    },
  ];
}

function risksForChange(
  userRequest: string,
  contractDiff: BuildContractChangeSummary,
  protectedUserEditedFiles: string[]
): ChangePlanRisk[] {
  const text = normalizeText(userRequest);
  const risks: ChangePlanRisk[] = [];

  if (contractDiff.authenticationChanged || /auth|clerk|firebase|supabase auth/.test(text)) {
    risks.push({
      kind: 'auth-provider-change',
      severity: 'requires-approval',
      message: 'Authentication provider or auth behavior may change.',
      affectedRefs: ['authentication'],
    });
  }
  if (contractDiff.databaseChanged || /database|supabase|postgres|firebase|schema/.test(text)) {
    risks.push({
      kind: 'database-provider-change',
      severity: 'requires-approval',
      message: 'Database or storage provider assumptions may change.',
      affectedRefs: ['storageRequirements'],
    });
  }
  if (contractDiff.billingChanged || /stripe|billing|subscription|payment/.test(text)) {
    risks.push({
      kind: 'billing-provider-change',
      severity: 'requires-approval',
      message: 'Billing requirements may change.',
      affectedRefs: ['billingRequirements'],
    });
  }
  if (contractDiff.deploymentTargetChanged || /deploy|vercel|netlify|android/.test(text)) {
    risks.push({
      kind: 'deployment-target-change',
      severity: 'requires-approval',
      message: 'Deployment target may change.',
      affectedRefs: ['deploymentTarget'],
    });
  }
  if (contractDiff.routes.removed.length) {
    risks.push({
      kind: 'route-deletion',
      severity: 'requires-approval',
      message: 'The change would remove approved routes.',
      affectedRefs: contractDiff.routes.removed,
    });
  }
  if (contractDiff.dataModels.removed.length) {
    risks.push({
      kind: 'model-deletion',
      severity: 'requires-approval',
      message: 'The change would remove approved data models.',
      affectedRefs: contractDiff.dataModels.removed,
    });
  }
  if (/\b(remove|delete|drop|get rid of)\b/.test(text)) {
    risks.push({
      kind: 'feature-deletion',
      severity: 'requires-approval',
      message: 'The request includes deletion language and needs explicit approval.',
      affectedRefs: [],
    });
  }
  if (contractDiff.dataModels.added.length || contractDiff.dataModels.changed.length) {
    risks.push({
      kind: 'migration-required',
      severity: 'warning',
      message: 'Data model changes may require a migration or local data backfill.',
      affectedRefs: [
        ...contractDiff.dataModels.added,
        ...contractDiff.dataModels.changed,
      ],
    });
  }
  if (protectedUserEditedFiles.length) {
    risks.push({
      kind: 'user-edited-file',
      severity: 'requires-approval',
      message: 'Some affected files were edited by the user and need protected handling.',
      affectedRefs: protectedUserEditedFiles,
    });
  }

  return risks;
}

function approvalForRisks(
  risks: ChangePlanRisk[],
  source: ChangeRequestSource
): ChangePlanApprovalRequirement {
  const approvalRisks = risks.filter((risk) => risk.severity === 'requires-approval');
  const conversationReason =
    source === 'conversation'
      ? ['Conversational project changes require approval before engineering begins.']
      : [];
  return {
    required: approvalRisks.length > 0 || conversationReason.length > 0,
    reasons: unique([
      ...conversationReason,
      ...approvalRisks.map((risk) => risk.message),
    ]),
    riskKinds: unique(approvalRisks.map((risk) => risk.kind)) as ChangePlanApprovalRequirement['riskKinds'],
  };
}

function estimateEffort(
  newTasks: ChangePlanTaskSummary[],
  invalidatedTasks: ChangePlanTaskSummary[],
  affectedFiles: string[]
): ChangeEffortEstimate {
  const score = newTasks.length + invalidatedTasks.length + Math.ceil(affectedFiles.length / 3);
  if (score <= 3) return 'small';
  if (score <= 8) return 'medium';
  if (score <= 15) return 'large';
  return 'platform';
}

function migrationImplications(contractDiff: BuildContractChangeSummary): string[] {
  const implications: string[] = [];
  if (contractDiff.dataModels.added.length) {
    implications.push(
      `Additive data model changes: ${contractDiff.dataModels.added.join(', ')}.`
    );
  }
  if (contractDiff.dataModels.changed.length) {
    implications.push(
      `Existing data models need non-destructive updates: ${contractDiff.dataModels.changed.join(', ')}.`
    );
  }
  if (contractDiff.dataModels.removed.length) {
    implications.push(
      `Destructive data model removal needs explicit migration approval: ${contractDiff.dataModels.removed.join(', ')}.`
    );
  }
  return implications;
}

function applyKnownChange(
  intent: ChangeIntent,
  architectDraft: ArchitectDraft,
  blueprintDraft: BlueprintDraft,
  now: Date
): {
  architectDraft: ArchitectDraft;
  architectChanges: BuildChangePlan['architectChanges'];
  blueprintDraft: BlueprintDraft;
  blueprintChanges: BlueprintChangeSummary;
} {
  if (/multiple child|child profiles|children/i.test(intent.summary)) {
    const proposedArchitect = ensureStoryMultipleChildrenArchitect(architectDraft, now);
    const blueprint = ensureStoryMultipleChildrenBlueprint(blueprintDraft, now);
    return {
      architectDraft: proposedArchitect,
      architectChanges: {
        changed: true,
        fields: ['answers.customRequirements', 'specification.recommendedDataModels'],
        summary: 'Recorded the multi-child story requirement in Architect planning data.',
      },
      blueprintDraft: blueprint.draft,
      blueprintChanges: blueprint.summary,
    };
  }
  if (/subscription plans|subscription billing|account billing/i.test(intent.summary)) {
    const proposedArchitect = ensureSubscriptionsArchitect(architectDraft, now);
    const blueprint = ensureSubscriptionsBlueprint(blueprintDraft, now);
    return {
      architectDraft: proposedArchitect,
      architectChanges: {
        changed: true,
        fields: [
          'answers.payments',
          'answers.integrations',
          'answers.customRequirements',
          'specification',
        ],
        summary:
          'Recorded recurring subscriptions and server-side billing in Architect planning data.',
      },
      blueprintDraft: blueprint.draft,
      blueprintChanges: blueprint.summary,
    };
  }

  return {
    architectDraft,
    architectChanges: {
      changed: false,
      fields: [],
      summary: 'No deterministic Architect field changes were inferred.',
    },
    blueprintDraft,
    blueprintChanges: unchangedBlueprintSummary(),
  };
}

export function createBuildChangePlan(options: CreateChangePlanOptions): BuildChangePlan {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const intent = interpretChangeRequest(options.userRequest);
  const source = options.source ?? 'conversation';
  const baseArchitect =
    options.architectDraft ??
    createArchitectDraft({
      projectId: options.projectId,
      projectName: options.buildContract?.project.projectName,
      sourceBuildManifest: options.buildManifest ?? undefined,
      now,
    });
  const baseBlueprint =
    options.blueprintDraft ?? createBlueprintDraftFromManifest(options.buildManifest, now);
  const applied = applyKnownChange(intent, cloneJson(baseArchitect), cloneJson(baseBlueprint), now);

  const proposedBuildContract = createBuildContract({
    projectId: options.projectId ?? options.buildContract?.project.projectId,
    projectName:
      applied.blueprintDraft.projectName ||
      applied.architectDraft.projectName ||
      options.buildContract?.project.projectName,
    workspaceId: options.buildContract?.project.workspaceId,
    architectDraft: applied.architectDraft,
    buildManifest: options.buildManifest ?? applied.architectDraft.sourceBuildManifest,
    blueprintDraft: applied.blueprintDraft,
    existingContract: options.buildContract ?? null,
    now,
  });
  const contractChanges = createContractDiff(options.buildContract, proposedBuildContract);
  const proposedCapabilityResolution = resolveCapabilities(proposedBuildContract, {
    budgetMode: applied.architectDraft.answers.investmentLevel,
    now,
  });
  const proposedTaskGraph = createTaskGraph({
    contract: proposedBuildContract,
    capabilityResolution: proposedCapabilityResolution,
    existingGraph: options.taskGraph ?? null,
    now,
  });
  const reconciled = reconcileTasks(
    options.taskGraph,
    proposedTaskGraph,
    contractChanges.requirements.changed
  );

  const affectedRoutes = unique([
    ...contractChanges.routes.added,
    ...contractChanges.routes.changed,
  ]);
  const affectedModels = unique([
    ...contractChanges.dataModels.added,
    ...contractChanges.dataModels.changed,
  ]);
  const affectedApis = unique([
    ...contractChanges.apis.added,
    ...contractChanges.apis.changed,
  ]);
  const fileImpact = affectedFilesForChange(
    options.repositoryModel,
    affectedRoutes,
    affectedModels,
    affectedApis
  );
  const affectedCapabilities = inferAffectedCapabilities(intent, contractChanges);
  const affectedSystems = affectedSystemsForChange(intent, contractChanges);
  const requiredChanges = requiredChangesForPlan(
    applied.blueprintChanges,
    contractChanges
  );
  const estimatedMonthlyServices = monthlyServiceEstimates(
    intent,
    contractChanges
  );
  const risks = risksForChange(
    options.userRequest,
    contractChanges,
    fileImpact.protectedUserEditedFiles
  );
  const explicitApprovalRequirement = approvalForRisks(risks, source);
  const status: BuildChangePlanStatus = explicitApprovalRequirement.required
    ? 'approval-required'
    : 'draft';

  return {
    schemaVersion: CHANGE_PLAN_SCHEMA_VERSION,
    metadataVersion: CHANGE_PLAN_METADATA_VERSION,
    id: createId('change-plan', now),
    projectId: options.projectId,
    userRequest: options.userRequest,
    source,
    interpretedIntent: intent,
    architectChanges: applied.architectChanges,
    blueprintChanges: applied.blueprintChanges,
    contractChanges,
    affectedCapabilities,
    affectedRoutes,
    affectedModels,
    affectedApis,
    affectedFiles: fileImpact.affectedFiles,
    affectedSystems,
    requiredChanges,
    estimatedMonthlyServices,
    protectedUserEditedFiles: fileImpact.protectedUserEditedFiles,
    newTasks: reconciled.newTasks,
    invalidatedTasks: reconciled.invalidatedTasks,
    preservedTasks: reconciled.preservedTasks,
    risks,
    migrationImplications: migrationImplications(contractChanges),
    estimatedEffort: estimateEffort(
      reconciled.newTasks,
      reconciled.invalidatedTasks,
      fileImpact.affectedFiles
    ),
    explicitApprovalRequirement,
    status,
    sourceVersions: {
      architectDraftId: options.architectDraft?.id,
      architectDraftUpdatedAt: options.architectDraft?.updatedAt,
      buildManifestUpdatedAt: options.buildManifest?.createdAt,
      blueprintDraftId: options.blueprintDraft?.id,
      blueprintDraftUpdatedAt: options.blueprintDraft?.updatedAt,
      buildContractId: options.buildContract?.id,
      buildContractVersion: options.buildContract?.contractVersion,
      buildContractUpdatedAt: options.buildContract?.updatedAt,
      taskGraphId: options.taskGraph?.id,
      taskGraphUpdatedAt: options.taskGraph?.updatedAt,
      repositoryFingerprint: options.repositoryModel?.repositoryFingerprint,
    },
    proposedArchitectDraft: applied.architectDraft,
    proposedBlueprintDraft: applied.blueprintDraft,
    proposedBuildContract,
    proposedCapabilityResolution,
    proposedTaskGraph,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function approveBuildChangePlan(
  plan: BuildChangePlan,
  now = new Date()
): BuildChangePlan {
  return {
    ...plan,
    status: 'approved',
    updatedAt: now.toISOString(),
  };
}

export function markBuildChangePlanStatus(
  plan: BuildChangePlan,
  status: BuildChangePlanStatus,
  now = new Date()
): BuildChangePlan {
  return {
    ...plan,
    status,
    updatedAt: now.toISOString(),
  };
}

export function formatBuildChangePlanSummary(plan: BuildChangePlan): string {
  const systems = plan.affectedSystems.length
    ? plan.affectedSystems.join(', ')
    : 'No implementation systems inferred yet';
  const changes = plan.requiredChanges.length
    ? plan.requiredChanges.map((change) => `- ${change}`).join('\n')
    : '- Matrix needs a more specific change request before engineering.';
  const taskCount = plan.newTasks.length + plan.invalidatedTasks.length;
  const costs = plan.estimatedMonthlyServices.length
    ? plan.estimatedMonthlyServices
        .map(
          (estimate) =>
            `- ${estimate.service}: ${estimate.estimatedMonthlyCostBand.replace(/-/g, ' ')} estimate${estimate.freeTierAvailable === true ? '; free-tier path available' : ''}.`
        )
        .join('\n')
    : '- No new monthly service cost was identified.';
  const risks = plan.risks.length
    ? plan.risks.map((risk) => `- ${risk.message}`).join('\n')
    : '- No material architecture risks identified.';

  return [
    '**Proposed project change**',
    '',
    plan.interpretedIntent.summary,
    '',
    `**Affected systems:** ${systems}`,
    `**Estimated effort:** ${plan.estimatedEffort}`,
    `**Engineering tasks affected:** ${taskCount}`,
    '',
    '**Required changes**',
    changes,
    '',
    '**Estimated monthly services**',
    costs,
    '',
    '**Risks and assumptions**',
    risks,
    '',
    '**Approval required**',
    'Reply `Approve change` to apply this plan and run only its affected engineering tasks, or `Cancel change` to discard it.',
  ].join('\n');
}

export function applyApprovedBuildChangePlan(
  options: ApplyApprovedChangePlanOptions
): AppliedBuildChange {
  const now = options.now ?? new Date();
  const {
    proposedArchitectDraft,
    proposedBlueprintDraft,
    proposedBuildContract,
    proposedCapabilityResolution,
    proposedTaskGraph,
  } = options.plan;
  if (
    !proposedArchitectDraft ||
    !proposedBlueprintDraft ||
    !proposedBuildContract ||
    !proposedCapabilityResolution ||
    !proposedTaskGraph
  ) {
    throw new Error(
      'The approved change plan is incomplete and cannot be applied safely.'
    );
  }
  if (!['approval-required', 'approved'].includes(options.plan.status)) {
    throw new Error(
      `Change plan ${options.plan.id} cannot be applied from status ${options.plan.status}.`
    );
  }

  const approved = markBuildChangePlanStatus(
    approveBuildChangePlan(options.plan, now),
    'ready-to-execute',
    now
  );
  let intelligenceCore = createIntelligenceCore({
    projectId: options.projectId,
    projectName: proposedBlueprintDraft.projectName,
    architectDraft: proposedArchitectDraft,
    buildManifest: options.buildManifest ?? null,
    blueprintDraft: proposedBlueprintDraft,
    buildContract: proposedBuildContract,
    capabilityResolution: proposedCapabilityResolution,
    taskGraph: proposedTaskGraph,
    repositoryModel: options.repositoryModel ?? null,
    engineeringMemory: options.engineeringMemory ?? null,
    existingCore: options.intelligenceCore ?? null,
    now,
  });
  intelligenceCore = addIntelligenceRecord(intelligenceCore, {
    domain: 'conversation',
    category: 'decision',
    key: `approved-change:${approved.id}`,
    value: {
      request: approved.userRequest,
      intent: approved.interpretedIntent.summary,
      affectedSystems: approved.affectedSystems,
      affectedCapabilities: approved.affectedCapabilities,
      requiredChanges: approved.requiredChanges,
      estimatedEffort: approved.estimatedEffort,
      approvedAt: now.toISOString(),
    },
    source: {
      kind: 'user-approved',
      id: approved.id,
      updatedAt: now.toISOString(),
    },
    confidence: approved.interpretedIntent.confidence,
    status: 'approved',
    userApproved: true,
    validationStrategy: 'user-approval',
    evidenceReferences: [
      {
        kind: 'note',
        ref: approved.id,
        description: 'Explicitly approved conversational project change.',
      },
    ],
    now,
  });

  return {
    plan: approved,
    architectDraft: proposedArchitectDraft,
    blueprintDraft: proposedBlueprintDraft,
    buildContract: proposedBuildContract,
    capabilityResolution: proposedCapabilityResolution,
    taskGraph: proposedTaskGraph,
    intelligenceCore,
  };
}

export function cancelBuildChangePlan(
  plan: BuildChangePlan,
  reason: string,
  now = new Date()
): BuildChangePlan {
  const cancellationRisk: ChangePlanRisk = {
    kind: 'broad-regeneration-risk',
    severity: 'info',
    message: `Change plan cancelled: ${reason}`,
    affectedRefs: [],
  };
  return {
    ...plan,
    status: 'cancelled',
    risks: [...plan.risks, cancellationRisk],
    updatedAt: now.toISOString(),
  };
}

export function isChangePlanStale(
  plan: BuildChangePlan,
  options: {
    architectDraft?: ArchitectDraft | null;
    blueprintDraft?: BlueprintDraft | null;
    buildContract?: BuildContract | null;
    taskGraph?: TaskGraph | null;
    repositoryModel?: RepositoryModel | null;
  }
): boolean {
  const architectChanged =
    options.architectDraft?.updatedAt &&
    plan.sourceVersions.architectDraftUpdatedAt &&
    Date.parse(options.architectDraft.updatedAt) >
      Date.parse(plan.sourceVersions.architectDraftUpdatedAt);
  const blueprintChanged =
    options.blueprintDraft?.updatedAt &&
    plan.sourceVersions.blueprintDraftUpdatedAt &&
    Date.parse(options.blueprintDraft.updatedAt) >
      Date.parse(plan.sourceVersions.blueprintDraftUpdatedAt);
  const contractChanged =
    options.buildContract &&
    ((plan.sourceVersions.buildContractId &&
      options.buildContract.id !== plan.sourceVersions.buildContractId) ||
      (plan.sourceVersions.buildContractVersion !== undefined &&
        options.buildContract.contractVersion !==
          plan.sourceVersions.buildContractVersion) ||
      (plan.sourceVersions.buildContractUpdatedAt &&
        Date.parse(options.buildContract.updatedAt) >
          Date.parse(plan.sourceVersions.buildContractUpdatedAt)));
  const taskGraphChanged =
    options.taskGraph &&
    ((plan.sourceVersions.taskGraphId &&
      options.taskGraph.id !== plan.sourceVersions.taskGraphId) ||
      (plan.sourceVersions.taskGraphUpdatedAt &&
        Date.parse(options.taskGraph.updatedAt) >
          Date.parse(plan.sourceVersions.taskGraphUpdatedAt)));
  const repositoryChanged =
    options.repositoryModel?.repositoryFingerprint &&
    plan.sourceVersions.repositoryFingerprint &&
    options.repositoryModel.repositoryFingerprint !==
      plan.sourceVersions.repositoryFingerprint;
  return Boolean(
    architectChanged ||
      blueprintChanged ||
      contractChanged ||
      taskGraphChanged ||
      repositoryChanged
  );
}
