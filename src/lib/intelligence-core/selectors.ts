import type { BuildContract } from '@/lib/build-contract';
import type { CapabilityResolutionResult } from '@/lib/capabilities';
import type { RepositoryModel, RepositoryTaskContext } from '@/lib/repository-model';
import { getRepositoryContextForTask } from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';
import {
  INTELLIGENCE_CONTEXT_PACKET_VERSION,
  type IntelligenceBrainDomain,
  type IntelligenceArchitectContextPacket,
  type IntelligenceBlueprintContextPacket,
  type IntelligenceBlueprintDecisionSummary,
  type IntelligenceBlueprintPacketOptions,
  type IntelligenceBlueprintSourceSnapshot,
  type IntelligenceConflict,
  type IntelligenceMemoryRecord,
  type IntelligenceSummaryPacket,
  type IntelligenceTaskContextPacket,
  type IntelligenceTaskPacketOptions,
  type MatrixIntelligenceCore,
} from './types';
import {
  allIntelligenceRecords,
  taskHasEmptyRepositoryFoundation,
} from './core';

const DEFAULT_RECORD_LIMIT = 18;

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function textForRecord(record: IntelligenceMemoryRecord): string {
  return [
    record.domain,
    record.category,
    record.key,
    JSON.stringify(record.value),
    record.evidenceReferences.map((evidence) => evidence.ref).join(' '),
  ]
    .join(' ')
    .toLowerCase();
}

function taskSearchText(task: TaskGraphTask): string {
  return [
    task.id,
    task.title,
    task.description,
    task.category,
    task.assignedDiscipline,
    task.capabilityIds.join(' '),
    task.sourceRequirementIds.join(' '),
    task.expectedFiles.join(' '),
    task.expectedOutputs.join(' '),
    task.allowedFileScope.join(' '),
  ]
    .join(' ')
    .toLowerCase();
}

