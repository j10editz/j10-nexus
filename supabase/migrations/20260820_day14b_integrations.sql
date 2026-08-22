begin;

create extension if not exists pgcrypto;

/*
  Day 14B
  Integration connection model, lifecycle state, ownership,
  status history, row-level security, and operational metadata.
*/

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'not_configured',
  environment text not null default 'development',
  account_label text,
  credential_reference uuid,
  external_account_id text,
  external_account_label text,
  granted_scopes text[] not null default '{}'::text[],
  enabled_capabilities text[] not null default '{}'::text[],
  public_configuration jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_health_check_at timestamptz,
  last_error_code text,
  last_error_message text,
  status_reason text,
  status_metadata jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integrations
  add column if not exists environment text
    not null default 'development',
  add column if not exists credential_reference uuid,
  add column if not exists external_account_label text,
  add column if not exists granted_scopes text[]
    not null default '{}'::text[],
  add column if not exists enabled_capabilities text[]
    not null default '{}'::text[],
  add column if not exists public_configuration jsonb
    not null default '{}'::jsonb,
  add column if not exists metadata jsonb
    not null default '{}'::jsonb,
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists status_reason text,
  add column if not exists status_metadata jsonb
    not null default '{}'::jsonb,
  add column if not exists revoked_at timestamptz,
  add column if not exists disabled_at timestamptz,
  add column if not exists updated_at timestamptz
    not null default now();

