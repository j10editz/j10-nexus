BEGIN;

-- ============================================================================
-- J10 NEXUS TIER 0G/3/4 — FORWARD MIGRATION: CHANNEL METRICS & ATOMIC RESERVATIONS
-- 1. Updates workspace_usage_records metric check constraint for all 9 channels
-- 2. Restores provenance, period-expiration, dunning/grace in record_verified_workspace_usage
-- 3. Creates public.workspace_quota_reservations table with period tracking
-- 4. Creates public.reserve_workspace_quota_atomic with caller auth & workspace idempotency
-- 5. Creates public.settle_workspace_quota_atomic with caller auth & reconciliation
-- 6. Hardens public.release_workspace_quota_atomic with caller auth & ledger consistency
-- 7. Hardens public.record_agent_execution_spend_atomic with caller auth, date-aware reset,
--    daily/monthly/execution ceiling admission, and reservation-bound refunds
-- ============================================================================

-- 1. UPDATE CHECK CONSTRAINT FOR OMNICHANNEL USAGE METRICS & QUANTITY COMPENSATION
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_usage_metric_name'
  ) THEN
    ALTER TABLE public.workspace_usage_records
      DROP CONSTRAINT chk_workspace_usage_metric_name;
  END IF;

  ALTER TABLE public.workspace_usage_records
    ADD CONSTRAINT chk_workspace_usage_metric_name
    CHECK (metric_name IN (
      'whatsapp_outbound',
      'whatsapp_inbound',
      'sms_outbound',
      'email_outbound',
      'instagram_outbound',
      'messenger_outbound',
      'webchat_outbound',
      'website_outbound',
      'crm_outbound',
      'whatsapp_group_outbound',
      'omnichannel_outbound',
      'ai_tokens',
      'ai_agent_run',
      'campaign_broadcast',
      'workflow_execution'
    ));

  -- Allow negative quantity for refund and compensation audit entries
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_usage_records_quantity_check'
  ) THEN
    ALTER TABLE public.workspace_usage_records
      DROP CONSTRAINT workspace_usage_records_quantity_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_usage_records_quantity'
  ) THEN
    ALTER TABLE public.workspace_usage_records
      ADD CONSTRAINT chk_workspace_usage_records_quantity
      CHECK (quantity != 0);
  END IF;
END $$;

-- 2. CREATE DATABASE-BACKED WORKSPACE QUOTA RESERVATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_quota_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released')),
  resource_id TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_period_start TIMESTAMPTZ,
  billing_period_end TIMESTAMPTZ,
  settled_quantity INTEGER,
  released_quantity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT uq_workspace_quota_reservations_ws_id UNIQUE (workspace_id, reservation_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_quota_reservations' AND column_name = 'billing_period_start'
  ) THEN
    ALTER TABLE public.workspace_quota_reservations ADD COLUMN billing_period_start TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_quota_reservations' AND column_name = 'billing_period_end'
  ) THEN
    ALTER TABLE public.workspace_quota_reservations ADD COLUMN billing_period_end TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_quota_reservations' AND column_name = 'settled_quantity'
  ) THEN
    ALTER TABLE public.workspace_quota_reservations ADD COLUMN settled_quantity INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspace_quota_reservations' AND column_name = 'released_quantity'
  ) THEN
    ALTER TABLE public.workspace_quota_reservations ADD COLUMN released_quantity INTEGER;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quota_reservations_ws_status
  ON public.workspace_quota_reservations(workspace_id, status);

ALTER TABLE public.workspace_quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_quota_reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_quota_reservations_select_member" ON public.workspace_quota_reservations;
CREATE POLICY "workspace_quota_reservations_select_member"
  ON public.workspace_quota_reservations
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR public.is_platform_admin(auth.uid())
  );

-- The ledger is mutated only through the atomic SECURITY DEFINER RPCs.  Members
-- may read their workspace's rows through the policy; service_role retains its
-- operational access.
REVOKE ALL ON TABLE public.workspace_quota_reservations FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.workspace_quota_reservations FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.workspace_quota_reservations FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.workspace_quota_reservations TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON TABLE public.workspace_quota_reservations TO service_role';
  END IF;
