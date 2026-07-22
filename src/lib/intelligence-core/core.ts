import type { BuildContractRequirement } from '@/lib/build-contract';
import type { RepositoryModel } from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';
import {
  INTELLIGENCE_BRAIN_DOMAINS,
  INTELLIGENCE_CORE_METADATA_VERSION,
  INTELLIGENCE_CORE_SCHEMA_VERSION,
  INTELLIGENCE_RECORD_SCHEMA_VERSION,
  VISION_BRAIN_VERSION,
  type AddIntelligenceRecordInput,
  type IntelligenceBrainDomain,
  type IntelligenceConflict,
  type IntelligenceCoreSources,
  type IntelligenceDecisionResolution,
  type IntelligenceMemoryCategory,
  type IntelligenceMemoryRecord,
  type IntelligenceMemoryStatus,
  type IntelligenceSourceKind,
  type JsonValue,
  type MatrixIntelligenceCore,
  type ResolveIntelligenceDecisionOptions,
} from './types';
import { sanitizeIntelligenceRecord } from './redaction';

const CURRENT_RECORD_STATUSES = new Set<IntelligenceMemoryStatus>([
  'approved',
  'verified',
  'proposed',
  'inferred',
]);

const SOURCE_PRECEDENCE: Record<IntelligenceSourceKind, number> = {
  'user-correction': 100,
  'user-approved': 90,
  blueprint: 80,
  architect: 70,
  'build-contract': 60,
  repository: 50,
  experience: 40,
  'build-manifest': 30,
  'safe-default': 10,
  conversation: 65,
  working: 5,
};

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function stableSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function stableRecordId(
  domain: IntelligenceBrainDomain,
  category: IntelligenceMemoryCategory,
  key: string,
  sourceKind: IntelligenceSourceKind
): string {
  return `intel:${domain}:${category}:${stableSlug(key) || 'record'}:${sourceKind}`;
}

