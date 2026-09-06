-- ============================================================================
-- J10 NEXUS: Test-Only Billing Subsystem Bootstrap Fixture
-- File: tests/fixtures/billing-concurrency-bootstrap.sql
--
-- CAUTION: This fixture is strictly for independent test certification environments.
-- It isolates the production subscription schema from unrelated legacy modules
-- (such as historical automation, employee, and integration tables).
--
-- NEVER deploy this fixture to production environments.
-- ============================================================================

-- ============================================================================
-- SOURCE: supabase/migrations/20260916_global_tenantization_launch_integrity.sql
-- SECTION: 3. WORKSPACE-SCOPED SUBSCRIPTIONS & ENTITLEMENTS (HARDENED)
-- Lines: 242 - 323 (Copied verbatim from production migration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'starter' CHECK (plan_id IN ('starter', 'growth', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'none')),
  monthly_message_limit INTEGER NOT NULL DEFAULT 1000 CHECK (monthly_message_limit >= 0),
  messages_used_this_period INTEGER NOT NULL DEFAULT 0 CHECK (messages_used_this_period >= 0),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  grace_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial subscription for existing workspaces if missing
INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, monthly_message_limit)
SELECT w.id, COALESCE(w.plan, 'growth'), 'active', 10000
FROM public.workspaces w
ON CONFLICT (workspace_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_ws ON public.workspace_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_status ON public.workspace_subscriptions(status);

-- DROP ALL LEGACY SUBSCRIPTION POLICIES (INCLUDING BROAD USING true POLICY)
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "Users can view own subscription" ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "workspace_subscriptions_select_member" ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "workspace_subscriptions_modify_restricted" ON public.workspace_subscriptions;

ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only policy for active workspace members
CREATE POLICY "workspace_subscriptions_select_member"
  ON public.workspace_subscriptions
  FOR SELECT
  USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR public.is_platform_admin()
  );

-- NO CLIENT INSERT, UPDATE, OR DELETE POLICIES! Writable only via trusted service_role.

-- Atomic Usage Increment Function
CREATE OR REPLACE FUNCTION public.increment_workspace_usage(
  p_workspace_id UUID,
  p_count INT DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.workspace_subscriptions%ROWTYPE;
BEGIN
  IF p_count <= 0 THEN
    p_count := 1;
  END IF;

  UPDATE public.workspace_subscriptions
  SET messages_used_this_period = messages_used_this_period + p_count,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
  RETURNING * INTO v_sub;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No subscription found for workspace.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_sub.workspace_id,
    'messages_used_this_period', v_sub.messages_used_this_period,
    'monthly_message_limit', v_sub.monthly_message_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_workspace_usage(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_workspace_usage(UUID, INT) TO authenticated, service_role;

-- ============================================================================
-- SOURCE: supabase/migrations/20260917_tier0f_runtime_tenant_certification.sql
-- SECTION: 3. DETERMINISTIC SUBSCRIPTION PROVENANCE BACKFILL & CONSTRAINT
-- Lines: 306 - 363 (Copied verbatim from production migration)
-- ============================================================================

ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_subscriptions_provenance'
  ) THEN
    ALTER TABLE public.workspace_subscriptions
      ADD CONSTRAINT chk_workspace_subscriptions_provenance
      CHECK (provenance IN ('stripe', 'trial', 'internal_grant', 'none'));
  END IF;
END $$;

-- Explicit, auditable criteria:
-- A. Verified Stripe association (never overwrite verified Stripe records)
UPDATE public.workspace_subscriptions
SET provenance = 'stripe'
WHERE stripe_subscription_id IS NOT NULL
  AND status IN ('active', 'trialing');

-- B. Valid active trial
UPDATE public.workspace_subscriptions
SET provenance = 'trial'
WHERE stripe_subscription_id IS NULL
  AND status = 'trialing'
  AND (current_period_end > now() OR (grace_period_end IS NOT NULL AND grace_period_end > now()))
  AND provenance != 'stripe';

-- C. Canonical platform founder internal grant (resolved via platform_roles using owner_user_id)
UPDATE public.workspace_subscriptions
SET provenance = 'internal_grant'
WHERE workspace_id IN (
  SELECT w.id
  FROM public.workspaces w
  JOIN public.platform_roles pr ON pr.user_id = w.owner_user_id
  WHERE pr.role = 'platform_founder'
    AND pr.revoked_at IS NULL
)
AND provenance NOT IN ('stripe');

-- D. Everything else defaults to 'none'
UPDATE public.workspace_subscriptions
SET provenance = 'none'
WHERE provenance IS NULL;

ALTER TABLE public.workspace_subscriptions
  ALTER COLUMN provenance SET DEFAULT 'none',
  ALTER COLUMN provenance SET NOT NULL;

-- Deactivate unverified subscriptions (provenance = none)
UPDATE public.workspace_subscriptions
SET status = 'none',
    updated_at = now()
WHERE provenance = 'none'
  AND status IN ('active', 'trialing');
