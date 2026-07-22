import { describe, expect, it } from 'vitest';
import {
  buildChatCompletionParameters,
  buildChatCompletionRequest,
} from '@/lib/ai/chatRequestBuilder';
import { getModelCapability } from '@/lib/ai/providerCapabilities';

describe('chat completion provider-aware request builder', () => {
  it('omits unsupported sampling parameters for GPT-5.5', () => {
    const params = buildChatCompletionParameters('OPEN_AI', 'gpt-5.5', {
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 1024,
    });

    expect(params).toEqual({ max_completion_tokens: 1024 });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('top_p');
    expect(params).not.toHaveProperty('max_tokens');
  });

  it('keeps max_completion_tokens for GPT-5.5', () => {
    const params = buildChatCompletionParameters('OPEN_AI', 'gpt-5.5', {
      max_completion_tokens: 3072,
    });

    expect(params).toEqual({ max_completion_tokens: 3072 });
  });

  it('keeps sampling controls for compatible chat models', () => {
    const params = buildChatCompletionParameters('OPEN_AI', 'gpt-4.1', {
      temperature: 0.2,
      top_p: 0.8,
      max_completion_tokens: 1024,
    });

    expect(params).toEqual({
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 1024,
    });
  });

  it('builds full requests through the same capability filter', () => {
    const request = buildChatCompletionRequest({
      provider: 'OPEN_AI',
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
      parameters: { temperature: 0.2, max_tokens: 99 },
    });

    expect(request).toMatchObject({
      provider: 'OPEN_AI',
      model: 'gpt-5.5',
      stream: false,
      parameters: { max_completion_tokens: 99 },
    });
    expect(request.parameters).not.toHaveProperty('temperature');
  });

  it('advertises GPT-5.5 default-only unsupported parameters', () => {
    const capability = getModelCapability('OPEN_AI', 'gpt-5.5');

    expect(capability.tokenLimitParameter).toBe('max_completion_tokens');
    expect(capability.supportedParameters).not.toContain('temperature');
    expect(capability.defaultOnlyParameters).toContain('temperature');
  });
});
