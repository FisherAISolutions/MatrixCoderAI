export type ApplicationSessionErrorCode =
  | 'not-configured'
  | 'not-authenticated'
  | 'user-mismatch'
  | 'row-level-security'
  | 'profile-missing'
  | 'persistence-failed';

export class ApplicationSessionError extends Error {
  constructor(
    public readonly code: ApplicationSessionErrorCode,
    message: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'ApplicationSessionError';
  }
}

export interface OwnedSessionPersistenceClient<TSession> {
  getAuthenticatedUserId(): Promise<string | null>;
  insertSession(input: {
    userId: string;
    title: string;
  }): Promise<{ data: TSession | null; error: unknown }>;
}

function readErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const record = error as Record<string, unknown>;
  return [record.message, record.details, record.hint, record.code]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

export function classifySessionPersistenceError(
  error: unknown
): ApplicationSessionError {
  const text = readErrorText(error);
  if (/row.level.security|42501/i.test(text)) {
    return new ApplicationSessionError(
      'row-level-security',
      'Cloud workspace access was denied. Your work can continue locally while access is repaired.',
      true
    );
  }
  if (/foreign key|sessions_user_id_fkey|23503/i.test(text)) {
    return new ApplicationSessionError(
      'profile-missing',
      'Your account profile is still being prepared. Your work can continue locally.',
      true
    );
  }
  return new ApplicationSessionError(
    'persistence-failed',
    'The cloud workspace could not be created. Your work can continue locally.',
    true
  );
}

export async function createOwnedApplicationSession<TSession>(
  client: OwnedSessionPersistenceClient<TSession>,
  options: { requestedUserId?: string; title?: string } = {}
): Promise<TSession> {
  const authenticatedUserId = await client.getAuthenticatedUserId();
  if (!authenticatedUserId) {
    throw new ApplicationSessionError(
      'not-authenticated',
      'A valid authenticated session is required before creating a cloud workspace.',
      false
    );
  }
  if (
    options.requestedUserId &&
    options.requestedUserId !== authenticatedUserId
  ) {
    throw new ApplicationSessionError(
      'user-mismatch',
      'The requested workspace owner does not match the authenticated account.',
      false
    );
  }

  const result = await client.insertSession({
    userId: authenticatedUserId,
    title: options.title?.trim() || 'Untitled Session',
  });
  if (result.error || !result.data) {
    throw classifySessionPersistenceError(result.error);
  }
  return result.data;
}
