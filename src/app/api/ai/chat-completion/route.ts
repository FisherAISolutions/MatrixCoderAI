import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildChatCompletionParameters } from '@/lib/ai/chatRequestBuilder';
import { getOptionalServerEnv } from '@/lib/env';
import { logError, publicErrorMessage } from '@/lib/logger';
import { rejectIfRequestTooLarge } from '@/lib/api/hardening';

/**
 * Chat-completion proxy.
 *
 * MIGRATION (2026-01) â€” replaced the (now-deprecated) `@rocketnew/llm-sdk`
 * with the official `openai` SDK. The public request/response shape is
 * unchanged:
 *
 *   request : { provider, model, messages, stream, parameters }
 *   response:
 *     - non-streaming â†’ the raw OpenAI ChatCompletion object
 *     - streaming     â†’ SSE with frames
 *         data: { "type":"start" }
 *         data: { "type":"chunk", "chunk": <ChatCompletionChunk> }
 *         data: { "type":"done" }
 *         data: { "type":"error", "error": ..., "details": ... }
 *
 * This keeps `useChat` / `getChatCompletion` / `getStreamingChatCompletion`
 * / the auto-fix loop working without any front-end changes.
 *
 * Only the OPEN_AI provider is implemented here â€” Anthropic/Gemini/etc.
 * are left as 501 (unchanged behaviour: the calling code only ever sends
 * OPEN_AI today).
 */

const API_KEYS: Record<string, string | undefined> = {
  OPEN_AI: getOptionalServerEnv('OPENAI_API_KEY'),
  ANTHROPIC: getOptionalServerEnv('ANTHROPIC_API_KEY'),
  GEMINI: getOptionalServerEnv('GEMINI_API_KEY'),
  PERPLEXITY: getOptionalServerEnv('PERPLEXITY_API_KEY'),
};

// Hardening pass #5 â€” server-side caps to keep the AI provider happy and
// prevent runaway costs / payload-too-large errors that would otherwise
// surface as opaque 500s. Adjust if you legitimately need more.
const MAX_TOTAL_PROMPT_CHARS = 400_000; // ~100K tokens for current large-context OpenAI models
const MAX_MESSAGE_COUNT = 200;
const MAX_CHAT_BODY_BYTES = 2 * 1024 * 1024;

function totalPromptChars(messages: unknown[]): number {
  let total = 0;
  for (const m of messages) {
    if (m && typeof m === 'object' && 'content' in m) {
      const c = (m as { content?: unknown }).content;
      if (typeof c === 'string') total += c.length;
    }
  }
  return total;
}

function formatErrorResponse(error: unknown, provider?: string) {
  const statusCode =
    (error as any)?.status ||
    (error as any)?.statusCode ||
    500;
  const providerName = provider || 'OPEN_AI';

  return {
    error: `${providerName.toUpperCase()} API error: ${statusCode}`,
    details: publicErrorMessage('The AI provider returned an error.', error, {
      exposeInDevelopment: true,
    }),
    statusCode,
  };
}

export async function POST(request: NextRequest) {
  const tooLarge = rejectIfRequestTooLarge(request, MAX_CHAT_BODY_BYTES);
  if (tooLarge) return tooLarge;

  let body: any = {};

  try {
    body = await request.json();
    const { provider, model, messages, stream = false, parameters = {} } = body;

    if (!provider || !model || !messages?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: provider, model, messages', details: 'Request validation failed' },
        { status: 400 }
      );
    }

    if (provider !== 'OPEN_AI') {
      return NextResponse.json(
        {
          error: `Provider ${provider} is not implemented in this build`,
          details: 'Only OPEN_AI is supported. Set provider="OPEN_AI" or wire in an additional SDK.',
        },
        { status: 501 }
      );
    }

    // Hardening pass #5 â€” payload size caps. Reject early with 413 so
    // callers get a clear, actionable error instead of an opaque provider
    // 500 or a hung connection.
    if (Array.isArray(messages) && messages.length > MAX_MESSAGE_COUNT) {
      return NextResponse.json(
        {
          error: `Too many messages: received ${messages.length}, limit is ${MAX_MESSAGE_COUNT}`,
          details:
            'Trim conversation history (the client should only send the last ~10 turns) and retry.',
        },
        { status: 413 }
      );
    }
    const totalChars = totalPromptChars(messages);
    if (totalChars > MAX_TOTAL_PROMPT_CHARS) {
      return NextResponse.json(
        {
          error: `Prompt too large: ${totalChars} chars, limit is ${MAX_TOTAL_PROMPT_CHARS}`,
          details:
            'Shrink repo context, drop older messages, or ask a smaller question. The server rejected before contacting the LLM provider.',
        },
        { status: 413 }
      );
    }

    const apiKey = API_KEYS[provider];
    if (!apiKey) {
      return NextResponse.json(
        { error: `${provider.toUpperCase()} API key is not configured`, details: 'The API key for this provider is missing in environment variables' },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const params = buildChatCompletionParameters(provider, model, parameters);

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`)
            );

            const completionStream = await openai.chat.completions.create({
              model,
              messages,
              stream: true,
              ...params,
            });

            for await (const chunk of completionStream) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'chunk', chunk })}\n\n`
                )
              );
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
            );
            controller.close();
          } catch (error) {
            const formatted = formatErrorResponse(error, provider);
            logError('API Route Error (stream)', error, {
              operation: 'chat-completion-stream',
              provider,
            });
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  error: formatted.error,
                  details: formatted.details,
                })}\n\n`
              )
            );
            controller.close();
          }
        },
      });

      return new NextResponse(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const response = await openai.chat.completions.create({
      model,
      messages,
      stream: false,
      ...params,
    });

    return NextResponse.json(response);
  } catch (error) {
    const formatted = formatErrorResponse(error, body?.provider);
    logError('API Route Error', error, {
      operation: 'chat-completion',
      provider: body?.provider,
    });
    return NextResponse.json(
      { error: formatted.error, details: formatted.details },
      { status: formatted.statusCode }
    );
  }
}



