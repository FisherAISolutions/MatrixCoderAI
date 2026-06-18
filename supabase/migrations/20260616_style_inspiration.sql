-- ============================================================================
-- Matrix Coder AI - Visual Inspiration Style Profiles
-- ============================================================================
-- Safe to re-run. Adds:
--   1. Private Supabase Storage bucket for temporary screenshot uploads
--   2. style_profiles table for saved AI-generated design briefs
--   3. RLS policies so users only access their own profiles and temp uploads
--
-- Screenshots are temporary. The app deletes them after analysis and only saves
-- the resulting style brief/prompt in style_profiles.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'style-inspiration',
  'style-inspiration',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.style_profiles (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users(id) on delete cascade,
  title        text        not null,
  app_name     text        not null default '',
  feedback     text        not null default '',
  style_brief  jsonb       not null,
  prompt_block text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists style_profiles_user_updated_idx
  on public.style_profiles(user_id, updated_at desc);

create or replace function public.set_style_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists style_profiles_set_updated_at on public.style_profiles;
create trigger style_profiles_set_updated_at
before update on public.style_profiles
for each row
execute function public.set_style_profiles_updated_at();

alter table public.style_profiles enable row level security;

drop policy if exists "user owns style_profiles" on public.style_profiles;
create policy "user owns style_profiles"
  on public.style_profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Storage object policies. Paths are written as:
--   <auth.uid()>/temp/<generated-file-name>
drop policy if exists "user reads style inspiration objects" on storage.objects;
create policy "user reads style inspiration objects"
  on storage.objects
  for select
  using (
    bucket_id = 'style-inspiration'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "user uploads style inspiration objects" on storage.objects;
create policy "user uploads style inspiration objects"
  on storage.objects
  for insert
  with check (
    bucket_id = 'style-inspiration'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "user deletes style inspiration objects" on storage.objects;
create policy "user deletes style inspiration objects"
  on storage.objects
  for delete
  using (
    bucket_id = 'style-inspiration'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
