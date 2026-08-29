begin;

/*
  Day 16F
  Draft concurrency, bounded graph storage, checksums, version history, and
  rollback for J10 Flow. This migration performs no provider calls and creates
  no public or anonymous write path.
*/

create extension if not exists pgcrypto with schema extensions;

alter table public.automations
  add column if not exists draft_revision integer not null default 0,
  add column if not exists draft_updated_at timestamptz;

alter table public.automation_versions
  add column if not exists graph_checksum text,
  add column if not exists published_by uuid,
  add column if not exists rollback_of_version_id uuid,
  add column if not exists publication_note text;

update public.automation_versions
set graph_checksum = encode(
  extensions.digest(graph_snapshot::text, 'sha256'::text),
  'hex'
)
where graph_checksum is null;

alter table public.automation_versions
  alter column graph_checksum set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automations'::regclass
      and conname = 'automations_draft_revision_nonnegative_check'
  ) then
    alter table public.automations
      add constraint automations_draft_revision_nonnegative_check
      check (draft_revision >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automations'::regclass
      and conname = 'automations_draft_graph_size_check'
  ) then
    alter table public.automations
      add constraint automations_draft_graph_size_check
      check (octet_length(draft_graph::text) <= 524288);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_versions'::regclass
      and conname = 'automation_versions_graph_size_check'
  ) then
    alter table public.automation_versions
      add constraint automation_versions_graph_size_check
      check (octet_length(graph_snapshot::text) <= 524288);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_versions'::regclass
      and conname = 'automation_versions_graph_checksum_check'
  ) then
    alter table public.automation_versions
      add constraint automation_versions_graph_checksum_check
      check (graph_checksum ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automations'::regclass
      and conname = 'automations_published_version_fkey'
  ) then
    alter table public.automations
      add constraint automations_published_version_fkey
      foreign key (published_version_id)
      references public.automation_versions(id)
      on delete set null
      deferrable initially deferred;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_versions'::regclass
      and conname = 'automation_versions_published_by_fkey'
  ) then
    alter table public.automation_versions
      add constraint automation_versions_published_by_fkey
      foreign key (published_by)
      references auth.users(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_versions'::regclass
      and conname = 'automation_versions_rollback_source_fkey'
  ) then
    alter table public.automation_versions
      add constraint automation_versions_rollback_source_fkey
      foreign key (rollback_of_version_id)
      references public.automation_versions(id)
      on delete set null;
  end if;
end $$;

create index if not exists automations_user_draft_revision_idx
  on public.automations (user_id, id, draft_revision);

create index if not exists automation_versions_rollback_source_idx
  on public.automation_versions (rollback_of_version_id)
  where rollback_of_version_id is not null;

create or replace function public.set_automation_version_graph_checksum()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth, extensions
as $$
begin
  new.graph_checksum := encode(
    extensions.digest(
      new.graph_snapshot::text,
      'sha256'::text
    ),
    'hex'
  );

  if new.status = 'published' and new.published_by is null then
    new.published_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists automation_versions_set_graph_checksum
  on public.automation_versions;

create trigger automation_versions_set_graph_checksum
before insert or update of graph_snapshot, status
on public.automation_versions
for each row
execute function public.set_automation_version_graph_checksum();

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
      or new.graph_checksum is distinct from old.graph_checksum
      or new.compiled_trigger_type is distinct from old.compiled_trigger_type
      or new.compiled_trigger_config is distinct from old.compiled_trigger_config
      or new.compiled_schedule_expression is distinct from old.compiled_schedule_expression
      or new.compiled_timezone is distinct from old.compiled_timezone
      or new.validation_errors is distinct from old.validation_errors
      or new.validation_warnings is distinct from old.validation_warnings
      or new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by
      or new.rollback_of_version_id is distinct from old.rollback_of_version_id
      or new.publication_note is distinct from old.publication_note
    then
      raise exception 'Published automation versions are immutable.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.save_automation_draft_graph(
  p_automation_id uuid,
  p_graph jsonb,
  p_graph_version text,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_automation record;
  v_next_revision integer;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  if p_graph_version <> '2026-08-day16' then
    raise exception 'Unsupported J10 Flow graph version.';
  end if;

  if jsonb_typeof(p_graph) <> 'object' then
    raise exception 'Workflow draft graph must be a JSON object.';
  end if;

  if octet_length(p_graph::text) > 524288 then
    raise exception 'Workflow draft graph exceeds the 512 KiB limit.';
  end if;

  select
    id,
    user_id,
    status,
    draft_revision
  into v_automation
  from public.automations
  where id = p_automation_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Workflow not found.';
  end if;

  if v_automation.status = 'archived' then
    raise exception 'Archived workflows cannot be edited.';
  end if;

  if v_automation.draft_revision <> p_expected_revision then
    raise exception using
      message = 'Workflow draft changed in another session.',
      errcode = '40001';
  end if;

  v_next_revision := v_automation.draft_revision + 1;

  update public.automations
  set
    draft_graph = p_graph,
    draft_graph_version = p_graph_version,
    draft_revision = v_next_revision,
    draft_updated_at = v_now,
    updated_at = v_now
  where id = p_automation_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'automationId', p_automation_id,
    'revision', v_next_revision,
    'draftUpdatedAt', v_now
  );
end;
$$;

