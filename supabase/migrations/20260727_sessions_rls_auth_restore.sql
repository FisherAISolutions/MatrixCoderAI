-- Matrix workspace sessions are owned by the authenticated Supabase user.
-- This migration replaces legacy sessions policies without modifying data.

alter table public.sessions enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'sessions'
  loop
    execute format(
      'drop policy if exists %I on public.sessions',
      existing_policy.policyname
    );
  end loop;
end
$$;

create policy "sessions_select_own"
on public.sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "sessions_insert_own"
on public.sessions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "sessions_update_own"
on public.sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "sessions_delete_own"
on public.sessions
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.sessions from anon;
grant select, insert, update, delete on table public.sessions to authenticated;

-- sessions.user_id references public.users(id). Keep that profile row in sync
-- from trusted auth.users data so browser clients never need profile INSERT rights.
create or replace function public.ensure_matrix_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists ensure_matrix_user_profile_on_auth_user on auth.users;
create trigger ensure_matrix_user_profile_on_auth_user
after insert or update of email on auth.users
for each row execute function public.ensure_matrix_user_profile();

insert into public.users (id, email)
select id, email
from auth.users
on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