update public.integrations
set
  status = coalesce(status, 'not_configured'),
  environment = coalesce(environment, 'development'),
  granted_scopes = coalesce(granted_scopes, '{}'::text[]),
  enabled_capabilities = coalesce(enabled_capabilities, '{}'::text[]),
  public_configuration = coalesce(public_configuration, '{}'::jsonb),
  metadata = coalesce(metadata, '{}'::jsonb),
  status_metadata = coalesce(status_metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.integrations
  alter column status set default 'not_configured',
  alter column status set not null,
  alter column environment set default 'development',
  alter column environment set not null,
  alter column granted_scopes set default '{}'::text[],
  alter column granted_scopes set not null,
  alter column enabled_capabilities set default '{}'::text[],
  alter column enabled_capabilities set not null,
  alter column public_configuration set default '{}'::jsonb,
  alter column public_configuration set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column status_metadata set default '{}'::jsonb,
  alter column status_metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_provider_check'
  ) then
    alter table public.integrations
      add constraint integrations_provider_check
      check (
        provider = any (
          array[
            'gmail',
            'google-calendar',
            'whatsapp-business',
            'shopify',
            'stripe',
            'generic-webhook',

            /* Preserved legacy identifiers. */
            'email',
            'calendar',
            'google_calendar',
            'whatsapp',
            'whatsapp_business',
            'webhook',
            'generic_webhook',
            'crm',
            'marketing',
            'notifications'
          ]::text[]
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_status_check'
  ) then
    alter table public.integrations
      add constraint integrations_status_check
      check (
        status = any (
          array[
            'not_configured',
            'pending',
            'connected',
            'degraded',
            'disconnected',
            'error',
            'revoked',
            'disabled'
          ]::text[]
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_environment_check'
  ) then
    alter table public.integrations
      add constraint integrations_environment_check
      check (
        environment = any (
          array[
            'development',
            'sandbox',
            'production'
          ]::text[]
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_user_provider_key'
  ) then
    alter table public.integrations
      add constraint integrations_user_provider_key
      unique (
        user_id,
        provider
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_account_label_check'
  ) then
    alter table public.integrations
      add constraint integrations_account_label_check
      check (
        account_label is null
        or char_length(account_label) between 1 and 160
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_public_configuration_size_check'
  ) then
    alter table public.integrations
      add constraint integrations_public_configuration_size_check
      check (
        octet_length(public_configuration::text) <= 32768
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_metadata_size_check'
  ) then
    alter table public.integrations
      add constraint integrations_metadata_size_check
      check (
        octet_length(metadata::text) <= 32768
        and octet_length(status_metadata::text) <= 32768
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_error_size_check'
  ) then
    alter table public.integrations
      add constraint integrations_error_size_check
      check (
        (
          last_error_code is null
          or char_length(last_error_code) <= 160
        )
        and
        (
          last_error_message is null
          or char_length(last_error_message) <= 2000
        )
        and
        (
          status_reason is null
          or char_length(status_reason) <= 2000
        )
      );
  end if;
end
$$;

create index if not exists integrations_user_created_idx
  on public.integrations(
    user_id,
    created_at asc
  );

create index if not exists integrations_user_status_idx
  on public.integrations(
    user_id,
    status
  );

create index if not exists integrations_provider_idx
  on public.integrations(provider);

create table if not exists public.integration_status_history (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null
    references public.integrations(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  previous_status text,
  next_status text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint integration_status_history_previous_status_check
    check (
      previous_status is null
      or previous_status = any (
        array[
          'not_configured',
          'pending',
          'connected',
          'degraded',
          'disconnected',
          'error',
          'revoked',
          'disabled'
        ]::text[]
      )
    ),

  constraint integration_status_history_next_status_check
    check (
      next_status = any (
        array[
          'not_configured',
          'pending',
          'connected',
          'degraded',
          'disconnected',
          'error',
          'revoked',
          'disabled'
        ]::text[]
      )
    ),

  constraint integration_status_history_reason_check
    check (
      reason is null
      or char_length(reason) <= 2000
    ),

  constraint integration_status_history_metadata_size_check
    check (
      octet_length(metadata::text) <= 32768
    )
);

create index if not exists integration_status_history_connection_idx
  on public.integration_status_history(
    integration_id,
    created_at desc
  );

create index if not exists integration_status_history_user_idx
  on public.integration_status_history(
    user_id,
    created_at desc
  );

create or replace function public.set_integration_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists integrations_set_updated_at
  on public.integrations;

create trigger integrations_set_updated_at
  before update
  on public.integrations
  for each row
  execute function public.set_integration_updated_at();

create or replace function public.record_integration_status_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (
    tg_op = 'INSERT'
    or old.status is distinct from new.status
  ) then
    insert into public.integration_status_history (
      integration_id,
      user_id,
      previous_status,
      next_status,
      reason,
      metadata
    )
    values (
      new.id,
      new.user_id,
      case
        when tg_op = 'INSERT' then null
        else old.status
      end,
      new.status,
      new.status_reason,
      coalesce(
        new.status_metadata,
        '{}'::jsonb
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists integrations_record_status_history
  on public.integrations;

create trigger integrations_record_status_history
  after insert or update of status
  on public.integrations
  for each row
  execute function public.record_integration_status_history();

alter table public.integrations
  enable row level security;

alter table public.integration_status_history
  enable row level security;

drop policy if exists integrations_select_own
  on public.integrations;

create policy integrations_select_own
  on public.integrations
  for select
  to authenticated
  using (
    auth.uid() = user_id
  );

drop policy if exists integrations_insert_own
  on public.integrations;

create policy integrations_insert_own
  on public.integrations
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
  );

drop policy if exists integrations_update_own
  on public.integrations;

create policy integrations_update_own
  on public.integrations
  for update
  to authenticated
  using (
    auth.uid() = user_id
  )
  with check (
    auth.uid() = user_id
  );

drop policy if exists integrations_delete_own
  on public.integrations;

create policy integrations_delete_own
  on public.integrations
  for delete
  to authenticated
  using (
    auth.uid() = user_id
  );

drop policy if exists integration_status_history_select_own
  on public.integration_status_history;

create policy integration_status_history_select_own
  on public.integration_status_history
  for select
  to authenticated
  using (
    auth.uid() = user_id
  );

revoke all
  on table public.integrations
  from public, anon;

revoke all
  on table public.integration_status_history
  from public, anon;

grant select, insert, update, delete
  on table public.integrations
  to authenticated;

grant select
  on table public.integration_status_history
  to authenticated;

grant all
  on table public.integrations
  to service_role;

grant all
  on table public.integration_status_history
  to service_role;

revoke all
  on function public.record_integration_status_history()
  from public, anon, authenticated;

comment on table public.integrations is
  'J10 NEXUS workspace-owned integration connection registry and lifecycle state.';

comment on table public.integration_status_history is
  'Immutable workspace-owned history of integration lifecycle transitions.';

comment on column public.integrations.credential_reference is
  'Opaque reference to encrypted server-side credentials. Never stores plaintext secrets.';

comment on column public.integrations.public_configuration is
  'Non-secret connector configuration safe for authenticated workspace clients.';

comment on column public.integrations.metadata is
  'Non-secret internal integration metadata. Raw credentials are forbidden.';

commit;