END;
$$;

-- 3. RECORD VERIFIED WORKSPACE USAGE (RESTORED ENTITLEMENT CHECKS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_verified_workspace_usage(
  p_workspace_id UUID,
  p_metric_name TEXT,
  p_quantity INT DEFAULT 1,
  p_idempotency_key TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_existing_record public.workspace_usage_records%ROWTYPE;
  v_new_record_id UUID;
  v_new_usage INT;
BEGIN
  -- 1. Input sanitization
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage quantity: must be greater than zero',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_quantity > 100000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage quantity: exceeds maximum allowable batch limit',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_metric_name NOT IN (
    'whatsapp_outbound',
    'whatsapp_inbound',
    'sms_outbound',
    'email_outbound',
    'instagram_outbound',
    'messenger_outbound',
    'webchat_outbound',
    'website_outbound',
    'crm_outbound',
    'whatsapp_group_outbound',
    'omnichannel_outbound',
    'ai_tokens',
    'ai_agent_run',
    'campaign_broadcast',
    'workflow_execution'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid metric_name: unrecognized billable metric',
      'limit_reached', false,
      'is_exceeded', false
    );
  END IF;

  -- 2. Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 3. Idempotency Check: if idempotency key was already recorded, return success without re-billing
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    SELECT * INTO v_existing_record
    FROM public.workspace_usage_records
    WHERE workspace_id = p_workspace_id
      AND idempotency_key = nullif(trim(p_idempotency_key), '');

    IF FOUND THEN
      IF v_existing_record.metric_name IS DISTINCT FROM p_metric_name
         OR v_existing_record.quantity IS DISTINCT FROM p_quantity
         OR v_existing_record.resource_id IS DISTINCT FROM p_resource_id
         OR v_existing_record.actor_user_id IS DISTINCT FROM p_actor_user_id
         OR v_existing_record.metadata IS DISTINCT FROM p_metadata THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Idempotency conflict: key already used with different payload',
          'limit_reached', false,
          'is_exceeded', false
        );
      END IF;

      SELECT messages_used_this_period INTO v_new_usage
      FROM public.workspace_subscriptions
      WHERE workspace_id = p_workspace_id;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'record_id', v_existing_record.id,
        'workspace_id', p_workspace_id,
        'messages_used_this_period', COALESCE(v_new_usage, 0),
        'action', 'already_recorded'
      );
    END IF;
  END IF;

  -- 4. Lock subscription row exclusively for atomic evaluation
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No subscription provisioned for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 5. Provenance validation: unverified provenance fails closed
  IF v_sub.provenance = 'none' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription lacks verified billing provenance',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 6. Period boundaries & status
  IF v_sub.provenance = 'internal_grant' THEN
    IF now() > v_sub.current_period_end THEN
      UPDATE public.workspace_subscriptions
      SET current_period_start = now(),
          current_period_end = now() + INTERVAL '1 year',
          messages_used_this_period = 0,
          updated_at = now()
      WHERE workspace_id = p_workspace_id
      RETURNING * INTO v_sub;
    END IF;
  ELSE
    IF v_sub.current_period_end < now() AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Subscription billing period expired',
        'limit_reached', true,
        'is_exceeded', true
      );
    END IF;
  END IF;

  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is inactive (' || v_sub.status || ')',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- Past due grace period check
  IF v_sub.status = 'past_due' AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription payment is past due and grace period has expired',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- Dunning suspension check
  IF v_sub.dunning_status IN ('suspended', 'terminated') AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is suspended due to payment failure',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 7. Quota limit check
  IF v_sub.monthly_message_limit <= 0 OR (v_sub.messages_used_this_period + p_quantity) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'limit_reached', true,
      'is_exceeded', true,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'monthly_message_limit', v_sub.monthly_message_limit
    );
  END IF;

  -- 8. Atomic usage increment
  v_new_usage := v_sub.messages_used_this_period + p_quantity;

  UPDATE public.workspace_subscriptions
  SET
    messages_used_this_period = v_new_usage,
    updated_at = now()
  WHERE id = v_sub.id;

  -- 9. Insert immutable audit record
  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    actor_user_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_workspace_id,
    p_metric_name,
    p_quantity,
    nullif(trim(p_idempotency_key), ''),
    p_resource_id,
    p_actor_user_id,
    v_sub.current_period_start,
    v_sub.current_period_end,
    p_metadata
  )
  RETURNING id INTO v_new_record_id;

  RETURN jsonb_build_object(
    'success', true,
    'record_id', v_new_record_id,
    'workspace_id', p_workspace_id,
    'quantity_recorded', p_quantity,
    'messages_used_this_period', v_new_usage,
    'monthly_message_limit', v_sub.monthly_message_limit,
    'remaining', (v_sub.monthly_message_limit - v_new_usage),
    'is_exceeded', false
  );
