'use client';

import { useState, useCallback, useRef } from 'react';
import { getChatCompletion, getStreamingChatCompletion } from '@/lib/ai/chatCompletion';

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
    async (messages: object[], parameters: object = {}) => {
      clearPendingFlush();
      responseBufferRef.current = '';
      chunksRef.current = [];
      setResponse('');
      setFullResponse(streaming ? [] : null);
      setIsLoading(true);
      setError(null);

      try {
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
              flushResponse();
              setFullResponse(chunksRef.current);
              setIsLoading(false);
            },
            (err) => {
              flushResponse();
              setFullResponse(chunksRef.current);
              setError(err);
              setIsLoading(false);
            },
            parameters
          );
        } else {
          const result = await getChatCompletion(provider, model, messages, parameters);
          setFullResponse(result);
          setResponse(result?.choices?.[0]?.message?.content || '');
          setIsLoading(false);
        }
      } catch (err) {
        flushResponse();
        if (streaming) setFullResponse(chunksRef.current);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setIsLoading(false);
      }
    },
    [clearPendingFlush, flushResponse, model, provider, scheduleFlush, streaming]
  );

  return { response, fullResponse, isLoading, error, sendMessage };
}
