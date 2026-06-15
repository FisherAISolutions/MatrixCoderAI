import { describe, expect, it } from 'vitest';
import { PRIMARY_MODEL } from '@/lib/ai/modelConfig';
import { normalizeChatCompletionParameters } from '@/lib/ai/parameterNormalization';

describe('chat completion route parameter normalization', () => {
  it('keeps max_completion_tokens for the configured primary model', () => {
    const params = normalizeChatCompletionParameters(PRIMARY_MODEL, {
      max_completion_tokens: 3072,
    });

    expect(params).toEqual({ max_completion_tokens: 3072 });
    expect(params).not.toHaveProperty('max_tokens');
  });

  it('converts max_tokens to max_completion_tokens for the configured primary model', () => {
    const params = normalizeChatCompletionParameters(PRIMARY_MODEL, {
      max_tokens: 1024,
    });

    expect(params).toEqual({ max_completion_tokens: 1024 });
  });

  it('converts max_completion_tokens to max_tokens for older chat models', () => {
    const params = normalizeChatCompletionParameters('legacy-chat-model', {
      max_completion_tokens: 1024,
    });

    expect(params).toEqual({ max_tokens: 1024 });
  });
});
