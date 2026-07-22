import {
  addIntelligenceRecord,
  createArchitectIntelligencePacket,
  createIntelligenceCore,
  type AddIntelligenceRecordInput,
  type IntelligenceArchitectContextPacket,
  type IntelligenceMemoryCategory,
  type IntelligenceMemoryRecord,
  type IntelligenceMemoryStatus,
  type IntelligenceSourceKind,
  type JsonValue,
  type MatrixIntelligenceCore,
} from '@/lib/intelligence-core';
import { inferSensitivityFromKeyValue } from '@/lib/intelligence-core/redaction';
import type { BuildContract } from '@/lib/build-contract';
import type {
  ArchitectAnswers,
  ArchitectConversationDecision,
  ArchitectConversationExtraction,
  ArchitectConversationState,
  ArchitectDraft,
} from './types';

export type ArchitectReadinessStatus =
  | 'discovering'
  | 'clarifying'
  | 'recommending'
  | 'summarizing'
  | 'ready-for-approval'
  | 'approved'
  | 'paused';

export interface ArchitectStructuredRecommendation {
  stableId: string;
  category: string;
  recommendation: string;
  reason: string;
  assumptions: string[];
  budgetImpact: 'none' | 'low' | 'medium' | 'high' | 'unknown';
  complexityImpact: 'low' | 'medium' | 'high';
  confidence: number;
  lowerCostAlternative?: string;
}

export interface ArchitectConversationResponseEnvelope {
  schemaVersion: 1;
  projectId: string;
  draftId: string;
  conversationId?: string;
  streamVersion?: number;
  naturalLanguageResponse: string;
  proposedProjectBrainUpdates: AddIntelligenceRecordInput[];
  proposedProductBrainUpdates: AddIntelligenceRecordInput[];
  proposedUserBrainUpdates: AddIntelligenceRecordInput[];
  proposedConversationBrainRecords: AddIntelligenceRecordInput[];
  proposedWorkingBrainUpdate?: AddIntelligenceRecordInput;
  architectDraftPatch: Partial<ArchitectAnswers>;
  acceptedRecommendations: ArchitectStructuredRecommendation[];
  rejectedRecommendations: ArchitectStructuredRecommendation[];
  unresolvedQuestions: string[];
  assumptions: string[];
  confidence: number;
  nextQuestion?: string;
  readinessStatus: ArchitectReadinessStatus;
  requiresUserApproval: boolean;
  safetyWarnings: string[];
}

export interface ArchitectEnvelopeApplyResult {
  core: MatrixIntelligenceCore;
  applied: boolean;
  skipped: boolean;
  warnings: string[];
  errors: string[];
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function stableSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isObject(value) && Object.values(value).every(isJsonValue);
}

function safeJson(value: unknown): JsonValue {
  return isJsonValue(value) ? value : String(value ?? '');
}

function isSecretLike(key: string, value: JsonValue): boolean {
  const sensitivity = inferSensitivityFromKeyValue(key, value);
  return sensitivity === 'secret' || sensitivity === 'raw-media';
}

function sourceKindForChange(
  before: ArchitectDraft,
  key: keyof ArchitectAnswers,
  userInput: string
): IntelligenceSourceKind {
  const previous = before.answers[key];
  const correction =
    /\b(actually|instead|change|correction|not anymore|no longer|use .* instead)\b/i.test(
      userInput
    ) ||
    (typeof previous === 'string'
      ? previous.trim().length > 0
      : Array.isArray(previous)
        ? previous.length > 0
        : typeof previous !== 'undefined');
  return correction ? 'user-correction' : 'conversation';
}

function record(
  domain: AddIntelligenceRecordInput['domain'],
  category: IntelligenceMemoryCategory,
  key: string,
  value: JsonValue,
  sourceKind: IntelligenceSourceKind,
  confidence: number,
  now: Date,
  status: IntelligenceMemoryStatus = sourceKind === 'user-correction'
    ? 'approved'
    : 'inferred'
): AddIntelligenceRecordInput {
  return {
    domain,
    category,
    key,
    value,
    source: { kind: sourceKind, updatedAt: nowIso(now) },
    confidence,
    status,
    userApproved: sourceKind === 'user-correction' || sourceKind === 'user-approved',
    validationStrategy: sourceKind === 'user-correction' ? 'user-approval' : 'none',
    now,
  };
}

