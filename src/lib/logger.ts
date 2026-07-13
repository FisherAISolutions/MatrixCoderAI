export type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  operation?: string;
  workspaceId?: string;
  route?: string;
  [key: string]: unknown;
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /Bearer\s+[A-Za-z0-9._~-]{12,}/gi,
  /(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|PERPLEXITY_API_KEY|VERCEL_TOKEN|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*['"]?[^'",\s}]+/gi,
];

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return SECRET_PATTERNS.reduce(
      (current, pattern) => current.replace(pattern, '[redacted-secret]'),
      value
    );
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        if (/token|secret|api[_-]?key|password/i.test(key)) {
          return [key, '[redacted-secret]'];
        }
        return [key, redactSecrets(entry)];
      })
    );
  }
  return value;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecrets(error.message),
    };
  }
  return redactSecrets(error);
}

export function logInfo(message: string, context?: LogContext) {
  if (process.env.NODE_ENV === 'test') return;
  console.info(message, redactSecrets(context ?? {}));
}

export function logWarning(message: string, context?: LogContext) {
  if (process.env.NODE_ENV === 'test') return;
  console.warn(message, redactSecrets(context ?? {}));
}

export function logError(message: string, error?: unknown, context?: LogContext) {
  if (process.env.NODE_ENV === 'test') return;
  console.error(message, {
    ...((redactSecrets(context ?? {}) as Record<string, unknown>) ?? {}),
    error: normalizeError(error),
  });
}

export function publicErrorMessage(
  fallback: string,
  error: unknown,
  options: { exposeInDevelopment?: boolean } = {}
) {
  if (options.exposeInDevelopment && process.env.NODE_ENV !== 'production') {
    return error instanceof Error
      ? (redactSecrets(error.message) as string)
      : String(redactSecrets(error));
  }
  return fallback;
}
