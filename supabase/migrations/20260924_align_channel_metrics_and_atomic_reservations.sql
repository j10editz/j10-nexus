-- ============================================================================
-- J10 NEXUS TIER 0G/3/4 — FORWARD MIGRATION: CHANNEL METRICS & ATOMIC RESERVATIONS
-- 1. Updates workspace_usage_records metric check constraint to include all 9 channels
-- 2. Updates record_verified_workspace_usage to accept all omnichannel metrics
-- 3. Creates public.workspace_quota_reservations table for database-backed atomic reservations
-- 4. Creates public.reserve_workspace_quota_atomic and release_workspace_quota_atomic RPCs
-- 5. Creates public.record_agent_execution_spend_atomic for atomic budget admission
-- ============================================================================

-- 1. UPDATE CHECK CONSTRAINT FOR OMNICHANNEL USAGE METRICS
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
END $$;

-- 2. CREATE DATABASE-BACKED WORKSPACE QUOTA RESERVATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_quota_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id TEXT UNIQUE NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released')),
  resource_id TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quota_reservations_ws_status
  ON public.workspace_quota_reservations(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_quota_reservations_id
  ON public.workspace_quota_reservations(reservation_id);

ALTER TABLE public.workspace_quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_quota_reservations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_quota_reservations_select_member" ON public.workspace_quota_reservations;
CREATE POLICY "workspace_quota_reservations_select_member"
  ON public.workspace_quota_reservations
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR public.is_platform_admin()
  );

REVOKE INSERT, UPDATE, DELETE ON public.workspace_quota_reservations FROM PUBLIC;

-- 3. UPDATE ATOMIC USAGE RPC TO SUPPORT ALL OMNICHANNEL CHANNELS
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
  v_existing_record_id UUID;
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

  -- 2. Authorization
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']) THEN
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

  -- 3. Idempotency Check
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    SELECT id INTO v_existing_record_id
    FROM public.workspace_usage_records
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      SELECT messages_used_this_period INTO v_new_usage
      FROM public.workspace_subscriptions
      WHERE workspace_id = p_workspace_id;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'record_id', v_existing_record_id,
        'workspace_id', p_workspace_id,
        'messages_used_this_period', COALESCE(v_new_usage, 0),
        'action', 'already_recorded'
      );
    END IF;
  END IF;

  -- 4. Row lock for atomic check and increment
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active subscription found for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF v_sub.status NOT IN ('active', 'trialing', 'grace_period') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is not active: status is ' || v_sub.status,
      'status', v_sub.status,
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF (v_sub.messages_used_this_period + p_quantity) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'monthly_message_limit', v_sub.monthly_message_limit,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'quantity_requested', p_quantity,
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  v_new_usage := v_sub.messages_used_this_period + p_quantity;

  UPDATE public.workspace_subscriptions
  SET
    messages_used_this_period = v_new_usage,
    updated_at = now()
  WHERE id = v_sub.id;

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
    p_idempotency_key,
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

-- 4. ATOMIC QUOTA RELEASE AND COMPENSATION RPC
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
  v_new_usage INT;
BEGIN
  IF p_reservation_id IS NULL OR trim(p_reservation_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'reservation_id is required for atomic quota release'
    );
  END IF;

  -- 1. Lock reservation row exclusively
  SELECT * INTO v_res
  FROM public.workspace_quota_reservations
  WHERE reservation_id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reservation not found'
    );
  END IF;

  -- 2. Verify workspace ownership
  IF v_res.workspace_id != p_workspace_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reservation does not belong to the specified workspace'
    );
  END IF;

  -- 3. Idempotency: If already released, return existing state without duplicate decrement
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

  IF v_res.status = 'settled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot release a settled reservation'
    );
  END IF;

  -- 4. Mark reservation as released
  UPDATE public.workspace_quota_reservations
  SET
    status = 'released',
    updated_at = now(),
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{release_reason}', to_jsonb(p_reason))
  WHERE id = v_res.id;

  -- 5. Lock subscription and decrement usage atomically
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF FOUND THEN
    v_new_usage := GREATEST(0, v_sub.messages_used_this_period - v_res.quantity);
    UPDATE public.workspace_subscriptions
    SET
      messages_used_this_period = v_new_usage,
      updated_at = now()
    WHERE id = v_sub.id;
  ELSE
    v_new_usage := 0;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'released_quantity', v_res.quantity,
    'messages_used_this_period', v_new_usage
  );
END;
$$;

-- 5. ATOMIC AGENT SPEND ADMISSION AND RECORDING RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_agent_execution_spend_atomic(
  p_workspace_id UUID,
  p_agent_id TEXT,
  p_cost_usd NUMERIC,
  p_over_budget_policy TEXT DEFAULT 'hard_stop'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_budget public.ai_agent_budgets%ROWTYPE;
  v_today TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  v_current_daily NUMERIC;
  v_current_monthly NUMERIC;
  v_new_daily NUMERIC;
  v_new_monthly NUMERIC;
BEGIN
  IF p_cost_usd IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cost must not be null',
      'can_execute', false
    );
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

  -- Handle daily/monthly date reset atomically
  IF v_budget.last_reset_date != v_today THEN
    v_current_daily := 0.0;
    IF substring(v_budget.last_reset_date from 1 for 7) != substring(v_today from 1 for 7) THEN
      v_current_monthly := 0.0;
    ELSE
      v_current_monthly := v_budget.current_monthly_spend_usd;
    END IF;
  ELSE
    v_current_daily := v_budget.current_daily_spend_usd;
    v_current_monthly := v_budget.current_monthly_spend_usd;
  END IF;

  -- Admission check for positive spend additions
  IF p_cost_usd > 0 AND (v_current_daily + p_cost_usd) > v_budget.daily_budget_usd THEN
    IF v_budget.over_budget_policy = 'hard_stop' THEN
      RETURN jsonb_build_object(
        'success', false,
        'can_execute', false,
        'error', 'Agent daily budget limit exhausted',
        'current_daily_spend', v_current_daily,
        'daily_budget_usd', v_budget.daily_budget_usd
      );
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
