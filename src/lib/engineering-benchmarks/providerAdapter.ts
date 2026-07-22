import { AI_PROVIDER, PRIMARY_MODEL } from '@/lib/ai/modelConfig';
import type {
  TaskExecutionAiClient,
  TaskExecutionAiMessage,
  TaskExecutionAiResponse,
} from '@/lib/task-execution';

const CHAT_COMPLETION_PATH = '/api/ai/chat-completion';

export type BenchmarkProviderErrorKind =
  | 'configuration'
  | 'unavailable'
  | 'authentication'
  | 'timeout'
  | 'malformed-response'
  | 'provider-error';

export class BenchmarkProviderError extends Error {
  readonly kind: BenchmarkProviderErrorKind;
  readonly status?: number;

  constructor(kind: BenchmarkProviderErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'BenchmarkProviderError';
    this.kind = kind;
    this.status = status;
  }
}

export interface BenchmarkProviderAdapterOptions {
  appBaseUrl?: string;
  fetchImpl?: typeof fetch;
  provider?: string;
  model?: string;
}

export interface ResolvedBenchmarkProviderEndpoint {
  baseUrl: string;
  endpoint: string;
}

function redactProviderMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED_OPENAI_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

export function resolveBenchmarkProviderEndpoint(
  appBaseUrl?: string
): ResolvedBenchmarkProviderEndpoint {
  if (!appBaseUrl?.trim()) {
    throw new BenchmarkProviderError(
      'configuration',
      'MATRIX_CODER_APP_BASE_URL is required for Node CLI live benchmark provider calls.'
    );
  }

  let base: URL;
  try {
    base = new URL(appBaseUrl);
  } catch {
    throw new BenchmarkProviderError(
      'configuration',
      `Invalid MATRIX_CODER_APP_BASE_URL: ${appBaseUrl}`
    );
  }

  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new BenchmarkProviderError(
      'configuration',
      'MATRIX_CODER_APP_BASE_URL must use http or https.'
    );
  }
  if (!base.hostname) {
    throw new BenchmarkProviderError(
      'configuration',
      'MATRIX_CODER_APP_BASE_URL must include a hostname.'
    );
  }
  if (base.username || base.password) {
    throw new BenchmarkProviderError(
      'configuration',
      'MATRIX_CODER_APP_BASE_URL must not include embedded credentials.'
    );
  }

  const endpoint = new URL(CHAT_COMPLETION_PATH, base);
  if (endpoint.pathname !== CHAT_COMPLETION_PATH) {
    throw new BenchmarkProviderError(
      'configuration',
      `Benchmark provider endpoint must resolve to ${CHAT_COMPLETION_PATH}.`
    );
  }

  return {
    baseUrl: base.origin,
    endpoint: endpoint.toString(),
  };
}

function classifyHttpError(status: number): BenchmarkProviderErrorKind {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 400) return 'configuration';
  if (status >= 500) return 'provider-error';
  return 'provider-error';
}

function normalizeChatCompletionResponse(data: any): TaskExecutionAiResponse {
  const choice = data?.choices?.[0];
  const content = choice?.message?.content ?? data?.content;
  if (typeof content !== 'string') {
    throw new BenchmarkProviderError(
      'malformed-response',
      'Benchmark provider returned a malformed chat-completion response.'
    );
  }

  return {
    content,
    finishReason: choice?.finish_reason ?? choice?.finishReason,
    usage: data?.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

export function createBenchmarkApiRouteAiClient(
  options: BenchmarkProviderAdapterOptions
): TaskExecutionAiClient {
  const { endpoint } = resolveBenchmarkProviderEndpoint(options.appBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const provider = options.provider ?? AI_PROVIDER;
  const model = options.model ?? PRIMARY_MODEL;

  return {
    complete: async (
      messages: TaskExecutionAiMessage[],
      requestOptions
    ): Promise<TaskExecutionAiResponse> => {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            model,
            messages,
            stream: false,
            parameters: { temperature: 0.2 },
          }),
          signal: requestOptions.signal,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new BenchmarkProviderError(
          /abort/i.test(message)
            ? 'timeout'
            : /fetch|network|ECONNREFUSED|ENOTFOUND/i.test(message)
              ? 'unavailable'
              : 'provider-error',
          redactProviderMessage(message)
        );
      }

      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new BenchmarkProviderError(
          'malformed-response',
          'Benchmark provider returned non-JSON response.',
          response.status
        );
      }

      if (!response.ok || data?.error) {
        const details = [data?.error, data?.details]
          .filter((item) => typeof item === 'string' && item.length > 0)
          .join(' ');
        throw new BenchmarkProviderError(
          classifyHttpError(response.status),
          redactProviderMessage(
            details || `Benchmark provider request failed with status ${response.status}.`
          ),
          response.status
        );
      }

      return normalizeChatCompletionResponse(data);
    },
  };
}

export function isBenchmarkProviderError(
  error: unknown
): error is BenchmarkProviderError {
  return error instanceof BenchmarkProviderError;
}

