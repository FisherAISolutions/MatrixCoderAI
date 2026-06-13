import { supabase } from '@/lib/supabase';

/**
 * Client-side, fire-and-forget indexing.
 *
 *   - Forwards the user's Supabase JWT in the Authorization header so the
 *     server-side route can pass RLS for file_embeddings.
 *   - Concurrency limit 4 to avoid hammering OpenAI / Supabase.
 *   - On the first 503 ("pgvector_unavailable") we stop the whole run and
 *     mark embeddings as disabled in this tab — Stage 2C will then cleanly
 *     fall back to heuristic-only retrieval.
 *   - All failures are swallowed (logged) — they must never block the user.
 */

let pgvectorDisabled = false;

async function getAuthHeader(): Promise<string> {
  if (!supabase) return '';
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? `Bearer ${token}` : '';
  } catch {
    return '';
  }
}

export function isPgvectorDisabled(): boolean {
  return pgvectorDisabled;
}

async function indexOne(
  sessionId: string,
  filePath: string,
  content: string,
  auth: string
): Promise<'ok' | 'disabled' | 'failed'> {
  try {
    const resp = await fetch('/api/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify({ sessionId, filePath, content }),
    });
    if (resp.status === 503) {
      pgvectorDisabled = true;
      return 'disabled';
    }
    if (!resp.ok) return 'failed';
    return 'ok';
  } catch {
    return 'failed';
  }
}

export async function indexFile(
  sessionId: string,
  filePath: string,
  content: string
): Promise<void> {
  if (pgvectorDisabled) return;
  if (!sessionId || sessionId.startsWith('demo-')) return;
  if (!content || content.length === 0) return;
  const auth = await getAuthHeader();
  indexOne(sessionId, filePath, content, auth).catch(() => {
    /* swallowed */
  });
}

export interface IndexFileInput {
  filePath: string;
  content: string;
}

export async function indexProject(
  sessionId: string,
  files: IndexFileInput[],
  onProgress?: (done: number, total: number) => void
): Promise<{ indexed: number; failed: number; disabled: boolean }> {
  if (!sessionId || sessionId.startsWith('demo-')) {
    return { indexed: 0, failed: 0, disabled: true };
  }
  if (files.length === 0) {
    return { indexed: 0, failed: 0, disabled: pgvectorDisabled };
  }

  const auth = await getAuthHeader();
  const queue = [...files];
  const CONCURRENCY = 4;
  let indexed = 0;
  let failed = 0;
  let done = 0;

  const worker = async () => {
    while (queue.length > 0 && !pgvectorDisabled) {
      const next = queue.shift();
      if (!next) break;
      const r = await indexOne(sessionId, next.filePath, next.content, auth);
      if (r === 'ok') indexed++;
      else if (r === 'disabled') {
        // pgvectorDisabled flag is now true; remaining workers will exit
        break;
      } else failed++;
      done++;
      onProgress?.(done, files.length);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return { indexed, failed, disabled: pgvectorDisabled };
}
