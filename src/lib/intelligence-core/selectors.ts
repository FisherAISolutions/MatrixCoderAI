import type { BuildContract } from '@/lib/build-contract';
import type { RepositoryModel, RepositoryTaskContext } from '@/lib/repository-model';
import { getRepositoryContextForTask } from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';
import {
  INTELLIGENCE_CONTEXT_PACKET_VERSION,
  type IntelligenceBrainDomain,
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

export function createArchitectIntelligencePacket(
  core: MatrixIntelligenceCore,
  buildContract?: BuildContract | null,
  now = new Date()
): IntelligenceSummaryPacket {
  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'architect',
    projectId: core.projectId,
    summary:
      'Use approved user, product, and project decisions as structured planning context.',
    authoritativeRequirementIds: requiredRequirementIds(buildContract),
    relevantMemory: summaryRecords(core, ['project', 'product', 'user', 'conversation']),
    unresolvedConflicts: unresolvedConflicts(core),
    createdAt: nowIso(now),
  };
}

export function createBlueprintIntelligencePacket(
  core: MatrixIntelligenceCore,
  buildContract?: BuildContract | null,
  now = new Date()
): IntelligenceSummaryPacket {
  return {
    packetVersion: INTELLIGENCE_CONTEXT_PACKET_VERSION,
    kind: 'blueprint',
    projectId: core.projectId,
    summary:
      'Use newest explicit Blueprint decisions first and preserve unresolved conflicts for user review.',
    authoritativeRequirementIds: requiredRequirementIds(buildContract),
    relevantMemory: summaryRecords(core, ['project', 'product', 'engineering']),
    unresolvedConflicts: unresolvedConflicts(core),
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
