'use client';

import { useState, useCallback, useRef } from 'react';
import { getChatCompletion, getStreamingChatCompletion } from '@/lib/ai/chatCompletion';
import { isAbortLikeError } from '@/lib/generation/cancellation';

export function useChat(provider: string, model: string, streaming: boolean = true) {
  const [response, setResponse] = useState('');
  const [fullResponse, setFullResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const responseBufferRef = useRef('');
  const chunksRef = useRef<any[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingFlush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const flushResponse = useCallback(() => {
    clearPendingFlush();
    setResponse(responseBufferRef.current);
  }, [clearPendingFlush]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      setResponse(responseBufferRef.current);
    }, 50);
  }, []);

  const sendMessage = useCallback(
    async (
      messages: object[],
      parameters: object = {},
      options: { signal?: AbortSignal } = {}
    ) => {
      const { signal } = options;
      clearPendingFlush();
      responseBufferRef.current = '';
      chunksRef.current = [];
      setResponse('');
      setFullResponse(streaming ? [] : null);
      setIsLoading(true);
      setError(null);
      const handleAbort = () => {
        clearPendingFlush();
        setIsLoading(false);
      };
      signal?.addEventListener('abort', handleAbort, { once: true });

      try {
        if (signal?.aborted) {
          setIsLoading(false);
          return;
        }
        if (streaming) {
          await getStreamingChatCompletion(
            provider,
            model,
            messages,
            (chunk) => {
              chunksRef.current.push(chunk);
              const content = chunk?.choices?.[0]?.delta?.content;
              if (content) {
                responseBufferRef.current += content;
                scheduleFlush();
              }
            },
            () => {
              if (signal?.aborted) return;
              flushResponse();
              setFullResponse(chunksRef.current);
              setIsLoading(false);
            },
            (err) => {
              if (signal?.aborted) return;
              flushResponse();
              setFullResponse(chunksRef.current);
              setError(err);
              setIsLoading(false);
            },
            parameters,
            { signal }
          );
        } else {
          const result = await getChatCompletion(provider, model, messages, parameters, {
            signal,
          });
          if (signal?.aborted) return;
          setFullResponse(result);
          setResponse(result?.choices?.[0]?.message?.content || '');
          setIsLoading(false);
        }
      } catch (err) {
        if (signal?.aborted || isAbortLikeError(err)) {
          clearPendingFlush();
          setIsLoading(false);
          return;
        }
        flushResponse();
        if (streaming) setFullResponse(chunksRef.current);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setIsLoading(false);
      } finally {
        signal?.removeEventListener('abort', handleAbort);
      }
    },
    [clearPendingFlush, flushResponse, model, provider, scheduleFlush, streaming]
  );

  return { response, fullResponse, isLoading, error, sendMessage };
}
