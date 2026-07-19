import type { ArchitectBudgetMode, ArchitectRecommendation } from './types';

export type ArchitectRecommendationCategory =
  | 'database'
  | 'authentication'
  | 'deployment'
  | 'storage'
  | 'billing'
  | 'email'
  | 'analytics'
  | 'monitoring'
  | 'ai-provider'
  | 'background-jobs'
  | 'compute';

export type ArchitectCostBand =
  | 'free'
  | 'low'
  | 'medium'
  | 'high'
  | 'usage-based';

export interface ArchitectServiceRecommendationRule {
  category: ArchitectRecommendationCategory;
  recommendedOption: string;
  lowerCostAlternative: string;
  reason: string;
  estimatedCostBand: ArchitectCostBand;
  hasFreeTier: boolean;
  confidence: number;
  assumptions: string[];
  budgetModes: ArchitectBudgetMode[];
  signals: string[];
}

export const ARCHITECT_RECOMMENDATION_RULES: ArchitectServiceRecommendationRule[] = [
  {
    category: 'database',
    recommendedOption: 'localStorage first, upgrade to Supabase when accounts are needed',
    lowerCostAlternative: 'localStorage / IndexedDB',
    reason:
      'A browser-first database keeps prototype cost low while preserving a clear upgrade path.',
    estimatedCostBand: 'free',
    hasFreeTier: true,
    confidence: 88,
    assumptions: ['The app can launch as a single-user or demo product first.'],
    budgetModes: ['free-first', 'lean'],
    signals: [
      'offline',
      'prototype',
      'local',
      'no-accounts',
      'crm',
      'dashboard',
      'fitness',
      'expense',
      'ecommerce',
    ],
  },
  {
    category: 'database',
    recommendedOption: 'Supabase Postgres',
    lowerCostAlternative: 'localStorage for demos, then migrate to Supabase',
    reason:
      'Managed Postgres is a strong default when users, records, and sync matter.',
    estimatedCostBand: 'usage-based',
    hasFreeTier: true,
    confidence: 86,
    assumptions: ['The product needs shared data, accounts, or cross-device sync.'],
    budgetModes: ['professional', 'growth'],
    signals: ['accounts', 'database', 'crm', 'dashboard', 'analytics'],
  },
  {
    category: 'authentication',
    recommendedOption: 'Supabase Auth',
    lowerCostAlternative: 'passwordless demo mode until launch',
    reason:
      'It fits the existing Matrix Coder stack and avoids adding another auth vendor early.',
    estimatedCostBand: 'usage-based',
    hasFreeTier: true,
    confidence: 84,
    assumptions: ['Email/password or magic-link accounts are enough for the first launch.'],
    budgetModes: ['lean', 'professional', 'growth'],
    signals: ['auth', 'accounts', 'admin'],
  },
  {
    category: 'deployment',
    recommendedOption: 'Vercel',
    lowerCostAlternative: 'static ZIP export for handoff or manual hosting',
    reason:
      'Vercel is a natural deployment target for Next.js apps and already has foundation code in Deployment Center.',
    estimatedCostBand: 'usage-based',
    hasFreeTier: true,
    confidence: 90,
    assumptions: ['The generated app remains a Next.js web app.'],
    budgetModes: ['lean', 'professional', 'growth'],
    signals: ['next', 'deploy', 'production'],
  },
  {
    category: 'storage',
    recommendedOption: 'Supabase Storage',
    lowerCostAlternative: 'client-side file placeholders until upload is required',
    reason:
      'File uploads need a real object storage layer once users can attach media or documents.',
    estimatedCostBand: 'usage-based',
    hasFreeTier: true,
    confidence: 78,
    assumptions: ['The app needs user-uploaded assets or documents.'],
    budgetModes: ['professional', 'growth'],
    signals: ['upload', 'files', 'media', 'documents'],
  },
  {
    category: 'billing',
    recommendedOption: 'Stripe Checkout and customer portal',
    lowerCostAlternative: 'manual invoicing or waitlist before paid launch',
    reason:
      'Stripe is a proven subscription path, but it should wait until pricing and access rules are clear.',
    estimatedCostBand: 'usage-based',
    hasFreeTier: false,
    confidence: 83,
    assumptions: ['The product will charge subscriptions, one-time payments, or usage-based fees.'],
    budgetModes: ['professional', 'growth'],
    signals: ['payments', 'billing', 'subscription', 'stripe'],
  },
  {
    category: 'email',
    recommendedOption: 'Resend transactional email',
    lowerCostAlternative: 'in-app notifications only',
    reason:
      'Transactional email is useful for invites, receipts, follow-ups, and password flows.',
    estimatedCostBand: 'usage-based',
    hasFreeTier: true,
    confidence: 76,
    assumptions: ['The app needs emails beyond local demo notifications.'],
    budgetModes: ['lean', 'professional', 'growth'],
    signals: ['email', 'notifications', 'invites'],
  },
  {
    category: 'analytics',
    recommendedOption: 'Privacy-friendly product analytics',
    lowerCostAlternative: 'local dashboard metrics until launch',
    reason:
      'Usage analytics help validate whether users actually reach the core workflow.',
    estimatedCostBand: 'low',
    hasFreeTier: true,
    confidence: 72,
    assumptions: ['The product needs launch feedback and conversion visibility.'],
    budgetModes: ['professional', 'growth'],
    signals: ['analytics', 'dashboard', 'growth'],
  },
  {
    category: 'monitoring',
    recommendedOption: 'Error monitoring and uptime checks',
    lowerCostAlternative: 'Deployment Center production checks before release',
    reason:
      'Production apps need a way to notice broken builds, runtime errors, and failed user flows.',
    estimatedCostBand: 'low',
    hasFreeTier: true,
    confidence: 74,
    assumptions: ['The app will be used by real users after deployment.'],
    budgetModes: ['professional', 'growth'],
    signals: ['production', 'growth', 'monitoring'],
  },
  {
    category: 'ai-provider',
    recommendedOption: 'OpenAI API with guarded usage limits',
    lowerCostAlternative: 'mock AI responses until the workflow is validated',
    reason:
      'AI features should be gated by usage controls before launch to avoid unexpected spend.',
    estimatedCostBand: 'usage-based',
    hasFreeTier: false,
    confidence: 80,
    assumptions: ['The app needs summarization, chat, classification, or assistant features.'],
    budgetModes: ['lean', 'professional', 'growth'],
    signals: ['ai', 'assistant', 'chat', 'summaries'],
  },
  {
    category: 'background-jobs',
    recommendedOption: 'Managed scheduled jobs',
    lowerCostAlternative: 'manual refresh actions inside the app',
    reason:
      'Background jobs are helpful for reminders, digests, imports, and recurring sync.',
    estimatedCostBand: 'usage-based',
    hasFreeTier: true,
    confidence: 68,
    assumptions: ['The app has recurring reminders, imports, or async workflows.'],
    budgetModes: ['professional', 'growth'],
    signals: ['jobs', 'scheduled', 'reminders', 'sync'],
  },
  {
    category: 'compute',
    recommendedOption: 'Managed containers or serverless functions only when needed',
    lowerCostAlternative: 'Next.js server actions/API routes',
    reason:
      'Most generated apps should start with the Next.js runtime and add containers only for long-running work.',
    estimatedCostBand: 'medium',
    hasFreeTier: false,
    confidence: 70,
    assumptions: ['The app may need long-running tasks, workers, or custom runtimes later.'],
    budgetModes: ['growth'],
    signals: ['containers', 'workers', 'long-running', 'vm'],
  },
];

export function serviceRuleToRecommendation(
  rule: ArchitectServiceRecommendationRule
): ArchitectRecommendation {
  return {
    title: `${rule.category}: ${rule.recommendedOption}`,
    description: `${rule.reason} Lower-cost path: ${rule.lowerCostAlternative}. Cost band is an estimate: ${rule.estimatedCostBand}.`,
    confidence: rule.confidence,
    category:
      rule.category === 'database'
        ? 'database'
        : rule.category === 'authentication'
        ? 'auth'
        : rule.category === 'deployment'
        ? 'deployment'
        : rule.category === 'ai-provider'
        ? 'ai'
        : rule.category === 'billing'
        ? 'cost'
        : 'architecture',
  };
}
