-- ============================================================================
-- J10 NEXUS: Founder's 3 Strict State Separation & Cryptographic Hash Migration
-- Migration: 20261004_founders3_strict_state_and_hash_isolation.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEPARATE CANONICAL STRIPE STATE FROM J10 ENTITLEMENT STATE
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS entitlement_state TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS billing_hold_reason TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seats_quota INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS channels_quota INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ai_conversations_quota INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS founder_cycle_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS founder_cycle_target INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS founder_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_transition_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_subscription_schedule_id TEXT,
  ADD COLUMN IF NOT EXISTS price_transition_status TEXT DEFAULT 'none';

-- Ensure constraints enforce strict Stripe statuses vs J10 internal entitlement states
DO $$
BEGIN
  -- Canonical Stripe Status Constraint
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_subscriptions_stripe_status_check') THEN
    ALTER TABLE public.workspace_subscriptions DROP CONSTRAINT workspace_subscriptions_stripe_status_check;
  END IF;
  ALTER TABLE public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_stripe_status_check
    CHECK (stripe_status IN (
      'trialing',
      'active',
      'incomplete',
      'incomplete_expired',
      'past_due',
      'canceled',
      'unpaid',
      'paused',
      'none'
    ));

  -- J10 Internal Entitlement State Constraint
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_subscriptions_entitlement_state_check') THEN
    ALTER TABLE public.workspace_subscriptions DROP CONSTRAINT workspace_subscriptions_entitlement_state_check;
  END IF;
  ALTER TABLE public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_entitlement_state_check
    CHECK (entitlement_state IN (
      'active',
      'grace_period',
      'restricted',
      'paused',
      'canceled',
      'none'
    ));

  -- Billing Hold Reason Constraint
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_subscriptions_billing_hold_reason_check') THEN
    ALTER TABLE public.workspace_subscriptions DROP CONSTRAINT workspace_subscriptions_billing_hold_reason_check;
  END IF;
  ALTER TABLE public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_billing_hold_reason_check
    CHECK (billing_hold_reason IN (
      'none',
      'dunning_grace',
      'dunning_expired',
      'dispute_open',
      'refunded',
      'seat_cap_exceeded',
      'user_paused'
    ));

  -- Price Transition Status Constraint
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_subscriptions_price_transition_status_check') THEN
    ALTER TABLE public.workspace_subscriptions DROP CONSTRAINT workspace_subscriptions_price_transition_status_check;
  END IF;
  ALTER TABLE public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_price_transition_status_check
    CHECK (price_transition_status IN (
      'introductory',
      'transition_pending',
      'schedule_created',
      'transition_applied',
      'transition_failed',
      'reconciliation_required',
      'scheduled',
      'transitioned',
      'canceled',
      'none'
    ));

  -- Maintain backward compatibility on legacy status column
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_subscriptions_status_check') THEN
    ALTER TABLE public.workspace_subscriptions DROP CONSTRAINT workspace_subscriptions_status_check;
  END IF;
  ALTER TABLE public.workspace_subscriptions
    ADD CONSTRAINT workspace_subscriptions_status_check
    CHECK (status IN (
      'trialing',
      'active',
      'incomplete',
      'incomplete_expired',
      'past_due',
      'canceled',
      'canceled_at_period_end',
      'unpaid',
      'paused',
      'none'
    ));
END $$;

-- ----------------------------------------------------------------------------
-- 2. FOUNDER'S 3 INVITATIONS (SHA-256 HASH STORAGE ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founders3_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invitation_code_hash TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill and verify every legacy invitation before removing plaintext codes.
-- The legacy reservation RPC and its column-owned indexes/constraint are
-- migration-owned and recreated below against invitation_code_hash.
DROP FUNCTION IF EXISTS public.reserve_founders3_slot_atomic(UUID, TEXT, UUID, UUID, INT);

