-- Reconcile the tenant-scoped credential-envelope RPC on databases that
-- already recorded the earlier ledger reconciliation migration.
-- Replace only the exact UUID signature; dependent objects are never cascaded.

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
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_integration public.integrations%rowtype;
  v_caller_is_service_role boolean;
begin
  v_caller_is_service_role := coalesce(
    current_setting('request.jwt.claim.role', true),
    ''
  ) = 'service_role';

  select * into v_integration
  from public.integrations
  where id = p_integration_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Integration connection was not found.';
  end if;

  if not v_caller_is_service_role then
    if auth.uid() is null or not public.has_workspace_role(v_integration.workspace_id, array['owner', 'admin']) then
      raise exception 'Forbidden: workspace admin role required.' using errcode = '42501';
    end if;
  end if;

  return query
  select
    credential_record.id,
    credential_record.integration_id,
    credential_record.workspace_id,
    v_integration.provider,
    credential_record.encrypted_payload,
    credential_record.initialization_vector,
    credential_record.authentication_tag,
    credential_record.algorithm,
    credential_record.key_version
  from public.integration_credentials as credential_record
  where credential_record.integration_id = p_integration_id;
end;
$$;

alter function public.get_integration_credential_envelope(uuid) owner to postgres;
revoke all on function public.get_integration_credential_envelope(uuid) from public, anon;
grant execute on function public.get_integration_credential_envelope(uuid) to authenticated, service_role;

comment on function public.get_integration_credential_envelope(uuid) is
  'Returns an encrypted credential envelope only to a workspace owner, admin, or service role.';
