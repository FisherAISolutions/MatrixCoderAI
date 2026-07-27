const OPERATION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{7,95}$/i;

export function createOperationId(prefix = 'op'): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export function normalizeOperationId(
  value: string | null | undefined,
  prefix = 'op'
): string {
  const trimmed = value?.trim();
  return trimmed && OPERATION_ID_PATTERN.test(trimmed)
    ? trimmed
    : createOperationId(prefix);
}

export function operationIdFromRequest(request: Request, prefix = 'http'): string {
  return normalizeOperationId(request.headers.get('x-operation-id'), prefix);
}