function relevantRecordsForTask(
  core: MatrixIntelligenceCore,
  task: TaskGraphTask,
  limit: number
): IntelligenceMemoryRecord[] {
  const search = taskSearchText(task);
  return allIntelligenceRecords(core)
    .filter(
      (record) =>
        !record.replacedBy &&
        record.status !== 'rejected' &&
        record.status !== 'expired'
    )
    .map((record) => {
      const text = textForRecord(record);
      let score =
        record.domain === 'project' ||
        (record.domain === 'product' &&
          ['summary', 'identity', 'constraint'].includes(record.category))
          ? 2
          : 0;
      if (record.domain === 'engineering') score += 2;
      if (record.domain === 'experience' && record.status === 'verified') score += 2;
      if (search.includes(record.key.toLowerCase())) score += 4;
      for (const token of search.split(/[^a-z0-9/_-]+/).filter((item) => item.length > 2)) {
        if (text.includes(token)) score += 1;
      }
      if (task.sourceRequirementIds.includes(record.key)) score += 4;
      return { record, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.record)
    .slice(0, limit);
}

function repositoryFacts(core: MatrixIntelligenceCore): IntelligenceMemoryRecord[] {
  return core.engineering.records.filter(
    (record) =>
      record.category === 'repository-fact' &&
      record.status === 'verified' &&
      !record.replacedBy
  );
}

function lessonsForTask(
  core: MatrixIntelligenceCore,
  task: TaskGraphTask
): IntelligenceMemoryRecord[] {
  const search = taskSearchText(task);
  return core.experience.records
    .filter((record) => record.status === 'verified' && record.category === 'lesson')
    .filter((record) => {
      const text = textForRecord(record);
      return task.capabilityIds.some((capability) =>
        text.includes(capability.toLowerCase())
      ) || search.split(/[^a-z0-9]+/).some((token) => token.length > 4 && text.includes(token));
    })
    .slice(0, 6);
}

function missingExpectedFiles(
  task: TaskGraphTask,
  repositoryModel?: RepositoryModel | null
): string[] {
  if (!repositoryModel) return task.expectedFiles.map(normalizePath);
  const existing = new Set(
    repositoryModel.files
      .filter((file) => file.readable && !file.missing)
      .map((file) => file.path)
  );
  return task.expectedFiles
    .map(normalizePath)
    .filter((path) => !existing.has(path));
}

function existingExpectedFiles(
  task: TaskGraphTask,
  repositoryModel?: RepositoryModel | null
): string[] {
  if (!repositoryModel) return [];
  const existing = new Set(
    repositoryModel.files
      .filter((file) => file.readable && !file.missing)
      .map((file) => file.path)
  );
  return task.expectedFiles
    .map(normalizePath)
    .filter((path) => existing.has(path));
}

function repositoryState(
  core: MatrixIntelligenceCore,
  repositoryModel?: RepositoryModel | null
): IntelligenceTaskContextPacket['repositoryState'] {
  if (!repositoryModel) return 'missing';
  const coreFingerprint =
    core.working.currentRepositoryFingerprint ??
    core.engineering.repositoryFingerprint;
  return coreFingerprint && coreFingerprint !== repositoryModel.repositoryFingerprint
    ? 'stale'
    : 'fresh';
}

function unresolvedAssumptions(
  task: TaskGraphTask,
  buildContract?: BuildContract | null
): string[] {
  const ids = new Set(task.sourceRequirementIds);
  return (
    buildContract?.requirements
      .filter(
        (requirement) =>
          ids.has(requirement.stableId) &&
          requirement.validationStrategy === 'manual-review'
      )
      .map(
        (requirement) =>
          `${requirement.stableId}: ${requirement.title} requires manual review evidence.`
      ) ?? []
  );
}

export function createTaskIntelligencePacket(
  core: MatrixIntelligenceCore,
  options: IntelligenceTaskPacketOptions
): IntelligenceTaskContextPacket {
  const { task, buildContract, repositoryModel } = options;
  const repositoryContext: RepositoryTaskContext | undefined =
    options.repositoryContext ??
    (repositoryModel ? getRepositoryContextForTask(task, repositoryModel) : undefined);
  const fullFileCreationRequired = taskHasEmptyRepositoryFoundation(
    task,
    repositoryModel
  );
  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'task',
    projectId: core.projectId,
    taskId: task.id,
    taskObjective: task.description || task.title,
    allowedPaths: unique(task.allowedFileScope.map(normalizePath)),
    protectedPaths: unique([
      ...core.engineering.protectedPaths.map(normalizePath),
      ...(repositoryContext?.filesToAvoidChanging ?? []),
    ]),
    buildContractRequirementIds: unique(task.sourceRequirementIds),
    repositoryFingerprint: repositoryModel?.repositoryFingerprint,
    repositoryState: repositoryState(core, repositoryModel),
    currentRepositoryFacts: repositoryFacts(core),
    relevantMemory: relevantRecordsForTask(
      core,
      task,
      options.includeRecordsLimit ?? DEFAULT_RECORD_LIMIT
    ),
    repositoryContext,
    expectedFiles: unique(task.expectedFiles.map(normalizePath)),
    expectedOutputs: [...task.expectedOutputs],
    missingExpectedFiles: fullFileCreationRequired
      ? []
      : missingExpectedFiles(task, repositoryModel),
    existingExpectedFiles: existingExpectedFiles(task, repositoryModel),
    validationCommands: [...task.validationCommands],
    unresolvedAssumptions: unresolvedAssumptions(task, buildContract),
    applicableLessons: lessonsForTask(core, task),
    fullFileCreationRequired,
    doNotValidateExpectedOutputsBeforeGeneration: fullFileCreationRequired,
    createdAt: nowIso(options.now),
  };
}

function summaryRecords(
  core: MatrixIntelligenceCore,
  domains: IntelligenceBrainDomain[]
): IntelligenceMemoryRecord[] {
  const domainSet = new Set(domains);
  return allIntelligenceRecords(core)
    .filter((record) => domainSet.has(record.domain))
    .filter((record) => !record.replacedBy && record.status !== 'rejected')
    .slice(0, 24);
}

function currentRecords(
  records: IntelligenceMemoryRecord[],
  limit = 12
): IntelligenceMemoryRecord[] {
  return records
    .filter((record) => !record.replacedBy && record.status !== 'expired')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

function recordsBy(
  records: IntelligenceMemoryRecord[],
  predicate: (record: IntelligenceMemoryRecord) => boolean,
  limit = 10
): IntelligenceMemoryRecord[] {
  return currentRecords(records.filter(predicate), limit);
}

function unresolvedConflicts(core: MatrixIntelligenceCore): IntelligenceConflict[] {
  return core.conflicts.filter((conflict) => conflict.status === 'unresolved');
}

function requiredRequirementIds(buildContract?: BuildContract | null): string[] {
  return (
    buildContract?.requirements
      .filter((requirement) => requirement.status === 'required')
      .map((requirement) => requirement.stableId) ?? []
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === 'string'
        ? item
        : item && typeof item === 'object' && 'title' in item
          ? String((item as { title?: unknown }).title ?? '')
          : ''
    )
    .map((item) => item.trim())
    .filter(Boolean);
}

function valuesFromRecords(records: IntelligenceMemoryRecord[]): string[] {
  return records.flatMap((record) => stringValues(record.value));
}

function newestRecordValue(
  records: IntelligenceMemoryRecord[],
  predicate: (record: IntelligenceMemoryRecord) => boolean
): string | undefined {
  return currentRecords(records.filter(predicate), 1)
    .map((record) => stringValue(record.value))
    .find(Boolean);
}

function blueprintDecisionSummary(
  options: IntelligenceBlueprintPacketOptions
): IntelligenceBlueprintDecisionSummary {
  const draft = options.blueprintDraft;
  return {
    routes: draft?.routes.map((route) => route.path).filter(Boolean) ?? [],
    dataModels: draft?.dataModels.map((model) => model.name).filter(Boolean) ?? [],
    components: draft?.components.map((item) => item.name).filter(Boolean) ?? [],
    integrations:
      draft?.integrations.map((item) => item.name).filter(Boolean) ?? [],
    roles: draft?.userRoles.map((item) => item.name).filter(Boolean) ?? [],
    navigation: draft?.navigation.map((item) => item.name).filter(Boolean) ?? [],
    folderStructure:
      draft?.folderStructure.map((item) => item.name).filter(Boolean) ?? [],
    deploymentTarget: draft?.deploymentTarget,
  };
}

function sourceSnapshots(
  options: IntelligenceBlueprintPacketOptions
): IntelligenceBlueprintSourceSnapshot[] {
  const { architectDraft, buildManifest, blueprintDraft, buildContract } = options;
  const snapshots: IntelligenceBlueprintSourceSnapshot[] = [];
  if (architectDraft) {
    snapshots.push({
      kind: 'architect',
      id: architectDraft.id,
      version: architectDraft.metadataVersion,
      updatedAt: architectDraft.updatedAt,
      label: 'Architect Draft',
    });
  }
  if (buildManifest) {
    snapshots.push({
      kind: 'build-manifest',
      version: buildManifest.metadataVersion,
      updatedAt: buildManifest.createdAt,
      label: 'Build Manifest',
    });
  }
  if (blueprintDraft) {
    snapshots.push({
      kind: 'blueprint',
      id: blueprintDraft.id,
      version: blueprintDraft.metadataVersion,
      updatedAt: blueprintDraft.updatedAt,
      label: 'Blueprint Draft',
    });
  }
  if (buildContract) {
    snapshots.push({
      kind: 'build-contract',
      id: buildContract.id,
      version: buildContract.contractVersion,
      updatedAt: buildContract.updatedAt,
      label: 'Build Contract',
    });
  }
  return snapshots;
}

function staleStateIndicators(
  options: IntelligenceBlueprintPacketOptions
): string[] {
  const out: string[] = [];
  const { architectDraft, blueprintDraft, buildContract, capabilityResolution } =
    options;

  if (
    architectDraft?.updatedAt &&
    blueprintDraft?.updatedAt &&
    Date.parse(blueprintDraft.updatedAt) > Date.parse(architectDraft.updatedAt)
  ) {
    out.push(
      'Blueprint Draft is newer than Architect Draft; do not overwrite Blueprint decisions from stale Architect data.'
    );
  }

  if (
    buildContract?.sourceBlueprintDraft?.updatedAt &&
    blueprintDraft?.updatedAt &&
    buildContract.sourceBlueprintDraft.updatedAt !== blueprintDraft.updatedAt
  ) {
    out.push(
      'Build Contract was derived from an older Blueprint Draft and should be regenerated before handoff.'
    );
  }

  if (
    capabilityResolution &&
    buildContract &&
    capabilityResolution.contractVersion !== buildContract.contractVersion
  ) {
    out.push(
      'Capability resolution targets an older Build Contract version and should be re-resolved.'
    );
  }

  return out;
}

function isBuildContract(value: unknown): value is BuildContract {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as BuildContract).requirements) &&
      typeof (value as BuildContract).contractVersion === 'number'
  );
}

