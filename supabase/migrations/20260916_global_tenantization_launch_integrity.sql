-- ============================================================================
-- J10 NEXUS TIER 0F MIGRATION: GLOBAL TENANTIZATION, RLS INTEGRITY & HONEST SAAS
-- File: supabase/migrations/20260916_global_tenantization_launch_integrity.sql
-- Description:
--   1. Enforces workspace_id NOT NULL on all legacy and new business tables.
--   2. Runs preflight assertion against ambiguous user memberships.
--   3. Idempotently backfills legacy records to verified active workspaces.
--   4. Scopes workspace_subscriptions to workspace_id with zero client-mutation RLS.
--   5. Implements atomic public.increment_workspace_usage RPC.
--   6. Implements atomic, email-bound public.accept_workspace_invitation RPC.
--   7. Establishes workspace-scoped tables for knowledge, campaigns, invoices,
--      workforce, funnels, products, orders, automations, and integrations.
--   8. Drops broad USING (true) policies and establishes role-tiered RLS.
--   9. Reloads PostgREST schema cache.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PREFLIGHT ASSERTION: NO AMBIGUOUS USER MEMBERSHIPS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_ambiguous_users INT;
BEGIN
  SELECT count(*) INTO v_ambiguous_users
  FROM (
    SELECT user_id
    FROM public.workspace_memberships
    WHERE status = 'active'
    GROUP BY user_id
    HAVING count(DISTINCT workspace_id) > 1
  ) amb;

  IF v_ambiguous_users > 0 THEN
    RAISE EXCEPTION 'Preflight abort: % users belong to multiple active workspaces. Ambiguous backfill prevented.', v_ambiguous_users;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. TENANTIZE LEGACY BUSINESS TABLES
-- ----------------------------------------------------------------------------

-- A. employees
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.employees ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.employees e
SET workspace_id = (
  SELECT m.workspace_id FROM public.workspace_memberships m
  WHERE m.status = 'active' ORDER BY m.created_at ASC LIMIT 1
)
WHERE e.workspace_id IS NULL;

-- B. ai_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_tasks' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.ai_tasks ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.ai_tasks t
SET workspace_id = m.workspace_id
FROM public.workspace_memberships m
WHERE t.workspace_id IS NULL
  AND t.user_id = m.user_id
  AND m.status = 'active';

-- C. automations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automations' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.automations ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.automations a
SET workspace_id = m.workspace_id
FROM public.workspace_memberships m
WHERE a.workspace_id IS NULL
  AND a.user_id = m.user_id
  AND m.status = 'active';

-- D. automation_runs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automation_runs' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.automation_runs ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.automation_runs ar
SET workspace_id = a.workspace_id
FROM public.automations a
WHERE ar.workspace_id IS NULL
  AND ar.automation_id = a.id;

-- E. automation_steps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automation_steps' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.automation_steps ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.automation_steps ast
SET workspace_id = a.workspace_id
FROM public.automations a
WHERE ast.workspace_id IS NULL
  AND ast.automation_id = a.id;

-- F. automation_versions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automation_versions' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.automation_versions ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.automation_versions av
SET workspace_id = a.workspace_id
FROM public.automations a
WHERE av.workspace_id IS NULL
  AND av.automation_id = a.id;

-- G. integrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'integrations' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.integrations ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.integrations i
SET workspace_id = m.workspace_id
FROM public.workspace_memberships m
WHERE i.workspace_id IS NULL
  AND i.user_id = m.user_id
  AND m.status = 'active';

-- H. integration_credentials
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'integration_credentials' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.integration_credentials ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.integration_credentials ic
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE ic.workspace_id IS NULL
  AND ic.integration_id = i.id;

-- I. activity_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_logs' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.activity_logs ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.activity_logs al
SET workspace_id = m.workspace_id
FROM public.workspace_memberships m
WHERE al.workspace_id IS NULL
  AND al.user_id = m.user_id
  AND m.status = 'active';

-- Verify backfills succeeded before applying NOT NULL constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.automations WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill assertion failed: automations row lacks workspace_id.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integrations WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill assertion failed: integrations row lacks workspace_id.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.activity_logs WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill assertion failed: activity_logs row lacks workspace_id.';
  END IF;
