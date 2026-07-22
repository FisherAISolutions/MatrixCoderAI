import { addIntelligenceRecord, type MatrixIntelligenceCore } from '@/lib/intelligence-core';
import {
  addBlueprintDataModel,
  addBlueprintListItem,
  addBlueprintRoute,
  removeBlueprintDataModel,
  removeBlueprintRoute,
  touchBlueprintDraft,
  type BlueprintDataModel,
  type BlueprintDraft,
  type BlueprintDraftItem,
  type BlueprintDraftListKey,
} from './blueprintDraft';
import { analyzeBlueprintChangeImpact, type BlueprintChangeImpact } from './impactAnalysis';

export const BLUEPRINT_CHANGE_ENVELOPE_SCHEMA_VERSION = 1;

export interface BlueprintChangeEnvelope {
  schemaVersion: typeof BLUEPRINT_CHANGE_ENVELOPE_SCHEMA_VERSION;
  projectId?: string;
  draftId: string;
  streamVersion?: number;
  naturalLanguageResponse: string;
  proposedBlueprintPatch?: {
    projectName?: string;
    appDescription?: string;
    deploymentTarget?: string;
    addRoutes?: Array<{ path: string; name?: string; description?: string }>;
    removeRoutePaths?: string[];
    addDataModels?: Array<{ name: string; fields?: string[]; description?: string }>;
    removeDataModelNames?: string[];
    addComponents?: BlueprintDraftItem[];
    addIntegrations?: BlueprintDraftItem[];
    addUserRoles?: BlueprintDraftItem[];
    addNavigation?: BlueprintDraftItem[];
    addFolderStructure?: BlueprintDraftItem[];
  };
  proposedProjectBrainUpdates?: Record<string, unknown>;
  proposedProductBrainUpdates?: Record<string, unknown>;
  proposedUserBrainUpdates?: Record<string, unknown>;
  proposedConversationBrainRecords?: Array<{
    key: string;
    value: unknown;
    confidence?: number;
  }>;
  proposedWorkingBrainUpdate?: Record<string, unknown>;
  proposedBuildContractImpact?: string[];
  proposedCapabilityImpact?: string[];
  affectedRoutes?: string[];
  affectedModels?: string[];
  affectedRoles?: string[];
  affectedApis?: string[];
  affectedIntegrations?: string[];
  affectedEnvironmentVariables?: string[];
  budgetImpact?: string;
  complexityImpact?: string;
  securityImpact?: string;
  migrationImpact?: string;
  assumptions?: string[];
  unresolvedQuestions?: string[];
  confidence: number;
  requiresConfirmation: boolean;
  confirmationReason?: string;
  safetyWarnings?: string[];
}

export interface BlueprintChangeEnvelopeValidation {
  ok: boolean;
  value?: BlueprintChangeEnvelope;
  errors: string[];
}

