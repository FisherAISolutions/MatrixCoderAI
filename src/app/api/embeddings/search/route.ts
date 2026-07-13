import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { embedQuery } from '@/lib/embeddings/embedder';
import { getPublicEnv } from '@/lib/env';
import {
  parseJsonBody,
  rejectIfRequestTooLarge,
  requireBearerAuthorization,
  safeApiErrorResponse,
} from '@/lib/api/hardening';

/**
 * POST /api/embeddings/search
 *   body:    { sessionId, query, k? }
 *   headers: Authorization: Bearer <supabase_access_token>
 *
 * Returns: { matches: [{ file_path, chunk_index, chunk_content, similarity }] }
 *
 * 503 { status: 'pgvector_unavailable' } when the RPC / table is missing,
 *     so callers cleanly fall back to heuristic-only ranking.
 */
type EmbeddingsSearchRequestBody = {
  sessionId?: string;
  query?: string;
  k?: number;
};

const MAX_SEARCH_BODY_BYTES = 64 * 1024;
const MAX_QUERY_CHARS = 5000;

export async function POST(request: NextRequest) {
  const tooLarge = rejectIfRequestTooLarge(request, MAX_SEARCH_BODY_BYTES);
  if (tooLarge) return tooLarge;

  const authError = requireBearerAuthorization(request);
  if (authError) return authError;

  const parsed = await parseJsonBody<EmbeddingsSearchRequestBody>(request);
  if (!parsed.ok || !parsed.body) return parsed.response!;

  const { sessionId, query } = parsed.body;
  const k = Math.min(Math.max(parsed.body.k ?? 8, 1), 24);

  if (!sessionId || !query) {
    return NextResponse.json({ error: 'sessionId and query are required' }, { status: 400 });
  }

  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: 'Search query is too large.' },
      { status: 413 }
    );
  }

  const url = getPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let embedding: number[];
  try {
    embedding = await embedQuery(query);
  } catch (err) {
    return safeApiErrorResponse(err, {
      fallback: 'Embedding API failed.',
      status: 502,
      operation: 'embeddings-search-openai',
      exposeInDevelopment: true,
    });
  }

  const { data, error } = await supabase.rpc('match_file_chunks', {
    p_session_id: sessionId,
    p_query_embedding: embedding as unknown as string,
    p_match_count: k,
  });

  if (error) {
    const msg = error.message || '';
    if (
      msg.includes('function') ||
      msg.includes('does not exist') ||
      msg.toLowerCase().includes('vector')
    ) {
      return NextResponse.json({ status: 'pgvector_unavailable', matches: [] }, { status: 503 });
    }
    return NextResponse.json({ error: 'Search failed', matches: [] }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok', matches: data ?? [] });
}