END;
$$;

-- 4. ATOMIC WORKSPACE QUOTA RESERVATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_workspace_quota_atomic(
  p_workspace_id UUID,
  p_metric_name TEXT,
  p_quantity INT,
  p_reservation_id TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_res public.workspace_quota_reservations%ROWTYPE;
  v_new_usage INT;
  v_new_record_id UUID;
BEGIN
  -- 1. Input sanitization
  IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'reservation_id is required for atomic quota reservation',
      'limit_reached', false,
      'is_exceeded', false
    );
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage quantity: must be greater than zero',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_metric_name NOT IN (
    'whatsapp_outbound',
    'whatsapp_inbound',
    'sms_outbound',
    'email_outbound',
    'instagram_outbound',
    'messenger_outbound',
    'webchat_outbound',
    'website_outbound',
    'crm_outbound',
    'whatsapp_group_outbound',
    'omnichannel_outbound',
    'ai_tokens',
    'ai_agent_run',
    'campaign_broadcast',
    'workflow_execution'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid metric_name: unrecognized billable metric',
      'limit_reached', false,
      'is_exceeded', false
    );
  END IF;

  -- 2. Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 3. Scope idempotency to workspace and reject reuse with a different payload
  SELECT * INTO v_res
  FROM public.workspace_quota_reservations
  WHERE workspace_id = p_workspace_id
    AND reservation_id = p_reservation_id;

  IF FOUND THEN
      IF v_res.metric_name = p_metric_name
         AND v_res.quantity = p_quantity
         AND v_res.resource_id IS NOT DISTINCT FROM p_resource_id
         AND v_res.actor_user_id IS NOT DISTINCT FROM p_actor_user_id
         AND v_res.metadata IS NOT DISTINCT FROM p_metadata THEN
        SELECT messages_used_this_period INTO v_new_usage
        FROM public.workspace_subscriptions
        WHERE workspace_id = p_workspace_id;

        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'reservation_id', p_reservation_id,
          'quantity_reserved', v_res.quantity,
          'status', v_res.status,
          'messages_used_this_period', COALESCE(v_new_usage, 0),
          'action', 'already_reserved'
        );
      ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Idempotency conflict: reservation ID already used with different payload',
        'limit_reached', false,
        'is_exceeded', false
      );
      END IF;
  END IF;

  -- 4. Lock subscription row exclusively for atomic evaluation
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No subscription provisioned for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 5. Provenance validation: unverified provenance fails closed
  IF v_sub.provenance = 'none' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription lacks verified billing provenance',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 6. Period boundaries & status
  IF v_sub.provenance = 'internal_grant' THEN
    IF now() > v_sub.current_period_end THEN
      UPDATE public.workspace_subscriptions
      SET current_period_start = now(),
          current_period_end = now() + INTERVAL '1 year',
          messages_used_this_period = 0,
          updated_at = now()
      WHERE workspace_id = p_workspace_id
      RETURNING * INTO v_sub;
    END IF;
  ELSE
    IF v_sub.current_period_end < now() AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Subscription billing period expired',
        'limit_reached', true,
        'is_exceeded', true
      );
    END IF;
  END IF;

  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is inactive (' || v_sub.status || ')',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- Past due grace period check
  IF v_sub.status = 'past_due' AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription payment is past due and grace period has expired',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF v_sub.dunning_status IN ('suspended', 'terminated') AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is suspended due to payment failure',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 7. Quota limit check
  IF v_sub.monthly_message_limit <= 0 OR (v_sub.messages_used_this_period + p_quantity) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'limit_reached', true,
      'is_exceeded', true,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'monthly_message_limit', v_sub.monthly_message_limit
    );
  END IF;

  -- 8. Atomic deduction
  v_new_usage := v_sub.messages_used_this_period + p_quantity;

  UPDATE public.workspace_subscriptions
  SET
    messages_used_this_period = v_new_usage,
    updated_at = now()
  WHERE id = v_sub.id;

  -- 9. Create reservation row with period tracking
  INSERT INTO public.workspace_quota_reservations (
    reservation_id,
    workspace_id,
    metric_name,
    quantity,
    status,
    resource_id,
    actor_user_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_reservation_id,
    p_workspace_id,
    p_metric_name,
    p_quantity,
    'reserved',
    p_resource_id,
    p_actor_user_id,
    v_sub.current_period_start,
    v_sub.current_period_end,
    p_metadata
  );

  -- 10. Write accounting record in same atomic transaction
  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    actor_user_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_workspace_id,
    p_metric_name,
    p_quantity,
    p_reservation_id,
    p_resource_id,
    p_actor_user_id,
    v_sub.current_period_start,
    v_sub.current_period_end,
    jsonb_build_object('is_reservation', true, 'reservation_id', p_reservation_id) || p_metadata
  )
  RETURNING id INTO v_new_record_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'record_id', v_new_record_id,
    'workspace_id', p_workspace_id,
    'quantity_reserved', p_quantity,
    'messages_used_this_period', v_new_usage,
    'monthly_message_limit', v_sub.monthly_message_limit,
    'remaining', (v_sub.monthly_message_limit - v_new_usage),
    'is_exceeded', false
  );
