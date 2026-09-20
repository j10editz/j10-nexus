BEGIN;

-- Launch-candidate trial contract. A free trial is created only by the
-- owner-approved outcome-onboarding RPC below; no client clock is trusted.
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_status TEXT NOT NULL DEFAULT 'not_started';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_workspace_subscriptions_trial_status') THEN
    ALTER TABLE public.workspace_subscriptions
      ADD CONSTRAINT chk_workspace_subscriptions_trial_status
      CHECK (trial_status IN ('not_started', 'active', 'expired', 'converted'));
  END IF;
END;
$$;

-- Preserve historic trial rows without extending any trial. New launches use
-- the explicit *_at fields and a fixed three-day interval.
UPDATE public.workspace_subscriptions
SET trial_started_at = COALESCE(trial_started_at, trial_start),
    trial_ends_at = COALESCE(trial_ends_at, trial_end),
    trial_status = CASE
      WHEN COALESCE(trial_ends_at, trial_end) IS NULL THEN trial_status
      WHEN COALESCE(trial_ends_at, trial_end) > now() THEN 'active'
      ELSE 'expired'
    END
WHERE provenance = 'trial';

CREATE TABLE IF NOT EXISTS public.workspace_trial_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  business_identity_hash TEXT NOT NULL,
  first_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_trial_identity_user UNIQUE (verified_user_id),
  CONSTRAINT uq_workspace_trial_identity_business UNIQUE (business_identity_hash)
);

CREATE TABLE IF NOT EXISTS public.workspace_outcome_onboarding (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'activated')),
  business_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_setup JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_trial_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_trial_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_outcome_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_outcome_onboarding FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_trial_identities_owner_select" ON public.workspace_trial_identities;
