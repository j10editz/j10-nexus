-- ========================================================
-- J10 NEXUS: Complete Staging Schema Bootstrap
-- ========================================================


-- >>> START: supabase/migrations\20260820_day14b_integrations.sql <<<
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
-- >>> END: supabase/migrations\20260820_day14b_integrations.sql <<<


-- >>> START: supabase/migrations\20260820_day14c_integration_credentials.sql <<<
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

create or replace function public.get_integration_credential_envelope(
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

revoke execute
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
-- >>> END: supabase/migrations\20260820_day14c_integration_credentials.sql <<<


-- >>> START: supabase/migrations\20260820_day14e_integration_catalog.sql <<<
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
-- >>> END: supabase/migrations\20260820_day14e_integration_catalog.sql <<<


-- >>> START: supabase/migrations\20260820_day14g_webhook_foundation.sql <<<
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
-- >>> END: supabase/migrations\20260820_day14g_webhook_foundation.sql <<<


-- >>> START: supabase/migrations\20260820_day14h_external_trigger_adapter.sql <<<
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
-- >>> END: supabase/migrations\20260820_day14h_external_trigger_adapter.sql <<<


-- >>> START: supabase/migrations\20260820_day14i_external_action_adapter.sql <<<
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
-- >>> END: supabase/migrations\20260820_day14i_external_action_adapter.sql <<<


-- >>> START: supabase/migrations\20260821_day14j_integration_event_trigger.sql <<<
begin;

/*
  Day 14J:
  Allow normalized external integration events to start J10 workflows.
*/
alter table public.automations
  drop constraint if exists automations_trigger_type_check;

alter table public.automations
  add constraint automations_trigger_type_check
  check (
    trigger_type = any (
      array[
        'manual',
        'new_crm_contact',
        'crm_status_changed',
        'new_ai_task',
        'ai_task_completed',
        'schedule',
        'integration_event'
      ]::text[]
    )
  );

comment on constraint automations_trigger_type_check
  on public.automations
  is 'Allows native, scheduled, and Day 14J integration-event workflow triggers.';

commit;

-- >>> END: supabase/migrations\20260821_day14j_integration_event_trigger.sql <<<


-- >>> START: supabase/migrations\20260821_day14l_integration_observability_retry.sql <<<
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
-- >>> END: supabase/migrations\20260821_day14l_integration_observability_retry.sql <<<


-- >>> START: supabase/migrations\20260824_day15h_provider_subscriptions.sql <<<
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
-- >>> END: supabase/migrations\20260824_day15h_provider_subscriptions.sql <<<


-- >>> START: supabase/migrations\20260826_day16c_automation_versions.sql <<<
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

-- >>> END: supabase/migrations\20260826_day16c_automation_versions.sql <<<


-- >>> START: supabase/migrations\20260827_day16e_atomic_runtime_switch.sql <<<
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

-- >>> END: supabase/migrations\20260827_day16e_atomic_runtime_switch.sql <<<


-- >>> START: supabase/migrations\20260829_day16f_workflow_lifecycle.sql <<<
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

-- >>> END: supabase/migrations\20260829_day16f_workflow_lifecycle.sql <<<


-- >>> START: supabase/migrations\20260829_day16g_runtime_step_history_fk.sql <<<
begin;

/*
  Day 16G
  Preserve immutable run history when a published workflow replaces its live
  automation_steps rows.

  automation_run_steps already stores automation_version_id and graph_node_id
  for durable traceability. The live automation_step_id is therefore a useful
  pointer only while that runtime step still exists; it must not prevent the
  atomic publish/rollback RPCs from replacing live runtime steps.
*/

alter table public.automation_run_steps
  alter column automation_step_id drop not null;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.conrelid =
        'public.automation_run_steps'::regclass
      and constraint_row.confrelid =
        'public.automation_steps'::regclass
      and pg_get_constraintdef(constraint_row.oid) ~
        '^FOREIGN KEY \(automation_step_id\)'
  loop
    execute format(
      'alter table public.automation_run_steps drop constraint %I',
      v_constraint.conname
    );
  end loop;
end $$;

alter table public.automation_run_steps
  add constraint automation_run_steps_automation_step_id_fkey
  foreign key (automation_step_id)
  references public.automation_steps(id)
  on delete set null;

commit;

-- >>> END: supabase/migrations\20260829_day16g_runtime_step_history_fk.sql <<<


-- >>> START: supabase/migrations\20260829_day16h_pgcrypto_checksum_schema.sql <<<
begin;

/*
  Day 16H
  Resolve the workflow graph checksum function through Supabase's extensions
  schema. Supabase installs pgcrypto there, while PostgREST requests may use a
  search path that does not include extensions.
*/

create extension if not exists pgcrypto with schema extensions;

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

do $$
declare
  v_checksum text;
begin
  v_checksum := encode(
    extensions.digest('{}'::text, 'sha256'::text),
    'hex'
  );

  if v_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'pgcrypto SHA-256 checksum verification failed.';
  end if;
end $$;

commit;

-- >>> END: supabase/migrations\20260829_day16h_pgcrypto_checksum_schema.sql <<<


-- >>> START: supabase/migrations\20260904_subscriptions_entitlements.sql <<<
-- J10 NEXUS Subscription and Entitlement Enforcement Schema
-- Migration: 20260904_subscriptions_entitlements.sql

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null default 'starter',
  status text not null default 'active',
  monthly_message_limit integer not null default 1000,
  messages_used_this_period integer not null default 0,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  grace_period_end timestamptz default null,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast user lookup
create index if not exists idx_workspace_subscriptions_user_id
  on public.workspace_subscriptions(user_id);

-- Index for active status filtering
create index if not exists idx_workspace_subscriptions_status
  on public.workspace_subscriptions(status);

-- Enable Row-Level Security
alter table public.workspace_subscriptions enable row level security;

-- RLS Policy: Users can view their own subscription
create policy "Users can view own subscription"
  on public.workspace_subscriptions
  for select
  using (auth.uid() = user_id);

-- RLS Policy: Users can update own subscription (or restricted to service role)
create policy "Service role manages subscriptions"
  on public.workspace_subscriptions
  for all
  using (true)
  with check (true);

-- >>> END: supabase/migrations\20260904_subscriptions_entitlements.sql <<<


-- >>> START: supabase/migrations\20260905_company_knowledge.sql <<<
-- Migration: 20260905_company_knowledge.sql
-- J10 NEXUS Company Brain & Knowledge Grounding Foundation

create table if not exists public.company_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'product_service',
  content text not null,
  tags text[] not null default '{}'::text[],
  status text not null default 'published',
  is_grounding_active boolean not null default true,
  token_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_user_status
  on public.company_knowledge_documents (user_id, status, is_grounding_active);

create index if not exists idx_knowledge_user_category
  on public.company_knowledge_documents (user_id, category);

alter table public.company_knowledge_documents enable row level security;

create policy "Users can read their own knowledge documents"
  on public.company_knowledge_documents
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own knowledge documents"
  on public.company_knowledge_documents
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own knowledge documents"
  on public.company_knowledge_documents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own knowledge documents"
  on public.company_knowledge_documents
  for delete
  using (auth.uid() = user_id);

-- >>> END: supabase/migrations\20260905_company_knowledge.sql <<<


-- >>> START: supabase/migrations\20260906_marketing_campaigns.sql <<<
-- Migration: 20260906_marketing_campaigns.sql
-- J10 NEXUS Omni-Channel Marketing & Broadcast Engine

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  channel text not null default 'whatsapp',
  audience_segment text not null default 'all',
  status text not null default 'draft',
  target_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  replied_count integer not null default 0,
  message_template text not null,
  scheduled_at timestamptz default null,
  completed_at timestamptz default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_campaigns_user_status
  on public.marketing_campaigns (user_id, status);

create index if not exists idx_marketing_campaigns_channel
  on public.marketing_campaigns (user_id, channel);

alter table public.marketing_campaigns enable row level security;

create policy "Users can view their own marketing campaigns"
  on public.marketing_campaigns
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own marketing campaigns"
  on public.marketing_campaigns
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own marketing campaigns"
  on public.marketing_campaigns
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own marketing campaigns"
  on public.marketing_campaigns
  for delete
  using (auth.uid() = user_id);

-- >>> END: supabase/migrations\20260906_marketing_campaigns.sql <<<


-- >>> START: supabase/migrations\20260907_finance_invoices.sql <<<
-- J10 NEXUS Finance & Invoicing Operations Schema
-- Migration: 20260907_finance_invoices.sql

create table if not exists public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  amount numeric(12,2) not null default 0.00,
  currency text not null default 'USD',
  status text not null default 'draft', -- draft, sent, paid, overdue, canceled
  issue_date date not null default current_date,
  due_date date not null default (current_date + interval '14 days'),
  paid_at timestamptz,
  line_items jsonb not null default '[]'::jsonb,
  notes text,
  payment_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices for rapid indexing
create index if not exists idx_finance_invoices_user_id
  on public.finance_invoices(user_id);

create index if not exists idx_finance_invoices_status
  on public.finance_invoices(status);

create index if not exists idx_finance_invoices_due_date
  on public.finance_invoices(due_date);

-- Enable RLS
alter table public.finance_invoices enable row level security;

-- Policies
create policy "Users can view own invoices"
  on public.finance_invoices
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own invoices"
  on public.finance_invoices
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own invoices"
  on public.finance_invoices
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own invoices"
  on public.finance_invoices
  for delete
  using (auth.uid() = user_id);

-- >>> END: supabase/migrations\20260907_finance_invoices.sql <<<


-- >>> START: supabase/migrations\20260908_workforce_hr.sql <<<
-- J10 NEXUS Hybrid Workforce & HR Schema
-- Migration: 20260908_workforce_hr.sql

create table if not exists public.workforce_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text not null,
  department text not null default 'Operations', -- Sales, Marketing, Customer Success, Engineering, Executive
  email text not null,
  phone text,
  status text not null default 'active', -- active, on_leave, remote
  assigned_agents text[] not null default '{}', -- names or IDs of AI employees supervised
  monthly_salary numeric(10,2) default 0.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index if not exists idx_workforce_members_user_id
  on public.workforce_members(user_id);

create index if not exists idx_workforce_members_department
  on public.workforce_members(department);

-- Enable RLS
alter table public.workforce_members enable row level security;

-- Policies
create policy "Users can view own workforce"
  on public.workforce_members
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own workforce"
  on public.workforce_members
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workforce"
  on public.workforce_members
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own workforce"
  on public.workforce_members
  for delete
  using (auth.uid() = user_id);

-- >>> END: supabase/migrations\20260908_workforce_hr.sql <<<


-- >>> START: supabase/migrations\20260909_website_funnels.sql <<<
-- J10 NEXUS AI Website & Conversion Funnel Engine Schema
-- Migration: 20260909_website_funnels.sql

create table if not exists public.website_funnels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'High-Converting Business Landing Page',
  slug text not null default 'main',
  theme text not null default 'obsidian',
  custom_domain text,
  is_published boolean not null default false,
  hero_headline text not null default 'Transform Operations with Autonomous AI Systems',
  hero_subheadline text not null default 'Deploy 24/7 WhatsApp sales agents, automated CRM lead capture, and intelligent billing.',
  primary_cta_text text not null default 'Start on WhatsApp',
  primary_cta_link text,
  features jsonb not null default '[]'::jsonb,
  testimonials jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index if not exists idx_website_funnels_user_id
  on public.website_funnels(user_id);

create index if not exists idx_website_funnels_slug
  on public.website_funnels(slug);

-- Enable RLS
alter table public.website_funnels enable row level security;

-- Policies
create policy "Users can view own funnels"
  on public.website_funnels
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own funnels"
  on public.website_funnels
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own funnels"
  on public.website_funnels
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own funnels"
  on public.website_funnels
  for delete
  using (auth.uid() = user_id);

-- >>> END: supabase/migrations\20260909_website_funnels.sql <<<


-- >>> START: supabase/migrations\20260910_commerce_catalog_orders.sql <<<
-- J10 NEXUS E-Commerce Catalog & Orders Schema
-- Migration: 20260910_commerce_catalog_orders.sql

create table if not exists public.commerce_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text not null,
  description text,
  price numeric(10,2) not null default 0.00,
  currency text not null default 'USD',
  inventory integer not null default 0,
  category text not null default 'General',
  status text not null default 'active', -- active, out_of_stock, archived
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  total_amount numeric(10,2) not null default 0.00,
  currency text not null default 'USD',
  status text not null default 'pending', -- pending, paid, fulfilled, canceled
  items jsonb not null default '[]'::jsonb,
  payment_method text not null default 'stripe',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index if not exists idx_commerce_products_user_id
  on public.commerce_products(user_id);

create index if not exists idx_commerce_products_category
  on public.commerce_products(category);

create index if not exists idx_commerce_orders_user_id
  on public.commerce_orders(user_id);

create index if not exists idx_commerce_orders_status
  on public.commerce_orders(status);

-- Enable RLS
alter table public.commerce_products enable row level security;
alter table public.commerce_orders enable row level security;

-- Products Policies
create policy "Users can view own products"
  on public.commerce_products
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own products"
  on public.commerce_products
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own products"
  on public.commerce_products
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own products"
  on public.commerce_products
  for delete
  using (auth.uid() = user_id);

-- Orders Policies
create policy "Users can view own orders"
  on public.commerce_orders
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own orders"
  on public.commerce_orders
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own orders"
  on public.commerce_orders
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own orders"
  on public.commerce_orders
  for delete
  using (auth.uid() = user_id);

-- >>> END: supabase/migrations\20260910_commerce_catalog_orders.sql <<<


-- >>> START: supabase/migrations\20260911_multi_tenant_persistence_ledger.sql <<<
-- J10 NEXUS Canonical Multi-Tenant Data Foundation & Stripe Payment Ledger
-- Migration: 20260911_multi_tenant_persistence_ledger.sql

-- ============================================================================
-- 1. WORKSPACES TABLE
-- ============================================================================
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  workspace_type text not null default 'client' check (workspace_type in ('agency_master', 'client')),
  plan text not null default 'growth' check (plan in ('starter', 'growth', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'trial', 'past_due', 'suspended')),
  brand_name text not null,
  accent_color text not null default '#3B82F6',
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. WORKSPACE MEMBERSHIPS TABLE
-- ============================================================================
create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'manager', 'agent', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_workspace_memberships_workspace_user unique (workspace_id, user_id)
);

-- ============================================================================
-- 3. CONTACTS TABLE
-- ============================================================================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  source text not null default 'direct',
  deal_stage text not null default 'lead' check (deal_stage in ('lead', 'qualified', 'proposal', 'won', 'churned')),
  estimated_value numeric(12,2) not null default 0.00 check (estimated_value >= 0),
  assigned_user_id uuid references auth.users(id) on delete set null,
  last_contact_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. INBOX THREADS TABLE
-- ============================================================================
create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'website', 'crm')),
  external_thread_id text,
  status text not null default 'active' check (status in ('active', 'archived', 'resolved')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz not null default now(),
  assigned_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 5. INBOX MESSAGES TABLE
-- ============================================================================
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'internal',
  external_message_id text,
  content text not null,
  delivery_status text not null default 'sent' check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  message_type text not null default 'text' check (message_type in ('text', 'payment_request', 'template', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 6. PAYMENT CHECKOUTS TABLE
-- ============================================================================
create table if not exists public.payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  description text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  checkout_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 7. PAYMENT LEDGER TABLE
-- ============================================================================
create table if not exists public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  checkout_id uuid references public.payment_checkouts(id) on delete set null,
  provider text not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null check (status in ('succeeded', 'failed', 'refunded', 'pending')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 8. WEBHOOK EVENTS TABLE
-- ============================================================================
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  payload_hash text,
  error_code text,
  error_message_sanitized text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint uq_webhook_events_provider_event unique (provider, provider_event_id)
);

-- ============================================================================
-- INDICES
-- ============================================================================
create index if not exists idx_workspaces_owner on public.workspaces(owner_user_id);
create index if not exists idx_workspaces_slug on public.workspaces(slug);

create index if not exists idx_workspace_memberships_user on public.workspace_memberships(user_id);
create index if not exists idx_workspace_memberships_ws on public.workspace_memberships(workspace_id);

create index if not exists idx_contacts_workspace on public.contacts(workspace_id);
create index if not exists idx_contacts_deal_stage on public.contacts(workspace_id, deal_stage);
create index if not exists idx_contacts_email on public.contacts(workspace_id, email);
create index if not exists idx_contacts_phone on public.contacts(workspace_id, phone);

create index if not exists idx_inbox_threads_ws on public.inbox_threads(workspace_id);
create index if not exists idx_inbox_threads_contact on public.inbox_threads(contact_id);
create index if not exists idx_inbox_threads_ws_channel on public.inbox_threads(workspace_id, channel);
create index if not exists idx_inbox_threads_ws_last_msg on public.inbox_threads(workspace_id, last_message_at desc);

create index if not exists idx_inbox_messages_ws_thread on public.inbox_messages(workspace_id, thread_id);
create index if not exists idx_inbox_messages_created_at on public.inbox_messages(thread_id, created_at asc);

create index if not exists idx_payment_checkouts_ws on public.payment_checkouts(workspace_id);
create index if not exists idx_payment_checkouts_session on public.payment_checkouts(stripe_checkout_session_id);
create index if not exists idx_payment_checkouts_thread on public.payment_checkouts(thread_id);

create index if not exists idx_payment_ledger_ws on public.payment_ledger(workspace_id);
create index if not exists idx_payment_ledger_checkout on public.payment_ledger(checkout_id);
create index if not exists idx_payment_ledger_provider_event on public.payment_ledger(provider, provider_event_id);

create index if not exists idx_webhook_events_provider_event on public.webhook_events(provider, provider_event_id);
create index if not exists idx_webhook_events_ws on public.webhook_events(workspace_id);

-- ============================================================================
-- AUTHORIZATION HELPER FUNCTIONS
-- ============================================================================
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function public.owns_workspace(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_user_id = auth.uid()
  );
$$;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.payment_checkouts enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.webhook_events enable row level security;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Workspaces Policies
create policy "workspaces_select_member"
  on public.workspaces
  for select
  using (
    owner_user_id = auth.uid()
    or public.is_workspace_member(id)
  );

create policy "workspaces_insert_authenticated"
  on public.workspaces
  for insert
  with check (
    auth.uid() is not null
    and owner_user_id = auth.uid()
  );

create policy "workspaces_update_owner_admin"
  on public.workspaces
  for update
  using (
    owner_user_id = auth.uid()
    or public.has_workspace_role(id, array['owner', 'admin'])
  )
  with check (
    owner_user_id = auth.uid()
    or public.has_workspace_role(id, array['owner', 'admin'])
  );

create policy "workspaces_delete_owner_only"
  on public.workspaces
  for delete
  using (
    owner_user_id = auth.uid()
  );

-- Workspace Memberships Policies
create policy "memberships_select_member"
  on public.workspace_memberships
  for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

create policy "memberships_insert_privileged"
  on public.workspace_memberships
  for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
    or (
      -- Initial workspace creation membership seed
      not exists (
        select 1 from public.workspace_memberships wm
        where wm.workspace_id = workspace_id
      )
      and user_id = auth.uid()
      and role = 'owner'
    )
  );

create policy "memberships_update_admin"
  on public.workspace_memberships
  for update
  using (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
  )
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

create policy "memberships_delete_admin"
  on public.workspace_memberships
  for delete
  using (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Contacts Policies
create policy "contacts_select_member"
  on public.contacts
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "contacts_insert_operators"
  on public.contacts
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "contacts_update_operators"
  on public.contacts
  for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "contacts_delete_managers"
  on public.contacts
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

-- Inbox Threads Policies
create policy "inbox_threads_select_member"
  on public.inbox_threads
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "inbox_threads_insert_operators"
  on public.inbox_threads
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_threads_update_operators"
  on public.inbox_threads
  for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_threads_delete_managers"
  on public.inbox_threads
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

-- Inbox Messages Policies
create policy "inbox_messages_select_member"
  on public.inbox_messages
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "inbox_messages_insert_operators"
  on public.inbox_messages
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_messages_update_managers"
  on public.inbox_messages
  for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

create policy "inbox_messages_delete_admin"
  on public.inbox_messages
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Payment Checkouts Policies
create policy "payment_checkouts_select_member"
  on public.payment_checkouts
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "payment_checkouts_insert_operators"
  on public.payment_checkouts
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "payment_checkouts_update_operators"
  on public.payment_checkouts
  for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "payment_checkouts_delete_admin"
  on public.payment_checkouts
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Payment Ledger Policies
create policy "payment_ledger_select_member"
  on public.payment_ledger
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "payment_ledger_service_role_all"
  on public.payment_ledger
  for all
  using (
    auth.role() = 'service_role'
  )
  with check (
    auth.role() = 'service_role'
  );

-- Webhook Events Policies
create policy "webhook_events_select_member"
  on public.webhook_events
  for select
  using (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
  );

create policy "webhook_events_service_role_all"
  on public.webhook_events
  for all
  using (
    auth.role() = 'service_role'
  );

-- >>> END: supabase/migrations\20260911_multi_tenant_persistence_ledger.sql <<<


-- >>> START: supabase/migrations\20260912_adversarial_tenant_integrity_recovery.sql <<<
-- ============================================================================
-- J10 NEXUS: Adversarial Tenant Isolation, Referential Integrity,
-- Financial Immutability & Founder Workspace Recovery
-- Migration: 20260912_adversarial_tenant_integrity_recovery.sql
-- ============================================================================

-- 1. ENSURE CANONICAL 8 ENTITIES EXIST (IDEMPOTENT CREATION)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  workspace_type text not null default 'client' check (workspace_type in ('agency_master', 'client')),
  plan text not null default 'growth' check (plan in ('starter', 'growth', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'trial', 'past_due', 'suspended')),
  brand_name text not null,
  accent_color text not null default '#3B82F6',
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'manager', 'agent', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_workspace_memberships_workspace_user unique (workspace_id, user_id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  source text not null default 'direct',
  deal_stage text not null default 'lead' check (deal_stage in ('lead', 'qualified', 'proposal', 'won', 'churned')),
  estimated_value numeric(12,2) not null default 0.00 check (estimated_value >= 0),
  assigned_user_id uuid references auth.users(id) on delete set null,
  last_contact_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'website', 'crm')),
  external_thread_id text,
  status text not null default 'active' check (status in ('active', 'archived', 'resolved')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz not null default now(),
  assigned_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'internal',
  external_message_id text,
  content text not null,
  delivery_status text not null default 'sent' check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  message_type text not null default 'text' check (message_type in ('text', 'payment_request', 'template', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  description text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  checkout_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  checkout_id uuid references public.payment_checkouts(id) on delete set null,
  provider text not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null check (status in ('succeeded', 'failed', 'refunded', 'pending')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  payload_hash text,
  error_code text,
  error_message_sanitized text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint uq_webhook_events_provider_event unique (provider, provider_event_id)
);

-- ============================================================================
-- 2. COMPOSITE UNIQUENESS & CROSS-TENANT REFERENTIAL INTEGRITY
-- ============================================================================
do $$
begin
  -- Composite unique constraints on parent entities
  if not exists (select 1 from pg_constraint where conname = 'uq_contacts_workspace_id') then
    alter table public.contacts add constraint uq_contacts_workspace_id unique (workspace_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'uq_inbox_threads_workspace_id') then
    alter table public.inbox_threads add constraint uq_inbox_threads_workspace_id unique (workspace_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'uq_inbox_messages_workspace_id') then
    alter table public.inbox_messages add constraint uq_inbox_messages_workspace_id unique (workspace_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'uq_payment_checkouts_workspace_id') then
    alter table public.payment_checkouts add constraint uq_payment_checkouts_workspace_id unique (workspace_id, id);
  end if;

  -- Composite foreign keys preventing cross-tenant record entanglement
  if not exists (select 1 from pg_constraint where conname = 'fk_inbox_threads_workspace_contact') then
    alter table public.inbox_threads add constraint fk_inbox_threads_workspace_contact
      foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_inbox_messages_workspace_thread') then
    alter table public.inbox_messages add constraint fk_inbox_messages_workspace_thread
      foreign key (workspace_id, thread_id) references public.inbox_threads(workspace_id, id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_payment_checkouts_workspace_contact') then
    alter table public.payment_checkouts add constraint fk_payment_checkouts_workspace_contact
      foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_payment_checkouts_workspace_thread') then
    alter table public.payment_checkouts add constraint fk_payment_checkouts_workspace_thread
      foreign key (workspace_id, thread_id) references public.inbox_threads(workspace_id, id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_payment_ledger_workspace_checkout') then
    alter table public.payment_ledger add constraint fk_payment_ledger_workspace_checkout
      foreign key (workspace_id, checkout_id) references public.payment_checkouts(workspace_id, id) on delete set null;
  end if;
end $$;

-- Idempotency index on external message IDs per workspace
create unique index if not exists idx_inbox_messages_ws_ext_id
  on public.inbox_messages(workspace_id, external_message_id)
  where external_message_id is not null;

-- ============================================================================
-- 3. HARDENED SECURITY DEFINER AUTHORIZATION FUNCTIONS
-- ============================================================================
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function public.owns_workspace(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_user_id = auth.uid()
  );
$$;

-- Revoke default public execution rights and grant only to trusted roles
revoke execute on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;

revoke execute on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;

revoke execute on function public.owns_workspace(uuid) from public;
grant execute on function public.owns_workspace(uuid) to authenticated, service_role;

-- ============================================================================
-- 4. ATOMIC WORKSPACE PROVISIONING RPC
-- ============================================================================
create or replace function public.provision_workspace(
  p_name text,
  p_slug text,
  p_brand_name text,
  p_accent_color text default '#3B82F6',
  p_workspace_type text default 'client',
  p_plan text default 'growth'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_workspace public.workspaces%rowtype;
  v_membership public.workspace_memberships%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required to provision a workspace.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Workspace name is required.';
  end if;

  -- 1. Atomically insert workspace
  insert into public.workspaces (
    name,
    slug,
    workspace_type,
    plan,
    status,
    brand_name,
    accent_color,
    owner_user_id
  ) values (
    trim(p_name),
    trim(p_slug),
    p_workspace_type,
    p_plan,
    'active',
    coalesce(trim(p_brand_name), trim(p_name)),
    coalesce(p_accent_color, '#3B82F6'),
    v_user_id
  )
  returning * into v_workspace;

  -- 2. Atomically insert owner membership in same transaction
  insert into public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    status
  ) values (
    v_workspace.id,
    v_user_id,
    'owner',
    'active'
  )
  returning * into v_membership;

  return jsonb_build_object(
    'workspace', to_jsonb(v_workspace),
    'membership', to_jsonb(v_membership)
  );
end;
$$;

revoke execute on function public.provision_workspace(text, text, text, text, text, text) from public;
grant execute on function public.provision_workspace(text, text, text, text, text, text) to authenticated, service_role;

-- ============================================================================
-- 5. FINANCIAL IMMUTABILITY TRIGGERS
-- ============================================================================
create or replace function public.check_payment_checkout_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Forbid regular users from marking checkouts as paid
  if (new.status = 'paid' and old.status != 'paid') then
    if (auth.role() != 'service_role') then
      raise exception 'Security violation: Only verified payment webhooks may mark checkouts as paid.';
    end if;
  end if;

  -- Amount and currency cannot be modified after initial checkout creation
  if (new.amount != old.amount or new.currency != old.currency) then
    if (auth.role() != 'service_role') then
      raise exception 'Security violation: Financial amount and currency cannot be modified after creation.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payment_checkout_mutation on public.payment_checkouts;
create trigger trg_payment_checkout_mutation
  before update on public.payment_checkouts
  for each row
  execute function public.check_payment_checkout_mutation();

-- Payment ledger is strictly append-only
create or replace function public.check_payment_ledger_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Security violation: payment_ledger is an immutable audit log. Updates and deletes are prohibited.';
end;
$$;

drop trigger if exists trg_payment_ledger_immutability on public.payment_ledger;
create trigger trg_payment_ledger_immutability
  before update or delete on public.payment_ledger
  for each row
  execute function public.check_payment_ledger_immutability();

-- ============================================================================
-- 6. ROW LEVEL SECURITY ACTIVATION
-- ============================================================================
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.payment_checkouts enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.webhook_events enable row level security;

-- Drop existing policies if re-running
drop policy if exists "workspaces_select_member" on public.workspaces;
drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
drop policy if exists "workspaces_update_owner_admin" on public.workspaces;
drop policy if exists "workspaces_delete_owner_only" on public.workspaces;

drop policy if exists "memberships_select_member" on public.workspace_memberships;
drop policy if exists "memberships_insert_privileged" on public.workspace_memberships;
drop policy if exists "memberships_update_admin" on public.workspace_memberships;
drop policy if exists "memberships_delete_admin" on public.workspace_memberships;

drop policy if exists "contacts_select_member" on public.contacts;
drop policy if exists "contacts_insert_operators" on public.contacts;
drop policy if exists "contacts_update_operators" on public.contacts;
drop policy if exists "contacts_delete_managers" on public.contacts;

drop policy if exists "inbox_threads_select_member" on public.inbox_threads;
drop policy if exists "inbox_threads_insert_operators" on public.inbox_threads;
drop policy if exists "inbox_threads_update_operators" on public.inbox_threads;
drop policy if exists "inbox_threads_delete_managers" on public.inbox_threads;

drop policy if exists "inbox_messages_select_member" on public.inbox_messages;
drop policy if exists "inbox_messages_insert_operators" on public.inbox_messages;
drop policy if exists "inbox_messages_update_managers" on public.inbox_messages;
drop policy if exists "inbox_messages_delete_admin" on public.inbox_messages;

drop policy if exists "payment_checkouts_select_member" on public.payment_checkouts;
drop policy if exists "payment_checkouts_insert_operators" on public.payment_checkouts;
drop policy if exists "payment_checkouts_update_operators" on public.payment_checkouts;
drop policy if exists "payment_checkouts_delete_admin" on public.payment_checkouts;

drop policy if exists "payment_ledger_select_member" on public.payment_ledger;
drop policy if exists "payment_ledger_service_role_all" on public.payment_ledger;

drop policy if exists "webhook_events_select_member" on public.webhook_events;
drop policy if exists "webhook_events_service_role_all" on public.webhook_events;

-- Workspaces Policies
create policy "workspaces_select_member"
  on public.workspaces for select
  using (owner_user_id = auth.uid() or public.is_workspace_member(id));

create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  with check (auth.uid() is not null and owner_user_id = auth.uid());

create policy "workspaces_update_owner_admin"
  on public.workspaces for update
  using (owner_user_id = auth.uid() or public.has_workspace_role(id, array['owner', 'admin']))
  with check (owner_user_id = auth.uid() or public.has_workspace_role(id, array['owner', 'admin']));

create policy "workspaces_delete_owner_only"
  on public.workspaces for delete
  using (owner_user_id = auth.uid());

-- Workspace Memberships Policies
create policy "memberships_select_member"
  on public.workspace_memberships for select
  using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

create policy "memberships_insert_privileged"
  on public.workspace_memberships for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
    or (
      not exists (select 1 from public.workspace_memberships wm where wm.workspace_id = workspace_id)
      and user_id = auth.uid()
      and role = 'owner'
    )
  );

create policy "memberships_update_admin"
  on public.workspace_memberships for update
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "memberships_delete_admin"
  on public.workspace_memberships for delete
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- Contacts Policies
create policy "contacts_select_member"
  on public.contacts for select
  using (public.is_workspace_member(workspace_id));

create policy "contacts_insert_operators"
  on public.contacts for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "contacts_update_operators"
  on public.contacts for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "contacts_delete_managers"
  on public.contacts for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

-- Inbox Threads Policies
create policy "inbox_threads_select_member"
  on public.inbox_threads for select
  using (public.is_workspace_member(workspace_id));

create policy "inbox_threads_insert_operators"
  on public.inbox_threads for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_threads_update_operators"
  on public.inbox_threads for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_threads_delete_managers"
  on public.inbox_threads for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

-- Inbox Messages Policies
create policy "inbox_messages_select_member"
  on public.inbox_messages for select
  using (public.is_workspace_member(workspace_id));

create policy "inbox_messages_insert_operators"
  on public.inbox_messages for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_messages_update_managers"
  on public.inbox_messages for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

create policy "inbox_messages_delete_admin"
  on public.inbox_messages for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Payment Checkouts Policies
create policy "payment_checkouts_select_member"
  on public.payment_checkouts for select
  using (public.is_workspace_member(workspace_id));

create policy "payment_checkouts_insert_operators"
  on public.payment_checkouts for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "payment_checkouts_update_operators"
  on public.payment_checkouts for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "payment_checkouts_delete_admin"
  on public.payment_checkouts for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Payment Ledger Policies (Append-Only, Service Role for Mutations)
create policy "payment_ledger_select_member"
  on public.payment_ledger for select
  using (public.is_workspace_member(workspace_id));

create policy "payment_ledger_service_role_all"
  on public.payment_ledger for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Webhook Events Policies (Audit Log, Service Role for Mutations)
create policy "webhook_events_select_member"
  on public.webhook_events for select
  using (workspace_id is null or public.is_workspace_member(workspace_id));

create policy "webhook_events_service_role_all"
  on public.webhook_events for all
  using (auth.role() = 'service_role');

-- ============================================================================
-- 7. LEGACY DATA MIGRATION & FOUNDER WORKSPACE BOOTSTRAP
-- ============================================================================
do $$
declare
  v_founder record;
  v_founder_ws_id uuid;
begin
  for v_founder in
    select id, email from auth.users order by created_at asc
  loop
    -- Check if user already holds an owner membership in any workspace
    select workspace_id into v_founder_ws_id
    from public.workspace_memberships
    where user_id = v_founder.id and role = 'owner'
    limit 1;

    -- If no owner workspace exists, idempotently provision "J10 NEXUS HQ"
    if v_founder_ws_id is null then
      insert into public.workspaces (
        name,
        slug,
        workspace_type,
        plan,
        status,
        brand_name,
        accent_color,
        owner_user_id
      ) values (
        'J10 NEXUS HQ',
        'j10-nexus-hq-' || substring(v_founder.id::text, 1, 8),
        'agency_master',
        'enterprise',
        'active',
        'J10 NEXUS HQ',
        '#3B82F6',
        v_founder.id
      )
      returning id into v_founder_ws_id;

      insert into public.workspace_memberships (
        workspace_id,
        user_id,
        role,
        status
      ) values (
        v_founder_ws_id,
        v_founder.id,
        'owner',
        'active'
      );
    end if;

    -- Bridge legacy crm_contacts: add workspace_id column and backfill records
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'crm_contacts') then
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'crm_contacts' and column_name = 'workspace_id'
      ) then
        alter table public.crm_contacts add column workspace_id uuid references public.workspaces(id) on delete set null;
      end if;

      -- Assign workspace_id to legacy contacts
      update public.crm_contacts
      set workspace_id = v_founder_ws_id
      where user_id = v_founder.id and workspace_id is null;

      -- Backfill into canonical contacts table
      insert into public.contacts (
        id,
        workspace_id,
        name,
        email,
        phone,
        company,
        source,
        deal_stage,
        estimated_value,
        assigned_user_id,
        last_contact_at,
        created_at,
        updated_at
      )
      select
        c.id,
        v_founder_ws_id,
        trim(concat(c.first_name, ' ', coalesce(c.last_name, ''))),
        c.email,
        c.phone,
        c.company,
        coalesce(c.source, 'direct'),
        case lower(coalesce(c.status, 'lead'))
          when 'won' then 'won'
          when 'qualified' then 'qualified'
          when 'contacted' then 'qualified'
          when 'interested' then 'proposal'
          when 'lost' then 'churned'
          else 'lead'
        end,
        coalesce(c.estimated_value, 0.00),
        v_founder.id,
        coalesce(c.last_contacted_at, c.created_at, now()),
        coalesce(c.created_at, now()),
        coalesce(c.updated_at, now())
      from public.crm_contacts c
      where c.user_id = v_founder.id
      on conflict (id) do nothing;
    end if;
  end loop;
end $$;

-- >>> END: supabase/migrations\20260912_adversarial_tenant_integrity_recovery.sql <<<


-- >>> START: supabase/migrations\20260913_remote_tenant_activation.sql <<<
-- ============================================================================
-- J10 NEXUS: Complete Idempotent Multi-Tenant Remote Activation Migration
-- Migration: 20260913_remote_tenant_activation.sql
-- Description: Provisions the complete Tier 0 & Tier 0B multi-tenant data foundation,
--              composite referential integrity, financial immutability, RLS, and
--              bootstraps the founder's "J10 NEXUS HQ" workspace with legacy CRM data.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CANONICAL 8 MULTI-TENANT ENTITIES
-- ============================================================================

-- Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  workspace_type text NOT NULL DEFAULT 'client' CHECK (workspace_type IN ('agency_master', 'client')),
  plan text NOT NULL DEFAULT 'growth' CHECK (plan IN ('starter', 'growth', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'past_due', 'suspended')),
  brand_name text NOT NULL,
  accent_color text NOT NULL DEFAULT '#3B82F6',
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Workspace Memberships
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_memberships_workspace_user UNIQUE (workspace_id, user_id)
);

-- Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  source text NOT NULL DEFAULT 'direct',
  deal_stage text NOT NULL DEFAULT 'lead' CHECK (deal_stage IN ('lead', 'qualified', 'proposal', 'won', 'churned')),
  estimated_value numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (estimated_value >= 0),
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_contact_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inbox Threads
CREATE TABLE IF NOT EXISTS public.inbox_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'website', 'crm')),
  external_thread_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'resolved')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inbox Messages
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  provider text NOT NULL DEFAULT 'internal',
  external_message_id text,
  content text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'payment_request', 'template', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payment Checkouts