END;
$$;

-- 5. ATOMIC WORKSPACE QUOTA SETTLEMENT RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_workspace_quota_atomic(
  p_workspace_id UUID,
  p_reservation_id TEXT,
  p_actual_quantity INT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res public.workspace_quota_reservations%ROWTYPE;
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_diff INT := 0;
  v_final_qty INT;
  v_new_usage INT;
BEGIN
  IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'reservation_id is required');
  END IF;

  -- Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: caller lacks operational authority for this workspace');
  END IF;

  SELECT * INTO v_res
  FROM public.workspace_quota_reservations
  WHERE workspace_id = p_workspace_id
    AND reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation not found');
  END IF;

  IF v_res.status = 'settled' THEN
    IF p_actual_quantity IS NOT NULL AND p_actual_quantity != v_res.settled_quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'Idempotency conflict: reservation already settled with different quantity');
    END IF;
    SELECT messages_used_this_period INTO v_new_usage
    FROM public.workspace_subscriptions
    WHERE workspace_id = p_workspace_id;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'status', 'already_settled', 'messages_used_this_period', COALESCE(v_new_usage, 0));
  END IF;

  IF v_res.status != 'reserved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reservation cannot be settled from status: ' || v_res.status);
  END IF;

  v_final_qty := COALESCE(p_actual_quantity, v_res.quantity);
  v_diff := v_res.quantity - v_final_qty; -- if actual is less, refund difference

  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_diff != 0 THEN
    v_new_usage := GREATEST(0, v_sub.messages_used_this_period - v_diff);
    UPDATE public.workspace_subscriptions
    SET messages_used_this_period = v_new_usage, updated_at = now()
    WHERE id = v_sub.id;
  ELSE
    v_new_usage := v_sub.messages_used_this_period;
  END IF;

  UPDATE public.workspace_quota_reservations
  SET status = 'settled',
      settled_quantity = v_final_qty,
      updated_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata
  WHERE id = v_res.id;

  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_workspace_id,
    v_res.metric_name,
    v_final_qty,
    'settle-' || p_reservation_id,
    v_res.resource_id,
    v_res.billing_period_start,
    v_res.billing_period_end,
    jsonb_build_object('action', 'settlement', 'reservation_id', p_reservation_id, 'diff', v_diff) || p_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'settled_quantity', v_final_qty,
    'messages_used_this_period', v_new_usage
  );
