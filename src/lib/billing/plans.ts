import type {
  PlanDefinition,
  PlanEntitlements,
  PlanId,
  UsageCategory,
} from './types';

const FREE: PlanEntitlements = {
  storedProjects: 3,
  architectRequests: 30,
  blueprintRequests: 20,
  workspaceAiRequests: 40,
  taskExecutionRequests: 30,
  repairs: 10,
  concurrentBuilds: 1,
  tasksPerBuild: 14,
  generatedFiles: 80,
  generatedBytes: 450_000,
  buildDurationMinutes: 30,
  styleAnalyses: 10,
  deployments: 1,
  benchmarkAccess: false,
};

export const PLAN_CATALOG: Readonly<Record<PlanId, PlanDefinition>> = {
  'internal-admin': {
    id: 'internal-admin',
    displayName: 'Internal',
    description: 'Operator-controlled internal access.',
    entitlements: {
      storedProjects: 10_000,
      architectRequests: 100_000,
      blueprintRequests: 100_000,
      workspaceAiRequests: 100_000,
      taskExecutionRequests: 100_000,
      repairs: 100_000,
      concurrentBuilds: 10,
      tasksPerBuild: 500,
      generatedFiles: 10_000,
      generatedBytes: 100_000_000,
      buildDurationMinutes: 240,
      styleAnalyses: 100_000,
      deployments: 100_000,
      benchmarkAccess: true,
    },
  },
  'free-beta': {
    id: 'free-beta',
    displayName: 'Free Beta',
    description: 'A bounded private-beta plan.',
    entitlements: FREE,
  },
  starter: {
    id: 'starter',
    displayName: 'Starter',
    description: 'More room for individual production projects.',
    priceEnvKey: 'STRIPE_PRICE_STARTER',
    entitlements: {
      ...FREE,
      storedProjects: 15,
      architectRequests: 150,
      blueprintRequests: 100,
      workspaceAiRequests: 250,
      taskExecutionRequests: 200,
      repairs: 75,
      tasksPerBuild: 35,
      generatedFiles: 250,
      generatedBytes: 2_000_000,
      styleAnalyses: 50,
      deployments: 10,
    },
  },
  pro: {
    id: 'pro',
    displayName: 'Pro',
    description: 'Higher limits for sustained professional use.',
    priceEnvKey: 'STRIPE_PRICE_PRO',
    entitlements: {
      ...FREE,
      storedProjects: 100,
      architectRequests: 1_000,
      blueprintRequests: 750,
      workspaceAiRequests: 2_000,
      taskExecutionRequests: 1_500,
      repairs: 500,
      concurrentBuilds: 2,
      tasksPerBuild: 75,
      generatedFiles: 500,
      generatedBytes: 5_000_000,
      buildDurationMinutes: 60,
      styleAnalyses: 300,
      deployments: 100,
      benchmarkAccess: true,
    },
  },
};

const LIMIT_KEY: Record<UsageCategory, keyof PlanEntitlements> = {
  'architect-ai': 'architectRequests',
  'blueprint-ai': 'blueprintRequests',
  'workspace-ai': 'workspaceAiRequests',
  'task-execution': 'taskExecutionRequests',
  repair: 'repairs',
  'style-analysis': 'styleAnalyses',
  deployment: 'deployments',
  benchmark: 'benchmarkAccess',
};

export function getPlan(planId: PlanId): PlanDefinition {
  return PLAN_CATALOG[planId];
}

export function getUsageLimit(planId: PlanId, category: UsageCategory): number {
  const value = getPlan(planId).entitlements[LIMIT_KEY[category]];
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

export function planIdForStripePrice(
  priceId: string,
  source: Record<string, string | undefined> = process.env
): PlanId | undefined {
  if (priceId && priceId === source.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId && priceId === source.STRIPE_PRICE_PRO) return 'pro';
  return undefined;
}

export function stripePriceForPlan(
  planId: PlanId,
  source: Record<string, string | undefined> = process.env
): string | undefined {
  const envKey = PLAN_CATALOG[planId].priceEnvKey;
  return envKey ? source[envKey] : undefined;
}
