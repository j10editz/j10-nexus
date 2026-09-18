-- Migration: 20261007_whatsapp_embedded_signup.sql
-- Description: Schema and session state tracking for Meta WhatsApp Embedded Signup
-- Security: Strict tenant isolation, RLS, initiating-user session binding, cross-workspace uniqueness

BEGIN;

-- 1. Create WhatsApp connection sessions table for CSRF & OAuth state tracking
CREATE TABLE IF NOT EXISTS public.whatsapp_connection_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  waba_id TEXT,
  phone_number_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_connection_sessions_status_check
    CHECK (status IN ('pending', 'completed', 'expired', 'failed'))
);

-- Audit and harden existing table in case it was created previously with nullable created_by_user_id
DO $$
DECLARE
  v_null_initiators INT;
  v_has_exact_fk BOOLEAN := false;
  v_fk_rec RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'whatsapp_connection_sessions'
  ) THEN
    -- Check for NULL created_by_user_id rows
    SELECT count(*) INTO v_null_initiators
    FROM public.whatsapp_connection_sessions
    WHERE created_by_user_id IS NULL;

    IF v_null_initiators > 0 THEN
      -- Safely remove expired or non-pending unusable sessions with NULL created_by_user_id
      DELETE FROM public.whatsapp_connection_sessions
      WHERE created_by_user_id IS NULL
        AND (expires_at <= now() OR status != 'pending');

      -- Recheck for any remaining active NULL initiating-user rows
      SELECT count(*) INTO v_null_initiators
      FROM public.whatsapp_connection_sessions
      WHERE created_by_user_id IS NULL;

      IF v_null_initiators > 0 THEN
        RAISE EXCEPTION 'Audit failed: % active whatsapp_connection_sessions have NULL created_by_user_id', v_null_initiators;
      END IF;
    END IF;

    -- Enforce created_by_user_id NOT NULL
    ALTER TABLE public.whatsapp_connection_sessions
      ALTER COLUMN created_by_user_id SET NOT NULL;

    -- Audit all foreign keys involving created_by_user_id:
    -- Must specifically reference auth.users(id) with ON DELETE CASCADE (confdeltype = 'c')
    FOR v_fk_rec IN (
      SELECT
        c.conname,
        c.confdeltype,
        fn.nspname AS ref_schema,
        ft.relname AS ref_table,
        fa.attname AS ref_column
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      JOIN pg_class ft ON c.confrelid = ft.oid
      JOIN pg_namespace fn ON ft.relnamespace = fn.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      JOIN pg_attribute fa ON fa.attrelid = ft.oid AND fa.attnum = ANY(c.confkey)
      WHERE n.nspname = 'public'
        AND t.relname = 'whatsapp_connection_sessions'
        AND c.contype = 'f'
        AND a.attname = 'created_by_user_id'
    ) LOOP
      IF v_fk_rec.ref_schema != 'auth'
         OR v_fk_rec.ref_table != 'users'
         OR v_fk_rec.ref_column != 'id'
         OR v_fk_rec.confdeltype != 'c' THEN
        -- Drop non-canonical or non-cascade legacy foreign key
        EXECUTE 'ALTER TABLE public.whatsapp_connection_sessions DROP CONSTRAINT ' || quote_ident(v_fk_rec.conname);
      ELSE
        v_has_exact_fk := true;
      END IF;
    END LOOP;

    -- If exact canonical foreign key is not present, add it
    IF NOT v_has_exact_fk THEN
      ALTER TABLE public.whatsapp_connection_sessions
        ADD CONSTRAINT fk_whatsapp_connection_sessions_user
        FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 2. Unique constraint and indexes for fast single-use token lookups and workspace queries
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conn_sessions_token_hash
  ON public.whatsapp_connection_sessions(state_token_hash);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_sessions_ws
  ON public.whatsapp_connection_sessions(workspace_id);

-- 3. Row-Level Security
ALTER TABLE public.whatsapp_connection_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.whatsapp_connection_sessions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connection_sessions TO authenticated, service_role;

