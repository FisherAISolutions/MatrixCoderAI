import {
  CONTRACT_REVIEW_METADATA_VERSION,
  CONTRACT_REVIEW_SCHEMA_VERSION,
  type ContractReviewReport,
  type ContractReviewRequirementStatus,
} from './types';

const REQUIREMENT_STATUSES = new Set<ContractReviewRequirementStatus>([
  'satisfied',
  'partially satisfied',
  'missing',
  'failed validation',
  'blocked',
  'manually review',
]);

export function serializeContractReviewReport(
  report: ContractReviewReport
): string {
  return JSON.stringify(report);
}

export function deserializeContractReviewReport(
  raw: string
): ContractReviewReport | null {
  try {
    const value = JSON.parse(raw) as Partial<ContractReviewReport>;
    if (
      value.schemaVersion !== CONTRACT_REVIEW_SCHEMA_VERSION ||
      value.metadataVersion !== CONTRACT_REVIEW_METADATA_VERSION ||
      typeof value.id !== 'string' ||
      typeof value.projectName !== 'string' ||
      typeof value.contractId !== 'string' ||
      typeof value.contractVersion !== 'number' ||
      typeof value.repositoryFingerprint !== 'string' ||
      typeof value.generatedAt !== 'string' ||
      typeof value.buildValidationPassed !== 'boolean' ||
      typeof value.completionAllowed !== 'boolean' ||
      !Array.isArray(value.requirementReports) ||
      value.requirementReports.some(
        (item) =>
          !item ||
          typeof item.requirementId !== 'string' ||
          typeof item.status !== 'string' ||
          !REQUIREMENT_STATUSES.has(item.status)
      ) ||
      !value.summary ||
      typeof value.summary !== 'object'
    ) {
      return null;
    }

    return value as ContractReviewReport;
  } catch {
    return null;
  }
}