create or replace function public.rollback_automation_version_runtime(
  p_automation_id uuid,
  p_source_version_id uuid,
  p_activate boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_automation record;
  v_source record;
  v_new_version_id uuid;
  v_new_version_number integer;
  v_step_count integer;
  v_now timestamptz := now();
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Unauthorized.';
  end if;

  select
    id,
    user_id,
    name,
    status,
    published_version_id,
    draft_revision
  into v_automation
  from public.automations
  where id = p_automation_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Workflow not found.';
  end if;

  if v_automation.status = 'archived' then
    raise exception 'Archived workflows cannot be rolled back.';
  end if;

  select *
  into v_source
  from public.automation_versions
  where id = p_source_version_id
    and automation_id = p_automation_id
    and user_id = v_user_id
    and status in ('published', 'retired')
  for share;

  if not found then
    raise exception 'Rollback source version was not found.';
  end if;

  select count(*)
  into v_step_count
  from public.automation_version_steps
  where automation_version_id = v_source.id
    and automation_id = p_automation_id
    and user_id = v_user_id
    and is_enabled = true;

  if v_step_count = 0 then
    raise exception 'Rollback source has no enabled runtime steps.';
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_new_version_number
  from public.automation_versions
  where automation_id = p_automation_id
    and user_id = v_user_id;

  insert into public.automation_versions (
    automation_id,
    user_id,
    version_number,
    status,
    graph_version,
    graph_snapshot,
    graph_checksum,
    compiled_trigger_type,
    compiled_trigger_config,
    compiled_schedule_expression,
    compiled_timezone,
    validation_errors,
    validation_warnings,
    published_at,
    published_by,
    rollback_of_version_id,
    publication_note
  ) values (
    p_automation_id,
    v_user_id,
    v_new_version_number,
    'published',
    v_source.graph_version,
    v_source.graph_snapshot,
    v_source.graph_checksum,
    v_source.compiled_trigger_type,
    v_source.compiled_trigger_config,
    v_source.compiled_schedule_expression,
    v_source.compiled_timezone,
    v_source.validation_errors,
    v_source.validation_warnings,
    v_now,
    v_user_id,
    v_source.id,
    format('Rollback of workflow version %s.', v_source.version_number)
  )
  returning id into v_new_version_id;

  insert into public.automation_version_steps (
    automation_version_id,
    automation_id,
    source_step_id,
    user_id,
    graph_node_id,
    step_order,
    name,
    step_type,
    action_type,
    employee_id,
    employee_name,
    task_type,
    instructions,
    config,
    condition_config,
    requires_approval,
    approval_type,
    on_success_node_id,
    on_failure_node_id,
    on_success_step_order,
    on_failure_step_order,
    is_enabled
  )
  select
    v_new_version_id,
    automation_id,
    source_step_id,
    user_id,
    graph_node_id,
    step_order,
    name,
    step_type,
    action_type,
    employee_id,
    employee_name,
    task_type,
    instructions,
    config,
    condition_config,
    requires_approval,
    approval_type,
    on_success_node_id,
    on_failure_node_id,
    on_success_step_order,
    on_failure_step_order,
    is_enabled
  from public.automation_version_steps
  where automation_version_id = v_source.id
    and automation_id = p_automation_id
    and user_id = v_user_id
  order by step_order;

  delete from public.automation_steps
  where automation_id = p_automation_id
    and user_id = v_user_id;

  insert into public.automation_steps (
    automation_id,
    user_id,
    step_order,
    name,
    step_type,
    action_type,
    employee_id,
    employee_name,
    task_type,
    instructions,
    config,
    condition_config,
    requires_approval,
    approval_type,
    on_success_step_id,
    on_failure_step_id,
    is_enabled
  )
  select
    automation_id,
    user_id,
    step_order,
    name,
    step_type,
    action_type,
    employee_id,
    employee_name,
    task_type,
    instructions,
    config,
    condition_config,
    requires_approval,
    approval_type,
    null,
    null,
    is_enabled
  from public.automation_version_steps
  where automation_version_id = v_new_version_id
    and automation_id = p_automation_id
    and user_id = v_user_id
  order by step_order;

  update public.automations
  set
    status = case when p_activate then 'active' else status end,
    trigger_type = v_source.compiled_trigger_type,
    trigger_config = v_source.compiled_trigger_config,
    schedule_expression = v_source.compiled_schedule_expression,
    timezone = v_source.compiled_timezone,
    draft_graph = v_source.graph_snapshot,
    draft_graph_version = v_source.graph_version,
    draft_revision = draft_revision + 1,
    draft_updated_at = v_now,
    published_version_id = v_new_version_id,
    last_published_at = v_now,
    updated_at = v_now
  where id = p_automation_id
    and user_id = v_user_id;

  update public.automation_versions
  set
    status = 'retired',
    retired_at = v_now
  where automation_id = p_automation_id
    and user_id = v_user_id
    and status = 'published'
    and id <> v_new_version_id;

  return jsonb_build_object(
    'success', true,
    'automationId', p_automation_id,
    'sourceVersionId', v_source.id,
    'sourceVersionNumber', v_source.version_number,
    'automationVersionId', v_new_version_id,
    'versionNumber', v_new_version_number,
    'stepCount', v_step_count,
    'activated', p_activate
  );
end;
$$;

revoke all
  on function public.save_automation_draft_graph(uuid, jsonb, text, integer)
  from public;

revoke all
  on function public.save_automation_draft_graph(uuid, jsonb, text, integer)
  from anon;

grant execute
  on function public.save_automation_draft_graph(uuid, jsonb, text, integer)
  to authenticated;

grant execute
  on function public.save_automation_draft_graph(uuid, jsonb, text, integer)
  to service_role;

revoke all
  on function public.rollback_automation_version_runtime(uuid, uuid, boolean)
  from public;

revoke all
  on function public.rollback_automation_version_runtime(uuid, uuid, boolean)
  from anon;

grant execute
  on function public.rollback_automation_version_runtime(uuid, uuid, boolean)
  to authenticated;

grant execute
  on function public.rollback_automation_version_runtime(uuid, uuid, boolean)
  to service_role;

commit;
