begin;

create extension if not exists pgcrypto;

create table if not exists public.integration_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  environment text not null default 'development',
  endpoint_key uuid not null default gen_random_uuid(),
  status text not null default 'active',
  max_payload_bytes integer not null default 262144,
  last_received_at timestamptz,
  last_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint integration_webhook_endpoints_connection_unique
    unique (integration_id),

  constraint integration_webhook_endpoints_key_unique
    unique (endpoint_key),

  constraint integration_webhook_endpoints_environment_check
    check (
      environment in (
        'development',
        'sandbox',
        'production'
      )
    ),

  constraint integration_webhook_endpoints_status_check
    check (
      status in (
        'active',
        'disabled'
      )
    ),

  constraint integration_webhook_endpoints_payload_limit_check
    check (
      max_payload_bytes between 1024 and 1048576
    )
);

create table if not exists public.integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.integration_webhook_endpoints(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  request_id uuid not null,
  event_type text not null,
  external_event_id text,
  replay_key text not null,
  signature_status text not null,
  processing_status text not null default 'pending_adapter',
  payload_sha256 text not null,
  payload jsonb not null default '{}'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  failure_code text,
  failure_message text,

  constraint integration_webhook_events_replay_unique
    unique (
      endpoint_id,
      replay_key
    ),

  constraint integration_webhook_events_signature_status_check
    check (
      signature_status in (
        'valid',
        'invalid',
        'not_required',
        'not_configured'
      )
    ),

  constraint integration_webhook_events_processing_status_check
    check (
      processing_status in (
        'pending_adapter',
        'duplicate',
        'processed',
        'failed',
        'rejected'
      )
    ),

  constraint integration_webhook_events_payload_hash_check
    check (
      payload_sha256 ~ '^[0-9a-f]{64}$'
    )
);

create index if not exists integration_webhook_endpoints_user_idx
  on public.integration_webhook_endpoints(
    user_id,
    updated_at desc
  );

create index if not exists integration_webhook_events_user_received_idx
  on public.integration_webhook_events(
    user_id,
    received_at desc
  );

create index if not exists integration_webhook_events_integration_received_idx
  on public.integration_webhook_events(
    integration_id,
    received_at desc
  );

create index if not exists integration_webhook_events_request_idx
  on public.integration_webhook_events(request_id);

alter table public.integration_webhook_endpoints
  enable row level security;

alter table public.integration_webhook_events
  enable row level security;

drop policy if exists integration_webhook_endpoints_select_own
  on public.integration_webhook_endpoints;

create policy integration_webhook_endpoints_select_own
  on public.integration_webhook_endpoints
  for select
  to authenticated
  using (
    auth.uid() = user_id
  );

drop policy if exists integration_webhook_endpoints_insert_own
  on public.integration_webhook_endpoints;

create policy integration_webhook_endpoints_insert_own
  on public.integration_webhook_endpoints
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
  );

drop policy if exists integration_webhook_endpoints_update_own
  on public.integration_webhook_endpoints;

create policy integration_webhook_endpoints_update_own
  on public.integration_webhook_endpoints
  for update
  to authenticated
  using (
    auth.uid() = user_id
  )
  with check (
    auth.uid() = user_id
  );

drop policy if exists integration_webhook_events_select_own
  on public.integration_webhook_events;

create policy integration_webhook_events_select_own
  on public.integration_webhook_events
  for select
  to authenticated
  using (
    auth.uid() = user_id
  );

revoke all
  on table public.integration_webhook_endpoints
  from public, anon;

revoke all
  on table public.integration_webhook_events
  from public, anon;

grant select, insert, update
  on table public.integration_webhook_endpoints
  to authenticated;

grant select
  on table public.integration_webhook_events
  to authenticated;

grant all
  on table public.integration_webhook_endpoints
  to service_role;

grant all
  on table public.integration_webhook_events
  to service_role;

comment on table public.integration_webhook_endpoints is
  'J10 NEXUS protected inbound endpoint registry for integration connections.';

comment on table public.integration_webhook_events is
  'J10 NEXUS immutable webhook receipts with signature state and replay protection.';

comment on column public.integration_webhook_events.processing_status is
  'Day 14G stores pending_adapter; Day 14H normalizes and Day 14J dispatches.';

commit;