function blueprintPacketOptions(
  input?: BuildContract | IntelligenceBlueprintPacketOptions | null,
  now?: Date
): IntelligenceBlueprintPacketOptions {
  if (!input) return { now };
  if (isBuildContract(input)) {
    return { buildContract: input, now };
  }
  return { ...input, now: input.now ?? now };
}

function capabilitySummary(result?: CapabilityResolutionResult | null) {
  if (!result) return undefined;
  return {
    requiredCapabilities: result.capabilities
      .filter((capability) => capability.status === 'required')
      .map((capability) => capability.capabilityId),
    optionalCapabilities: result.capabilities
      .filter((capability) => capability.status === 'optional')
      .map((capability) => capability.capabilityId),
    conflicts: result.conflicts.map((conflict) => conflict.explanation),
    warnings: result.warnings.map((warning) => warning.message),
  };
}

export function createArchitectIntelligencePacket(
  core: MatrixIntelligenceCore,
  buildContract?: BuildContract | null,
  now = new Date()
): IntelligenceArchitectContextPacket {
  const projectRecords = currentRecords(core.project.records, 10);
  const productRecords = recordsBy(
    core.product.records,
    (record) => record.status !== 'rejected',
    12
  );
  const userRecords = currentRecords(core.user.records, 8);
  const conversationRecords = currentRecords(core.conversation.records, 12);
  const workingRecords = currentRecords(core.working.records, 8);
  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'architect',
    projectId: core.projectId,
    summary:
      'Use approved user, product, and project decisions as structured planning context.',
    authoritativeRequirementIds: requiredRequirementIds(buildContract),
    relevantMemory: [
      ...projectRecords,
      ...productRecords,
      ...userRecords,
      ...conversationRecords,
      ...workingRecords,
    ].slice(0, 32),
    unresolvedConflicts: unresolvedConflicts(core),
    visionPrinciples: [
      core.vision.productMission,
      ...core.vision.operatingPrinciples,
      ...core.vision.qualityBar,
    ],
    projectContext: projectRecords,
    approvedProductDecisions: recordsBy(
      core.product.records,
      (record) =>
        record.status === 'approved' ||
        record.status === 'verified' ||
        record.userApproved,
      12
    ),
    userPreferences: userRecords,
    recentConversationDecisions: recordsBy(
      core.conversation.records,
      (record) =>
        record.category === 'decision' || record.category === 'summary',
      10
    ),
    unresolvedQuestions: recordsBy(
      core.conversation.records,
      (record) => record.category === 'temporary' && record.key.startsWith('unresolved-'),
      8
    ),
    rejectedRecommendations: recordsBy(
      core.conversation.records,
      (record) => record.status === 'rejected' || record.key.startsWith('rejected-'),
      8
    ),
    budgetConstraints: recordsBy(
      [...core.project.records, ...core.user.records],
      (record) =>
        record.key.includes('budget') ||
        record.key.includes('investment') ||
        record.key.includes('cost'),
      8
    ),
    readinessStage:
      (workingRecords.find((record) => record.key === 'readiness-status')
        ?.value as string | undefined) ?? 'discovering',
    assumptions: recordsBy(
      core.conversation.records,
      (record) => record.key.startsWith('assumption-'),
      8
    ).map((record) => String(record.value)),
    createdAt: nowIso(now),
  };
}

