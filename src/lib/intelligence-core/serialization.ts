import {
  INTELLIGENCE_BRAIN_DOMAINS,
  INTELLIGENCE_CORE_METADATA_VERSION,
  INTELLIGENCE_CORE_SCHEMA_VERSION,
  INTELLIGENCE_RECORD_SCHEMA_VERSION,
  VISION_BRAIN_VERSION,
  type IntelligenceBrainDomain,
  type IntelligenceMemoryCategory,
  type IntelligenceMemoryRecord,
  type IntelligenceMemoryStatus,
  type IntelligenceSensitivity,
  type IntelligenceSourceKind,
  type IntelligenceValidationStrategy,
  type JsonValue,
  type MatrixIntelligenceCore,
} from './types';
import { createEmptyIntelligenceCore } from './core';
import { sanitizeIntelligenceRecord } from './redaction';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function safeJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(safeJsonValue);
  if (!isObject(value)) return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, safeJsonValue(entry)])
  );
}

function safeDomain(value: unknown): IntelligenceBrainDomain | null {
  return INTELLIGENCE_BRAIN_DOMAINS.includes(value as IntelligenceBrainDomain)
    ? (value as IntelligenceBrainDomain)
    : null;
}

function safeCategory(value: unknown): IntelligenceMemoryCategory {
  return [
    'identity',
    'goal',
    'requirement',
    'decision',
    'constraint',
    'preference',
    'architecture',
    'capability',
    'repository-fact',
    'task-state',
    'validation',
    'lesson',
    'temporary',
    'summary',
  ].includes(String(value))
    ? (value as IntelligenceMemoryCategory)
    : 'summary';
}

function safeStatus(value: unknown): IntelligenceMemoryStatus {
  return [
    'inferred',
    'proposed',
    'approved',
    'verified',
    'rejected',
    'superseded',
    'expired',
    'conflict',
  ].includes(String(value))
    ? (value as IntelligenceMemoryStatus)
    : 'inferred';
}

function safeSensitivity(value: unknown): IntelligenceSensitivity {
  return ['public', 'internal', 'private', 'secret', 'raw-media'].includes(
    String(value)
  )
    ? (value as IntelligenceSensitivity)
    : 'internal';
}

function safeSourceKind(value: unknown): IntelligenceSourceKind {
  return [
    'user-correction',
    'user-approved',
    'blueprint',
    'architect',
    'build-contract',
    'repository',
    'experience',
    'build-manifest',
    'safe-default',
    'conversation',
    'working',
  ].includes(String(value))
    ? (value as IntelligenceSourceKind)
    : 'safe-default';
}

function safeValidationStrategy(value: unknown): IntelligenceValidationStrategy {
  return [
    'none',
    'user-approval',
    'repository-evidence',
    'contract-evidence',
    'task-validation',
    'manual-review',
  ].includes(String(value))
    ? (value as IntelligenceValidationStrategy)
    : 'none';
}

