-- Matrix Projects workspace persistence hardening
-- Safe to run on an existing database. Adds the table/columns/policies needed
-- for user-owned project snapshots without deleting existing data.

create table if not exists public.matrix_projects (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id text,
  favorite boolean not null default false,
  save_version integer not null default 1,
  last_opened_at timestamptz
);

alter table public.matrix_projects
  add column if not exists workspace_id text,
  add column if not exists favorite boolean not null default false,
  add column if not exists save_version integer not null default 1,
  add column if not exists last_opened_at timestamptz;

create index if not exists matrix_projects_user_updated_idx
  on public.matrix_projects (user_id, updated_at desc);

create index if not exists matrix_projects_user_favorite_idx
  on public.matrix_projects (user_id, favorite, updated_at desc);

create or replace function public.set_matrix_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = coalesce(new.updated_at, now());
  return new;
end;
$$;

drop trigger if exists set_matrix_projects_updated_at on public.matrix_projects;
create trigger set_matrix_projects_updated_at
before insert or update on public.matrix_projects
for each row
execute function public.set_matrix_projects_updated_at();

alter table public.matrix_projects enable row level security;

drop policy if exists "Users can read their matrix projects" on public.matrix_projects;
create policy "Users can read their matrix projects"
  on public.matrix_projects
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their matrix projects" on public.matrix_projects;
create policy "Users can insert their matrix projects"
  on public.matrix_projects
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their matrix projects" on public.matrix_projects;
create policy "Users can update their matrix projects"
  on public.matrix_projects
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their matrix projects" on public.matrix_projects;
create policy "Users can delete their matrix projects"
  on public.matrix_projects
  for delete
  using (auth.uid() = user_id);
