import { ARCHITECT_QUESTIONS } from './questions';
import {
  getArchitectServiceRecommendations,
  updateArchitectAnswer,
} from './architectDraft';
import type {
  ArchitectAnswers,
  ArchitectConversationDecision,
  ArchitectConversationExtraction,
  ArchitectConversationMessage,
  ArchitectConversationReadiness,
  ArchitectConversationState,
  ArchitectDraft,
  ArchitectExperienceLevel,
  ArchitectQuestion,
} from './types';

const ESSENTIAL_TOPICS: (keyof ArchitectAnswers)[] = [
  'appIdea',
  'investmentLevel',
  'primaryUsers',
  'accountsRequired',
  'database',
  'deploymentTarget',
  'customRequirements',
];

const MAX_TURNS = 18;

interface ConversationTurnOptions {
  draft: ArchitectDraft;
  conversation: ArchitectConversationState;
  userInput: string;
  now?: Date;
  streamVersion?: number;
}

export interface ArchitectConversationTurnResult {
  draft: ArchitectDraft;
  conversation: ArchitectConversationState;
  extraction: ArchitectConversationExtraction;
  stale: boolean;
}

function createId(prefix: string, now: Date, suffix = ''): string {
  return `${prefix}-${now.getTime().toString(36)}${suffix ? `-${suffix}` : ''}`;
}

function message(
  role: ArchitectConversationMessage['role'],
  content: string,
  now: Date,
  topicId?: ArchitectConversationMessage['topicId'],
  status: ArchitectConversationMessage['status'] = 'complete'
): ArchitectConversationMessage {
  return {
    id: createId(role, now, `${Math.random().toString(36).slice(2, 8)}`),
    role,
    content,
    createdAt: now.toISOString(),
    topicId,
    status,
  };
}

function questionById(id: keyof ArchitectAnswers): ArchitectQuestion | undefined {
  return ARCHITECT_QUESTIONS.find((question) => question.id === id);
}

