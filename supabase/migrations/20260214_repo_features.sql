-- ============================================================================
-- CodePilot — Phase 2 (Repository Context Engine) additive migration
-- ============================================================================
-- Safe to re-run. Adds:
--   1. pgvector extension
--   2. file_embeddings table
--   3. RLS policy
--   4. match_file_chunks() RPC for hybrid retrieval (Stage 2C)
--
-- Does NOT modify the existing files / sessions / chat_messages / users tables.
-- ============================================================================

-- Step 1: extension ----------------------------------------------------------
create extension if not exists vector;

-- Step 2: file_embeddings table ---------------------------------------------
create table if not exists public.file_embeddings (
  id            uuid        primary key default gen_random_uuid(),
  session_id   uuid         not null references public.sessions(id) on delete cascade,
  file_id      uuid         not null references public.files(id)    on delete cascade,
  file_path    text         not null,
  chunk_index  int          not null default 0,
  chunk_content text        not null,
  embedding    vector(1536) not null,
  created_at   timestamptz  not null default now(),
  unique (file_id, chunk_index)
);

create index if not exists file_embeddings_session_idx
  on public.file_embeddings(session_id);

create index if not exists file_embeddings_path_idx
  on public.file_embeddings(file_path);

-- HNSW index for fast cosine similarity search
-- Falls back to ivfflat if HNSW is unavailable on the host
do $$
begin
  begin
    execute 'create index if not exists file_embeddings_hnsw on public.file_embeddings using hnsw (embedding vector_cosine_ops)';
  exception when others then
    execute 'create index if not exists file_embeddings_ivfflat on public.file_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end;
end$$;

-- Step 3: RLS ----------------------------------------------------------------
alter table public.file_embeddings enable row level security;

drop policy if exists "user owns file_embeddings" on public.file_embeddings;
create policy "user owns file_embeddings"
  on public.file_embeddings
  for all
  using (
    session_id in (
      select id from public.sessions where user_id = auth.uid()
    )
  )
  with check (
    session_id in (
      select id from public.sessions where user_id = auth.uid()
    )
  );

-- Step 4: RPC for hybrid retrieval (Stage 2C) -------------------------------
create or replace function public.match_file_chunks(
  p_session_id      uuid,
  p_query_embedding vector(1536),
  p_match_count     int default 8
)
returns table (
  file_path     text,
  chunk_index   int,
  chunk_content text,
  similarity    float
)
language sql
stable
as $$
  select
    fe.file_path,
    fe.chunk_index,
    fe.chunk_content,
    1 - (fe.embedding <=> p_query_embedding) as similarity
  from public.file_embeddings fe
  where fe.session_id = p_session_id
  order by fe.embedding <=> p_query_embedding
  limit p_match_count;
$$;

grant execute on function public.match_file_chunks(uuid, vector, int) to authenticated;
grant execute on function public.match_file_chunks(uuid, vector, int) to anon;
