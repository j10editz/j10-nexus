begin;

/*
  Day 16E
  Atomic runtime switch for J10 Flow published versions.

  Purpose:
  - Replace live automation_steps from immutable automation_version_steps.
  - Update automations runtime metadata in the same database transaction.
  - Prevent workflows from losing live steps if one write fails mid-publish.
*/

create or replace function public.publish_automation_version_runtime(
  p_automation_id uuid,
  p_automation_version_id uuid,
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
  v_version record;
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
    published_version_id
  into v_automation
  from public.automations
  where id = p_automation_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Workflow not found.';
  end if;

  if v_automation.status = 'archived' then
    raise exception 'Archived workflows cannot be published.';
  end if;

  select
    id,
    automation_id,
    user_id,
    version_number,
    status,
    graph_version,
    graph_snapshot,
    compiled_trigger_type,
    compiled_trigger_config,
    compiled_schedule_expression,
    compiled_timezone
  into v_version
  from public.automation_versions
  where id = p_automation_version_id
    and automation_id = p_automation_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Workflow version not found.';
  end if;

  if v_version.status <> 'published' then
    raise exception 'Only published workflow versions can be switched into runtime.';
  end if;

  select count(*)
  into v_step_count
  from public.automation_version_steps
  where automation_version_id = p_automation_version_id
    and automation_id = p_automation_id
    and user_id = v_user_id
    and is_enabled = true;

  if v_step_count = 0 then
    raise exception 'Published workflow version has no enabled runtime steps.';
  end if;

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
    version_steps.automation_id,
    version_steps.user_id,
    version_steps.step_order,
    version_steps.name,
    version_steps.step_type,
    version_steps.action_type,
    version_steps.employee_id,
    version_steps.employee_name,
    version_steps.task_type,
    version_steps.instructions,
    version_steps.config,
    version_steps.condition_config,
    version_steps.requires_approval,
    version_steps.approval_type,
    null,
    null,
    version_steps.is_enabled
  from public.automation_version_steps as version_steps
  where version_steps.automation_version_id = p_automation_version_id
    and version_steps.automation_id = p_automation_id
    and version_steps.user_id = v_user_id
  order by version_steps.step_order;

  update public.automations
  set
    status = case
      when p_activate then 'active'
      else status
    end,
    trigger_type = v_version.compiled_trigger_type,
    trigger_config = v_version.compiled_trigger_config,
    schedule_expression = v_version.compiled_schedule_expression,
    timezone = v_version.compiled_timezone,
    draft_graph = v_version.graph_snapshot,
    draft_graph_version = v_version.graph_version,
    published_version_id = v_version.id,
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
    and id <> v_version.id;

  return jsonb_build_object(
    'success', true,
    'automationId', p_automation_id,
    'automationVersionId', p_automation_version_id,
    'versionNumber', v_version.version_number,
    'stepCount', v_step_count,
    'activated', p_activate
  );
end;
$$;

revoke all
  on function public.publish_automation_version_runtime(uuid, uuid, boolean)
  from public;

revoke all
  on function public.publish_automation_version_runtime(uuid, uuid, boolean)
  from anon;

grant execute
  on function public.publish_automation_version_runtime(uuid, uuid, boolean)
  to authenticated;

grant execute
  on function public.publish_automation_version_runtime(uuid, uuid, boolean)
  to service_role;

commit;