END;
$$;

-- Apply NOT NULL constraints on legacy tables
ALTER TABLE public.automations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.automation_runs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.automation_steps ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.automation_versions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integrations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_credentials ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.employees ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.ai_tasks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.activity_logs ALTER COLUMN workspace_id SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. WORKSPACE-SCOPED SUBSCRIPTIONS & ENTITLEMENTS (HARDENED)
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- 4. ATOMIC, EMAIL-BOUND WORKSPACE INVITATION ACCEPTANCE RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_user_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation public.workspace_invitations%ROWTYPE;
  v_membership public.workspace_memberships%ROWTYPE;
  v_norm_email text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to accept invitation.';
  END IF;

  v_norm_email := lower(trim(p_user_email));
  IF v_norm_email IS NULL OR v_norm_email = '' THEN
    RAISE EXCEPTION 'Authenticated user email is required.';
  END IF;

  -- Lock row exclusively during evaluation to prevent race conditions
  SELECT * INTO v_invitation
  FROM public.workspace_invitations
  WHERE token_hash = trim(p_token_hash)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation token.';
  END IF;

  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been accepted.';
  END IF;

  IF v_invitation.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been revoked.';
  END IF;

  IF v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'This invitation has expired.';
  END IF;

  -- Enforce strict recipient email matching
  IF lower(trim(v_invitation.email_normalized)) != v_norm_email THEN
    RAISE EXCEPTION 'Access denied: Authenticated email does not match invitation recipient.';
  END IF;

  -- Atomic membership upsert
  INSERT INTO public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    status
  ) VALUES (
    v_invitation.workspace_id,
    p_user_id,
    v_invitation.role,
    'active'
  )
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    updated_at = now()
  RETURNING * INTO v_membership;

  -- Mark accepted in same atomic transaction
  UPDATE public.workspace_invitations
  SET accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_invitation.workspace_id,
    'membership', to_jsonb(v_membership)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_workspace_invitation(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text, uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. CANONICAL MULTI-TENANT BUSINESS TABLES
-- ----------------------------------------------------------------------------

-- A. company_knowledge_documents
CREATE TABLE IF NOT EXISTS public.company_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'product_service',
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'published',
  is_grounding_active BOOLEAN NOT NULL DEFAULT true,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_ws ON public.company_knowledge_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_ws_status ON public.company_knowledge_documents(workspace_id, status, is_grounding_active);

ALTER TABLE public.company_knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "knowledge_select" ON public.company_knowledge_documents;
CREATE POLICY "knowledge_select" ON public.company_knowledge_documents FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "knowledge_insert" ON public.company_knowledge_documents;
CREATE POLICY "knowledge_insert" ON public.company_knowledge_documents FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "knowledge_update" ON public.company_knowledge_documents;
CREATE POLICY "knowledge_update" ON public.company_knowledge_documents FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "knowledge_delete" ON public.company_knowledge_documents;
CREATE POLICY "knowledge_delete" ON public.company_knowledge_documents FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- B. marketing_campaigns
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  audience_segment TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'draft',
  target_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  replied_count INTEGER NOT NULL DEFAULT 0,
  message_template TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_ws ON public.marketing_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_ws_status ON public.marketing_campaigns(workspace_id, status);

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select" ON public.marketing_campaigns;
CREATE POLICY "campaigns_select" ON public.marketing_campaigns FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "campaigns_insert" ON public.marketing_campaigns;
CREATE POLICY "campaigns_insert" ON public.marketing_campaigns FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "campaigns_update" ON public.marketing_campaigns;
CREATE POLICY "campaigns_update" ON public.marketing_campaigns FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "campaigns_delete" ON public.marketing_campaigns;
CREATE POLICY "campaigns_delete" ON public.marketing_campaigns FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- C. finance_invoices
CREATE TABLE IF NOT EXISTS public.finance_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + interval '14 days'),
  paid_at TIMESTAMPTZ,
  line_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  notes TEXT,
  payment_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_finance_invoice_workspace_num UNIQUE (workspace_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_finance_invoices_ws ON public.finance_invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_finance_invoices_ws_status ON public.finance_invoices(workspace_id, status);

ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_select" ON public.finance_invoices;
CREATE POLICY "invoices_select" ON public.finance_invoices FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "invoices_insert" ON public.finance_invoices;
CREATE POLICY "invoices_insert" ON public.finance_invoices FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "invoices_update" ON public.finance_invoices;
CREATE POLICY "invoices_update" ON public.finance_invoices FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "invoices_delete" ON public.finance_invoices;
CREATE POLICY "invoices_delete" ON public.finance_invoices FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- D. workforce_members
CREATE TABLE IF NOT EXISTS public.workforce_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Operations',
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_agents TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  monthly_salary NUMERIC(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_ws ON public.workforce_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workforce_ws_dept ON public.workforce_members(workspace_id, department);

ALTER TABLE public.workforce_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workforce_select" ON public.workforce_members;
CREATE POLICY "workforce_select" ON public.workforce_members FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "workforce_insert" ON public.workforce_members;
CREATE POLICY "workforce_insert" ON public.workforce_members FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "workforce_update" ON public.workforce_members FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "workforce_delete" ON public.workforce_members FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- E. website_funnels
CREATE TABLE IF NOT EXISTS public.website_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'High-Converting Business Landing Page',
  slug TEXT NOT NULL DEFAULT 'main',
  theme TEXT NOT NULL DEFAULT 'obsidian',
  custom_domain TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  hero_headline TEXT NOT NULL DEFAULT 'Transform Operations with Autonomous AI Systems',
  hero_subheadline TEXT NOT NULL DEFAULT 'Deploy 24/7 WhatsApp sales agents, automated CRM lead capture, and intelligent billing.',
  primary_cta_text TEXT NOT NULL DEFAULT 'Start on WhatsApp',
  primary_cta_link TEXT,
  features JSONB NOT NULL DEFAULT '[]'::JSONB,
  testimonials JSONB NOT NULL DEFAULT '[]'::JSONB,
  faqs JSONB NOT NULL DEFAULT '[]'::JSONB,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_website_funnel_workspace_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_funnels_ws ON public.website_funnels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_funnels_slug ON public.website_funnels(slug);

ALTER TABLE public.website_funnels ENABLE ROW LEVEL SECURITY;

-- Allow public read ONLY when explicitly published
DROP POLICY IF EXISTS "funnels_select" ON public.website_funnels;
CREATE POLICY "funnels_select" ON public.website_funnels FOR SELECT
  USING (
    is_published = true
    OR public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
  );

DROP POLICY IF EXISTS "funnels_insert" ON public.website_funnels;
CREATE POLICY "funnels_insert" ON public.website_funnels FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "funnels_update" ON public.website_funnels;
CREATE POLICY "funnels_update" ON public.website_funnels FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "funnels_delete" ON public.website_funnels;
CREATE POLICY "funnels_delete" ON public.website_funnels FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- F. commerce_products & commerce_orders
CREATE TABLE IF NOT EXISTS public.commerce_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  inventory INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_commerce_product_workspace_sku UNIQUE (workspace_id, sku)
);

CREATE TABLE IF NOT EXISTS public.commerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  payment_method TEXT NOT NULL DEFAULT 'stripe',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_commerce_order_workspace_num UNIQUE (workspace_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_commerce_products_ws ON public.commerce_products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_ws ON public.commerce_orders(workspace_id);

ALTER TABLE public.commerce_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_orders ENABLE ROW LEVEL SECURITY;

-- Products Policies
DROP POLICY IF EXISTS "products_select" ON public.commerce_products;
CREATE POLICY "products_select" ON public.commerce_products FOR SELECT
  USING (
    status = 'active'
    OR public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
  );

DROP POLICY IF EXISTS "products_insert" ON public.commerce_products;
CREATE POLICY "products_insert" ON public.commerce_products FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "products_update" ON public.commerce_products;
CREATE POLICY "products_update" ON public.commerce_products FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "products_delete" ON public.commerce_products;
CREATE POLICY "products_delete" ON public.commerce_products FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Orders Policies
DROP POLICY IF EXISTS "orders_select" ON public.commerce_orders;
CREATE POLICY "orders_select" ON public.commerce_orders FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "orders_insert" ON public.commerce_orders;
CREATE POLICY "orders_insert" ON public.commerce_orders FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']));

DROP POLICY IF EXISTS "orders_update" ON public.commerce_orders;
CREATE POLICY "orders_update" ON public.commerce_orders FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "orders_delete" ON public.commerce_orders;
CREATE POLICY "orders_delete" ON public.commerce_orders FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));


