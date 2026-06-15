/**
 * Normalize OpenAI chat-completions parameters for the selected model.
 *
 * GPT-5-family and reasoning-family models reject `max_tokens` and expect
 * `max_completion_tokens`. Older chat-completions models expect
 * `max_tokens`.
 */
export function normalizeChatCompletionParameters(
  model: string,
  parameters: Record<string, unknown>
): Record<string, unknown> {
  if (!parameters || typeof parameters !== 'object') return {};
  const out: Record<string, unknown> = { ...parameters };
  const usesCompletionTokenLimit = /^gpt-5(?:[.-]|$)/i.test(model) || /^o\d/i.test(model);

  if (usesCompletionTokenLimit) {
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

  return out;
}

