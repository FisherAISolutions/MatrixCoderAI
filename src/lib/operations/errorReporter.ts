import { getOptionalServerEnv } from '@/lib/env';
import { redactSecrets } from '@/lib/logger';
import type { OperationEvent } from './types';

export async function reportOperationError(
  event: OperationEvent,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<'sent' | 'not-configured' | 'failed'> {
  const url = getOptionalServerEnv('MATRIX_ERROR_REPORTING_URL');
  const token = getOptionalServerEnv('MATRIX_ERROR_REPORTING_TOKEN');
  if (!url) return 'not-configured';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'failed';
    const response = await (options.fetchImpl ?? fetch)(parsed, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(redactSecrets(event)),
    });
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
