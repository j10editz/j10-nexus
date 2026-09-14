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
