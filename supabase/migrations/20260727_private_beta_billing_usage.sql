-- Private-beta billing and atomic usage accounting.
-- Safe additive migration: existing users and projects are not modified.

create table if not exists public.matrix_billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan_id text not null default 'free-beta'
    check (plan_id in ('internal-admin', 'free-beta', 'starter', 'pro')),
  subscription_status text not null default 'none'
    check (subscription_status in ('none', 'trialing', 'active', 'past_due', 'unpaid', 'cancelled')),
  current_period_end timestamptz,
  entitlement_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matrix_usage_operations (
  operation_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  units integer not null check (units > 0),
  status text not null default 'allowed'
    check (status in ('allowed', 'cancelled', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists matrix_usage_operations_user_period_idx
  on public.matrix_usage_operations(user_id, category, created_at);

create table if not exists public.matrix_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  category text not null,
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start, category)
);

create table if not exists public.matrix_processed_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.matrix_billing_accounts enable row level security;
alter table public.matrix_usage_operations enable row level security;
alter table public.matrix_usage_monthly enable row level security;
alter table public.matrix_processed_webhook_events enable row level security;

drop policy if exists "billing account owner read" on public.matrix_billing_accounts;
create policy "billing account owner read"
  on public.matrix_billing_accounts for select
  using (auth.uid() = user_id);

drop policy if exists "usage operation owner read" on public.matrix_usage_operations;
create policy "usage operation owner read"
  on public.matrix_usage_operations for select
  using (auth.uid() = user_id);

drop policy if exists "usage monthly owner read" on public.matrix_usage_monthly;
create policy "usage monthly owner read"
  on public.matrix_usage_monthly for select
  using (auth.uid() = user_id);

-- No browser insert/update/delete policies are created. Trusted server and
-- Stripe webhook operations use the service role.

create or replace function public.consume_matrix_usage(
  p_operation_id text,
  p_user_id uuid,
  p_category text,
  p_units integer,
  p_limit integer
)
returns table(allowed boolean, used integer, remaining integer, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_used integer;
begin
  if p_operation_id is null or length(trim(p_operation_id)) < 8 then
    raise exception 'invalid operation id';
  end if;
  if p_units < 1 or p_limit < 0 then
    raise exception 'invalid usage values';
  end if;

  if exists(
    select 1
      from public.matrix_usage_operations
      where operation_id = p_operation_id
        and (user_id <> p_user_id or category <> p_category)
  ) then
    raise exception 'operation id collision';
  end if;

  if exists(
    select 1
      from public.matrix_usage_operations
      where operation_id = p_operation_id
        and user_id = p_user_id
        and category = p_category
  ) then
    select coalesce(units, 0) into v_used
      from public.matrix_usage_monthly
      where user_id = p_user_id and period_start = v_period and category = p_category;
    return query select true, coalesce(v_used, 0),
      greatest(0, p_limit - coalesce(v_used, 0)), true;
    return;
  end if;

  insert into public.matrix_usage_monthly(user_id, period_start, category, units)
    values (p_user_id, v_period, p_category, 0)
    on conflict (user_id, period_start, category) do nothing;

  select units into v_used
    from public.matrix_usage_monthly
    where user_id = p_user_id and period_start = v_period and category = p_category
    for update;

  if coalesce(v_used, 0) + p_units > p_limit then
    return query select false, coalesce(v_used, 0),
      greatest(0, p_limit - coalesce(v_used, 0)), false;
    return;
  end if;

  insert into public.matrix_usage_operations(operation_id, user_id, category, units)
    values (p_operation_id, p_user_id, p_category, p_units);
  update public.matrix_usage_monthly
    set units = units + p_units, updated_at = now()
    where user_id = p_user_id and period_start = v_period and category = p_category
    returning units into v_used;

  return query select true, v_used, greatest(0, p_limit - v_used), false;
end;
$$;

revoke all on function public.consume_matrix_usage(text, uuid, text, integer, integer) from public;
grant execute on function public.consume_matrix_usage(text, uuid, text, integer, integer)
  to service_role;

create or replace function public.claim_matrix_webhook_event(
  p_event_id text,
  p_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.matrix_processed_webhook_events(event_id, event_type)
    values (p_event_id, p_event_type)
    on conflict (event_id) do update
      set status = 'processing',
          attempt_count = public.matrix_processed_webhook_events.attempt_count + 1,
          last_error = null,
          updated_at = now()
      where public.matrix_processed_webhook_events.status = 'failed';
  return found or (
    select status = 'processing' and attempt_count > 1
      from public.matrix_processed_webhook_events
      where event_id = p_event_id
  );
end;
$$;

revoke all on function public.claim_matrix_webhook_event(text, text) from public;
grant execute on function public.claim_matrix_webhook_event(text, text)
  to service_role;

create or replace function public.complete_matrix_webhook_event(
  p_event_id text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matrix_processed_webhook_events
    set status = case when p_error is null then 'processed' else 'failed' end,
        last_error = left(p_error, 500),
        processed_at = case when p_error is null then now() else processed_at end,
        updated_at = now()
    where event_id = p_event_id;
end;
$$;

revoke all on function public.complete_matrix_webhook_event(text, text) from public;
grant execute on function public.complete_matrix_webhook_event(text, text)
  to service_role;
