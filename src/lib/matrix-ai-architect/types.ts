import type { BuildManifest } from '@/lib/build-suite/buildManifest';

export const ARCHITECT_DRAFT_METADATA_VERSION = '2026-07-19';

export type ArchitectBudgetMode =
  | 'free-first'
  | 'lean'
  | 'professional'
  | 'growth';

export type ArchitectExperienceLevel = 'beginner' | 'advanced';

export type ArchitectConversationRole = 'architect' | 'user' | 'system';

export type ArchitectConversationMessageStatus =
  | 'streaming'
  | 'complete'
  | 'failed';

export type ArchitectRecommendationDecision = 'accepted' | 'rejected';

export type ArchitectQuestionType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean';

export type ArchitectComplexity = 'small' | 'medium' | 'large' | 'platform';

export interface ArchitectQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface ArchitectQuestion {
  id: keyof ArchitectAnswers;
  label: string;
  description: string;
  type: ArchitectQuestionType;
  category:
    | 'foundation'
    | 'users'
    | 'product'
    | 'data'
    | 'integrations'
    | 'delivery';
  options?: ArchitectQuestionOption[];
  placeholder?: string;
}

export interface ArchitectConversationMessage {
  id: string;
  role: ArchitectConversationRole;
  content: string;
  createdAt: string;
  topicId?: keyof ArchitectAnswers | 'review';
  status?: ArchitectConversationMessageStatus;
}

export interface ArchitectConversationDecision {
  recommendationId: string;
  title: string;
  decision: ArchitectRecommendationDecision;
  reason?: string;
  createdAt: string;
}

export interface ArchitectConversationUnresolvedQuestion {
  topicId: keyof ArchitectAnswers | 'review';
  question: string;
  reason: string;
  createdAt: string;
}

export interface ArchitectConversationCheckpoint {
  id: string;
  summary: string;
  createdAt: string;
}

export interface ArchitectConversationState {
  id: string;
  draftId: string;
  projectId?: string;
  activeTopicId?: keyof ArchitectAnswers | 'review';
  experienceLevel: ArchitectExperienceLevel;
  messages: ArchitectConversationMessage[];
  answeredTopicIds: (keyof ArchitectAnswers)[];
  acceptedRecommendations: ArchitectConversationDecision[];
  rejectedRecommendations: ArchitectConversationDecision[];
  unresolvedQuestions: ArchitectConversationUnresolvedQuestion[];
  summaryCheckpoints: ArchitectConversationCheckpoint[];
  approvalRequired: boolean;
  approvedForBlueprint: boolean;
  completed: boolean;
  turnCount: number;
  lastProcessedMessageId?: string;
  streamVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArchitectConversationExtraction {
  updatedAnswers: Partial<ArchitectAnswers>;
  newRequirements: string[];
  rejectedRecommendations: string[];
  unresolvedQuestions: string[];
  confidence: number;
  nextQuestion?: string;
}

export interface ArchitectConversationReadiness {
  readyForBlueprint: boolean;
  canCreateInitialBuildContract: boolean;
  confidence: number;
  missingTopics: (keyof ArchitectAnswers)[];
  reason: string;
}

export interface ArchitectAnswers {
  appIdea: string;
  investmentLevel: ArchitectBudgetMode;
  primaryUsers: string;
  accountsRequired: boolean;
  adminPanel: boolean;
  mobileSupport: string[];
  payments: boolean;
  notifications: string[];
  aiFeatures: string[];
  offlineSupport: boolean;
  database: string;
  publicWebsite: boolean;
  dashboard: boolean;
  crm: boolean;
  scheduling: boolean;
  analytics: boolean;
  auth: string;
  deploymentTarget: string;
  integrations: string[];
  customRequirements: string;
}

export interface ArchitectRouteSpec {
  path: string;
  label: string;
  purpose: string;
  priority: 'primary' | 'secondary';
}

export interface ArchitectDataModelSpec {
  name: string;
  fields: string[];
  purpose: string;
}

export interface ArchitectApiSpec {
  path: string;
  purpose: string;
  methods: string[];
}

export interface ArchitectRecommendation {
  title: string;
  description: string;
  confidence: number;
  category:
    | 'architecture'
    | 'database'
    | 'auth'
    | 'deployment'
    | 'ux'
    | 'cost'
    | 'ai';
}

export interface ArchitectSpecification {
  applicationSummary: string;
  recommendedArchitecture: string;
  recommendedFolderStructure: string[];
  recommendedRoutes: ArchitectRouteSpec[];
  recommendedDataModels: ArchitectDataModelSpec[];
  recommendedComponents: string[];
  recommendedApis: ArchitectApiSpec[];
  recommendedIntegrations: string[];
  recommendedAuth: string;
  recommendedDeployment: string;
  estimatedComplexity: ArchitectComplexity;
  estimatedGenerationSize: 'compact' | 'standard' | 'expanded';
  estimatedAiPasses: number;
  confidenceScore: number;
  recommendations: ArchitectRecommendation[];
}

export interface ArchitectDraft {
  id: string;
  projectId?: string;
  projectName: string;
  answers: ArchitectAnswers;
  specification: ArchitectSpecification;
  conversation?: ArchitectConversationState;
  sourceBuildManifest?: BuildManifest;
  createdAt: string;
  updatedAt: string;
  metadataVersion: typeof ARCHITECT_DRAFT_METADATA_VERSION;
}

export interface ArchitectDraftCreateOptions {
  projectId?: string;
  projectName?: string;
  sourceBuildManifest?: BuildManifest;
  now?: Date;
}