CREATE POLICY "workspace_trial_identities_owner_select" ON public.workspace_trial_identities FOR SELECT
USING (verified_user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "workspace_outcome_onboarding_owner_select" ON public.workspace_outcome_onboarding;
CREATE POLICY "workspace_outcome_onboarding_owner_select" ON public.workspace_outcome_onboarding FOR SELECT
USING (public.has_workspace_role(workspace_id, ARRAY['owner']) OR public.is_platform_admin(auth.uid()));

REVOKE ALL ON public.workspace_trial_identities, public.workspace_outcome_onboarding FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.workspace_trial_identities, public.workspace_outcome_onboarding FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.workspace_trial_identities, public.workspace_outcome_onboarding FROM authenticated;
    GRANT SELECT ON public.workspace_trial_identities, public.workspace_outcome_onboarding TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.workspace_trial_identities, public.workspace_outcome_onboarding TO service_role;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_workspace_outcome_onboarding(
  p_workspace_id UUID,
  p_business_profile JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner UUID;
  v_verified BOOLEAN := false;
  v_business_name TEXT;
  v_industry TEXT;
  v_timezone TEXT;
  v_proposal JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Forbidden: workspace owner approval is required.' USING ERRCODE = '42501';
  END IF;
  SELECT (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL) INTO v_verified
  FROM auth.users WHERE id = auth.uid();
  IF COALESCE(v_verified, false) = false THEN
    RAISE EXCEPTION 'A verified user identity is required before outcome onboarding can be submitted.';
  END IF;
  IF jsonb_typeof(p_business_profile) <> 'object' THEN
    RAISE EXCEPTION 'Business onboarding profile must be an object.';
  END IF;
  v_business_name := nullif(trim(p_business_profile ->> 'business_name'), '');
  v_industry := nullif(trim(p_business_profile ->> 'industry'), '');
  v_timezone := nullif(trim(p_business_profile ->> 'timezone'), '');
  IF v_business_name IS NULL OR v_industry IS NULL OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Business name, industry, and timezone are required before trial activation.';
  END IF;

  SELECT owner_user_id INTO v_owner FROM public.workspaces WHERE id = p_workspace_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only the canonical workspace owner may complete outcome onboarding.' USING ERRCODE = '42501';
  END IF;

  v_proposal := jsonb_build_object(
    'ai_receptionist_instructions', format('Represent %s in a %s tone. Use the approved FAQs, services, hours, supported languages, and human handoff policy only.', v_business_name, COALESCE(nullif(trim(p_business_profile ->> 'receptionist_tone'), ''), 'helpful and professional')),
    'lead_capture_workflow', jsonb_build_object('qualification_questions', COALESCE(p_business_profile -> 'lead_qualification_questions', '[]'::jsonb), 'preferred_outcomes', COALESCE(p_business_profile -> 'preferred_lead_outcomes', '[]'::jsonb)),
    'appointment_booking_workflow', jsonb_build_object('booking_rules', COALESCE(p_business_profile -> 'booking_rules', '{}'::jsonb), 'calendar_requested', COALESCE(p_business_profile -> 'connected_calendar', '{}'::jsonb)),
    'follow_up_workflow', jsonb_build_object('goals', COALESCE(p_business_profile -> 'business_goals', '[]'::jsonb), 'human_handoff_contact', COALESCE(p_business_profile ->> 'human_handoff_contact', '')),
    'recommended_channels', COALESCE(p_business_profile -> 'communication_channels', '[]'::jsonb),
    'trial_usage_limits', jsonb_build_object('duration_hours', 72, 'message_limit', 250, 'whatsapp_mode', 'interactive_demo_only', 'no_auto_overages', true)
  );

  INSERT INTO public.workspace_outcome_onboarding (workspace_id, owner_user_id, status, business_profile, proposed_setup, submitted_at, updated_at)
  VALUES (p_workspace_id, v_owner, 'submitted', p_business_profile, v_proposal, now(), now())
  ON CONFLICT (workspace_id) DO UPDATE SET
    owner_user_id = EXCLUDED.owner_user_id,
    status = CASE WHEN public.workspace_outcome_onboarding.status = 'activated' THEN 'activated' ELSE 'submitted' END,
    business_profile = EXCLUDED.business_profile,
    proposed_setup = EXCLUDED.proposed_setup,
    submitted_at = EXCLUDED.submitted_at,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'status', 'submitted', 'proposal', v_proposal);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_workspace_outcome_onboarding(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_onboarding public.workspace_outcome_onboarding%ROWTYPE;
  v_owner UUID;
  v_verified BOOLEAN := false;
  v_business_identity_hash TEXT;
  v_existing_claim public.workspace_trial_identities%ROWTYPE;
  v_subscription public.workspace_subscriptions%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Forbidden: workspace owner approval is required.' USING ERRCODE = '42501';
  END IF;
  SELECT (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL) INTO v_verified
  FROM auth.users WHERE id = auth.uid();
  IF COALESCE(v_verified, false) = false THEN
    RAISE EXCEPTION 'A verified user identity is required before a trial can start.';
  END IF;
  SELECT * INTO v_onboarding FROM public.workspace_outcome_onboarding WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_onboarding.status NOT IN ('submitted', 'approved', 'activated') THEN
    RAISE EXCEPTION 'Outcome onboarding must be completed before a trial can start.';
  END IF;
  SELECT owner_user_id INTO v_owner FROM public.workspaces WHERE id = p_workspace_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() OR v_owner <> v_onboarding.owner_user_id THEN
    RAISE EXCEPTION 'Only the canonical workspace owner may approve onboarding.' USING ERRCODE = '42501';
  END IF;
  IF v_onboarding.status = 'activated' THEN
    SELECT * INTO v_subscription FROM public.workspace_subscriptions WHERE workspace_id = p_workspace_id;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'trial_started_at', v_subscription.trial_started_at, 'trial_ends_at', v_subscription.trial_ends_at);
  END IF;

  SELECT * INTO v_subscription FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF FOUND AND v_subscription.has_used_trial AND v_subscription.provenance <> 'stripe' THEN
    RAISE EXCEPTION 'This workspace has already used its free trial and cannot be reset.';
  END IF;

  v_business_identity_hash := md5(lower(trim(v_onboarding.business_profile ->> 'business_name')) || '|' || lower(trim(COALESCE(v_onboarding.business_profile ->> 'website', ''))));
  SELECT * INTO v_existing_claim FROM public.workspace_trial_identities
  WHERE verified_user_id = v_owner OR business_identity_hash = v_business_identity_hash FOR UPDATE;
  IF FOUND AND v_existing_claim.first_workspace_id <> p_workspace_id THEN
    RAISE EXCEPTION 'A free trial has already been used by this verified user or business.';
  END IF;
  INSERT INTO public.workspace_trial_identities (verified_user_id, business_identity_hash, first_workspace_id)
  VALUES (v_owner, v_business_identity_hash, p_workspace_id)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    -- The user identity may conflict through the business uniqueness index.
    SELECT * INTO v_existing_claim FROM public.workspace_trial_identities
    WHERE verified_user_id = v_owner OR business_identity_hash = v_business_identity_hash;
    IF v_existing_claim.first_workspace_id <> p_workspace_id THEN
      RAISE EXCEPTION 'A free trial has already been used by this verified user or business.';
    END IF;
  END IF;

  INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, provenance, trial_start, trial_end, trial_started_at, trial_ends_at, trial_status, current_period_start, current_period_end, monthly_message_limit, messages_used_this_period, has_used_trial, dunning_status, dunning_attempt_count)
  VALUES (p_workspace_id, 'growth', 'trialing', 'trial', v_now, v_now + INTERVAL '72 hours', v_now, v_now + INTERVAL '72 hours', 'active', v_now, v_now + INTERVAL '72 hours', 250, 0, true, 'none', 0)
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.plan_id ELSE 'growth' END,
    status = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.status ELSE 'trialing' END,
    provenance = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN 'stripe' ELSE 'trial' END,
    trial_start = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.trial_start ELSE v_now END,
    trial_end = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.trial_end ELSE v_now + INTERVAL '72 hours' END,
    trial_started_at = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.trial_started_at ELSE v_now END,
    trial_ends_at = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.trial_ends_at ELSE v_now + INTERVAL '72 hours' END,
    trial_status = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN 'converted' ELSE 'active' END,
    current_period_start = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.current_period_start ELSE v_now END,
    current_period_end = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.current_period_end ELSE v_now + INTERVAL '72 hours' END,
    monthly_message_limit = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.monthly_message_limit ELSE 250 END,
    messages_used_this_period = CASE WHEN public.workspace_subscriptions.provenance = 'stripe' THEN public.workspace_subscriptions.messages_used_this_period ELSE 0 END,
    has_used_trial = true,
    updated_at = v_now
  RETURNING * INTO v_subscription;

  UPDATE public.workspace_outcome_onboarding
  SET status = 'activated', approved_at = v_now, activated_at = v_now, updated_at = v_now
  WHERE workspace_id = p_workspace_id;
  RETURN jsonb_build_object('success', true, 'trial_started_at', v_subscription.trial_started_at, 'trial_ends_at', v_subscription.trial_ends_at, 'trial_status', v_subscription.trial_status, 'server_now', v_now);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_workspace_trial_runtime()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM public.workspace_subscriptions WHERE workspace_id = NEW.workspace_id FOR UPDATE;
  IF FOUND AND v_sub.provenance = 'trial' AND COALESCE(v_sub.trial_ends_at, v_sub.trial_end) <= now() THEN
    UPDATE public.workspace_subscriptions
    SET trial_status = 'expired', updated_at = now()
    WHERE workspace_id = NEW.workspace_id AND trial_status <> 'expired';
    RAISE EXCEPTION 'TRIAL_EXPIRED: this workspace is read-only until a paid plan is activated.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['workspace_usage_records', 'workspace_quota_reservations', 'ai_tasks', 'automation_runs', 'contacts', 'crm_contacts'] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = v_table
        AND relation.relkind IN ('r', 'p')
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_workspace_trial_runtime ON public.%I', v_table);
      EXECUTE format('CREATE TRIGGER trg_enforce_workspace_trial_runtime BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_trial_runtime()', v_table);
    END IF;
  END LOOP;

  -- Preserve inbound evidence after expiry, but never allow an expired trial
  -- to create a new outbound provider message through a direct table write.
  IF EXISTS (
    SELECT 1 FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'inbox_messages'
      AND relation.relkind IN ('r', 'p')
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_enforce_workspace_trial_outbound_message ON public.inbox_messages';
    EXECUTE 'CREATE TRIGGER trg_enforce_workspace_trial_outbound_message BEFORE INSERT ON public.inbox_messages FOR EACH ROW WHEN (NEW.direction = ''outbound'') EXECUTE FUNCTION public.enforce_workspace_trial_runtime()';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_workspace_outcome_onboarding(UUID, JSONB), public.approve_workspace_outcome_onboarding(UUID), public.enforce_workspace_trial_runtime() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.submit_workspace_outcome_onboarding(UUID, JSONB), public.approve_workspace_outcome_onboarding(UUID), public.enforce_workspace_trial_runtime() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.submit_workspace_outcome_onboarding(UUID, JSONB), public.approve_workspace_outcome_onboarding(UUID) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.submit_workspace_outcome_onboarding(UUID, JSONB), public.approve_workspace_outcome_onboarding(UUID) TO service_role;
  END IF;
END;
$$;

COMMIT;
