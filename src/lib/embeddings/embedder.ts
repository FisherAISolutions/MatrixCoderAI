/**
 * Server-only embedding helpers.
 * - Chunk text in char-based windows with overlap (~700 tokens per chunk).
 * - Call OpenAI text-embedding-3-small via fetch (no extra SDK dep).
 */

const MODEL = 'text-embedding-3-small';
const MAX_CHUNK_CHARS = 2800; // ~700 tokens
const OVERLAP_CHARS = 400;
const EMBED_BATCH = 64;
const OPENAI_URL = 'https://api.openai.com/v1/embeddings';

export function chunkText(text: string): string[] {
  if (!text) return [];
  const clean = text.trimEnd();
  if (clean.length <= MAX_CHUNK_CHARS) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + MAX_CHUNK_CHARS, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - OVERLAP_CHARS;
    if (start < 0) start = 0;
  }
  return chunks;
}

export async function embedChunks(chunks: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  if (chunks.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, input: batch }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`OpenAI embeddings ${resp.status}: ${body.slice(0, 300)}`);
    }
    const data = (await resp.json()) as { data: Array<{ embedding: number[] }> };
    for (const item of data.data) out.push(item.embedding);
  }
  return out;
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vec] = await embedChunks([query]);
  return vec;
}
