import type { ProductionCheckOverallStatus } from '@/lib/deployment/productionCheck';

export type VercelReadinessStatus =
  | 'Not ready'
  | 'Ready to connect'
  | 'Needs production check'
  | 'Failed production check';

export interface VercelReadinessInput {
  hasProjectFiles: boolean;
  productionStatus: ProductionCheckOverallStatus;
}

export interface VercelReadiness {
  status: VercelReadinessStatus;
  message: string;
}

export function getVercelReadiness(
  input: VercelReadinessInput
): VercelReadiness {
  if (!input.hasProjectFiles) {
    return {
      status: 'Not ready',
      message: 'Generate a project before preparing Vercel deployment.',
    };
  }

  if (input.productionStatus === 'Passed') {
    return {
      status: 'Ready to connect',
      message:
        'Production checks passed. Vercel connection will be available in the next deployment step.',
    };
  }

  if (input.productionStatus === 'Failed') {
    return {
      status: 'Failed production check',
      message: 'Fix the failed production check before connecting Vercel.',
    };
  }

  return {
    status: 'Needs production check',
    message: 'Run the Production Build Check before connecting Vercel.',
  };
}