function classifyAnswerKey(key: keyof ArchitectAnswers): {
  domain: AddIntelligenceRecordInput['domain'];
  category: IntelligenceMemoryCategory;
  memoryKey: string;
} {
  if (key === 'appIdea') {
    return { domain: 'project', category: 'goal', memoryKey: 'project-purpose' };
  }
  if (key === 'primaryUsers') {
    return { domain: 'project', category: 'goal', memoryKey: 'target-users' };
  }
  if (key === 'investmentLevel') {
    return {
      domain: 'project',
      category: 'constraint',
      memoryKey: 'investment-level',
    };
  }
  if (key === 'customRequirements') {
    return {
      domain: 'product',
      category: 'requirement',
      memoryKey: 'custom-requirements',
    };
  }
  if (['database', 'deploymentTarget'].includes(key)) {
    return { domain: 'product', category: 'architecture', memoryKey: key };
  }
  if (
    [
      'accountsRequired',
      'adminPanel',
      'payments',
      'notifications',
      'aiFeatures',
      'offlineSupport',
      'publicWebsite',
      'dashboard',
      'crm',
      'scheduling',
      'analytics',
      'auth',
      'integrations',
      'mobileSupport',
    ].includes(key)
  ) {
    return { domain: 'product', category: 'decision', memoryKey: key };
  }
  return { domain: 'conversation', category: 'decision', memoryKey: key };
}

function topicLabel(key: keyof ArchitectAnswers): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function recommendationDecisionRecord(
  item: ArchitectConversationDecision,
  now: Date
): AddIntelligenceRecordInput {
  return record(
    'conversation',
    'decision',
    `${item.decision}-recommendation-${item.recommendationId}`,
    {
      title: item.title,
      decision: item.decision,
      reason: item.reason ?? '',
    },
    'user-approved',
    0.92,
    now,
    item.decision === 'rejected' ? 'rejected' : 'approved'
  );
}

function structuredRecommendation(
  item: ArchitectConversationDecision
): ArchitectStructuredRecommendation {
  return {
    stableId: item.recommendationId,
    category: 'architect-recommendation',
    recommendation: item.title,
    reason: item.reason ?? 'User made an explicit Architect recommendation decision.',
    assumptions: [],
    budgetImpact: 'unknown',
    complexityImpact: 'medium',
    confidence: 0.9,
  };
}

