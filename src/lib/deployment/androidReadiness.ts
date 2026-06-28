import type { ProductionCheckOverallStatus } from '@/lib/deployment/productionCheck';

export type AndroidReadinessStatus =
  | 'Not ready'
  | 'Needs production check'
  | 'Failed production check'
  | 'Ready to configure';

export interface AndroidReadinessInput {
  hasProjectFiles: boolean;
  framework: string;
  productionStatus: ProductionCheckOverallStatus;
}

export interface AndroidReadiness {
  status: AndroidReadinessStatus;
  message: string;
}

function isNextWebApp(framework: string): boolean {
  return /next\.?js|next/i.test(framework);
}

export function getAndroidReadiness(
  input: AndroidReadinessInput
): AndroidReadiness {
  if (!input.hasProjectFiles) {
    return {
      status: 'Not ready',
      message: 'Generate a web project before preparing Android export.',
    };
  }

  if (!isNextWebApp(input.framework)) {
    return {
      status: 'Not ready',
      message: 'Android export will start from a generated Next.js web app.',
    };
  }

  if (input.productionStatus === 'Passed') {
    return {
      status: 'Ready to configure',
      message:
        'Production checks passed. Android configuration will be available in the next mobile export step.',
    };
  }

  if (input.productionStatus === 'Failed') {
    return {
      status: 'Failed production check',
      message: 'Fix the failed production check before configuring Android.',
    };
  }

  return {
    status: 'Needs production check',
    message: 'Run the Production Build Check before configuring Android.',
  };
}
