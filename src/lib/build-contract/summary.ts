import type { BuildContract } from './types';

export interface BuildContractSummary {
  requirementCount: number;
  requiredCount: number;
  optionalCount: number;
  routeCount: number;
  dataModelCount: number;
  pendingCount: number;
  satisfiedCount: number;
}

export function summarizeBuildContract(
  contract: BuildContract
): BuildContractSummary {
  return {
    requirementCount: contract.requirements.length,
    requiredCount: contract.requirements.filter(
      (item) => item.status === 'required'
    ).length,
    optionalCount: contract.requirements.filter(
      (item) => item.status === 'optional'
    ).length,
    routeCount: contract.routes.length,
    dataModelCount: contract.dataModels.length,
    pendingCount: contract.requirements.filter(
      (item) => item.completionStatus === 'pending'
    ).length,
    satisfiedCount: contract.requirements.filter(
      (item) => item.completionStatus === 'satisfied'
    ).length,
  };
}