export function createArchitectConversationResponseEnvelope(options: {
  beforeDraft: ArchitectDraft;
  afterDraft: ArchitectDraft;
  conversation: ArchitectConversationState;
  extraction: ArchitectConversationExtraction;
  userInput: string;
  naturalLanguageResponse: string;
  now?: Date;
}): ArchitectConversationResponseEnvelope {
  const now = options.now ?? new Date();
  const confidence = Math.max(0, Math.min(1, options.extraction.confidence / 100));
  const projectUpdates: AddIntelligenceRecordInput[] = [];
  const productUpdates: AddIntelligenceRecordInput[] = [];
  const userUpdates: AddIntelligenceRecordInput[] = [];
  const conversationRecords: AddIntelligenceRecordInput[] = [];
  const safetyWarnings: string[] = [];

  for (const [key, value] of Object.entries(
    options.extraction.updatedAnswers
  ) as [keyof ArchitectAnswers, ArchitectAnswers[keyof ArchitectAnswers]][]) {
    if (typeof value === 'undefined') continue;
    const jsonValue = safeJson(value);
    const classified = classifyAnswerKey(key);
    const sourceKind = sourceKindForChange(
      options.beforeDraft,
      key,
      options.userInput
    );
    if (isSecretLike(classified.memoryKey, jsonValue)) {
      safetyWarnings.push(
        `${topicLabel(key)} looked like a secret or raw media payload and was not stored in Intelligence Core.`
      );
      continue;
    }
    const nextRecord = record(
      classified.domain,
      classified.category,
      classified.memoryKey,
      jsonValue,
      sourceKind,
      confidence,
      now,
      sourceKind === 'user-correction' ? 'approved' : 'inferred'
    );
    if (classified.domain === 'project') projectUpdates.push(nextRecord);
    else if (classified.domain === 'product') productUpdates.push(nextRecord);
    else if (classified.domain === 'user') userUpdates.push(nextRecord);
    else conversationRecords.push(nextRecord);

    conversationRecords.push(
      record(
        'conversation',
        'decision',
        `answer-${classified.memoryKey}`,
        {
          topic: key,
          value: jsonValue,
        },
        sourceKind,
        confidence,
        now,
        sourceKind === 'user-correction' ? 'approved' : 'inferred'
      )
    );
  }

  if (options.conversation.experienceLevel) {
    userUpdates.push(
      record(
        'user',
        'preference',
        'experience-level',
        options.conversation.experienceLevel,
        'conversation',
        0.8,
        now,
        'inferred'
      )
    );
  }

  for (const item of options.conversation.acceptedRecommendations) {
    conversationRecords.push(recommendationDecisionRecord(item, now));
  }
  for (const item of options.conversation.rejectedRecommendations) {
    conversationRecords.push(recommendationDecisionRecord(item, now));
  }
  for (const question of options.conversation.unresolvedQuestions.slice(-4)) {
    conversationRecords.push(
      record(
        'conversation',
        'temporary',
        `unresolved-${stableSlug(question.topicId)}`,
        {
          question: question.question,
          reason: question.reason,
        },
        'conversation',
        0.7,
        now
      )
    );
  }

  const readinessStatus: ArchitectReadinessStatus =
    options.conversation.approvedForBlueprint
      ? 'approved'
      : options.conversation.activeTopicId === 'review'
        ? 'ready-for-approval'
        : options.extraction.unresolvedQuestions.length
          ? 'clarifying'
          : options.conversation.turnCount > 3
            ? 'summarizing'
            : 'discovering';

  return {
    schemaVersion: 1,
    projectId: options.afterDraft.projectId ?? 'local-architect-project',
    draftId: options.afterDraft.id,
    conversationId: options.conversation.id,
    streamVersion: options.conversation.streamVersion,
    naturalLanguageResponse: options.naturalLanguageResponse,
    proposedProjectBrainUpdates: projectUpdates,
    proposedProductBrainUpdates: productUpdates,
    proposedUserBrainUpdates: userUpdates,
    proposedConversationBrainRecords: conversationRecords,
    proposedWorkingBrainUpdate: record(
      'working',
      'temporary',
      'readiness-status',
      readinessStatus,
      'working',
      0.7,
      now
    ),
    architectDraftPatch: options.extraction.updatedAnswers,
    acceptedRecommendations: options.conversation.acceptedRecommendations.map(
      structuredRecommendation
    ),
    rejectedRecommendations: options.conversation.rejectedRecommendations.map(
      structuredRecommendation
    ),
    unresolvedQuestions: options.extraction.unresolvedQuestions,
    assumptions: options.conversation.summaryCheckpoints.map(
      (checkpoint) => checkpoint.summary
    ),
    confidence,
    nextQuestion: options.extraction.nextQuestion,
    readinessStatus,
    requiresUserApproval: !options.conversation.approvedForBlueprint,
    safetyWarnings,
  };
}

