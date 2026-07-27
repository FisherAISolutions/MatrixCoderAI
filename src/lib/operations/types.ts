export type OperationDomain =
  | 'auth'
  | 'project'
  | 'architect'
  | 'blueprint'
  | 'ai'
  | 'task-build'
  | 'task'
  | 'repair'
  | 'validation'
  | 'persistence'
  | 'webcontainer'
  | 'deployment'
  | 'billing'
  | 'usage'
  | 'security';

export type FailureCategory =
  | 'provider-configuration'
  | 'provider-authentication'
  | 'provider-rate-limit'
  | 'provider-timeout'
  | 'malformed-output'
  | 'patch-scope'
  | 'repository-conflict'
  | 'validation'
  | 'build'
  | 'runtime'
  | 'persistence'
  | 'authentication'
  | 'deployment'
  | 'billing'
  | 'quota'
  | 'cancelled'
  | 'user-action-required'
  | 'unknown';

export interface OperationEvent {
  id: string;
  operationId: string;
  domain: OperationDomain;
  action: string;
  status: 'started' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';
  createdAt: string;
  durationMs?: number;
  failureCategory?: FailureCategory;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface OperationContext {
  operationId: string;
  requestId?: string;
  projectId?: string;
  userId?: string;
}
