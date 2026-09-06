-- ============================================================================
-- J10 NEXUS: Tier 2 — Agency & Client Commercialization Migration
-- Migration: 20260920_tier2_agency_commercialization.sql
-- ============================================================================
-- Establishes:
-- 1. White-label branding & agency hierarchy extensions on public.workspaces.
-- 2. public.workspace_domains: Custom domain registration, DNS tokens, and verification status.
-- 3. public.workspace_templates: Industry vertical blueprints and AI agent seeds.
-- 4. Safe constraints, composite indexes, and strict multi-tenant Row Level Security.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND WORKSPACES FOR WHITE-LABEL & AGENCY COMMERCIALIZATION
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS favicon_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#10B981',
  ADD COLUMN IF NOT EXISTS custom_domain TEXT,
  ADD COLUMN IF NOT EXISTS custom_domain_status TEXT NOT NULL DEFAULT 'unconfigured',
  ADD COLUMN IF NOT EXISTS white_label_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_title TEXT,
  ADD COLUMN IF NOT EXISTS portal_welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS agency_master_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS client_tier TEXT NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspaces_custom_domain_status'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT chk_workspaces_custom_domain_status
      CHECK (custom_domain_status IN ('unconfigured', 'pending_verification', 'verified', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspaces_billing_mode'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT chk_workspaces_billing_mode
      CHECK (billing_mode IN ('direct', 'agency_funded', 'revenue_share'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspaces_client_tier'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT chk_workspaces_client_tier
      CHECK (client_tier IN ('standard', 'pro', 'vip'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspaces_agency_master
  ON public.workspaces(agency_master_id)
  WHERE agency_master_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_custom_domain_unique
  ON public.workspaces(custom_domain)
  WHERE custom_domain IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. WORKSPACE DOMAINS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  verification_token TEXT NOT NULL,
  dns_cname_target TEXT NOT NULL DEFAULT 'cname.j10nexus.com',
  status TEXT NOT NULL DEFAULT 'pending',
  ssl_status TEXT NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_domains_status'
  ) THEN
    ALTER TABLE public.workspace_domains
      ADD CONSTRAINT chk_workspace_domains_status
      CHECK (status IN ('pending', 'verified', 'active', 'failed', 'revoked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_workspace_domains_ssl_status'
  ) THEN
    ALTER TABLE public.workspace_domains
      ADD CONSTRAINT chk_workspace_domains_ssl_status
      CHECK (ssl_status IN ('pending', 'issued', 'expired', 'error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_domains_ws_status
  ON public.workspace_domains(workspace_id, status);

-- ----------------------------------------------------------------------------
-- 3. WORKSPACE TEMPLATES TABLE & BLUEPRINTS SEED
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  vertical TEXT NOT NULL,
  description TEXT,
  system_prompt_blueprint TEXT,
  default_ai_employees JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_pipeline_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_knowledge_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_templates_vertical
  ON public.workspace_templates(vertical);

-- Seed 5 Core Vertical Industry Blueprints
INSERT INTO public.workspace_templates (
  slug,
  name,
  vertical,
  description,
  system_prompt_blueprint,
  default_ai_employees,
  default_pipeline_stages,
  default_knowledge_topics,
  is_public
) VALUES
(
  'real-estate-brokerage',
  'Real Estate & Property Development Blueprint',
  'real_estate',
  'Turnkey AI workforce for property showings, buyer pre-qualification, MLS listing Q&A, and transaction coordination.',
  'You are the Senior Commercial Real Estate AI Specialist for a high-volume brokerage. Provide prompt, professional property disclosures, schedule viewing walkthroughs, and qualify investor budgets.',
  '[
    {"name": "Marcus Vance", "role": "Head of Property Acquisitions", "department": "Commercial Sales"},
    {"name": "Elena Rostova", "role": "Leasing & Scheduling Concierge", "department": "Client Relations"}
  ]'::jsonb,
  '["inquiry", "showing_scheduled", "offer_submitted", "under_contract", "closed_won"]'::jsonb,
  '["Residential Showing Protocol", "Investor HOA Disclosure", "Buyer Pre-Approval Guidelines"]'::jsonb,
  true
),
(
  'solar-energy-residential',
  'Solar Energy & Clean Tech Installer Blueprint',
  'solar_energy',
  'Autonomous residential solar consultation, utility bill analysis, rooftop layout qualification, and rebate calculation.',
  'You are the Chief Clean Energy Consultant. Guide homeowners on net metering, calculate kW offset based on monthly electric bills, and book site assessments.',
  '[
    {"name": "Julian Hayes", "role": "Solar Energy Engineer", "department": "Design & Sales"},
    {"name": "Amber Wells", "role": "Utility Interconnection Specialist", "department": "Operations"}
  ]'::jsonb,
  '["lead", "utility_bill_received", "design_proposed", "permit_pending", "installed_won"]'::jsonb,
  '["State Net Metering Policy", "Rooftop Tilt Efficiency Matrix", "Tax Credit & Rebate FAQ"]'::jsonb,
  true
),
(
  'legal-services-corporate',
  'Corporate & Commercial Law Practice Blueprint',
  'legal_services',
  'Strictly governed client intake, conflict checking, retainer proposal generation, and NDA execution.',
  'You are the Executive Intake Assistant for a premier legal consultancy. Maintain strict privilege, capture entity details, and schedule initial retainer consultations without providing direct legal counsel.',
  '[
    {"name": "Thomas Sterling, Esq.", "role": "Corporate Intake Partner", "department": "Legal Operations"},
    {"name": "Victoria Cross", "role": "Compliance & Retainer Officer", "department": "Client Services"}
  ]'::jsonb,
  '["intake_submitted", "conflict_cleared", "engagement_sent", "retainer_received", "active_matter"]'::jsonb,
  '["Client Privilege Standard", "Retainer Fee Structure", "Conflict Check Criteria"]'::jsonb,
  true
),
(
  'healthcare-clinic-aesthetics',
  'Aesthetic Clinic & Specialty Healthcare Blueprint',
  'healthcare_clinic',
  'HIPAA-conscious appointment scheduling, treatment FAQ, post-consult follow-up, and wellness plan packages.',
  'You are the Patient Care Coordinator for an aesthetic medical practice. Provide empathetic, accurate procedural overviews, verify patient availability, and confirm consultation bookings.',
  '[
    {"name": "Dr. Clara Chen", "role": "Clinical Operations Director", "department": "Patient Advisory"},
    {"name": "Chloe Bennett", "role": "Patient Concierge", "department": "Scheduling"}
  ]'::jsonb,
  '["consult_requested", "treatment_matched", "deposit_collected", "treatment_completed"]'::jsonb,
  '["Pre-Treatment Care Sheet", "Consultation Deposit Policy", "Post-Procedure Recovery Protocols"]'::jsonb,
  true
),
(
  'ecommerce-dtc-brand',
  'DTC Ecommerce & Brand Merchant Blueprint',
  'ecommerce',
  '24/7 autonomous WhatsApp order tracking, abandoned cart recovery, product recommendations, and automated returns.',
  'You are the Brand Concierge for a high-growth consumer retail merchant. Deliver delightful, rapid customer support, recommend tailored product bundles, and share secure checkout links.',
  '[
    {"name": "Alex Mercer", "role": "E-Commerce Revenue Specialist", "department": "Growth & Retention"},
    {"name": "Maya Lin", "role": "Order Logistics Coordinator", "department": "Customer Support"}
  ]'::jsonb,
  '["visitor", "cart_abandoned", "discount_sent", "purchased_won", "repeat_customer"]'::jsonb,
  '["Shipping & Delivery Matrix", "Return & Refund Policy", "Seasonal VIP Promotion Guides"]'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  system_prompt_blueprint = EXCLUDED.system_prompt_blueprint,
  default_ai_employees = EXCLUDED.default_ai_employees,
  default_pipeline_stages = EXCLUDED.default_pipeline_stages,
  default_knowledge_topics = EXCLUDED.default_knowledge_topics,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER TABLE public.workspace_domains FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.workspace_templates FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Policies for workspace_domains
DROP POLICY IF EXISTS workspace_domains_select_member ON public.workspace_domains;
CREATE POLICY workspace_domains_select_member ON public.workspace_domains
  FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS workspace_domains_modify_admin ON public.workspace_domains;
CREATE POLICY workspace_domains_modify_admin ON public.workspace_domains
  FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- Policies for workspace_templates
DROP POLICY IF EXISTS workspace_templates_select ON public.workspace_templates;
CREATE POLICY workspace_templates_select ON public.workspace_templates
  FOR SELECT
  USING (
    is_public = true
    OR (workspace_id IS NOT NULL AND has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS workspace_templates_modify ON public.workspace_templates;
CREATE POLICY workspace_templates_modify ON public.workspace_templates
  FOR ALL
  USING (
    (workspace_id IS NOT NULL AND has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
    OR is_platform_admin()
  )
  WITH CHECK (
    (workspace_id IS NOT NULL AND has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
    OR is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 5. ROLE GRANTS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_domains TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_templates TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.workspace_domains TO service_role';
    EXECUTE 'GRANT ALL ON public.workspace_templates TO service_role';
  END IF;
END $$;
