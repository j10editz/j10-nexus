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