export interface BlueprintChangeEnvelopeApplyResult {
  applied: boolean;
  draft: BlueprintDraft;
  core: MatrixIntelligenceCore;
  impact: BlueprintChangeImpact;
  errors: string[];
  skippedReason?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function safeItems(value: unknown): BlueprintDraftItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): BlueprintDraftItem | null => {
      if (!isObject(item) || typeof item.name !== 'string') return null;
      return {
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id
            : `item-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: item.name,
        description:
          typeof item.description === 'string' ? item.description : undefined,
      };
    })
    .filter((item): item is BlueprintDraftItem => Boolean(item));
}

export function validateBlueprintChangeEnvelope(
  value: unknown
): BlueprintChangeEnvelopeValidation {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { ok: false, errors: ['Envelope must be an object.'] };
  }
  if (value.schemaVersion !== BLUEPRINT_CHANGE_ENVELOPE_SCHEMA_VERSION) {
    errors.push('Unsupported Blueprint change envelope schema version.');
  }
  if (typeof value.draftId !== 'string' || !value.draftId.trim()) {
    errors.push('Envelope must include a draftId.');
  }
  if (
    typeof value.naturalLanguageResponse !== 'string' ||
    !value.naturalLanguageResponse.trim()
  ) {
    errors.push('Envelope must include a naturalLanguageResponse.');
  }
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)) {
    errors.push('Envelope must include a numeric confidence.');
  }
  if (typeof value.requiresConfirmation !== 'boolean') {
    errors.push('Envelope must include requiresConfirmation.');
  }
  if (errors.length) return { ok: false, errors };

  const patch = isObject(value.proposedBlueprintPatch)
    ? value.proposedBlueprintPatch
    : undefined;
  const draftId = value.draftId as string;
  const naturalLanguageResponse = value.naturalLanguageResponse as string;
  const confidence = value.confidence as number;
  const requiresConfirmation = value.requiresConfirmation as boolean;

  return {
    ok: true,
    errors: [],
    value: {
      schemaVersion: BLUEPRINT_CHANGE_ENVELOPE_SCHEMA_VERSION,
      projectId: typeof value.projectId === 'string' ? value.projectId : undefined,
      draftId,
      streamVersion:
        typeof value.streamVersion === 'number' &&
        Number.isFinite(value.streamVersion)
          ? value.streamVersion
          : undefined,
      naturalLanguageResponse,
      proposedBlueprintPatch: patch
        ? {
            projectName:
              typeof patch.projectName === 'string'
                ? patch.projectName
                : undefined,
            appDescription:
              typeof patch.appDescription === 'string'
                ? patch.appDescription
                : undefined,
            deploymentTarget:
              typeof patch.deploymentTarget === 'string'
                ? patch.deploymentTarget
                : undefined,
            addRoutes: Array.isArray(patch.addRoutes)
              ? patch.addRoutes.filter(
                  (route): route is {
                    path: string;
                    name?: string;
                    description?: string;
                  } => isObject(route) && typeof route.path === 'string'
                )
              : undefined,
            removeRoutePaths: stringArray(patch.removeRoutePaths),
            addDataModels: Array.isArray(patch.addDataModels)
              ? patch.addDataModels.filter(
                  (model): model is {
                    name: string;
                    fields?: string[];
                    description?: string;
                  } => isObject(model) && typeof model.name === 'string'
                )
              : undefined,
            removeDataModelNames: stringArray(patch.removeDataModelNames),
            addComponents: safeItems(patch.addComponents),
            addIntegrations: safeItems(patch.addIntegrations),
            addUserRoles: safeItems(patch.addUserRoles),
            addNavigation: safeItems(patch.addNavigation),
            addFolderStructure: safeItems(patch.addFolderStructure),
          }
        : undefined,
      proposedProjectBrainUpdates: isObject(value.proposedProjectBrainUpdates)
        ? value.proposedProjectBrainUpdates
        : undefined,
      proposedProductBrainUpdates: isObject(value.proposedProductBrainUpdates)
        ? value.proposedProductBrainUpdates
        : undefined,
      proposedUserBrainUpdates: isObject(value.proposedUserBrainUpdates)
        ? value.proposedUserBrainUpdates
        : undefined,
      proposedConversationBrainRecords: Array.isArray(
        value.proposedConversationBrainRecords
      )
        ? value.proposedConversationBrainRecords.filter(
            (record): record is {
              key: string;
              value: unknown;
              confidence?: number;
            } => isObject(record) && typeof record.key === 'string'
          )
        : undefined,
      proposedWorkingBrainUpdate: isObject(value.proposedWorkingBrainUpdate)
        ? value.proposedWorkingBrainUpdate
        : undefined,
      proposedBuildContractImpact: stringArray(value.proposedBuildContractImpact),
      proposedCapabilityImpact: stringArray(value.proposedCapabilityImpact),
      affectedRoutes: stringArray(value.affectedRoutes),
      affectedModels: stringArray(value.affectedModels),
      affectedRoles: stringArray(value.affectedRoles),
      affectedApis: stringArray(value.affectedApis),
      affectedIntegrations: stringArray(value.affectedIntegrations),
      affectedEnvironmentVariables: stringArray(value.affectedEnvironmentVariables),
      budgetImpact:
        typeof value.budgetImpact === 'string' ? value.budgetImpact : undefined,
      complexityImpact:
        typeof value.complexityImpact === 'string'
          ? value.complexityImpact
          : undefined,
      securityImpact:
        typeof value.securityImpact === 'string' ? value.securityImpact : undefined,
      migrationImpact:
        typeof value.migrationImpact === 'string'
          ? value.migrationImpact
          : undefined,
      assumptions: stringArray(value.assumptions),
      unresolvedQuestions: stringArray(value.unresolvedQuestions),
      confidence: Math.max(0, Math.min(1, confidence)),
      requiresConfirmation,
      confirmationReason:
        typeof value.confirmationReason === 'string'
          ? value.confirmationReason
          : undefined,
      safetyWarnings: stringArray(value.safetyWarnings),
    },
  };
}

function addListItems(
  draft: BlueprintDraft,
  key: BlueprintDraftListKey,
  items: BlueprintDraftItem[] | undefined,
  now: Date
): BlueprintDraft {
  return (items ?? []).reduce((nextDraft, item) => {
    const withItem = addBlueprintListItem(nextDraft, key, item.name, now);
    const last = withItem[key][withItem[key].length - 1];
    return {
      ...withItem,
      [key]: withItem[key].map((candidate) =>
        candidate.id === last.id
          ? { ...candidate, description: item.description }
          : candidate
      ),
    };
  }, draft);
}

function removeByName<T extends { id: string; name: string }>(
  items: T[],
  names: string[] | undefined
): string[] {
  const nameSet = new Set((names ?? []).map((name) => name.toLowerCase()));
  return items
    .filter((item) => nameSet.has(item.name.toLowerCase()))
    .map((item) => item.id);
}

export function applyBlueprintChangeEnvelope(options: {
  draft: BlueprintDraft;
  core: MatrixIntelligenceCore;
  envelope: unknown;
  expectedProjectId?: string;
  expectedDraftId?: string;
  expectedStreamVersion?: number;
  now?: Date;
  allowConfirmedDestructiveChange?: boolean;
}): BlueprintChangeEnvelopeApplyResult {
  const validation = validateBlueprintChangeEnvelope(options.envelope);
  const now = options.now ?? new Date();
  if (!validation.ok || !validation.value) {
    return {
      applied: false,
      draft: options.draft,
      core: options.core,
      impact: analyzeBlueprintChangeImpact(options.draft, options.draft),
      errors: validation.errors,
      skippedReason: 'Malformed Blueprint change envelope.',
    };
  }

  const envelope = validation.value;
  if (
    options.expectedProjectId &&
    envelope.projectId &&
    envelope.projectId !== options.expectedProjectId
  ) {
    return {
      applied: false,
      draft: options.draft,
      core: options.core,
      impact: analyzeBlueprintChangeImpact(options.draft, options.draft),
      errors: ['Envelope belongs to a different project.'],
      skippedReason: 'Stale project envelope ignored.',
    };
  }
  if ((options.expectedDraftId ?? options.draft.id) !== envelope.draftId) {
    return {
      applied: false,
      draft: options.draft,
      core: options.core,
      impact: analyzeBlueprintChangeImpact(options.draft, options.draft),
      errors: ['Envelope belongs to a different Blueprint draft.'],
      skippedReason: 'Stale draft envelope ignored.',
    };
  }
  if (
    typeof options.expectedStreamVersion === 'number' &&
    typeof envelope.streamVersion === 'number' &&
    envelope.streamVersion < options.expectedStreamVersion
  ) {
    return {
      applied: false,
      draft: options.draft,
      core: options.core,
      impact: analyzeBlueprintChangeImpact(options.draft, options.draft),
      errors: ['Envelope stream version is stale.'],
      skippedReason: 'Stale stream envelope ignored.',
    };
  }

  const patch = envelope.proposedBlueprintPatch;
  let nextDraft = options.draft;
  if (patch) {
    nextDraft = touchBlueprintDraft(
      {
        ...nextDraft,
        ...(patch.projectName ? { projectName: patch.projectName } : {}),
        ...(patch.appDescription
          ? { appDescription: patch.appDescription }
          : {}),
        ...(patch.deploymentTarget
          ? { deploymentTarget: patch.deploymentTarget }
          : {}),
      },
      now
    );
    for (const route of patch.addRoutes ?? []) {
      nextDraft = addBlueprintRoute(nextDraft, route.path, now);
      const last = nextDraft.routes[nextDraft.routes.length - 1];
      nextDraft = {
        ...nextDraft,
        routes: nextDraft.routes.map((candidate) =>
          candidate.id === last.id
            ? {
                ...candidate,
                name: route.name ?? candidate.name,
                description: route.description,
              }
            : candidate
        ),
      };
    }
    for (const path of patch.removeRoutePaths ?? []) {
      const target = nextDraft.routes.find((route) => route.path === path);
      if (target) nextDraft = removeBlueprintRoute(nextDraft, target.id, now);
    }
    for (const model of patch.addDataModels ?? []) {
      nextDraft = addBlueprintDataModel(
        nextDraft,
        model.name,
        model.fields ?? [],
        now
      );
      const last = nextDraft.dataModels[nextDraft.dataModels.length - 1];
      nextDraft = {
        ...nextDraft,
        dataModels: nextDraft.dataModels.map((candidate: BlueprintDataModel) =>
          candidate.id === last.id
            ? { ...candidate, description: model.description }
            : candidate
        ),
      };
    }
    for (const id of removeByName(
      nextDraft.dataModels,
      patch.removeDataModelNames
    )) {
      nextDraft = removeBlueprintDataModel(nextDraft, id, now);
    }
    nextDraft = addListItems(nextDraft, 'components', patch.addComponents, now);
    nextDraft = addListItems(
      nextDraft,
      'integrations',
      patch.addIntegrations,
      now
    );
    nextDraft = addListItems(nextDraft, 'userRoles', patch.addUserRoles, now);
    nextDraft = addListItems(nextDraft, 'navigation', patch.addNavigation, now);
    nextDraft = addListItems(
      nextDraft,
      'folderStructure',
      patch.addFolderStructure,
      now
    );
  }

  const impact = analyzeBlueprintChangeImpact(options.draft, nextDraft);
  if (
    (envelope.requiresConfirmation || impact.requiresConfirmation) &&
    !options.allowConfirmedDestructiveChange
  ) {
    return {
      applied: false,
      draft: options.draft,
      core: options.core,
      impact,
      errors: [],
      skippedReason:
        envelope.confirmationReason ??
        impact.reasons[0] ??
        'Blueprint change requires explicit confirmation.',
    };
  }

  let nextCore = options.core;
  for (const record of envelope.proposedConversationBrainRecords ?? []) {
    nextCore = addIntelligenceRecord(nextCore, {
      domain: 'conversation',
      category: 'decision',
      key: record.key,
      value: JSON.parse(JSON.stringify(record.value ?? null)),
      source: {
        kind: 'conversation',
        id: envelope.draftId,
        updatedAt: now.toISOString(),
      },
      status: 'inferred',
      confidence:
        typeof record.confidence === 'number' ? record.confidence : envelope.confidence,
      validationStrategy: 'none',
      now,
    });
  }
  if (envelope.proposedWorkingBrainUpdate) {
    nextCore = addIntelligenceRecord(nextCore, {
      domain: 'working',
      category: 'summary',
      key: 'blueprint-working-update',
      value: JSON.parse(JSON.stringify(envelope.proposedWorkingBrainUpdate)),
      source: {
        kind: 'working',
        id: envelope.draftId,
        updatedAt: now.toISOString(),
      },
      status: 'inferred',
      confidence: envelope.confidence,
      validationStrategy: 'none',
      now,
    });
  }

  return {
    applied: true,
    draft: nextDraft,
    core: nextCore,
    impact,
    errors: [],
  };
}
