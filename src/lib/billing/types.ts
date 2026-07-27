export type PlanId = 'internal-admin' | 'free-beta' | 'starter' | 'pro';

export type UsageCategory =
  | 'architect-ai'
  | 'blueprint-ai'
  | 'workspace-ai'
  | 'task-execution'
  | 'repair'
  | 'style-analysis'
  | 'deployment'
  | 'benchmark';

export interface PlanEntitlements {
  storedProjects: number;
  architectRequests: number;
  blueprintRequests: number;
  workspaceAiRequests: number;
  taskExecutionRequests: number;
  repairs: number;
  concurrentBuilds: number;
  tasksPerBuild: number;
  generatedFiles: number;
  generatedBytes: number;
  buildDurationMinutes: number;
  styleAnalyses: number;
  deployments: number;
  benchmarkAccess: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  displayName: string;
  description: string;
  priceEnvKey?: 'STRIPE_PRICE_STARTER' | 'STRIPE_PRICE_PRO';
  entitlements: PlanEntitlements;
}

export type SubscriptionStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'cancelled';

export type UsageDecision =
  | 'allowed'
  | 'warning'
  | 'limit-reached'
  | 'upgrade-required'
  | 'billing-past-due'
  | 'temporarily-unavailable'
  | 'internal-override';

export interface UsageAuthorization {
  decision: UsageDecision;
  allowed: boolean;
  planId: PlanId;
  category: UsageCategory;
  operationId: string;
  used: number;
  limit: number;
  remaining: number;
  duplicate: boolean;
  message: string;
}

export interface BillingSummary {
  planId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerConfigured: boolean;
  currentPeriodEnd?: string;
  entitlements: PlanEntitlements;
}

export interface LargeBuildEstimateInput {
  tasks: number;
  expectedAiRequests: number;
  repairAllowance: number;
  generatedFiles: number;
  generatedBytes: number;
  durationMinutes: number;
}

export interface LargeBuildEstimate {
  allowed: boolean;
  planId: PlanId;
  input: LargeBuildEstimateInput;
  blockingReasons: string[];
  warnings: string[];
  options: Array<
    'simplify' | 'build-foundation-first' | 'remove-optional-features' | 'upgrade' | 'cancel'
  >;
}