export function createBlueprintIntelligencePacket(
  core: MatrixIntelligenceCore,
  input?: BuildContract | IntelligenceBlueprintPacketOptions | null,
  now = new Date()
): IntelligenceBlueprintContextPacket {
  const options = blueprintPacketOptions(input, now);
  const buildContract = options.buildContract;
  const projectRecords = currentRecords(core.project.records, 10);
  const productRecords = currentRecords(core.product.records, 14);
  const userRecords = currentRecords(core.user.records, 10);
  const conversationRecords = currentRecords(core.conversation.records, 14);
  const workingRecords = currentRecords(core.working.records, 8);
  const approvedProductRecords = recordsBy(
    core.product.records,
    (record) =>
      record.status === 'approved' ||
      record.status === 'verified' ||
      record.userApproved,
    16
  );
  const rejectedRecords = recordsBy(
    [...core.product.records, ...core.user.records, ...core.conversation.records],
    (record) => record.status === 'rejected' || record.key.startsWith('rejected-'),
    12
  );
  const unresolvedQuestionRecords = recordsBy(
    [...core.conversation.records, ...core.working.records],
    (record) =>
      record.category === 'temporary' &&
      (record.key.startsWith('unresolved-') ||
        record.key.includes('question') ||
        record.key.includes('blocker')),
    12
  );
  const architectDraft = options.architectDraft;
  const contractSummary = buildContract
    ? {
        contractId: buildContract.id,
        contractVersion: buildContract.contractVersion,
        requiredRequirements: buildContract.requirements.filter(
          (requirement) => requirement.status === 'required'
        ).length,
        optionalRequirements: buildContract.requirements.filter(
          (requirement) => requirement.status === 'optional'
        ).length,
        updatedAt: buildContract.updatedAt,
      }
    : undefined;

  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'blueprint',
    projectId: core.projectId,
    summary:
      'Use newest explicit Blueprint decisions first and preserve unresolved conflicts for user review.',
    authoritativeRequirementIds: requiredRequirementIds(buildContract),
    relevantMemory: [
      ...projectRecords,
      ...productRecords,
      ...userRecords,
      ...conversationRecords,
      ...workingRecords,
    ].slice(0, 40),
    unresolvedConflicts: unresolvedConflicts(core),
    visionPrinciples: [
      core.vision.productMission,
      ...core.vision.operatingPrinciples,
      ...core.vision.qualityBar,
    ],
    projectPurpose:
      options.blueprintDraft?.appDescription ??
      architectDraft?.specification.applicationSummary ??
      newestRecordValue(productRecords, (record) =>
        ['application-description', 'application-summary'].includes(record.key)
      ),
    targetUsers:
      architectDraft?.answers.primaryUsers ||
      newestRecordValue(userRecords, (record) =>
        /user|audience|customer/.test(record.key)
      ),
    approvedFeatures: unique([
      ...valuesFromRecords(approvedProductRecords),
      ...(architectDraft?.answers.customRequirements
        ? [architectDraft.answers.customRequirements]
        : []),
    ]),
    rejectedFeatures: unique(valuesFromRecords(rejectedRecords)),
    deferredFeatures: unique(
      valuesFromRecords(
        recordsBy(
          [...core.product.records, ...core.conversation.records],
          (record) => record.key.includes('defer') || record.key.includes('later'),
          10
        )
      )
    ),
    budgetConstraints: unique([
      ...(architectDraft?.answers.investmentLevel
        ? [`Investment level: ${architectDraft.answers.investmentLevel}`]
        : []),
      ...valuesFromRecords(
        recordsBy(
          [...core.project.records, ...core.user.records],
          (record) =>
            record.key.includes('budget') ||
            record.key.includes('investment') ||
            record.key.includes('cost'),
          10
        )
      ),
      ...(buildContract?.constraints.filter((constraint) =>
        /free|cost|paid|managed|scale|budget|investment/i.test(constraint)
      ) ?? []),
    ]),
    userExperienceLevel: architectDraft?.conversation?.experienceLevel,
    preferredExplanationDepth: architectDraft?.conversation?.experienceLevel,
    providerPreferences: unique(
      valuesFromRecords(
        recordsBy(
          [...core.user.records, ...core.product.records],
          (record) =>
            record.key.includes('provider') ||
            record.key.includes('integration') ||
            record.key.includes('service'),
          12
        )
      )
    ),
    providerRejections: unique(
      valuesFromRecords(
        rejectedRecords.filter((record) =>
          /provider|integration|service|stripe|supabase|firebase|vercel|openai/i.test(
            record.key
          )
        )
      )
    ),
    privacyRequirements: unique(
      valuesFromRecords(
        recordsBy(
          [...core.project.records, ...core.product.records],
          (record) => /privacy|security|secret|ownership|rls/.test(record.key),
          10
        )
      )
    ),
    accessibilityRequirements: unique([
      ...(buildContract?.accessibilityExpectations.expectations ?? []),
      ...valuesFromRecords(
        recordsBy(
          [...core.product.records, ...core.user.records],
          (record) => /accessibility|a11y|keyboard|contrast/.test(record.key),
          10
        )
      ),
    ]),
    deploymentExpectations: unique([
      options.blueprintDraft?.deploymentTarget,
      architectDraft?.specification.recommendedDeployment,
      buildContract?.deploymentTarget,
    ].filter((item): item is string => Boolean(item))),
    unresolvedQuestions: unique(valuesFromRecords(unresolvedQuestionRecords)),
    approvedArchitectRecommendations:
      architectDraft?.conversation?.acceptedRecommendations.map(
        (recommendation) => recommendation.title
      ) ?? [],
    existingBlueprintDecisions: blueprintDecisionSummary(options),
    sourceVersions: sourceSnapshots(options),
    staleStateIndicators: staleStateIndicators(options),
    confidence: Math.min(
      1,
      Math.max(
        0,
        architectDraft?.specification.confidenceScore ??
          approvedProductRecords[0]?.confidence ??
          0.65
      )
    ),
    assumptions: unique([
      ...(architectDraft?.specification.recommendations.map(
        (recommendation) => recommendation.description
      ) ?? []),
      ...recordsBy(
        core.conversation.records,
        (record) => record.key.startsWith('assumption-'),
        8
      ).map((record) => String(record.value)),
    ]),
    contractSummary,
    capabilitySummary: capabilitySummary(options.capabilityResolution),
    createdAt: nowIso(now),
  };
}

