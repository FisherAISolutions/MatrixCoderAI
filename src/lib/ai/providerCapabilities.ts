export type ChatCompletionParameterName =
  | 'temperature'
  | 'top_p'
  | 'max_tokens'
  | 'max_completion_tokens'
  | 'presence_penalty'
  | 'frequency_penalty'
  | 'stop'
  | 'response_format'
  | 'seed'
  | 'tools'
  | 'tool_choice';

export interface ModelCapability {
  id: string;
  provider: string;
  supportedParameters: readonly ChatCompletionParameterName[];
  tokenLimitParameter: 'max_tokens' | 'max_completion_tokens';
  defaultOnlyParameters?: readonly ChatCompletionParameterName[];
}

const STANDARD_CHAT_PARAMETERS = [
  'temperature',
  'top_p',
  'max_tokens',
  'presence_penalty',
  'frequency_penalty',
  'stop',
  'response_format',
  'seed',
  'tools',
  'tool_choice',
] as const;

const COMPLETION_LIMIT_CHAT_PARAMETERS = [
  'max_completion_tokens',
  'presence_penalty',
  'frequency_penalty',
  'stop',
  'response_format',
  'tools',
  'tool_choice',
] as const;

export const MODEL_CAPABILITY_REGISTRY: readonly ModelCapability[] = [
  {
    id: 'gpt-5.5',
    provider: 'OPEN_AI',
    supportedParameters: COMPLETION_LIMIT_CHAT_PARAMETERS,
    tokenLimitParameter: 'max_completion_tokens',
    defaultOnlyParameters: ['temperature', 'top_p'],
  },
  {
    id: 'gpt-5',
    provider: 'OPEN_AI',
    supportedParameters: COMPLETION_LIMIT_CHAT_PARAMETERS,
    tokenLimitParameter: 'max_completion_tokens',
    defaultOnlyParameters: ['temperature', 'top_p'],
  },
  {
    id: 'o1',
    provider: 'OPEN_AI',
    supportedParameters: COMPLETION_LIMIT_CHAT_PARAMETERS,
    tokenLimitParameter: 'max_completion_tokens',
    defaultOnlyParameters: ['temperature', 'top_p'],
  },
] as const;

export const DEFAULT_OPENAI_CHAT_CAPABILITY: ModelCapability = {
  id: '*',
  provider: 'OPEN_AI',
  supportedParameters: STANDARD_CHAT_PARAMETERS,
  tokenLimitParameter: 'max_tokens',
};

function normalizeModelId(model: string): string {
  return model.trim().toLowerCase();
}

export function getModelCapability(
  provider: string,
  model: string
): ModelCapability {
  const normalizedProvider = provider.trim().toUpperCase();
  const normalizedModel = normalizeModelId(model);
  const exact = MODEL_CAPABILITY_REGISTRY.find(
    (capability) =>
      capability.provider === normalizedProvider &&
      normalizeModelId(capability.id) === normalizedModel
  );
  if (exact) return exact;

  if (/^gpt-5(?:[.-]|$)/i.test(model)) {
    return {
      id: 'gpt-5-family',
      provider: normalizedProvider,
      supportedParameters: COMPLETION_LIMIT_CHAT_PARAMETERS,
      tokenLimitParameter: 'max_completion_tokens',
      defaultOnlyParameters: ['temperature', 'top_p'],
    };
  }

  if (/^o\d/i.test(model)) {
    return {
      id: 'reasoning-family',
      provider: normalizedProvider,
      supportedParameters: COMPLETION_LIMIT_CHAT_PARAMETERS,
      tokenLimitParameter: 'max_completion_tokens',
      defaultOnlyParameters: ['temperature', 'top_p'],
    };
  }

  return {
    ...DEFAULT_OPENAI_CHAT_CAPABILITY,
    provider: normalizedProvider,
  };
}