export function validateArchitectConversationEnvelope(
  value: unknown
): ArchitectConversationResponseEnvelope | null {
  if (!isObject(value)) return null;
  if (
    value.schemaVersion !== 1 ||
    typeof value.projectId !== 'string' ||
    typeof value.draftId !== 'string' ||
    typeof value.naturalLanguageResponse !== 'string' ||
    typeof value.confidence !== 'number' ||
    ![
      'discovering',
      'clarifying',
      'recommending',
      'summarizing',
      'ready-for-approval',
      'approved',
      'paused',
    ].includes(String(value.readinessStatus))
  ) {
    return null;
  }
  const candidate = value as unknown as ArchitectConversationResponseEnvelope;
  return {
    ...candidate,
    proposedProjectBrainUpdates: Array.isArray(candidate.proposedProjectBrainUpdates)
      ? candidate.proposedProjectBrainUpdates
      : [],
    proposedProductBrainUpdates: Array.isArray(candidate.proposedProductBrainUpdates)
      ? candidate.proposedProductBrainUpdates
      : [],
    proposedUserBrainUpdates: Array.isArray(candidate.proposedUserBrainUpdates)
      ? candidate.proposedUserBrainUpdates
      : [],
    proposedConversationBrainRecords: Array.isArray(candidate.proposedConversationBrainRecords)
      ? candidate.proposedConversationBrainRecords
      : [],
    acceptedRecommendations: Array.isArray(candidate.acceptedRecommendations)
      ? candidate.acceptedRecommendations
      : [],
    rejectedRecommendations: Array.isArray(candidate.rejectedRecommendations)
      ? candidate.rejectedRecommendations
      : [],
    unresolvedQuestions: Array.isArray(candidate.unresolvedQuestions)
      ? candidate.unresolvedQuestions.filter((item): item is string => typeof item === 'string')
      : [],
    assumptions: Array.isArray(candidate.assumptions)
      ? candidate.assumptions.filter((item): item is string => typeof item === 'string')
      : [],
    safetyWarnings: Array.isArray(candidate.safetyWarnings)
      ? candidate.safetyWarnings.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function parseArchitectConversationResponseEnvelope(
  raw: string
): {
  envelope: ArchitectConversationResponseEnvelope | null;
  naturalLanguageResponse?: string;
  error?: string;
} {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const envelope = validateArchitectConversationEnvelope(parsed);
    if (!envelope) {
      return {
        envelope: null,
        naturalLanguageResponse: isObject(parsed) && typeof parsed.naturalLanguageResponse === 'string'
          ? parsed.naturalLanguageResponse
          : undefined,
        error: 'Malformed Architect structured response envelope.',
      };
    }
    return { envelope };
  } catch (error) {
    return {
      envelope: null,
      error:
        error instanceof Error
          ? error.message
          : 'Malformed Architect structured response envelope.',
    };
  }
}

function applyRecordSafely(
  core: MatrixIntelligenceCore,
  input: AddIntelligenceRecordInput,
  warnings: string[]
): MatrixIntelligenceCore {
  if (isSecretLike(input.key, input.value)) {
    warnings.push(
      `${input.domain}/${input.key} looked like a secret or raw media payload and was not persisted.`
    );
    return core;
  }
  if (input.domain === 'engineering' || input.domain === 'experience') {
    warnings.push(
      `Architect conversation cannot write to ${input.domain} Brain during planning.`
    );
    return core;
  }
  return addIntelligenceRecord(core, input);
}

export function applyArchitectConversationEnvelopeToCore(
  core: MatrixIntelligenceCore,
  envelopeInput: unknown,
  options: {
    expectedProjectId?: string;
    expectedStreamVersion?: number;
  } = {}
): ArchitectEnvelopeApplyResult {
  const envelope = validateArchitectConversationEnvelope(envelopeInput);
  if (!envelope) {
    return {
      core,
      applied: false,
      skipped: true,
      warnings: [],
      errors: ['Malformed Architect structured response envelope.'],
    };
  }
  if (
    options.expectedProjectId &&
    envelope.projectId !== options.expectedProjectId
  ) {
    return {
      core,
      applied: false,
      skipped: true,
      warnings: [],
      errors: ['Stale Architect response belongs to a different project.'],
    };
  }
  if (
    typeof options.expectedStreamVersion === 'number' &&
    typeof envelope.streamVersion === 'number' &&
    envelope.streamVersion < options.expectedStreamVersion
  ) {
    return {
      core,
      applied: false,
      skipped: true,
      warnings: [],
      errors: ['Stale Architect response ignored.'],
    };
  }

  let next = core;
  const warnings = [...envelope.safetyWarnings];
  for (const input of [
    ...envelope.proposedProjectBrainUpdates,
    ...envelope.proposedProductBrainUpdates,
    ...envelope.proposedUserBrainUpdates,
    ...envelope.proposedConversationBrainRecords,
    ...(envelope.proposedWorkingBrainUpdate
      ? [envelope.proposedWorkingBrainUpdate]
      : []),
  ]) {
    next = applyRecordSafely(next, input, warnings);
  }
  return {
    core: next,
    applied: true,
    skipped: false,
    warnings,
    errors: [],
  };
}

export function initializeArchitectIntelligenceCore(options: {
  projectId: string;
  architectDraft: ArchitectDraft;
  existingCore?: MatrixIntelligenceCore | null;
  buildContract?: BuildContract | null;
  now?: Date;
}): MatrixIntelligenceCore {
  return createIntelligenceCore({
    projectId: options.projectId,
    architectDraft: options.architectDraft,
    buildContract: options.buildContract,
    existingCore: options.existingCore ?? null,
    now: options.now,
  });
}

export function buildArchitectIntelligencePacket(
  core: MatrixIntelligenceCore,
  buildContract?: BuildContract | null,
  now = new Date()
): IntelligenceArchitectContextPacket {
  return createArchitectIntelligencePacket(core, buildContract, now);
}