-- G. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_ws_user ON public.notifications(workspace_id, user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
  );

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- H. provider_subscriptions & webhook_endpoints
CREATE TABLE IF NOT EXISTS public.provider_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_subscription_id TEXT,
  event_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  endpoint_key TEXT NOT NULL UNIQUE,
  secret_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_subs_ws ON public.provider_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_ws ON public.webhook_endpoints(workspace_id);

ALTER TABLE public.provider_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_subs_select" ON public.provider_subscriptions;
CREATE POLICY "provider_subs_select" ON public.provider_subscriptions FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "webhook_endpoints_select" ON public.webhook_endpoints;
CREATE POLICY "webhook_endpoints_select" ON public.webhook_endpoints FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- ----------------------------------------------------------------------------
-- 6. WORKSPACE-SCOPED RLS FOR LEGACY TABLES
-- ----------------------------------------------------------------------------

-- automations
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "automations_select" ON public.automations;
CREATE POLICY "automations_select" ON public.automations FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "automations_insert" ON public.automations;
CREATE POLICY "automations_insert" ON public.automations FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "automations_update" ON public.automations;
CREATE POLICY "automations_update" ON public.automations FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "automations_delete" ON public.automations;
CREATE POLICY "automations_delete" ON public.automations FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- automation_runs
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "runs_select" ON public.automation_runs;
CREATE POLICY "runs_select" ON public.automation_runs FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "runs_insert" ON public.automation_runs;
CREATE POLICY "runs_insert" ON public.automation_runs FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']));

