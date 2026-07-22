import { getModelCapability } from './providerCapabilities';

export interface ChatCompletionRequestInput {
  provider: string;
  model: string;
  messages: object[];
  stream?: boolean;
  parameters?: Record<string, unknown> | object;
}

export interface ChatCompletionRequest {
  provider: string;
  model: string;
  messages: object[];
  stream: boolean;
  parameters: Record<string, unknown>;
}

function asParameterRecord(parameters?: Record<string, unknown> | object) {
  if (!parameters || typeof parameters !== 'object') return {};
  return { ...(parameters as Record<string, unknown>) };
}

export function buildChatCompletionParameters(
  provider: string,
  model: string,
  parameters: Record<string, unknown> | object = {}
): Record<string, unknown> {
  const capability = getModelCapability(provider, model);
  const supported = new Set<string>(capability.supportedParameters);
  const out = asParameterRecord(parameters);

  if (capability.tokenLimitParameter === 'max_completion_tokens') {
    if (out.max_tokens != null && out.max_completion_tokens == null) {
      out.max_completion_tokens = out.max_tokens;
    }
    delete out.max_tokens;
  } else {
    if (out.max_completion_tokens != null && out.max_tokens == null) {
      out.max_tokens = out.max_completion_tokens;
    }
    delete out.max_completion_tokens;
  }

  for (const key of Object.keys(out)) {
    if (!supported.has(key)) {
      delete out[key];
    }
  }

  return out;
}

export function buildChatCompletionRequest(
  input: ChatCompletionRequestInput
): ChatCompletionRequest {
  return {
    provider: input.provider,
    model: input.model,
    messages: input.messages,
    stream: input.stream ?? false,
    parameters: buildChatCompletionParameters(
      input.provider,
      input.model,
      input.parameters
    ),
  };
}