export function createValidationIntelligencePacket(
  core: MatrixIntelligenceCore,
  buildContract?: BuildContract | null,
  now = new Date()
): IntelligenceSummaryPacket {
  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'validation',
    projectId: core.projectId,
    summary:
      'Validate against repository evidence and required Build Contract requirements; blocked checks do not pass.',
    authoritativeRequirementIds: requiredRequirementIds(buildContract),
    relevantMemory: summaryRecords(core, ['engineering', 'experience']),
    unresolvedConflicts: unresolvedConflicts(core),
    createdAt: nowIso(now),
  };
}

export function createChangePlanningIntelligencePacket(
  core: MatrixIntelligenceCore,
  buildContract?: BuildContract | null,
  now = new Date()
): IntelligenceSummaryPacket {
  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'change-planning',
    projectId: core.projectId,
    summary:
      'Plan changes by diffing approved intent against the current Build Contract and repository facts.',
    authoritativeRequirementIds: requiredRequirementIds(buildContract),
    relevantMemory: summaryRecords(core, [
      'project',
      'product',
      'conversation',
      'engineering',
    ]),
    unresolvedConflicts: unresolvedConflicts(core),
    createdAt: nowIso(now),
  };
}

export function createFinalReviewIntelligencePacket(
  core: MatrixIntelligenceCore,
  buildContract?: BuildContract | null,
  now = new Date()
): IntelligenceSummaryPacket {
  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'final-review',
    projectId: core.projectId,
    summary:
      'A build is complete only when required Build Contract items have evidence-backed satisfaction.',
    authoritativeRequirementIds: requiredRequirementIds(buildContract),
    relevantMemory: summaryRecords(core, ['engineering', 'experience', 'product']),
    unresolvedConflicts: unresolvedConflicts(core),
    createdAt: nowIso(now),
  };
}

export function createUserSummaryIntelligencePacket(
  core: MatrixIntelligenceCore,
  now = new Date()
): IntelligenceSummaryPacket {
  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'user-summary',
    projectId: core.projectId,
    summary:
      'Plain-language project memory summary for UI consumption without secrets or hidden prompts.',
    authoritativeRequirementIds: core.engineering.pendingRequirementIds,
    relevantMemory: summaryRecords(core, [
      'project',
      'product',
      'user',
      'engineering',
    ]),
    unresolvedConflicts: unresolvedConflicts(core),
    createdAt: nowIso(now),
  };
}
