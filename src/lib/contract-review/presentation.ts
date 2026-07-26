import type {
  ContractCompletionReport,
  ContractReviewReport,
} from './types';

export function createContractCompletionReport(
  report: ContractReviewReport
): ContractCompletionReport {
  const complete = report.completionAllowed;
  return {
    plainLanguage: {
      headline: complete
        ? 'The approved application requirements are satisfied.'
        : report.blockedRequirementIds.length > 0
          ? 'The build is waiting on an environmental or manual blocker.'
          : 'The build is working, but approved requirements still need attention.',
      complete,
      built: [...report.summary.whatWasBuilt],
      passed: [...report.summary.whatPassed],
      remaining: [...report.summary.whatRemains],
      blocked: [...report.summary.blockedEnvironmentalItems],
      manualSetup: [...report.summary.manualSetupSteps],
      deploymentReadiness: report.summary.deploymentReadiness,
    },
    technical: {
      contractId: report.contractId,
      contractVersion: report.contractVersion,
      repositoryFingerprint: report.repositoryFingerprint,
      buildValidationPassed: report.buildValidationPassed,
      completionAllowed: report.completionAllowed,
      requirements: report.requirementReports.map((requirement) => ({
        ...requirement,
        evidence: requirement.evidence.map((evidence) => ({ ...evidence })),
        relatedFiles: [...requirement.relatedFiles],
        relatedRoutes: [...requirement.relatedRoutes],
        relatedModels: [...requirement.relatedModels],
        relatedApis: [...requirement.relatedApis],
        recommendedRepairTask: requirement.recommendedRepairTask
          ? {
              ...requirement.recommendedRepairTask,
              capabilityIds: [...requirement.recommendedRepairTask.capabilityIds],
              sourceRequirementIds: [
                ...requirement.recommendedRepairTask.sourceRequirementIds,
              ],
              dependencies: [...requirement.recommendedRepairTask.dependencies],
              allowedFileScope: [
                ...requirement.recommendedRepairTask.allowedFileScope,
              ],
              expectedFiles: [...requirement.recommendedRepairTask.expectedFiles],
              expectedOutputs: [
                ...requirement.recommendedRepairTask.expectedOutputs,
              ],
              acceptanceChecks: [
                ...requirement.recommendedRepairTask.acceptanceChecks,
              ],
              validationCommands: [
                ...requirement.recommendedRepairTask.validationCommands,
              ],
              resultEvidence: [
                ...requirement.recommendedRepairTask.resultEvidence,
              ],
            }
          : undefined,
      })),
    },
  };
}
