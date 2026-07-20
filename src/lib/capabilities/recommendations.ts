import type { ArchitectBudgetMode } from '@/lib/matrix-ai-architect/types';
import type {
  CapabilityProviderRecommendation,
  CapabilityRecommendationCategory,
  ResolvedCapability,
} from './types';

interface RecommendationRule {
  category: CapabilityRecommendationCategory;
  capabilityIds: string[];
  budgetMode: ArchitectBudgetMode;
  recommendedOption: string;
  lowerCostAlternative: string;
  reason: string;
  estimatedCostBand: CapabilityProviderRecommendation['estimatedCostBand'];
  hasFreeTier: boolean;
  confidence: number;
  assumptions: string[];
}

const rules: RecommendationRule[] = [
  {
    category: 'database',
    capabilityIds: ['database'],
    budgetMode: 'free-first',
    recommendedOption: 'localStorage with typed storage helpers',
    lowerCostAlternative: 'Static demo data',
    reason: 'Free-first builds should avoid mandatory paid services when local persistence is enough for a prototype.',
    estimatedCostBand: 'free',
    hasFreeTier: true,
    confidence: 0.86,
    assumptions: ['Prototype data can live in the browser at first.'],
  },
  {
    category: 'database',
    capabilityIds: ['database', 'supabase-database'],
    budgetMode: 'lean',
    recommendedOption: 'Supabase Postgres',
    lowerCostAlternative: 'localStorage prototype mode',
    reason: 'Lean products usually benefit from managed persistence while preserving a low-cost starting path.',
    estimatedCostBand: 'low',
    hasFreeTier: true,
    confidence: 0.84,
    assumptions: ['The app needs shared data across devices or users.'],
  },
  {
    category: 'database',
    capabilityIds: ['database'],
    budgetMode: 'professional',
    recommendedOption: 'Supabase Postgres',
    lowerCostAlternative: 'Managed Postgres free tier',
    reason: 'Professional products should prefer managed persistence to reduce launch risk.',
    estimatedCostBand: 'low',
    hasFreeTier: true,
    confidence: 0.87,
    assumptions: ['Managed database operations are acceptable.'],
  },
  {
    category: 'database',
    capabilityIds: ['database'],
    budgetMode: 'growth',
    recommendedOption: 'Managed Postgres with backups and monitoring',
    lowerCostAlternative: 'Supabase Postgres',
    reason: 'Growth-stage apps should plan for operational readiness.',
    estimatedCostBand: 'moderate',
    hasFreeTier: false,
    confidence: 0.8,
    assumptions: ['Traffic or team usage may grow beyond a prototype.'],
  },
  {
    category: 'authentication',
    capabilityIds: ['authentication'],
    budgetMode: 'free-first',
    recommendedOption: 'Supabase Auth free-tier path',
    lowerCostAlternative: 'Local demo profile mode',
    reason: 'Auth can be planned without requiring paid identity infrastructure.',
    estimatedCostBand: 'free',
    hasFreeTier: true,
    confidence: 0.8,
    assumptions: ['A prototype may not need production user onboarding immediately.'],
  },
  {
    category: 'authentication',
    capabilityIds: ['authentication'],
    budgetMode: 'professional',
    recommendedOption: 'Supabase Auth or Clerk',
    lowerCostAlternative: 'Supabase Auth free-tier path',
    reason: 'Managed auth reduces risk around sessions, password handling, and account recovery.',
    estimatedCostBand: 'low',
    hasFreeTier: true,
    confidence: 0.82,
    assumptions: ['The product needs real users.'],
  },
  {
    category: 'deployment',
    capabilityIds: ['deployment-vercel'],
    budgetMode: 'free-first',
    recommendedOption: 'Vercel free-tier deployment path',
    lowerCostAlternative: 'Download ZIP for self-hosted testing',
    reason: 'Vercel is a good low-friction Next.js deployment target for early validation.',
    estimatedCostBand: 'free',
    hasFreeTier: true,
    confidence: 0.86,
    assumptions: ['The app is a standard Next.js web app.'],
  },
  {
    category: 'deployment',
    capabilityIds: ['deployment-vercel'],
    budgetMode: 'growth',
    recommendedOption: 'Vercel with production observability',
    lowerCostAlternative: 'Vercel free-tier deployment path',
    reason: 'Growth-stage projects need more deployment visibility and operational checks.',
    estimatedCostBand: 'moderate',
    hasFreeTier: true,
    confidence: 0.78,
    assumptions: ['Production usage is expected.'],
  },
  {
    category: 'file-storage',
    capabilityIds: ['file-storage'],
    budgetMode: 'free-first',
    recommendedOption: 'Browser-local file metadata for prototype',
    lowerCostAlternative: 'No upload persistence',
    reason: 'Local-only file metadata keeps prototype cost low before cloud storage is needed.',
    estimatedCostBand: 'free',
    hasFreeTier: true,
    confidence: 0.74,
    assumptions: ['Uploads do not need to sync across devices yet.'],
  },
  {
    category: 'file-storage',
    capabilityIds: ['file-storage'],
    budgetMode: 'professional',
    recommendedOption: 'Supabase Storage',
    lowerCostAlternative: 'Browser-local file metadata for prototype',
    reason: 'Managed object storage is appropriate when files must survive across devices.',
    estimatedCostBand: 'low',
    hasFreeTier: true,
    confidence: 0.8,
    assumptions: ['Uploaded media should persist beyond one browser.'],
  },
  {
    category: 'billing',
    capabilityIds: ['billing'],
    budgetMode: 'lean',
    recommendedOption: 'Stripe Checkout',
    lowerCostAlternative: 'Manual waitlist or payment-disabled launch',
    reason: 'Stripe is a common low-friction path for paid plans without custom payment handling.',
    estimatedCostBand: 'low',
    hasFreeTier: true,
    confidence: 0.82,
    assumptions: ['Payments are required for this product version.'],
  },
  {
    category: 'email',
    capabilityIds: ['transactional-email'],
    budgetMode: 'free-first',
    recommendedOption: 'Resend free-tier path',
    lowerCostAlternative: 'In-app notifications only',
    reason: 'Email can be added with a free-tier provider when user workflows require it.',
    estimatedCostBand: 'free',
    hasFreeTier: true,
    confidence: 0.76,
    assumptions: ['Email volume is low during prototype usage.'],
  },
  {
    category: 'analytics',
    capabilityIds: ['analytics'],
    budgetMode: 'free-first',
    recommendedOption: 'Local dashboard metrics',
    lowerCostAlternative: 'No external analytics',
    reason: 'Prototype analytics can start from app data without third-party tracking.',
    estimatedCostBand: 'free',
    hasFreeTier: true,
    confidence: 0.72,
    assumptions: ['External product analytics are not required yet.'],
  },
  {
    category: 'monitoring',
    capabilityIds: ['monitoring'],
    budgetMode: 'professional',
    recommendedOption: 'Managed error monitoring',
    lowerCostAlternative: 'Console-safe error boundaries',
    reason: 'Professional launches benefit from knowing when users hit runtime errors.',
    estimatedCostBand: 'low',
    hasFreeTier: true,
    confidence: 0.72,
    assumptions: ['The app will be used by real users.'],
  },
  {
    category: 'AI-provider',
    capabilityIds: ['text-ai-generation', 'image-ai-generation'],
    budgetMode: 'free-first',
    recommendedOption: 'Bring-your-own AI key with usage guardrails',
    lowerCostAlternative: 'Template-only generation mode',
    reason: 'AI usage should stay explicit and controllable for prototype budgets.',
    estimatedCostBand: 'low',
    hasFreeTier: false,
    confidence: 0.74,
    assumptions: ['AI calls may create usage-based costs.'],
  },
  {
    category: 'background-jobs',
    capabilityIds: ['background-jobs'],
    budgetMode: 'growth',
    recommendedOption: 'Managed queue or scheduled worker',
    lowerCostAlternative: 'Vercel scheduled functions where suitable',
    reason: 'Growth-stage background work should be observable and retryable.',
    estimatedCostBand: 'moderate',
    hasFreeTier: false,
    confidence: 0.76,
    assumptions: ['Jobs need retries or recurring execution.'],
  },
  {
    category: 'compute',
    capabilityIds: ['background-jobs'],
    budgetMode: 'growth',
    recommendedOption: 'Container or VM for long-running work',
    lowerCostAlternative: 'Serverless functions for short jobs',
    reason: 'Long-running processes need a different compute assumption than request/response routes.',
    estimatedCostBand: 'moderate',
    hasFreeTier: false,
    confidence: 0.68,
    assumptions: ['The job cannot complete inside normal serverless limits.'],
  },
];

