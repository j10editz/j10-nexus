-- ============================================================================
-- J10 NEXUS: Tier 0G — Real SaaS Billing Migration
-- Migration: 20260918_tier0g_saas_billing.sql
-- ============================================================================
-- Extends workspace subscriptions with:
-- 1. 14-day trial management (trial_start, trial_end, has_used_trial).
-- 2. Dunning lifecycle management (dunning_status, dunning_attempt_count, last_dunning_at).
-- 3. Immutable verified usage accounting ledger (workspace_usage_records) with RLS.
-- 4. Atomic row-locked usage recording RPC (record_verified_workspace_usage) with idempotency.
-- 5. Atomic trial activation RPC (activate_workspace_trial).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND WORKSPACE_SUBSCRIPTIONS FOR TRIALS & DUNNING
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dunning_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS dunning_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dunning_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_subscriptions_dunning_status'
  ) THEN
    ALTER TABLE public.workspace_subscriptions
      ADD CONSTRAINT chk_workspace_subscriptions_dunning_status
      CHECK (dunning_status IN ('none', 'warning', 'grace_period', 'suspended', 'terminated'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_subscriptions_dunning_attempts'
  ) THEN
    ALTER TABLE public.workspace_subscriptions
      ADD CONSTRAINT chk_workspace_subscriptions_dunning_attempts
      CHECK (dunning_attempt_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_dunning
  ON public.workspace_subscriptions(dunning_status)
  WHERE dunning_status != 'none';

-- ----------------------------------------------------------------------------
-- 2. VERIFIED USAGE ACCOUNTING LEDGER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  idempotency_key TEXT UNIQUE,
  resource_id TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_usage_metric_name'
  ) THEN
    ALTER TABLE public.workspace_usage_records
      ADD CONSTRAINT chk_workspace_usage_metric_name
      CHECK (metric_name IN (
        'whatsapp_outbound',
        'whatsapp_inbound',
        'ai_tokens',
        'ai_agent_run',
        'campaign_broadcast',
        'workflow_execution'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_usage_records_ws_time
  ON public.workspace_usage_records(workspace_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_records_metric
  ON public.workspace_usage_records(workspace_id, metric_name);

CREATE INDEX IF NOT EXISTS idx_usage_records_idempotency
  ON public.workspace_usage_records(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Enable Row-Level Security
ALTER TABLE public.workspace_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_usage_records FORCE ROW LEVEL SECURITY;

-- Drop legacy or pre-existing policies for idempotency
DROP POLICY IF EXISTS "workspace_usage_records_select_member" ON public.workspace_usage_records;
DROP POLICY IF EXISTS "workspace_usage_records_modify_restricted" ON public.workspace_usage_records;

-- Read-only policy for workspace members with operational roles or platform admins
CREATE POLICY "workspace_usage_records_select_member"
  ON public.workspace_usage_records
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR public.is_platform_admin()
  );

-- Zero direct client mutations; mutations restricted strictly to service_role and atomic RPC
REVOKE INSERT, UPDATE, DELETE ON public.workspace_usage_records FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.workspace_usage_records FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.workspace_usage_records FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.workspace_usage_records TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.workspace_usage_records TO service_role';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. ATOMIC VERIFIED USAGE RECORDING RPC
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

  -- 3. Idempotency Check: if idempotency key was already recorded, return success without re-billing
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

  -- 8. Insert into immutable usage records ledger
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
  )
  VALUES (
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

  -- 9. Atomically increment subscription counter
  UPDATE public.workspace_subscriptions
  SET messages_used_this_period = messages_used_this_period + p_quantity,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
  RETURNING messages_used_this_period INTO v_new_usage;

  RETURN jsonb_build_object(
    'success', true,
    'record_id', v_new_record_id,
    'workspace_id', p_workspace_id,
    'messages_used_this_period', v_new_usage,
    'monthly_message_limit', v_sub.monthly_message_limit,
    'remaining', (v_sub.monthly_message_limit - v_new_usage),
    'is_exceeded', false
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage TO service_role';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. ATOMIC TRIAL ACTIVATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_workspace_trial(
  p_workspace_id UUID,
  p_plan_id TEXT DEFAULT 'growth',
  p_duration_days INT DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_authorized BOOLEAN := false;
  v_sub public.workspace_subscriptions%ROWTYPE;
  v_trial_limit INT := 1000;
  v_duration INTERVAL;
BEGIN
  -- 1. Duration check
  IF p_duration_days IS NULL OR p_duration_days <= 0 OR p_duration_days > 90 THEN
    p_duration_days := 14;
  END IF;
  v_duration := (p_duration_days || ' days')::INTERVAL;

  -- 2. Plan check
  IF p_plan_id NOT IN ('starter', 'growth', 'enterprise') THEN
    p_plan_id := 'growth';
  END IF;

  -- 3. Authorization: Workspace owner/admin or platform admin
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.is_platform_admin() THEN
    v_is_authorized := true;
  ELSIF public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: only workspace owners and admins can activate trials'
    );
  END IF;

  -- 4. Check existing trial history
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  -- If subscription already exists, check trial eligibility
  IF FOUND THEN
    -- If already verified via Stripe, cannot downgrade to trial
    IF v_sub.provenance = 'stripe' AND v_sub.status IN ('active', 'past_due') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Workspace already has an active verified Stripe subscription'
      );
    END IF;

    -- Trial can only be activated once per workspace unless platform founder
    IF v_sub.has_used_trial = true AND NOT public.is_platform_admin() THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'This workspace has already utilized its free trial period'
      );
    END IF;

    -- Update existing record
    UPDATE public.workspace_subscriptions
    SET plan_id = p_plan_id,
        status = 'trialing',
        provenance = 'trial',
        trial_start = now(),
        trial_end = now() + v_duration,
        current_period_start = now(),
        current_period_end = now() + v_duration,
        grace_period_end = null,
        monthly_message_limit = v_trial_limit,
        messages_used_this_period = 0,
        has_used_trial = true,
        dunning_status = 'none',
        dunning_attempt_count = 0,
        updated_at = now()
    WHERE workspace_id = p_workspace_id
    RETURNING * INTO v_sub;
  ELSE
    -- Insert new record
    INSERT INTO public.workspace_subscriptions (
      workspace_id,
      plan_id,
      status,
      provenance,
      trial_start,
      trial_end,
      current_period_start,
      current_period_end,
      monthly_message_limit,
      messages_used_this_period,
      has_used_trial,
      dunning_status,
      dunning_attempt_count
    )
    VALUES (
      p_workspace_id,
      p_plan_id,
      'trialing',
      'trial',
      now(),
      now() + v_duration,
      now(),
      now() + v_duration,
      v_trial_limit,
      0,
      true,
      'none',
      0
    )
    RETURNING * INTO v_sub;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_sub.workspace_id,
    'plan_id', v_sub.plan_id,
    'status', v_sub.status,
    'provenance', v_sub.provenance,
    'trial_start', v_sub.trial_start,
    'trial_end', v_sub.trial_end,
    'monthly_message_limit', v_sub.monthly_message_limit
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.activate_workspace_trial TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.activate_workspace_trial TO service_role';
  END IF;
END $$;