-- integrations
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "integrations_select" ON public.integrations;
CREATE POLICY "integrations_select" ON public.integrations FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "integrations_insert" ON public.integrations;
CREATE POLICY "integrations_insert" ON public.integrations FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "integrations_update" ON public.integrations;
CREATE POLICY "integrations_update" ON public.integrations FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "integrations_delete" ON public.integrations;
CREATE POLICY "integrations_delete" ON public.integrations FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- integration_credentials
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credentials_select" ON public.integration_credentials;
CREATE POLICY "credentials_select" ON public.integration_credentials FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employees_select" ON public.employees;
CREATE POLICY "employees_select" ON public.employees FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "employees_insert" ON public.employees;
CREATE POLICY "employees_insert" ON public.employees FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "employees_update" ON public.employees;
CREATE POLICY "employees_update" ON public.employees FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "employees_delete" ON public.employees;
CREATE POLICY "employees_delete" ON public.employees FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- ai_tasks
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_tasks_select" ON public.ai_tasks;
CREATE POLICY "ai_tasks_select" ON public.ai_tasks FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "ai_tasks_insert" ON public.ai_tasks;
CREATE POLICY "ai_tasks_insert" ON public.ai_tasks FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']));

-- activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_select" ON public.activity_logs;
CREATE POLICY "activity_select" ON public.activity_logs FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));

DROP POLICY IF EXISTS "activity_insert" ON public.activity_logs;
CREATE POLICY "activity_insert" ON public.activity_logs FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']));

COMMIT;

-- ----------------------------------------------------------------------------
-- 7. NOTIFY POSTGREST & RUN NON-SENSITIVE VERIFICATION SUMMARY
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT count(*) FROM public.workspaces) AS workspaces_count,
  (SELECT count(*) FROM public.workspace_memberships) AS memberships_count,
  (SELECT count(*) FROM public.workspace_subscriptions) AS subscriptions_count,
  (SELECT count(*) FROM public.contacts WHERE workspace_id IS NOT NULL) AS tenant_contacts_count,
  (SELECT count(*) FROM public.automations WHERE workspace_id IS NOT NULL) AS tenant_automations_count,
  (SELECT count(*) FROM public.integrations WHERE workspace_id IS NOT NULL) AS tenant_integrations_count,
  (SELECT count(*) FROM public.activity_logs WHERE workspace_id IS NOT NULL) AS tenant_activity_count;
