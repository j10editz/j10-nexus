-- Simulate the tenant-scoped signature a linked Supabase reset can leave
-- behind after its migration ledger is cleared. This is deliberately the
-- exact UUID signature only; no dependent objects are cascaded.

drop function if exists public.get_integration_credential_envelope(uuid);

create function public.get_integration_credential_envelope(
  p_integration_id uuid
)
returns table (
  credential_id uuid,
  integration_id uuid,
  workspace_id uuid,
  provider text,
  encrypted_payload text,
  initialization_vector text,
  authentication_tag text,
  algorithm text,
  key_version integer
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    null::uuid,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    null::text,
    null::text,
    null::text,
    null::integer
  where false;
$$;