DO $$
DECLARE
  v_table_oid oid := 'public.founders3_invitations'::regclass;
  v_code_attnum smallint;
  v_constraint record;
  v_index record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'founders3_invitations' AND column_name = 'invitation_code'
  ) THEN
    SELECT attnum INTO v_code_attnum
    FROM pg_attribute
    WHERE attrelid = v_table_oid
      AND attname = 'invitation_code'
      AND NOT attisdropped;

    ALTER TABLE public.founders3_invitations ADD COLUMN IF NOT EXISTS invitation_code_hash TEXT;
    UPDATE public.founders3_invitations
    SET invitation_code_hash = encode(sha256(invitation_code::bytea), 'hex')
    WHERE invitation_code_hash IS NULL;

    IF EXISTS (
      SELECT 1
      FROM public.founders3_invitations
      WHERE invitation_code IS NULL OR invitation_code_hash IS NULL
    ) THEN
      RAISE EXCEPTION 'Refusing to remove founders3_invitations.invitation_code: every legacy value must have a non-null SHA-256 hash.';
    END IF;

    IF (SELECT count(*) FROM public.founders3_invitations)
       <> (SELECT count(DISTINCT invitation_code_hash) FROM public.founders3_invitations) THEN
      RAISE EXCEPTION 'Refusing to remove founders3_invitations.invitation_code: derived hashes are not one-to-one.';
    END IF;

    -- Remove only database dependencies owned by the legacy column.
    FOR v_constraint IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = v_table_oid AND v_code_attnum = ANY (conkey)
    LOOP
      EXECUTE format('ALTER TABLE public.founders3_invitations DROP CONSTRAINT IF EXISTS %I', v_constraint.conname);
    END LOOP;

    FOR v_index IN
      SELECT indexrelid::regclass::text AS index_name
      FROM pg_index
      WHERE indrelid = v_table_oid
        AND v_code_attnum = ANY (indkey)
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS %s', v_index.index_name);
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM pg_depend d
      WHERE d.refobjid = v_table_oid
        AND d.refobjsubid = v_code_attnum
        AND d.deptype IN ('a', 'n')
    ) THEN
      RAISE EXCEPTION 'Refusing to remove founders3_invitations.invitation_code: a remaining database object depends on it.';
    END IF;

    ALTER TABLE public.founders3_invitations ALTER COLUMN invitation_code_hash SET NOT NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'uq_f3_invitations_code_hash' AND conrelid = v_table_oid
    ) THEN
      ALTER TABLE public.founders3_invitations ADD CONSTRAINT uq_f3_invitations_code_hash UNIQUE(invitation_code_hash);
    END IF;
    ALTER TABLE public.founders3_invitations DROP COLUMN invitation_code;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_f3_invitations_ws ON public.founders3_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_f3_invitations_hash ON public.founders3_invitations(invitation_code_hash);

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
-- 3. FOUNDER'S 3 RESERVATIONS & CHECKOUT IDENTITY BINDING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.founders3_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invitation_id UUID REFERENCES public.founders3_invitations(id) ON DELETE SET NULL,
  checkout_attempt_id UUID,
  checkout_id UUID REFERENCES public.payment_checkouts(id) ON DELETE SET NULL,
  stripe_checkout_session_id TEXT,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'released', 'canceled', 'revoked')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.founders3_reservations
  ADD COLUMN IF NOT EXISTS checkout_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_f3_reservations_status ON public.founders3_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_f3_reservations_ws ON public.founders3_reservations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_f3_reservations_session ON public.founders3_reservations(stripe_checkout_session_id);

