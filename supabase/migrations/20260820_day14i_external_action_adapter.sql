begin;

create extension if not exists pgcrypto;

create table if not exists public.integration_action_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  provider text not null,
  capability_id text not null,
  mode text not null default 'simulate',
  idempotency_key text not null,
  request_fingerprint text not null,
  status text not null default 'executing',
  requires_approval boolean not null default false,
  response_status integer,
  result_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint integration_action_executions_mode_check
    check (
      mode in (
        'simulate',
        'sandbox',
        'live'
      )
    ),

  constraint integration_action_executions_status_check
    check (
      status in (
        'executing',
        'succeeded',
        'failed',
        'blocked'
      )
    ),

  constraint integration_action_executions_idempotency_key_check
    check (
      char_length(idempotency_key)
      between 8 and 128
    ),

  constraint integration_action_executions_fingerprint_check
    check (
      request_fingerprint ~ '^[0-9a-f]{64}$'
    ),

  constraint integration_action_executions_response_status_check
    check (
      response_status is null
      or response_status between 100 and 599
    ),

  constraint integration_action_executions_completion_check
    check (
      (
        status = 'executing'
        and completed_at is null
      )
      or
      (
        status <> 'executing'
        and completed_at is not null
      )
    ),

  constraint integration_action_executions_user_idempotency_key
    unique (
      user_id,
      integration_id,
      idempotency_key
    )
);

create index if not exists integration_action_executions_user_created_idx
  on public.integration_action_executions(
    user_id,
    created_at desc
  );

create index if not exists integration_action_executions_integration_created_idx
  on public.integration_action_executions(
    integration_id,
    created_at desc
  );

create index if not exists integration_action_executions_status_idx
  on public.integration_action_executions(
    status,
    created_at asc
  )
  where status = 'executing';

alter table public.integration_action_executions
  enable row level security;

drop policy if exists integration_action_executions_select_own
  on public.integration_action_executions;

create policy integration_action_executions_select_own
  on public.integration_action_executions
  for select
  to authenticated
  using (
    auth.uid() = user_id
  );

drop policy if exists integration_action_executions_insert_own
  on public.integration_action_executions;

create policy integration_action_executions_insert_own
  on public.integration_action_executions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
  );

drop policy if exists integration_action_executions_update_own
  on public.integration_action_executions;

create policy integration_action_executions_update_own
  on public.integration_action_executions
  for update
  to authenticated
  using (
    auth.uid() = user_id
  )
  with check (
    auth.uid() = user_id
  );

revoke all
  on table public.integration_action_executions
  from public, anon;

grant select, insert, update
  on table public.integration_action_executions
  to authenticated;

grant all
  on table public.integration_action_executions
  to service_role;

comment on table public.integration_action_executions is
  'Idempotent J10 external action execution receipts without raw credentials or raw action payload storage.';

comment on column public.integration_action_executions.request_fingerprint is
  'SHA-256 fingerprint used to detect idempotency-key reuse with a different action request.';

comment on column public.integration_action_executions.result_metadata is
  'Redacted execution metadata only. Raw credentials and raw external action inputs are forbidden.';

comment on column public.integration_action_executions.requires_approval is
  'Safety classification consumed by the Day 14K permission and human-approval gate.';

commit;