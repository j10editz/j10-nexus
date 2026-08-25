begin;

create table if not exists public.integration_provider_subscriptions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  integration_id uuid not null
    references public.integrations(id)
    on delete cascade,

  endpoint_id uuid not null
    references public.integration_webhook_endpoints(id)
    on delete cascade,

  provider text not null,
  kind text not null,
  mode text not null default 'live',
  state text not null default 'active',

  callback_url text not null,

  external_channel_id text,
  external_resource_id text,
  external_history_id text,
  expires_at timestamptz,

  channel_token_sha256 text,
  provider_request_id text,

  options jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  last_notification_at timestamptz,
  stopped_at timestamptz,

  last_error_code text,
  last_error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint integration_provider_subscriptions_provider_check
    check (
      provider in (
        'gmail',
        'google-calendar'
      )
    ),

  constraint integration_provider_subscriptions_kind_check
    check (
      kind in (
        'gmail.mailbox.watch',
        'google-calendar.events.watch'
      )
    ),

  constraint integration_provider_subscriptions_provider_kind_check
    check (
      (
        provider = 'gmail'
        and kind = 'gmail.mailbox.watch'
      )
      or
      (
        provider = 'google-calendar'
        and kind = 'google-calendar.events.watch'
      )
    ),

  constraint integration_provider_subscriptions_mode_check
    check (
      mode in (
        'simulate',
        'live'
      )
    ),

  constraint integration_provider_subscriptions_state_check
    check (
      state in (
        'simulated',
        'active',
        'stopped',
        'failed'
      )
    ),

  constraint integration_provider_subscriptions_callback_check
    check (
      char_length(callback_url) between 1 and 2048
    ),

  constraint integration_provider_subscriptions_channel_hash_check
    check (
      channel_token_sha256 is null
      or channel_token_sha256 ~ '^[a-f0-9]{64}$'
    ),

  constraint integration_provider_subscriptions_error_message_check
    check (
      last_error_message is null
      or char_length(last_error_message) <= 2000
    ),

  constraint integration_provider_subscriptions_options_size_check
    check (
      octet_length(options::text) <= 32768
    ),

  constraint integration_provider_subscriptions_metadata_size_check
    check (
      octet_length(metadata::text) <= 32768
    )
);

create unique index if not exists
  integration_provider_subscriptions_active_kind_idx
on public.integration_provider_subscriptions (
  integration_id,
  kind
)
where state = 'active';

create unique index if not exists
  integration_provider_subscriptions_calendar_channel_idx
on public.integration_provider_subscriptions (
  external_channel_id
)
where
  provider = 'google-calendar'
  and external_channel_id is not null
  and state = 'active';

create index if not exists
  integration_provider_subscriptions_user_created_idx
on public.integration_provider_subscriptions (
  user_id,
  created_at desc
);

create index if not exists
  integration_provider_subscriptions_endpoint_state_idx
on public.integration_provider_subscriptions (
  endpoint_id,
  state
);

create index if not exists
  integration_provider_subscriptions_expiration_idx
on public.integration_provider_subscriptions (
  expires_at asc
)
where
  state = 'active'
  and expires_at is not null;

alter table public.integration_provider_subscriptions
  enable row level security;

drop policy if exists
  integration_provider_subscriptions_select_own
on public.integration_provider_subscriptions;

create policy integration_provider_subscriptions_select_own
on public.integration_provider_subscriptions
for select
to authenticated
using (
  auth.uid() = user_id
);

drop policy if exists
  integration_provider_subscriptions_insert_own
on public.integration_provider_subscriptions;

create policy integration_provider_subscriptions_insert_own
on public.integration_provider_subscriptions
for insert
to authenticated
with check (
  auth.uid() = user_id
);

drop policy if exists
  integration_provider_subscriptions_update_own
on public.integration_provider_subscriptions;

create policy integration_provider_subscriptions_update_own
on public.integration_provider_subscriptions
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

revoke all
on table public.integration_provider_subscriptions
from public, anon;

grant select, insert, update
on table public.integration_provider_subscriptions
to authenticated;

grant all
on table public.integration_provider_subscriptions
to service_role;

comment on table public.integration_provider_subscriptions is
  'Day 15H persistent Gmail and Google Calendar provider subscription registry.';

comment on column public.integration_provider_subscriptions.channel_token_sha256 is
  'SHA-256 verification hash only. Raw Google Calendar channel tokens must never be persisted.';

comment on column public.integration_provider_subscriptions.metadata is
  'Redacted provider metadata. OAuth tokens, authorization headers, and raw notification payloads are forbidden.';

commit;