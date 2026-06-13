import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { embedQuery } from '@/lib/embeddings/embedder';

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
export async function POST(request: NextRequest) {
  let body: { sessionId?: string; query?: string; k?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, query } = body;
  const k = Math.min(Math.max(body.k ?? 8, 1), 24);

  if (!sessionId || !query) {
    return NextResponse.json({ error: 'sessionId and query are required' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
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
    return NextResponse.json(
      { error: 'Embedding API failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
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
    return NextResponse.json(
      { error: 'Search failed', details: msg, matches: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: 'ok', matches: data ?? [] });
}
