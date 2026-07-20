import {
  BUILD_CONTRACT_METADATA_VERSION,
  BUILD_CONTRACT_SCHEMA_VERSION,
  type BuildContract,
  type BuildContractRequirement,
} from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function safeRequirements(value: unknown): BuildContractRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BuildContractRequirement => {
    if (!isObject(item)) return false;
    return (
      typeof item.stableId === 'string' &&
      typeof item.type === 'string' &&
      typeof item.title === 'string' &&
      typeof item.description === 'string' &&
      (item.status === 'required' || item.status === 'optional') &&
      typeof item.source === 'string' &&
      typeof item.validationStrategy === 'string' &&
      typeof item.completionStatus === 'string' &&
      Array.isArray(item.evidenceReferences)
    );
  });
}

export function serializeBuildContract(contract: BuildContract): string {
  return JSON.stringify(contract);
}

export function deserializeBuildContract(raw: string): BuildContract | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BuildContract>;
    if (
      parsed.schemaVersion !== BUILD_CONTRACT_SCHEMA_VERSION ||
      parsed.metadataVersion !== BUILD_CONTRACT_METADATA_VERSION ||
      typeof parsed.id !== 'string' ||
      !parsed.project ||
      typeof parsed.project.projectName !== 'string' ||
      typeof parsed.projectSummary !== 'string' ||
      typeof parsed.targetFramework !== 'string' ||
      !Array.isArray(parsed.routes) ||
      !Array.isArray(parsed.dataModels) ||
      typeof parsed.authentication !== 'string' ||
      typeof parsed.deploymentTarget !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }

    return {
      schemaVersion: BUILD_CONTRACT_SCHEMA_VERSION,
      metadataVersion: BUILD_CONTRACT_METADATA_VERSION,
      contractVersion:
        typeof parsed.contractVersion === 'number' && Number.isFinite(parsed.contractVersion)
          ? parsed.contractVersion
          : 1,
      id: parsed.id,
      project: parsed.project,
      projectSummary: parsed.projectSummary,
      sourceArchitectDraft: parsed.sourceArchitectDraft,
      sourceBuildManifest: parsed.sourceBuildManifest,
      sourceBlueprintDraft: parsed.sourceBlueprintDraft,
      targetFramework: parsed.targetFramework,
      routes: parsed.routes,
      layouts: stringArray(parsed.layouts),
      navigation: stringArray(parsed.navigation),
      dataModels: parsed.dataModels,
      relationships: stringArray(parsed.relationships),
      authentication: parsed.authentication,
      rolesAndPermissions: stringArray(parsed.rolesAndPermissions),
      apis: Array.isArray(parsed.apis) ? parsed.apis : [],
      integrations: stringArray(parsed.integrations),
      aiCapabilities: stringArray(parsed.aiCapabilities),
      storageRequirements: stringArray(parsed.storageRequirements),
      billingRequirements: stringArray(parsed.billingRequirements),
      backgroundJobs: stringArray(parsed.backgroundJobs),
      environmentVariableNames: stringArray(parsed.environmentVariableNames),
      deploymentTarget: parsed.deploymentTarget,
      visualRequirements:
        parsed.visualRequirements ?? { source: 'platform-default' },
      responsiveRequirements:
        parsed.responsiveRequirements ?? {
          mobileSupport: ['responsive-web'],
          expectations: ['Primary workflows must work on desktop and mobile widths.'],
          source: 'platform-default',
        },
      accessibilityExpectations:
        parsed.accessibilityExpectations ?? {
          expectations: ['Interactive controls should be accessible.'],
          source: 'platform-default',
        },
      acceptanceCriteria: stringArray(parsed.acceptanceCriteria),
      constraints: stringArray(parsed.constraints),
      optionalCapabilities: stringArray(parsed.optionalCapabilities),
      requiredCapabilities: stringArray(parsed.requiredCapabilities),
      requirements: safeRequirements(parsed.requirements),
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
    } as BuildContract;
  } catch {
    return null;
  }
}
