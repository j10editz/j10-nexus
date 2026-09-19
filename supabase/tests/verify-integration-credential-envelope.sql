do $$
declare
  v_result text;
  v_owner name;
  v_security_definer boolean;
  v_config text[];
begin
  select
    pg_get_function_result(p.oid),
    r.rolname,
    p.prosecdef,
    p.proconfig
  into
    v_result,
    v_owner,
    v_security_definer,
    v_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and p.proname = 'get_integration_credential_envelope'
    and p.oid = 'public.get_integration_credential_envelope(uuid)'::regprocedure;

  if v_result is distinct from 'TABLE(credential_id uuid, integration_id uuid, workspace_id uuid, provider text, encrypted_payload text, initialization_vector text, authentication_tag text, algorithm text, key_version integer)' then
    raise exception 'Credential envelope return contract was not restored: %', v_result;
  end if;

  if v_owner <> 'postgres' or not v_security_definer or not coalesce(v_config, array[]::text[]) @> array['search_path=pg_catalog, public'] then
    raise exception 'Credential envelope security attributes were not restored.';
  end if;

  if has_function_privilege('anon', 'public.get_integration_credential_envelope(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_integration_credential_envelope(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.get_integration_credential_envelope(uuid)', 'execute') then
    raise exception 'Credential envelope execute grants were not restored.';
  end if;
end;
$$;
