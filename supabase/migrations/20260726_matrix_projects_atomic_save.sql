-- Atomic optimistic-concurrency save for Matrix Projects.
-- Apply through the Supabase migration workflow after
-- 20260716_matrix_projects_hardening.sql.

create or replace function public.save_matrix_project_if_version(
  project_id text,
  project_name text,
  project_description text,
  project_payload jsonb,
  project_created_at timestamptz,
  project_workspace_id text,
  project_favorite boolean,
  project_save_version integer,
  project_last_opened_at timestamptz,
  expected_save_version integer
)
returns setof public.matrix_projects
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved public.matrix_projects%rowtype;
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise insufficient_privilege using message = 'Authentication is required.';
  end if;

  if expected_save_version is null then
    insert into public.matrix_projects (
      id,
      user_id,
      name,
      description,
      payload,
      created_at,
      updated_at,
      workspace_id,
      favorite,
      save_version,
      last_opened_at
    )
    values (
      project_id,
      owner_id,
      project_name,
      project_description,
      project_payload,
      project_created_at,
      now(),
      project_workspace_id,
      project_favorite,
      project_save_version,
      project_last_opened_at
    )
    on conflict (id) do nothing
    returning * into saved;
  else
    update public.matrix_projects
    set
      name = project_name,
      description = project_description,
      payload = project_payload,
      updated_at = now(),
      workspace_id = project_workspace_id,
      favorite = project_favorite,
      save_version = project_save_version,
      last_opened_at = project_last_opened_at
    where id = project_id
      and user_id = owner_id
      and save_version = expected_save_version
    returning * into saved;
  end if;

  if saved.id is not null then
    return next saved;
  end if;
  return;
end;
$$;

revoke all on function public.save_matrix_project_if_version(
  text,
  text,
  text,
  jsonb,
  timestamptz,
  text,
  boolean,
  integer,
  timestamptz,
  integer
) from public;

grant execute on function public.save_matrix_project_if_version(
  text,
  text,
  text,
  jsonb,
  timestamptz,
  text,
  boolean,
  integer,
  timestamptz,
  integer
) to authenticated;