END;
$$;

-- 6. ATOMIC QUOTA RELEASE AND COMPENSATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_workspace_quota_atomic(
  p_workspace_id UUID,
  p_reservation_id TEXT,
  p_reason TEXT DEFAULT 'execution_failure'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_res public.workspace_quota_reservations%ROWTYPE;
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_new_usage INT;
BEGIN
  IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'reservation_id is required for atomic quota release'
    );
  END IF;

  -- Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace'
    );
  END IF;

  -- 1. Lock reservation row exclusively
  SELECT * INTO v_res
  FROM public.workspace_quota_reservations
  WHERE workspace_id = p_workspace_id
    AND reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reservation not found'
    );
  END IF;

  -- 2. Idempotency: If already released, return existing state without duplicate decrement
  IF v_res.status = 'released' THEN
    SELECT messages_used_this_period INTO v_new_usage
    FROM public.workspace_subscriptions
    WHERE workspace_id = p_workspace_id;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'reservation_id', p_reservation_id,
      'status', 'already_released',
      'messages_used_this_period', COALESCE(v_new_usage, 0)
    );
  END IF;

  IF v_res.status != 'reserved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reservation cannot be released from status: ' || v_res.status
    );
  END IF;

  -- 3. Lock subscription row
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription not found'
    );
  END IF;

  -- 4. Atomically refund the reserved messages
  v_new_usage := GREATEST(0, v_sub.messages_used_this_period - v_res.quantity);

  UPDATE public.workspace_subscriptions
  SET
    messages_used_this_period = v_new_usage,
    updated_at = now()
  WHERE id = v_sub.id;

  -- 5. Mark reservation as released
  UPDATE public.workspace_quota_reservations
  SET
    status = 'released',
    released_quantity = v_res.quantity,
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('release_reason', p_reason, 'released_at', now())
  WHERE id = v_res.id;

  -- 6. Write compensation record in usage ledger with negative quantity
  INSERT INTO public.workspace_usage_records (
    workspace_id,
    metric_name,
    quantity,
    idempotency_key,
    resource_id,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_workspace_id,
    v_res.metric_name,
    -v_res.quantity,
    'rel-' || p_reservation_id,
    v_res.resource_id,
    v_res.billing_period_start,
    v_res.billing_period_end,
    jsonb_build_object('action', 'quota_release', 'reservation_id', p_reservation_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'released_quantity', v_res.quantity,
    'messages_used_this_period', v_new_usage
  );
END;
$$;

-- 7. ATOMIC AGENT SPEND ADMISSION AND RECORDING RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_agent_execution_spend_atomic(
  p_workspace_id UUID,
  p_agent_id TEXT,
  p_cost_usd NUMERIC,
  p_reservation_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_budget public.ai_agent_budgets%ROWTYPE;
  v_res public.workspace_quota_reservations%ROWTYPE;
  v_is_authorized BOOLEAN := false;
  v_today DATE := CURRENT_DATE;
  v_current_daily NUMERIC;
  v_current_monthly NUMERIC;
  v_new_daily NUMERIC;
  v_new_monthly NUMERIC;
  v_exceeds_daily BOOLEAN := false;
  v_exceeds_monthly BOOLEAN := false;
  v_exceeds_ceiling BOOLEAN := false;
BEGIN
  IF p_cost_usd IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cost must not be null',
      'can_execute', false
    );
  END IF;

  -- Caller Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL AND (
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR public.is_platform_admin(auth.uid())
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks operational authority for this workspace',
      'can_execute', false
    );
  END IF;

  -- Negative spend adjustment security: prevent arbitrary negative adjustments
  IF p_cost_usd < 0 THEN
    IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Negative spend adjustments must be tied to a valid reservation ID',
        'can_execute', false
      );
    END IF;

    SELECT * INTO v_res
    FROM public.workspace_quota_reservations
    WHERE workspace_id = p_workspace_id
      AND reservation_id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Negative spend adjustments must be tied to a valid reservation ID',
        'can_execute', false
      );
    END IF;
  END IF;

  -- Lock budget row
  SELECT * INTO v_budget
  FROM public.ai_agent_budgets
  WHERE workspace_id = p_workspace_id AND agent_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Return allowed default if no custom budget configured
    RETURN jsonb_build_object(
      'success', true,
      'can_execute', true,
      'action', 'default_allow'
    );
  END IF;

  -- Date-aware comparison using DATE type: reset spend if day or month changed
  IF v_budget.last_reset_date < v_today THEN
    v_current_daily := 0.0;
    IF date_trunc('month', v_budget.last_reset_date) < date_trunc('month', v_today) THEN
      v_current_monthly := 0.0;
    ELSE
      v_current_monthly := v_budget.current_monthly_spend_usd;
    END IF;
  ELSE
    v_current_daily := v_budget.current_daily_spend_usd;
    v_current_monthly := v_budget.current_monthly_spend_usd;
  END IF;

  -- Enforce daily, monthly and per-execution limits atomically
  IF p_cost_usd > 0 THEN
    v_exceeds_daily := (v_current_daily + p_cost_usd) > v_budget.daily_budget_usd;
    v_exceeds_monthly := (v_current_monthly + p_cost_usd) > v_budget.monthly_budget_usd;
    v_exceeds_ceiling := p_cost_usd > v_budget.max_cost_per_execution_usd;

    IF v_exceeds_daily OR v_exceeds_monthly OR v_exceeds_ceiling THEN
      IF v_budget.over_budget_policy = 'hard_stop' THEN
        RETURN jsonb_build_object(
          'success', false,
          'can_execute', false,
          'action_required', 'hard_stop',
          'error', 'Agent daily or monthly budget limit exhausted (hard_stop)',
          'current_daily_spend', v_current_daily,
          'daily_budget_usd', v_budget.daily_budget_usd,
          'current_monthly_spend', v_current_monthly,
          'monthly_budget_usd', v_budget.monthly_budget_usd
        );
      ELSIF v_budget.over_budget_policy = 'require_approval' THEN
        RETURN jsonb_build_object(
          'success', false,
          'can_execute', false,
          'action_required', 'require_approval',
          'error', 'Agent budget limit reached: requires human approval (require_approval)',
          'current_daily_spend', v_current_daily,
          'daily_budget_usd', v_budget.daily_budget_usd
        );
      END IF;
      -- notify_only allows execution
    END IF;
  END IF;

  v_new_daily := GREATEST(0.0, v_current_daily + p_cost_usd);
  v_new_monthly := GREATEST(0.0, v_current_monthly + p_cost_usd);

  UPDATE public.ai_agent_budgets
  SET
    current_daily_spend_usd = v_new_daily,
    current_monthly_spend_usd = v_new_monthly,
    last_reset_date = v_today,
    updated_at = now()
  WHERE id = v_budget.id;

  RETURN jsonb_build_object(
    'success', true,
    'can_execute', true,
    'daily_spend_usd', v_new_daily,
    'monthly_spend_usd', v_new_monthly,
    'daily_budget_usd', v_budget.daily_budget_usd,
    'remaining_daily_usd', GREATEST(0, v_budget.daily_budget_usd - v_new_daily)
  );
END;
$$;

-- 8. RESTRICT EXECUTE PRIVILEGES TO AUTHENTICATED CALLERS
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_workspace_quota_atomic(uuid, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_workspace_quota_atomic(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_agent_execution_spend_atomic(uuid, text, numeric, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.settle_workspace_quota_atomic(uuid, text, integer, jsonb) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.release_workspace_quota_atomic(uuid, text, text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_agent_execution_spend_atomic(uuid, text, numeric, text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_workspace_quota_atomic(uuid, text, integer, jsonb) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_workspace_quota_atomic(uuid, text, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_agent_execution_spend_atomic(uuid, text, numeric, text) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.settle_workspace_quota_atomic(uuid, text, integer, jsonb) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.release_workspace_quota_atomic(uuid, text, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_agent_execution_spend_atomic(uuid, text, numeric, text) TO service_role';
  END IF;
END;
$$;

COMMIT;
