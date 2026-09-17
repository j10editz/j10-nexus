-- ============================================================================
-- J10 NEXUS: Founder's 3 Stripe Billing & Atomic Slot Control Migration
-- Migration: 20261003_founders3_billing_and_slot_control.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. EXTEND WORKSPACE_SUBSCRIPTIONS FOR FOUNDER'S 3 & ENHANCED LIFECYCLE
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seats_quota INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS channels_quota INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ai_conversations_quota INTEGER NOT NULL DEFAULT 1000;

-- Update constraints on workspace_subscriptions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_subscriptions_plan_id_check') THEN
    ALTER TABLE public.workspace_subscriptions DROP CONSTRAINT workspace_subscriptions_plan_id_check;
  END IF;
  ALTER TABLE public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_plan_id_check
    CHECK (plan_id IN ('founders3', 'starter', 'growth', 'enterprise', 'none'));

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_subscriptions_status_check') THEN
    ALTER TABLE public.workspace_subscriptions DROP CONSTRAINT workspace_subscriptions_status_check;
  END IF;
  ALTER TABLE public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_status_check
    CHECK (status IN (
      'incomplete',
      'active',
      'trialing',
      'past_due',
      'canceled_at_period_end',
      'canceled',
      'unpaid',
      'refunded',
      'disputed',
      'none'
    ));
END $$;

-- ----------------------------------------------------------------------------
-- 2. FOUNDER'S 3 INVITATIONS (Invite-Only Single-Use Cryptographic Tokens)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founders3_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invitation_code TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_f3_invitations_ws ON public.founders3_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_f3_invitations_code ON public.founders3_invitations(invitation_code);

-- Enable RLS
ALTER TABLE public.founders3_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founders3_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founders3_invitations_select_member" ON public.founders3_invitations;
CREATE POLICY "founders3_invitations_select_member" ON public.founders3_invitations
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR public.is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 3. FOUNDER'S 3 RESERVATIONS & ENROLLMENT CONTROL (STRICT MAX 3 SLOTS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founders3_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invitation_id UUID REFERENCES public.founders3_invitations(id) ON DELETE SET NULL,
  checkout_id UUID REFERENCES public.payment_checkouts(id) ON DELETE SET NULL,
  stripe_checkout_session_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'released', 'canceled', 'revoked')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_f3_reservations_status ON public.founders3_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_f3_reservations_ws ON public.founders3_reservations(workspace_id);

ALTER TABLE public.founders3_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founders3_reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founders3_reservations_select_member" ON public.founders3_reservations;
CREATE POLICY "founders3_reservations_select_member" ON public.founders3_reservations
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR public.is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 4. ATOMIC RPC: GET FOUNDER'S 3 SLOT STATUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_founders3_slot_status(
  p_workspace_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_count INT := 0;
  v_pending_count INT := 0;
  v_total_occupied INT := 0;
  v_workspace_status TEXT := 'none';
  v_has_reservation BOOLEAN := false;
BEGIN
  -- Count active completed enrollments (cancellations do NOT auto-reopen without admin)
  SELECT count(*) INTO v_active_count
  FROM public.founders3_reservations
  WHERE status = 'active';

  -- Count pending unexpired reservations
  SELECT count(*) INTO v_pending_count
  FROM public.founders3_reservations
  WHERE status = 'pending' AND expires_at > now();

  v_total_occupied := v_active_count + v_pending_count;

  IF p_workspace_id IS NOT NULL THEN
    SELECT status INTO v_workspace_status
    FROM public.founders3_reservations
    WHERE workspace_id = p_workspace_id
    LIMIT 1;

    IF v_workspace_status = 'active' OR (v_workspace_status = 'pending' AND EXISTS (
      SELECT 1 FROM public.founders3_reservations WHERE workspace_id = p_workspace_id AND expires_at > now()
    )) THEN
      v_has_reservation := true;
    ELSE
      v_has_reservation := false;
      v_workspace_status := COALESCE(v_workspace_status, 'none');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'max_slots', 3,
    'active_enrollments', v_active_count,
    'pending_reservations', v_pending_count,
    'occupied_slots', v_total_occupied,
    'available_slots', GREATEST(0, 3 - v_total_occupied),
    'is_full', v_total_occupied >= 3,
    'workspace_reservation_status', v_workspace_status,
    'has_workspace_reservation', v_has_reservation
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4B. SUBSCRIPTION & WEBHOOK LEDGERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processing', 'processed', 'failed')),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  payload_hash TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT uq_webhook_events_provider_event UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.subscription_events_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stripe_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sub_events_event_id UNIQUE(stripe_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_id ON public.webhook_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_ws ON public.subscription_events_ledger(workspace_id);

