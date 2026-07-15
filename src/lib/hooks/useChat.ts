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
  const requestSeqRef = useRef(0);
  const activeRequestIdRef = useRef(0);

  const clearPendingFlush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const isCurrentRequest = useCallback((requestId: number) => {
    return activeRequestIdRef.current === requestId;
  }, []);

  const flushResponse = useCallback(
    (requestId: number) => {
      clearPendingFlush();
      if (!isCurrentRequest(requestId)) return;
      setResponse(responseBufferRef.current);
    },
    [clearPendingFlush, isCurrentRequest]
  );

  const scheduleFlush = useCallback(
    (requestId: number) => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        if (!isCurrentRequest(requestId)) return;
        setResponse(responseBufferRef.current);
      }, 50);
    },
    [isCurrentRequest]
  );

  const sendMessage = useCallback(
    async (
      messages: object[],
      parameters: object = {},
      options: { signal?: AbortSignal } = {}
    ) => {
      const { signal } = options;
      const requestId = ++requestSeqRef.current;
      activeRequestIdRef.current = requestId;
      clearPendingFlush();
      responseBufferRef.current = '';
      chunksRef.current = [];
      setResponse('');
      setFullResponse(streaming ? [] : null);
      setIsLoading(true);
      setError(null);
      const handleAbort = () => {
        if (!isCurrentRequest(requestId)) return;
        clearPendingFlush();
        setIsLoading(false);
      };
      signal?.addEventListener('abort', handleAbort, { once: true });

      try {
        if (signal?.aborted) {
          if (isCurrentRequest(requestId)) setIsLoading(false);
          return;
        }
        if (streaming) {
          await getStreamingChatCompletion(
            provider,
            model,
            messages,
            (chunk) => {
              if (!isCurrentRequest(requestId) || signal?.aborted) return;
              chunksRef.current.push(chunk);
              const content = chunk?.choices?.[0]?.delta?.content;
              if (content) {
                responseBufferRef.current += content;
                scheduleFlush(requestId);
              }
            },
            () => {
              if (signal?.aborted || !isCurrentRequest(requestId)) return;
              flushResponse(requestId);
              setFullResponse(chunksRef.current);
              setIsLoading(false);
            },
            (err) => {
              if (signal?.aborted || !isCurrentRequest(requestId)) return;
              flushResponse(requestId);
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
          if (signal?.aborted || !isCurrentRequest(requestId)) return;
          setFullResponse(result);
          setResponse(result?.choices?.[0]?.message?.content || '');
          setIsLoading(false);
        }
      } catch (err) {
        if (signal?.aborted || isAbortLikeError(err)) {
          clearPendingFlush();
          if (isCurrentRequest(requestId)) setIsLoading(false);
          return;
        }
        if (!isCurrentRequest(requestId)) return;
        flushResponse(requestId);
        if (streaming) setFullResponse(chunksRef.current);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setIsLoading(false);
      } finally {
        signal?.removeEventListener('abort', handleAbort);
      }
    },
    [
      clearPendingFlush,
      flushResponse,
      isCurrentRequest,
      model,
      provider,
      scheduleFlush,
      streaming,
    ]
  );

  return { response, fullResponse, isLoading, error, sendMessage };
}
