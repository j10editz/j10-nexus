const { requireDatabaseUrl } = require("./lib/database-url.cjs");
const postgres = require('postgres');
const url = requireDatabaseUrl();
const sql = postgres(url, { ssl: 'require' });

async function updateFn() {
  await sql`
    CREATE OR REPLACE FUNCTION public.get_integration_credential_envelope(p_integration_id uuid)
    RETURNS TABLE(credential_id uuid, integration_id uuid, workspace_id uuid, provider text, encrypted_payload text, initialization_vector text, authentication_tag text, algorithm text, key_version integer)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    DECLARE
      v_integration public.integrations%ROWTYPE;
      v_caller_is_service_role BOOLEAN;
    BEGIN
      v_caller_is_service_role := 
        COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('service_role', 'supabase_admin')
        OR COALESCE(current_setting('role', true), '') IN ('service_role', 'supabase_admin', 'postgres')
        OR current_user IN ('service_role', 'supabase_admin', 'postgres');

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
  `;
  console.log('Successfully updated get_integration_credential_envelope to allow service_role and postgres roles!');
  process.exit(0);
}
updateFn().catch(e => { console.error(e); process.exit(1); });
