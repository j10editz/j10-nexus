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
-- BEGIN CONSOLIDATED 20260820_day14c_integration_credentials.sql
begin;

create extension if not exists pgcrypto;

/*
  Day 14C
  Server-only AES-256-GCM credential-envelope storage.

  Plaintext credentials are never stored in PostgreSQL.
  Authenticated clients can access envelopes only through
  ownership-checked security-definer functions.
*/

create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null
    references public.integrations(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  provider text not null,
  encrypted_payload text not null,
  initialization_vector text not null,
  authentication_tag text not null,
  algorithm text not null default 'aes-256-gcm',
  key_version integer not null default 1,
  rotated_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint integration_credentials_integration_key
    unique (integration_id),

  constraint integration_credentials_algorithm_check
    check (
      algorithm = 'aes-256-gcm'
    ),

  constraint integration_credentials_key_version_check
    check (
      key_version between 1 and 2147483647
    ),

  constraint integration_credentials_payload_check
    check (
      char_length(encrypted_payload) between 1 and 262144
      and encrypted_payload ~ '^[A-Za-z0-9+/]+={0,2}$'
    ),

  constraint integration_credentials_iv_check
    check (
      char_length(initialization_vector) = 16
      and initialization_vector ~ '^[A-Za-z0-9+/]+={0,2}$'
    ),

  constraint integration_credentials_tag_check
    check (
      char_length(authentication_tag) = 24
      and authentication_tag ~ '^[A-Za-z0-9+/]+={0,2}$'
    )
);

create index if not exists integration_credentials_user_idx
  on public.integration_credentials(user_id);

create index if not exists integration_credentials_provider_idx
  on public.integration_credentials(provider);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_credential_reference_fkey'
  ) then
    alter table public.integrations
      add constraint integrations_credential_reference_fkey
      foreign key (credential_reference)
      references public.integration_credentials(id)
      on delete set null;
  end if;
end
$$;

create or replace function public.set_integration_credential_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists integration_credentials_set_updated_at
  on public.integration_credentials;

create trigger integration_credentials_set_updated_at
  before update
  on public.integration_credentials
  for each row
  execute function public.set_integration_credential_updated_at();

