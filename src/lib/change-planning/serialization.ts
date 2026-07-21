import {
  CHANGE_PLAN_METADATA_VERSION,
  CHANGE_PLAN_SCHEMA_VERSION,
  type BuildChangePlan,
} from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStatus(value: unknown): value is BuildChangePlan['status'] {
  return [
    'draft',
    'approval-required',
    'approved',
    'cancelled',
    'ready-to-execute',
    'executing',
    'validated',
    'failed',
  ].includes(String(value));
}

export function serializeBuildChangePlan(plan: BuildChangePlan): string {
  return JSON.stringify(plan);
}

export function deserializeBuildChangePlan(raw: string): BuildChangePlan | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BuildChangePlan>;
    if (
      !isObject(parsed) ||
      parsed.schemaVersion !== CHANGE_PLAN_SCHEMA_VERSION ||
      parsed.metadataVersion !== CHANGE_PLAN_METADATA_VERSION ||
      typeof parsed.id !== 'string' ||
      typeof parsed.userRequest !== 'string' ||
      !isObject(parsed.interpretedIntent) ||
      !isObject(parsed.architectChanges) ||
      !isObject(parsed.blueprintChanges) ||
      !isObject(parsed.contractChanges) ||
      !isObject(parsed.explicitApprovalRequirement) ||
      !isStatus(parsed.status) ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }
    return parsed as BuildChangePlan;
  } catch {
    return null;
  }
}

export function cloneBuildChangePlanForProject(
  plan: BuildChangePlan,
  projectId: string,
  now = new Date()
): BuildChangePlan {
  const cloned = deserializeBuildChangePlan(serializeBuildChangePlan(plan));
  const timestamp = now.toISOString();
  const next = cloned ?? plan;
  return {
    ...next,
    id: `change-plan-${projectId}-${now.getTime().toString(36)}`,
    projectId,
    status: next.status === 'executing' ? 'draft' : next.status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