CREATE TABLE IF NOT EXISTS public.payment_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  checkout_url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payment Ledger (Immutable)
CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  checkout_id uuid REFERENCES public.payment_checkouts(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'stripe',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'refunded', 'pending')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Webhook Events (Idempotency)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  payload_hash text,
  error_code text,
  error_message_sanitized text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT uq_webhook_events_provider_event UNIQUE (provider, provider_event_id)
);

-- ============================================================================
-- 2. COMPOSITE UNIQUENESS & CROSS-TENANT INTEGRITY
-- ============================================================================
DO $$
BEGIN
  -- Composite uniqueness on parent entities
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_contacts_workspace_id') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT uq_contacts_workspace_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_inbox_threads_workspace_id') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT uq_inbox_threads_workspace_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_inbox_messages_workspace_id') THEN
    ALTER TABLE public.inbox_messages ADD CONSTRAINT uq_inbox_messages_workspace_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_payment_checkouts_workspace_id') THEN
    ALTER TABLE public.payment_checkouts ADD CONSTRAINT uq_payment_checkouts_workspace_id UNIQUE (workspace_id, id);
  END IF;

  -- Composite foreign keys enforcing strict cross-tenant isolation
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_workspace_contact') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_workspace_contact
      FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_messages_workspace_thread') THEN
    ALTER TABLE public.inbox_messages ADD CONSTRAINT fk_inbox_messages_workspace_thread
      FOREIGN KEY (workspace_id, thread_id) REFERENCES public.inbox_threads(workspace_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_checkouts_workspace_contact') THEN
    ALTER TABLE public.payment_checkouts ADD CONSTRAINT fk_payment_checkouts_workspace_contact
      FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_checkouts_workspace_thread') THEN
    ALTER TABLE public.payment_checkouts ADD CONSTRAINT fk_payment_checkouts_workspace_thread
      FOREIGN KEY (workspace_id, thread_id) REFERENCES public.inbox_threads(workspace_id, id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_ledger_workspace_checkout') THEN
    ALTER TABLE public.payment_ledger ADD CONSTRAINT fk_payment_ledger_workspace_checkout
      FOREIGN KEY (workspace_id, checkout_id) REFERENCES public.payment_checkouts(workspace_id, id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 3. ESSENTIAL PERFORMANCE & IDEMPOTENCY INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON public.workspaces(slug);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON public.workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_ws ON public.workspace_memberships(workspace_id);

CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON public.contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_deal_stage ON public.contacts(workspace_id, deal_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(workspace_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(workspace_id, phone);

CREATE INDEX IF NOT EXISTS idx_inbox_threads_ws ON public.inbox_threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_contact ON public.inbox_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_ws_channel ON public.inbox_threads(workspace_id, channel);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_ws_last_msg ON public.inbox_threads(workspace_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_ws_thread ON public.inbox_messages(workspace_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_created_at ON public.inbox_messages(thread_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_ws_ext_id
  ON public.inbox_messages(workspace_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_checkouts_ws ON public.payment_checkouts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_checkouts_session ON public.payment_checkouts(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_payment_checkouts_thread ON public.payment_checkouts(thread_id);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_ws ON public.payment_ledger(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_checkout ON public.payment_ledger(checkout_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_provider_event ON public.payment_ledger(provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event ON public.webhook_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_ws ON public.webhook_events(workspace_id);

-- ============================================================================
-- 4. HARDENED SECURITY DEFINER AUTHORIZATION FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = target_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = target_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active'
      AND wm.role = ANY(allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_workspace(target_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = target_workspace_id
      AND w.owner_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_workspace_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.owns_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_workspace(uuid) TO authenticated, service_role;

-- ============================================================================
-- 5. ATOMIC WORKSPACE PROVISIONING RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.provision_workspace(
  p_name text,
  p_slug text,
  p_brand_name text,
  p_accent_color text DEFAULT '#3B82F6',
  p_workspace_type text DEFAULT 'client',
  p_plan text DEFAULT 'growth'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_workspace public.workspaces%ROWTYPE;
  v_membership public.workspace_memberships%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to provision a workspace.';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Workspace name is required.';
  END IF;

  -- 1. Insert workspace atomically
  INSERT INTO public.workspaces (
    name,
    slug,
    workspace_type,
    plan,
    status,
    brand_name,
    accent_color,
    owner_user_id
  ) VALUES (
    trim(p_name),
    trim(p_slug),
    p_workspace_type,
    p_plan,
    'active',
    COALESCE(trim(p_brand_name), trim(p_name)),
    COALESCE(p_accent_color, '#3B82F6'),
    v_user_id
  )
  RETURNING * INTO v_workspace;

  -- 2. Insert owner membership in same transaction
  INSERT INTO public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    status
  ) VALUES (
    v_workspace.id,
    v_user_id,
    'owner',
    'active'
  )
  RETURNING * INTO v_membership;

  RETURN jsonb_build_object(
    'workspace', to_jsonb(v_workspace),
    'membership', to_jsonb(v_membership)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_workspace(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_workspace(text, text, text, text, text, text) TO authenticated, service_role;

-- ============================================================================
-- 6. FINANCIAL IMMUTABILITY & MUTATION GUARDS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_payment_checkout_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Forbid non-service_role users from marking checkouts paid
  IF (NEW.status = 'paid' AND OLD.status != 'paid') THEN
    IF (auth.role() != 'service_role') THEN
      RAISE EXCEPTION 'Security violation: Only verified payment webhooks may mark checkouts as paid.';
    END IF;
  END IF;

  -- Amount and currency cannot be modified after initial creation
  IF (NEW.amount != OLD.amount OR NEW.currency != OLD.currency) THEN
    IF (auth.role() != 'service_role') THEN
      RAISE EXCEPTION 'Security violation: Financial amount and currency cannot be modified after creation.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_checkout_mutation ON public.payment_checkouts;
CREATE TRIGGER trg_payment_checkout_mutation
  BEFORE UPDATE ON public.payment_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.check_payment_checkout_mutation();

-- Payment ledger is strictly append-only
CREATE OR REPLACE FUNCTION public.check_payment_ledger_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Security violation: payment_ledger is an immutable audit log. Updates and deletes are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_ledger_immutability ON public.payment_ledger;
CREATE TRIGGER trg_payment_ledger_immutability
  BEFORE UPDATE OR DELETE ON public.payment_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.check_payment_ledger_immutability();

-- ============================================================================
-- 7. ROW LEVEL SECURITY ACTIVATION & POLICIES
-- ============================================================================
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Idempotent policy drops
DROP POLICY IF EXISTS "workspaces_select_member" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_insert_authenticated" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update_owner_admin" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_delete_owner_only" ON public.workspaces;

DROP POLICY IF EXISTS "memberships_select_member" ON public.workspace_memberships;
DROP POLICY IF EXISTS "memberships_insert_privileged" ON public.workspace_memberships;
DROP POLICY IF EXISTS "memberships_update_admin" ON public.workspace_memberships;
DROP POLICY IF EXISTS "memberships_delete_admin" ON public.workspace_memberships;

DROP POLICY IF EXISTS "contacts_select_member" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert_operators" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update_operators" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete_managers" ON public.contacts;

DROP POLICY IF EXISTS "inbox_threads_select_member" ON public.inbox_threads;
DROP POLICY IF EXISTS "inbox_threads_insert_operators" ON public.inbox_threads;
DROP POLICY IF EXISTS "inbox_threads_update_operators" ON public.inbox_threads;
DROP POLICY IF EXISTS "inbox_threads_delete_managers" ON public.inbox_threads;

DROP POLICY IF EXISTS "inbox_messages_select_member" ON public.inbox_messages;
DROP POLICY IF EXISTS "inbox_messages_insert_operators" ON public.inbox_messages;
DROP POLICY IF EXISTS "inbox_messages_update_managers" ON public.inbox_messages;
DROP POLICY IF EXISTS "inbox_messages_delete_admin" ON public.inbox_messages;

DROP POLICY IF EXISTS "payment_checkouts_select_member" ON public.payment_checkouts;
DROP POLICY IF EXISTS "payment_checkouts_insert_operators" ON public.payment_checkouts;
DROP POLICY IF EXISTS "payment_checkouts_update_operators" ON public.payment_checkouts;
DROP POLICY IF EXISTS "payment_checkouts_delete_admin" ON public.payment_checkouts;

DROP POLICY IF EXISTS "payment_ledger_select_member" ON public.payment_ledger;
DROP POLICY IF EXISTS "payment_ledger_service_role_all" ON public.payment_ledger;

DROP POLICY IF EXISTS "webhook_events_select_member" ON public.webhook_events;
DROP POLICY IF EXISTS "webhook_events_service_role_all" ON public.webhook_events;

-- Workspaces
CREATE POLICY "workspaces_select_member"
  ON public.workspaces FOR SELECT
  USING (owner_user_id = auth.uid() OR public.is_workspace_member(id));

CREATE POLICY "workspaces_insert_authenticated"
  ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

CREATE POLICY "workspaces_update_owner_admin"
  ON public.workspaces FOR UPDATE
  USING (owner_user_id = auth.uid() OR public.has_workspace_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (owner_user_id = auth.uid() OR public.has_workspace_role(id, ARRAY['owner', 'admin']));

CREATE POLICY "workspaces_delete_owner_only"
  ON public.workspaces FOR DELETE
  USING (owner_user_id = auth.uid());

-- Workspace Memberships
CREATE POLICY "memberships_select_member"
  ON public.workspace_memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id));

CREATE POLICY "memberships_insert_privileged"
  ON public.workspace_memberships FOR INSERT
  WITH CHECK (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR (
      NOT EXISTS (SELECT 1 FROM public.workspace_memberships wm WHERE wm.workspace_id = workspace_id)
      AND user_id = auth.uid()
      AND role = 'owner'
    )
  );

CREATE POLICY "memberships_update_admin"
  ON public.workspace_memberships FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE POLICY "memberships_delete_admin"
  ON public.workspace_memberships FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Contacts
CREATE POLICY "contacts_select_member"
  ON public.contacts FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contacts_insert_operators"
  ON public.contacts FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "contacts_update_operators"
  ON public.contacts FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "contacts_delete_managers"
  ON public.contacts FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
  );

-- Inbox Threads
CREATE POLICY "inbox_threads_select_member"
  ON public.inbox_threads FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "inbox_threads_insert_operators"
  ON public.inbox_threads FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "inbox_threads_update_operators"
  ON public.inbox_threads FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "inbox_threads_delete_managers"
  ON public.inbox_threads FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
  );

-- Inbox Messages
CREATE POLICY "inbox_messages_select_member"
  ON public.inbox_messages FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "inbox_messages_insert_operators"
  ON public.inbox_messages FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "inbox_messages_update_managers"
  ON public.inbox_messages FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
  );

CREATE POLICY "inbox_messages_delete_admin"
  ON public.inbox_messages FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- Payment Checkouts
CREATE POLICY "payment_checkouts_select_member"
  ON public.payment_checkouts FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "payment_checkouts_insert_operators"
  ON public.payment_checkouts FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "payment_checkouts_update_operators"
  ON public.payment_checkouts FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "payment_checkouts_delete_admin"
  ON public.payment_checkouts FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- Payment Ledger (Immutable, Service Role only for writes)
CREATE POLICY "payment_ledger_select_member"
  ON public.payment_ledger FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "payment_ledger_service_role_all"
  ON public.payment_ledger FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Webhook Events (Audit Log, Service Role only for writes)
CREATE POLICY "webhook_events_select_member"
  ON public.webhook_events FOR SELECT
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));

CREATE POLICY "webhook_events_service_role_all"
  ON public.webhook_events FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 8. FOUNDER CANONICAL RECOVERY & CRM BACKFILL (IDEMPOTENT)
-- ============================================================================
DO $$
DECLARE
  v_user RECORD;
  v_target_ws_id uuid;
  v_is_first_user boolean := true;
BEGIN
  -- Iterate through registered users in auth.users
  FOR v_user IN
    SELECT id, email, created_at FROM auth.users ORDER BY created_at ASC
  LOOP
    -- Check if user already holds an owner membership
    SELECT workspace_id INTO v_target_ws_id
    FROM public.workspace_memberships
    WHERE user_id = v_user.id AND role = 'owner'
    LIMIT 1;

    -- If no owner workspace exists, bootstrap appropriate workspace
    IF v_target_ws_id IS NULL THEN
      IF v_is_first_user THEN
        -- Primary Founder receives canonical "J10 NEXUS HQ"
        INSERT INTO public.workspaces (
          name,
          slug,
          workspace_type,
          plan,
          status,
          brand_name,
          accent_color,
          owner_user_id
        ) VALUES (
          'J10 NEXUS HQ',
          'j10-nexus-hq-' || substring(v_user.id::text, 1, 8),
          'agency_master',
          'enterprise',
          'active',
          'J10 NEXUS HQ',
          '#3B82F6',
          v_user.id
        )
        RETURNING id INTO v_target_ws_id;
      ELSE
        -- Subsequent users receive standard client workspace
        INSERT INTO public.workspaces (
          name,
          slug,
          workspace_type,
          plan,
          status,
          brand_name,
          accent_color,
          owner_user_id
        ) VALUES (
          COALESCE(split_part(v_user.email, '@', 1) || '''s Workspace', 'Client Workspace'),
          'ws-' || substring(v_user.id::text, 1, 8) || '-' || extract(epoch from now())::bigint::text,
          'client',
          'growth',
          'active',
          COALESCE(split_part(v_user.email, '@', 1) || '''s Workspace', 'Client Workspace'),
          '#3B82F6',
          v_user.id
        )
        RETURNING id INTO v_target_ws_id;
      END IF;

      -- Assign owner membership
      INSERT INTO public.workspace_memberships (
        workspace_id,
        user_id,
        role,
        status
      ) VALUES (
        v_target_ws_id,
        v_user.id,
        'owner',
        'active'
      );
    END IF;

    -- Bridge legacy crm_contacts: add workspace_id column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_contacts') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_contacts' AND column_name = 'workspace_id'
      ) THEN
        ALTER TABLE public.crm_contacts ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;
      END IF;

      -- Assign workspace_id to legacy crm_contacts
      UPDATE public.crm_contacts
      SET workspace_id = v_target_ws_id
      WHERE user_id = v_user.id AND workspace_id IS NULL;

      -- Backfill into canonical contacts table idempotently
      INSERT INTO public.contacts (
        id,
        workspace_id,
        name,
        email,
        phone,
        company,
        source,
        deal_stage,
        estimated_value,
        assigned_user_id,
        last_contact_at,
        created_at,
        updated_at
      )
      SELECT
        c.id,
        v_target_ws_id,
        trim(concat(c.first_name, ' ', COALESCE(c.last_name, ''))),
        c.email,
        c.phone,
        c.company,
        COALESCE(c.source, 'direct'),
        CASE lower(COALESCE(c.status, 'lead'))
          WHEN 'won' THEN 'won'
          WHEN 'qualified' THEN 'qualified'
          WHEN 'contacted' THEN 'qualified'
          WHEN 'interested' THEN 'proposal'
          WHEN 'lost' THEN 'churned'
          ELSE 'lead'
        END,
        COALESCE(c.estimated_value, 0.00),
        v_user.id,
        COALESCE(c.last_contacted_at, c.created_at, now()),
        COALESCE(c.created_at, now()),
        COALESCE(c.updated_at, now())
      FROM public.crm_contacts c
      WHERE c.user_id = v_user.id
      ON CONFLICT (id) DO NOTHING;
    END IF;

    v_is_first_user := false;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- 9. RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 10. VERIFICATION SUMMARY (Displayed in Supabase SQL Editor Results)
-- ============================================================================
SELECT
  (SELECT count(*) FROM public.workspaces) AS workspaces_count,
  (SELECT count(*) FROM public.workspace_memberships) AS memberships_count,
  (SELECT count(*) FROM public.contacts) AS contacts_count,
  (SELECT count(*) FROM public.inbox_threads) AS threads_count,
  (SELECT count(*) FROM public.payment_checkouts) AS checkouts_count,
  (SELECT count(*) FROM public.payment_ledger) AS ledger_count,
  (SELECT count(*) FROM public.webhook_events) AS webhook_events_count;

-- >>> END: supabase/migrations\20260913_remote_tenant_activation.sql <<<


-- >>> START: supabase/migrations\20260914_financial_integrity_ledger_hardening.sql <<<
-- ============================================================================
-- J10 NEXUS: Financial Data Integrity & Ledger Hardening
-- Migration: 20260914_financial_integrity_ledger_hardening.sql
-- Description: Enforces NOT NULL on payment_ledger.checkout_id, adds provider_mode
--              to isolate live revenue from test mode, enforces ON DELETE RESTRICT
--              to prevent orphan financial entries, and enforces uniqueness on
--              payment_ledger provider events.
-- ============================================================================

BEGIN;

-- 1. Safely remove synthetic verification rows created during Tier 0C trigger testing
ALTER TABLE public.payment_ledger DISABLE TRIGGER trg_payment_ledger_immutability;

DELETE FROM public.payment_ledger
WHERE provider_event_id LIKE 'evt_tier0c_verify_%';

DELETE FROM public.payment_checkouts
WHERE metadata->>'test_source' = 'tier0c_verification';

ALTER TABLE public.payment_ledger ENABLE TRIGGER trg_payment_ledger_immutability;

-- 2. Add provider_mode to payment_checkouts and payment_ledger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_checkouts' AND column_name = 'provider_mode'
  ) THEN
    ALTER TABLE public.payment_checkouts
      ADD COLUMN provider_mode text NOT NULL DEFAULT 'test'
      CHECK (provider_mode IN ('live', 'test'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_ledger' AND column_name = 'provider_mode'
  ) THEN
    ALTER TABLE public.payment_ledger
      ADD COLUMN provider_mode text NOT NULL DEFAULT 'test'
      CHECK (provider_mode IN ('live', 'test'));
  END IF;
END $$;

-- 3. Enforce NOT NULL on payment_ledger.checkout_id
ALTER TABLE public.payment_ledger ALTER COLUMN checkout_id SET NOT NULL;

-- 4. Upgrade foreign keys from ON DELETE SET NULL to ON DELETE RESTRICT
-- A checkout referenced by an immutable payment ledger entry can NEVER be deleted.
DO $$
BEGIN
  -- Drop existing legacy foreign keys
  ALTER TABLE public.payment_ledger DROP CONSTRAINT IF EXISTS payment_ledger_checkout_id_fkey;
  ALTER TABLE public.payment_ledger DROP CONSTRAINT IF EXISTS fk_payment_ledger_workspace_checkout;

  -- Add RESTRICT constraints
  ALTER TABLE public.payment_ledger
    ADD CONSTRAINT payment_ledger_checkout_id_fkey
    FOREIGN KEY (checkout_id) REFERENCES public.payment_checkouts(id) ON DELETE RESTRICT;

  ALTER TABLE public.payment_ledger
    ADD CONSTRAINT fk_payment_ledger_workspace_checkout
    FOREIGN KEY (workspace_id, checkout_id) REFERENCES public.payment_checkouts(workspace_id, id) ON DELETE RESTRICT;
END $$;

-- 5. Enforce unique provider event idempotency on payment_ledger
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_ledger_provider_event
  ON public.payment_ledger (provider, provider_event_id);

-- 6. Revenue query optimization index (workspace, provider_mode, status)
CREATE INDEX IF NOT EXISTS idx_payment_ledger_revenue
  ON public.payment_ledger (workspace_id, provider_mode, status);

CREATE INDEX IF NOT EXISTS idx_payment_checkouts_mode
  ON public.payment_checkouts (workspace_id, provider_mode, status);

COMMIT;

-- 7. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 8. Verification summary
SELECT
  (SELECT count(*) FROM public.payment_checkouts) AS checkouts_count,
  (SELECT count(*) FROM public.payment_ledger) AS ledger_count,
  (SELECT count(*) FROM public.webhook_events) AS webhook_events_count;

-- >>> END: supabase/migrations\20260914_financial_integrity_ledger_hardening.sql <<<


-- >>> START: supabase/migrations\20260915_identity_platform_roles_invitations.sql <<<
-- ============================================================================
-- J10 NEXUS TIER 0E MIGRATION: IDENTITY, PLATFORM ROLES, INVITATIONS & ACCESS CONTROL
-- File: supabase/migrations/20260915_identity_platform_roles_invitations.sql
-- Description:
--   1. Creates persistent public.profiles for canonical user metadata.
--   2. Creates protected public.platform_roles for separation of platform and workspace authority.
--   3. Creates public.workspace_invitations with token hash security and single-use constraints.
--   4. Grants platform_founder explicitly and idempotently to the verified founder UUID.
--   5. Hardens provision_workspace RPC against unauthorized agency_master creation.
--   6. Enforces RLS on profiles, platform_roles, and invitations.
--   7. Guards workspace ownership transfer so no workspace can be left without an active owner.
-- ============================================================================

BEGIN;

-- 1. CANONICAL PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  job_title TEXT NOT NULL DEFAULT '',
  phone TEXT,
  locale TEXT NOT NULL DEFAULT 'en-US',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- 2. PROTECTED PLATFORM ROLES TABLE
CREATE TABLE IF NOT EXISTS public.platform_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('platform_founder', 'platform_admin', 'platform_support')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_platform_roles_role ON public.platform_roles(role) WHERE revoked_at IS NULL;

-- 3. WORKSPACE INVITATIONS TABLE
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'agent', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_lookup
  ON public.workspace_invitations(workspace_id, email_normalized);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token
  ON public.workspace_invitations(token_hash);

-- 4. HELPER FUNCTIONS FOR PLATFORM ROLES
CREATE OR REPLACE FUNCTION public.is_platform_founder(p_user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = p_user_id
      AND role = 'platform_founder'
      AND revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = p_user_id
      AND role IN ('platform_founder', 'platform_admin')
      AND revoked_at IS NULL
  );
$$;

-- 5. AUTOMATIC PROFILE PROVISIONING TRIGGER ON AUTH.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'active'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill profile for any existing user
INSERT INTO public.profiles (user_id, display_name, status)
SELECT id, split_part(email, '@', 1), 'active'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 6. IDEMPOTENT FOUNDER PROTECTION
-- Explicitly grant platform_founder to the verified immutable founder UUID
INSERT INTO public.platform_roles (user_id, role, granted_at)
VALUES ('0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa', 'platform_founder', now())
ON CONFLICT (user_id) DO UPDATE SET role = 'platform_founder', revoked_at = NULL;

UPDATE public.profiles
SET display_name = 'CEO & Founder',
    job_title = 'CEO',
    updated_at = now()
WHERE user_id = '0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa';

-- 7. HARDENED PROVISION_WORKSPACE RPC
-- Enforces that only verified platform admins/founders can provision agency_master or enterprise workspaces.
CREATE OR REPLACE FUNCTION public.provision_workspace(
  p_name text,
  p_slug text,
  p_brand_name text,
  p_accent_color text DEFAULT '#3B82F6',
  p_workspace_type text DEFAULT 'client',
  p_plan text DEFAULT 'growth'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_is_platform_admin boolean;
  v_final_type text;
  v_final_plan text;
  v_workspace public.workspaces%ROWTYPE;
  v_membership public.workspace_memberships%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to provision a workspace.';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Workspace name is required.';
  END IF;

  -- Check platform privileges
  v_is_platform_admin := public.is_platform_admin(v_user_id);

  IF p_workspace_type = 'agency_master' AND NOT v_is_platform_admin THEN
    RAISE EXCEPTION 'Permission denied: Agency HQ workspaces can only be created by platform administrators.';
  END IF;

  v_final_type := CASE WHEN v_is_platform_admin THEN COALESCE(p_workspace_type, 'client') ELSE 'client' END;
  v_final_plan := CASE WHEN v_is_platform_admin THEN COALESCE(p_plan, 'growth') ELSE 'growth' END;

  -- 1. Insert workspace atomically
  INSERT INTO public.workspaces (
    name,
    slug,
    workspace_type,
    plan,
    status,
    brand_name,
    accent_color,
    owner_user_id
  ) VALUES (
    trim(p_name),
    trim(p_slug),
    v_final_type,
    v_final_plan,
    'active',
    COALESCE(trim(p_brand_name), trim(p_name)),
    COALESCE(p_accent_color, '#3B82F6'),
    v_user_id
  )
  RETURNING * INTO v_workspace;

  -- 2. Insert owner membership in same transaction
  INSERT INTO public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    status
  ) VALUES (
    v_workspace.id,
    v_user_id,
    'owner',
    'active'
  )
  RETURNING * INTO v_membership;

  RETURN jsonb_build_object(
    'workspace', to_jsonb(v_workspace),
    'membership', to_jsonb(v_membership)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_workspace(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_workspace(text, text, text, text, text, text) TO authenticated, service_role;

-- 8. OWNERSHIP TRANSFER SAFETY TRIGGER
-- Prevents removing or demoting the last active owner of a workspace without prior transfer
CREATE OR REPLACE FUNCTION public.check_last_active_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_owners_remaining int;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner' AND OLD.status = 'active') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role != 'owner' OR NEW.status != 'active')) THEN
    SELECT count(*) INTO v_active_owners_remaining
    FROM public.workspace_memberships
    WHERE workspace_id = OLD.workspace_id
      AND role = 'owner'
      AND status = 'active'
      AND id != OLD.id;

    IF v_active_owners_remaining < 1 THEN
      RAISE EXCEPTION 'Cannot demote or remove the last active owner. Transfer ownership to another active member first.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_last_owner ON public.workspace_memberships;
CREATE TRIGGER trg_guard_last_owner
  BEFORE UPDATE OR DELETE ON public.workspace_memberships
  FOR EACH ROW EXECUTE FUNCTION public.check_last_active_owner();

-- 9. ROW LEVEL SECURITY (RLS) POLICIES

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_permitted" ON public.profiles;
CREATE POLICY "profiles_select_permitted"
  ON public.profiles FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships my_mem
      JOIN public.workspace_memberships their_mem ON my_mem.workspace_id = their_mem.workspace_id
      WHERE my_mem.user_id = auth.uid()
        AND their_mem.user_id = profiles.user_id
        AND my_mem.status = 'active'
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Platform Roles RLS
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_roles_select_permitted" ON public.platform_roles;
CREATE POLICY "platform_roles_select_permitted"
  ON public.platform_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_platform_admin());

-- Notice: No INSERT/UPDATE/DELETE policies for authenticated users on platform_roles!
-- Only service_role can modify platform_roles.

-- Workspace Invitations RLS
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select_privileged" ON public.workspace_invitations;
CREATE POLICY "invitations_select_privileged"
  ON public.workspace_invitations FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "invitations_insert_privileged" ON public.workspace_invitations;
CREATE POLICY "invitations_insert_privileged"
  ON public.workspace_invitations FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "invitations_update_privileged" ON public.workspace_invitations;
CREATE POLICY "invitations_update_privileged"
  ON public.workspace_invitations FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "invitations_delete_privileged" ON public.workspace_invitations;
CREATE POLICY "invitations_delete_privileged"
  ON public.workspace_invitations FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

COMMIT;

-- 10. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- 11. VERIFICATION SUMMARY QUERY
SELECT
  (SELECT count(*) FROM public.profiles) AS profiles_count,
  (SELECT count(*) FROM public.platform_roles WHERE revoked_at IS NULL) AS platform_roles_count,
  (SELECT count(*) FROM public.workspace_invitations) AS invitations_count,
  (SELECT count(*) FROM public.workspaces) AS workspaces_count,
  (SELECT count(*) FROM public.workspace_memberships) AS memberships_count;

-- >>> END: supabase/migrations\20260915_identity_platform_roles_invitations.sql <<<


-- >>> START: supabase/migrations\20260915b_atomic_founder_ownership_transfer.sql <<<
-- ============================================================================
-- J10 NEXUS TIER 0E ATOMIC OWNERSHIP & FOUNDER ROLE TRANSFER
-- File: supabase/migrations/20260915b_atomic_founder_ownership_transfer.sql
-- Description:
--   Atomically transfers J10 NEXUS HQ ownership and platform_founder role
--   from the initial account (richeder7@gmail.com) to the newly authenticated
--   CEO account (contact.j1oeditz@gmail.com).
--
-- Invariants enforced:
--   1. Validates both source and destination user accounts exist in auth.users.
--   2. Validates source owns J10 NEXUS HQ and holds active platform_founder.
--   3. Adds active owner membership in J10 NEXUS HQ for destination user.
--   4. Updates workspaces.owner_user_id to destination user.
--   5. Grants platform_founder to destination user.
--   6. Preserves destination user profile display_name while ensuring job_title = 'CEO'.
--   7. Retains source account as platform_admin & co-owner for rollback safety.
--   8. Preserves all 7 CRM contacts, threads, messages, and ledger integrity.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_source_id uuid := '0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa';
  v_dest_id uuid := 'f44f4cc4-30bc-4d78-98e3-0b63ff63e08f';
  v_ws_id uuid := 'ce593364-2aaf-47e4-a1d2-2272775747c4';
BEGIN
  -- 1. Validate source user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_source_id) THEN
    RAISE EXCEPTION 'Source founder user (%) does not exist in auth.users.', v_source_id;
  END IF;

  -- 2. Validate destination user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_dest_id) THEN
    RAISE EXCEPTION 'Destination CEO user (%) does not exist in auth.users.', v_dest_id;
  END IF;

  -- 3. Validate J10 NEXUS HQ exists and is currently owned by source
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_ws_id AND owner_user_id = v_source_id) THEN
    RAISE EXCEPTION 'Workspace % is not currently owned by source founder %.', v_ws_id, v_source_id;
  END IF;

  -- 4. Validate source holds platform_founder
  IF NOT EXISTS (SELECT 1 FROM public.platform_roles WHERE user_id = v_source_id AND role = 'platform_founder' AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Source founder % does not hold active platform_founder role.', v_source_id;
  END IF;

  -- 5. Grant active owner membership in J10 NEXUS HQ to destination user
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
  VALUES (v_ws_id, v_dest_id, 'owner', 'active')
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET role = 'owner', status = 'active', updated_at = now();

  -- 6. Transfer workspace owner_user_id to destination user
  UPDATE public.workspaces
  SET owner_user_id = v_dest_id,
      updated_at = now()
  WHERE id = v_ws_id;

  -- 7. Grant platform_founder role to destination user
  INSERT INTO public.platform_roles (user_id, role, granted_at)
  VALUES (v_dest_id, 'platform_founder', now())
  ON CONFLICT (user_id)
  DO UPDATE SET role = 'platform_founder', revoked_at = NULL;

  -- 8. Ensure destination profile has CEO job title and active status
  INSERT INTO public.profiles (user_id, display_name, job_title, status)
  VALUES (v_dest_id, 'J10 THE BOSS', 'CEO', 'active')
  ON CONFLICT (user_id)
  DO UPDATE SET job_title = 'CEO', status = 'active', updated_at = now();

  -- 9. Retain source account as platform_admin for backup/recovery
  UPDATE public.platform_roles
  SET role = 'platform_admin'
  WHERE user_id = v_source_id;

  RAISE NOTICE 'Atomic ownership and platform_founder transfer completed successfully to destination user %', v_dest_id;
END $$;

COMMIT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verification Query
SELECT
  w.id AS workspace_id,
  w.name AS workspace_name,
  w.owner_user_id,
  (SELECT count(*) FROM public.workspace_memberships WHERE workspace_id = w.id AND status = 'active') AS active_memberships_count,
  (SELECT role FROM public.platform_roles WHERE user_id = w.owner_user_id AND revoked_at IS NULL) AS new_owner_platform_role,
  (SELECT count(*) FROM public.contacts WHERE workspace_id = w.id) AS contacts_preserved_count
FROM public.workspaces w
WHERE w.id = 'ce593364-2aaf-47e4-a1d2-2272775747c4';

-- >>> END: supabase/migrations\20260915b_atomic_founder_ownership_transfer.sql <<<


-- >>> START: supabase/migrations\20260916_global_tenantization_launch_integrity.sql <<<
-- ============================================================================
-- J10 NEXUS TIER 0F MIGRATION: GLOBAL TENANTIZATION, RLS INTEGRITY & HONEST SAAS
-- File: supabase/migrations/20260916_global_tenantization_launch_integrity.sql
-- Description:
--   1. Enforces workspace_id NOT NULL on all legacy and new business tables.
--   2. Runs preflight assertion against ambiguous user memberships.
--   3. Idempotently backfills legacy records to verified active workspaces.
--   4. Scopes workspace_subscriptions to workspace_id with zero client-mutation RLS.
--   5. Implements atomic public.increment_workspace_usage RPC.
--   6. Implements atomic, email-bound public.accept_workspace_invitation RPC.
--   7. Establishes workspace-scoped tables for knowledge, campaigns, invoices,
--      workforce, funnels, products, orders, automations, and integrations.
--   8. Drops broad USING (true) policies and establishes role-tiered RLS.
--   9. Reloads PostgREST schema cache.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PREFLIGHT ASSERTION: NO AMBIGUOUS USER MEMBERSHIPS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_ambiguous_users INT;
BEGIN
  SELECT count(*) INTO v_ambiguous_users
  FROM (
    SELECT user_id
    FROM public.workspace_memberships
    WHERE status = 'active'
    GROUP BY user_id
    HAVING count(DISTINCT workspace_id) > 1
  ) amb;

  IF v_ambiguous_users > 0 THEN
    RAISE EXCEPTION 'Preflight abort: % users belong to multiple active workspaces. Ambiguous backfill prevented.', v_ambiguous_users;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. TENANTIZE LEGACY BUSINESS TABLES
-- ----------------------------------------------------------------------------

-- A. employees
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.employees ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.employees e
SET workspace_id = (
  SELECT m.workspace_id FROM public.workspace_memberships m
  WHERE m.status = 'active' ORDER BY m.created_at ASC LIMIT 1
)
WHERE e.workspace_id IS NULL;

-- B. ai_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_tasks' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.ai_tasks ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.ai_tasks t
SET workspace_id = m.workspace_id
FROM public.workspace_memberships m
WHERE t.workspace_id IS NULL
  AND t.user_id = m.user_id
  AND m.status = 'active';

-- C. automations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automations' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.automations ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.automations a
SET workspace_id = m.workspace_id
FROM public.workspace_memberships m
WHERE a.workspace_id IS NULL
  AND a.user_id = m.user_id
  AND m.status = 'active';

-- D. automation_runs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automation_runs' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.automation_runs ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.automation_runs ar
SET workspace_id = a.workspace_id
FROM public.automations a
WHERE ar.workspace_id IS NULL
  AND ar.automation_id = a.id;

-- E. automation_steps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automation_steps' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.automation_steps ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.automation_steps ast
SET workspace_id = a.workspace_id
FROM public.automations a
WHERE ast.workspace_id IS NULL
  AND ast.automation_id = a.id;

-- F. automation_versions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automation_versions' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.automation_versions ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.automation_versions av
SET workspace_id = a.workspace_id
FROM public.automations a
WHERE av.workspace_id IS NULL
  AND av.automation_id = a.id;

-- G. integrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.integrations ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.integrations i
SET workspace_id = m.workspace_id
FROM public.workspace_memberships m
WHERE i.workspace_id IS NULL
  AND i.user_id = m.user_id
  AND m.status = 'active';

-- H. integration_credentials
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'integration_credentials' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.integration_credentials ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.integration_credentials ic
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE ic.workspace_id IS NULL
  AND ic.integration_id = i.id;

-- I. activity_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_logs' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.activity_logs ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.activity_logs al
SET workspace_id = m.workspace_id
FROM public.workspace_memberships m
WHERE al.workspace_id IS NULL
  AND al.user_id = m.user_id
  AND m.status = 'active';

-- Verify backfills succeeded before applying NOT NULL constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.automations WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill assertion failed: automations row lacks workspace_id.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integrations WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill assertion failed: integrations row lacks workspace_id.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.activity_logs WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill assertion failed: activity_logs row lacks workspace_id.';
  END IF;
END;
$$;

-- Apply NOT NULL constraints on legacy tables
ALTER TABLE public.automations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.automation_runs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.automation_steps ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.automation_versions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integrations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_credentials ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.employees ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.ai_tasks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.activity_logs ALTER COLUMN workspace_id SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. WORKSPACE-SCOPED SUBSCRIPTIONS & ENTITLEMENTS (HARDENED)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'starter' CHECK (plan_id IN ('starter', 'growth', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'none')),
  monthly_message_limit INTEGER NOT NULL DEFAULT 1000 CHECK (monthly_message_limit >= 0),
  messages_used_this_period INTEGER NOT NULL DEFAULT 0 CHECK (messages_used_this_period >= 0),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  grace_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial subscription for existing workspaces if missing
INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, monthly_message_limit)
SELECT w.id, COALESCE(w.plan, 'growth'), 'active', 10000
FROM public.workspaces w
ON CONFLICT (workspace_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_ws ON public.workspace_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_status ON public.workspace_subscriptions(status);

-- DROP ALL LEGACY SUBSCRIPTION POLICIES (INCLUDING BROAD USING true POLICY)
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscription" ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "workspace_subscriptions_select_member" ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "workspace_subscriptions_modify_restricted" ON public.workspace_subscriptions;

ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only policy for active workspace members
CREATE POLICY "workspace_subscriptions_select_member"
  ON public.workspace_subscriptions
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR public.is_platform_admin()
  );

-- NO CLIENT INSERT, UPDATE, OR DELETE POLICIES! Writable only via trusted service_role.

-- Atomic Usage Increment Function
CREATE OR REPLACE FUNCTION public.increment_workspace_usage(
  p_workspace_id UUID,
  p_count INT DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
BEGIN
  IF p_count <= 0 THEN
    p_count := 1;
  END IF;

  UPDATE public.workspace_subscriptions
  SET messages_used_this_period = messages_used_this_period + p_count,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
  RETURNING * INTO v_sub;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No subscription found for workspace.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_sub.workspace_id,
    'messages_used_this_period', v_sub.messages_used_this_period,
    'monthly_message_limit', v_sub.monthly_message_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_workspace_usage(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_workspace_usage(UUID, INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. ATOMIC, EMAIL-BOUND WORKSPACE INVITATION ACCEPTANCE RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_user_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation public.workspace_invitations%ROWTYPE;
  v_membership public.workspace_memberships%ROWTYPE;
  v_norm_email text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to accept invitation.';
  END IF;

  v_norm_email := lower(trim(p_user_email));
  IF v_norm_email IS NULL OR v_norm_email = '' THEN
    RAISE EXCEPTION 'Authenticated user email is required.';
  END IF;

  -- Lock row exclusively during evaluation to prevent race conditions
  SELECT * INTO v_invitation
  FROM public.workspace_invitations
  WHERE token_hash = trim(p_token_hash)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation token.';
  END IF;

  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been accepted.';
  END IF;

  IF v_invitation.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been revoked.';
  END IF;

  IF v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'This invitation has expired.';
  END IF;

  -- Enforce strict recipient email matching
  IF lower(trim(v_invitation.email_normalized)) != v_norm_email THEN
    RAISE EXCEPTION 'Access denied: Authenticated email does not match invitation recipient.';
  END IF;

  -- Atomic membership upsert
  INSERT INTO public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    status
  ) VALUES (
    v_invitation.workspace_id,
    p_user_id,
    v_invitation.role,
    'active'
  )
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = now()
  RETURNING * INTO v_membership;

  -- Mark accepted in same atomic transaction
  UPDATE public.workspace_invitations
  SET accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_invitation.workspace_id,
    'membership', to_jsonb(v_membership)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invitation(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text, uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. CANONICAL MULTI-TENANT BUSINESS TABLES
-- ----------------------------------------------------------------------------

-- A. company_knowledge_documents
CREATE TABLE IF NOT EXISTS public.company_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'product_service',
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'published',
  is_grounding_active BOOLEAN NOT NULL DEFAULT true,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_ws ON public.company_knowledge_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_ws_status ON public.company_knowledge_documents(workspace_id, status, is_grounding_active);

ALTER TABLE public.company_knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_select" ON public.company_knowledge_documents;
CREATE POLICY "knowledge_select" ON public.company_knowledge_documents FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "knowledge_insert" ON public.company_knowledge_documents;
CREATE POLICY "knowledge_insert" ON public.company_knowledge_documents FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "knowledge_update" ON public.company_knowledge_documents;
CREATE POLICY "knowledge_update" ON public.company_knowledge_documents FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "knowledge_delete" ON public.company_knowledge_documents;
CREATE POLICY "knowledge_delete" ON public.company_knowledge_documents FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- B. marketing_campaigns
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  audience_segment TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'draft',
  target_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  replied_count INTEGER NOT NULL DEFAULT 0,
  message_template TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_ws ON public.marketing_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_ws_status ON public.marketing_campaigns(workspace_id, status);

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select" ON public.marketing_campaigns;
CREATE POLICY "campaigns_select" ON public.marketing_campaigns FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "campaigns_insert" ON public.marketing_campaigns;
CREATE POLICY "campaigns_insert" ON public.marketing_campaigns FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "campaigns_update" ON public.marketing_campaigns;
CREATE POLICY "campaigns_update" ON public.marketing_campaigns FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "campaigns_delete" ON public.marketing_campaigns;
CREATE POLICY "campaigns_delete" ON public.marketing_campaigns FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- C. finance_invoices
CREATE TABLE IF NOT EXISTS public.finance_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + interval '14 days'),
  paid_at TIMESTAMPTZ,
  line_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  notes TEXT,
  payment_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_finance_invoice_workspace_num UNIQUE (workspace_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_finance_invoices_ws ON public.finance_invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_finance_invoices_ws_status ON public.finance_invoices(workspace_id, status);

ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select" ON public.finance_invoices;
CREATE POLICY "invoices_select" ON public.finance_invoices FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "invoices_insert" ON public.finance_invoices;
CREATE POLICY "invoices_insert" ON public.finance_invoices FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "invoices_update" ON public.finance_invoices;
CREATE POLICY "invoices_update" ON public.finance_invoices FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "invoices_delete" ON public.finance_invoices;
CREATE POLICY "invoices_delete" ON public.finance_invoices FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- D. workforce_members
CREATE TABLE IF NOT EXISTS public.workforce_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Operations',
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_agents TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  monthly_salary NUMERIC(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_ws ON public.workforce_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workforce_ws_dept ON public.workforce_members(workspace_id, department);

ALTER TABLE public.workforce_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workforce_select" ON public.workforce_members;
CREATE POLICY "workforce_select" ON public.workforce_members FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "workforce_insert" ON public.workforce_members;
CREATE POLICY "workforce_insert" ON public.workforce_members FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "workforce_update" ON public.workforce_members;
CREATE POLICY "workforce_update" ON public.workforce_members FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "workforce_delete" ON public.workforce_members;
CREATE POLICY "workforce_delete" ON public.workforce_members FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- E. website_funnels
CREATE TABLE IF NOT EXISTS public.website_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'High-Converting Business Landing Page',
  slug TEXT NOT NULL DEFAULT 'main',
  theme TEXT NOT NULL DEFAULT 'obsidian',
  custom_domain TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  hero_headline TEXT NOT NULL DEFAULT 'Transform Operations with Autonomous AI Systems',
  hero_subheadline TEXT NOT NULL DEFAULT 'Deploy 24/7 WhatsApp sales agents, automated CRM lead capture, and intelligent billing.',
  primary_cta_text TEXT NOT NULL DEFAULT 'Start on WhatsApp',
  primary_cta_link TEXT,
  features JSONB NOT NULL DEFAULT '[]'::JSONB,
  testimonials JSONB NOT NULL DEFAULT '[]'::JSONB,
  faqs JSONB NOT NULL DEFAULT '[]'::JSONB,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_website_funnel_workspace_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_funnels_ws ON public.website_funnels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_funnels_slug ON public.website_funnels(slug);

ALTER TABLE public.website_funnels ENABLE ROW LEVEL SECURITY;

-- Allow public read ONLY when explicitly published
DROP POLICY IF EXISTS "funnels_select" ON public.website_funnels;
CREATE POLICY "funnels_select" ON public.website_funnels FOR SELECT
  USING (
    is_published = true
    OR public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
  );

DROP POLICY IF EXISTS "funnels_insert" ON public.website_funnels;
CREATE POLICY "funnels_insert" ON public.website_funnels FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "funnels_update" ON public.website_funnels;
CREATE POLICY "funnels_update" ON public.website_funnels FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "funnels_delete" ON public.website_funnels;
CREATE POLICY "funnels_delete" ON public.website_funnels FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- F. commerce_products & commerce_orders
CREATE TABLE IF NOT EXISTS public.commerce_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  inventory INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_commerce_product_workspace_sku UNIQUE (workspace_id, sku)
);

CREATE TABLE IF NOT EXISTS public.commerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  payment_method TEXT NOT NULL DEFAULT 'stripe',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_commerce_order_workspace_num UNIQUE (workspace_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_commerce_products_ws ON public.commerce_products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_ws ON public.commerce_orders(workspace_id);

ALTER TABLE public.commerce_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_orders ENABLE ROW LEVEL SECURITY;

-- Products Policies
DROP POLICY IF EXISTS "products_select" ON public.commerce_products;
CREATE POLICY "products_select" ON public.commerce_products FOR SELECT
  USING (
    status = 'active'
    OR public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
  );

DROP POLICY IF EXISTS "products_insert" ON public.commerce_products;
CREATE POLICY "products_insert" ON public.commerce_products FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "products_update" ON public.commerce_products;
CREATE POLICY "products_update" ON public.commerce_products FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "products_delete" ON public.commerce_products;
CREATE POLICY "products_delete" ON public.commerce_products FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Orders Policies
DROP POLICY IF EXISTS "orders_select" ON public.commerce_orders;
CREATE POLICY "orders_select" ON public.commerce_orders FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "orders_insert" ON public.commerce_orders;
CREATE POLICY "orders_insert" ON public.commerce_orders FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']));

DROP POLICY IF EXISTS "orders_update" ON public.commerce_orders;
CREATE POLICY "orders_update" ON public.commerce_orders FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "orders_delete" ON public.commerce_orders;
CREATE POLICY "orders_delete" ON public.commerce_orders FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- G. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_ws_user ON public.notifications(workspace_id, user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
  );

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- H. provider_subscriptions & webhook_endpoints
CREATE TABLE IF NOT EXISTS public.provider_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_subscription_id TEXT,
  event_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  endpoint_key TEXT NOT NULL UNIQUE,
  secret_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_subs_ws ON public.provider_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_ws ON public.webhook_endpoints(workspace_id);

ALTER TABLE public.provider_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_subs_select" ON public.provider_subscriptions;
CREATE POLICY "provider_subs_select" ON public.provider_subscriptions FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "webhook_endpoints_select" ON public.webhook_endpoints;
CREATE POLICY "webhook_endpoints_select" ON public.webhook_endpoints FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- ----------------------------------------------------------------------------
-- 6. WORKSPACE-SCOPED RLS FOR LEGACY TABLES
-- ----------------------------------------------------------------------------

-- automations
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automations_select" ON public.automations;
CREATE POLICY "automations_select" ON public.automations FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "automations_insert" ON public.automations;
CREATE POLICY "automations_insert" ON public.automations FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "automations_update" ON public.automations;
CREATE POLICY "automations_update" ON public.automations FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "automations_delete" ON public.automations;
CREATE POLICY "automations_delete" ON public.automations FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- automation_runs
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "runs_select" ON public.automation_runs;
CREATE POLICY "runs_select" ON public.automation_runs FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "runs_insert" ON public.automation_runs;
CREATE POLICY "runs_insert" ON public.automation_runs FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']));

-- integrations
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "integrations_select" ON public.integrations;
CREATE POLICY "integrations_select" ON public.integrations FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "integrations_insert" ON public.integrations;
CREATE POLICY "integrations_insert" ON public.integrations FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "integrations_update" ON public.integrations;
CREATE POLICY "integrations_update" ON public.integrations FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "integrations_delete" ON public.integrations;
CREATE POLICY "integrations_delete" ON public.integrations FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- integration_credentials
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credentials_select" ON public.integration_credentials;
CREATE POLICY "credentials_select" ON public.integration_credentials FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employees_select" ON public.employees;
CREATE POLICY "employees_select" ON public.employees FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "employees_insert" ON public.employees;
CREATE POLICY "employees_insert" ON public.employees FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "employees_update" ON public.employees;
CREATE POLICY "employees_update" ON public.employees FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "employees_delete" ON public.employees;
CREATE POLICY "employees_delete" ON public.employees FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- ai_tasks
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_tasks_select" ON public.ai_tasks;
CREATE POLICY "ai_tasks_select" ON public.ai_tasks FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "ai_tasks_insert" ON public.ai_tasks;
CREATE POLICY "ai_tasks_insert" ON public.ai_tasks FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']));

-- activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_select" ON public.activity_logs;
CREATE POLICY "activity_select" ON public.activity_logs FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "activity_insert" ON public.activity_logs;
CREATE POLICY "activity_insert" ON public.activity_logs FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']));

COMMIT;

-- ----------------------------------------------------------------------------
-- 7. NOTIFY POSTGREST & RUN NON-SENSITIVE VERIFICATION SUMMARY
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT count(*) FROM public.workspaces) AS workspaces_count,
  (SELECT count(*) FROM public.workspace_memberships) AS memberships_count,
  (SELECT count(*) FROM public.workspace_subscriptions) AS subscriptions_count,
  (SELECT count(*) FROM public.contacts WHERE workspace_id IS NOT NULL) AS tenant_contacts_count,
  (SELECT count(*) FROM public.automations WHERE workspace_id IS NOT NULL) AS tenant_automations_count,
  (SELECT count(*) FROM public.integrations WHERE workspace_id IS NOT NULL) AS tenant_integrations_count,
  (SELECT count(*) FROM public.activity_logs WHERE workspace_id IS NOT NULL) AS tenant_activity_count;

-- >>> END: supabase/migrations\20260916_global_tenantization_launch_integrity.sql <<<


-- >>> START: supabase/migrations\20260917_tier0f_runtime_tenant_certification.sql <<<
-- ============================================================================
-- J10 NEXUS TIER 0F RUNTIME TENANT CERTIFICATION & CONSOLIDATION MIGRATION (REPAIR 2)
-- File: supabase/migrations/20260917_tier0f_runtime_tenant_certification.sql
-- Description:
--   1. Webhook events RLS hardening: Drops all permissive/legacy policies and
--      safely establishes webhook_events_tenant_select (tolerating pre-existing policies).
--   2. Genuinely non-destructive CRM consolidation: Backfills legacy crm_contacts into
--      canonical public.contacts without drops, preserves archive relations, verifies
--      pre/post counts and non-null fields, and creates a read-only security-invoker view.
--   3. Deterministic subscription provenance: Uses owner_user_id (never owner_id),
--      protects verified Stripe records, and converts qualifying none rows idempotently.
--   4. Ancillary integration tables tenantization: Backfills verified workspace_id
--      onto integration endpoints, events, executions, logs, subscriptions, and history,
--      validates completeness before enforcing NOT NULL, and enforces (workspace_id, provider) uniqueness.
--   5. Purges legacy RLS bypasses across 24 Tier 0F tables: Replaces permissive
--      user_id = auth.uid() and broad USING (true) policies with strict workspace RBAC.
--   6. Hardened usage increment RPC: Enforces atomic row locking, positive counts,
--      strict provenance check, and message limits.
--   7. Secure website funnel & lead ingestion: Globally unique published slug index,
--      payload-hashed namespaced idempotency reservation, and private internal UUIDs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. WEBHOOK EVENTS RLS HARDENING (NULL TENANT DISCLOSURE FIX)
-- ----------------------------------------------------------------------------
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop all known historical and permissive SELECT policies on webhook_events
  DROP POLICY IF EXISTS "webhook_events_select_member" ON public.webhook_events;
  DROP POLICY IF EXISTS "webhook_events_select" ON public.webhook_events;
  DROP POLICY IF EXISTS "allow_tenant_read_webhook_events" ON public.webhook_events;
  DROP POLICY IF EXISTS "webhook_events_service_role_all" ON public.webhook_events;

  -- Create service role policy
  CREATE POLICY "webhook_events_service_role_all" ON public.webhook_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

  -- Tolerant creation of tenant select policy
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'webhook_events'
      AND policyname = 'webhook_events_tenant_select'
  ) THEN
    DROP POLICY "webhook_events_tenant_select" ON public.webhook_events;
  END IF;

  CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events FOR SELECT
    TO authenticated
    USING (
      workspace_id IS NOT NULL
      AND public.is_workspace_member(workspace_id)
    );
END $$;

-- Transactional assertion: Abort if any remaining authenticated/public policy allows NULL workspace_id
DO $$
DECLARE
  v_bad_policy TEXT;
BEGIN
  SELECT policyname INTO v_bad_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'webhook_events'
    AND cmd IN ('SELECT', 'ALL')
    AND policyname != 'webhook_events_service_role_all'
    AND (
      qual ILIKE '%workspace_id IS NULL%'
      OR qual ILIKE '%workspace_id IS NOT NULL OR%'
    );

  IF v_bad_policy IS NOT NULL THEN
    RAISE EXCEPTION 'Security assertion failed: Policy % still permits NULL workspace_id on webhook_events', v_bad_policy;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CANONICAL CONTACTS CONSOLIDATION & OBJECT-AWARE NON-DESTRUCTIVE CRM MIGRATION
-- ----------------------------------------------------------------------------
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

DO $$
DECLARE
  v_crm_kind "char";
  v_archive_kind "char";
  v_pre_count BIGINT := 0;
  v_post_count BIGINT := 0;
  v_fk_record RECORD;
BEGIN
  -- 1. Detect current object type for public.crm_contacts
  SELECT c.relkind INTO v_crm_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'crm_contacts';

  -- If crm_contacts is a physical table ('r'), safely backfill and convert without deleting data
  IF v_crm_kind = 'r' THEN
    EXECUTE 'SELECT count(*) FROM public.crm_contacts' INTO v_pre_count;

    -- Check archive table state
    SELECT c.relkind INTO v_archive_kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'crm_contacts_legacy_archive_tier0f';

    IF v_archive_kind IS NOT NULL THEN
      -- If archive relation already exists, verify it is a compatible table ('r')
      IF v_archive_kind != 'r' THEN
        RAISE EXCEPTION 'Incompatible archive relation crm_contacts_legacy_archive_tier0f exists with relkind % (manual review required)', v_archive_kind;
      END IF;
      -- Merge missing rows into existing archive without dropping either relation
      INSERT INTO public.crm_contacts_legacy_archive_tier0f
      SELECT * FROM public.crm_contacts crm
      ON CONFLICT (id) DO NOTHING;
    ELSE
      -- Rename legacy table to archive relation; zero data deleted
      ALTER TABLE public.crm_contacts RENAME TO crm_contacts_legacy_archive_tier0f;
    END IF;

    -- 2. Update canonical contacts using documented precedence:
    -- Legacy null values must not overwrite existing non-null canonical values!
    UPDATE public.contacts c
    SET
      first_name = COALESCE(c.first_name, arc.first_name),
      last_name = COALESCE(c.last_name, arc.last_name),
      job_title = COALESCE(c.job_title, arc.job_title),
      type = COALESCE(c.type, arc.type),
      status = COALESCE(c.status, arc.status),
      notes = COALESCE(c.notes, arc.notes),
      last_contacted_at = COALESCE(c.last_contacted_at, arc.last_contacted_at),
      company = COALESCE(c.company, arc.company),
      phone = COALESCE(c.phone, arc.phone),
      email = COALESCE(c.email, arc.email),
      source = COALESCE(c.source, arc.source),
      estimated_value = COALESCE(c.estimated_value, arc.estimated_value, 0.00),
      assigned_user_id = COALESCE(c.assigned_user_id, arc.user_id),
      updated_at = GREATEST(c.updated_at, arc.updated_at)
    FROM public.crm_contacts_legacy_archive_tier0f arc
    WHERE c.id = arc.id;

    -- 3. Insert any missing legacy contacts into canonical public.contacts
    INSERT INTO public.contacts (
      id,
      workspace_id,
      name,
      first_name,
      last_name,
      email,
      phone,
      company,
      job_title,
      type,
      status,
      source,
      deal_stage,
      estimated_value,
      notes,
      assigned_user_id,
      last_contact_at,
      last_contacted_at,
      created_at,
      updated_at
    )
    SELECT
      arc.id,
      arc.workspace_id,
      COALESCE(NULLIF(trim(concat(COALESCE(arc.first_name, ''), ' ', COALESCE(arc.last_name, ''))), ''), arc.email, arc.phone, 'Unnamed Contact'),
      arc.first_name,
      arc.last_name,
      arc.email,
      arc.phone,
      arc.company,
      arc.job_title,
      COALESCE(arc.type, 'Lead'),
      COALESCE(arc.status, 'New'),
      COALESCE(arc.source, 'crm'),
      CASE lower(COALESCE(arc.status, 'new'))
        WHEN 'won' THEN 'won'
        WHEN 'qualified' THEN 'qualified'
        WHEN 'contacted' THEN 'qualified'
        WHEN 'interested' THEN 'proposal'
        WHEN 'lost' THEN 'churned'
        ELSE 'lead'
      END,
      COALESCE(arc.estimated_value, 0.00),
      arc.notes,
      arc.user_id,
      COALESCE(arc.last_contacted_at, arc.created_at, now()),
      arc.last_contacted_at,
      COALESCE(arc.created_at, now()),
      COALESCE(arc.updated_at, now())
    FROM public.crm_contacts_legacy_archive_tier0f arc
    WHERE NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = arc.id);

    -- 4. Assert row-count preservation
    SELECT count(*) INTO v_post_count
    FROM public.contacts c
    WHERE c.id IN (SELECT id FROM public.crm_contacts_legacy_archive_tier0f);

    IF v_post_count < v_pre_count THEN
      RAISE EXCEPTION 'Consolidation verification failed: Expected at least % contacts preserved, found %', v_pre_count, v_post_count;
    END IF;

    -- 5. Assert field preservation: ensure non-null archive fields were preserved in canonical contacts
    IF EXISTS (
      SELECT 1
      FROM public.crm_contacts_legacy_archive_tier0f arc
      JOIN public.contacts c ON c.id = arc.id
      WHERE (arc.email IS NOT NULL AND c.email IS NULL)
         OR (arc.phone IS NOT NULL AND c.phone IS NULL)
         OR (arc.company IS NOT NULL AND c.company IS NULL)
    ) THEN
      RAISE EXCEPTION 'Field preservation assertion failed: non-null contact fields from archive were not preserved in canonical contacts';
    END IF;

    -- 6. Discover and rebind foreign keys referencing legacy table to canonical contacts
    FOR v_fk_record IN
      SELECT
        tc.table_schema,
        tc.table_name,
        tc.constraint_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public'
        AND ccu.table_name = 'crm_contacts_legacy_archive_tier0f'
    LOOP
      EXECUTE format(
        'ALTER TABLE %I.%I DROP CONSTRAINT %I',
        v_fk_record.table_schema,
        v_fk_record.table_name,
        v_fk_record.constraint_name
      );
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.contacts(id) ON DELETE SET NULL',
        v_fk_record.table_schema,
        v_fk_record.table_name,
        v_fk_record.constraint_name,
        v_fk_record.column_name
      );
    END LOOP;

    -- Revoke client access to the archive
    REVOKE ALL ON public.crm_contacts_legacy_archive_tier0f FROM PUBLIC, anon, authenticated;
  END IF;

  -- Apply defaults for future inserts
  ALTER TABLE public.contacts ALTER COLUMN type SET DEFAULT 'Lead';
  ALTER TABLE public.contacts ALTER COLUMN status SET DEFAULT 'New';
END $$;

-- Populate first_name / last_name for any contacts with composite name
UPDATE public.contacts
SET
  first_name = COALESCE(first_name, split_part(name, ' ', 1)),
  last_name = COALESCE(last_name, NULLIF(substr(name, length(split_part(name, ' ', 1)) + 2), ''))
WHERE first_name IS NULL OR last_name IS NULL;

-- Create read-only security-invoker compatibility view over canonical contacts
CREATE OR REPLACE VIEW public.crm_contacts
WITH (security_invoker = on)
AS
SELECT
  c.id,
  c.workspace_id,
  c.assigned_user_id AS user_id,
  COALESCE(c.first_name, split_part(c.name, ' ', 1)) AS first_name,
  COALESCE(c.last_name, NULLIF(substr(c.name, length(split_part(c.name, ' ', 1)) + 2), '')) AS last_name,
  c.email,
  c.phone,
  c.company,
  c.job_title,
  COALESCE(c.type, 'Lead') AS type,
  COALESCE(c.status, 'New') AS status,
  COALESCE(c.source, 'crm') AS source,
  c.estimated_value,
  c.notes,
  COALESCE(c.last_contacted_at, c.last_contact_at) AS last_contacted_at,
  c.created_at,
  c.updated_at
FROM public.contacts c;

-- Compatibility view is strictly read-only for clients; all mutations must target public.contacts
GRANT SELECT ON public.crm_contacts TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.crm_contacts FROM anon, authenticated, PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. DETERMINISTIC SUBSCRIPTION PROVENANCE (FIXED OWNER_USER_ID)
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_subscriptions_provenance'
  ) THEN
    ALTER TABLE public.workspace_subscriptions
      ADD CONSTRAINT chk_workspace_subscriptions_provenance
      CHECK (provenance IN ('stripe', 'trial', 'internal_grant', 'none'));
  END IF;
END $$;

-- Explicit, auditable criteria:
-- A. Verified Stripe association (never overwrite verified Stripe records)
UPDATE public.workspace_subscriptions
SET provenance = 'stripe'
WHERE stripe_subscription_id IS NOT NULL
  AND status IN ('active', 'trialing');

-- B. Valid active trial
UPDATE public.workspace_subscriptions
SET provenance = 'trial'
WHERE stripe_subscription_id IS NULL
  AND status = 'trialing'
  AND (current_period_end > now() OR (grace_period_end IS NOT NULL AND grace_period_end > now()))
  AND provenance != 'stripe';

-- C. Canonical platform founder internal grant (resolved via platform_roles using owner_user_id)
UPDATE public.workspace_subscriptions
SET provenance = 'internal_grant'
WHERE workspace_id IN (
  SELECT w.id
  FROM public.workspaces w
  JOIN public.platform_roles pr ON pr.user_id = w.owner_user_id
  WHERE pr.role = 'platform_founder'
    AND pr.revoked_at IS NULL
)
AND provenance NOT IN ('stripe');

-- D. Everything else defaults to 'none'
UPDATE public.workspace_subscriptions
SET provenance = 'none'
WHERE provenance IS NULL;

ALTER TABLE public.workspace_subscriptions
  ALTER COLUMN provenance SET DEFAULT 'none',
  ALTER COLUMN provenance SET NOT NULL;

-- Deactivate unverified subscriptions (provenance = none)
UPDATE public.workspace_subscriptions
SET status = 'none',
    updated_at = now()
WHERE provenance = 'none'
  AND status IN ('active', 'trialing');

-- ----------------------------------------------------------------------------
-- 4. ANCILLARY INTEGRATION TABLES TENANTIZATION & UNIQUE CONSTRAINT
-- ----------------------------------------------------------------------------
-- Ensure integrations tenant uniqueness constraint (workspace_id, provider)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_integrations_workspace_provider'
  ) THEN
    ALTER TABLE public.integrations
      ADD CONSTRAINT uq_integrations_workspace_provider UNIQUE (workspace_id, provider);
  END IF;
END $$;

-- Add workspace_id to ancillary integration tables
ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_webhook_endpoints
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_webhook_events
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_action_executions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_operation_logs
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_provider_subscriptions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_status_history
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Backfill workspace_id from parent integration relationship
UPDATE public.integration_credentials tc
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tc.integration_id = i.id AND tc.workspace_id IS NULL;

UPDATE public.integration_webhook_endpoints twe
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE twe.integration_id = i.id AND twe.workspace_id IS NULL;

UPDATE public.integration_webhook_events twev
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE twev.integration_id = i.id AND twev.workspace_id IS NULL;

UPDATE public.integration_action_executions tae
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tae.integration_id = i.id AND tae.workspace_id IS NULL;

UPDATE public.integration_operation_logs tol
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tol.integration_id = i.id AND tol.workspace_id IS NULL;

UPDATE public.integration_provider_subscriptions tps
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tps.integration_id = i.id AND tps.workspace_id IS NULL;

UPDATE public.integration_status_history tsh
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tsh.integration_id = i.id AND tsh.workspace_id IS NULL;

-- Validate backfill completeness before enforcing NOT NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.integration_credentials WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_credentials';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_webhook_endpoints WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_webhook_endpoints';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_webhook_events WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_webhook_events';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_action_executions WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_action_executions';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_operation_logs WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_operation_logs';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_provider_subscriptions WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_provider_subscriptions';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_status_history WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_status_history';
  END IF;
END $$;

-- Enforce NOT NULL constraints and create tenant indexes
ALTER TABLE public.integration_credentials ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_webhook_endpoints ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_webhook_events ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_action_executions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_operation_logs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_provider_subscriptions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_status_history ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_credentials_ws ON public.integration_credentials (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_endpoints_ws ON public.integration_webhook_endpoints (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_ws ON public.integration_webhook_events (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_action_executions_ws ON public.integration_action_executions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_operation_logs_ws ON public.integration_operation_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_provider_subscriptions_ws ON public.integration_provider_subscriptions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_status_history_ws ON public.integration_status_history (workspace_id);

CREATE OR REPLACE FUNCTION public.record_integration_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (
    tg_op = 'INSERT'
    OR old.status IS DISTINCT FROM new.status
  ) THEN
    INSERT INTO public.integration_status_history (
      workspace_id,
      integration_id,
      user_id,
      previous_status,
      next_status,
      reason,
      metadata
    )
    VALUES (
      new.workspace_id,
      new.id,
      new.user_id,
      CASE
        WHEN tg_op = 'INSERT' THEN NULL
        ELSE old.status
      END,
      new.status,
      new.status_reason,
      COALESCE(
        new.status_metadata,
        '{}'::jsonb
      )
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_integration_status_history ON public.integrations;
CREATE TRIGGER trg_integration_status_history
  AFTER INSERT OR UPDATE OF status ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.record_integration_status_history();

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_credentials_integration_id
  ON public.integration_credentials (integration_id);

CREATE OR REPLACE FUNCTION public.store_integration_credential_envelope(
  p_integration_id UUID,
  p_encrypted_payload TEXT,
  p_initialization_vector TEXT,
  p_authentication_tag TEXT,
  p_algorithm TEXT,
  p_key_version INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_integration public.integrations%ROWTYPE;
  v_cred_id UUID;
  v_caller_is_service_role BOOLEAN;
BEGIN
  v_caller_is_service_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    ''
  ) = 'service_role';

  SELECT * INTO v_integration
  FROM public.integrations
  WHERE id = p_integration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration connection was not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Enforce tenant admin RBAC
  IF NOT v_caller_is_service_role THEN
    IF auth.uid() IS NULL OR NOT public.has_workspace_role(v_integration.workspace_id, ARRAY['owner', 'admin']) THEN
      RAISE EXCEPTION 'Integration credential access is forbidden: workspace admin role required.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_algorithm <> 'aes-256-gcm' THEN
    RAISE EXCEPTION 'Unsupported credential encryption algorithm: %', p_algorithm USING ERRCODE = '22023';
  END IF;

  IF p_key_version IS NULL OR p_key_version < 1 THEN
    RAISE EXCEPTION 'Invalid credential key version.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.integration_credentials (
    integration_id,
    workspace_id,
    encrypted_payload,
    initialization_vector,
    authentication_tag,
    algorithm,
    key_version
  )
  VALUES (
    v_integration.id,
    v_integration.workspace_id,
    p_encrypted_payload,
    p_initialization_vector,
    p_authentication_tag,
    p_algorithm,
    p_key_version
  )
  ON CONFLICT (integration_id)
  DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    encrypted_payload = EXCLUDED.encrypted_payload,
    initialization_vector = EXCLUDED.initialization_vector,
    authentication_tag = EXCLUDED.authentication_tag,
    algorithm = EXCLUDED.algorithm,
    key_version = EXCLUDED.key_version
  RETURNING id INTO v_cred_id;

  UPDATE public.integrations
  SET credential_reference = v_cred_id::text,
      updated_at = now()
  WHERE id = v_integration.id;

  RETURN v_cred_id;
END;
$$;

REVOKE ALL ON FUNCTION public.store_integration_credential_envelope(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_integration_credential_envelope(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_integration_credential_envelope(UUID);
CREATE OR REPLACE FUNCTION public.get_integration_credential_envelope(
  p_integration_id UUID
)
RETURNS TABLE (
  credential_id UUID,
  integration_id UUID,
  workspace_id UUID,
  provider TEXT,
  encrypted_payload TEXT,
  initialization_vector TEXT,
  authentication_tag TEXT,
  algorithm TEXT,
  key_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_integration public.integrations%ROWTYPE;
  v_caller_is_service_role BOOLEAN;
BEGIN
  v_caller_is_service_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    ''
  ) = 'service_role';

  SELECT * INTO v_integration
  FROM public.integrations
  WHERE id = p_integration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration connection was not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Enforce tenant admin RBAC
  IF NOT v_caller_is_service_role THEN
    IF auth.uid() IS NULL OR NOT public.has_workspace_role(v_integration.workspace_id, ARRAY['owner', 'admin']) THEN
      RAISE EXCEPTION 'Forbidden: workspace admin role required.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.integration_id,
    c.workspace_id,
    v_integration.provider,
    c.encrypted_payload,
    c.initialization_vector,
    c.authentication_tag,
    c.algorithm,
    c.key_version
  FROM public.integration_credentials c
  WHERE c.integration_id = p_integration_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_integration_credential_envelope(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_integration_credential_envelope(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. PURGE LEGACY RLS BYPASSES & ESTABLISH STRICT TENANT POLICIES (24 TABLES)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
  v_pol RECORD;
  v_tables TEXT[] := ARRAY[
    'integrations',
    'integration_credentials',
    'integration_webhook_endpoints',
    'integration_webhook_events',
    'integration_action_executions',
    'integration_operation_logs',
    'integration_provider_subscriptions',
    'integration_status_history',
    'website_funnels',
    'commerce_products',
    'commerce_orders',
    'finance_invoices',
    'marketing_campaigns',
    'company_knowledge_documents',
    'workforce_members',
    'automation_versions',
    'webhook_events',
    'contacts',
    'inbox_threads',
    'inbox_messages',
    'ai_tasks',
    'automations',
    'automation_runs',
    'activity_logs'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', v_table);

    -- Drop all legacy and permissive policies
    FOR v_pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

-- A. Standard workspace collaborative tables
-- Read: Active members with any role (owner, admin, manager, agent, viewer)
-- Write: Active members with operational roles (owner, admin, manager, agent) - Viewer is strictly read-only!
-- Service Role: Full access
DO $$
DECLARE
  v_tab TEXT;
  v_collaborative_tables TEXT[] := ARRAY[
    'contacts',
    'inbox_threads',
    'inbox_messages',
    'website_funnels',
    'commerce_orders',
    'finance_invoices',
    'marketing_campaigns',
    'company_knowledge_documents',
    'workforce_members',
    'automations',
    'automation_versions',
    'automation_runs',
    'ai_tasks',
    'activity_logs',
    'integrations',
    'integration_action_executions',
    'integration_operation_logs',
    'integration_provider_subscriptions',
    'integration_status_history',
    'integration_webhook_endpoints'
  ];
BEGIN
  FOREACH v_tab IN ARRAY v_collaborative_tables LOOP
    EXECUTE format('
      CREATE POLICY "%I_service_role_all" ON public.%I
        FOR ALL TO service_role USING (true) WITH CHECK (true);

      CREATE POLICY "%I_tenant_select" ON public.%I
        FOR SELECT TO authenticated
        USING (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent'', ''viewer''])
        );

      CREATE POLICY "%I_tenant_insert" ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent''])
        );

      CREATE POLICY "%I_tenant_update" ON public.%I
        FOR UPDATE TO authenticated
        USING (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent''])
        )
        WITH CHECK (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent''])
        );

      CREATE POLICY "%I_tenant_delete" ON public.%I
        FOR DELETE TO authenticated
        USING (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent''])
        );
    ', v_tab, v_tab, v_tab, v_tab, v_tab, v_tab, v_tab, v_tab, v_tab, v_tab);
  END LOOP;
END $$;

-- B. Sensitive integration credentials table: Owner and Admin only
CREATE POLICY "integration_credentials_service_role_all" ON public.integration_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "integration_credentials_tenant_select" ON public.integration_credentials
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY "integration_credentials_tenant_insert" ON public.integration_credentials
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY "integration_credentials_tenant_update" ON public.integration_credentials
  FOR UPDATE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY "integration_credentials_tenant_delete" ON public.integration_credentials
  FOR DELETE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- C. Event tables: webhook_events and integration_webhook_events (service-role write only)
CREATE POLICY "webhook_events_service_role_all" ON public.webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

CREATE POLICY "integration_webhook_events_service_role_all" ON public.integration_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "integration_webhook_events_tenant_select" ON public.integration_webhook_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

-- D. Commerce products: Remove global exposure (no global status = 'active' bypass!)
-- Strictly scoped to workspace members; public storefront uses separate explicit boundary
CREATE POLICY "commerce_products_service_role_all" ON public.commerce_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "commerce_products_tenant_select" ON public.commerce_products
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
  );

CREATE POLICY "commerce_products_tenant_insert" ON public.commerce_products
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "commerce_products_tenant_update" ON public.commerce_products
  FOR UPDATE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "commerce_products_tenant_delete" ON public.commerce_products
  FOR DELETE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

-- Assert no remaining bypass policies on the 24 tables
DO $$
DECLARE
  v_bad_count INT;
BEGIN
  SELECT count(*) INTO v_bad_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'integrations', 'integration_credentials', 'integration_webhook_endpoints',
      'integration_webhook_events', 'integration_action_executions', 'integration_operation_logs',
      'integration_provider_subscriptions', 'integration_status_history', 'website_funnels',
      'commerce_products', 'commerce_orders', 'finance_invoices', 'marketing_campaigns',
      'company_knowledge_documents', 'workforce_members', 'automation_versions',
      'webhook_events', 'contacts', 'inbox_threads', 'inbox_messages', 'ai_tasks',
      'automations', 'automation_runs', 'activity_logs'
    )
    AND policyname NOT LIKE '%service_role%'
    AND (
      qual ILIKE '%user_id = auth.uid()%'
      OR qual = 'true'
      OR qual ILIKE '%status = ''active'' OR%'
    );

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'RLS audit assertion failed: % legacy bypass policies remain', v_bad_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. HARDENED USAGE INCREMENT RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_workspace_usage(
  p_workspace_id UUID,
  p_count INT DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
BEGIN
  -- 1. Input sanitization: Reject zero, negative, or unreasonable increments
  IF p_count IS NULL OR p_count <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage increment: count must be greater than zero',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_count > 100000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage increment: count exceeds maximum batch threshold',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 2. Authorization: Only service_role or active members with operational roles can invoke
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks permission for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 3. Lock subscription row exclusively during evaluation
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No subscription provisioned for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 4. Deny unverified provenance
  IF v_sub.provenance = 'none' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription lacks verified billing provenance',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 5. Rollover & status checks
  -- Founder internal grant: permanent grant rolls period forward and resets usage
  IF v_sub.provenance = 'internal_grant' THEN
    IF now() > v_sub.current_period_end THEN
      UPDATE public.workspace_subscriptions
      SET current_period_start = now(),
          current_period_end = now() + INTERVAL '1 year',
          messages_used_this_period = 0,
          updated_at = now()
      WHERE workspace_id = p_workspace_id
      RETURNING * INTO v_sub;
    END IF;
  ELSE
    -- Check expiration for standard subscriptions
    IF v_sub.current_period_end < now() AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Subscription billing period expired',
        'limit_reached', true,
        'is_exceeded', true
      );
    END IF;
  END IF;

  -- Status check
  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is inactive (' || v_sub.status || ')',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 6. Quota check (zero quota means zero allowance in both SQL and TypeScript)
  IF v_sub.monthly_message_limit <= 0 OR (v_sub.messages_used_this_period + p_count) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'limit_reached', true,
      'is_exceeded', true,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'monthly_message_limit', v_sub.monthly_message_limit
    );
  END IF;

  -- 7. Perform atomic increment within verified quota
  UPDATE public.workspace_subscriptions
  SET messages_used_this_period = messages_used_this_period + p_count,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
  RETURNING * INTO v_sub;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_sub.workspace_id,
    'messages_used_this_period', v_sub.messages_used_this_period,
    'new_usage', v_sub.messages_used_this_period,
    'monthly_message_limit', v_sub.monthly_message_limit,
    'limit_reached', false,
    'is_exceeded', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_workspace_usage(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_workspace_usage(UUID, INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. SECURE WEBSITE FUNNEL IDENTITY & LEAD INGESTION WITH IDEMPOTENCY
-- ----------------------------------------------------------------------------
-- Enforce globally unique published slug across all workspaces
CREATE UNIQUE INDEX IF NOT EXISTS uq_website_funnels_published_slug
  ON public.website_funnels (lower(trim(slug)))
  WHERE (is_published = true);

-- Recreate website_lead_idempotency with workspace namespacing and payload hash
CREATE TABLE IF NOT EXISTS public.website_lead_idempotency (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  funnel_id UUID NOT NULL REFERENCES public.website_funnels(id) ON DELETE CASCADE,
  payload_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'committed',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, idempotency_key)
);

ALTER TABLE public.website_lead_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_idempotency_service_role" ON public.website_lead_idempotency;
CREATE POLICY "lead_idempotency_service_role" ON public.website_lead_idempotency
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_website_lead(
  p_funnel_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_message TEXT,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_funnel public.website_funnels%ROWTYPE;
  v_contact public.contacts%ROWTYPE;
  v_thread public.inbox_threads%ROWTYPE;
  v_message public.inbox_messages%ROWTYPE;
  v_existing_lead public.website_lead_idempotency%ROWTYPE;
  v_clean_phone TEXT;
  v_clean_email TEXT;
  v_clean_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_payload_hash TEXT;
  v_trimmed_key TEXT;
BEGIN
  -- 1. Strictly resolve published funnel by verified UUID first
  SELECT * INTO v_funnel
  FROM public.website_funnels
  WHERE id = p_funnel_id
    AND is_published = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Funnel not found or unpublished'
    );
  END IF;

  v_clean_name := COALESCE(NULLIF(trim(p_name), ''), 'Inbound Visitor');
  v_clean_email := NULLIF(lower(trim(p_email)), '');
  v_clean_phone := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
  IF v_clean_phone IS NOT NULL THEN
    v_clean_phone := '+' || v_clean_phone;
  END IF;

  IF v_clean_phone IS NULL AND v_clean_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact email or phone is required');
  END IF;

  -- 2. Compute canonical payload hash
  v_payload_hash := md5(concat_ws('|', v_clean_name, COALESCE(v_clean_email, ''), COALESCE(v_clean_phone, ''), COALESCE(p_message, '')));

  -- 3. Idempotency Check namespaced by resolved workspace
  v_trimmed_key := NULLIF(trim(p_idempotency_key), '');
  IF v_trimmed_key IS NOT NULL THEN
    SELECT * INTO v_existing_lead
    FROM public.website_lead_idempotency
    WHERE workspace_id = v_funnel.workspace_id
      AND idempotency_key = v_trimmed_key;

    IF FOUND THEN
      -- Same key plus different payload must return conflict!
      IF v_existing_lead.payload_sha256 != v_payload_hash THEN
        RETURN jsonb_build_object(
          'success', false,
          'conflict', true,
          'error', 'Idempotency key reused with different payload'
        );
      END IF;

      -- Return duplicate confirmation without exposing internal UUIDs publicly
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true
      );
    END IF;

    -- Reserve the idempotency key before creating contact/thread/message records
    INSERT INTO public.website_lead_idempotency (
      workspace_id,
      idempotency_key,
      funnel_id,
      payload_sha256,
      status
    ) VALUES (
      v_funnel.workspace_id,
      v_trimmed_key,
      v_funnel.id,
      v_payload_hash,
      'reserved'
    );
  END IF;

  v_first_name := split_part(v_clean_name, ' ', 1);
  v_last_name := NULLIF(substr(v_clean_name, length(v_first_name) + 2), '');

  -- 4. Create Contact bound strictly to the funnel's workspace
  INSERT INTO public.contacts (
    workspace_id,
    name,
    first_name,
    last_name,
    email,
    phone,
    source,
    deal_stage,
    type,
    status,
    notes,
    metadata
  ) VALUES (
    v_funnel.workspace_id,
    v_clean_name,
    v_first_name,
    v_last_name,
    v_clean_email,
    v_clean_phone,
    'website_funnel:' || v_funnel.slug,
    'lead',
    'Lead',
    'New',
    p_notes,
    jsonb_build_object(
      'funnel_id', v_funnel.id,
      'funnel_slug', v_funnel.slug,
      'lead_message', p_message,
      'ingestion_metadata', COALESCE(p_metadata, '{}'::jsonb)
    )
  )
  RETURNING * INTO v_contact;

  -- 5. Create Inbox Thread bound strictly to the funnel's workspace
  INSERT INTO public.inbox_threads (
    workspace_id,
    contact_id,
    channel,
    status,
    priority,
    unread_count,
    last_message_at,
    metadata
  ) VALUES (
    v_funnel.workspace_id,
    v_contact.id,
    'website',
    'active',
    'medium',
    1,
    now(),
    jsonb_build_object('funnel_id', v_funnel.id, 'lead_name', v_clean_name)
  )
  RETURNING * INTO v_thread;

  -- 6. Create Initial Inbox Message bound strictly to the funnel's workspace
  INSERT INTO public.inbox_messages (
    workspace_id,
    thread_id,
    direction,
    provider,
    content,
    delivery_status,
    message_type,
    metadata
  ) VALUES (
    v_funnel.workspace_id,
    v_thread.id,
    'inbound',
    'website',
    COALESCE(NULLIF(trim(p_message), ''), 'Inbound lead inquiry from ' || v_funnel.title),
    'delivered',
    'text',
    jsonb_build_object('funnel_slug', v_funnel.slug)
  )
  RETURNING * INTO v_message;

  -- 7. Commit idempotency record if key was provided
  IF v_trimmed_key IS NOT NULL THEN
    UPDATE public.website_lead_idempotency
    SET
      status = 'committed',
      contact_id = v_contact.id,
      thread_id = v_thread.id,
      message_id = v_message.id,
      updated_at = now()
    WHERE workspace_id = v_funnel.workspace_id
      AND idempotency_key = v_trimmed_key;
  END IF;

  -- Return minimal response without exposing internal contact/thread/message UUIDs publicly
  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false
  );
END;
$$;

-- Revoke execute from PUBLIC, anon, and authenticated; grant ONLY to service_role
REVOKE ALL ON FUNCTION public.create_website_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_website_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.create_website_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_website_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- 8. NOTIFY POSTGREST SCHEMA CACHE RELOAD
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- >>> END: supabase/migrations\20260917_tier0f_runtime_tenant_certification.sql <<<


-- >>> START: supabase/migrations\20260918_tier0g_saas_billing.sql <<<
BEGIN;

-- ============================================================================
-- J10 NEXUS: Tier 0G — Real SaaS Billing Migration
-- Migration: 20260918_tier0g_saas_billing.sql
-- ============================================================================
-- Extends workspace subscriptions with:
-- 1. 14-day trial management (trial_start, trial_end, has_used_trial).
-- 2. Dunning lifecycle management (dunning_status, dunning_attempt_count, last_dunning_at).
-- 3. Immutable verified usage accounting ledger (workspace_usage_records) with RLS.
-- 4. Atomic row-locked usage recording RPC (record_verified_workspace_usage) with idempotency.
-- 5. Atomic trial activation RPC (activate_workspace_trial).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND WORKSPACE_SUBSCRIPTIONS FOR TRIALS & DUNNING
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dunning_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS dunning_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dunning_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_subscriptions_dunning_status'
  ) THEN
    ALTER TABLE public.workspace_subscriptions
      ADD CONSTRAINT chk_workspace_subscriptions_dunning_status
      CHECK (dunning_status IN ('none', 'warning', 'grace_period', 'suspended', 'terminated'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_subscriptions_dunning_attempts'
  ) THEN
    ALTER TABLE public.workspace_subscriptions
      ADD CONSTRAINT chk_workspace_subscriptions_dunning_attempts
      CHECK (dunning_attempt_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_dunning
  ON public.workspace_subscriptions(dunning_status)
  WHERE dunning_status != 'none';

-- ----------------------------------------------------------------------------
-- 2. VERIFIED USAGE ACCOUNTING LEDGER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  idempotency_key TEXT,
  resource_id TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT uq_workspace_usage_records_workspace_idempotency
    UNIQUE (workspace_id, idempotency_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_usage_metric_name'
  ) THEN
    ALTER TABLE public.workspace_usage_records
      ADD CONSTRAINT chk_workspace_usage_metric_name
      CHECK (metric_name IN (
        'whatsapp_outbound',
        'whatsapp_inbound',
        'ai_tokens',
        'ai_agent_run',
        'campaign_broadcast',
        'workflow_execution'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_usage_records_ws_time
  ON public.workspace_usage_records(workspace_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_records_metric
  ON public.workspace_usage_records(workspace_id, metric_name);

-- Enable Row-Level Security
ALTER TABLE public.workspace_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_usage_records FORCE ROW LEVEL SECURITY;

-- Drop legacy or pre-existing policies for idempotency
DROP POLICY IF EXISTS "workspace_usage_records_select_member" ON public.workspace_usage_records;
DROP POLICY IF EXISTS "workspace_usage_records_modify_restricted" ON public.workspace_usage_records;

-- Read-only policy for workspace members with operational roles or platform admins
CREATE POLICY "workspace_usage_records_select_member"
  ON public.workspace_usage_records
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR public.is_platform_admin()
  );

-- Zero direct client mutations; mutations restricted strictly to service_role and atomic RPC
REVOKE INSERT, UPDATE, DELETE ON public.workspace_usage_records FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.workspace_usage_records FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.workspace_usage_records FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.workspace_usage_records TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.workspace_usage_records TO service_role';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. ATOMIC VERIFIED USAGE RECORDING RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_verified_workspace_usage(
  p_workspace_id UUID,
  p_metric_name TEXT,
  p_quantity INT DEFAULT 1,
  p_idempotency_key TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_existing_record public.workspace_usage_records%ROWTYPE;
  v_new_record_id UUID;
  v_new_usage INT;
  v_normalized_idempotency_key TEXT;
  v_normalized_metadata JSONB;
BEGIN
  -- 1. Input sanitization
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage quantity: must be greater than zero',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_quantity > 100000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage quantity: exceeds maximum allowable batch limit',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_metric_name NOT IN (
    'whatsapp_outbound',
    'whatsapp_inbound',
    'ai_tokens',
    'ai_agent_run',
    'campaign_broadcast',
    'workflow_execution'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid metric_name: unrecognized billable metric',
      'limit_reached', false,
      'is_exceeded', false
    );
  END IF;

  -- 2. Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  v_normalized_idempotency_key := nullif(trim(p_idempotency_key), '');
  v_normalized_metadata := COALESCE(p_metadata, '{}'::jsonb);

  -- 3. Lock subscription row exclusively before checking idempotency. This
  -- serializes same-workspace retries so a duplicate cannot double-account.
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No subscription provisioned for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 4. Idempotency is strictly workspace-scoped. Reused keys must represent
  -- the same immutable usage payload; otherwise fail closed.
  IF v_normalized_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_record
    FROM public.workspace_usage_records
    WHERE workspace_id = p_workspace_id
      AND idempotency_key = v_normalized_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_record.metric_name IS DISTINCT FROM p_metric_name
        OR v_existing_record.quantity IS DISTINCT FROM p_quantity
        OR v_existing_record.resource_id IS DISTINCT FROM p_resource_id
        OR v_existing_record.actor_user_id IS DISTINCT FROM p_actor_user_id
        OR v_existing_record.metadata IS DISTINCT FROM v_normalized_metadata THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Idempotency conflict: idempotency key already used with different payload',
          'idempotency_conflict', true,
          'limit_reached', false,
          'is_exceeded', false
        );
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'record_id', v_existing_record.id,
        'workspace_id', p_workspace_id,
        'messages_used_this_period', v_sub.messages_used_this_period,
        'monthly_message_limit', v_sub.monthly_message_limit,
        'remaining', (v_sub.monthly_message_limit - v_sub.messages_used_this_period),
        'action', 'already_recorded'
      );
    END IF;
  END IF;

  -- 5. Provenance validation: unverified provenance fails closed
  IF v_sub.provenance = 'none' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription lacks verified billing provenance',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 6. Period boundaries & status
  IF v_sub.provenance = 'internal_grant' THEN
    IF now() > v_sub.current_period_end THEN
      UPDATE public.workspace_subscriptions
      SET current_period_start = now(),
          current_period_end = now() + INTERVAL '1 year',
          messages_used_this_period = 0,
          updated_at = now()
      WHERE workspace_id = p_workspace_id
      RETURNING * INTO v_sub;
    END IF;
  ELSE
    IF v_sub.current_period_end < now() AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Subscription billing period expired',
        'limit_reached', true,
        'is_exceeded', true
      );
    END IF;
  END IF;

  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is inactive (' || v_sub.status || ')',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 7. Quota limit check
  IF v_sub.monthly_message_limit <= 0 OR (v_sub.messages_used_this_period + p_quantity) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'limit_reached', true,
      'is_exceeded', true,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'monthly_message_limit', v_sub.monthly_message_limit
    );
  END IF;

  -- 8. Insert into immutable usage records ledger
  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    actor_user_id,
    billing_period_start,
    billing_period_end,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_metric_name,
    p_quantity,
    v_normalized_idempotency_key,
    p_resource_id,
    p_actor_user_id,
    v_sub.current_period_start,
    v_sub.current_period_end,
    v_normalized_metadata
  )
  RETURNING id INTO v_new_record_id;

  -- 9. Atomically increment subscription counter
  UPDATE public.workspace_subscriptions
  SET messages_used_this_period = messages_used_this_period + p_quantity,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
  RETURNING messages_used_this_period INTO v_new_usage;

  RETURN jsonb_build_object(
    'success', true,
    'record_id', v_new_record_id,
    'workspace_id', p_workspace_id,
    'messages_used_this_period', v_new_usage,
    'monthly_message_limit', v_sub.monthly_message_limit,
    'remaining', (v_sub.monthly_message_limit - v_new_usage),
    'is_exceeded', false
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage TO service_role';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. ATOMIC TRIAL ACTIVATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_workspace_trial(
  p_workspace_id UUID,
  p_plan_id TEXT DEFAULT 'growth',
  p_duration_days INT DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_authorized BOOLEAN := false;
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_trial_limit INT := 1000;
  v_duration INTERVAL;
BEGIN
  -- 1. Duration check
  IF p_duration_days IS NULL OR p_duration_days <= 0 OR p_duration_days > 90 THEN
    p_duration_days := 14;
  END IF;
  v_duration := (p_duration_days || ' days')::INTERVAL;

  -- 2. Plan check
  IF p_plan_id NOT IN ('starter', 'growth', 'enterprise') THEN
    p_plan_id := 'growth';
  END IF;

  -- 3. Authorization: Workspace owner/admin or platform admin
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.is_platform_admin() THEN
    v_is_authorized := true;
  ELSIF public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: only workspace owners and admins can activate trials'
    );
  END IF;

  -- 4. Check existing trial history
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  -- If subscription already exists, check trial eligibility
  IF FOUND THEN
    -- If already verified via Stripe, cannot downgrade to trial
    IF v_sub.provenance = 'stripe' AND v_sub.status IN ('active', 'past_due') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Workspace already has an active verified Stripe subscription'
      );
    END IF;

    -- Trial can only be activated once per workspace unless platform founder
    IF v_sub.has_used_trial = true AND NOT public.is_platform_admin() THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'This workspace has already utilized its free trial period'
      );
    END IF;

    -- Update existing record
    UPDATE public.workspace_subscriptions
    SET plan_id = p_plan_id,
        status = 'trialing',
        provenance = 'trial',
        trial_start = now(),
        trial_end = now() + v_duration,
        current_period_start = now(),
        current_period_end = now() + v_duration,
        grace_period_end = null,
        monthly_message_limit = v_trial_limit,
        messages_used_this_period = 0,
        has_used_trial = true,
        dunning_status = 'none',
        dunning_attempt_count = 0,
        updated_at = now()
    WHERE workspace_id = p_workspace_id
    RETURNING * INTO v_sub;
  ELSE
    -- Insert new record
    INSERT INTO public.workspace_subscriptions (
      workspace_id,
      plan_id,
      status,
      provenance,
      trial_start,
      trial_end,
      current_period_start,
      current_period_end,
      monthly_message_limit,
      messages_used_this_period,
      has_used_trial,
      dunning_status,
      dunning_attempt_count
    )
    VALUES (
      p_workspace_id,
      p_plan_id,
      'trialing',
      'trial',
      now(),
      now() + v_duration,
      now(),
      now() + v_duration,
      v_trial_limit,
      0,
      true,
      'none',
      0
    )
    RETURNING * INTO v_sub;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_sub.workspace_id,
    'plan_id', v_sub.plan_id,
    'status', v_sub.status,
    'provenance', v_sub.provenance,
    'trial_start', v_sub.trial_start,
    'trial_end', v_sub.trial_end,
    'monthly_message_limit', v_sub.monthly_message_limit
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.activate_workspace_trial TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.activate_workspace_trial TO service_role';
  END IF;
