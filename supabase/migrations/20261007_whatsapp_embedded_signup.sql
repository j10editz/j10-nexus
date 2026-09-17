-- Migration: 20261007_whatsapp_embedded_signup.sql
-- Description: Schema and session state tracking for Meta WhatsApp Embedded Signup
-- Security: Strict tenant isolation, RLS, zero token storage in session table

BEGIN;

-- 1. Create WhatsApp connection sessions table for CSRF & OAuth state tracking
CREATE TABLE IF NOT EXISTS public.whatsapp_connection_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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

-- 2. Indexes for fast single-use token lookups and workspace queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_conn_sessions_hash
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

-- 4. Atomic single-use consumption RPC
CREATE OR REPLACE FUNCTION public.consume_whatsapp_connection_session(
  p_token_hash TEXT,
  p_workspace_id UUID
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
  -- Lock the pending session row
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

  IF v_session.status != 'pending' THEN
    RETURN QUERY SELECT v_session.id, v_session.workspace_id, v_session.created_by_user_id, FALSE, 'Session token has already been consumed'::TEXT;
    RETURN;
  END IF;

  IF v_session.expires_at <= now() THEN
    UPDATE public.whatsapp_connection_sessions
    SET status = 'expired', updated_at = now()
    WHERE id = v_session.id;

    RETURN QUERY SELECT v_session.id, v_session.workspace_id, v_session.created_by_user_id, FALSE, 'Session token has expired'::TEXT;
    RETURN;
  END IF;

  -- Mark session consumed
  UPDATE public.whatsapp_connection_sessions
  SET status = 'completed', updated_at = now()
  WHERE id = v_session.id;

  RETURN QUERY SELECT v_session.id, v_session.workspace_id, v_session.created_by_user_id, TRUE, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_whatsapp_connection_session(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_whatsapp_connection_session(TEXT, UUID) TO authenticated, service_role;

COMMIT;
