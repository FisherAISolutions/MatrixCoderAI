import { logError, logInfo, logWarning } from '@/lib/logger';
import { createOperationId } from './operationId';
import type { OperationEvent } from './types';

const MAX_RECENT_EVENTS = 200;
const recentEvents: OperationEvent[] = [];

export function recordOperationEvent(
  event: Omit<OperationEvent, 'id' | 'createdAt'>
): OperationEvent {
  const complete: OperationEvent = {
    ...event,
    id: createOperationId('evt'),
    createdAt: new Date().toISOString(),
  };
  recentEvents.unshift(complete);
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.length = MAX_RECENT_EVENTS;

  const context = {
    operationId: complete.operationId,
    domain: complete.domain,
    action: complete.action,
    status: complete.status,
    durationMs: complete.durationMs,
    failureCategory: complete.failureCategory,
    ...complete.metadata,
  };
  if (complete.status === 'failed') logError('operation failed', undefined, context);
  else if (complete.status === 'blocked') logWarning('operation blocked', context);
  else logInfo('operation event', context);
  return complete;
}

export function getRecentOperationEvents(limit = 50): OperationEvent[] {
  return recentEvents.slice(0, Math.max(0, Math.min(limit, 100)));
}

export function clearOperationEventsForTests(): void {
  recentEvents.length = 0;
}