function isBlankAnswer(key: keyof ArchitectAnswers, answers: ArchitectAnswers): boolean {
  const value = answers[key];
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function budgetFromText(text: string): ArchitectAnswers['investmentLevel'] | null {
  if (includesAny(text, ['free', 'prototype', 'no money', 'zero', 'cheap', 'bootstrap'])) {
    return 'free-first';
  }
  if (includesAny(text, ['lean', 'startup', 'low cost', 'first users', 'mvp'])) {
    return 'lean';
  }
  if (includesAny(text, ['professional', 'paid product', 'real product', 'reliable'])) {
    return 'professional';
  }
  if (includesAny(text, ['growth', 'scale', 'enterprise', 'teams', 'high traffic'])) {
    return 'growth';
  }
  return null;
}

function yesNoFromText(text: string): boolean | null {
  if (/\b(no|not|none|without|dont|don't|skip|avoid)\b/.test(text)) return false;
  if (/\b(yes|yeah|yep|need|needs|include|with|add|want|required)\b/.test(text)) {
    return true;
  }
  return null;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function appendUnique(current: string[], additions: string[]): string[] {
  return unique([...current, ...additions]);
}

function mergeRequirements(current: string, addition: string): string {
  const trimmed = addition.trim();
  if (!trimmed) return current;
  if (current.toLowerCase().includes(trimmed.toLowerCase())) return current;
  return current.trim() ? `${current.trim()}\n${trimmed}` : trimmed;
}

function extractOptionId(
  question: ArchitectQuestion,
  text: string
): string | null {
  for (const option of question.options ?? []) {
    const haystack = `${option.id} ${option.label} ${option.description ?? ''}`.toLowerCase();
    if (
      text.includes(option.id.toLowerCase()) ||
      option.label.toLowerCase().split(/\s+/).some((part) => part.length > 4 && text.includes(part)) ||
      haystack.split(/\s+/).some((part) => part.length > 6 && text.includes(part))
    ) {
      return option.id;
    }
  }
  return null;
}

function extractMultiOptionIds(
  question: ArchitectQuestion,
  text: string
): string[] {
  return (question.options ?? [])
    .filter((option) => {
      const terms = `${option.id} ${option.label} ${option.description ?? ''}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length > 4);
      return text.includes(option.id.toLowerCase()) || terms.some((term) => text.includes(term));
    })
    .map((option) => option.id);
}

function inferGeneralAnswers(
  input: string,
  current: ArchitectAnswers
): Partial<ArchitectAnswers> {
  const text = normalize(input);
  const updates: Partial<ArchitectAnswers> = {};

  const budget = budgetFromText(text);
  if (budget) updates.investmentLevel = budget;

  if (includesAny(text, ['no payment', 'no stripe', 'without payment', 'avoid stripe'])) {
    updates.payments = false;
    updates.integrations = current.integrations.filter((item) => item !== 'stripe');
  } else if (includesAny(text, ['payment', 'stripe', 'subscription', 'checkout', 'billing'])) {
    updates.payments = true;
    updates.integrations = appendUnique(current.integrations, ['stripe']);
  }

  if (includesAny(text, ['no login', 'no account', 'no auth', 'without login'])) {
    updates.accountsRequired = false;
    updates.auth = 'none';
  } else if (includesAny(text, ['login', 'account', 'auth', 'sign in', 'users'])) {
    updates.accountsRequired = true;
    updates.auth = includesAny(text, ['team', 'organization'])
      ? 'teams'
      : includesAny(text, ['role', 'admin'])
      ? 'roles'
      : 'basic';
  }

  if (includesAny(text, ['admin panel', 'admin dashboard', 'admin area'])) {
    updates.adminPanel = yesNoFromText(text) ?? true;
  }
  if (includesAny(text, ['dashboard', 'metrics overview'])) updates.dashboard = true;
  if (includesAny(text, ['crm', 'contacts', 'pipeline', 'deals'])) updates.crm = true;
  if (includesAny(text, ['schedule', 'booking', 'appointments', 'calendar'])) updates.scheduling = true;
  if (includesAny(text, ['analytics', 'reports', 'charts', 'insights'])) updates.analytics = true;
  if (includesAny(text, ['offline', 'local-first'])) updates.offlineSupport = true;
  if (includesAny(text, ['mobile', 'phone', 'android'])) {
    const mobile = [...current.mobileSupport];
    if (!mobile.includes('mobile-first')) mobile.push('mobile-first');
    if (text.includes('android') && !mobile.includes('android-capacitor')) {
      mobile.push('android-capacitor');
    }
    updates.mobileSupport = mobile;
  }
  if (includesAny(text, ['ai', 'assistant', 'chatbot', 'summaries', 'recommendations'])) {
    const aiFeatures = [...current.aiFeatures];
    if (includesAny(text, ['assistant', 'chatbot', 'ai'])) aiFeatures.push('assistant');
    if (text.includes('summar')) aiFeatures.push('summaries');
    if (text.includes('recommend')) aiFeatures.push('recommendations');
    updates.aiFeatures = unique(aiFeatures);
  }
  if (includesAny(text, ['supabase', 'database', 'cloud data'])) {
    updates.database = text.includes('local') ? 'hybrid' : 'cloud-database';
    if (text.includes('supabase')) updates.integrations = appendUnique(current.integrations, ['supabase']);
  }
  if (includesAny(text, ['vercel', 'deploy', 'deployment', 'zip export'])) {
    updates.deploymentTarget = text.includes('zip') ? 'zip-export' : text.includes('vercel') ? 'vercel' : current.deploymentTarget;
  }

  return updates;
}

function extractActiveTopicAnswer(
  topicId: keyof ArchitectAnswers | undefined,
  input: string,
  current: ArchitectAnswers
): Partial<ArchitectAnswers> {
  if (!topicId) return {};
  const question = questionById(topicId);
  const text = normalize(input);
  const trimmed = input.trim();
  if (!question || !trimmed) return {};

  if (question.type === 'text' || question.type === 'textarea') {
    if (topicId === 'customRequirements') {
      return { customRequirements: mergeRequirements(current.customRequirements, trimmed) };
    }
    if (trimmed.length > 3 && !/^(yes|no|maybe|sure)$/i.test(trimmed)) {
      return { [topicId]: trimmed } as Partial<ArchitectAnswers>;
    }
    return {};
  }

  if (question.type === 'boolean') {
    const parsed = yesNoFromText(text);
    return parsed === null ? {} : ({ [topicId]: parsed } as Partial<ArchitectAnswers>);
  }

  if (question.type === 'select') {
    if (topicId === 'investmentLevel') {
      const budget = budgetFromText(text);
      if (budget) return { investmentLevel: budget };
    }
    const optionId = extractOptionId(question, text);
    return optionId ? ({ [topicId]: optionId } as Partial<ArchitectAnswers>) : {};
  }

  if (question.type === 'multiselect') {
    const optionIds = extractMultiOptionIds(question, text);
    if (optionIds.length === 0) return {};
    const currentValue = Array.isArray(current[topicId]) ? (current[topicId] as string[]) : [];
    return { [topicId]: appendUnique(currentValue, optionIds) } as Partial<ArchitectAnswers>;
  }

  return {};
}

function nextTopic(
  draft: ArchitectDraft,
  conversation: Pick<ArchitectConversationState, 'answeredTopicIds'>
): keyof ArchitectAnswers | 'review' {
  const answered = new Set(conversation.answeredTopicIds);
  for (const topic of ESSENTIAL_TOPICS) {
    if (!answered.has(topic) || isBlankAnswer(topic, draft.answers)) {
      return topic;
    }
  }
  return 'review';
}

function questionText(topicId: keyof ArchitectAnswers | 'review', level: ArchitectExperienceLevel): string {
  if (topicId === 'review') {
    return level === 'advanced'
      ? 'The core planning data is strong enough for a Blueprint handoff. Do you want to approve this architecture draft now, or adjust routes, data models, integrations, or constraints first?'
      : 'I have enough to prepare a Blueprint. Would you like to review and approve this plan, or change anything first?';
  }
  const question = questionById(topicId);
  if (!question) return 'What should I know next about this app?';
  if (level === 'advanced') return `${question.label} ${question.description}`;
  return question.label;
}

function buildSummary(draft: ArchitectDraft): string {
  const spec = draft.specification;
  return [
    `Summary so far: ${spec.applicationSummary}`,
    `Recommended shape: ${spec.recommendedRoutes.length} route(s), ${spec.recommendedDataModels.length} data model(s), ${spec.estimatedComplexity} complexity.`,
    `Budget direction: ${draft.answers.investmentLevel}.`,
  ].join(' ');
}

function recommendationNote(draft: ArchitectDraft, level: ArchitectExperienceLevel): string {
  const rec = getArchitectServiceRecommendations(draft.answers)[0];
  if (!rec) return '';
  const freeTier = rec.hasFreeTier ? 'It has a free-tier path.' : 'I am treating cost as an estimate.';
  return level === 'advanced'
    ? ` Recommendation: ${rec.recommendedOption} for ${rec.category}; ${rec.reason} ${freeTier}`
    : ` I would currently recommend ${rec.recommendedOption} because ${rec.reason.toLowerCase()} ${freeTier}`;
}

function applyAnswerUpdates(
  draft: ArchitectDraft,
  updates: Partial<ArchitectAnswers>,
  now: Date
): ArchitectDraft {
  let next = draft;
  for (const [key, value] of Object.entries(updates) as [
    keyof ArchitectAnswers,
    ArchitectAnswers[keyof ArchitectAnswers],
  ][]) {
    if (typeof value === 'undefined') continue;
    const current = next.answers[key];
    if (JSON.stringify(current) === JSON.stringify(value)) continue;
    next = updateArchitectAnswer(next, key, value as never, now);
  }
  return next;
}

function changedKeys(
  before: ArchitectAnswers,
  updates: Partial<ArchitectAnswers>
): (keyof ArchitectAnswers)[] {
  return (Object.keys(updates) as (keyof ArchitectAnswers)[]).filter(
    (key) =>
      typeof updates[key] !== 'undefined' &&
      JSON.stringify(before[key]) !== JSON.stringify(updates[key])
  );
}

export function getArchitectConversationReadiness(
  draft: ArchitectDraft,
  conversation = draft.conversation
): ArchitectConversationReadiness {
  const missingTopics = ESSENTIAL_TOPICS.filter((topic) => {
    if (topic === 'customRequirements') return false;
    return isBlankAnswer(topic, draft.answers);
  });
  const answeredCount = conversation?.answeredTopicIds.length ?? 0;
  const confidence = Math.min(
    95,
    Math.max(35, draft.specification.confidenceScore + answeredCount * 2 - missingTopics.length * 8)
  );
  const readyForBlueprint = missingTopics.length === 0 && confidence >= 68;
  return {
    readyForBlueprint,
    canCreateInitialBuildContract: readyForBlueprint && confidence >= 72,
    confidence,
    missingTopics,
    reason: readyForBlueprint
      ? 'Core product, users, budget, data, and deployment choices are available.'
      : `Missing ${missingTopics.length} core planning topic(s).`,
  };
}

export function createArchitectConversation(
  draft: ArchitectDraft,
  now = new Date(),
  experienceLevel: ArchitectExperienceLevel = 'beginner'
): ArchitectConversationState {
  const activeTopicId = nextTopic(draft, { answeredTopicIds: [] });
  return {
    id: createId('architect-conversation', now),
    draftId: draft.id,
    projectId: draft.projectId,
    activeTopicId,
    experienceLevel,
    messages: [
      message(
        'architect',
        `Welcome to Matrix AI Architect. I will help shape your app one decision at a time, then prepare a Blueprint for you to approve. ${questionText(activeTopicId, experienceLevel)}`,
        now,
        activeTopicId
      ),
    ],
    answeredTopicIds: [],
    acceptedRecommendations: [],
    rejectedRecommendations: [],
    unresolvedQuestions: [],
    summaryCheckpoints: [],
    approvalRequired: true,
    approvedForBlueprint: false,
    completed: false,
    turnCount: 0,
    streamVersion: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function ensureArchitectConversation(
  draft: ArchitectDraft,
  now = new Date()
): ArchitectDraft {
  if (draft.conversation?.draftId === draft.id) return draft;
  return {
    ...draft,
    conversation: createArchitectConversation(draft, now),
    updatedAt: now.toISOString(),
  };
}

export function setArchitectConversationExperienceLevel(
  draft: ArchitectDraft,
  experienceLevel: ArchitectExperienceLevel,
  now = new Date()
): ArchitectDraft {
  const conversation = draft.conversation ?? createArchitectConversation(draft, now, experienceLevel);
  return {
    ...draft,
    conversation: {
      ...conversation,
      experienceLevel,
      streamVersion: conversation.streamVersion + 1,
      updatedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  };
}

export function applyArchitectConversationTurn({
  draft,
  conversation,
  userInput,
  now = new Date(),
  streamVersion,
}: ConversationTurnOptions): ArchitectConversationTurnResult {
  if (typeof streamVersion === 'number' && streamVersion !== conversation.streamVersion) {
    return {
      draft,
      conversation,
      stale: true,
      extraction: {
        updatedAnswers: {},
        newRequirements: [],
        rejectedRecommendations: [],
        unresolvedQuestions: ['Stale conversation callback ignored.'],
        confidence: 0,
      },
    };
  }

  const activeTopicId =
    conversation.activeTopicId && conversation.activeTopicId !== 'review'
      ? conversation.activeTopicId
      : nextTopic(draft, conversation);
  const specific =
    activeTopicId === 'review'
      ? {}
      : extractActiveTopicAnswer(activeTopicId, userInput, draft.answers);
  const general = inferGeneralAnswers(userInput, draft.answers);
  const updates = { ...general, ...specific };
  const keys = changedKeys(draft.answers, updates);
  const extractionConfidence = keys.length > 0 ? Math.min(94, 62 + keys.length * 8) : 35;
  let nextDraft = applyAnswerUpdates(draft, updates, now);
  const answeredTopicIds = unique([
    ...conversation.answeredTopicIds,
    ...(activeTopicId && activeTopicId !== 'review' && extractionConfidence >= 55 ? [activeTopicId] : []),
    ...keys,
  ]);

  const unresolved =
    keys.length === 0
      ? [
          {
            topicId: activeTopicId,
            question: questionText(activeTopicId, conversation.experienceLevel),
            reason: 'The answer was too ambiguous to update the structured plan safely.',
            createdAt: now.toISOString(),
          },
        ]
      : [];

  const nextConversationBase: ArchitectConversationState = {
    ...conversation,
    answeredTopicIds,
    unresolvedQuestions: [...conversation.unresolvedQuestions, ...unresolved],
    messages: [
      ...conversation.messages,
      message('user', userInput.trim(), now, activeTopicId),
    ],
    turnCount: conversation.turnCount + 1,
    streamVersion: conversation.streamVersion + 1,
    approvedForBlueprint: false,
    completed: false,
    updatedAt: now.toISOString(),
  };

  const nextActiveTopic = unresolved.length ? activeTopicId : nextTopic(nextDraft, nextConversationBase);
  const readiness = getArchitectConversationReadiness(nextDraft, nextConversationBase);
  const checkpoint =
    nextConversationBase.turnCount > 0 && nextConversationBase.turnCount % 4 === 0
      ? {
          id: createId('summary', now),
          summary: buildSummary(nextDraft),
          createdAt: now.toISOString(),
        }
      : null;

  const acknowledgement =
    keys.length === 0
      ? 'I want to make sure I understood that correctly before I write it into the plan.'
      : `Got it. I updated ${keys.map((key) => questionById(key)?.label ?? key).join(', ')} in the structured plan.`;
  const summarySentence = checkpoint ? ` ${checkpoint.summary}` : '';
  const recommendation = recommendationNote(nextDraft, nextConversationBase.experienceLevel);
  const nextQuestion =
    nextConversationBase.turnCount >= MAX_TURNS
      ? 'We have enough to stop here and review the Blueprint instead of asking more questions.'
      : questionText(nextActiveTopic, nextConversationBase.experienceLevel);
  const readinessSentence = readiness.readyForBlueprint
    ? ' The plan is now strong enough for a Blueprint review, but I will wait for your explicit approval.'
    : '';

  const nextConversation: ArchitectConversationState = {
    ...nextConversationBase,
    activeTopicId: nextActiveTopic,
    summaryCheckpoints: checkpoint
      ? [...conversation.summaryCheckpoints, checkpoint]
      : conversation.summaryCheckpoints,
    completed: nextActiveTopic === 'review',
    messages: [
      ...nextConversationBase.messages,
      message(
        'architect',
        `${acknowledgement}${summarySentence}${recommendation}${readinessSentence} ${nextQuestion}`,
        now,
        nextActiveTopic
      ),
    ],
  };

  nextDraft = {
    ...nextDraft,
    conversation: nextConversation,
    updatedAt: now.toISOString(),
  };

  return {
    draft: nextDraft,
    conversation: nextConversation,
    stale: false,
    extraction: {
      updatedAnswers: updates,
      newRequirements:
        typeof updates.customRequirements === 'string' ? [updates.customRequirements] : [],
      rejectedRecommendations: [],
      unresolvedQuestions: unresolved.map((item) => item.reason),
      confidence: extractionConfidence,
      nextQuestion,
    },
  };
}

export function recordArchitectStructuredEdit<K extends keyof ArchitectAnswers>(
  draft: ArchitectDraft,
  key: K,
  value: ArchitectAnswers[K],
  now = new Date()
): ArchitectDraft {
  const conversation = draft.conversation ?? createArchitectConversation(draft, now);
  const nextDraft = updateArchitectAnswer(draft, key, value, now);
  const answeredTopicIds = unique([...conversation.answeredTopicIds, key]);
  const nextConversation: ArchitectConversationState = {
    ...conversation,
    answeredTopicIds,
    approvedForBlueprint: false,
    streamVersion: conversation.streamVersion + 1,
    messages: [
      ...conversation.messages,
      message(
        'system',
        `Structured answer updated: ${questionById(key)?.label ?? key}.`,
        now,
        key
      ),
    ],
    updatedAt: now.toISOString(),
  };
  return {
    ...nextDraft,
    conversation: nextConversation,
    updatedAt: now.toISOString(),
  };
}

function decisionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function recordArchitectRecommendationDecision(
  draft: ArchitectDraft,
  title: string,
  decision: ArchitectConversationDecision['decision'],
  reason?: string,
  now = new Date()
): ArchitectDraft {
  const conversation = draft.conversation ?? createArchitectConversation(draft, now);
  const record: ArchitectConversationDecision = {
    recommendationId: decisionId(title),
    title,
    decision,
    reason,
    createdAt: now.toISOString(),
  };
  const accepted = conversation.acceptedRecommendations.filter(
    (item) => item.recommendationId !== record.recommendationId
  );
  const rejected = conversation.rejectedRecommendations.filter(
    (item) => item.recommendationId !== record.recommendationId
  );
  return {
    ...draft,
    conversation: {
      ...conversation,
      acceptedRecommendations:
        decision === 'accepted' ? [...accepted, record] : accepted,
      rejectedRecommendations:
        decision === 'rejected' ? [...rejected, record] : rejected,
      messages: [
        ...conversation.messages,
        message(
          'system',
          `${decision === 'accepted' ? 'Accepted' : 'Rejected'} recommendation: ${title}.`,
          now
        ),
      ],
      streamVersion: conversation.streamVersion + 1,
      updatedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  };
}

export function approveArchitectConversationForBlueprint(
  draft: ArchitectDraft,
  now = new Date()
): ArchitectDraft {
  const conversation = draft.conversation ?? createArchitectConversation(draft, now);
  return {
    ...draft,
    conversation: {
      ...conversation,
      approvedForBlueprint: true,
      completed: true,
      activeTopicId: 'review',
      messages: [
        ...conversation.messages,
        message(
          'system',
          'Architect plan approved for Blueprint Studio handoff.',
          now,
          'review'
        ),
      ],
      streamVersion: conversation.streamVersion + 1,
      updatedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  };
}
