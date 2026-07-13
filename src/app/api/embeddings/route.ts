import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chunkText, embedChunks } from '@/lib/embeddings/embedder';
import { getPublicEnv } from '@/lib/env';
import {
  parseJsonBody,
  rejectIfRequestTooLarge,
  requireBearerAuthorization,
  safeApiErrorResponse,
} from '@/lib/api/hardening';
import { logWarning } from '@/lib/logger';

/**
 * POST /api/embeddings
 *   body:    { sessionId, filePath, content }
 *   headers: Authorization: Bearer <supabase_access_token>
 *
 * Chunks the file, embeds each chunk, upserts into file_embeddings.
 * Returns 200 with { chunks, status } on success.
 * Returns 503 { status: 'pgvector_unavailable' } if the table/extension isn't installed.
 *   Callers should treat this as a clean fallback signal - heuristics still work.
 */
type EmbeddingsRequestBody = {
  sessionId?: string;
  filePath?: string;
  content?: string;
};

const MAX_EMBEDDINGS_BODY_BYTES = 250_000;
const MAX_EMBEDDING_CONTENT_CHARS = 200_000;

export async function POST(request: NextRequest) {
  const tooLarge = rejectIfRequestTooLarge(
    request,
    MAX_EMBEDDINGS_BODY_BYTES
  );
  if (tooLarge) return tooLarge;

  const authError = requireBearerAuthorization(request);
  if (authError) return authError;

  const parsed = await parseJsonBody<EmbeddingsRequestBody>(request);
  if (!parsed.ok || !parsed.body) return parsed.response!;

  const { sessionId, filePath, content } = parsed.body;
  if (!sessionId || !filePath || typeof content !== 'string') {
    return NextResponse.json(
      { error: 'sessionId, filePath, content are required' },
      { status: 400 }
    );
  }

  if (content.length === 0) {
    return NextResponse.json({ status: 'empty', chunks: 0 });
  }
  if (content.length > MAX_EMBEDDING_CONTENT_CHARS) {
    return NextResponse.json({ status: 'skipped_too_large', chunks: 0 });
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

  try {
    const { data: fileRow, error: fileErr } = await supabase
      .from('files')
      .select('id')
      .eq('session_id', sessionId)
      .eq('file_path', filePath)
      .maybeSingle();

    if (fileErr || !fileRow) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const fileId = fileRow.id as string;

    const chunks = chunkText(content);
    let embeddings: number[][];
    try {
      embeddings = await embedChunks(chunks);
    } catch (err) {
      return safeApiErrorResponse(err, {
        fallback: 'Embedding API failed.',
        status: 502,
        operation: 'embeddings-openai',
        exposeInDevelopment: true,
      });
    }

    const { error: delErr } = await supabase
      .from('file_embeddings')
      .delete()
      .eq('file_id', fileId);
    if (delErr) {
      const msg = delErr.message || '';
      if (
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.toLowerCase().includes('vector')
      ) {
        return NextResponse.json(
          { status: 'pgvector_unavailable' },
          { status: 503 }
        );
      }
      logWarning('[embeddings] delete-stale failed', {
        operation: 'embeddings-delete-stale',
        reason: msg,
      });
    }

    const rows = chunks.map((chunk, index) => ({
      session_id: sessionId,
      file_id: fileId,
      file_path: filePath,
      chunk_index: index,
      chunk_content: chunk,
      embedding: embeddings[index] as unknown as string,
    }));

    const { error: insertErr } = await supabase.from('file_embeddings').insert(rows);
    if (insertErr) {
      const msg = insertErr.message || '';
      if (
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.toLowerCase().includes('vector')
      ) {
        return NextResponse.json(
          { status: 'pgvector_unavailable' },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    return NextResponse.json({ status: 'ok', chunks: chunks.length });
  } catch (error) {
    return safeApiErrorResponse(error, {
      fallback: 'Embedding request failed.',
      operation: 'embeddings-upsert',
      exposeInDevelopment: true,
    });
  }
}

