begin;

alter table public.integration_action_executions
  add column if not exists attempt_count integer not null default 1,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists retryable boolean not null default false,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_error_at timestamptz;

update public.integration_action_executions
set
  attempt_count = greatest(attempt_count, 1),
  max_attempts = greatest(max_attempts, 1),
  last_attempted_at = coalesce(last_attempted_at, started_at),
  last_error_at = case
    when status = 'failed'
      then coalesce(last_error_at, completed_at, updated_at)
    else last_error_at
  end;

alter table public.integration_action_executions
  alter column last_attempted_at set default now(),
  alter column last_attempted_at set not null;

alter table public.integration_action_executions
  drop constraint if exists integration_action_executions_attempt_count_check;

alter table public.integration_action_executions
  add constraint integration_action_executions_attempt_count_check
  check (
    attempt_count between 1 and max_attempts
    and max_attempts between 1 and 10
  );

alter table public.integration_action_executions
  drop constraint if exists integration_action_executions_retry_state_check;

alter table public.integration_action_executions
  add constraint integration_action_executions_retry_state_check
  check (
    not retryable
    or (
      status = 'failed'
      and attempt_count < max_attempts
    )
  );

create index if not exists integration_action_executions_retry_queue_idx
  on public.integration_action_executions(next_retry_at asc)
  where status = 'failed' and retryable = true;

alter table public.integration_webhook_events
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists retryable boolean not null default false,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_attempted_at timestamptz,
  add column if not exists last_error_at timestamptz;

update public.integration_webhook_events
set
  attempt_count = case
    when processing_status = 'pending_adapter'
      then greatest(attempt_count, 0)
    else greatest(attempt_count, 1)
  end,
  max_attempts = greatest(max_attempts, 1),
  last_attempted_at = case
    when processing_status = 'pending_adapter'
      then last_attempted_at
    else coalesce(last_attempted_at, adapted_at, processed_at, received_at)
  end,
  last_error_at = case
    when processing_status = 'failed'
      then coalesce(last_error_at, processed_at, adapted_at, received_at)
    else last_error_at
  end;

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_attempt_count_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_attempt_count_check
  check (
    attempt_count between 0 and max_attempts
    and max_attempts between 1 and 10
  );

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_retry_state_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_retry_state_check
  check (
    not retryable
    or (
      processing_status = 'failed'
      and attempt_count < max_attempts
    )
  );

create index if not exists integration_webhook_events_retry_queue_idx
  on public.integration_webhook_events(next_retry_at asc)
  where processing_status = 'failed' and retryable = true;

create table if not exists public.integration_operation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  provider text not null,
  source text not null,
  event_type text not null,
  severity text not null default 'info',
  status text not null,
  correlation_id text not null,
  action_execution_id uuid references public.integration_action_executions(id) on delete set null,
  webhook_event_id uuid references public.integration_webhook_events(id) on delete set null,
  attempt integer not null default 1,
  max_attempts integer not null default 1,
  retryable boolean not null default false,
  next_retry_at timestamptz,
  error_code text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint integration_operation_logs_source_check
    check (
      source in (
        'action',
        'webhook',
        'system'
      )
    ),

  constraint integration_operation_logs_severity_check
    check (
      severity in (
        'debug',
        'info',
        'warning',
        'error'
      )
    ),

  constraint integration_operation_logs_status_check
    check (
      status in (
        'received',
        'started',
        'succeeded',
        'failed',
        'blocked',
        'duplicate',
        'retry_scheduled',
        'retrying',
        'exhausted'
      )
    ),

  constraint integration_operation_logs_attempt_check
    check (
      attempt between 0 and max_attempts
      and max_attempts between 1 and 10
    ),

  constraint integration_operation_logs_correlation_check
    check (
      char_length(correlation_id) between 1 and 160
    ),

  constraint integration_operation_logs_message_check
    check (
      char_length(message) between 1 and 2000
    ),

  constraint integration_operation_logs_metadata_size_check
    check (
      octet_length(metadata::text) <= 32768
    )
);

create index if not exists integration_operation_logs_user_created_idx
  on public.integration_operation_logs(
    user_id,
    created_at desc
  );

create index if not exists integration_operation_logs_integration_created_idx
  on public.integration_operation_logs(
    integration_id,
    created_at desc
  );

create index if not exists integration_operation_logs_errors_idx
  on public.integration_operation_logs(
    integration_id,
    created_at desc
  )
  where severity = 'error';

create index if not exists integration_operation_logs_action_idx
  on public.integration_operation_logs(action_execution_id)
  where action_execution_id is not null;

create index if not exists integration_operation_logs_webhook_idx
  on public.integration_operation_logs(webhook_event_id)
  where webhook_event_id is not null;

alter table public.integration_operation_logs
  enable row level security;

drop policy if exists integration_operation_logs_select_own
  on public.integration_operation_logs;

create policy integration_operation_logs_select_own
  on public.integration_operation_logs
  for select
  to authenticated
  using (
    auth.uid() = user_id
  );

drop policy if exists integration_operation_logs_insert_own
  on public.integration_operation_logs;

create policy integration_operation_logs_insert_own
  on public.integration_operation_logs
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
  );

revoke all
  on table public.integration_operation_logs
  from public, anon;

grant select, insert
  on table public.integration_operation_logs
  to authenticated;

grant all
  on table public.integration_operation_logs
  to service_role;

comment on table public.integration_operation_logs is
  'Immutable, redacted Day 14L action, webhook, failure, and retry observability records.';

comment on column public.integration_operation_logs.metadata is
  'Redacted operational metadata only. Credentials, authorization headers, raw payloads, and raw action input are forbidden.';

comment on column public.integration_action_executions.retryable is
  'True only when the latest failed action attempt is transient and remains inside its bounded retry budget.';

comment on column public.integration_webhook_events.retryable is
  'True only when the latest failed webhook processing attempt is transient and remains inside its bounded retry budget.';

commit;