-- ----------------------------------------------------------------------------
-- 5. ATOMIC RPC: RESERVE FOUNDER'S 3 SLOT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_founders3_slot_atomic(
  p_workspace_id UUID,
  p_invitation_code TEXT,
  p_checkout_id UUID DEFAULT NULL,
  p_expires_in_minutes INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_invitation RECORD;
  v_active_count INT := 0;
  v_pending_count INT := 0;
  v_total_occupied INT := 0;
  v_existing_res RECORD;
  v_new_res_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL AND NOT (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin'])
    OR public.is_platform_admin()
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'FORBIDDEN',
      'error', 'Only workspace owners or admins can reserve Founder''s 3 slots.'
    );
  END IF;

  -- 1. Validate Invitation Code
  SELECT * INTO v_invitation
  FROM public.founders3_invitations
  WHERE invitation_code = trim(p_invitation_code)
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_INVITATION',
      'error', 'Invitation code is invalid or not found.'
    );
  END IF;

  IF v_invitation.workspace_id != p_workspace_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVITATION_WORKSPACE_MISMATCH',
      'error', 'This invitation code is scoped to a different workspace and cannot be transferred.'
    );
  END IF;

  IF v_invitation.status != 'active' OR v_invitation.used_count >= v_invitation.max_uses THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVITATION_CONSUMED',
      'error', 'This single-use invitation has already been redeemed.'
    );
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.founders3_invitations SET status = 'expired', updated_at = now() WHERE id = v_invitation.id;
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVITATION_EXPIRED',
      'error', 'This invitation code has expired.'
    );
  END IF;

  -- 2. Lock reservations table rows to prevent race condition
  -- Count active and active pending reservations
  SELECT count(*) INTO v_active_count
  FROM public.founders3_reservations
  WHERE status = 'active';

  SELECT count(*) INTO v_pending_count
  FROM public.founders3_reservations
  WHERE status = 'pending' AND expires_at > now() AND workspace_id != p_workspace_id;

  v_total_occupied := v_active_count + v_pending_count;

  -- Check existing reservation for this workspace
  SELECT * INTO v_existing_res
  FROM public.founders3_reservations
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_existing_res.id IS NOT NULL AND v_existing_res.status = 'active' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_active', true,
      'reservation_id', v_existing_res.id,
      'message', 'Workspace already has an active Founder''s 3 subscription.'
    );
  END IF;

  -- If 3 slots are already occupied by others, reject
  IF v_total_occupied >= 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'FOUNDERS_3_SLOTS_FULL',
      'error', 'All 3 Founder''s Pilot slots are currently reserved or active. Enrollment is closed.'
    );
  END IF;

  v_expires_at := now() + (p_expires_in_minutes || ' minutes')::interval;

  -- Upsert reservation hold for this workspace
  IF v_existing_res.id IS NOT NULL THEN
    UPDATE public.founders3_reservations
    SET
      invitation_id = v_invitation.id,
      checkout_id = COALESCE(p_checkout_id, checkout_id),
      status = 'pending',
      reserved_at = now(),
      expires_at = v_expires_at,
      released_at = NULL,
      metadata = jsonb_build_object('invitation_code', v_invitation.invitation_code, 'reserved_by', v_caller_id)
    WHERE id = v_existing_res.id
    RETURNING id INTO v_new_res_id;
  ELSE
    INSERT INTO public.founders3_reservations (
      workspace_id,
      invitation_id,
      checkout_id,
      status,
      reserved_at,
      expires_at,
      metadata
    ) VALUES (
      p_workspace_id,
      v_invitation.id,
      p_checkout_id,
      'pending',
      now(),
      v_expires_at,
      jsonb_build_object('invitation_code', v_invitation.invitation_code, 'reserved_by', v_caller_id)
    ) RETURNING id INTO v_new_res_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_new_res_id,
    'workspace_id', p_workspace_id,
    'expires_at', v_expires_at,
    'slot_number', v_total_occupied + 1
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. ATOMIC RPC: ACTIVATE FOUNDER'S 3 ENROLLMENT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_founders3_enrollment_atomic(
  p_workspace_id UUID,
  p_stripe_subscription_id TEXT,
  p_stripe_customer_id TEXT,
  p_stripe_price_id TEXT DEFAULT 'price_founders3_monthly_149',
  p_current_period_start TIMESTAMPTZ DEFAULT now(),
  p_current_period_end TIMESTAMPTZ DEFAULT (now() + interval '30 days')
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res RECORD;
  v_sub RECORD;
  v_active_count INT := 0;