ALTER TABLE public.founders3_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founders3_reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founders3_reservations_select_member" ON public.founders3_reservations;
CREATE POLICY "founders3_reservations_select_member" ON public.founders3_reservations
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR public.is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 4. ATOMIC RPC: GET FOUNDER'S 3 SLOT STATUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_founders3_slot_status(p_workspace_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
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
-- 5. ATOMIC RPC: RESERVE FOUNDER'S 3 SLOT (HASH-BASED WITH ROW LOCKING)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reserve_founders3_slot_atomic(UUID, TEXT, UUID, INT);
DROP FUNCTION IF EXISTS public.reserve_founders3_slot_atomic(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.reserve_founders3_slot_atomic(UUID, TEXT);
DROP FUNCTION IF EXISTS public.reserve_founders3_slot_atomic(UUID, TEXT, UUID, UUID, INT);

CREATE OR REPLACE FUNCTION public.reserve_founders3_slot_atomic(
  p_workspace_id UUID,
  p_invitation_code_hash TEXT,
  p_checkout_attempt_id UUID DEFAULT NULL,
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
      'code', 'UNAUTHORIZED_WORKSPACE_ACCESS',
      'error', 'Only workspace owners and administrators can reserve Founder''s 3 slots.'
    );
  END IF;

  -- 1. Validate invitation by SHA-256 hash
  SELECT * INTO v_invitation
  FROM public.founders3_invitations
  WHERE invitation_code_hash = p_invitation_code_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVITATION_NOT_FOUND',
      'error', 'Founder''s 3 invitation code does not exist.'
    );
  END IF;

  IF v_invitation.workspace_id != p_workspace_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVITATION_WORKSPACE_MISMATCH',
      'error', 'This invitation code is bound to a different workspace.'
    );
  END IF;

  IF v_invitation.status = 'consumed' OR v_invitation.used_count >= v_invitation.max_uses THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVITATION_CONSUMED',
      'error', 'This single-use invitation has already been redeemed.'
    );
  END IF;

  IF v_invitation.status != 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVITATION_INACTIVE',
      'error', 'This invitation is no longer active.'
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

  -- Hold or refresh reservation slot
  IF v_existing_res.id IS NOT NULL THEN
    UPDATE public.founders3_reservations
    SET
      invitation_id = v_invitation.id,
      checkout_attempt_id = COALESCE(p_checkout_attempt_id, checkout_attempt_id),
      checkout_id = COALESCE(p_checkout_id, checkout_id),
      status = 'pending',
      reserved_at = now(),
      expires_at = v_expires_at,
      released_at = NULL,
      metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reserved_by}', to_jsonb(COALESCE(v_caller_id::text, 'system')))
    WHERE id = v_existing_res.id
    RETURNING id INTO v_new_res_id;
  ELSE
    INSERT INTO public.founders3_reservations (
      workspace_id,
      invitation_id,
      checkout_attempt_id,
      checkout_id,
      status,
      reserved_at,
      expires_at,
      metadata
    ) VALUES (
      p_workspace_id,
      v_invitation.id,
      p_checkout_attempt_id,
      p_checkout_id,
      'pending',
      now(),
      v_expires_at,
      jsonb_build_object('reserved_by', v_caller_id)
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
-- 6. ATOMIC RPC: BIND STRIPE CHECKOUT SESSION TO RESERVATION
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.bind_founders3_checkout_session_atomic(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.bind_founders3_checkout_session_atomic(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.bind_founders3_checkout_session_atomic(
  p_workspace_id UUID,
  p_checkout_attempt_id UUID,
  p_stripe_checkout_session_id TEXT
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
  WHERE workspace_id = p_workspace_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending reservation found for workspace.');
  END IF;

  UPDATE public.founders3_reservations
  SET
    stripe_checkout_session_id = p_stripe_checkout_session_id,
    checkout_attempt_id = COALESCE(p_checkout_attempt_id, checkout_attempt_id),
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{bound_at}', to_jsonb(now()::text))
  WHERE id = v_res.id;

  RETURN jsonb_build_object('success', true, 'reservation_id', v_res.id, 'session_id', p_stripe_checkout_session_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. ATOMIC RPC: ACTIVATE FOUNDER'S 3 ENROLLMENT (ON INVOICE.PAID SIGNAL)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.activate_founders3_enrollment_atomic(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.activate_founders3_enrollment_atomic(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.activate_founders3_enrollment_atomic(
  p_workspace_id UUID,
  p_stripe_subscription_id TEXT,
  p_stripe_customer_id TEXT,
  p_stripe_price_id TEXT DEFAULT 'price_founders3_monthly_99',
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
      stripe_customer_id = p_stripe_customer_id,
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
    INSERT INTO public.founders3_reservations (
      workspace_id,
      status,
      stripe_subscription_id,
      stripe_customer_id,
      reserved_at,
      expires_at,
      activated_at
    ) VALUES (
      p_workspace_id,
      'active',
      p_stripe_subscription_id,
      p_stripe_customer_id,
      now(),
      now() + interval '100 years',
      now()
    ) RETURNING * INTO v_res;
  END IF;

  -- 2. Upsert workspace subscription with strict canonical state separation
  INSERT INTO public.workspace_subscriptions (
    workspace_id,
    plan_id,
    status,
    stripe_status,
    entitlement_state,
    billing_hold_reason,
    provenance,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    monthly_message_limit,
    seats_quota,
    channels_quota,
    ai_conversations_quota,
    messages_used_this_period,
    current_period_start,
    current_period_end,
    grace_period_end,
    cancel_at_period_end,
    dunning_status,
    founder_cycle_count,
    founder_cycle_target,
    founder_start_date,
    expected_transition_date,
    price_transition_status,
    updated_at
  ) VALUES (
    p_workspace_id,
    'founders3',
    'active',
    'active',
    'active',
    'none',
    'stripe',
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    1000,
    3,
    2,
    1000,
    0,
    p_current_period_start,
    p_current_period_end,
    NULL,
    false,
    'none',
    1,
    12,
    p_current_period_start,
    p_current_period_start + interval '12 months',
    'introductory',
    now()
  )
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id = 'founders3',
    status = 'active',
    stripe_status = 'active',
    entitlement_state = 'active',
    billing_hold_reason = 'none',
    provenance = 'stripe',
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    monthly_message_limit = 1000,
    seats_quota = 3,
    channels_quota = 2,
    ai_conversations_quota = 1000,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    grace_period_end = NULL,
    cancel_at_period_end = false,
    dunning_status = 'none',
    founder_cycle_count = GREATEST(public.workspace_subscriptions.founder_cycle_count, 1),
    founder_cycle_target = 12,
    founder_start_date = COALESCE(public.workspace_subscriptions.founder_start_date, EXCLUDED.current_period_start),
    expected_transition_date = COALESCE(public.workspace_subscriptions.expected_transition_date, EXCLUDED.current_period_start + interval '12 months'),
    price_transition_status = CASE
      WHEN public.workspace_subscriptions.founder_cycle_count >= 12 THEN 'transitioned'
      ELSE 'introductory'
    END,
    updated_at = now()
  RETURNING * INTO v_sub;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'status', 'active',
    'stripe_status', 'active',
    'entitlement_state', 'active',
    'founder_cycle_count', v_sub.founder_cycle_count,
    'founder_cycle_target', v_sub.founder_cycle_target,
    'expected_transition_date', v_sub.expected_transition_date,
    'price_transition_status', v_sub.price_transition_status,
    'subscription_id', v_sub.id,
    'message', 'Founder''s 3 active entitlements successfully provisioned on payment confirmation.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. ATOMIC RPC: RECORD FOUNDER PAID CYCLE & RECONCILE 12-MONTH TRANSITION
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_founder_paid_cycle_atomic(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS public.record_founder_paid_cycle_atomic(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_founder_paid_cycle_atomic(
  p_workspace_id UUID,
  p_stripe_subscription_id TEXT,
  p_stripe_invoice_id TEXT,
  p_stripe_price_id TEXT DEFAULT 'price_founders3_monthly_99',
  p_current_period_start TIMESTAMPTZ DEFAULT now(),
  p_current_period_end TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  p_schedule_id TEXT DEFAULT NULL,
  p_price_transition_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub RECORD;
  v_new_cycle INT := 1;
  v_new_status TEXT := 'introductory';
  v_transition_date TIMESTAMPTZ;
  v_start_date TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Fallback: activate enrollment
    RETURN public.activate_founders3_enrollment_atomic(
      p_workspace_id,
      p_stripe_subscription_id,
      NULL,
      p_stripe_price_id,
      p_current_period_start,
      p_current_period_end
    );
  END IF;

  v_start_date := COALESCE(v_sub.founder_start_date, p_current_period_start);
  v_transition_date := COALESCE(v_sub.expected_transition_date, v_start_date + interval '12 months');
  v_new_cycle := COALESCE(v_sub.founder_cycle_count, 0) + 1;

  IF p_price_transition_status IS NOT NULL THEN
    v_new_status := p_price_transition_status;
  ELSIF v_new_cycle >= 12 THEN
    IF p_stripe_price_id LIKE '%standard%' OR p_stripe_price_id LIKE '%149%' THEN
      v_new_status := 'transition_applied';
    ELSIF p_schedule_id IS NOT NULL OR v_sub.stripe_subscription_schedule_id IS NOT NULL THEN
      v_new_status := 'schedule_created';
    ELSE
      v_new_status := 'transitioned';
    END IF;
  ELSE
    IF p_schedule_id IS NOT NULL OR v_sub.stripe_subscription_schedule_id IS NOT NULL THEN
      v_new_status := 'schedule_created';
    ELSE
      v_new_status := 'introductory';
    END IF;
  END IF;

  UPDATE public.workspace_subscriptions
  SET
    status = 'active',
    stripe_status = 'active',
    entitlement_state = 'active',
    billing_hold_reason = 'none',
    stripe_subscription_id = COALESCE(p_stripe_subscription_id, stripe_subscription_id),
    stripe_price_id = COALESCE(p_stripe_price_id, stripe_price_id),
    stripe_subscription_schedule_id = COALESCE(p_schedule_id, stripe_subscription_schedule_id),
    current_period_start = p_current_period_start,
    current_period_end = p_current_period_end,
    founder_start_date = v_start_date,
    expected_transition_date = v_transition_date,
    founder_cycle_count = v_new_cycle,
    founder_cycle_target = 12,
    price_transition_status = v_new_status,
    messages_used_this_period = 0,
    dunning_status = 'none',
    grace_period_end = NULL,
    updated_at = now()
  WHERE id = v_sub.id
  RETURNING * INTO v_sub;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'subscription_id', v_sub.id,
    'founder_cycle_count', v_sub.founder_cycle_count,
    'founder_cycle_target', v_sub.founder_cycle_target,
    'price_transition_status', v_sub.price_transition_status,
    'expected_transition_date', v_sub.expected_transition_date,
    'is_transitioned', v_sub.founder_cycle_count >= 12
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. ATOMIC RPC: RELEASE RESERVATION
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

  IF NOT FOUND OR v_res.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', true,
      'released', false,
      'message', 'No pending reservation found to release.'
    );
  END IF;

  UPDATE public.founders3_reservations
  SET
    status = 'released',
    released_at = now(),
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{release_reason}', to_jsonb(p_reason))
  WHERE id = v_res.id;

  RETURN jsonb_build_object(
    'success', true,
    'released', true,
    'workspace_id', p_workspace_id,
    'reason', p_reason
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. ATOMIC RPC: CLEANUP EXPIRED RESERVATIONS (SWEEPER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_founders3_reservations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH expired_rows AS (
    UPDATE public.founders3_reservations
    SET
      status = 'released',
      released_at = now(),
      metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{release_reason}', to_jsonb('ttl_expired'::text))
    WHERE status = 'pending' AND expires_at <= now()
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired_rows;

  RETURN jsonb_build_object('success', true, 'expired_released_count', v_count);
END;
$$;

-- Grant RPC execution
GRANT EXECUTE ON FUNCTION public.get_founders3_slot_status(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_founders3_slot_atomic(UUID, TEXT, UUID, UUID, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bind_founders3_checkout_session_atomic(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_founders3_enrollment_atomic(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_founder_paid_cycle_atomic(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_founders3_reservation_atomic(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_founders3_reservations() TO service_role;
