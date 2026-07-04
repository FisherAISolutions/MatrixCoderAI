-- ============================================================================
-- Matrix Coder AI - Matrix Build Suite Saved Builds
-- ============================================================================
-- Safe to re-run. Adds a private saved-build library for Matrix Build Suite
-- configurations so users can reuse complete enhancement selections.
-- ============================================================================

create table if not exists public.build_suite_saved_builds (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references public.users(id) on delete cascade,
  name                    text        not null,
  favorite                boolean     not null default false,
  selection               jsonb       not null,
  advisor_recommendations jsonb       not null default '{"sections":[]}'::jsonb,
  final_prompt            text        not null,
  metadata_version        int         not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists build_suite_saved_builds_user_updated_idx
  on public.build_suite_saved_builds(user_id, updated_at desc);

create index if not exists build_suite_saved_builds_user_favorite_idx
  on public.build_suite_saved_builds(user_id, favorite, updated_at desc);

create or replace function public.set_build_suite_saved_builds_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists build_suite_saved_builds_set_updated_at
  on public.build_suite_saved_builds;
create trigger build_suite_saved_builds_set_updated_at
before update on public.build_suite_saved_builds
for each row
execute function public.set_build_suite_saved_builds_updated_at();

alter table public.build_suite_saved_builds enable row level security;

drop policy if exists "user owns build_suite_saved_builds"
  on public.build_suite_saved_builds;
create policy "user owns build_suite_saved_builds"
  on public.build_suite_saved_builds
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
