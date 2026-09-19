-- Reconciles invariants from invalid historical `b` migrations for databases
-- that already recorded the surrounding valid migration versions.
BEGIN;

-- Fresh-install foundation reconciliation for databases whose historical
-- ledger predates the portable Day 14–16 chain.
CREATE TABLE IF NOT EXISTS public.automations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, name text NOT NULL, trigger_type text NOT NULL DEFAULT 'manual', trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'active', schedule_expression text, timezone text NOT NULL DEFAULT 'UTC', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.automation_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, trigger_type text NOT NULL DEFAULT 'manual', trigger_payload jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'queued', current_step_order integer NOT NULL DEFAULT 1, result_summary text, error_message text, execution_mode text NOT NULL DEFAULT 'live', api_called boolean NOT NULL DEFAULT false, total_cost_usd numeric(10,4) NOT NULL DEFAULT 0, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.automation_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, step_order integer NOT NULL, name text, step_type text NOT NULL DEFAULT 'action', action_type text, employee_id uuid, employee_name text, task_type text, instructions text, config jsonb NOT NULL DEFAULT '{}'::jsonb, condition_config jsonb NOT NULL DEFAULT '{}'::jsonb, requires_approval boolean NOT NULL DEFAULT false, approval_type text, on_success_step_id uuid, on_failure_step_id uuid, is_enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.automation_run_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE, automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE, automation_step_id uuid REFERENCES public.automation_steps(id) ON DELETE SET NULL, user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, step_order integer NOT NULL, step_type text NOT NULL DEFAULT 'action', action_type text, employee_id uuid, employee_name text, ai_task_id uuid, status text NOT NULL DEFAULT 'queued', requires_approval boolean NOT NULL DEFAULT false, approval_status text NOT NULL DEFAULT 'not_required', input_payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.crm_contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, first_name text, last_name text, email text, phone text, company text, job_title text, type text NOT NULL DEFAULT 'Lead', status text NOT NULL DEFAULT 'New', source text NOT NULL DEFAULT 'crm', estimated_value numeric(10,2) NOT NULL DEFAULT 0, notes text, last_contacted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, name text NOT NULL, role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.ai_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, title text NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.activity_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Historical, environment-specific founder ownership changes are intentionally
-- not reconciled here. Existing environments retain their recorded ownership;
-- any explicit role or ownership bootstrap is performed through the authenticated
-- application flow after its referenced user and workspace have been verified.

DO $$
BEGIN
  IF to_regprocedure('public.record_verified_workspace_usage(uuid,text,integer,text,text,uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) TO authenticated, service_role';
  END IF;
  IF to_regprocedure('public.activate_workspace_trial(uuid,text,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) TO authenticated, service_role';
  END IF;
  IF to_regclass('public.crm_proposals') IS NOT NULL AND to_regclass('public.crm_bookings') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.crm_proposals FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.crm_bookings FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_proposals TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bookings TO authenticated';
  END IF;
END $$;

COMMIT;

-- BEGIN LEDGER RECONCILIATION 20260820_day14c_integration_credentials.sql
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
-- END LEDGER RECONCILIATION 20260820_day14c_integration_credentials.sql

-- BEGIN LEDGER RECONCILIATION 20260820_day14e_integration_catalog.sql
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
-- END LEDGER RECONCILIATION 20260820_day14e_integration_catalog.sql

-- BEGIN LEDGER RECONCILIATION 20260820_day14g_webhook_foundation.sql
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
-- END LEDGER RECONCILIATION 20260820_day14g_webhook_foundation.sql

-- BEGIN LEDGER RECONCILIATION 20260820_day14h_external_trigger_adapter.sql
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
-- END LEDGER RECONCILIATION 20260820_day14h_external_trigger_adapter.sql

-- BEGIN LEDGER RECONCILIATION 20260820_day14i_external_action_adapter.sql
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
-- END LEDGER RECONCILIATION 20260820_day14i_external_action_adapter.sql

-- BEGIN LEDGER RECONCILIATION 20260821_day14l_integration_observability_retry.sql
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
-- END LEDGER RECONCILIATION 20260821_day14l_integration_observability_retry.sql

-- BEGIN LEDGER RECONCILIATION 20260829_day16g_runtime_step_history_fk.sql
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

-- END LEDGER RECONCILIATION 20260829_day16g_runtime_step_history_fk.sql

-- BEGIN LEDGER RECONCILIATION 20260829_day16h_pgcrypto_checksum_schema.sql
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

-- END LEDGER RECONCILIATION 20260829_day16h_pgcrypto_checksum_schema.sql