function fallbackMode(mode?: ArchitectBudgetMode): ArchitectBudgetMode {
  return mode ?? 'lean';
}

export function recommendProviders(
  capabilities: ResolvedCapability[],
  budgetMode?: ArchitectBudgetMode
): CapabilityProviderRecommendation[] {
  const mode = fallbackMode(budgetMode);
  const capabilityIds = new Set(capabilities.map((capability) => capability.capabilityId));
  const recommendations = new Map<CapabilityRecommendationCategory, CapabilityProviderRecommendation>();

  for (const rule of rules) {
    if (rule.budgetMode !== mode) continue;
    if (!rule.capabilityIds.some((capabilityId) => capabilityIds.has(capabilityId))) continue;
    if (recommendations.has(rule.category)) continue;
    recommendations.set(rule.category, {
      category: rule.category,
      recommendedOption: rule.recommendedOption,
      lowerCostAlternative: rule.lowerCostAlternative,
      reason: rule.reason,
      estimatedCostBand: rule.estimatedCostBand,
      hasFreeTier: rule.hasFreeTier,
      confidence: rule.confidence,
      assumptions: [...rule.assumptions],
      relevantCapabilityIds: rule.capabilityIds.filter((capabilityId) =>
        capabilityIds.has(capabilityId)
      ),
    });
  }

  if (capabilityIds.has('database') && !recommendations.has('database')) {
    recommendations.set('database', {
      category: 'database',
      recommendedOption: mode === 'free-first' ? 'localStorage prototype mode' : 'Managed database',
      lowerCostAlternative: 'localStorage prototype mode',
      reason: 'The contract includes persistent data models.',
      estimatedCostBand: mode === 'free-first' ? 'free' : 'low',
      hasFreeTier: true,
      confidence: 0.7,
      assumptions: ['Specific provider can be selected later.'],
      relevantCapabilityIds: ['database'],
    });
  }

  return Array.from(recommendations.values()).sort((a, b) =>
    a.category.localeCompare(b.category)
  );
}