function stableConflictId(
  domain: IntelligenceBrainDomain,
  category: IntelligenceMemoryCategory,
  key: string
): string {
  return `conflict:${domain}:${category}:${stableSlug(key) || 'record'}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeConfidence(value: unknown, fallback = 0.65): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function recordsForDomain(
  core: MatrixIntelligenceCore,
  domain: IntelligenceBrainDomain
): IntelligenceMemoryRecord[] {
  return core[domain].records;
}

function replaceRecordsForDomain(
  core: MatrixIntelligenceCore,
  domain: IntelligenceBrainDomain,
  records: IntelligenceMemoryRecord[]
): MatrixIntelligenceCore {
  return {
    ...core,
    [domain]: {
      ...core[domain],
      records,
    },
  };
}

function requirementRecord(requirement: BuildContractRequirement): AddIntelligenceRecordInput {
  return {
    domain: 'engineering',
    category: 'requirement',
    key: requirement.stableId,
    value: {
      title: requirement.title,
      description: requirement.description,
      type: requirement.type,
      status: requirement.status,
      validationStrategy: requirement.validationStrategy,
      completionStatus: requirement.completionStatus,
    },
    source: {
      kind: 'build-contract',
      id: requirement.stableId,
    },
    status:
      requirement.completionStatus === 'satisfied' ? 'verified' : 'approved',
    confidence: 1,
    validationStrategy: 'contract-evidence',
    evidenceReferences: requirement.evidenceReferences.map((evidence) => ({
      kind:
        evidence.kind === 'source'
          ? 'note'
          : evidence.kind === 'model'
            ? 'model'
            : evidence.kind,
      ref: evidence.ref,
      description: evidence.description,
    })),
  };
}

function repositoryRecords(repositoryModel: RepositoryModel): AddIntelligenceRecordInput[] {
  return [
    {
      domain: 'engineering',
      category: 'repository-fact',
      key: 'repository-fingerprint',
      value: repositoryModel.repositoryFingerprint,
      source: { kind: 'repository', id: repositoryModel.id },
      status: 'verified',
      confidence: 1,
      validationStrategy: 'repository-evidence',
      evidenceReferences: [
        {
          kind: 'repository-fingerprint',
          ref: repositoryModel.repositoryFingerprint,
        },
      ],
    },
    {
      domain: 'engineering',
      category: 'repository-fact',
      key: 'routes',
      value: repositoryModel.routes.map((route) => route.path),
      source: { kind: 'repository', id: repositoryModel.id },
      status: 'verified',
      confidence: 1,
      validationStrategy: 'repository-evidence',
      evidenceReferences: repositoryModel.routes.map((route) => ({
        kind: 'route',
        ref: route.path,
        description: route.filePath,
      })),
    },
    {
      domain: 'engineering',
      category: 'repository-fact',
      key: 'protected-paths',
      value: repositoryModel.protectedFiles,
      source: { kind: 'repository', id: repositoryModel.id },
      status: 'verified',
      confidence: 1,
      validationStrategy: 'repository-evidence',
    },
  ];
}

function sourceRecords(options: IntelligenceCoreSources): AddIntelligenceRecordInput[] {
  const records: AddIntelligenceRecordInput[] = [];
  const { architectDraft, buildManifest, blueprintDraft, buildContract } = options;

  if (buildManifest?.appType) {
    records.push({
      domain: 'product',
      category: 'identity',
      key: 'app-type',
      value: buildManifest.appType.label,
      source: {
        kind: 'build-manifest',
        id: buildManifest.appType.id,
        version: buildManifest.metadataVersion,
        updatedAt: buildManifest.createdAt,
      },
      status: 'approved',
      confidence: 0.72,
    });
  }

  if (architectDraft) {
    records.push(
      {
        domain: 'product',
        category: 'summary',
        key: 'application-summary',
        value: architectDraft.specification.applicationSummary,
        source: {
          kind: 'architect',
          id: architectDraft.id,
          version: architectDraft.metadataVersion,
          updatedAt: architectDraft.updatedAt,
        },
        status: 'approved',
        confidence: architectDraft.specification.confidenceScore,
      },
      {
        domain: 'project',
        category: 'constraint',
        key: 'investment-level',
        value: architectDraft.answers.investmentLevel,
        source: {
          kind: 'architect',
          id: architectDraft.id,
          version: architectDraft.metadataVersion,
          updatedAt: architectDraft.updatedAt,
        },
        status: 'approved',
        confidence: 0.9,
      },
      {
        domain: 'product',
        category: 'architecture',
        key: 'recommended-architecture',
        value: architectDraft.specification.recommendedArchitecture,
        source: {
          kind: 'architect',
          id: architectDraft.id,
          version: architectDraft.metadataVersion,
          updatedAt: architectDraft.updatedAt,
        },
        status: 'approved',
        confidence: architectDraft.specification.confidenceScore,
      }
    );
  }

  if (blueprintDraft) {
    records.push(
      {
        domain: 'project',
        category: 'identity',
        key: 'project-name',
        value: blueprintDraft.projectName,
        source: {
          kind: 'blueprint',
          id: blueprintDraft.id,
          version: blueprintDraft.metadataVersion,
          updatedAt: blueprintDraft.updatedAt,
        },
        status: 'approved',
        confidence: 0.95,
        userApproved: true,
      },
      {
        domain: 'product',
        category: 'summary',
        key: 'application-description',
        value: blueprintDraft.appDescription,
        source: {
          kind: 'blueprint',
          id: blueprintDraft.id,
          version: blueprintDraft.metadataVersion,
          updatedAt: blueprintDraft.updatedAt,
        },
        status: 'approved',
        confidence: 0.95,
        userApproved: true,
      },
      {
        domain: 'product',
        category: 'requirement',
        key: 'routes',
        value: blueprintDraft.routes.map((route) => route.path),
        source: {
          kind: 'blueprint',
          id: blueprintDraft.id,
          version: blueprintDraft.metadataVersion,
          updatedAt: blueprintDraft.updatedAt,
        },
        status: 'approved',
        confidence: 0.95,
        userApproved: true,
        evidenceReferences: blueprintDraft.routes.map((route) => ({
          kind: 'route',
          ref: route.path,
          description: route.name,
        })),
      }
    );
  }

  if (buildContract) {
    records.push(
      {
        domain: 'engineering',
        category: 'summary',
        key: 'build-contract-authoritative',
        value: {
          id: buildContract.id,
          version: buildContract.contractVersion,
          requiredRequirementIds: buildContract.requirements
            .filter((requirement) => requirement.status === 'required')
            .map((requirement) => requirement.stableId),
        },
        source: {
          kind: 'build-contract',
          id: buildContract.id,
          version: buildContract.contractVersion,
          updatedAt: buildContract.updatedAt,
        },
        status: 'approved',
        confidence: 1,
        validationStrategy: 'contract-evidence',
      },
      ...buildContract.requirements.map(requirementRecord)
    );
  }

  if (options.repositoryModel) {
    records.push(...repositoryRecords(options.repositoryModel));
  }

  return records;
}

export function createEmptyIntelligenceCore(
  projectId: string,
  now = new Date()
): MatrixIntelligenceCore {
  const timestamp = nowIso(now);
  return {
    schemaVersion: INTELLIGENCE_CORE_SCHEMA_VERSION,
    metadataVersion: INTELLIGENCE_CORE_METADATA_VERSION,
    id: `intelligence-core:${projectId}`,
    projectId,
    vision: {
      version: VISION_BRAIN_VERSION,
      productMission:
        'Help users turn approved product intent into reliable, inspectable software without losing context.',
      operatingPrinciples: [
        'Structured decisions are more authoritative than loose transcript text.',
        'The workspace and project snapshot remain the source of truth.',
        'Engineering context should be relevant, bounded, and evidence-backed.',
        'Do not persist secrets, raw media payloads, hidden prompts, or live runtime handles.',
      ],
      qualityBar: [
        'Required Build Contract items define build completion.',
        'Generated work must be recoverable after refresh and project switching.',
        'Validated repository evidence beats assumptions.',
      ],
      records: [],
    },
    project: { records: [] },
    product: { records: [] },
    user: { records: [] },
    conversation: { records: [] },
    working: { records: [] },
    engineering: {
      records: [],
      completedRequirementIds: [],
      pendingRequirementIds: [],
      failedTaskIds: [],
      blockedTaskIds: [],
      protectedPaths: [],
    },
    experience: { records: [], verifiedLessonIds: [] },
    conflicts: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function addIntelligenceRecord(
  core: MatrixIntelligenceCore,
  input: AddIntelligenceRecordInput
): MatrixIntelligenceCore {
  const now = input.now ?? new Date();
  const timestamp = nowIso(now);
  const stableId =
    input.source.kind === 'user-correction'
      ? `${stableRecordId(input.domain, input.category, input.key, input.source.kind)}:${now.getTime()}`
      : stableRecordId(
          input.domain,
          input.category,
          input.key,
          input.source.kind
        );
  const existingRecords = recordsForDomain(core, input.domain);
  const supersedes =
    input.supersedes ??
    (input.source.kind === 'user-correction'
      ? existingRecords
          .filter(
            (record) =>
              record.category === input.category &&
              record.key === input.key &&
              !record.replacedBy
          )
          .map((record) => record.stableId)
      : []);

  const nextRecord = sanitizeIntelligenceRecord({
    schemaVersion: INTELLIGENCE_RECORD_SCHEMA_VERSION,
    stableId,
    domain: input.domain,
    category: input.category,
    key: input.key,
    value: input.value,
    source: input.source,
    confidence: normalizeConfidence(input.confidence),
    status:
      input.status ??
      (input.userApproved ? 'approved' : input.source.kind === 'repository' ? 'verified' : 'inferred'),
    userApproved:
      input.userApproved === true ||
      input.source.kind === 'user-approved' ||
      input.source.kind === 'user-correction',
    sensitivity: input.sensitivity ?? 'internal',
    validationStrategy: input.validationStrategy ?? 'none',
    evidenceReferences: input.evidenceReferences ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
    supersedes: supersedes.length ? supersedes : undefined,
    expiresAt: input.expiresAt,
  });

  const nextRecords = existingRecords
    .filter((record) => record.stableId !== nextRecord.stableId)
    .map((record) =>
      supersedes.includes(record.stableId)
        ? {
            ...record,
            status: 'superseded' as const,
            replacedBy: nextRecord.stableId,
            updatedAt: timestamp,
          }
        : record
    );

  return detectIntelligenceConflicts({
    ...replaceRecordsForDomain(core, input.domain, [...nextRecords, nextRecord]),
    updatedAt: timestamp,
  });
}

export function createIntelligenceCore(
  options: IntelligenceCoreSources
): MatrixIntelligenceCore {
  const now = options.now ?? new Date();
  let core =
    options.existingCore ??
    createEmptyIntelligenceCore(options.projectId, now);
  core = {
    ...core,
    projectId: options.projectId,
    engineering: {
      ...core.engineering,
      buildContractId:
        options.buildContract?.id ?? core.engineering.buildContractId,
      buildContractVersion:
        options.buildContract?.contractVersion ??
        core.engineering.buildContractVersion,
      taskGraphId: options.taskGraph?.id ?? core.engineering.taskGraphId,
      repositoryFingerprint:
        options.repositoryModel?.repositoryFingerprint ??
        core.engineering.repositoryFingerprint,
      completedRequirementIds:
        options.engineeringMemory?.completedRequirementIds ??
        options.buildContract?.requirements
          .filter((requirement) => requirement.completionStatus === 'satisfied')
          .map((requirement) => requirement.stableId) ??
        core.engineering.completedRequirementIds,
      pendingRequirementIds:
        options.buildContract?.requirements
          .filter((requirement) => requirement.completionStatus === 'pending')
          .map((requirement) => requirement.stableId) ??
        core.engineering.pendingRequirementIds,
      failedTaskIds:
        options.taskGraph?.tasks
          .filter((task) => task.status === 'failed')
          .map((task) => task.id) ?? core.engineering.failedTaskIds,
      blockedTaskIds:
        options.taskGraph?.tasks
          .filter((task) => task.status === 'blocked')
          .map((task) => task.id) ?? core.engineering.blockedTaskIds,
      protectedPaths:
        options.repositoryModel?.protectedFiles ?? core.engineering.protectedPaths,
    },
    working: {
      ...core.working,
      currentRepositoryFingerprint:
        options.repositoryModel?.repositoryFingerprint ??
        core.working.currentRepositoryFingerprint,
    },
  };

  for (const record of sourceRecords(options)) {
    core = addIntelligenceRecord(core, { ...record, now });
  }

  return detectIntelligenceConflicts({
    ...core,
    updatedAt: nowIso(now),
  });
}

export function applyWorkingState(
  core: MatrixIntelligenceCore,
  input: {
    activeTaskId?: string;
    activeRunId?: string;
    currentRepositoryFingerprint?: string;
    summary?: string;
    now?: Date;
  }
): MatrixIntelligenceCore {
  const now = input.now ?? new Date();
  let next: MatrixIntelligenceCore = {
    ...core,
    working: {
      ...core.working,
      activeTaskId: input.activeTaskId ?? core.working.activeTaskId,
      activeRunId: input.activeRunId ?? core.working.activeRunId,
      currentRepositoryFingerprint:
        input.currentRepositoryFingerprint ??
        core.working.currentRepositoryFingerprint,
    },
    updatedAt: nowIso(now),
  };

  if (input.summary) {
    next = addIntelligenceRecord(next, {
      domain: 'working',
      category: 'temporary',
      key: 'active-summary',
      value: input.summary,
      source: { kind: 'working', id: input.activeRunId },
      status: 'inferred',
      confidence: 0.5,
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60).toISOString(),
      now,
    });
  }

  return next;
}

export function recordVerifiedExperienceLesson(
  core: MatrixIntelligenceCore,
  input: {
    lessonId: string;
    title: string;
    description: string;
    evidenceReferences: IntelligenceMemoryRecord['evidenceReferences'];
    confidence?: number;
    now?: Date;
  }
): MatrixIntelligenceCore {
  if (input.evidenceReferences.length === 0) {
    throw new Error('Verified experience lessons require evidence.');
  }
  const next = addIntelligenceRecord(core, {
    domain: 'experience',
    category: 'lesson',
    key: input.lessonId,
    value: {
      title: input.title,
      description: input.description,
    },
    source: { kind: 'experience', id: input.lessonId },
    status: 'verified',
    confidence: input.confidence ?? 0.8,
    validationStrategy: 'repository-evidence',
    evidenceReferences: input.evidenceReferences,
    now: input.now,
  });
  const lessonIds = new Set(next.experience.verifiedLessonIds);
  lessonIds.add(input.lessonId);
  return {
    ...next,
    experience: {
      ...next.experience,
      verifiedLessonIds: Array.from(lessonIds).sort(),
    },
  };
}

export function allIntelligenceRecords(
  core: MatrixIntelligenceCore
): IntelligenceMemoryRecord[] {
  return INTELLIGENCE_BRAIN_DOMAINS.flatMap((domain) =>
    recordsForDomain(core, domain)
  );
}

function precedenceRank(record: IntelligenceMemoryRecord): number {
  const sourceRank = SOURCE_PRECEDENCE[record.source.kind] ?? 0;
  const approvalBoost = record.userApproved ? 4 : 0;
  const statusBoost = record.status === 'verified' ? 3 : record.status === 'approved' ? 2 : 0;
  return sourceRank + approvalBoost + statusBoost + record.confidence;
}

export function resolveIntelligenceDecision(
  core: MatrixIntelligenceCore,
  options: ResolveIntelligenceDecisionOptions
): IntelligenceDecisionResolution {
  const candidates = allIntelligenceRecords(core).filter(
    (record) =>
      record.key === options.key &&
      (!options.domain || record.domain === options.domain) &&
      (!options.category || record.category === options.category) &&
      !record.replacedBy &&
      CURRENT_RECORD_STATUSES.has(record.status)
  );
  const sorted = [...candidates].sort((a, b) => {
    const rank = precedenceRank(b) - precedenceRank(a);
    if (rank !== 0) return rank;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
  const top = sorted[0];
  const conflicted = Boolean(
    top &&
      sorted
        .slice(1)
        .some(
          (record) =>
            Math.abs(precedenceRank(record) - precedenceRank(top)) < 5 &&
            !jsonEqual(record.value, top.value)
        )
  );
  return {
    record: top,
    precedenceRank: top ? precedenceRank(top) : 0,
    conflicted,
  };
}

export function detectIntelligenceConflicts(
  core: MatrixIntelligenceCore
): MatrixIntelligenceCore {
  const conflicts: IntelligenceConflict[] = [];
  for (const domain of INTELLIGENCE_BRAIN_DOMAINS) {
    const current = recordsForDomain(core, domain).filter(
      (record) =>
        !record.replacedBy &&
        record.status !== 'superseded' &&
        record.status !== 'rejected' &&
        record.status !== 'expired'
    );
    const groups = new Map<string, IntelligenceMemoryRecord[]>();
    for (const record of current) {
      const key = `${record.category}\n${record.key}`;
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    for (const [groupKey, records] of groups) {
      if (records.length < 2) continue;
      const [category, key] = groupKey.split('\n') as [
        IntelligenceMemoryCategory,
        string,
      ];
      const approvedRecords = records.filter((record) =>
        ['approved', 'verified'].includes(record.status)
      );
      const hasConflict = approvedRecords.some((record) =>
        approvedRecords.some(
          (other) =>
            record.stableId !== other.stableId &&
            !jsonEqual(record.value, other.value) &&
            Math.abs(precedenceRank(record) - precedenceRank(other)) < 5
        )
      );
      if (!hasConflict) continue;
      conflicts.push({
        id: stableConflictId(domain, category, key),
        domain,
        category,
        key,
        recordIds: approvedRecords.map((record) => record.stableId).sort(),
        reason: `Multiple approved ${domain}/${category} records disagree for ${key}.`,
        status: 'unresolved',
        createdAt: core.updatedAt,
      });
    }
  }

  const previousResolved = new Map(
    core.conflicts
      .filter((conflict) => conflict.status !== 'unresolved')
      .map((conflict) => [conflict.id, conflict])
  );
  return {
    ...core,
    conflicts: [
      ...conflicts.map((conflict) => previousResolved.get(conflict.id) ?? conflict),
      ...Array.from(previousResolved.values()).filter(
        (conflict) => !conflicts.some((item) => item.id === conflict.id)
      ),
    ],
  };
}

export function resolveIntelligenceConflict(
  core: MatrixIntelligenceCore,
  conflictId: string,
  resolutionRecordId: string,
  now = new Date()
): MatrixIntelligenceCore {
  return {
    ...core,
    conflicts: core.conflicts.map((conflict) =>
      conflict.id === conflictId
        ? {
            ...conflict,
            status: 'resolved',
            resolutionRecordId,
            resolvedAt: nowIso(now),
          }
        : conflict
    ),
    updatedAt: nowIso(now),
  };
}

export function cloneIntelligenceCoreForProject(
  core: MatrixIntelligenceCore,
  projectId: string,
  now = new Date()
): MatrixIntelligenceCore {
  const timestamp = nowIso(now);
  return {
    ...clone(core),
    id: `intelligence-core:${projectId}`,
    projectId,
    working: {
      records: [],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function taskHasEmptyRepositoryFoundation(
  task: TaskGraphTask,
  repositoryModel?: RepositoryModel | null
): boolean {
  return (
    task.category === 'foundation' &&
    (!repositoryModel || repositoryModel.files.filter((file) => !file.missing).length === 0)
  );
}
