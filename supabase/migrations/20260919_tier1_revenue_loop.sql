-- ============================================================================
-- J10 NEXUS: Tier 1 — Complete Revenue Loop Migration
-- Migration: 20260919_tier1_revenue_loop.sql
-- ============================================================================
-- Establishes:
-- 1. public.crm_proposals: Commercial proposals linked to contacts, threads, and Stripe checkouts.
-- 2. public.crm_bookings: Scheduled walkthroughs, demos, and closing calls linked to proposals/contacts.
-- 3. Composite uniqueness, performance indexes, and strict multi-tenant Row Level Security.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRM PROPOSALS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  proposal_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft',
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  checkout_id UUID REFERENCES public.payment_checkouts(id) ON DELETE SET NULL,
  checkout_url TEXT,
  valid_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_crm_proposals_status'
  ) THEN
    ALTER TABLE public.crm_proposals
      ADD CONSTRAINT chk_crm_proposals_status
      CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'paid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_crm_proposals_workspace_number'
  ) THEN
    ALTER TABLE public.crm_proposals
      ADD CONSTRAINT uq_crm_proposals_workspace_number
      UNIQUE (workspace_id, proposal_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_proposals_ws_status
  ON public.crm_proposals(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_ws_contact
  ON public.crm_proposals(workspace_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_ws_thread
  ON public.crm_proposals(workspace_id, thread_id);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_ws_created
  ON public.crm_proposals(workspace_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. CRM BOOKINGS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.crm_proposals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  booking_type TEXT NOT NULL DEFAULT 'executive_walkthrough',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  host_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_crm_bookings_type'
  ) THEN
    ALTER TABLE public.crm_bookings
      ADD CONSTRAINT chk_crm_bookings_type
      CHECK (booking_type IN ('executive_walkthrough', 'discovery_call', 'technical_demo', 'closing_call', 'onboarding'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_crm_bookings_status'
  ) THEN
    ALTER TABLE public.crm_bookings
      ADD CONSTRAINT chk_crm_bookings_status
      CHECK (status IN ('scheduled', 'completed', 'canceled', 'rescheduled', 'no_show'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_bookings_ws_scheduled
  ON public.crm_bookings(workspace_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_crm_bookings_ws_contact
  ON public.crm_bookings(workspace_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_bookings_ws_status
  ON public.crm_bookings(workspace_id, status);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE public.crm_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_bookings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER TABLE public.crm_proposals FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.crm_bookings FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Policies for crm_proposals
DROP POLICY IF EXISTS crm_proposals_select_member ON public.crm_proposals;
CREATE POLICY crm_proposals_select_member ON public.crm_proposals
  FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_proposals_insert_member ON public.crm_proposals;
CREATE POLICY crm_proposals_insert_member ON public.crm_proposals
  FOR INSERT
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_proposals_update_member ON public.crm_proposals;
CREATE POLICY crm_proposals_update_member ON public.crm_proposals
  FOR UPDATE
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_proposals_delete_admin ON public.crm_proposals;
CREATE POLICY crm_proposals_delete_admin ON public.crm_proposals
  FOR DELETE
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- Policies for crm_bookings
DROP POLICY IF EXISTS crm_bookings_select_member ON public.crm_bookings;
CREATE POLICY crm_bookings_select_member ON public.crm_bookings
  FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_bookings_insert_member ON public.crm_bookings;
CREATE POLICY crm_bookings_insert_member ON public.crm_bookings
  FOR INSERT
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_bookings_update_member ON public.crm_bookings;
CREATE POLICY crm_bookings_update_member ON public.crm_bookings
  FOR UPDATE
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS crm_bookings_delete_admin ON public.crm_bookings;
CREATE POLICY crm_bookings_delete_admin ON public.crm_bookings
  FOR DELETE
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 4. ROLE GRANTS (Safe for PGlite and Remote Supabase)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_proposals TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bookings TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.crm_proposals TO service_role';
    EXECUTE 'GRANT ALL ON public.crm_bookings TO service_role';
  END IF;
END $$;
