begin;

create extension if not exists pgcrypto;

/*
  Day 16C
  Immutable automation version foundation for J10 Flow.

  Purpose:
  - Preserve the exact published graph used by a run.
  - Prevent paused/approved/retried runs from resuming against edited draft steps.
  - Store stable graph node IDs beside compiled runtime step order.
*/

create table if not exists public.automation_versions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft',
  graph_version text not null,
  graph_snapshot jsonb not null default '{}'::jsonb,
  compiled_trigger_type text not null,
  compiled_trigger_config jsonb not null default '{}'::jsonb,
  compiled_schedule_expression text,
  compiled_timezone text not null default 'UTC',
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_versions
  add column if not exists automation_id uuid,
  add column if not exists user_id uuid,
  add column if not exists version_number integer,
  add column if not exists status text not null default 'draft',
  add column if not exists graph_version text,
  add column if not exists graph_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists compiled_trigger_type text,
  add column if not exists compiled_trigger_config jsonb not null default '{}'::jsonb,
  add column if not exists compiled_schedule_expression text,
  add column if not exists compiled_timezone text not null default 'UTC',
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists validation_warnings jsonb not null default '[]'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists retired_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.automation_version_steps (
  id uuid primary key default gen_random_uuid(),
  automation_version_id uuid not null references public.automation_versions(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  source_step_id uuid references public.automation_steps(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  graph_node_id text not null,
  step_order integer not null,
  name text,
  step_type text not null,
  action_type text,
  employee_id uuid,
  employee_name text,
  task_type text,
  instructions text,
  config jsonb not null default '{}'::jsonb,
  condition_config jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default false,
  approval_type text,
  on_success_node_id text,
  on_failure_node_id text,
  on_success_step_order integer,
  on_failure_step_order integer,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.automation_version_steps
  add column if not exists automation_version_id uuid,
  add column if not exists automation_id uuid,
  add column if not exists source_step_id uuid,
  add column if not exists user_id uuid,
  add column if not exists graph_node_id text,
  add column if not exists step_order integer,
  add column if not exists name text,
  add column if not exists step_type text,
  add column if not exists action_type text,
  add column if not exists employee_id uuid,
  add column if not exists employee_name text,
  add column if not exists task_type text,
  add column if not exists instructions text,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists condition_config jsonb not null default '{}'::jsonb,
  add column if not exists requires_approval boolean not null default false,
  add column if not exists approval_type text,
  add column if not exists on_success_node_id text,
  add column if not exists on_failure_node_id text,
  add column if not exists on_success_step_order integer,
  add column if not exists on_failure_step_order integer,
  add column if not exists is_enabled boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

alter table public.automations
  add column if not exists published_version_id uuid,
  add column if not exists draft_graph jsonb not null default '{}'::jsonb,
  add column if not exists draft_graph_version text,
  add column if not exists last_published_at timestamptz;

alter table public.automation_runs
  add column if not exists automation_version_id uuid,
  add column if not exists graph_snapshot jsonb not null default '{}'::jsonb;

alter table public.automation_run_steps
  add column if not exists automation_version_id uuid,
  add column if not exists graph_node_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_versions'::regclass
      and conname = 'automation_versions_status_check'
  ) then
    alter table public.automation_versions
      add constraint automation_versions_status_check
      check (
        status = any (
          array[
            'draft',
            'published',
            'retired',
            'archived'
          ]::text[]
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_versions'::regclass
      and conname = 'automation_versions_number_positive_check'
  ) then
    alter table public.automation_versions
      add constraint automation_versions_number_positive_check
      check (version_number > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_versions'::regclass
      and conname = 'automation_versions_automation_number_key'
  ) then
    alter table public.automation_versions
      add constraint automation_versions_automation_number_key
      unique (automation_id, version_number);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_version_steps'::regclass
      and conname = 'automation_version_steps_order_positive_check'
  ) then
    alter table public.automation_version_steps
      add constraint automation_version_steps_order_positive_check
      check (step_order > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_version_steps'::regclass
      and conname = 'automation_version_steps_node_key'
  ) then
    alter table public.automation_version_steps
      add constraint automation_version_steps_node_key
      unique (automation_version_id, graph_node_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_version_steps'::regclass
      and conname = 'automation_version_steps_order_key'
  ) then
    alter table public.automation_version_steps
      add constraint automation_version_steps_order_key
      unique (automation_version_id, step_order);
  end if;
end $$;

create index if not exists automation_versions_automation_idx
  on public.automation_versions (automation_id, version_number desc);

create index if not exists automation_versions_user_status_idx
  on public.automation_versions (user_id, status, created_at desc);

create index if not exists automation_version_steps_version_order_idx
  on public.automation_version_steps (automation_version_id, step_order);

create index if not exists automation_version_steps_node_idx
  on public.automation_version_steps (automation_version_id, graph_node_id);

create index if not exists automations_published_version_idx
  on public.automations (published_version_id);

create index if not exists automation_runs_version_idx
  on public.automation_runs (automation_version_id);

create index if not exists automation_run_steps_version_node_idx
  on public.automation_run_steps (automation_version_id, graph_node_id);

create or replace function public.set_automation_version_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists automation_versions_set_updated_at
  on public.automation_versions;

create trigger automation_versions_set_updated_at
before update on public.automation_versions
for each row
execute function public.set_automation_version_updated_at();

create or replace function public.prevent_published_automation_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' then
    if
      new.automation_id is distinct from old.automation_id
      or new.user_id is distinct from old.user_id
      or new.version_number is distinct from old.version_number
      or new.graph_version is distinct from old.graph_version
      or new.graph_snapshot is distinct from old.graph_snapshot
      or new.compiled_trigger_type is distinct from old.compiled_trigger_type
      or new.compiled_trigger_config is distinct from old.compiled_trigger_config
      or new.compiled_schedule_expression is distinct from old.compiled_schedule_expression
      or new.compiled_timezone is distinct from old.compiled_timezone
      or new.validation_errors is distinct from old.validation_errors
      or new.validation_warnings is distinct from old.validation_warnings
      or new.published_at is distinct from old.published_at
    then
      raise exception 'Published automation versions are immutable.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists automation_versions_prevent_published_mutation
  on public.automation_versions;

create trigger automation_versions_prevent_published_mutation
before update on public.automation_versions
for each row
execute function public.prevent_published_automation_version_mutation();

create or replace function public.prevent_automation_version_step_mutation()
returns trigger
language plpgsql
as $$
declare
  parent_status text;
begin
  select status
  into parent_status
  from public.automation_versions
  where id = old.automation_version_id;

  if parent_status = 'published' then
    raise exception 'Published automation version steps are immutable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists automation_version_steps_prevent_published_update
  on public.automation_version_steps;

create trigger automation_version_steps_prevent_published_update
before update on public.automation_version_steps
for each row
execute function public.prevent_automation_version_step_mutation();

drop trigger if exists automation_version_steps_prevent_published_delete
  on public.automation_version_steps;

create trigger automation_version_steps_prevent_published_delete
before delete on public.automation_version_steps
for each row
execute function public.prevent_automation_version_step_mutation();

alter table public.automation_versions
  enable row level security;

alter table public.automation_version_steps
  enable row level security;

drop policy if exists automation_versions_select_own
  on public.automation_versions;

create policy automation_versions_select_own
on public.automation_versions
for select
to authenticated
using (
  auth.uid() = user_id
);

drop policy if exists automation_versions_insert_own
  on public.automation_versions;

create policy automation_versions_insert_own
on public.automation_versions
for insert
to authenticated
with check (
  auth.uid() = user_id
);

drop policy if exists automation_versions_update_own
  on public.automation_versions;

create policy automation_versions_update_own
on public.automation_versions
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

drop policy if exists automation_version_steps_select_own
  on public.automation_version_steps;

create policy automation_version_steps_select_own
on public.automation_version_steps
for select
to authenticated
using (
  auth.uid() = user_id
);

drop policy if exists automation_version_steps_insert_own
  on public.automation_version_steps;

create policy automation_version_steps_insert_own
on public.automation_version_steps
for insert
to authenticated
with check (
  auth.uid() = user_id
);

revoke all
  on public.automation_versions
  from anon;

revoke all
  on public.automation_version_steps
  from anon;

grant select, insert, update
  on public.automation_versions
  to authenticated;

grant select, insert
  on public.automation_version_steps
  to authenticated;

grant all
  on public.automation_versions
  to service_role;

grant all
  on public.automation_version_steps
  to service_role;

commit;