create or replace function public.store_integration_credential_envelope(
  p_integration_id uuid,
  p_encrypted_payload text,
  p_initialization_vector text,
  p_authentication_tag text,
  p_algorithm text,
  p_key_version integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  connection_record public.integrations%rowtype;
  credential_id uuid;
  caller_is_service_role boolean;
begin
  caller_is_service_role =
    coalesce(
      current_setting(
        'request.jwt.claim.role',
        true
      ),
      ''
    ) = 'service_role';

  select integration_record.*
  into connection_record
  from public.integrations as integration_record
  where integration_record.id = p_integration_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Integration connection was not found.';
  end if;

  if (
    not caller_is_service_role
    and (
      auth.uid() is null
      or auth.uid() <> connection_record.user_id
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Integration credential access is forbidden.';
  end if;

  if p_algorithm <> 'aes-256-gcm' then
    raise exception using
      errcode = '22023',
      message = 'Unsupported credential encryption algorithm.';
  end if;

  if p_key_version is null or p_key_version < 1 then
    raise exception using
      errcode = '22023',
      message = 'Credential key version is invalid.';
  end if;

  if (
    p_encrypted_payload is null
    or char_length(p_encrypted_payload) < 1
    or char_length(p_encrypted_payload) > 262144
  ) then
    raise exception using
      errcode = '22023',
      message = 'Encrypted credential payload is invalid.';
  end if;

  if (
    p_initialization_vector is null
    or char_length(p_initialization_vector) <> 16
  ) then
    raise exception using
      errcode = '22023',
      message = 'Credential initialization vector is invalid.';
  end if;

  if (
    p_authentication_tag is null
    or char_length(p_authentication_tag) <> 24
  ) then
    raise exception using
      errcode = '22023',
      message = 'Credential authentication tag is invalid.';
  end if;

  insert into public.integration_credentials (
    integration_id,
    user_id,
    provider,
    encrypted_payload,
    initialization_vector,
    authentication_tag,
    algorithm,
    key_version,
    rotated_at,
    last_used_at
  )
  values (
    connection_record.id,
    connection_record.user_id,
    connection_record.provider,
    p_encrypted_payload,
    p_initialization_vector,
    p_authentication_tag,
    p_algorithm,
    p_key_version,
    null,
    null
  )
  on conflict (integration_id)
  do update set
    user_id = excluded.user_id,
    provider = excluded.provider,
    encrypted_payload = excluded.encrypted_payload,
    initialization_vector = excluded.initialization_vector,
    authentication_tag = excluded.authentication_tag,
    algorithm = excluded.algorithm,
    key_version = excluded.key_version,
    rotated_at = now(),
    updated_at = now()
  returning id
  into credential_id;

  update public.integrations
  set
    credential_reference = credential_id,
    updated_at = now()
  where id = connection_record.id;

  return credential_id;
end;
$$;

-- A linked remote reset preserves functions that are not represented in its
-- migration ledger. PostgreSQL cannot change a RETURNS TABLE row type through
-- CREATE OR REPLACE, so replace only this exact signature without cascading
-- to any dependent object.
drop function if exists public.get_integration_credential_envelope(uuid);

create function public.get_integration_credential_envelope(
  p_integration_id uuid
)
returns table (
  credential_id uuid,
  integration_id uuid,
  provider text,
  encrypted_payload text,
  initialization_vector text,
  authentication_tag text,
  algorithm text,
  key_version integer,
  rotated_at timestamptz,
  last_used_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  connection_record public.integrations%rowtype;
  caller_is_service_role boolean;
begin
  caller_is_service_role =
    coalesce(
      current_setting(
        'request.jwt.claim.role',
        true
      ),
      ''
    ) = 'service_role';

  select integration_record.*
  into connection_record
  from public.integrations as integration_record
  where integration_record.id = p_integration_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Integration connection was not found.';
  end if;

  if (
    not caller_is_service_role
    and (
      auth.uid() is null
      or auth.uid() <> connection_record.user_id
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Integration credential access is forbidden.';
  end if;

  return query
  select
    credential_record.id,
    credential_record.integration_id,
    credential_record.provider,
    credential_record.encrypted_payload,
    credential_record.initialization_vector,
    credential_record.authentication_tag,
    credential_record.algorithm,
    credential_record.key_version,
    credential_record.rotated_at,
    credential_record.last_used_at
  from public.integration_credentials as credential_record
  where credential_record.integration_id = p_integration_id;
end;
$$;

alter function public.get_integration_credential_envelope(uuid) owner to postgres;

create or replace function public.mark_integration_credential_used(
  p_integration_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  connection_record public.integrations%rowtype;
  caller_is_service_role boolean;
  updated_count integer;
begin
  caller_is_service_role =
    coalesce(
      current_setting(
        'request.jwt.claim.role',
        true
      ),
      ''
    ) = 'service_role';

  select integration_record.*
  into connection_record
  from public.integrations as integration_record
  where integration_record.id = p_integration_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Integration connection was not found.';
  end if;

  if (
    not caller_is_service_role
    and (
      auth.uid() is null
      or auth.uid() <> connection_record.user_id
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Integration credential access is forbidden.';
  end if;

  update public.integration_credentials
  set
    last_used_at = now(),
    updated_at = now()
  where integration_id = connection_record.id;

  get diagnostics updated_count = row_count;

  return updated_count > 0;
end;
$$;

create or replace function public.delete_integration_credential(
  p_integration_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  connection_record public.integrations%rowtype;
  caller_is_service_role boolean;
  deleted_count integer;
begin
  caller_is_service_role =
    coalesce(
      current_setting(
        'request.jwt.claim.role',
        true
      ),
      ''
    ) = 'service_role';

  select integration_record.*
  into connection_record
  from public.integrations as integration_record
  where integration_record.id = p_integration_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Integration connection was not found.';
  end if;

  if (
    not caller_is_service_role
    and (
      auth.uid() is null
      or auth.uid() <> connection_record.user_id
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Integration credential access is forbidden.';
  end if;

  update public.integrations
  set
    credential_reference = null,
    updated_at = now()
  where id = connection_record.id;

  delete from public.integration_credentials
  where integration_id = connection_record.id;

  get diagnostics deleted_count = row_count;

  return deleted_count > 0;
end;
$$;

alter table public.integration_credentials
  enable row level security;

/*
  No authenticated table policies are created intentionally.
  Credential envelopes are available only through the
  ownership-checked RPC functions.
*/

revoke all
  on table public.integration_credentials
  from public, anon, authenticated;

grant all
  on table public.integration_credentials
  to service_role;

revoke execute
  on function public.store_integration_credential_envelope(
    uuid,
    text,
    text,
    text,
    text,
    integer
  )
  from public, anon;

revoke all
  on function public.get_integration_credential_envelope(uuid)
  from public, anon;

revoke execute
  on function public.mark_integration_credential_used(uuid)
  from public, anon;

revoke execute
  on function public.delete_integration_credential(uuid)
  from public, anon;

grant execute
  on function public.store_integration_credential_envelope(
    uuid,
    text,
    text,
    text,
    text,
    integer
  )
  to authenticated, service_role;

grant execute
  on function public.get_integration_credential_envelope(uuid)
  to authenticated, service_role;

grant execute
  on function public.mark_integration_credential_used(uuid)
  to authenticated, service_role;

grant execute
  on function public.delete_integration_credential(uuid)
  to authenticated, service_role;

comment on table public.integration_credentials is
  'Encrypted J10 integration credential envelopes. Plaintext credentials are prohibited.';

comment on column public.integration_credentials.encrypted_payload is
  'Base64 AES-256-GCM ciphertext generated by the J10 server runtime.';

comment on column public.integration_credentials.initialization_vector is
  'Unique 96-bit AES-GCM initialization vector encoded as Base64.';

comment on column public.integration_credentials.authentication_tag is
  'AES-GCM authentication tag encoded as Base64.';

comment on function public.store_integration_credential_envelope(
  uuid,
  text,
  text,
  text,
  text,
  integer
) is
  'Stores or rotates an encrypted credential envelope after verifying integration ownership.';

comment on function public.get_integration_credential_envelope(uuid) is
  'Returns an encrypted credential envelope only to its workspace owner or service role.';

commit;
-- END CONSOLIDATED 20260820_day14c_integration_credentials.sql

-- BEGIN CONSOLIDATED 20260820_day14e_integration_catalog.sql
begin;

/*
  Replace the original six-provider database constraint with the expanded
  J10 NEXUS connector catalog. Existing legacy provider values remain valid
  so this migration cannot strand or invalidate older workspace rows.
*/
do $$
declare
  provider_constraint_name text;
begin
  for provider_constraint_name in
    select constraint_record.conname
    from pg_constraint as constraint_record
    join pg_class as table_record
      on table_record.oid = constraint_record.conrelid
    join pg_namespace as namespace_record
      on namespace_record.oid = table_record.relnamespace
    join pg_attribute as column_record
      on column_record.attrelid = table_record.oid
     and column_record.attnum = any (constraint_record.conkey)
    where namespace_record.nspname = 'public'
      and table_record.relname = 'integrations'
      and constraint_record.contype = 'c'
      and column_record.attname = 'provider'
  loop
    execute format(
      'alter table public.integrations drop constraint %I',
      provider_constraint_name
    );
  end loop;
end
$$;

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
        'outlook-mail',
        'outlook-calendar',
        'microsoft-teams',
        'slack',
        'discord',
        'telegram',
        'twilio',
        'google-drive',
        'google-sheets',
        'onedrive',
        'dropbox',
        'notion',
        'airtable',
        'zoom',
        'calendly',
        'trello',
        'asana',
        'monday',
        'clickup',
        'hubspot',
        'salesforce',
        'pipedrive',
        'mailchimp',
        'meta-business',
        'instagram-business',
        'youtube',
        'tiktok',
        'linkedin',
        'x',
        'woocommerce',
        'paypal',
        'square',
        'quickbooks',
        'xero',
        'amazon-seller',
        'etsy',
        'ebay',
        'tiktok-shop',
        'github',
        'zapier',
        'make',
        'openai',
        'anthropic',
        'gemini',
        'hugging-face',
        'runway',
        'higgsfield',
        'pika',
        'kling',

        /* Legacy values retained for existing rows. */
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

comment on constraint integrations_provider_check
  on public.integrations
  is 'Allows canonical J10 NEXUS integration providers and preserved legacy provider values.';

commit;
-- END CONSOLIDATED 20260820_day14e_integration_catalog.sql

-- BEGIN CONSOLIDATED 20260820_day14g_webhook_foundation.sql
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
-- END CONSOLIDATED 20260820_day14g_webhook_foundation.sql

-- BEGIN CONSOLIDATED 20260820_day14h_external_trigger_adapter.sql
begin;

alter table public.integration_webhook_events
  add column if not exists normalized_event jsonb,
  add column if not exists adapted_at timestamptz;

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_processing_status_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_processing_status_check
  check (
    processing_status in (
      'pending_adapter',
      'adapted',
      'duplicate',
      'processed',
      'failed',
      'rejected'
    )
  );

alter table public.integration_webhook_events
  drop constraint if exists integration_webhook_events_adapted_payload_check;

alter table public.integration_webhook_events
  add constraint integration_webhook_events_adapted_payload_check
  check (
    processing_status not in (
      'adapted',
      'processed'
    )
    or (
      normalized_event is not null
      and adapted_at is not null
    )
  );

create index if not exists integration_webhook_events_adapter_queue_idx
  on public.integration_webhook_events(received_at asc)
  where processing_status in (
    'pending_adapter',
    'failed'
  );

create index if not exists integration_webhook_events_capability_idx
  on public.integration_webhook_events(
    (normalized_event ->> 'capabilityId'),
    adapted_at desc
  )
  where processing_status in (
    'adapted',
    'processed'
  );

comment on column public.integration_webhook_events.normalized_event is
  'Canonical j10.external-trigger.v1 envelope produced by the Day 14H provider adapter.';

comment on column public.integration_webhook_events.adapted_at is
  'Time the raw webhook receipt was successfully converted into an external trigger.';

comment on constraint integration_webhook_events_adapted_payload_check
  on public.integration_webhook_events is
  'Adapted and processed receipts must contain a canonical normalized event and adaptation timestamp.';

commit;
-- END CONSOLIDATED 20260820_day14h_external_trigger_adapter.sql

-- BEGIN CONSOLIDATED 20260820_day14i_external_action_adapter.sql
begin;

create extension if not exists pgcrypto;

/*
  Fresh-install core foundation.
  The Day 14–16 migrations historically ran against an existing J10 workflow
  schema.  Keep that schema explicit for a new database; later tenantization
  adds workspace_id and the corresponding composite integrity constraints.
*/
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger_type text not null default 'manual',
  trigger_config jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  schedule_expression text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automations_trigger_type_check check (trigger_type = any (array['manual','new_crm_contact','crm_status_changed','new_ai_task','ai_task_completed','schedule','integration_event']::text[]))
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  trigger_type text not null default 'manual',
  trigger_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  current_step_order integer not null default 1,
  result_summary text,
  error_message text,
  execution_mode text not null default 'live',
  api_called boolean not null default false,
  total_cost_usd numeric(10,4) not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  step_order integer not null,
  name text,
  step_type text not null default 'action',
  action_type text,
  employee_id uuid,
  employee_name text,
  task_type text,
  instructions text,
  config jsonb not null default '{}'::jsonb,
  condition_config jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default false,
  approval_type text,
  on_success_step_id uuid,
  on_failure_step_id uuid,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  automation_step_id uuid references public.automation_steps(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  step_order integer not null,
  step_type text not null default 'action',
  action_type text,
  employee_id uuid,
  employee_name text,
  ai_task_id uuid,
  status text not null default 'queued',
  requires_approval boolean not null default false,
  approval_status text not null default 'not_required',
  input_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  job_title text,
  type text not null default 'Lead',
  status text not null default 'New',
  source text not null default 'crm',
  estimated_value numeric(10,2) not null default 0,
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);

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
-- END CONSOLIDATED 20260820_day14i_external_action_adapter.sql