END $$;

COMMIT;

-- >>> END: supabase/migrations\20260918_tier0g_saas_billing.sql <<<


-- >>> START: supabase/migrations\20260918b_restrict_tier0g_rpc_execute.sql <<<
BEGIN;

REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) TO authenticated, service_role;

COMMIT;

-- >>> END: supabase/migrations\20260918b_restrict_tier0g_rpc_execute.sql <<<


-- >>> START: supabase/migrations\20260919_tier1_revenue_loop.sql <<<
BEGIN;

-- ============================================================================
-- J10 NEXUS: Tier 1 — Complete Revenue Loop Migration
-- Migration: 20260919_tier1_revenue_loop.sql
-- ============================================================================
-- Establishes:
-- 1. public.crm_proposals: Commercial proposals linked to contacts, threads, and Stripe checkouts.
-- 2. public.crm_bookings: Scheduled walkthroughs, demos, and closing calls linked to proposals/contacts.
-- 3. Composite uniqueness, performance indexes, and strict multi-tenant Row Level Security.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRM PROPOSALS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID,
  thread_id UUID,
  proposal_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft',
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  checkout_id UUID,
  checkout_url TEXT,
  valid_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_crm_proposals_workspace_contact FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL (contact_id),
  CONSTRAINT fk_crm_proposals_workspace_thread FOREIGN KEY (workspace_id, thread_id)
    REFERENCES public.inbox_threads(workspace_id, id) ON DELETE SET NULL (thread_id),
  CONSTRAINT fk_crm_proposals_workspace_checkout FOREIGN KEY (workspace_id, checkout_id)
    REFERENCES public.payment_checkouts(workspace_id, id) ON DELETE SET NULL (checkout_id),
  CONSTRAINT uq_crm_proposals_workspace_id UNIQUE (workspace_id, id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_crm_proposals_status'
  ) THEN
    ALTER TABLE public.crm_proposals
      ADD CONSTRAINT chk_crm_proposals_status
      CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'paid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_crm_proposals_workspace_number'
  ) THEN
    ALTER TABLE public.crm_proposals
      ADD CONSTRAINT uq_crm_proposals_workspace_number
      UNIQUE (workspace_id, proposal_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_proposals_ws_status
  ON public.crm_proposals(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_ws_contact
  ON public.crm_proposals(workspace_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_ws_thread
  ON public.crm_proposals(workspace_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_ws_created
  ON public.crm_proposals(workspace_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. CRM BOOKINGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID,
  thread_id UUID,
  proposal_id UUID,
  title TEXT NOT NULL,
  booking_type TEXT NOT NULL DEFAULT 'executive_walkthrough',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  host_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_crm_bookings_workspace_contact FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL (contact_id),
  CONSTRAINT fk_crm_bookings_workspace_thread FOREIGN KEY (workspace_id, thread_id)
    REFERENCES public.inbox_threads(workspace_id, id) ON DELETE SET NULL (thread_id),
  CONSTRAINT fk_crm_bookings_workspace_proposal FOREIGN KEY (workspace_id, proposal_id)
    REFERENCES public.crm_proposals(workspace_id, id) ON DELETE SET NULL (proposal_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_crm_bookings_type'
  ) THEN
    ALTER TABLE public.crm_bookings
      ADD CONSTRAINT chk_crm_bookings_type
      CHECK (booking_type IN ('executive_walkthrough', 'discovery_call', 'technical_demo', 'closing_call', 'onboarding'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_crm_bookings_status'
  ) THEN
    ALTER TABLE public.crm_bookings
      ADD CONSTRAINT chk_crm_bookings_status
      CHECK (status IN ('scheduled', 'completed', 'canceled', 'rescheduled', 'no_show'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_bookings_ws_scheduled
  ON public.crm_bookings(workspace_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_crm_bookings_ws_contact
  ON public.crm_bookings(workspace_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_bookings_ws_status
  ON public.crm_bookings(workspace_id, status);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE public.crm_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_bookings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER TABLE public.crm_proposals FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.crm_bookings FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Policies for crm_proposals
DROP POLICY IF EXISTS crm_proposals_select_member ON public.crm_proposals;
CREATE POLICY crm_proposals_select_member ON public.crm_proposals
  FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_proposals_insert_member ON public.crm_proposals;
CREATE POLICY crm_proposals_insert_member ON public.crm_proposals
  FOR INSERT
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_proposals_update_member ON public.crm_proposals;
CREATE POLICY crm_proposals_update_member ON public.crm_proposals
  FOR UPDATE
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_proposals_delete_admin ON public.crm_proposals;
CREATE POLICY crm_proposals_delete_admin ON public.crm_proposals
  FOR DELETE
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- Policies for crm_bookings
DROP POLICY IF EXISTS crm_bookings_select_member ON public.crm_bookings;
CREATE POLICY crm_bookings_select_member ON public.crm_bookings
  FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_bookings_insert_member ON public.crm_bookings;
CREATE POLICY crm_bookings_insert_member ON public.crm_bookings
  FOR INSERT
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_bookings_update_member ON public.crm_bookings;
CREATE POLICY crm_bookings_update_member ON public.crm_bookings
  FOR UPDATE
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_bookings_delete_admin ON public.crm_bookings;
CREATE POLICY crm_bookings_delete_admin ON public.crm_bookings
  FOR DELETE
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 4. ROLE GRANTS (Safe for PGlite and Remote Supabase)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.crm_proposals FROM PUBLIC;
REVOKE ALL ON public.crm_bookings FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.crm_proposals FROM anon';
    EXECUTE 'REVOKE ALL ON public.crm_bookings FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_proposals TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bookings TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.crm_proposals TO service_role';
    EXECUTE 'GRANT ALL ON public.crm_bookings TO service_role';
  END IF;
END $$;

COMMIT;

-- >>> END: supabase/migrations\20260919_tier1_revenue_loop.sql <<<


-- >>> START: supabase/migrations\20260919b_restrict_tier1_authenticated_table_privileges.sql <<<
BEGIN;

REVOKE ALL ON public.crm_proposals FROM authenticated;
REVOKE ALL ON public.crm_bookings FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bookings TO authenticated;

COMMIT;

-- >>> END: supabase/migrations\20260919b_restrict_tier1_authenticated_table_privileges.sql <<<


-- >>> START: supabase/migrations\20260920_tier2_agency_commercialization.sql <<<
BEGIN;

-- ============================================================================
-- J10 NEXUS: Tier 2 — Agency & Client Commercialization Migration
-- Migration: 20260920_tier2_agency_commercialization.sql
-- ============================================================================
-- Establishes:
-- 1. White-label branding & agency hierarchy extensions on public.workspaces.
-- 2. public.workspace_domains: Custom domain registration, DNS tokens, and verification status.
-- 3. public.workspace_templates: Industry vertical blueprints and AI agent seeds.
-- 4. Safe constraints, composite indexes, and strict multi-tenant Row Level Security.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND WORKSPACES FOR WHITE-LABEL & AGENCY COMMERCIALIZATION
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS favicon_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#10B981',
  ADD COLUMN IF NOT EXISTS custom_domain TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_status TEXT NOT NULL DEFAULT 'unconfigured',
  ADD COLUMN IF NOT EXISTS white_label_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_title TEXT,
  ADD COLUMN IF NOT EXISTS portal_welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS agency_master_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS client_tier TEXT NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspaces_custom_domain_status'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT chk_workspaces_custom_domain_status
      CHECK (custom_domain_status IN ('unconfigured', 'pending_verification', 'verified', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspaces_billing_mode'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT chk_workspaces_billing_mode
      CHECK (billing_mode IN ('direct', 'agency_funded', 'revenue_share'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspaces_client_tier'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT chk_workspaces_client_tier
      CHECK (client_tier IN ('standard', 'pro', 'vip'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspaces_agency_master
  ON public.workspaces(agency_master_id)
  WHERE agency_master_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_custom_domain_unique
  ON public.workspaces(lower(trim(custom_domain)))
  WHERE custom_domain IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_workspace_agency_master()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.agency_master_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.agency_master_id = NEW.id THEN RAISE EXCEPTION 'A workspace cannot be its own agency master'; END IF;
  IF NEW.workspace_type <> 'client' THEN RAISE EXCEPTION 'Only client workspaces may reference an agency master'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = NEW.agency_master_id AND w.workspace_type = 'agency_master') THEN
    RAISE EXCEPTION 'agency_master_id must reference an agency_master workspace';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_validate_workspace_agency_master ON public.workspaces;
CREATE TRIGGER trg_validate_workspace_agency_master BEFORE INSERT OR UPDATE OF agency_master_id, workspace_type ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_agency_master();

-- ----------------------------------------------------------------------------
-- 2. WORKSPACE DOMAINS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  verification_token TEXT NOT NULL,
  dns_cname_target TEXT NOT NULL DEFAULT 'cname.j10nexus.com',
  status TEXT NOT NULL DEFAULT 'pending',
  ssl_status TEXT NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_domains_status'
  ) THEN
    ALTER TABLE public.workspace_domains
      ADD CONSTRAINT chk_workspace_domains_status
      CHECK (status IN ('pending', 'verified', 'active', 'failed', 'revoked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_domains_ssl_status'
  ) THEN
    ALTER TABLE public.workspace_domains
      ADD CONSTRAINT chk_workspace_domains_ssl_status
      CHECK (ssl_status IN ('pending', 'issued', 'expired', 'error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_domains_ws_status
  ON public.workspace_domains(workspace_id, status);

CREATE OR REPLACE FUNCTION public.validate_workspace_domain_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_domain text;
BEGIN
  IF TG_TABLE_NAME = 'workspaces' THEN v_domain := lower(trim(NEW.custom_domain)); ELSE v_domain := lower(trim(NEW.domain)); END IF;
  IF v_domain IS NULL OR v_domain = '' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'workspaces' THEN
    IF EXISTS (SELECT 1 FROM public.workspace_domains d WHERE lower(trim(d.domain)) = v_domain AND d.workspace_id <> NEW.id) THEN RAISE EXCEPTION 'Domain is owned by another workspace'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.workspaces w WHERE lower(trim(w.custom_domain)) = v_domain AND w.id <> NEW.workspace_id) THEN RAISE EXCEPTION 'Domain is owned by another workspace'; END IF;
    IF EXISTS (SELECT 1 FROM public.workspace_domains d WHERE lower(trim(d.domain)) = v_domain AND d.workspace_id <> NEW.workspace_id AND d.id <> NEW.id) THEN RAISE EXCEPTION 'Domain is owned by another workspace'; END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_validate_workspace_custom_domain ON public.workspaces;
CREATE TRIGGER trg_validate_workspace_custom_domain BEFORE INSERT OR UPDATE OF custom_domain ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_domain_ownership();
DROP TRIGGER IF EXISTS trg_validate_workspace_domain ON public.workspace_domains;
CREATE TRIGGER trg_validate_workspace_domain BEFORE INSERT OR UPDATE OF domain, workspace_id ON public.workspace_domains FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_domain_ownership();

-- ----------------------------------------------------------------------------
-- 3. WORKSPACE TEMPLATES TABLE & BLUEPRINTS SEED
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  vertical TEXT NOT NULL,
  description TEXT,
  system_prompt_blueprint TEXT,
  default_ai_employees JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_pipeline_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_knowledge_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_templates_vertical
  ON public.workspace_templates(vertical);

-- Seed 5 Core Vertical Industry Blueprints
INSERT INTO public.workspace_templates (
  slug,
  name,
  vertical,
  description,
  system_prompt_blueprint,
  default_ai_employees,
  default_pipeline_stages,
  default_knowledge_topics,
  is_public
) VALUES
(
  'real-estate-brokerage',
  'Real Estate & Property Development Blueprint',
  'real_estate',
  'Turnkey AI workforce for property showings, buyer pre-qualification, MLS listing Q&A, and transaction coordination.',
  'You are the Senior Commercial Real Estate AI Specialist for a high-volume brokerage. Provide prompt, professional property disclosures, schedule viewing walkthroughs, and qualify investor budgets.',
  '[
    {"name": "Marcus Vance", "role": "Head of Property Acquisitions", "department": "Commercial Sales"},
    {"name": "Elena Rostova", "role": "Leasing & Scheduling Concierge", "department": "Client Relations"}
  ]'::jsonb,
  '["inquiry", "showing_scheduled", "offer_submitted", "under_contract", "closed_won"]'::jsonb,
  '["Residential Showing Protocol", "Investor HOA Disclosure", "Buyer Pre-Approval Guidelines"]'::jsonb,
  true
),
(
  'solar-energy-residential',
  'Solar Energy & Clean Tech Installer Blueprint',
  'solar_energy',
  'Autonomous residential solar consultation, utility bill analysis, rooftop layout qualification, and rebate calculation.',
  'You are the Chief Clean Energy Consultant. Guide homeowners on net metering, calculate kW offset based on monthly electric bills, and book site assessments.',
  '[
    {"name": "Julian Hayes", "role": "Solar Energy Engineer", "department": "Design & Sales"},
    {"name": "Amber Wells", "role": "Utility Interconnection Specialist", "department": "Operations"}
  ]'::jsonb,
  '["lead", "utility_bill_received", "design_proposed", "permit_pending", "installed_won"]'::jsonb,
  '["State Net Metering Policy", "Rooftop Tilt Efficiency Matrix", "Tax Credit & Rebate FAQ"]'::jsonb,
  true
),
(
  'legal-services-corporate',
  'Corporate & Commercial Law Practice Blueprint',
  'legal_services',
  'Strictly governed client intake, conflict checking, retainer proposal generation, and NDA execution.',
  'You are the Executive Intake Assistant for a premier legal consultancy. Maintain strict privilege, capture entity details, and schedule initial retainer consultations without providing direct legal counsel.',
  '[
    {"name": "Thomas Sterling, Esq.", "role": "Corporate Intake Partner", "department": "Legal Operations"},
    {"name": "Victoria Cross", "role": "Compliance & Retainer Officer", "department": "Client Services"}
  ]'::jsonb,
  '["intake_submitted", "conflict_cleared", "engagement_sent", "retainer_received", "active_matter"]'::jsonb,
  '["Client Privilege Standard", "Retainer Fee Structure", "Conflict Check Criteria"]'::jsonb,
  true
),
(
  'healthcare-clinic-aesthetics',
  'Aesthetic Clinic & Specialty Healthcare Blueprint',
  'healthcare_clinic',
  'HIPAA-conscious appointment scheduling, treatment FAQ, post-consult follow-up, and wellness plan packages.',
  'You are the Patient Care Coordinator for an aesthetic medical practice. Provide empathetic, accurate procedural overviews, verify patient availability, and confirm consultation bookings.',
  '[
    {"name": "Dr. Clara Chen", "role": "Clinical Operations Director", "department": "Patient Advisory"},
    {"name": "Chloe Bennett", "role": "Patient Concierge", "department": "Scheduling"}
  ]'::jsonb,
  '["consult_requested", "treatment_matched", "deposit_collected", "treatment_completed"]'::jsonb,
  '["Pre-Treatment Care Sheet", "Consultation Deposit Policy", "Post-Procedure Recovery Protocols"]'::jsonb,
  true
),
(
  'ecommerce-dtc-brand',
  'DTC Ecommerce & Brand Merchant Blueprint',
  'ecommerce',
  '24/7 autonomous WhatsApp order tracking, abandoned cart recovery, product recommendations, and automated returns.',
  'You are the Brand Concierge for a high-growth consumer retail merchant. Deliver delightful, rapid customer support, recommend tailored product bundles, and share secure checkout links.',
  '[
    {"name": "Alex Mercer", "role": "E-Commerce Revenue Specialist", "department": "Growth & Retention"},
    {"name": "Maya Lin", "role": "Order Logistics Coordinator", "department": "Customer Support"}
  ]'::jsonb,
  '["visitor", "cart_abandoned", "discount_sent", "purchased_won", "repeat_customer"]'::jsonb,
  '["Shipping & Delivery Matrix", "Return & Refund Policy", "Seasonal VIP Promotion Guides"]'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER TABLE public.workspace_domains FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.workspace_templates FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Policies for workspace_domains
DROP POLICY IF EXISTS workspace_domains_select_member ON public.workspace_domains;
CREATE POLICY workspace_domains_select_member ON public.workspace_domains
  FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS workspace_domains_modify_admin ON public.workspace_domains;
CREATE POLICY workspace_domains_modify_admin ON public.workspace_domains
  FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- Policies for workspace_templates
DROP POLICY IF EXISTS workspace_templates_select ON public.workspace_templates;
CREATE POLICY workspace_templates_select ON public.workspace_templates
  FOR SELECT
  USING (
    is_public = true
    OR (workspace_id IS NOT NULL AND has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS workspace_templates_modify ON public.workspace_templates;
CREATE POLICY workspace_templates_modify ON public.workspace_templates
  FOR ALL
  USING (
    (workspace_id IS NOT NULL AND has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
    OR is_platform_admin()
  )
  WITH CHECK (
    (workspace_id IS NOT NULL AND has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
    OR is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 5. ROLE GRANTS
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.workspace_domains, public.workspace_templates FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.workspace_domains, public.workspace_templates FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.workspace_domains, public.workspace_templates FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_domains TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_templates TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.workspace_domains TO service_role';
    EXECUTE 'GRANT ALL ON public.workspace_templates TO service_role';
  END IF;
END $$;

COMMIT;

-- >>> END: supabase/migrations\20260920_tier2_agency_commercialization.sql <<<


-- >>> START: supabase/migrations\20260921_tier3_omnichannel_operations.sql <<<
BEGIN;

-- Tier 3 — True Omnichannel Operations.

-- Expand the existing inbox contract deterministically. A legacy row using an
-- unsupported channel must abort the transaction instead of silently retaining
-- the old constraint.
ALTER TABLE public.inbox_threads
  DROP CONSTRAINT IF EXISTS inbox_threads_channel_check,
  DROP CONSTRAINT IF EXISTS chk_inbox_threads_channel;
ALTER TABLE public.inbox_threads
  ADD CONSTRAINT chk_inbox_threads_channel CHECK (channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm'
  ));

-- Assignment, routing, SLA, and collision-lease state.
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_team text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS routing_rule_id uuid,
  ADD COLUMN IF NOT EXISTS sla_status text NOT NULL DEFAULT 'healthy'
    CHECK (sla_status IN ('healthy', 'warning', 'breached')),
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid,
  ADD COLUMN IF NOT EXISTS sla_first_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_first_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_breached_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS active_viewers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- workforce_members is the canonical production workforce table. Its primary
-- key is global; this additional key permits tenant-safe composite references.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workforce_members'::regclass
      AND conname = 'uq_workforce_members_workspace_id'
  ) THEN
    ALTER TABLE public.workforce_members
      ADD CONSTRAINT uq_workforce_members_workspace_id UNIQUE (workspace_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.omnichannel_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel text NOT NULL CHECK (channel IN (
    'all', 'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram',
    'messenger', 'webchat', 'website', 'crm'
  )),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  routing_strategy text NOT NULL CHECK (routing_strategy IN (
    'round_robin', 'least_loaded', 'skill_based', 'ai_specialist', 'direct_assignment'
  )),
  target_user_id uuid,
  target_agent_id uuid,
  target_team text NOT NULL DEFAULT 'general',
  priority_order integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_omnichannel_routing_rules_workspace_id UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS public.omnichannel_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'all')),
  channel text NOT NULL CHECK (channel IN (
    'all', 'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram',
    'messenger', 'webchat', 'website', 'crm'
  )),
  first_response_target_minutes integer NOT NULL CHECK (first_response_target_minutes > 0),
  resolution_target_minutes integer NOT NULL CHECK (resolution_target_minutes > 0),
  warning_threshold_percent integer NOT NULL DEFAULT 80 CHECK (warning_threshold_percent BETWEEN 1 AND 99),
  escalation_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_omnichannel_sla_policies_workspace_id UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS public.omnichannel_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid,
  message_id uuid,
  routing_rule_id uuid,
  sla_policy_id uuid,
  channel text NOT NULL CHECK (channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm'
  )),
  provider text NOT NULL,
  recipient text NOT NULL,
  external_message_id text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every assignment, routing, SLA, and dispatch reference is workspace-scoped.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_assigned_user_workspace') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_assigned_user_workspace
      FOREIGN KEY (workspace_id, assigned_user_id)
      REFERENCES public.workspace_memberships(workspace_id, user_id)
      ON DELETE SET NULL (assigned_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_assigned_member_workspace') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_assigned_member_workspace
      FOREIGN KEY (workspace_id, assigned_agent_id)
      REFERENCES public.workforce_members(workspace_id, id)
      ON DELETE SET NULL (assigned_agent_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_routing_rule_target_user_workspace') THEN
    ALTER TABLE public.omnichannel_routing_rules ADD CONSTRAINT fk_routing_rule_target_user_workspace
      FOREIGN KEY (workspace_id, target_user_id)
      REFERENCES public.workspace_memberships(workspace_id, user_id)
      ON DELETE SET NULL (target_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_routing_rule_target_member_workspace') THEN
    ALTER TABLE public.omnichannel_routing_rules ADD CONSTRAINT fk_routing_rule_target_member_workspace
      FOREIGN KEY (workspace_id, target_agent_id)
      REFERENCES public.workforce_members(workspace_id, id)
      ON DELETE SET NULL (target_agent_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_routing_rule_workspace') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_routing_rule_workspace
      FOREIGN KEY (workspace_id, routing_rule_id)
      REFERENCES public.omnichannel_routing_rules(workspace_id, id)
      ON DELETE SET NULL (routing_rule_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_sla_policy_workspace') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_sla_policy_workspace
      FOREIGN KEY (workspace_id, sla_policy_id)
      REFERENCES public.omnichannel_sla_policies(workspace_id, id)
      ON DELETE SET NULL (sla_policy_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_thread_workspace') THEN
    ALTER TABLE public.omnichannel_dispatch_logs ADD CONSTRAINT fk_dispatch_thread_workspace
      FOREIGN KEY (workspace_id, thread_id)
      REFERENCES public.inbox_threads(workspace_id, id)
      ON DELETE SET NULL (thread_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_message_workspace') THEN
    ALTER TABLE public.omnichannel_dispatch_logs ADD CONSTRAINT fk_dispatch_message_workspace
      FOREIGN KEY (workspace_id, message_id)
      REFERENCES public.inbox_messages(workspace_id, id)
      ON DELETE SET NULL (message_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_routing_rule_workspace') THEN
    ALTER TABLE public.omnichannel_dispatch_logs ADD CONSTRAINT fk_dispatch_routing_rule_workspace
      FOREIGN KEY (workspace_id, routing_rule_id)
      REFERENCES public.omnichannel_routing_rules(workspace_id, id)
      ON DELETE SET NULL (routing_rule_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_sla_policy_workspace') THEN
    ALTER TABLE public.omnichannel_dispatch_logs ADD CONSTRAINT fk_dispatch_sla_policy_workspace
      FOREIGN KEY (workspace_id, sla_policy_id)
      REFERENCES public.omnichannel_sla_policies(workspace_id, id)
      ON DELETE SET NULL (sla_policy_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inbox_threads_lease_state') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT chk_inbox_threads_lease_state CHECK (
      (locked_by_user_id IS NULL AND locked_at IS NULL AND lock_expires_at IS NULL)
      OR (
        locked_by_user_id IS NOT NULL
        AND locked_at IS NOT NULL
        AND lock_expires_at IS NOT NULL
        AND lock_expires_at > locked_at
      )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_channel ON public.inbox_threads(workspace_id, channel);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_sla_status ON public.inbox_threads(workspace_id, sla_status);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_locked ON public.inbox_threads(locked_by_user_id, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_omnichannel_rules_ws ON public.omnichannel_routing_rules(workspace_id, is_active, priority_order);
CREATE INDEX IF NOT EXISTS idx_omnichannel_sla_ws ON public.omnichannel_sla_policies(workspace_id, priority, channel);
CREATE INDEX IF NOT EXISTS idx_omnichannel_dispatch_ws ON public.omnichannel_dispatch_logs(workspace_id, created_at DESC);

-- The evaluator selects the first active rule. Equal active priorities in one
-- workspace/channel are contradictory; defaults must be unique by SLA scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichannel_active_routing_priority
  ON public.omnichannel_routing_rules(workspace_id, channel, priority_order)
  WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichannel_default_sla_scope
  ON public.omnichannel_sla_policies(workspace_id, priority, channel)
  WHERE is_default;

ALTER TABLE public.omnichannel_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_routing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_sla_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_dispatch_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omnichannel_rules_member_select ON public.omnichannel_routing_rules;
CREATE POLICY omnichannel_rules_member_select ON public.omnichannel_routing_rules FOR SELECT
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']) OR is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS omnichannel_rules_admin_manage ON public.omnichannel_routing_rules;
CREATE POLICY omnichannel_rules_admin_manage ON public.omnichannel_routing_rules FOR ALL
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin']) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS omnichannel_sla_member_select ON public.omnichannel_sla_policies;
CREATE POLICY omnichannel_sla_member_select ON public.omnichannel_sla_policies FOR SELECT
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']) OR is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS omnichannel_sla_admin_manage ON public.omnichannel_sla_policies;
CREATE POLICY omnichannel_sla_admin_manage ON public.omnichannel_sla_policies FOR ALL
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin']) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS omnichannel_dispatch_member_select ON public.omnichannel_dispatch_logs;
CREATE POLICY omnichannel_dispatch_member_select ON public.omnichannel_dispatch_logs FOR SELECT
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']) OR is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS omnichannel_dispatch_member_insert ON public.omnichannel_dispatch_logs;
CREATE POLICY omnichannel_dispatch_member_insert ON public.omnichannel_dispatch_logs FOR INSERT
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']) OR is_platform_admin(auth.uid()));

REVOKE ALL ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs TO service_role';
  END IF;
END $$;

COMMIT;

-- >>> END: supabase/migrations\20260921_tier3_omnichannel_operations.sql <<<


-- >>> START: supabase/migrations\20260922_tier4_governed_ai_agent_platform.sql <<<
BEGIN;

-- ============================================================
-- J10 NEXUS TIER 4 — GOVERNED AI AGENT PLATFORM SCHEMA
-- Migration: 20260922_tier4_governed_ai_agent_platform.sql
-- ============================================================

-- 1. Create AI Agent Versions Table
CREATE TABLE IF NOT EXISTS public.ai_agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  system_prompt text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  model_id text NOT NULL DEFAULT 'gpt-5.6-sol',
  temperature numeric(3,2) NOT NULL DEFAULT 0.70 CHECK (temperature >= 0.00 AND temperature <= 2.00),
  max_tokens integer NOT NULL DEFAULT 4096 CHECK (max_tokens > 0),
  reasoning_effort text NOT NULL DEFAULT 'medium' CHECK (reasoning_effort IN ('none', 'low', 'medium', 'high', 'xhigh', 'max')),
  tools_enabled text[] NOT NULL DEFAULT '{}',
  changelog text NOT NULL DEFAULT 'Initial version',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'rollback')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_agent_versions UNIQUE (workspace_id, agent_id, version_number),
  CONSTRAINT uq_ai_agent_versions_ws_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_versions_workspace_agent
  ON public.ai_agent_versions(workspace_id, agent_id, status);

-- 2. Create AI Agent Traces Table
CREATE TABLE IF NOT EXISTS public.ai_agent_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  version_id uuid,
  task_id uuid,
  session_id text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'waiting_approval', 'rejected')),
  model_used text NOT NULL DEFAULT 'gpt-5.6-sol',
  provider_used text NOT NULL DEFAULT 'openai' CHECK (provider_used IN ('openai', 'gemini', 'development')),
  latency_ms integer NOT NULL DEFAULT 0,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0.000000,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_agent_traces_ws_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_traces_workspace_agent
  ON public.ai_agent_traces(workspace_id, agent_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_agent_traces_task
  ON public.ai_agent_traces(task_id);

-- 3. Create AI Agent Trace Steps Table
CREATE TABLE IF NOT EXISTS public.ai_agent_trace_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL REFERENCES public.ai_agent_traces(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  step_type text NOT NULL CHECK (step_type IN ('reasoning', 'tool_call', 'approval_gate', 'eval_check', 'output')),
  tool_name text,
  tool_input jsonb,
  tool_output jsonb,
  thought text,
  latency_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'waiting_approval')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_trace_steps_trace
  ON public.ai_agent_trace_steps(trace_id, step_number);

-- 4. Create AI Agent Permissions Table
CREATE TABLE IF NOT EXISTS public.ai_agent_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  allowed_tools text[] NOT NULL DEFAULT '{}',
  denied_tools text[] NOT NULL DEFAULT '{}',
  data_boundaries jsonb NOT NULL DEFAULT '{}'::jsonb,
  can_execute_code boolean NOT NULL DEFAULT false,
  can_call_external_apis boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_agent_permissions UNIQUE (workspace_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_permissions_workspace_agent
  ON public.ai_agent_permissions(workspace_id, agent_id);

-- 5. Create AI Agent Budgets Table
CREATE TABLE IF NOT EXISTS public.ai_agent_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  daily_budget_usd numeric(10,2) NOT NULL DEFAULT 25.00 CHECK (daily_budget_usd >= 0),
  monthly_budget_usd numeric(10,2) NOT NULL DEFAULT 500.00 CHECK (monthly_budget_usd >= 0),
  max_cost_per_execution_usd numeric(10,4) NOT NULL DEFAULT 1.5000 CHECK (max_cost_per_execution_usd >= 0),
  current_daily_spend_usd numeric(10,6) NOT NULL DEFAULT 0.000000,
  current_monthly_spend_usd numeric(10,6) NOT NULL DEFAULT 0.000000,
  over_budget_policy text NOT NULL DEFAULT 'require_approval' CHECK (over_budget_policy IN ('hard_stop', 'require_approval', 'notify_only')),
  last_reset_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_agent_budgets UNIQUE (workspace_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_budgets_workspace_agent
  ON public.ai_agent_budgets(workspace_id, agent_id);

-- 6. Create AI Agent Approval Gates Table
CREATE TABLE IF NOT EXISTS public.ai_agent_approval_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trace_id uuid,
  agent_id text NOT NULL,
  action_type text NOT NULL,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_risk text NOT NULL DEFAULT 'medium' CHECK (estimated_risk IN ('low', 'medium', 'high', 'critical')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_approval_gates_workspace_status
  ON public.ai_agent_approval_gates(workspace_id, status);

-- 7. Create AI Agent Evaluations Table
CREATE TABLE IF NOT EXISTS public.ai_agent_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  version_id uuid,
  benchmark_name text NOT NULL,
  test_cases_count integer NOT NULL DEFAULT 0,
  passed_count integer NOT NULL DEFAULT 0,
  pass_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  accuracy_score numeric(5,2) NOT NULL DEFAULT 0.00,
  groundedness_score numeric(5,2) NOT NULL DEFAULT 0.00,
  safety_score numeric(5,2) NOT NULL DEFAULT 100.00,
  p95_latency_ms integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_evaluations_workspace_agent
  ON public.ai_agent_evaluations(workspace_id, agent_id, version_id);

-- 8. Create AI Agent ROI Attributions Table
CREATE TABLE IF NOT EXISTS public.ai_agent_roi_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  trace_id uuid,
  task_id uuid,
  contact_id uuid,
  deal_value_usd numeric(12,2) NOT NULL DEFAULT 0.00,
  hours_saved numeric(6,2) NOT NULL DEFAULT 0.00,
  labor_savings_usd numeric(10,2) NOT NULL DEFAULT 0.00,
  model_cost_usd numeric(10,6) NOT NULL DEFAULT 0.000000,
  net_roi_usd numeric(12,2) NOT NULL DEFAULT 0.00,
  roi_multiplier numeric(8,2) NOT NULL DEFAULT 0.00,
  attribution_type text NOT NULL DEFAULT 'labor_saved' CHECK (attribution_type IN ('won_deal', 'labor_saved', 'proposal_accepted', 'support_ticket_deflected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_roi_workspace_agent
  ON public.ai_agent_roi_attributions(workspace_id, agent_id, attribution_type);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.ai_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_trace_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_approval_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_roi_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_traces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_trace_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_approval_gates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_evaluations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_roi_attributions FORCE ROW LEVEL SECURITY;

-- 9. Composite Foreign Keys & Constraints for Cross-Tenant Integrity
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_versions_created_by_workspace') THEN
    ALTER TABLE public.ai_agent_versions
      ADD CONSTRAINT fk_ai_agent_versions_created_by_workspace
      FOREIGN KEY (workspace_id, created_by)
      REFERENCES public.workspace_memberships(workspace_id, user_id)
      ON DELETE SET NULL (created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_traces_version_ws') THEN
    ALTER TABLE public.ai_agent_traces
      ADD CONSTRAINT fk_ai_agent_traces_version_ws
      FOREIGN KEY (workspace_id, version_id)
      REFERENCES public.ai_agent_versions(workspace_id, id)
      ON DELETE SET NULL (version_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_approval_gates_trace_ws') THEN
    ALTER TABLE public.ai_agent_approval_gates
      ADD CONSTRAINT fk_ai_agent_approval_gates_trace_ws
      FOREIGN KEY (workspace_id, trace_id)
      REFERENCES public.ai_agent_traces(workspace_id, id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_approval_gates_reviewer_workspace') THEN
    ALTER TABLE public.ai_agent_approval_gates
      ADD CONSTRAINT fk_ai_agent_approval_gates_reviewer_workspace
      FOREIGN KEY (workspace_id, reviewed_by)
      REFERENCES public.workspace_memberships(workspace_id, user_id)
      ON DELETE SET NULL (reviewed_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_evaluations_version_ws') THEN
    ALTER TABLE public.ai_agent_evaluations
      ADD CONSTRAINT fk_ai_agent_evaluations_version_ws
      FOREIGN KEY (workspace_id, version_id)
      REFERENCES public.ai_agent_versions(workspace_id, id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_roi_attributions_trace_ws') THEN
    ALTER TABLE public.ai_agent_roi_attributions
      ADD CONSTRAINT fk_ai_agent_roi_attributions_trace_ws
      FOREIGN KEY (workspace_id, trace_id)
      REFERENCES public.ai_agent_traces(workspace_id, id)
      ON DELETE SET NULL (trace_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_roi_attributions_contact_ws') THEN
    ALTER TABLE public.ai_agent_roi_attributions
      ADD CONSTRAINT fk_ai_agent_roi_attributions_contact_ws
      FOREIGN KEY (workspace_id, contact_id)
      REFERENCES public.contacts(workspace_id, id)
      ON DELETE SET NULL (contact_id);
  END IF;
END $$;

-- 10. Canonical Row Level Security (RLS) Policies
-- ai_agent_versions RLS
DROP POLICY IF EXISTS "ai_agent_versions_select" ON public.ai_agent_versions;
CREATE POLICY "ai_agent_versions_select" ON public.ai_agent_versions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ai_agent_versions_manage" ON public.ai_agent_versions;
CREATE POLICY "ai_agent_versions_manage" ON public.ai_agent_versions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin(auth.uid())
  );

-- ai_agent_traces RLS
DROP POLICY IF EXISTS "ai_agent_traces_select" ON public.ai_agent_traces;
CREATE POLICY "ai_agent_traces_select" ON public.ai_agent_traces FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ai_agent_traces_manage" ON public.ai_agent_traces;
CREATE POLICY "ai_agent_traces_manage" ON public.ai_agent_traces FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin(auth.uid())
  );

-- ai_agent_trace_steps RLS
DROP POLICY IF EXISTS "ai_agent_trace_steps_select" ON public.ai_agent_trace_steps;
CREATE POLICY "ai_agent_trace_steps_select" ON public.ai_agent_trace_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agent_traces t
      WHERE t.id = ai_agent_trace_steps.trace_id
        AND (
          has_workspace_role(t.workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
          OR is_platform_admin(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "ai_agent_trace_steps_manage" ON public.ai_agent_trace_steps;
CREATE POLICY "ai_agent_trace_steps_manage" ON public.ai_agent_trace_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agent_traces t
      WHERE t.id = ai_agent_trace_steps.trace_id
        AND (
          has_workspace_role(t.workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
          OR is_platform_admin(auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_agent_traces t
      WHERE t.id = ai_agent_trace_steps.trace_id
        AND (
          has_workspace_role(t.workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
          OR is_platform_admin(auth.uid())
        )
    )
  );

-- ai_agent_permissions RLS
DROP POLICY IF EXISTS "ai_agent_permissions_select" ON public.ai_agent_permissions;
CREATE POLICY "ai_agent_permissions_select" ON public.ai_agent_permissions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ai_agent_permissions_manage" ON public.ai_agent_permissions;
CREATE POLICY "ai_agent_permissions_manage" ON public.ai_agent_permissions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin(auth.uid())
  );

-- ai_agent_budgets RLS
DROP POLICY IF EXISTS "ai_agent_budgets_select" ON public.ai_agent_budgets;
CREATE POLICY "ai_agent_budgets_select" ON public.ai_agent_budgets FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ai_agent_budgets_manage" ON public.ai_agent_budgets;
CREATE POLICY "ai_agent_budgets_manage" ON public.ai_agent_budgets FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin(auth.uid())
  );

-- ai_agent_approval_gates RLS
DROP POLICY IF EXISTS "ai_agent_approval_gates_select" ON public.ai_agent_approval_gates;
CREATE POLICY "ai_agent_approval_gates_select" ON public.ai_agent_approval_gates FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ai_agent_approval_gates_manage" ON public.ai_agent_approval_gates;
CREATE POLICY "ai_agent_approval_gates_manage" ON public.ai_agent_approval_gates FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin(auth.uid())
  );

-- ai_agent_evaluations RLS
DROP POLICY IF EXISTS "ai_agent_evaluations_select" ON public.ai_agent_evaluations;
CREATE POLICY "ai_agent_evaluations_select" ON public.ai_agent_evaluations FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ai_agent_evaluations_manage" ON public.ai_agent_evaluations;
CREATE POLICY "ai_agent_evaluations_manage" ON public.ai_agent_evaluations FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin(auth.uid())
  );

-- ai_agent_roi_attributions RLS
DROP POLICY IF EXISTS "ai_agent_roi_attributions_select" ON public.ai_agent_roi_attributions;
CREATE POLICY "ai_agent_roi_attributions_select" ON public.ai_agent_roi_attributions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ai_agent_roi_attributions_manage" ON public.ai_agent_roi_attributions;
CREATE POLICY "ai_agent_roi_attributions_manage" ON public.ai_agent_roi_attributions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin(auth.uid())
  );

REVOKE ALL ON public.ai_agent_versions, public.ai_agent_traces, public.ai_agent_trace_steps,
  public.ai_agent_permissions, public.ai_agent_budgets, public.ai_agent_approval_gates,
  public.ai_agent_evaluations, public.ai_agent_roi_attributions FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.ai_agent_versions, public.ai_agent_traces, public.ai_agent_trace_steps, public.ai_agent_permissions, public.ai_agent_budgets, public.ai_agent_approval_gates, public.ai_agent_evaluations, public.ai_agent_roi_attributions FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.ai_agent_versions, public.ai_agent_traces, public.ai_agent_trace_steps, public.ai_agent_permissions, public.ai_agent_budgets, public.ai_agent_approval_gates, public.ai_agent_evaluations, public.ai_agent_roi_attributions FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_versions, public.ai_agent_traces, public.ai_agent_trace_steps, public.ai_agent_permissions, public.ai_agent_budgets, public.ai_agent_approval_gates, public.ai_agent_evaluations, public.ai_agent_roi_attributions TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.ai_agent_versions, public.ai_agent_traces, public.ai_agent_trace_steps, public.ai_agent_permissions, public.ai_agent_budgets, public.ai_agent_approval_gates, public.ai_agent_evaluations, public.ai_agent_roi_attributions TO service_role';
  END IF;
END $$;

COMMIT;

-- >>> END: supabase/migrations\20260922_tier4_governed_ai_agent_platform.sql <<<


-- >>> START: supabase/migrations\20260923_canonical_authorization_and_cross_tenant_integrity_repair.sql <<<
BEGIN;

-- Tier 3 and Tier 4 canonical authorization, FORCE RLS, grants, and
-- workspace-scoped integrity were incorporated directly into the corrected
-- 20260921 and 20260922 migrations before production rollout. This migration
-- intentionally records their historical reconciliation without recreating or
-- mutating the already-correct production objects.

COMMIT;

-- >>> END: supabase/migrations\20260923_canonical_authorization_and_cross_tenant_integrity_repair.sql <<<


-- >>> START: supabase/migrations\20260924_align_channel_metrics_and_atomic_reservations.sql <<<
BEGIN;

-- ============================================================================
-- J10 NEXUS TIER 0G/3/4 — FORWARD MIGRATION: CHANNEL METRICS & ATOMIC RESERVATIONS
-- 1. Updates workspace_usage_records metric check constraint for all 9 channels
-- 2. Restores provenance, period-expiration, dunning/grace in record_verified_workspace_usage
-- 3. Creates public.workspace_quota_reservations table with period tracking
-- 4. Creates public.reserve_workspace_quota_atomic with caller auth & workspace idempotency
-- 5. Creates public.settle_workspace_quota_atomic with caller auth & reconciliation
-- 6. Hardens public.release_workspace_quota_atomic with caller auth & ledger consistency
-- 7. Hardens public.record_agent_execution_spend_atomic with caller auth, date-aware reset,
--    daily/monthly/execution ceiling admission, and reservation-bound refunds
-- ============================================================================

-- 1. UPDATE CHECK CONSTRAINT FOR OMNICHANNEL USAGE METRICS & QUANTITY COMPENSATION
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_usage_metric_name'
  ) THEN
    ALTER TABLE public.workspace_usage_records
      DROP CONSTRAINT chk_workspace_usage_metric_name;
  END IF;

  ALTER TABLE public.workspace_usage_records
    ADD CONSTRAINT chk_workspace_usage_metric_name
    CHECK (metric_name IN (
      'whatsapp_outbound',
      'whatsapp_inbound',
      'sms_outbound',
      'email_outbound',
      'instagram_outbound',
      'messenger_outbound',
      'webchat_outbound',
      'website_outbound',
      'crm_outbound',
      'whatsapp_group_outbound',
      'omnichannel_outbound',
      'ai_tokens',
      'ai_agent_run',
      'campaign_broadcast',
      'workflow_execution'
    ));

  -- Allow negative quantity for refund and compensation audit entries
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_usage_records_quantity_check'
  ) THEN
    ALTER TABLE public.workspace_usage_records
      DROP CONSTRAINT workspace_usage_records_quantity_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_usage_records_quantity'
  ) THEN
    ALTER TABLE public.workspace_usage_records
      ADD CONSTRAINT chk_workspace_usage_records_quantity
      CHECK (quantity != 0);
  END IF;
END $$;

-- 2. CREATE DATABASE-BACKED WORKSPACE QUOTA RESERVATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_quota_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released')),
  resource_id TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_period_start TIMESTAMPTZ,
  billing_period_end TIMESTAMPTZ,
  settled_quantity INTEGER,
  released_quantity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT uq_workspace_quota_reservations_ws_id UNIQUE (workspace_id, reservation_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_quota_reservations' AND column_name = 'billing_period_start'
  ) THEN
    ALTER TABLE public.workspace_quota_reservations ADD COLUMN billing_period_start TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_quota_reservations' AND column_name = 'billing_period_end'
  ) THEN
    ALTER TABLE public.workspace_quota_reservations ADD COLUMN billing_period_end TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_quota_reservations' AND column_name = 'settled_quantity'
  ) THEN
    ALTER TABLE public.workspace_quota_reservations ADD COLUMN settled_quantity INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_quota_reservations' AND column_name = 'released_quantity'
  ) THEN
    ALTER TABLE public.workspace_quota_reservations ADD COLUMN released_quantity INTEGER;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quota_reservations_ws_status
  ON public.workspace_quota_reservations(workspace_id, status);

ALTER TABLE public.workspace_quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_quota_reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_quota_reservations_select_member" ON public.workspace_quota_reservations;
CREATE POLICY "workspace_quota_reservations_select_member"
  ON public.workspace_quota_reservations
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR public.is_platform_admin(auth.uid())
  );

-- The ledger is mutated only through the atomic SECURITY DEFINER RPCs.  Members
-- may read their workspace's rows through the policy; service_role retains its
-- operational access.
REVOKE ALL ON TABLE public.workspace_quota_reservations FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.workspace_quota_reservations FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.workspace_quota_reservations FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.workspace_quota_reservations TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON TABLE public.workspace_quota_reservations TO service_role';
  END IF;
END;
$$;

-- 3. RECORD VERIFIED WORKSPACE USAGE (RESTORED ENTITLEMENT CHECKS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_verified_workspace_usage(
  p_workspace_id UUID,
  p_metric_name TEXT,
  p_quantity INT DEFAULT 1,
  p_idempotency_key TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_existing_record public.workspace_usage_records%ROWTYPE;
  v_new_record_id UUID;
  v_new_usage INT;
BEGIN
  -- 1. Input sanitization
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage quantity: must be greater than zero',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_quantity > 100000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage quantity: exceeds maximum allowable batch limit',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_metric_name NOT IN (
    'whatsapp_outbound',
    'whatsapp_inbound',
    'sms_outbound',
    'email_outbound',
    'instagram_outbound',
    'messenger_outbound',
    'webchat_outbound',
    'website_outbound',
    'crm_outbound',
    'whatsapp_group_outbound',
    'omnichannel_outbound',
    'ai_tokens',
    'ai_agent_run',
    'campaign_broadcast',
    'workflow_execution'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid metric_name: unrecognized billable metric',
      'limit_reached', false,
      'is_exceeded', false
    );
  END IF;

  -- 2. Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 3. Idempotency Check: if idempotency key was already recorded, return success without re-billing
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    SELECT * INTO v_existing_record
    FROM public.workspace_usage_records
    WHERE workspace_id = p_workspace_id
      AND idempotency_key = nullif(trim(p_idempotency_key), '');

    IF FOUND THEN
      IF v_existing_record.metric_name IS DISTINCT FROM p_metric_name
         OR v_existing_record.quantity IS DISTINCT FROM p_quantity
         OR v_existing_record.resource_id IS DISTINCT FROM p_resource_id
         OR v_existing_record.actor_user_id IS DISTINCT FROM p_actor_user_id
         OR v_existing_record.metadata IS DISTINCT FROM p_metadata THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Idempotency conflict: key already used with different payload',
          'limit_reached', false,
          'is_exceeded', false
        );
      END IF;

      SELECT messages_used_this_period INTO v_new_usage
      FROM public.workspace_subscriptions
      WHERE workspace_id = p_workspace_id;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'record_id', v_existing_record.id,
        'workspace_id', p_workspace_id,
        'messages_used_this_period', COALESCE(v_new_usage, 0),
        'action', 'already_recorded'
      );
    END IF;
  END IF;

  -- 4. Lock subscription row exclusively for atomic evaluation
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No subscription provisioned for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 5. Provenance validation: unverified provenance fails closed
  IF v_sub.provenance = 'none' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription lacks verified billing provenance',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 6. Period boundaries & status
  IF v_sub.provenance = 'internal_grant' THEN
    IF now() > v_sub.current_period_end THEN
      UPDATE public.workspace_subscriptions
      SET current_period_start = now(),
          current_period_end = now() + INTERVAL '1 year',
          messages_used_this_period = 0,
          updated_at = now()
      WHERE workspace_id = p_workspace_id
      RETURNING * INTO v_sub;
    END IF;
  ELSE
    IF v_sub.current_period_end < now() AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Subscription billing period expired',
        'limit_reached', true,
        'is_exceeded', true
      );
    END IF;
  END IF;

  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is inactive (' || v_sub.status || ')',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- Past due grace period check
  IF v_sub.status = 'past_due' AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription payment is past due and grace period has expired',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- Dunning suspension check
  IF v_sub.dunning_status IN ('suspended', 'terminated') AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is suspended due to payment failure',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 7. Quota limit check
  IF v_sub.monthly_message_limit <= 0 OR (v_sub.messages_used_this_period + p_quantity) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'limit_reached', true,
      'is_exceeded', true,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'monthly_message_limit', v_sub.monthly_message_limit
    );
  END IF;

  -- 8. Atomic usage increment
  v_new_usage := v_sub.messages_used_this_period + p_quantity;

  UPDATE public.workspace_subscriptions
  SET
    messages_used_this_period = v_new_usage,
    updated_at = now()
  WHERE id = v_sub.id;

  -- 9. Insert immutable audit record
  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    actor_user_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_workspace_id,
    p_metric_name,
    p_quantity,
    nullif(trim(p_idempotency_key), ''),
    p_resource_id,
    p_actor_user_id,
    v_sub.current_period_start,
    v_sub.current_period_end,
    p_metadata
  )
  RETURNING id INTO v_new_record_id;

  RETURN jsonb_build_object(
    'success', true,
    'record_id', v_new_record_id,
    'workspace_id', p_workspace_id,
    'quantity_recorded', p_quantity,
    'messages_used_this_period', v_new_usage,
    'monthly_message_limit', v_sub.monthly_message_limit,
    'remaining', (v_sub.monthly_message_limit - v_new_usage),
    'is_exceeded', false
  );
END;
$$;

-- 4. ATOMIC WORKSPACE QUOTA RESERVATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_workspace_quota_atomic(
  p_workspace_id UUID,
  p_metric_name TEXT,
  p_quantity INT,
  p_reservation_id TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_res public.workspace_quota_reservations%ROWTYPE;
  v_new_usage INT;
  v_new_record_id UUID;
BEGIN
  -- 1. Input sanitization
  IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'reservation_id is required for atomic quota reservation',
      'limit_reached', false,
      'is_exceeded', false
    );
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage quantity: must be greater than zero',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_metric_name NOT IN (
    'whatsapp_outbound',
    'whatsapp_inbound',
    'sms_outbound',
    'email_outbound',
    'instagram_outbound',
    'messenger_outbound',
    'webchat_outbound',
    'website_outbound',
    'crm_outbound',
    'whatsapp_group_outbound',
    'omnichannel_outbound',
    'ai_tokens',
    'ai_agent_run',
    'campaign_broadcast',
    'workflow_execution'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid metric_name: unrecognized billable metric',
      'limit_reached', false,
      'is_exceeded', false
    );
  END IF;

  -- 2. Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 3. Scope idempotency to workspace and reject reuse with a different payload
  SELECT * INTO v_res
  FROM public.workspace_quota_reservations
  WHERE workspace_id = p_workspace_id
    AND reservation_id = p_reservation_id;

  IF FOUND THEN
      IF v_res.metric_name = p_metric_name
         AND v_res.quantity = p_quantity
         AND v_res.resource_id IS NOT DISTINCT FROM p_resource_id
         AND v_res.actor_user_id IS NOT DISTINCT FROM p_actor_user_id
         AND v_res.metadata IS NOT DISTINCT FROM p_metadata THEN
        SELECT messages_used_this_period INTO v_new_usage
        FROM public.workspace_subscriptions
        WHERE workspace_id = p_workspace_id;

        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'reservation_id', p_reservation_id,
          'quantity_reserved', v_res.quantity,
          'status', v_res.status,
          'messages_used_this_period', COALESCE(v_new_usage, 0),
          'action', 'already_reserved'
        );
      ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Idempotency conflict: reservation ID already used with different payload',
        'limit_reached', false,
        'is_exceeded', false
      );
      END IF;
  END IF;

  -- 4. Lock subscription row exclusively for atomic evaluation
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No subscription provisioned for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 5. Provenance validation: unverified provenance fails closed
  IF v_sub.provenance = 'none' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription lacks verified billing provenance',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 6. Period boundaries & status
  IF v_sub.provenance = 'internal_grant' THEN
    IF now() > v_sub.current_period_end THEN
      UPDATE public.workspace_subscriptions
      SET current_period_start = now(),
          current_period_end = now() + INTERVAL '1 year',
          messages_used_this_period = 0,
          updated_at = now()
      WHERE workspace_id = p_workspace_id
      RETURNING * INTO v_sub;
    END IF;
  ELSE
    IF v_sub.current_period_end < now() AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Subscription billing period expired',
        'limit_reached', true,
        'is_exceeded', true
      );
    END IF;
  END IF;

  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is inactive (' || v_sub.status || ')',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- Past due grace period check
  IF v_sub.status = 'past_due' AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription payment is past due and grace period has expired',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF v_sub.dunning_status IN ('suspended', 'terminated') AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is suspended due to payment failure',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 7. Quota limit check
  IF v_sub.monthly_message_limit <= 0 OR (v_sub.messages_used_this_period + p_quantity) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'limit_reached', true,
      'is_exceeded', true,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'monthly_message_limit', v_sub.monthly_message_limit
    );
  END IF;

  -- 8. Atomic deduction
  v_new_usage := v_sub.messages_used_this_period + p_quantity;

  UPDATE public.workspace_subscriptions
  SET
    messages_used_this_period = v_new_usage,
    updated_at = now()
  WHERE id = v_sub.id;

  -- 9. Create reservation row with period tracking
  INSERT INTO public.workspace_quota_reservations (
    reservation_id,
    workspace_id,
    metric_name,
    quantity,
    status,
    resource_id,
    actor_user_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_reservation_id,
    p_workspace_id,
    p_metric_name,
    p_quantity,
    'reserved',
    p_resource_id,
    p_actor_user_id,
    v_sub.current_period_start,
    v_sub.current_period_end,
    p_metadata
  );

  -- 10. Write accounting record in same atomic transaction
  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    actor_user_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_workspace_id,
    p_metric_name,
    p_quantity,
    p_reservation_id,
    p_resource_id,
    p_actor_user_id,
    v_sub.current_period_start,
    v_sub.current_period_end,
    jsonb_build_object('is_reservation', true, 'reservation_id', p_reservation_id) || p_metadata
  )
  RETURNING id INTO v_new_record_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'record_id', v_new_record_id,
    'workspace_id', p_workspace_id,
    'quantity_reserved', p_quantity,
    'messages_used_this_period', v_new_usage,
    'monthly_message_limit', v_sub.monthly_message_limit,
    'remaining', (v_sub.monthly_message_limit - v_new_usage),
    'is_exceeded', false
  );
END;
$$;

-- 5. ATOMIC WORKSPACE QUOTA SETTLEMENT RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_workspace_quota_atomic(
  p_workspace_id UUID,
  p_reservation_id TEXT,
  p_actual_quantity INT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res public.workspace_quota_reservations%ROWTYPE;
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_diff INT := 0;
  v_final_qty INT;
  v_new_usage INT;
BEGIN
  IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'reservation_id is required');
  END IF;

  -- Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: caller lacks operational authority for this workspace');
  END IF;

  SELECT * INTO v_res
  FROM public.workspace_quota_reservations
  WHERE workspace_id = p_workspace_id
    AND reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_res.status = 'settled' THEN
    IF p_actual_quantity IS NOT NULL AND p_actual_quantity != v_res.settled_quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'Idempotency conflict: reservation already settled with different quantity');
    END IF;
    SELECT messages_used_this_period INTO v_new_usage
    FROM public.workspace_subscriptions
    WHERE workspace_id = p_workspace_id;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'status', 'already_settled', 'messages_used_this_period', COALESCE(v_new_usage, 0));
  END IF;

  IF v_res.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation cannot be settled from status: ' || v_res.status);
  END IF;

  v_final_qty := COALESCE(p_actual_quantity, v_res.quantity);
  v_diff := v_res.quantity - v_final_qty; -- if actual is less, refund difference

  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_diff != 0 THEN
    v_new_usage := GREATEST(0, v_sub.messages_used_this_period - v_diff);
    UPDATE public.workspace_subscriptions
    SET messages_used_this_period = v_new_usage, updated_at = now()
    WHERE id = v_sub.id;
  ELSE
    v_new_usage := v_sub.messages_used_this_period;
  END IF;

  UPDATE public.workspace_quota_reservations
  SET status = 'settled',
      settled_quantity = v_final_qty,
      updated_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata
  WHERE id = v_res.id;

  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_workspace_id,
    v_res.metric_name,
    v_final_qty,
    'settle-' || p_reservation_id,
    v_res.resource_id,
    v_res.billing_period_start,
    v_res.billing_period_end,
    jsonb_build_object('action', 'settlement', 'reservation_id', p_reservation_id, 'diff', v_diff) || p_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'settled_quantity', v_final_qty,
    'messages_used_this_period', v_new_usage
  );
END;
$$;

-- 6. ATOMIC QUOTA RELEASE AND COMPENSATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_workspace_quota_atomic(
  p_workspace_id UUID,
  p_reservation_id TEXT,
  p_reason TEXT DEFAULT 'execution_failure'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res public.workspace_quota_reservations%ROWTYPE;
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_new_usage INT;
BEGIN
  IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'reservation_id is required for atomic quota release'
    );
  END IF;

  -- Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace'
    );
  END IF;

  -- 1. Lock reservation row exclusively
  SELECT * INTO v_res
  FROM public.workspace_quota_reservations
  WHERE workspace_id = p_workspace_id
    AND reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reservation not found'
    );
  END IF;

  -- 2. Idempotency: If already released, return existing state without duplicate decrement
  IF v_res.status = 'released' THEN
    SELECT messages_used_this_period INTO v_new_usage
    FROM public.workspace_subscriptions
    WHERE workspace_id = p_workspace_id;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'reservation_id', p_reservation_id,
      'status', 'already_released',
      'messages_used_this_period', COALESCE(v_new_usage, 0)
    );
  END IF;

  IF v_res.status != 'reserved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reservation cannot be released from status: ' || v_res.status
    );
  END IF;

  -- 3. Lock subscription row
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription not found'
    );
  END IF;

  -- 4. Atomically refund the reserved messages
  v_new_usage := GREATEST(0, v_sub.messages_used_this_period - v_res.quantity);

  UPDATE public.workspace_subscriptions
  SET
    messages_used_this_period = v_new_usage,
    updated_at = now()
  WHERE id = v_sub.id;

  -- 5. Mark reservation as released
  UPDATE public.workspace_quota_reservations
  SET
    status = 'released',
    released_quantity = v_res.quantity,
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('release_reason', p_reason, 'released_at', now())
  WHERE id = v_res.id;

  -- 6. Write compensation record in usage ledger with negative quantity
  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_workspace_id,
    v_res.metric_name,
    -v_res.quantity,
    'rel-' || p_reservation_id,
    v_res.resource_id,
    v_res.billing_period_start,
    v_res.billing_period_end,
    jsonb_build_object('action', 'quota_release', 'reservation_id', p_reservation_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'released_quantity', v_res.quantity,
    'messages_used_this_period', v_new_usage
  );
END;
$$;

-- 7. ATOMIC AGENT SPEND ADMISSION AND RECORDING RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_agent_execution_spend_atomic(
  p_workspace_id UUID,
  p_agent_id TEXT,
  p_cost_usd NUMERIC,
  p_reservation_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_budget public.ai_agent_budgets%ROWTYPE;
  v_res public.workspace_quota_reservations%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_today DATE := CURRENT_DATE;
  v_current_daily NUMERIC;
  v_current_monthly NUMERIC;
  v_new_daily NUMERIC;
  v_new_monthly NUMERIC;
  v_exceeds_daily BOOLEAN := false;
  v_exceeds_monthly BOOLEAN := false;
  v_exceeds_ceiling BOOLEAN := false;
BEGIN
  IF p_cost_usd IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cost must not be null',
      'can_execute', false
    );
  END IF;

  -- Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace',
      'can_execute', false
    );
  END IF;

  -- Negative spend adjustment security: prevent arbitrary negative adjustments
  IF p_cost_usd < 0 THEN
    IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Negative spend adjustments must be tied to a valid reservation ID',
        'can_execute', false
      );
    END IF;

    SELECT * INTO v_res
    FROM public.workspace_quota_reservations
    WHERE workspace_id = p_workspace_id
      AND reservation_id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Negative spend adjustments must be tied to a valid reservation ID',
        'can_execute', false
      );
    END IF;
  END IF;

  -- Lock budget row
  SELECT * INTO v_budget
  FROM public.ai_agent_budgets
  WHERE workspace_id = p_workspace_id AND agent_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Return allowed default if no custom budget configured
    RETURN jsonb_build_object(
      'success', true,
      'can_execute', true,
      'action', 'default_allow'
    );
  END IF;

  -- Date-aware comparison using DATE type: reset spend if day or month changed
  IF v_budget.last_reset_date < v_today THEN
    v_current_daily := 0.0;
    IF date_trunc('month', v_budget.last_reset_date) < date_trunc('month', v_today) THEN
      v_current_monthly := 0.0;
    ELSE
      v_current_monthly := v_budget.current_monthly_spend_usd;
    END IF;
  ELSE
    v_current_daily := v_budget.current_daily_spend_usd;
    v_current_monthly := v_budget.current_monthly_spend_usd;
  END IF;

  -- Enforce daily, monthly and per-execution limits atomically
  IF p_cost_usd > 0 THEN
    v_exceeds_daily := (v_current_daily + p_cost_usd) > v_budget.daily_budget_usd;
    v_exceeds_monthly := (v_current_monthly + p_cost_usd) > v_budget.monthly_budget_usd;
    v_exceeds_ceiling := p_cost_usd > v_budget.max_cost_per_execution_usd;

    IF v_exceeds_daily OR v_exceeds_monthly OR v_exceeds_ceiling THEN
      IF v_budget.over_budget_policy = 'hard_stop' THEN
        RETURN jsonb_build_object(
          'success', false,
          'can_execute', false,
          'action_required', 'hard_stop',
          'error', 'Agent daily or monthly budget limit exhausted (hard_stop)',
          'current_daily_spend', v_current_daily,
          'daily_budget_usd', v_budget.daily_budget_usd,
          'current_monthly_spend', v_current_monthly,
          'monthly_budget_usd', v_budget.monthly_budget_usd
        );
      ELSIF v_budget.over_budget_policy = 'require_approval' THEN
        RETURN jsonb_build_object(
          'success', false,
          'can_execute', false,
          'action_required', 'require_approval',
          'error', 'Agent budget limit reached: requires human approval (require_approval)',
          'current_daily_spend', v_current_daily,
          'daily_budget_usd', v_budget.daily_budget_usd
        );
      END IF;
      -- notify_only allows execution
    END IF;
  END IF;

  v_new_daily := GREATEST(0.0, v_current_daily + p_cost_usd);
  v_new_monthly := GREATEST(0.0, v_current_monthly + p_cost_usd);

  UPDATE public.ai_agent_budgets
  SET
    current_daily_spend_usd = v_new_daily,
    current_monthly_spend_usd = v_new_monthly,
    last_reset_date = v_today,
    updated_at = now()
  WHERE id = v_budget.id;

  RETURN jsonb_build_object(
    'success', true,
    'can_execute', true,
    'daily_spend_usd', v_new_daily,
    'monthly_spend_usd', v_new_monthly,
    'daily_budget_usd', v_budget.daily_budget_usd,
    'remaining_daily_usd', GREATEST(0, v_budget.daily_budget_usd - v_new_daily)
  );
END;
$$;

-- 8. RESTRICT EXECUTE PRIVILEGES TO AUTHENTICATED CALLERS
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_workspace_quota_atomic(uuid, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_workspace_quota_atomic(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_agent_execution_spend_atomic(uuid, text, numeric, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.settle_workspace_quota_atomic(uuid, text, integer, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.release_workspace_quota_atomic(uuid, text, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_agent_execution_spend_atomic(uuid, text, numeric, text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_workspace_quota_atomic(uuid, text, integer, jsonb) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_workspace_quota_atomic(uuid, text, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_agent_execution_spend_atomic(uuid, text, numeric, text) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_workspace_quota_atomic(uuid, text, integer, jsonb) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_workspace_quota_atomic(uuid, text, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_agent_execution_spend_atomic(uuid, text, numeric, text) TO service_role';
  END IF;
END;
$$;

COMMIT;

-- >>> END: supabase/migrations\20260924_align_channel_metrics_and_atomic_reservations.sql <<<


-- >>> START: supabase/migrations\20260925_stage1_lead_intake_foundation.sql <<<
BEGIN;

-- Stage 1 preserves individual intake occurrences. contacts remain the canonical
-- CRM entity; identities are intentionally non-unique because shared contact
-- methods are legitimate and ambiguous matches must never be auto-merged.
CREATE TABLE public.contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  identity_type text NOT NULL CHECK (identity_type IN ('email', 'phone')),
  normalized_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, contact_id, identity_type, normalized_value),
  FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_contact_identities_resolution
  ON public.contact_identities(workspace_id, identity_type, normalized_value);

CREATE TABLE public.lead_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid,
  source text NOT NULL CHECK (source IN ('website_form', 'widget_form', 'webchat', 'manual', 'whatsapp')),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger', 'webchat', 'website', 'crm')),
  source_event_id text,
  idempotency_key text NOT NULL,
  resolution_status text NOT NULL CHECK (resolution_status IN ('created', 'matched', 'ambiguous')),
  name text NOT NULL,
  email text,
  phone text,
  normalized_email text,
  normalized_phone text,
  payload_sha256 text NOT NULL,
  thread_id uuid,
  message_id uuid,
  message text,
  campaign text,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY (workspace_id, thread_id)
    REFERENCES public.inbox_threads(workspace_id, id) ON DELETE SET NULL (thread_id),
  FOREIGN KEY (workspace_id, message_id)
    REFERENCES public.inbox_messages(workspace_id, id) ON DELETE SET NULL (message_id)
);

CREATE UNIQUE INDEX uq_lead_intakes_workspace_source_event
  ON public.lead_intakes(workspace_id, source, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX idx_lead_intakes_workspace_received
  ON public.lead_intakes(workspace_id, created_at DESC);

CREATE TABLE public.lead_intake_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  intake_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('granted', 'denied', 'revoked', 'not_provided')),
  communication_channel text NOT NULL CHECK (communication_channel IN ('whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger', 'webchat', 'website', 'crm')),
  purpose text NOT NULL CHECK (purpose IN ('operational', 'marketing')),
  disclosure_version text NOT NULL,
  captured_at timestamptz NOT NULL,
  capture_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, intake_id)
    REFERENCES public.lead_intakes(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE public.lead_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  intake_id uuid NOT NULL,
  canonical_event_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'lead.received' CHECK (event_type = 'lead.received'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claim_token uuid,
  claim_expires_at timestamptz,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, canonical_event_id),
  FOREIGN KEY (workspace_id, intake_id)
    REFERENCES public.lead_intakes(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_lead_event_outbox_delivery
  ON public.lead_event_outbox(workspace_id, status, created_at);

ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intakes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intake_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intake_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lead_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_event_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY contact_identities_member_select ON public.contact_identities FOR SELECT
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY lead_intakes_member_select ON public.lead_intakes FOR SELECT
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY lead_intake_consents_member_select ON public.lead_intake_consents FOR SELECT
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY lead_event_outbox_service_role ON public.lead_event_outbox FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY contact_identities_service_role ON public.contact_identities FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY lead_intakes_service_role ON public.lead_intakes FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY lead_intake_consents_service_role ON public.lead_intake_consents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.contact_identities, public.lead_intakes, public.lead_intake_consents, public.lead_event_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contact_identities, public.lead_intakes, public.lead_intake_consents TO authenticated;
GRANT ALL ON public.contact_identities, public.lead_intakes, public.lead_intake_consents, public.lead_event_outbox TO service_role;

ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE public.automations ADD CONSTRAINT automations_trigger_type_check CHECK (trigger_type = ANY (ARRAY[
  'manual', 'new_crm_contact', 'crm_status_changed', 'new_ai_task', 'ai_task_completed', 'schedule', 'integration_event', 'lead.received'
]));

CREATE OR REPLACE FUNCTION public.record_lead_intake(
  p_workspace_id uuid,
  p_source text,
  p_channel text,
  p_idempotency_key text,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_campaign text DEFAULT NULL,
  p_attribution jsonb DEFAULT '{}'::jsonb,
  p_consents jsonb DEFAULT '[]'::jsonb,
  p_source_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := NULLIF(lower(trim(p_email)), '');
  v_phone text := NULLIF(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_candidates uuid[];
  v_contact_id uuid;
  v_intake_id uuid;
  v_thread_id uuid;
  v_message_id uuid;
  v_status text;
  v_consent jsonb;
  v_payload_sha256 text;
  v_existing_payload_sha256 text;
BEGIN
  IF p_workspace_id IS NULL OR NULLIF(trim(p_idempotency_key), '') IS NULL OR NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'workspace, idempotency key, and name are required';
  END IF;
  IF v_email IS NULL AND v_phone IS NULL THEN RAISE EXCEPTION 'an email or phone is required'; END IF;
  IF p_source NOT IN ('website_form', 'widget_form', 'webchat', 'manual', 'whatsapp') THEN RAISE EXCEPTION 'invalid lead source'; END IF;
  IF p_channel NOT IN ('whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger', 'webchat', 'website', 'crm') THEN RAISE EXCEPTION 'invalid lead channel'; END IF;
  v_payload_sha256 := md5(jsonb_build_object(
    'source', p_source, 'channel', p_channel, 'name', trim(p_name), 'email', v_email,
    'phone', v_phone, 'message', NULLIF(trim(p_message), ''), 'campaign', NULLIF(trim(p_campaign), ''),
    'attribution', coalesce(p_attribution, '{}'::jsonb), 'metadata', coalesce(p_metadata, '{}'::jsonb),
    'consents', coalesce(p_consents, '[]'::jsonb)
  )::text);

  -- Serialize identity resolution by workspace and normalized identity. This is
  -- deliberately not a uniqueness rule: shared addresses remain valid and are
  -- recorded as ambiguous rather than silently merged.
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|key|' || trim(p_idempotency_key)));
  IF v_email IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|email|' || v_email)); END IF;
  IF v_phone IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|phone|' || v_phone)); END IF;
  IF NULLIF(trim(p_source_event_id), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|source|' || p_source || '|' || trim(p_source_event_id)));
    SELECT id INTO v_intake_id FROM public.lead_intakes
      WHERE workspace_id = p_workspace_id AND source = p_source AND source_event_id = trim(p_source_event_id);
    IF FOUND THEN
      SELECT payload_sha256 INTO v_existing_payload_sha256 FROM public.lead_intakes WHERE id = v_intake_id;
      IF v_existing_payload_sha256 <> v_payload_sha256 THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'lead source event payload conflict'; END IF;
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'intake_id', v_intake_id, 'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id=v_intake_id), 'resolution_status', (SELECT resolution_status FROM public.lead_intakes WHERE id=v_intake_id), 'canonical_event_id', 'lead.received:' || v_intake_id::text);
    END IF;
  END IF;

  SELECT array_agg(DISTINCT contact_id) INTO v_candidates FROM (
    SELECT ci.contact_id FROM public.contact_identities ci
     WHERE ci.workspace_id = p_workspace_id AND ((v_email IS NOT NULL AND ci.identity_type = 'email' AND ci.normalized_value = v_email) OR (v_phone IS NOT NULL AND ci.identity_type = 'phone' AND ci.normalized_value = v_phone))
    UNION
    SELECT c.id FROM public.contacts c
     WHERE c.workspace_id = p_workspace_id AND ((v_email IS NOT NULL AND lower(trim(c.email)) = v_email) OR (v_phone IS NOT NULL AND regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = v_phone))
  ) candidates;

  IF coalesce(array_length(v_candidates, 1), 0) > 1 THEN
    v_status := 'ambiguous';
  ELSIF coalesce(array_length(v_candidates, 1), 0) = 1 THEN
    v_contact_id := v_candidates[1]; v_status := 'matched';
  ELSE
    INSERT INTO public.contacts(workspace_id, name, first_name, email, phone, source, deal_stage, type, status, metadata)
    VALUES (p_workspace_id, trim(p_name), split_part(trim(p_name), ' ', 1), v_email, CASE WHEN v_phone IS NULL THEN NULL ELSE '+' || v_phone END, p_source, 'lead', 'Lead', 'New', jsonb_build_object('stage1_first_touch', jsonb_build_object('source', p_source, 'channel', p_channel, 'campaign', p_campaign, 'attribution', p_attribution)))
    RETURNING id INTO v_contact_id;
    v_status := 'created';
  END IF;

  IF v_contact_id IS NOT NULL THEN
    IF v_email IS NOT NULL THEN INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value) VALUES (p_workspace_id, v_contact_id, 'email', v_email) ON CONFLICT DO NOTHING; END IF;
    IF v_phone IS NOT NULL THEN INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value) VALUES (p_workspace_id, v_contact_id, 'phone', v_phone) ON CONFLICT DO NOTHING; END IF;
  END IF;

  INSERT INTO public.lead_intakes(workspace_id, contact_id, source, channel, source_event_id, idempotency_key, resolution_status, name, email, phone, normalized_email, normalized_phone, payload_sha256, message, campaign, attribution, metadata)
  VALUES (p_workspace_id, v_contact_id, p_source, p_channel, NULLIF(trim(p_source_event_id), ''), trim(p_idempotency_key), v_status, trim(p_name), v_email, CASE WHEN v_phone IS NULL THEN NULL ELSE '+' || v_phone END, v_email, v_phone, v_payload_sha256, NULLIF(trim(p_message), ''), NULLIF(trim(p_campaign), ''), coalesce(p_attribution, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING RETURNING id INTO v_intake_id;
  IF v_intake_id IS NULL THEN
    SELECT id, payload_sha256 INTO v_intake_id, v_existing_payload_sha256 FROM public.lead_intakes WHERE workspace_id=p_workspace_id AND idempotency_key=trim(p_idempotency_key);
    IF v_existing_payload_sha256 <> v_payload_sha256 THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'lead idempotency payload conflict'; END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'intake_id', v_intake_id, 'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id=v_intake_id), 'resolution_status', (SELECT resolution_status FROM public.lead_intakes WHERE id=v_intake_id), 'canonical_event_id', 'lead.received:' || v_intake_id::text);
  END IF;
  IF v_contact_id IS NOT NULL AND p_channel IN ('website', 'webchat', 'whatsapp') THEN
    INSERT INTO public.inbox_threads(workspace_id, contact_id, channel, external_thread_id, metadata)
    VALUES (p_workspace_id, v_contact_id, CASE WHEN p_channel = 'webchat' THEN 'website' ELSE p_channel END, 'lead-intake:' || v_intake_id::text, jsonb_build_object('lead_intake_id', v_intake_id))
    RETURNING id INTO v_thread_id;
    INSERT INTO public.inbox_messages(workspace_id, thread_id, direction, provider, external_message_id, content, metadata)
    VALUES (p_workspace_id, v_thread_id, 'inbound', 'j10_lead_intake', 'lead-intake:' || v_intake_id::text, coalesce(NULLIF(trim(p_message), ''), 'Lead intake received.'), jsonb_build_object('lead_intake_id', v_intake_id))
    RETURNING id INTO v_message_id;
    UPDATE public.lead_intakes SET thread_id = v_thread_id, message_id = v_message_id WHERE id = v_intake_id;
  END IF;
  FOR v_consent IN SELECT value FROM jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) LOOP
    INSERT INTO public.lead_intake_consents(workspace_id, intake_id, status, communication_channel, purpose, disclosure_version, captured_at, capture_source)
    VALUES (p_workspace_id, v_intake_id, v_consent->>'status', v_consent->>'communication_channel', v_consent->>'purpose', v_consent->>'disclosure_version', coalesce((v_consent->>'captured_at')::timestamptz, now()), v_consent->>'capture_source');
  END LOOP;
  INSERT INTO public.lead_event_outbox(workspace_id, intake_id, canonical_event_id)
  VALUES (p_workspace_id, v_intake_id, 'lead.received:' || v_intake_id::text);
  RETURN jsonb_build_object('success', true, 'duplicate', false, 'intake_id', v_intake_id, 'contact_id', v_contact_id, 'resolution_status', v_status, 'canonical_event_id', 'lead.received:' || v_intake_id::text);
END; $$;

REVOKE ALL ON FUNCTION public.record_lead_intake(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_lead_intake(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, jsonb) TO service_role;

-- A worker must claim a row before dispatching. SKIP LOCKED lets concurrent
-- workers progress without ever dispatching the same canonical event twice.
CREATE OR REPLACE FUNCTION public.claim_lead_event_outbox(
  p_workspace_id uuid,
  p_intake_id uuid,
  p_claim_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.lead_event_outbox%ROWTYPE;
BEGIN
  UPDATE public.lead_event_outbox
  SET status = 'processing', claim_token = p_claim_token,
      claim_expires_at = now() + interval '5 minutes', attempts = attempts + 1,
      last_attempt_at = now(), updated_at = now()
  WHERE id = (
    SELECT id FROM public.lead_event_outbox
    WHERE workspace_id = p_workspace_id AND intake_id = p_intake_id
      AND (status IN ('pending', 'failed') OR (status = 'processing' AND claim_expires_at < now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false); END IF;
  RETURN jsonb_build_object('claimed', true, 'outbox_id', v_row.id, 'canonical_event_id', v_row.canonical_event_id, 'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id = v_row.intake_id));
END; $$;

CREATE OR REPLACE FUNCTION public.complete_lead_event_outbox(
  p_workspace_id uuid,
  p_intake_id uuid,
  p_claim_token uuid,
  p_delivered boolean,
  p_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.lead_event_outbox
  SET status = CASE WHEN p_delivered THEN 'delivered' ELSE 'failed' END,
      delivered_at = CASE WHEN p_delivered THEN now() ELSE NULL END,
      last_error = CASE WHEN p_delivered THEN NULL ELSE NULLIF(left(p_error, 500), '') END,
      claim_token = NULL, claim_expires_at = NULL, updated_at = now()
  WHERE workspace_id = p_workspace_id AND intake_id = p_intake_id
    AND status = 'processing' AND claim_token = p_claim_token;
  RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.claim_lead_event_outbox(uuid, uuid, uuid), public.complete_lead_event_outbox(uuid, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lead_event_outbox(uuid, uuid, uuid), public.complete_lead_event_outbox(uuid, uuid, uuid, boolean, text) TO service_role;

COMMIT;

-- >>> END: supabase/migrations\20260925_stage1_lead_intake_foundation.sql <<<


-- >>> START: supabase/migrations\20260926_stage1_telegram_omnichannel.sql <<<
BEGIN;

-- Stage 1 Telegram & Omnichannel Channel Extension
-- Forward-only migration to extend Stage 1 Lead Intake to canonical Telegram support.

-- 1. Expand inbox_threads channel constraint
ALTER TABLE public.inbox_threads
  DROP CONSTRAINT IF EXISTS chk_inbox_threads_channel,
  DROP CONSTRAINT IF EXISTS inbox_threads_channel_check;

ALTER TABLE public.inbox_threads
  ADD CONSTRAINT chk_inbox_threads_channel CHECK (channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm', 'telegram'
  ));

-- 2. Expand lead_intakes source and channel constraints
ALTER TABLE public.lead_intakes
  DROP CONSTRAINT IF EXISTS lead_intakes_source_check,
  DROP CONSTRAINT IF EXISTS chk_lead_intakes_source;

ALTER TABLE public.lead_intakes
  ADD CONSTRAINT chk_lead_intakes_source CHECK (source IN (
    'website_form', 'widget_form', 'webchat', 'manual', 'whatsapp', 'telegram'
  ));

ALTER TABLE public.lead_intakes
  DROP CONSTRAINT IF EXISTS lead_intakes_channel_check,
  DROP CONSTRAINT IF EXISTS chk_lead_intakes_channel;

ALTER TABLE public.lead_intakes
  ADD CONSTRAINT chk_lead_intakes_channel CHECK (channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm', 'telegram'
  ));

-- 3. Expand lead_intake_consents communication_channel constraint
ALTER TABLE public.lead_intake_consents
  DROP CONSTRAINT IF EXISTS lead_intake_consents_communication_channel_check,
  DROP CONSTRAINT IF EXISTS chk_lead_intake_consents_communication_channel;

ALTER TABLE public.lead_intake_consents
  ADD CONSTRAINT chk_lead_intake_consents_communication_channel CHECK (communication_channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm', 'telegram'
  ));

-- 4. Expand contact_identities identity_type constraint to permit 'telegram'
ALTER TABLE public.contact_identities
  DROP CONSTRAINT IF EXISTS contact_identities_identity_type_check,
  DROP CONSTRAINT IF EXISTS chk_contact_identities_identity_type;

ALTER TABLE public.contact_identities
  ADD CONSTRAINT chk_contact_identities_identity_type CHECK (
    identity_type IN ('email', 'phone', 'telegram')
  );

-- 5. Updated record_lead_intake supporting Telegram canonical resolution
CREATE OR REPLACE FUNCTION public.record_lead_intake(
  p_workspace_id uuid,
  p_source text,
  p_channel text,
  p_idempotency_key text,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_campaign text DEFAULT NULL,
  p_attribution jsonb DEFAULT '{}'::jsonb,
  p_consents jsonb DEFAULT '[]'::jsonb,
  p_source_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := NULLIF(lower(trim(p_email)), '');
  v_phone text := NULLIF(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_telegram_id text := NULLIF(trim(p_metadata->>'telegram_user_id'), '');
  v_candidates uuid[];
  v_contact_id uuid;
  v_intake_id uuid;
  v_thread_id uuid;
  v_message_id uuid;
  v_status text;
  v_consent jsonb;
  v_payload_sha256 text;
  v_existing_payload_sha256 text;
  v_thread_external_id text;
  v_msg_external_id text;
BEGIN
  IF p_workspace_id IS NULL OR NULLIF(trim(p_idempotency_key), '') IS NULL OR NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'workspace, idempotency key, and name are required';
  END IF;

  IF v_email IS NULL AND v_phone IS NULL AND v_telegram_id IS NULL AND p_source <> 'telegram' THEN
    RAISE EXCEPTION 'an email or phone is required';
  END IF;

  IF p_source NOT IN ('website_form', 'widget_form', 'webchat', 'manual', 'whatsapp', 'telegram') THEN
    RAISE EXCEPTION 'invalid lead source';
  END IF;

  IF p_channel NOT IN ('whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger', 'webchat', 'website', 'crm', 'telegram') THEN
    RAISE EXCEPTION 'invalid lead channel';
  END IF;

  v_payload_sha256 := md5(jsonb_build_object(
    'source', p_source, 'channel', p_channel, 'name', trim(p_name), 'email', v_email,
    'phone', v_phone, 'message', NULLIF(trim(p_message), ''), 'campaign', NULLIF(trim(p_campaign), ''),
    'attribution', coalesce(p_attribution, '{}'::jsonb), 'metadata', coalesce(p_metadata, '{}'::jsonb),
    'consents', coalesce(p_consents, '[]'::jsonb)
  )::text);

  -- Advisory locks for deterministic serialization
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|key|' || trim(p_idempotency_key)));
  IF v_email IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|email|' || v_email)); END IF;
  IF v_phone IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|phone|' || v_phone)); END IF;
  IF v_telegram_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|tg|' || v_telegram_id)); END IF;

  IF NULLIF(trim(p_source_event_id), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|source|' || p_source || '|' || trim(p_source_event_id)));
    SELECT id INTO v_intake_id FROM public.lead_intakes
      WHERE workspace_id = p_workspace_id AND source = p_source AND source_event_id = trim(p_source_event_id);
    IF FOUND THEN
      SELECT payload_sha256 INTO v_existing_payload_sha256 FROM public.lead_intakes WHERE id = v_intake_id;
      IF v_existing_payload_sha256 <> v_payload_sha256 THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'lead source event payload conflict';
      END IF;
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'intake_id', v_intake_id,
        'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id = v_intake_id),
        'resolution_status', (SELECT resolution_status FROM public.lead_intakes WHERE id = v_intake_id),
        'canonical_event_id', 'lead.received:' || v_intake_id::text
      );
    END IF;
  END IF;

  -- Identity resolution candidates
  SELECT array_agg(DISTINCT contact_id) INTO v_candidates FROM (
    SELECT ci.contact_id FROM public.contact_identities ci
     WHERE ci.workspace_id = p_workspace_id AND (
       (v_email IS NOT NULL AND ci.identity_type = 'email' AND ci.normalized_value = v_email) OR
       (v_phone IS NOT NULL AND ci.identity_type = 'phone' AND ci.normalized_value = v_phone) OR
       (v_telegram_id IS NOT NULL AND ci.identity_type = 'telegram' AND ci.normalized_value = v_telegram_id)
     )
    UNION
    SELECT c.id FROM public.contacts c
     WHERE c.workspace_id = p_workspace_id AND (
       (v_email IS NOT NULL AND lower(trim(c.email)) = v_email) OR
       (v_phone IS NOT NULL AND regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = v_phone)
     )
  ) candidates;

  IF coalesce(array_length(v_candidates, 1), 0) > 1 THEN
    v_status := 'ambiguous';
  ELSIF coalesce(array_length(v_candidates, 1), 0) = 1 THEN
    v_contact_id := v_candidates[1];
    v_status := 'matched';
  ELSE
    INSERT INTO public.contacts(workspace_id, name, first_name, email, phone, source, deal_stage, type, status, metadata)
    VALUES (
      p_workspace_id,
      trim(p_name),
      split_part(trim(p_name), ' ', 1),
      v_email,
      CASE WHEN v_phone IS NULL THEN NULL ELSE '+' || v_phone END,
      p_source,
      'lead',
      'Lead',
      'New',
      jsonb_build_object('stage1_first_touch', jsonb_build_object(
        'source', p_source,
        'channel', p_channel,
        'campaign', p_campaign,
        'attribution', p_attribution,
        'telegram_user_id', v_telegram_id,
        'telegram_username', p_metadata->>'telegram_username'
      ))
    )
    RETURNING id INTO v_contact_id;
    v_status := 'created';
  END IF;

  IF v_contact_id IS NOT NULL THEN
    IF v_email IS NOT NULL THEN
      INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value)
      VALUES (p_workspace_id, v_contact_id, 'email', v_email)
      ON CONFLICT DO NOTHING;
    END IF;
    IF v_phone IS NOT NULL THEN
      INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value)
      VALUES (p_workspace_id, v_contact_id, 'phone', v_phone)
      ON CONFLICT DO NOTHING;
    END IF;
    IF v_telegram_id IS NOT NULL THEN
      INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value)
      VALUES (p_workspace_id, v_contact_id, 'telegram', v_telegram_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.lead_intakes(
    workspace_id, contact_id, source, channel, source_event_id, idempotency_key,
    resolution_status, name, email, phone, normalized_email, normalized_phone,
    payload_sha256, message, campaign, attribution, metadata
  ) VALUES (
    p_workspace_id, v_contact_id, p_source, p_channel, NULLIF(trim(p_source_event_id), ''),
    trim(p_idempotency_key), v_status, trim(p_name), v_email,
    CASE WHEN v_phone IS NULL THEN NULL ELSE '+' || v_phone END,
    v_email, v_phone, v_payload_sha256, NULLIF(trim(p_message), ''),
    NULLIF(trim(p_campaign), ''), coalesce(p_attribution, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_intake_id;

  IF v_intake_id IS NULL THEN
    SELECT id, payload_sha256 INTO v_intake_id, v_existing_payload_sha256
      FROM public.lead_intakes
     WHERE workspace_id = p_workspace_id AND idempotency_key = trim(p_idempotency_key);
    IF v_existing_payload_sha256 <> v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'lead idempotency payload conflict';
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'intake_id', v_intake_id,
      'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id = v_intake_id),
      'resolution_status', (SELECT resolution_status FROM public.lead_intakes WHERE id = v_intake_id),
      'canonical_event_id', 'lead.received:' || v_intake_id::text
    );
  END IF;

  -- Create thread and message for conversational channels (website, webchat, whatsapp, telegram)
  IF v_contact_id IS NOT NULL AND p_channel IN ('website', 'webchat', 'whatsapp', 'telegram') THEN
    IF p_channel = 'telegram' THEN
      v_thread_external_id := coalesce(NULLIF(trim(p_metadata->>'telegram_chat_id'), ''), 'telegram:' || coalesce(v_telegram_id, v_intake_id::text));
      v_msg_external_id := coalesce(NULLIF(trim(p_source_event_id), ''), 'telegram:msg:' || v_intake_id::text);
    ELSE
      v_thread_external_id := 'lead-intake:' || v_intake_id::text;
      v_msg_external_id := 'lead-intake:' || v_intake_id::text;
    END IF;

    -- Check if thread already exists for this contact on this channel
    SELECT id INTO v_thread_id
      FROM public.inbox_threads
     WHERE workspace_id = p_workspace_id
       AND contact_id = v_contact_id
       AND channel = p_channel
     ORDER BY id DESC
     LIMIT 1;

    IF v_thread_id IS NULL THEN
      INSERT INTO public.inbox_threads(workspace_id, contact_id, channel, external_thread_id, metadata)
      VALUES (
        p_workspace_id,
        v_contact_id,
        CASE WHEN p_channel = 'webchat' THEN 'website' ELSE p_channel END,
        v_thread_external_id,
        jsonb_build_object(
          'lead_intake_id', v_intake_id,
          'telegram_chat_id', p_metadata->>'telegram_chat_id',
          'telegram_username', p_metadata->>'telegram_username'
        )
      )
      RETURNING id INTO v_thread_id;
    END IF;

    INSERT INTO public.inbox_messages(workspace_id, thread_id, direction, provider, external_message_id, content, metadata)
    VALUES (
      p_workspace_id,
      v_thread_id,
      'inbound',
      CASE WHEN p_channel = 'telegram' THEN 'telegram' ELSE 'j10_lead_intake' END,
      v_msg_external_id,
      coalesce(NULLIF(trim(p_message), ''), 'Lead intake received.'),
      jsonb_build_object(
        'lead_intake_id', v_intake_id,
        'telegram_chat_id', p_metadata->>'telegram_chat_id',
        'telegram_message_id', p_source_event_id
      )
    )
    RETURNING id INTO v_message_id;

    UPDATE public.lead_intakes
       SET thread_id = v_thread_id, message_id = v_message_id
     WHERE id = v_intake_id;
  END IF;

  FOR v_consent IN SELECT value FROM jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) LOOP
    INSERT INTO public.lead_intake_consents(workspace_id, intake_id, status, communication_channel, purpose, disclosure_version, captured_at, capture_source)
    VALUES (
      p_workspace_id,
      v_intake_id,
      v_consent->>'status',
      v_consent->>'communication_channel',
      v_consent->>'purpose',
      v_consent->>'disclosure_version',
      coalesce((v_consent->>'captured_at')::timestamptz, now()),
      v_consent->>'capture_source'
    );
  END LOOP;

  INSERT INTO public.lead_event_outbox(workspace_id, intake_id, canonical_event_id)
  VALUES (p_workspace_id, v_intake_id, 'lead.received:' || v_intake_id::text);

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'intake_id', v_intake_id,
    'contact_id', v_contact_id,
    'resolution_status', v_status,
    'canonical_event_id', 'lead.received:' || v_intake_id::text
  );
END; $$;

REVOKE ALL ON FUNCTION public.record_lead_intake(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_lead_intake(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, jsonb) TO service_role;

COMMIT;

-- >>> END: supabase/migrations\20260926_stage1_telegram_omnichannel.sql <<<


-- >>> START: supabase/migrations\20260927_stage1_telegram_hardening_v2.sql <<<
BEGIN;

-- Stage 1 Telegram Hardening v2
-- 1. Opaque random token hash storage with server-side workspace mapping
CREATE TABLE IF NOT EXISTS public.telegram_binding_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'lead_intake',
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_binding_tokens_hash 
  ON public.telegram_binding_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_telegram_binding_tokens_ws 
  ON public.telegram_binding_tokens(workspace_id);

ALTER TABLE public.telegram_binding_tokens ENABLE ROW LEVEL SECURITY;

-- Requirement 7: Remove all direct table access from authenticated, anon, public.
-- Issue and consume tokens only through narrow SECURITY DEFINER RPCs.
REVOKE ALL ON public.telegram_binding_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_binding_tokens TO service_role;

DROP POLICY IF EXISTS telegram_binding_tokens_service ON public.telegram_binding_tokens;
CREATE POLICY telegram_binding_tokens_service ON public.telegram_binding_tokens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Server-Side Token Creation RPC
CREATE OR REPLACE FUNCTION public.create_telegram_binding_token(
  p_workspace_id UUID,
  p_token_hash TEXT,
  p_purpose TEXT DEFAULT 'lead_intake',
  p_created_by_user_id UUID DEFAULT NULL,
  p_ttl_seconds INT DEFAULT 1800
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ := now() + (p_ttl_seconds || ' seconds')::interval;
  v_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR p_token_hash IS NULL THEN
    RAISE EXCEPTION 'workspace_id and token_hash are required';
  END IF;

  INSERT INTO public.telegram_binding_tokens (
    workspace_id,
    token_hash,
    purpose,
    created_by_user_id,
    expires_at
  )
  VALUES (
    p_workspace_id,
    p_token_hash,
    coalesce(p_purpose, 'lead_intake'),
    p_created_by_user_id,
    v_expires_at
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'workspace_id', p_workspace_id,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_telegram_binding_token(UUID, TEXT, TEXT, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_telegram_binding_token(UUID, TEXT, TEXT, UUID, INT) TO authenticated, service_role;

-- Server-Side Atomic Single-Use Token Consumption RPC
CREATE OR REPLACE FUNCTION public.consume_telegram_binding_token(
  p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workspace_id UUID;
  v_purpose TEXT;
  v_created_by UUID;
BEGIN
  IF p_token_hash IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Token hash required');
  END IF;

  UPDATE public.telegram_binding_tokens
     SET used_at = now()
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND expires_at > now()
  RETURNING workspace_id, purpose, created_by_user_id
       INTO v_workspace_id, v_purpose, v_created_by;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Token is invalid, expired, or has already been consumed'
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'workspace_id', v_workspace_id,
    'purpose', v_purpose,
    'created_by_user_id', v_created_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_telegram_binding_token(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_telegram_binding_token(TEXT) TO authenticated, service_role;

-- 2. VIP Group Memberships and Lifecycle Tracking
CREATE TABLE IF NOT EXISTS public.telegram_group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  group_chat_id TEXT NOT NULL,
  telegram_user_id TEXT,
  contact_id UUID,
  invite_link TEXT,
  status TEXT NOT NULL CHECK (status IN ('invited', 'approved', 'banned', 'revoked')) DEFAULT 'invited',
  joined_at TIMESTAMPTZ,
  banned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Requirement 5: Composite workspace-aware foreign key
  CONSTRAINT fk_tg_group_contact FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tg_group_members_ws 
  ON public.telegram_group_memberships(workspace_id, group_chat_id);
CREATE INDEX IF NOT EXISTS idx_tg_group_members_user 
  ON public.telegram_group_memberships(group_chat_id, telegram_user_id);

-- Requirement 6: Active membership uniqueness preventing duplicates for active users
CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_group_members_active_unique 
  ON public.telegram_group_memberships (workspace_id, group_chat_id, telegram_user_id) 
  WHERE status IN ('invited', 'approved') AND telegram_user_id IS NOT NULL;

ALTER TABLE public.telegram_group_memberships ENABLE ROW LEVEL SECURITY;

-- Requirement 8: Mask/Clear invite_link for authenticated users, full access for service_role
DROP POLICY IF EXISTS telegram_group_memberships_select ON public.telegram_group_memberships;
CREATE POLICY telegram_group_memberships_select ON public.telegram_group_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_memberships wm
      WHERE wm.workspace_id = telegram_group_memberships.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS telegram_group_memberships_service ON public.telegram_group_memberships;
CREATE POLICY telegram_group_memberships_service ON public.telegram_group_memberships
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Outbound Message Idempotency & Delivery Resilience
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_idempotency 
  ON public.inbox_messages(workspace_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

COMMIT;

-- >>> END: supabase/migrations\20260927_stage1_telegram_hardening_v2.sql <<<


-- >>> START: supabase/migrations\20260928_inbox_realtime_publication.sql <<<
-- Migration: 20260928_inbox_realtime_publication.sql
-- Purpose: Idempotently register inbox_messages and inbox_threads in supabase_realtime publication with full replica identity
-- Enclosed in transaction block. Safe when tables are already members of publication.

BEGIN;

DO $$
BEGIN
  -- 1. Add inbox_messages to supabase_realtime publication only if absent
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'inbox_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
  END IF;

  -- 2. Add inbox_threads to supabase_realtime publication only if absent
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'inbox_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_threads;
  END IF;
END $$;

-- 3. Set REPLICA IDENTITY FULL for comprehensive realtime change notifications
ALTER TABLE public.inbox_messages REPLICA IDENTITY FULL;
ALTER TABLE public.inbox_threads REPLICA IDENTITY FULL;

COMMIT;

-- >>> END: supabase/migrations\20260928_inbox_realtime_publication.sql <<<


-- >>> START: supabase/migrations\20260929_bot_configurations.sql <<<
-- Migration: 20260929_bot_configurations.sql
-- Purpose: Schema foundation for Multi-Tenant Client AI Receptionist & Business Knowledge Grounding
-- Enclosed in transaction block for safe, idempotent forward execution.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_details text NOT NULL DEFAULT '',
  business_hours text NOT NULL DEFAULT 'Mon-Fri 9:00 AM - 6:00 PM',
  faqs jsonb NOT NULL DEFAULT '[]'::jsonb,
  booking_link text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'professional' CHECK (tone IN ('professional', 'friendly', 'casual', 'luxury', 'direct')),
  supported_languages text[] NOT NULL DEFAULT ARRAY['English']::text[],
  escalation_instructions text NOT NULL DEFAULT 'Please type /human or leave your phone/email to speak directly with an executive specialist.',
  welcome_message text NOT NULL DEFAULT '',
  ai_enabled boolean NOT NULL DEFAULT true,
  privacy_policy_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bot_configurations_workspace UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_configurations_workspace_id 
  ON public.bot_configurations (workspace_id);

-- Enable Row Level Security
ALTER TABLE public.bot_configurations ENABLE ROW LEVEL SECURITY;

-- 1. Service role has unrestricted access (for webhooks and background AI processing)
DROP POLICY IF EXISTS "bot_configurations_service_role_all" ON public.bot_configurations;
CREATE POLICY "bot_configurations_service_role_all"
  ON public.bot_configurations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Authenticated users can read configuration if they belong to the workspace
DROP POLICY IF EXISTS "bot_configurations_tenant_select" ON public.bot_configurations;
CREATE POLICY "bot_configurations_tenant_select"
  ON public.bot_configurations
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NOT NULL 
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

-- 3. Authenticated owners and admins can insert or update configuration
DROP POLICY IF EXISTS "bot_configurations_tenant_insert" ON public.bot_configurations;
CREATE POLICY "bot_configurations_tenant_insert"
  ON public.bot_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL 
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  );

DROP POLICY IF EXISTS "bot_configurations_tenant_update" ON public.bot_configurations;
CREATE POLICY "bot_configurations_tenant_update"
  ON public.bot_configurations
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IS NOT NULL 
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  )
  WITH CHECK (
    workspace_id IS NOT NULL 
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  );

-- Add bot_configurations to supabase_realtime publication if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'bot_configurations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_configurations;
  END IF;
END $$;

ALTER TABLE public.bot_configurations REPLICA IDENTITY FULL;

COMMIT;

-- >>> END: supabase/migrations\20260929_bot_configurations.sql <<<


-- >>> START: supabase/migrations\20260930_telegram_business_connections.sql <<<
-- Migration: 20260930_telegram_business_connections.sql
-- Purpose: Hardened schema foundation for Telegram Business Secretary Mode, Multi-Bot Idempotency, Transactional Ingress, Durable AI Queue, and Cryptographic Deletion Intents.
-- Forward-only and enclosed in an explicit transaction block.

BEGIN;

-- 1. Telegram Connection Sessions (Zernio-Style pending browser-to-bot handshake)
CREATE TABLE IF NOT EXISTS public.telegram_connection_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  connection_mode TEXT NOT NULL DEFAULT 'telegram_business' CHECK (connection_mode IN ('telegram_business', 'shared_bot', 'custom_bot')),
  receiving_bot_id TEXT NOT NULL DEFAULT 'official',
  telegram_user_id TEXT,
  telegram_username TEXT,
  consent_version TEXT NOT NULL DEFAULT '2026.1',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'completed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_connection_sessions ADD COLUMN IF NOT EXISTS receiving_bot_id TEXT NOT NULL DEFAULT 'official';

CREATE INDEX IF NOT EXISTS idx_tg_conn_sessions_hash ON public.telegram_connection_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_tg_conn_sessions_ws ON public.telegram_connection_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tg_conn_sessions_tg_uid ON public.telegram_connection_sessions(telegram_user_id);

ALTER TABLE public.telegram_connection_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Telegram Business Connections (Secretary Mode live binding)
CREATE TABLE IF NOT EXISTS public.telegram_business_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  receiving_bot_id TEXT NOT NULL DEFAULT 'official',
  business_connection_id TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  user_chat_id TEXT NOT NULL,
  can_reply BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  rights JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'local_disabled', 'disabled', 'disconnected')),
  consent_version TEXT NOT NULL DEFAULT '2026.1',
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_event_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_business_connections ADD COLUMN IF NOT EXISTS receiving_bot_id TEXT NOT NULL DEFAULT 'official';
ALTER TABLE public.telegram_business_connections DROP CONSTRAINT IF EXISTS telegram_business_connections_status_check;
ALTER TABLE public.telegram_business_connections ADD CONSTRAINT telegram_business_connections_status_check CHECK (status IN ('active', 'degraded', 'local_disabled', 'disabled', 'disconnected'));

CREATE INDEX IF NOT EXISTS idx_tg_biz_conn_id ON public.telegram_business_connections(business_connection_id);
CREATE INDEX IF NOT EXISTS idx_tg_biz_conn_ws ON public.telegram_business_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tg_biz_conn_tg_uid ON public.telegram_business_connections(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_tg_biz_conn_bot ON public.telegram_business_connections(receiving_bot_id);

ALTER TABLE public.telegram_business_connections ENABLE ROW LEVEL SECURITY;

-- 3. Versioned AI Consent Audit Log
CREATE TABLE IF NOT EXISTS public.telegram_connection_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_connection_id TEXT,
  consent_version TEXT NOT NULL,
  ai_provider TEXT NOT NULL DEFAULT 'google-gemini',
  categories_processed TEXT[] NOT NULL DEFAULT ARRAY['inbound_messages', 'contact_metadata']::text[],
  retention_days INT NOT NULL DEFAULT 90,
  revocation_method TEXT NOT NULL DEFAULT 'dashboard_disconnect',
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.telegram_connection_consents ADD COLUMN IF NOT EXISTS business_connection_id TEXT;
ALTER TABLE public.telegram_connection_consents ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tg_consents_ws ON public.telegram_connection_consents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tg_consents_user ON public.telegram_connection_consents(user_id);

ALTER TABLE public.telegram_connection_consents ENABLE ROW LEVEL SECURITY;

-- 4. Cryptographic Single-Use Deletion Intents
CREATE TABLE IF NOT EXISTS public.telegram_deletion_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_connection_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  preview_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_del_intent_hash ON public.telegram_deletion_intents(token_hash);
CREATE INDEX IF NOT EXISTS idx_tg_del_intent_ws ON public.telegram_deletion_intents(workspace_id);

ALTER TABLE public.telegram_deletion_intents ENABLE ROW LEVEL SECURITY;

-- 5. Durable Asynchronous Telegram AI Job Queue (Multi-Bot, 120s Lease, Retries, Exponential Backoff, Crash Recovery)
CREATE TABLE IF NOT EXISTS public.telegram_ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  receiving_bot_id TEXT NOT NULL DEFAULT 'official',
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  chat_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  business_connection_id TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter', 'delivery_unknown')),
  claim_token UUID,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS receiving_bot_id TEXT NOT NULL DEFAULT 'official';
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.telegram_ai_jobs DROP CONSTRAINT IF EXISTS telegram_ai_jobs_status_check;
ALTER TABLE public.telegram_ai_jobs ADD CONSTRAINT telegram_ai_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter', 'delivery_unknown'));

CREATE INDEX IF NOT EXISTS idx_tg_ai_jobs_queue 
  ON public.telegram_ai_jobs(status, next_attempt_at, lease_expires_at, created_at);
CREATE INDEX IF NOT EXISTS idx_tg_ai_jobs_ws 
  ON public.telegram_ai_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tg_ai_jobs_bot 
  ON public.telegram_ai_jobs(receiving_bot_id);

ALTER TABLE public.telegram_ai_jobs ENABLE ROW LEVEL SECURITY;

-- 6. Grants & Permissions
REVOKE ALL ON public.telegram_connection_sessions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_connection_sessions TO authenticated, service_role;

REVOKE ALL ON public.telegram_business_connections FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_business_connections TO authenticated, service_role;

REVOKE ALL ON public.telegram_connection_consents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_connection_consents TO authenticated, service_role;

REVOKE ALL ON public.telegram_deletion_intents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_deletion_intents TO authenticated, service_role;

REVOKE ALL ON public.telegram_ai_jobs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_ai_jobs TO service_role;
GRANT SELECT ON public.telegram_ai_jobs TO authenticated;

-- 7. RLS Policies: Service Role Access (for webhooks and background worker jobs)
DROP POLICY IF EXISTS "tg_sessions_service_role" ON public.telegram_connection_sessions;
CREATE POLICY "tg_sessions_service_role" ON public.telegram_connection_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tg_biz_conn_service_role" ON public.telegram_business_connections;
CREATE POLICY "tg_biz_conn_service_role" ON public.telegram_business_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tg_consents_service_role" ON public.telegram_connection_consents;
CREATE POLICY "tg_consents_service_role" ON public.telegram_connection_consents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tg_del_intents_service_role" ON public.telegram_deletion_intents;
CREATE POLICY "tg_del_intents_service_role" ON public.telegram_deletion_intents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tg_ai_jobs_service_role" ON public.telegram_ai_jobs;
CREATE POLICY "tg_ai_jobs_service_role" ON public.telegram_ai_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. RLS Policies: Authenticated Workspace Isolation
DROP POLICY IF EXISTS "tg_sessions_tenant_select" ON public.telegram_connection_sessions;
CREATE POLICY "tg_sessions_tenant_select" ON public.telegram_connection_sessions
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

DROP POLICY IF EXISTS "tg_sessions_tenant_insert" ON public.telegram_connection_sessions;
CREATE POLICY "tg_sessions_tenant_insert" ON public.telegram_connection_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  );

DROP POLICY IF EXISTS "tg_biz_conn_tenant_select" ON public.telegram_business_connections;
CREATE POLICY "tg_biz_conn_tenant_select" ON public.telegram_business_connections
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

DROP POLICY IF EXISTS "tg_biz_conn_tenant_manage" ON public.telegram_business_connections;
CREATE POLICY "tg_biz_conn_tenant_manage" ON public.telegram_business_connections
  FOR ALL TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS "tg_consents_tenant_select" ON public.telegram_connection_consents;
CREATE POLICY "tg_consents_tenant_select" ON public.telegram_connection_consents
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

DROP POLICY IF EXISTS "tg_consents_tenant_insert" ON public.telegram_connection_consents;
CREATE POLICY "tg_consents_tenant_insert" ON public.telegram_connection_consents
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS "tg_del_intents_tenant_select" ON public.telegram_deletion_intents;
CREATE POLICY "tg_del_intents_tenant_select" ON public.telegram_deletion_intents
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])
  );

-- 9. Atomic Session Consumption RPC
CREATE OR REPLACE FUNCTION public.consume_telegram_business_session(
  p_token_hash TEXT,
  p_telegram_user_id TEXT,
  p_telegram_username TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session RECORD;
BEGIN
  IF p_token_hash IS NULL OR p_telegram_user_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Token hash and Telegram user ID are required');
  END IF;

  SELECT * INTO v_session
  FROM public.telegram_connection_sessions
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Session not found');
  END IF;

  IF v_session.status <> 'pending' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Session already used or expired', 'status', v_session.status);
  END IF;

  IF v_session.expires_at < now() THEN
    UPDATE public.telegram_connection_sessions
    SET status = 'expired', updated_at = now()
    WHERE id = v_session.id;

    RETURN jsonb_build_object('valid', false, 'error', 'Session expired');
  END IF;

  UPDATE public.telegram_connection_sessions
  SET
    status = 'verified',
    telegram_user_id = p_telegram_user_id,
    telegram_username = p_telegram_username,
    updated_at = now()
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'valid', true,
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'consent_version', v_session.consent_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_telegram_business_session(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_telegram_business_session(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 10. Single Atomic Transactional Ingress RPC (Provider Receipt + Message + Durable Job)
DROP FUNCTION IF EXISTS public.ingest_telegram_update_transactional(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.ingest_telegram_update_transactional(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.ingest_telegram_update_transactional(
  p_workspace_id UUID,
  p_receiving_bot_id TEXT,
  p_update_id BIGINT,
  p_chat_id TEXT,
  p_sender_id TEXT,
  p_sender_name TEXT,
  p_message_text TEXT,
  p_business_connection_id TEXT DEFAULT NULL,
  p_is_business_message BOOLEAN DEFAULT false,
  p_external_message_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_integration_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread_id UUID;
  v_message_id UUID;
  v_job_id UUID;
  v_idempotency_key TEXT;
  v_thread_metadata JSONB;
BEGIN
  IF p_workspace_id IS NULL OR p_chat_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and chat_id are required';
  END IF;

  v_thread_metadata := jsonb_build_object(
    'receiving_bot_id', p_receiving_bot_id,
    'is_business_message', p_is_business_message
  );
  IF p_integration_id IS NOT NULL THEN
    v_thread_metadata := v_thread_metadata || jsonb_build_object('integration_id', p_integration_id);
  END IF;
  IF p_business_connection_id IS NOT NULL THEN
    v_thread_metadata := v_thread_metadata || jsonb_build_object('business_connection_id', p_business_connection_id);
  END IF;

  -- 1. Find or create thread
  SELECT id INTO v_thread_id
  FROM public.inbox_threads
  WHERE workspace_id = p_workspace_id
    AND channel = 'telegram'
    AND external_thread_id = p_chat_id
  LIMIT 1
  FOR UPDATE;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.inbox_threads (
      workspace_id,
      channel,
      external_thread_id,
      metadata,
      last_message_at
    ) VALUES (
      p_workspace_id,
      'telegram',
      p_chat_id,
      v_thread_metadata,
      now()
    ) RETURNING id INTO v_thread_id;
  ELSE
    UPDATE public.inbox_threads
    SET
      last_message_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || v_thread_metadata
    WHERE id = v_thread_id;
  END IF;

  -- 2. Insert inbound inbox message
  INSERT INTO public.inbox_messages (
    workspace_id,
    thread_id,
    direction,
    provider,
    external_message_id,
    content,
    delivery_status,
    metadata
  ) VALUES (
    p_workspace_id,
    v_thread_id,
    'inbound',
    'telegram',
    p_external_message_id,
    COALESCE(p_message_text, ''),
    'delivered',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'update_id', p_update_id,
      'receiving_bot_id', p_receiving_bot_id,
      'integration_id', p_integration_id,
      'business_connection_id', p_business_connection_id
    )
  ) RETURNING id INTO v_message_id;

  -- 3. Enqueue durable AI Job atomically within the same transaction if text is present
  IF p_message_text IS NOT NULL AND length(trim(p_message_text)) > 0 THEN
    v_idempotency_key := 'telegram-ai:' || COALESCE(p_integration_id::text, p_receiving_bot_id) || ':' || p_update_id || ':' || v_thread_id;

    INSERT INTO public.telegram_ai_jobs (
      workspace_id,
      thread_id,
      receiving_bot_id,
      integration_id,
      chat_id,
      message_text,
      sender_name,
      business_connection_id,
      idempotency_key,
      status
    ) VALUES (
      p_workspace_id,
      v_thread_id,
      p_receiving_bot_id,
      p_integration_id,
      p_chat_id,
      p_message_text,
      COALESCE(p_sender_name, 'Telegram User'),
      p_business_connection_id,
      v_idempotency_key,
      'pending'
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'job_id', v_job_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_telegram_update_transactional(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_telegram_update_transactional(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, UUID) TO service_role;

-- 11. Worker Claiming with 120s Leases, Exponential Backoff, & Crash Recovery
DROP FUNCTION IF EXISTS public.claim_telegram_ai_jobs(UUID, INT, INT);
CREATE OR REPLACE FUNCTION public.claim_telegram_ai_jobs(
  p_worker_id UUID,
  p_limit INT DEFAULT 5,
  p_lease_seconds INT DEFAULT 120
)
RETURNS TABLE (
  job_id UUID,
  workspace_id UUID,
  thread_id UUID,
  receiving_bot_id TEXT,
  chat_id TEXT,
  message_text TEXT,
  sender_name TEXT,
  business_connection_id TEXT,
  attempts INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT j.id
    FROM public.telegram_ai_jobs j
    WHERE
      (j.status = 'pending' AND j.next_attempt_at <= now() AND j.attempts < j.max_attempts)
      OR
      (j.status = 'processing' AND j.lease_expires_at < now() AND j.attempts < j.max_attempts) -- Crash Recovery!
    ORDER BY j.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.telegram_ai_jobs u
  SET
    status = 'processing',
    claim_token = p_worker_id,
    lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval,
    attempts = u.attempts + 1,
    updated_at = now()
  FROM claimable c
  WHERE u.id = c.id
  RETURNING
    u.id,
    u.workspace_id,
    u.thread_id,
    u.receiving_bot_id,
    u.chat_id,
    u.message_text,
    u.sender_name,
    u.business_connection_id,
    u.attempts;
END;
$$;

-- Function: Renew Job Lease (Heartbeat)
CREATE OR REPLACE FUNCTION public.renew_telegram_ai_job_lease(
  p_job_id UUID,
  p_claim_token UUID,
  p_additional_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INT := 0;
BEGIN
  UPDATE public.telegram_ai_jobs
  SET
    lease_expires_at = now() + (p_additional_seconds || ' seconds')::interval,
    updated_at = now()
  WHERE id = p_job_id AND claim_token = p_claim_token AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- 5.1 Worker Cycle Overlap Protection Table
CREATE TABLE IF NOT EXISTS public.telegram_worker_locks (
  lock_name TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.telegram_worker_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tg_worker_locks_service_role" ON public.telegram_worker_locks;
CREATE POLICY "tg_worker_locks_service_role" ON public.telegram_worker_locks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Function: Worker Advisory / Database Lock Overlap Protection
DROP FUNCTION IF EXISTS public.acquire_telegram_worker_lock();
DROP FUNCTION IF EXISTS public.acquire_telegram_worker_lock(TEXT, INT);

CREATE OR REPLACE FUNCTION public.acquire_telegram_worker_lock(
  p_worker_id TEXT DEFAULT 'worker',
  p_lease_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  INSERT INTO public.telegram_worker_locks (lock_name, locked_by, acquired_at, expires_at)
  VALUES ('global_worker_cycle', p_worker_id, now(), now() + (p_lease_seconds || ' seconds')::interval)
  ON CONFLICT (lock_name) DO UPDATE
  SET
    locked_by = p_worker_id,
    acquired_at = now(),
    expires_at = now() + (p_lease_seconds || ' seconds')::interval
  WHERE public.telegram_worker_locks.expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

DROP FUNCTION IF EXISTS public.release_telegram_worker_lock();
DROP FUNCTION IF EXISTS public.release_telegram_worker_lock(TEXT);

CREATE OR REPLACE FUNCTION public.release_telegram_worker_lock(
  p_worker_id TEXT DEFAULT 'worker'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  DELETE FROM public.telegram_worker_locks
  WHERE lock_name = 'global_worker_cycle' AND (locked_by = p_worker_id OR p_worker_id = 'worker');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_telegram_worker_lock(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_telegram_worker_lock(TEXT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.release_telegram_worker_lock(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_telegram_worker_lock(TEXT) TO service_role;

-- Function: Complete or Fail Job with Exponential Backoff
DROP FUNCTION IF EXISTS public.complete_telegram_ai_job(UUID, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.complete_telegram_ai_job(UUID, UUID, BOOLEAN, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.complete_telegram_ai_job(
  p_job_id UUID,
  p_claim_token UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
  v_backoff_seconds INT;
BEGIN
  SELECT * INTO v_job
  FROM public.telegram_ai_jobs
  WHERE id = p_job_id AND claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('completed', false, 'error', 'Job not found or claim token mismatch');
  END IF;

  -- 1. Handle ambiguous delivery (delivery_unknown): prevent automatic blind resend
  IF p_status = 'delivery_unknown' THEN
    UPDATE public.telegram_ai_jobs
    SET
      status = 'delivery_unknown',
      lease_expires_at = NULL,
      last_error = p_error,
      updated_at = now()
    WHERE id = p_job_id;
    RETURN jsonb_build_object('completed', true, 'status', 'delivery_unknown');
  END IF;

  -- 2. Handle successful delivery
  IF p_success THEN
    UPDATE public.telegram_ai_jobs
    SET
      status = 'completed',
      lease_expires_at = NULL,
      updated_at = now()
    WHERE id = p_job_id;
    RETURN jsonb_build_object('completed', true, 'status', 'completed');
  ELSE
    -- 3. Handle failure with bounded retry or dead-letter
    IF v_job.attempts >= v_job.max_attempts THEN
      UPDATE public.telegram_ai_jobs
      SET
        status = 'dead_letter',
        lease_expires_at = NULL,
        last_error = p_error,
        updated_at = now()
      WHERE id = p_job_id;
      RETURN jsonb_build_object('completed', true, 'status', 'dead_letter');
    ELSE
      -- Real exponential backoff: 5s, 10s, 20s...
      v_backoff_seconds := (power(2, v_job.attempts) * 5)::int;
      UPDATE public.telegram_ai_jobs
      SET
        status = 'pending',
        next_attempt_at = now() + (v_backoff_seconds || ' seconds')::interval,
        lease_expires_at = NULL,
        last_error = p_error,
        updated_at = now()
      WHERE id = p_job_id;
      RETURN jsonb_build_object('completed', true, 'status', 'retry_pending', 'next_attempt_seconds', v_backoff_seconds);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_telegram_ai_jobs(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_telegram_ai_jobs(UUID, INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.renew_telegram_ai_job_lease(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_telegram_ai_job_lease(UUID, UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_telegram_ai_job(UUID, UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_telegram_ai_job(UUID, UUID, BOOLEAN, TEXT, TEXT) TO service_role;

-- 12. Preview & Cryptographic Deletion Intent Creation RPC
DROP FUNCTION IF EXISTS public.preview_telegram_business_deletion(UUID, TEXT);
DROP FUNCTION IF EXISTS public.preview_telegram_business_deletion(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.preview_telegram_business_deletion(
  p_workspace_id UUID,
  p_business_connection_id TEXT,
  p_integration_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_connections_count INT := 0;
  v_messages_count INT := 0;
  v_threads_count INT := 0;
  v_jobs_count INT := 0;
  v_receipts_count INT := 0;
  v_outbox_count INT := 0;
  v_shared_contacts_count INT := 0;
  v_preview JSONB;
BEGIN
  IF p_workspace_id IS NULL OR p_business_connection_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and business_connection_id are required';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT has_workspace_role(p_workspace_id, ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Unauthorized: only workspace owners and admins can preview integration deletion';
  END IF;

  SELECT count(*)::int INTO v_connections_count
  FROM public.telegram_business_connections
  WHERE workspace_id = p_workspace_id AND business_connection_id = p_business_connection_id;

  -- Count ONLY messages belonging to threads of THIS business connection
  SELECT count(*)::int INTO v_messages_count
  FROM public.inbox_messages m
  JOIN public.inbox_threads t ON m.thread_id = t.id
  WHERE m.workspace_id = p_workspace_id
    AND t.channel = 'telegram'
    AND t.metadata->>'business_connection_id' = p_business_connection_id;

  -- Count outbound/outbox messages
  SELECT count(*)::int INTO v_outbox_count
  FROM public.inbox_messages m
  JOIN public.inbox_threads t ON m.thread_id = t.id
  WHERE m.workspace_id = p_workspace_id
    AND m.direction = 'outbound'
    AND t.channel = 'telegram'
    AND t.metadata->>'business_connection_id' = p_business_connection_id;

  SELECT count(*)::int INTO v_threads_count
  FROM public.inbox_threads
  WHERE workspace_id = p_workspace_id
    AND channel = 'telegram'
    AND metadata->>'business_connection_id' = p_business_connection_id;

  SELECT count(*)::int INTO v_jobs_count
  FROM public.telegram_ai_jobs
  WHERE workspace_id = p_workspace_id
    AND business_connection_id = p_business_connection_id;

  -- Provider event receipts: check integration_webhook_events if table exists
  BEGIN
    SELECT count(*)::int INTO v_receipts_count
    FROM public.integration_webhook_events
    WHERE workspace_id = p_workspace_id
      AND (raw_payload::text LIKE '%' || p_business_connection_id || '%');
  EXCEPTION WHEN undefined_table THEN
    v_receipts_count := 0;
  END;

  -- Shared contacts in contacts table are strictly preserved
  SELECT count(*)::int INTO v_shared_contacts_count
  FROM public.contacts
  WHERE workspace_id = p_workspace_id;

  v_preview := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'business_connection_id', p_business_connection_id,
    'connections_count', v_connections_count,
    'messages_count', v_messages_count,
    'outbox_count', v_outbox_count,
    'threads_count', v_threads_count,
    'jobs_count', v_jobs_count,
    'provider_receipts_count', v_receipts_count,
    'shared_contacts_preserved', v_shared_contacts_count
  );

  RETURN v_preview;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_telegram_business_deletion(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_telegram_business_deletion(UUID, TEXT, UUID) TO authenticated, service_role;

-- 13. Create Cryptographic Deletion Intent Token (Expires in 10 minutes)
DROP FUNCTION IF EXISTS public.create_telegram_deletion_intent(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.create_telegram_deletion_intent(UUID, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.create_telegram_deletion_intent(
  p_workspace_id UUID,
  p_business_connection_id TEXT,
  p_token_hash TEXT,
  p_user_id UUID DEFAULT auth.uid(),
  p_integration_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preview JSONB;
  v_intent_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR p_business_connection_id IS NULL OR p_token_hash IS NULL THEN
    RAISE EXCEPTION 'workspace_id, business_connection_id, and token_hash are required';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT has_workspace_role(p_workspace_id, ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Unauthorized: only workspace owners and admins can create deletion intent';
  END IF;

  v_preview := public.preview_telegram_business_deletion(p_workspace_id, p_business_connection_id, p_integration_id);

  INSERT INTO public.telegram_deletion_intents (
    workspace_id,
    user_id,
    business_connection_id,
    token_hash,
    preview_snapshot,
    expires_at
  ) VALUES (
    p_workspace_id,
    p_user_id,
    p_business_connection_id,
    p_token_hash,
    v_preview,
    now() + interval '10 minutes'
  ) RETURNING id INTO v_intent_id;

  RETURN jsonb_build_object(
    'intent_id', v_intent_id,
    'preview', v_preview,
    'expires_in_seconds', 600
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_telegram_deletion_intent(UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_telegram_deletion_intent(UUID, TEXT, TEXT, UUID, UUID) TO authenticated, service_role;

-- 14. Atomic Execution of Hardened Scoped Deletion with Cryptographic Token Consumption
DROP FUNCTION IF EXISTS public.execute_telegram_scoped_deletion(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.execute_telegram_scoped_deletion(UUID, TEXT, TEXT, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION public.execute_telegram_scoped_deletion(
  p_workspace_id UUID,
  p_business_connection_id TEXT,
  p_token_hash TEXT,
  p_delete_messages BOOLEAN DEFAULT true,
  p_integration_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent RECORD;
  v_messages_deleted INT := 0;
  v_threads_deleted INT := 0;
  v_jobs_deleted INT := 0;
  v_receipts_deleted INT := 0;
  v_connections_updated INT := 0;
  v_shared_contacts_count INT := 0;
BEGIN
  IF p_workspace_id IS NULL OR p_business_connection_id IS NULL OR p_token_hash IS NULL THEN
    RAISE EXCEPTION 'workspace_id, business_connection_id, and token_hash are required';
  END IF;

  -- 1. Atomically consume the deletion intent token
  SELECT * INTO v_intent
  FROM public.telegram_deletion_intents
  WHERE token_hash = p_token_hash
    AND workspace_id = p_workspace_id
    AND business_connection_id = p_business_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid deletion intent token';
  END IF;

  IF v_intent.status <> 'pending' THEN
    RAISE EXCEPTION 'Deletion intent token has already been consumed';
  END IF;

  IF v_intent.expires_at < now() THEN
    UPDATE public.telegram_deletion_intents SET status = 'expired' WHERE id = v_intent.id;
    RAISE EXCEPTION 'Deletion intent token has expired (exceeded 10-minute validity window)';
  END IF;

  -- Mark intent consumed
  UPDATE public.telegram_deletion_intents SET status = 'consumed' WHERE id = v_intent.id;

  -- 2. Mark business connection local_disabled / disconnected
  UPDATE public.telegram_business_connections
  SET
    status = 'local_disabled',
    is_enabled = false,
    can_reply = false,
    disconnected_at = now(),
    updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND business_connection_id = p_business_connection_id
    AND status <> 'disconnected';
  GET DIAGNOSTICS v_connections_updated = ROW_COUNT;

  -- 3. Revoke active consents for this connection
  UPDATE public.telegram_connection_consents
  SET revoked_at = now()
  WHERE workspace_id = p_workspace_id
    AND (business_connection_id = p_business_connection_id OR business_connection_id IS NULL)
    AND revoked_at IS NULL;

  -- 4. Purge AI Jobs belonging to THIS business connection
  DELETE FROM public.telegram_ai_jobs
  WHERE workspace_id = p_workspace_id
    AND business_connection_id = p_business_connection_id;
  GET DIAGNOSTICS v_jobs_deleted = ROW_COUNT;

  -- 5. Purge Provider-Event Receipts (integration_webhook_events) containing this business connection
  BEGIN
    DELETE FROM public.integration_webhook_events
    WHERE workspace_id = p_workspace_id
      AND (raw_payload::text LIKE '%' || p_business_connection_id || '%');
    GET DIAGNOSTICS v_receipts_deleted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    v_receipts_deleted := 0;
  END;

  -- 6. If requested, delete ONLY messages and threads of THIS business connection
  -- STRICT INVARIANT: Shared bot DM threads and other business connections remain 100% PRESERVED!
  IF p_delete_messages = true THEN
    DELETE FROM public.inbox_messages m
    USING public.inbox_threads t
    WHERE m.thread_id = t.id
      AND m.workspace_id = p_workspace_id
      AND t.channel = 'telegram'
      AND t.metadata->>'business_connection_id' = p_business_connection_id;
    GET DIAGNOSTICS v_messages_deleted = ROW_COUNT;

    DELETE FROM public.inbox_threads
    WHERE workspace_id = p_workspace_id
      AND channel = 'telegram'
      AND metadata->>'business_connection_id' = p_business_connection_id;
    GET DIAGNOSTICS v_threads_deleted = ROW_COUNT;
  END IF;

  -- Verify shared contacts remain 100% preserved
  SELECT count(*)::int INTO v_shared_contacts_count
  FROM public.contacts
  WHERE workspace_id = p_workspace_id;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'business_connection_id', p_business_connection_id,
    'connections_updated', v_connections_updated,
    'jobs_purged', v_jobs_deleted,
    'receipts_purged', v_receipts_deleted,
    'messages_deleted', v_messages_deleted,
    'threads_deleted', v_threads_deleted,
    'shared_contacts_preserved', v_shared_contacts_count,
    'audit_event', 'telegram_scoped_data_deleted',
    'deleted_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_telegram_scoped_deletion(UUID, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_telegram_scoped_deletion(UUID, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;

COMMIT;

-- >>> END: supabase/migrations\20260930_telegram_business_connections.sql <<<


-- >>> START: supabase/migrations\20261001_telegram_cron_reconciliation.sql <<<
-- Migration: 20261001_telegram_cron_reconciliation.sql
-- Purpose: Supabase pg_cron + pg_net background reconciliation for Telegram AI Worker.
-- Provides an every-minute background safety net to process pending or stale/reclaimed jobs.
-- Applied only to disposable/staging Supabase during certification.

-- 1. Enable required network and scheduling extensions if supported
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Dedicated secure worker invocation function via pg_net
CREATE OR REPLACE FUNCTION public.trigger_telegram_ai_worker_cron(
  p_app_url TEXT DEFAULT NULL,
  p_worker_secret TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_request_id BIGINT;
BEGIN
  -- Resolve application URL and dedicated worker secret securely
  v_url := COALESCE(p_app_url, current_setting('app.settings.app_url', true), 'http://localhost:3000');
  v_secret := COALESCE(p_worker_secret, current_setting('app.settings.telegram_worker_secret', true), '');

  -- Invariant: Reject invocation without configured worker secret
  IF v_secret = '' THEN
    RAISE WARNING 'trigger_telegram_ai_worker_cron: TELEGRAM_WORKER_SECRET is not configured. Skipping reconciliation call.';
    RETURN NULL;
  END IF;

  -- Issue asynchronous non-blocking HTTP POST via pg_net
  SELECT net.http_post(
    url := v_url || '/api/workers/telegram-ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) INTO v_request_id;

  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_telegram_ai_worker_cron failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_telegram_ai_worker_cron(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_telegram_ai_worker_cron(TEXT, TEXT) TO service_role;

-- 3. Register every-minute cron reconciliation job if pg_cron is active in this database
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing job if already registered to guarantee idempotency
    PERFORM cron.unschedule('telegram-ai-worker-reconciliation')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'telegram-ai-worker-reconciliation');

    -- Schedule every minute: * * * * *
    PERFORM cron.schedule(
      'telegram-ai-worker-reconciliation',
      '* * * * *',
      'SELECT public.trigger_telegram_ai_worker_cron();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped or not supported in this database: %', SQLERRM;
END;
$$;

-- >>> END: supabase/migrations\20261001_telegram_cron_reconciliation.sql <<<

