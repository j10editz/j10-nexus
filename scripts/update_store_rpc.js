const postgres = require('postgres');
const url = 'postgresql://postgres.qtzhcnyxbjocfgimtvvm:IDESSINMEMENE@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require';
const sql = postgres(url, { ssl: 'require' });

async function updateStoreFn() {
  await sql`
    CREATE OR REPLACE FUNCTION public.store_integration_credential_envelope(p_integration_id uuid, p_encrypted_payload text, p_initialization_vector text, p_authentication_tag text, p_algorithm text, p_key_version integer)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
    DECLARE
      v_integration public.integrations%ROWTYPE;
      v_cred_id UUID;
      v_caller_is_service_role BOOLEAN;
    BEGIN
      v_caller_is_service_role := 
        COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('service_role', 'supabase_admin')
        OR COALESCE(current_setting('role', true), '') IN ('service_role', 'supabase_admin', 'postgres')
        OR current_user IN ('service_role', 'supabase_admin', 'postgres');

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
        user_id,
        provider,
        encrypted_payload,
        initialization_vector,
        authentication_tag,
        algorithm,
        key_version
      )
      VALUES (
        v_integration.id,
        v_integration.workspace_id,
        v_integration.user_id,
        v_integration.provider,
        p_encrypted_payload,
        p_initialization_vector,
        p_authentication_tag,
        p_algorithm,
        p_key_version
      )
      ON CONFLICT (integration_id)
      DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        user_id = EXCLUDED.user_id,
        provider = EXCLUDED.provider,
        encrypted_payload = EXCLUDED.encrypted_payload,
        initialization_vector = EXCLUDED.initialization_vector,
        authentication_tag = EXCLUDED.authentication_tag,
        algorithm = EXCLUDED.algorithm,
        key_version = EXCLUDED.key_version
      RETURNING id INTO v_cred_id;

      UPDATE public.integrations
      SET credential_reference = v_cred_id,
          updated_at = now()
      WHERE id = v_integration.id;

      RETURN v_cred_id;
    END;
    $$;
  `;
  console.log('Successfully updated store_integration_credential_envelope!');
  process.exit(0);
}
updateStoreFn().catch(e => { console.error(e); process.exit(1); });