BEGIN
  -- 1. Check reservation
  SELECT * INTO v_res
  FROM public.founders3_reservations
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  -- Verify active count limit (unless this workspace is already the active one)
  SELECT count(*) INTO v_active_count
  FROM public.founders3_reservations
  WHERE status = 'active' AND workspace_id != p_workspace_id;

  IF v_active_count >= 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOTS_EXCEEDED',
      'error', 'Cannot activate: maximum 3 Founder''s 3 subscriptions already active.'
    );
  END IF;

  -- Mark reservation active
  IF v_res.id IS NOT NULL THEN
    UPDATE public.founders3_reservations
    SET
      status = 'active',
      stripe_subscription_id = p_stripe_subscription_id,
      activated_at = now(),
      released_at = NULL
    WHERE id = v_res.id;

    -- Mark invitation consumed
    IF v_res.invitation_id IS NOT NULL THEN
      UPDATE public.founders3_invitations
      SET
        status = 'consumed',
        used_count = used_count + 1,
        consumed_at = now(),
        updated_at = now()
      WHERE id = v_res.invitation_id;
    END IF;
  ELSE
    -- Direct activation with reservation record creation
    INSERT INTO public.founders3_reservations (
      workspace_id,
      stripe_subscription_id,
      status,
      reserved_at,
      expires_at,
      activated_at
    ) VALUES (
      p_workspace_id,
      p_stripe_subscription_id,
      'active',
      now(),
      p_current_period_end,
      now()
    );
  END IF;

  -- 2. Upsert workspace_subscriptions with Founder's 3 Entitlements
  INSERT INTO public.workspace_subscriptions (
    workspace_id,
    plan_id,
    status,
    provenance,
    monthly_message_limit,
    messages_used_this_period,
    ai_conversations_quota,
    seats_quota,
    channels_quota,
    current_period_start,
    current_period_end,
    grace_period_end,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    cancel_at_period_end,
    dunning_status,
    dunning_attempt_count,
    updated_at
  ) VALUES (
    p_workspace_id,
    'founders3',
    'active',
    'stripe',
    1000,
    0,
    1000,
    3,
    2,
    p_current_period_start,
    p_current_period_end,
    NULL,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    false,
    'none',
    0,
    now()
  )
  ON CONFLICT (workspace_id) DO UPDATE
  SET
    plan_id = 'founders3',
    status = 'active',
    provenance = 'stripe',
    monthly_message_limit = 1000,
    ai_conversations_quota = 1000,
    seats_quota = 3,
    channels_quota = 2,
    current_period_start = p_current_period_start,
    current_period_end = p_current_period_end,
    grace_period_end = NULL,
    stripe_customer_id = COALESCE(p_stripe_customer_id, public.workspace_subscriptions.stripe_customer_id),
    stripe_subscription_id = p_stripe_subscription_id,
    stripe_price_id = p_stripe_price_id,
    cancel_at_period_end = false,
    dunning_status = 'none',
    dunning_attempt_count = 0,
    updated_at = now()
  RETURNING * INTO v_sub;

  -- 3. Update workspaces.plan column for fast lookups
  UPDATE public.workspaces
  SET plan = 'founders3', updated_at = now()
  WHERE id = p_workspace_id;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'plan_id', 'founders3',
    'status', 'active',
    'seats_quota', 3,
    'channels_quota', 2,
    'ai_conversations_quota', 1000,
    'subscription_id', v_sub.id
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. ATOMIC RPC: RELEASE FOUNDER'S 3 RESERVATION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_founders3_reservation_atomic(
  p_workspace_id UUID,
  p_reason TEXT DEFAULT 'checkout_abandoned'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res RECORD;
BEGIN
  SELECT * INTO v_res
  FROM public.founders3_reservations
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_res.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'released', false, 'message', 'No reservation found.');
  END IF;

  -- Active completed subscriptions cannot be released automatically by client
  IF v_res.status = 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CANNOT_RELEASE_ACTIVE',
      'error', 'Active Founder''s 3 enrollment cannot be released without administrator action.'
    );
  END IF;

  UPDATE public.founders3_reservations
  SET
    status = 'released',
    released_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('release_reason', p_reason, 'released_at', now())
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'success', true,
    'released', true,
    'workspace_id', p_workspace_id,
    'reservation_id', v_res.id
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. GRANT LEAST-PRIVILEGE PERMISSIONS
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reserve_founders3_slot_atomic(UUID, TEXT, UUID, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_founders3_enrollment_atomic(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_founders3_reservation_atomic(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_founders3_slot_status(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reserve_founders3_slot_atomic(UUID, TEXT, UUID, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_founders3_enrollment_atomic(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_founders3_reservation_atomic(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_founders3_slot_status(UUID) TO authenticated, service_role;

COMMIT;
