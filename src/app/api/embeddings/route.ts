import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chunkText, embedChunks } from '@/lib/embeddings/embedder';

/**
 * POST /api/embeddings
 *   body:    { sessionId, filePath, content }
 *   headers: Authorization: Bearer <supabase_access_token>
 *
 * Chunks the file, embeds each chunk, upserts into file_embeddings.
 * Returns 200 with { chunks, status } on success.
 * Returns 503 { status: 'pgvector_unavailable' } if the table/extension isn't installed.
 *   Callers should treat this as a clean fallback signal — heuristics still work.
 */
export async function POST(request: NextRequest) {
  let body: { sessionId?: string; filePath?: string; content?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, filePath, content } = body;
  if (!sessionId || !filePath || typeof content !== 'string') {
    return NextResponse.json(
      { error: 'sessionId, filePath, content are required' },
      { status: 400 }
    );
  }

  // Skip pathological inputs early
  if (content.length === 0) {
    return NextResponse.json({ status: 'empty', chunks: 0 });
  }
  if (content.length > 200_000) {
    // Too large — refuse to embed (>50K tokens single file)
    return NextResponse.json({ status: 'skipped_too_large', chunks: 0 });
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

  // Look up file_id from (session_id, file_path) — the embeddings table FKs on file_id
  const { data: fileRow, error: fileErr } = await supabase
    .from('files')
    .select('id')
    .eq('session_id', sessionId)
    .eq('file_path', filePath)
    .maybeSingle();

  if (fileErr || !fileRow) {
    return NextResponse.json(
      { error: 'File not found', details: fileErr?.message },
      { status: 404 }
    );
  }
  const fileId = fileRow.id as string;

  // Chunk + embed
  const chunks = chunkText(content);
  let embeddings: number[][];
  try {
    embeddings = await embedChunks(chunks);
  } catch (err) {
    return NextResponse.json(
      { error: 'Embedding API failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  // Clear stale embeddings for this file (file may have shrunk)
  const { error: delErr } = await supabase
    .from('file_embeddings')
    .delete()
    .eq('file_id', fileId);
  if (delErr) {
    const msg = delErr.message || '';
    if (msg.includes('does not exist') || msg.includes('relation') || msg.toLowerCase().includes('vector')) {
      return NextResponse.json(
        { status: 'pgvector_unavailable', details: msg },
        { status: 503 }
      );
    }
    // Non-fatal: continue with upsert
    console.warn('[embeddings] delete-stale failed:', msg);
  }

  // Insert new chunks
  const rows = chunks.map((c, i) => ({
    session_id: sessionId,
    file_id: fileId,
    file_path: filePath,
    chunk_index: i,
    chunk_content: c,
    // pgvector accepts the array form '[1,2,3]' as text; supabase-js will send it as JSON
    embedding: embeddings[i] as unknown as string,
  }));

  const { error: insertErr } = await supabase.from('file_embeddings').insert(rows);
  if (insertErr) {
    const msg = insertErr.message || '';
    if (msg.includes('does not exist') || msg.includes('relation') || msg.toLowerCase().includes('vector')) {
      return NextResponse.json(
        { status: 'pgvector_unavailable', details: msg },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Insert failed', details: msg },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: 'ok', chunks: chunks.length });
}