function safeRecord(value: unknown): IntelligenceMemoryRecord | null {
  if (!isObject(value)) return null;
  const domain = safeDomain(value.domain);
  if (
    !domain ||
    typeof value.stableId !== 'string' ||
    typeof value.key !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  return sanitizeIntelligenceRecord({
    schemaVersion: INTELLIGENCE_RECORD_SCHEMA_VERSION,
    stableId: value.stableId,
    domain,
    category: safeCategory(value.category),
    key: value.key,
    value: safeJsonValue(value.value),
    source: isObject(value.source)
      ? {
          kind: safeSourceKind(value.source.kind),
          id:
            typeof value.source.id === 'string' ? value.source.id : undefined,
          version:
            typeof value.source.version === 'string' ||
            typeof value.source.version === 'number'
              ? value.source.version
              : undefined,
          updatedAt:
            typeof value.source.updatedAt === 'string'
              ? value.source.updatedAt
              : undefined,
          evidenceRef:
            typeof value.source.evidenceRef === 'string'
              ? value.source.evidenceRef
              : undefined,
        }
      : { kind: 'safe-default' },
    confidence:
      typeof value.confidence === 'number' && Number.isFinite(value.confidence)
        ? Math.max(0, Math.min(1, value.confidence))
        : 0.5,
    status: safeStatus(value.status),
    userApproved: value.userApproved === true,
    sensitivity: safeSensitivity(value.sensitivity),
    validationStrategy: safeValidationStrategy(value.validationStrategy),
    evidenceReferences: Array.isArray(value.evidenceReferences)
      ? value.evidenceReferences
          .filter(isObject)
          .filter((item) => typeof item.ref === 'string')
          .map((item) => ({
            kind: [
              'file',
              'route',
              'model',
              'api',
              'requirement',
              'task',
              'repository-fingerprint',
              'note',
            ].includes(String(item.kind))
              ? item.kind as IntelligenceMemoryRecord['evidenceReferences'][number]['kind']
              : 'note',
            ref: item.ref as string,
            description:
              typeof item.description === 'string'
                ? item.description
                : undefined,
          }))
      : [],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    supersedes: stringArray(value.supersedes),
    replacedBy:
      typeof value.replacedBy === 'string' ? value.replacedBy : undefined,
    expiresAt:
      typeof value.expiresAt === 'string' ? value.expiresAt : undefined,
  });
}

function safeRecords(value: unknown): IntelligenceMemoryRecord[] {
  return Array.isArray(value)
    ? value
        .map(safeRecord)
        .filter((item): item is IntelligenceMemoryRecord => Boolean(item))
    : [];
}

export function serializeIntelligenceCore(core: MatrixIntelligenceCore): string {
  const sanitized: MatrixIntelligenceCore = {
    ...core,
    vision: {
      ...core.vision,
      records: core.vision.records.map(sanitizeIntelligenceRecord),
    },
    project: {
      records: core.project.records.map(sanitizeIntelligenceRecord),
    },
    product: {
      records: core.product.records.map(sanitizeIntelligenceRecord),
    },
    user: {
      records: core.user.records.map(sanitizeIntelligenceRecord),
    },
    conversation: {
      records: core.conversation.records.map(sanitizeIntelligenceRecord),
    },
    working: {
      ...core.working,
      records: core.working.records.map(sanitizeIntelligenceRecord),
    },
    engineering: {
      ...core.engineering,
      records: core.engineering.records.map(sanitizeIntelligenceRecord),
    },
    experience: {
      ...core.experience,
      records: core.experience.records.map(sanitizeIntelligenceRecord),
    },
  };
  return JSON.stringify(sanitized);
}

export function deserializeIntelligenceCore(
  raw: string,
  fallbackProjectId = 'unknown-project'
): MatrixIntelligenceCore | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MatrixIntelligenceCore>;
    if (!isObject(parsed)) return null;
    const projectId =
      typeof parsed.projectId === 'string' && parsed.projectId.trim()
        ? parsed.projectId
        : fallbackProjectId;
    const base = createEmptyIntelligenceCore(projectId);
    if (
      parsed.schemaVersion !== INTELLIGENCE_CORE_SCHEMA_VERSION ||
      typeof parsed.id !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return {
        ...base,
        projectId,
      };
    }

    return {
      schemaVersion: INTELLIGENCE_CORE_SCHEMA_VERSION,
      metadataVersion: INTELLIGENCE_CORE_METADATA_VERSION,
      id: parsed.id,
      projectId,
      vision: {
        version: VISION_BRAIN_VERSION,
        productMission:
          parsed.vision?.productMission ?? base.vision.productMission,
        operatingPrinciples:
          Array.isArray(parsed.vision?.operatingPrinciples)
            ? stringArray(parsed.vision?.operatingPrinciples)
            : base.vision.operatingPrinciples,
        qualityBar: Array.isArray(parsed.vision?.qualityBar)
          ? stringArray(parsed.vision?.qualityBar)
          : base.vision.qualityBar,
        records: safeRecords(parsed.vision?.records),
      },
      project: { records: safeRecords(parsed.project?.records) },
      product: { records: safeRecords(parsed.product?.records) },
      user: { records: safeRecords(parsed.user?.records) },
      conversation: { records: safeRecords(parsed.conversation?.records) },
      working: {
        records: safeRecords(parsed.working?.records),
        activeTaskId:
          typeof parsed.working?.activeTaskId === 'string'
            ? parsed.working.activeTaskId
            : undefined,
        activeRunId:
          typeof parsed.working?.activeRunId === 'string'
            ? parsed.working.activeRunId
            : undefined,
        currentRepositoryFingerprint:
          typeof parsed.working?.currentRepositoryFingerprint === 'string'
            ? parsed.working.currentRepositoryFingerprint
            : undefined,
        expiresAt:
          typeof parsed.working?.expiresAt === 'string'
            ? parsed.working.expiresAt
            : undefined,
      },
      engineering: {
        records: safeRecords(parsed.engineering?.records),
        buildContractId:
          typeof parsed.engineering?.buildContractId === 'string'
            ? parsed.engineering.buildContractId
            : undefined,
        buildContractVersion:
          typeof parsed.engineering?.buildContractVersion === 'number'
            ? parsed.engineering.buildContractVersion
            : undefined,
        taskGraphId:
          typeof parsed.engineering?.taskGraphId === 'string'
            ? parsed.engineering.taskGraphId
            : undefined,
        repositoryFingerprint:
          typeof parsed.engineering?.repositoryFingerprint === 'string'
            ? parsed.engineering.repositoryFingerprint
            : undefined,
        completedRequirementIds: stringArray(
          parsed.engineering?.completedRequirementIds
        ),
        pendingRequirementIds: stringArray(parsed.engineering?.pendingRequirementIds),
        failedTaskIds: stringArray(parsed.engineering?.failedTaskIds),
        blockedTaskIds: stringArray(parsed.engineering?.blockedTaskIds),
        protectedPaths: stringArray(parsed.engineering?.protectedPaths),
      },
      experience: {
        records: safeRecords(parsed.experience?.records),
        verifiedLessonIds: stringArray(parsed.experience?.verifiedLessonIds),
      },
      conflicts: Array.isArray(parsed.conflicts)
        ? parsed.conflicts
            .filter(isObject)
            .filter(
              (item) =>
                typeof item.id === 'string' &&
                typeof item.key === 'string' &&
                safeDomain(item.domain)
            )
            .map((item) => ({
              id: item.id as string,
              domain: safeDomain(item.domain) ?? 'project',
              category: safeCategory(item.category),
              key: item.key as string,
              recordIds: stringArray(item.recordIds),
              reason:
                typeof item.reason === 'string'
                  ? item.reason
                  : 'Conflicting intelligence records need review.',
              status:
                item.status === 'resolved' || item.status === 'ignored'
                  ? item.status
                  : 'unresolved',
              resolutionRecordId:
                typeof item.resolutionRecordId === 'string'
                  ? item.resolutionRecordId
                  : undefined,
              createdAt:
                typeof item.createdAt === 'string'
                  ? item.createdAt
                  : parsed.createdAt ?? base.createdAt,
              resolvedAt:
                typeof item.resolvedAt === 'string'
                  ? item.resolvedAt
                  : undefined,
            }))
        : [],
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}