DROP POLICY IF EXISTS "whatsapp_sessions_service_role" ON public.whatsapp_connection_sessions;
CREATE POLICY "whatsapp_sessions_service_role" ON public.whatsapp_connection_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "whatsapp_sessions_tenant_select" ON public.whatsapp_connection_sessions;
CREATE POLICY "whatsapp_sessions_tenant_select" ON public.whatsapp_connection_sessions
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "whatsapp_sessions_tenant_insert" ON public.whatsapp_connection_sessions;
CREATE POLICY "whatsapp_sessions_tenant_insert" ON public.whatsapp_connection_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- 4. Atomic single-use consumption RPC bound to initiating user and workspace
-- Drop old 2-argument signature if present
DROP FUNCTION IF EXISTS public.consume_whatsapp_connection_session(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.consume_whatsapp_connection_session(
  p_token_hash TEXT,
  p_workspace_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  session_id UUID,
  workspace_id UUID,
  created_by_user_id UUID,
  valid BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Lock the pending session row matching token hash and workspace
  SELECT s.id, s.workspace_id, s.created_by_user_id, s.status, s.expires_at
  INTO v_session
  FROM public.whatsapp_connection_sessions s
  WHERE s.state_token_hash = p_token_hash
    AND s.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, FALSE, 'Session token not found or invalid'::TEXT;
    RETURN;
  END IF;

  -- Verify session was created by the initiating user (NULL never validates)
  IF p_user_id IS NULL OR v_session.created_by_user_id IS NULL OR v_session.created_by_user_id != p_user_id THEN
    RETURN QUERY SELECT v_session.id, v_session.workspace_id, v_session.created_by_user_id, FALSE, 'Initiating user mismatch'::TEXT;
    RETURN;
  END IF;

  -- Replay prevention
  IF v_session.status != 'pending' THEN
    RETURN QUERY SELECT v_session.id, v_session.workspace_id, v_session.created_by_user_id, FALSE, 'Session token has already been consumed'::TEXT;
    RETURN;
  END IF;

  -- Expiration check
  IF v_session.expires_at <= now() THEN
    UPDATE public.whatsapp_connection_sessions
    SET status = 'expired', updated_at = now()
    WHERE id = v_session.id;

    RETURN QUERY SELECT v_session.id, v_session.workspace_id, v_session.created_by_user_id, FALSE, 'Session token has expired'::TEXT;
    RETURN;
  END IF;

  -- Mark session consumed atomically
  UPDATE public.whatsapp_connection_sessions
  SET status = 'completed', updated_at = now()
  WHERE id = v_session.id;

  RETURN QUERY SELECT v_session.id, v_session.workspace_id, v_session.created_by_user_id, TRUE, NULL::TEXT;
END;
$$;

-- Restrict RPC execution strictly to service_role (privileged client used after app auth)
REVOKE ALL ON FUNCTION public.consume_whatsapp_connection_session(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_whatsapp_connection_session(TEXT, UUID, UUID) TO service_role;

-- 5. Cross-workspace ownership enforcement for active/reserved WhatsApp integrations in Postgres
-- Audit existing rows before applying uniqueness constraints
DO $$
DECLARE
  v_dup_phones INT;
  v_dup_wabas INT;
BEGIN
  -- Check for existing duplicate active/reserved phone numbers across different workspaces
  SELECT count(*) INTO v_dup_phones
  FROM (
    SELECT COALESCE(external_account_id, public_configuration->>'phone_number_id') AS phone_id
    FROM public.integrations
    WHERE provider = 'whatsapp-business'
      AND status IN ('pending', 'connected', 'degraded')
      AND COALESCE(external_account_id, public_configuration->>'phone_number_id') IS NOT NULL
    GROUP BY COALESCE(external_account_id, public_configuration->>'phone_number_id')
    HAVING count(DISTINCT workspace_id) > 1
  ) dups;

  IF v_dup_phones > 0 THEN
    RAISE EXCEPTION 'Audit failed: % active/reserved WhatsApp phone numbers are shared across multiple workspaces', v_dup_phones;
  END IF;

  -- Check for existing duplicate active/reserved WABA IDs across different workspaces
  SELECT count(*) INTO v_dup_wabas
  FROM (
    SELECT COALESCE(public_configuration->>'waba_id', public_configuration->>'business_account_id') AS waba_id
    FROM public.integrations
    WHERE provider = 'whatsapp-business'
      AND status IN ('pending', 'connected', 'degraded')
      AND COALESCE(public_configuration->>'waba_id', public_configuration->>'business_account_id') IS NOT NULL
    GROUP BY COALESCE(public_configuration->>'waba_id', public_configuration->>'business_account_id')
    HAVING count(DISTINCT workspace_id) > 1
  ) dups;

  IF v_dup_wabas > 0 THEN
    RAISE EXCEPTION 'Audit failed: % active/reserved WhatsApp WABA IDs are shared across multiple workspaces', v_dup_wabas;
  END IF;
END $$;

-- Enforce exactly one workspace per phone number across protected statuses (pending, connected, degraded)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_whatsapp_phone_number_id
  ON public.integrations ( (COALESCE(external_account_id, public_configuration->>'phone_number_id')) )
  WHERE provider = 'whatsapp-business'
    AND status IN ('pending', 'connected', 'degraded')
    AND COALESCE(external_account_id, public_configuration->>'phone_number_id') IS NOT NULL;

-- Enforce exactly one workspace per WABA ID across protected statuses (pending, connected, degraded)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_whatsapp_waba_id
  ON public.integrations ( (COALESCE(public_configuration->>'waba_id', public_configuration->>'business_account_id')) )
  WHERE provider = 'whatsapp-business'
    AND status IN ('pending', 'connected', 'degraded')
    AND COALESCE(public_configuration->>'waba_id', public_configuration->>'business_account_id') IS NOT NULL;

COMMIT;
