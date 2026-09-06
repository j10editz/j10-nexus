-- ============================================================================
-- J10 NEXUS TIER 0F RUNTIME TENANT CERTIFICATION & CONSOLIDATION MIGRATION (REPAIR 2)
-- File: supabase/migrations/20260917_tier0f_runtime_tenant_certification.sql
-- Description:
--   1. Webhook events RLS hardening: Drops all permissive/legacy policies and
--      safely establishes webhook_events_tenant_select (tolerating pre-existing policies).
--   2. Genuinely non-destructive CRM consolidation: Backfills legacy crm_contacts into
--      canonical public.contacts without drops, preserves archive relations, verifies
--      pre/post counts and non-null fields, and creates a read-only security-invoker view.
--   3. Deterministic subscription provenance: Uses owner_user_id (never owner_id),
--      protects verified Stripe records, and converts qualifying none rows idempotently.
--   4. Ancillary integration tables tenantization: Backfills verified workspace_id
--      onto integration endpoints, events, executions, logs, subscriptions, and history,
--      validates completeness before enforcing NOT NULL, and enforces (workspace_id, provider) uniqueness.
--   5. Purges legacy RLS bypasses across 24 Tier 0F tables: Replaces permissive
--      user_id = auth.uid() and broad USING (true) policies with strict workspace RBAC.
--   6. Hardened usage increment RPC: Enforces atomic row locking, positive counts,
--      strict provenance check, and message limits.
--   7. Secure website funnel & lead ingestion: Globally unique published slug index,
--      payload-hashed namespaced idempotency reservation, and private internal UUIDs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. WEBHOOK EVENTS RLS HARDENING (NULL TENANT DISCLOSURE FIX)
-- ----------------------------------------------------------------------------
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop all known historical and permissive SELECT policies on webhook_events
  DROP POLICY IF EXISTS "webhook_events_select_member" ON public.webhook_events;
  DROP POLICY IF EXISTS "webhook_events_select" ON public.webhook_events;
  DROP POLICY IF EXISTS "allow_tenant_read_webhook_events" ON public.webhook_events;
  DROP POLICY IF EXISTS "webhook_events_service_role_all" ON public.webhook_events;

  -- Create service role policy
  CREATE POLICY "webhook_events_service_role_all" ON public.webhook_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

  -- Tolerant creation of tenant select policy
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'webhook_events'
      AND policyname = 'webhook_events_tenant_select'
  ) THEN
    DROP POLICY "webhook_events_tenant_select" ON public.webhook_events;
  END IF;

  CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events FOR SELECT
    TO authenticated
    USING (
      workspace_id IS NOT NULL
      AND public.is_workspace_member(workspace_id)
    );
END $$;

-- Transactional assertion: Abort if any remaining authenticated/public policy allows NULL workspace_id
DO $$
DECLARE
  v_bad_policy TEXT;
BEGIN
  SELECT policyname INTO v_bad_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'webhook_events'
    AND cmd IN ('SELECT', 'ALL')
    AND policyname != 'webhook_events_service_role_all'
    AND (
      qual ILIKE '%workspace_id IS NULL%'
      OR qual ILIKE '%workspace_id IS NOT NULL OR%'
    );

  IF v_bad_policy IS NOT NULL THEN
    RAISE EXCEPTION 'Security assertion failed: Policy % still permits NULL workspace_id on webhook_events', v_bad_policy;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CANONICAL CONTACTS CONSOLIDATION & OBJECT-AWARE NON-DESTRUCTIVE CRM MIGRATION
-- ----------------------------------------------------------------------------
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

DO $$
DECLARE
  v_crm_kind "char";
  v_archive_kind "char";
  v_pre_count BIGINT := 0;
  v_post_count BIGINT := 0;
  v_fk_record RECORD;
BEGIN
  -- 1. Detect current object type for public.crm_contacts
  SELECT c.relkind INTO v_crm_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'crm_contacts';

  -- If crm_contacts is a physical table ('r'), safely backfill and convert without deleting data
  IF v_crm_kind = 'r' THEN
    EXECUTE 'SELECT count(*) FROM public.crm_contacts' INTO v_pre_count;

    -- Check archive table state
    SELECT c.relkind INTO v_archive_kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'crm_contacts_legacy_archive_tier0f';

    IF v_archive_kind IS NOT NULL THEN
      -- If archive relation already exists, verify it is a compatible table ('r')
      IF v_archive_kind != 'r' THEN
        RAISE EXCEPTION 'Incompatible archive relation crm_contacts_legacy_archive_tier0f exists with relkind % (manual review required)', v_archive_kind;
      END IF;
      -- Merge missing rows into existing archive without dropping either relation
      INSERT INTO public.crm_contacts_legacy_archive_tier0f
      SELECT * FROM public.crm_contacts crm
      ON CONFLICT (id) DO NOTHING;
    ELSE
      -- Rename legacy table to archive relation; zero data deleted
      ALTER TABLE public.crm_contacts RENAME TO crm_contacts_legacy_archive_tier0f;
    END IF;

    -- 2. Update canonical contacts using documented precedence:
    -- Legacy null values must not overwrite existing non-null canonical values!
    UPDATE public.contacts c
    SET
      first_name = COALESCE(c.first_name, arc.first_name),
      last_name = COALESCE(c.last_name, arc.last_name),
      job_title = COALESCE(c.job_title, arc.job_title),
      type = COALESCE(c.type, arc.type),
      status = COALESCE(c.status, arc.status),
      notes = COALESCE(c.notes, arc.notes),
      last_contacted_at = COALESCE(c.last_contacted_at, arc.last_contacted_at),
      company = COALESCE(c.company, arc.company),
      phone = COALESCE(c.phone, arc.phone),
      email = COALESCE(c.email, arc.email),
      source = COALESCE(c.source, arc.source),
      estimated_value = COALESCE(c.estimated_value, arc.estimated_value, 0.00),
      assigned_user_id = COALESCE(c.assigned_user_id, arc.user_id),
      updated_at = GREATEST(c.updated_at, arc.updated_at)
    FROM public.crm_contacts_legacy_archive_tier0f arc
    WHERE c.id = arc.id;

    -- 3. Insert any missing legacy contacts into canonical public.contacts
    INSERT INTO public.contacts (
      id,
      workspace_id,
      name,
      first_name,
      last_name,
      email,
      phone,
      company,
      job_title,
      type,
      status,
      source,
      deal_stage,
      estimated_value,
      notes,
      assigned_user_id,
      last_contact_at,
      last_contacted_at,
      created_at,
      updated_at
    )
    SELECT
      arc.id,
      arc.workspace_id,
      COALESCE(NULLIF(trim(concat(COALESCE(arc.first_name, ''), ' ', COALESCE(arc.last_name, ''))), ''), arc.email, arc.phone, 'Unnamed Contact'),
      arc.first_name,
      arc.last_name,
      arc.email,
      arc.phone,
      arc.company,
      arc.job_title,
      COALESCE(arc.type, 'Lead'),
      COALESCE(arc.status, 'New'),
      COALESCE(arc.source, 'crm'),
      CASE lower(COALESCE(arc.status, 'new'))
        WHEN 'won' THEN 'won'
        WHEN 'qualified' THEN 'qualified'
        WHEN 'contacted' THEN 'qualified'
        WHEN 'interested' THEN 'proposal'
        WHEN 'lost' THEN 'churned'
        ELSE 'lead'
      END,
      COALESCE(arc.estimated_value, 0.00),
      arc.notes,
      arc.user_id,
      COALESCE(arc.last_contacted_at, arc.created_at, now()),
      arc.last_contacted_at,
      COALESCE(arc.created_at, now()),
      COALESCE(arc.updated_at, now())
    FROM public.crm_contacts_legacy_archive_tier0f arc
    WHERE NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = arc.id);

    -- 4. Assert row-count preservation
    SELECT count(*) INTO v_post_count
    FROM public.contacts c
    WHERE c.id IN (SELECT id FROM public.crm_contacts_legacy_archive_tier0f);

    IF v_post_count < v_pre_count THEN
      RAISE EXCEPTION 'Consolidation verification failed: Expected at least % contacts preserved, found %', v_pre_count, v_post_count;
    END IF;

    -- 5. Assert field preservation: ensure non-null archive fields were preserved in canonical contacts
    IF EXISTS (
      SELECT 1
      FROM public.crm_contacts_legacy_archive_tier0f arc
      JOIN public.contacts c ON c.id = arc.id
      WHERE (arc.email IS NOT NULL AND c.email IS NULL)
         OR (arc.phone IS NOT NULL AND c.phone IS NULL)
         OR (arc.company IS NOT NULL AND c.company IS NULL)
    ) THEN
      RAISE EXCEPTION 'Field preservation assertion failed: non-null contact fields from archive were not preserved in canonical contacts';
    END IF;

    -- 6. Discover and rebind foreign keys referencing legacy table to canonical contacts
    FOR v_fk_record IN
      SELECT
        tc.table_schema,
        tc.table_name,
        tc.constraint_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public'
        AND ccu.table_name = 'crm_contacts_legacy_archive_tier0f'
    LOOP
      EXECUTE format(
        'ALTER TABLE %I.%I DROP CONSTRAINT %I',
        v_fk_record.table_schema,
        v_fk_record.table_name,
        v_fk_record.constraint_name
      );
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.contacts(id) ON DELETE SET NULL',
        v_fk_record.table_schema,
        v_fk_record.table_name,
        v_fk_record.constraint_name,
        v_fk_record.column_name
      );
    END LOOP;

    -- Revoke client access to the archive
    REVOKE ALL ON public.crm_contacts_legacy_archive_tier0f FROM PUBLIC, anon, authenticated;
  END IF;

  -- Apply defaults for future inserts
  ALTER TABLE public.contacts ALTER COLUMN type SET DEFAULT 'Lead';
  ALTER TABLE public.contacts ALTER COLUMN status SET DEFAULT 'New';
END $$;

-- Populate first_name / last_name for any contacts with composite name
UPDATE public.contacts
SET
  first_name = COALESCE(first_name, split_part(name, ' ', 1)),
  last_name = COALESCE(last_name, NULLIF(substr(name, length(split_part(name, ' ', 1)) + 2), ''))
WHERE first_name IS NULL OR last_name IS NULL;

-- Create read-only security-invoker compatibility view over canonical contacts
CREATE OR REPLACE VIEW public.crm_contacts
WITH (security_invoker = on)
AS
SELECT
  c.id,
  c.workspace_id,
  c.assigned_user_id AS user_id,
  COALESCE(c.first_name, split_part(c.name, ' ', 1)) AS first_name,
  COALESCE(c.last_name, NULLIF(substr(c.name, length(split_part(c.name, ' ', 1)) + 2), '')) AS last_name,
  c.email,
  c.phone,
  c.company,
  c.job_title,
  COALESCE(c.type, 'Lead') AS type,
  COALESCE(c.status, 'New') AS status,
  COALESCE(c.source, 'crm') AS source,
  c.estimated_value,
  c.notes,
  COALESCE(c.last_contacted_at, c.last_contact_at) AS last_contacted_at,
  c.created_at,
  c.updated_at
FROM public.contacts c;

-- Compatibility view is strictly read-only for clients; all mutations must target public.contacts
GRANT SELECT ON public.crm_contacts TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.crm_contacts FROM anon, authenticated, PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. DETERMINISTIC SUBSCRIPTION PROVENANCE (FIXED OWNER_USER_ID)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 4. ANCILLARY INTEGRATION TABLES TENANTIZATION & UNIQUE CONSTRAINT
-- ----------------------------------------------------------------------------
-- Ensure integrations tenant uniqueness constraint (workspace_id, provider)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_integrations_workspace_provider'
  ) THEN
    ALTER TABLE public.integrations
      ADD CONSTRAINT uq_integrations_workspace_provider UNIQUE (workspace_id, provider);
  END IF;
END $$;

-- Add workspace_id to ancillary integration tables
ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_webhook_endpoints
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_webhook_events
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_action_executions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_operation_logs
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_provider_subscriptions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.integration_status_history
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Backfill workspace_id from parent integration relationship
UPDATE public.integration_credentials tc
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tc.integration_id = i.id AND tc.workspace_id IS NULL;

UPDATE public.integration_webhook_endpoints twe
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE twe.integration_id = i.id AND twe.workspace_id IS NULL;

UPDATE public.integration_webhook_events twev
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE twev.integration_id = i.id AND twev.workspace_id IS NULL;

UPDATE public.integration_action_executions tae
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tae.integration_id = i.id AND tae.workspace_id IS NULL;

UPDATE public.integration_operation_logs tol
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tol.integration_id = i.id AND tol.workspace_id IS NULL;

UPDATE public.integration_provider_subscriptions tps
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tps.integration_id = i.id AND tps.workspace_id IS NULL;

UPDATE public.integration_status_history tsh
SET workspace_id = i.workspace_id
FROM public.integrations i
WHERE tsh.integration_id = i.id AND tsh.workspace_id IS NULL;

-- Validate backfill completeness before enforcing NOT NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.integration_credentials WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_credentials';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_webhook_endpoints WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_webhook_endpoints';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_webhook_events WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_webhook_events';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_action_executions WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_action_executions';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_operation_logs WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_operation_logs';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_provider_subscriptions WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_provider_subscriptions';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_status_history WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'Tenantization backfill validation failed: NULL workspace_id in integration_status_history';
  END IF;
END $$;

-- Enforce NOT NULL constraints and create tenant indexes
ALTER TABLE public.integration_credentials ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_webhook_endpoints ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_webhook_events ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_action_executions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_operation_logs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_provider_subscriptions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.integration_status_history ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_credentials_ws ON public.integration_credentials (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_endpoints_ws ON public.integration_webhook_endpoints (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_ws ON public.integration_webhook_events (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_action_executions_ws ON public.integration_action_executions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_operation_logs_ws ON public.integration_operation_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_provider_subscriptions_ws ON public.integration_provider_subscriptions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_integration_status_history_ws ON public.integration_status_history (workspace_id);

CREATE OR REPLACE FUNCTION public.record_integration_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (
    tg_op = 'INSERT'
    OR old.status IS DISTINCT FROM new.status
  ) THEN
    INSERT INTO public.integration_status_history (
      workspace_id,
      integration_id,
      user_id,
      previous_status,
      next_status,
      reason,
      metadata
    )
    VALUES (
      new.workspace_id,
      new.id,
      new.user_id,
      CASE
        WHEN tg_op = 'INSERT' THEN NULL
        ELSE old.status
      END,
      new.status,
      new.status_reason,
      COALESCE(
        new.status_metadata,
        '{}'::jsonb
      )
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_integration_status_history ON public.integrations;
CREATE TRIGGER trg_integration_status_history
  AFTER INSERT OR UPDATE OF status ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.record_integration_status_history();

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_credentials_integration_id
  ON public.integration_credentials (integration_id);

CREATE OR REPLACE FUNCTION public.store_integration_credential_envelope(
  p_integration_id UUID,
  p_encrypted_payload TEXT,
  p_initialization_vector TEXT,
  p_authentication_tag TEXT,
  p_algorithm TEXT,
  p_key_version INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_integration public.integrations%ROWTYPE;
  v_cred_id UUID;
  v_caller_is_service_role BOOLEAN;
BEGIN
  v_caller_is_service_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    ''
  ) = 'service_role';

  SELECT * INTO v_integration
  FROM public.integrations
  WHERE id = p_integration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration connection was not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Enforce tenant admin RBAC
  IF NOT v_caller_is_service_role THEN
    IF auth.uid() IS NULL OR NOT public.has_workspace_role(v_integration.workspace_id, ARRAY['owner', 'admin']) THEN
      RAISE EXCEPTION 'Integration credential access is forbidden: workspace admin role required.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_algorithm <> 'aes-256-gcm' THEN
    RAISE EXCEPTION 'Unsupported credential encryption algorithm: %', p_algorithm USING ERRCODE = '22023';
  END IF;

  IF p_key_version IS NULL OR p_key_version < 1 THEN
    RAISE EXCEPTION 'Invalid credential key version.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.integration_credentials (
    integration_id,
    workspace_id,
    encrypted_payload,
    initialization_vector,
    authentication_tag,
    algorithm,
    key_version
  )
  VALUES (
    v_integration.id,
    v_integration.workspace_id,
    p_encrypted_payload,
    p_initialization_vector,
    p_authentication_tag,
    p_algorithm,
    p_key_version
  )
  ON CONFLICT (integration_id)
  DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    encrypted_payload = EXCLUDED.encrypted_payload,
    initialization_vector = EXCLUDED.initialization_vector,
    authentication_tag = EXCLUDED.authentication_tag,
    algorithm = EXCLUDED.algorithm,
    key_version = EXCLUDED.key_version
  RETURNING id INTO v_cred_id;

  UPDATE public.integrations
  SET credential_reference = v_cred_id::text,
      updated_at = now()
  WHERE id = v_integration.id;

  RETURN v_cred_id;
END;
$$;

REVOKE ALL ON FUNCTION public.store_integration_credential_envelope(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_integration_credential_envelope(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_integration_credential_envelope(
  p_integration_id UUID
)
RETURNS TABLE (
  credential_id UUID,
  integration_id UUID,
  workspace_id UUID,
  provider TEXT,
  encrypted_payload TEXT,
  initialization_vector TEXT,
  authentication_tag TEXT,
  algorithm TEXT,
  key_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_integration public.integrations%ROWTYPE;
  v_caller_is_service_role BOOLEAN;
BEGIN
  v_caller_is_service_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    ''
  ) = 'service_role';

  SELECT * INTO v_integration
  FROM public.integrations
  WHERE id = p_integration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration connection was not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Enforce tenant admin RBAC
  IF NOT v_caller_is_service_role THEN
    IF auth.uid() IS NULL OR NOT public.has_workspace_role(v_integration.workspace_id, ARRAY['owner', 'admin']) THEN
      RAISE EXCEPTION 'Forbidden: workspace admin role required.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.integration_id,
    c.workspace_id,
    v_integration.provider,
    c.encrypted_payload,
    c.initialization_vector,
    c.authentication_tag,
    c.algorithm,
    c.key_version
  FROM public.integration_credentials c
  WHERE c.integration_id = p_integration_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_integration_credential_envelope(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_integration_credential_envelope(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. PURGE LEGACY RLS BYPASSES & ESTABLISH STRICT TENANT POLICIES (24 TABLES)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
  v_pol RECORD;
  v_tables TEXT[] := ARRAY[
    'integrations',
    'integration_credentials',
    'integration_webhook_endpoints',
    'integration_webhook_events',
    'integration_action_executions',
    'integration_operation_logs',
    'integration_provider_subscriptions',
    'integration_status_history',
    'website_funnels',
    'commerce_products',
    'commerce_orders',
    'finance_invoices',
    'marketing_campaigns',
    'company_knowledge_documents',
    'workforce_members',
    'automation_versions',
    'webhook_events',
    'contacts',
    'inbox_threads',
    'inbox_messages',
    'ai_tasks',
    'automations',
    'automation_runs',
    'activity_logs'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', v_table);

    -- Drop all legacy and permissive policies
    FOR v_pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

-- A. Standard workspace collaborative tables
-- Read: Active members with any role (owner, admin, manager, agent, viewer)
-- Write: Active members with operational roles (owner, admin, manager, agent) - Viewer is strictly read-only!
-- Service Role: Full access
DO $$
DECLARE
  v_tab TEXT;
  v_collaborative_tables TEXT[] := ARRAY[
    'contacts',
    'inbox_threads',
    'inbox_messages',
    'website_funnels',
    'commerce_orders',
    'finance_invoices',
    'marketing_campaigns',
    'company_knowledge_documents',
    'workforce_members',
    'automations',
    'automation_versions',
    'automation_runs',
    'ai_tasks',
    'activity_logs',
    'integrations',
    'integration_action_executions',
    'integration_operation_logs',
    'integration_provider_subscriptions',
    'integration_status_history',
    'integration_webhook_endpoints'
  ];
BEGIN
  FOREACH v_tab IN ARRAY v_collaborative_tables LOOP
    EXECUTE format('
      CREATE POLICY "%I_service_role_all" ON public.%I
        FOR ALL TO service_role USING (true) WITH CHECK (true);

      CREATE POLICY "%I_tenant_select" ON public.%I
        FOR SELECT TO authenticated
        USING (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent'', ''viewer''])
        );

      CREATE POLICY "%I_tenant_insert" ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent''])
        );

      CREATE POLICY "%I_tenant_update" ON public.%I
        FOR UPDATE TO authenticated
        USING (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent''])
        )
        WITH CHECK (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent''])
        );

      CREATE POLICY "%I_tenant_delete" ON public.%I
        FOR DELETE TO authenticated
        USING (
          workspace_id IS NOT NULL
          AND public.has_workspace_role(workspace_id, ARRAY[''owner'', ''admin'', ''manager'', ''agent''])
        );
    ', v_tab, v_tab, v_tab, v_tab, v_tab, v_tab, v_tab, v_tab, v_tab, v_tab);
  END LOOP;
END $$;

-- B. Sensitive integration credentials table: Owner and Admin only
CREATE POLICY "integration_credentials_service_role_all" ON public.integration_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "integration_credentials_tenant_select" ON public.integration_credentials
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY "integration_credentials_tenant_insert" ON public.integration_credentials
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY "integration_credentials_tenant_update" ON public.integration_credentials
  FOR UPDATE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY "integration_credentials_tenant_delete" ON public.integration_credentials
  FOR DELETE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- C. Event tables: webhook_events and integration_webhook_events (service-role write only)
CREATE POLICY "webhook_events_service_role_all" ON public.webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

CREATE POLICY "integration_webhook_events_service_role_all" ON public.integration_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "integration_webhook_events_tenant_select" ON public.integration_webhook_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

-- D. Commerce products: Remove global exposure (no global status = 'active' bypass!)
-- Strictly scoped to workspace members; public storefront uses separate explicit boundary
CREATE POLICY "commerce_products_service_role_all" ON public.commerce_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "commerce_products_tenant_select" ON public.commerce_products
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
  );

CREATE POLICY "commerce_products_tenant_insert" ON public.commerce_products
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "commerce_products_tenant_update" ON public.commerce_products
  FOR UPDATE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "commerce_products_tenant_delete" ON public.commerce_products
  FOR DELETE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

-- Assert no remaining bypass policies on the 24 tables
DO $$
DECLARE
  v_bad_count INT;
BEGIN
  SELECT count(*) INTO v_bad_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'integrations', 'integration_credentials', 'integration_webhook_endpoints',
      'integration_webhook_events', 'integration_action_executions', 'integration_operation_logs',
      'integration_provider_subscriptions', 'integration_status_history', 'website_funnels',
      'commerce_products', 'commerce_orders', 'finance_invoices', 'marketing_campaigns',
      'company_knowledge_documents', 'workforce_members', 'automation_versions',
      'webhook_events', 'contacts', 'inbox_threads', 'inbox_messages', 'ai_tasks',
      'automations', 'automation_runs', 'activity_logs'
    )
    AND policyname NOT LIKE '%service_role%'
    AND (
      qual ILIKE '%user_id = auth.uid()%'
      OR qual = 'true'
      OR qual ILIKE '%status = ''active'' OR%'
    );

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'RLS audit assertion failed: % legacy bypass policies remain', v_bad_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. HARDENED USAGE INCREMENT RPC
-- ----------------------------------------------------------------------------
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
  v_is_authorized BOOLEAN := false;
BEGIN
  -- 1. Input sanitization: Reject zero, negative, or unreasonable increments
  IF p_count IS NULL OR p_count <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage increment: count must be greater than zero',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  IF p_count > 100000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid usage increment: count exceeds maximum batch threshold',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 2. Authorization: Only service_role or active members with operational roles can invoke
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks permission for this workspace',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 3. Lock subscription row exclusively during evaluation
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

  -- 4. Deny unverified provenance
  IF v_sub.provenance = 'none' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription lacks verified billing provenance',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 5. Rollover & status checks
  -- Founder internal grant: permanent grant rolls period forward and resets usage
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
    -- Check expiration for standard subscriptions
    IF v_sub.current_period_end < now() AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Subscription billing period expired',
        'limit_reached', true,
        'is_exceeded', true
      );
    END IF;
  END IF;

  -- Status check
  IF v_sub.status NOT IN ('active', 'trialing', 'past_due') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is inactive (' || v_sub.status || ')',
      'limit_reached', true,
      'is_exceeded', true
    );
  END IF;

  -- 6. Quota check (zero quota means zero allowance in both SQL and TypeScript)
  IF v_sub.monthly_message_limit <= 0 OR (v_sub.messages_used_this_period + p_count) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'limit_reached', true,
      'is_exceeded', true,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'monthly_message_limit', v_sub.monthly_message_limit
    );
  END IF;

  -- 7. Perform atomic increment within verified quota
  UPDATE public.workspace_subscriptions
  SET messages_used_this_period = messages_used_this_period + p_count,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
  RETURNING * INTO v_sub;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_sub.workspace_id,
    'messages_used_this_period', v_sub.messages_used_this_period,
    'new_usage', v_sub.messages_used_this_period,
    'monthly_message_limit', v_sub.monthly_message_limit,
    'limit_reached', false,
    'is_exceeded', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_workspace_usage(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_workspace_usage(UUID, INT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. SECURE WEBSITE FUNNEL IDENTITY & LEAD INGESTION WITH IDEMPOTENCY
-- ----------------------------------------------------------------------------
-- Enforce globally unique published slug across all workspaces
CREATE UNIQUE INDEX IF NOT EXISTS uq_website_funnels_published_slug
  ON public.website_funnels (lower(trim(slug)))
  WHERE (is_published = true);

-- Recreate website_lead_idempotency with workspace namespacing and payload hash
CREATE TABLE IF NOT EXISTS public.website_lead_idempotency (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  funnel_id UUID NOT NULL REFERENCES public.website_funnels(id) ON DELETE CASCADE,
  payload_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'committed',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, idempotency_key)
);

ALTER TABLE public.website_lead_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_idempotency_service_role" ON public.website_lead_idempotency;
CREATE POLICY "lead_idempotency_service_role" ON public.website_lead_idempotency
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_website_lead(
  p_funnel_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_message TEXT,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_funnel public.website_funnels%ROWTYPE;
  v_contact public.contacts%ROWTYPE;
  v_thread public.inbox_threads%ROWTYPE;
  v_message public.inbox_messages%ROWTYPE;
  v_existing_lead public.website_lead_idempotency%ROWTYPE;
  v_clean_phone TEXT;
  v_clean_email TEXT;
  v_clean_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_payload_hash TEXT;
  v_trimmed_key TEXT;
BEGIN
  -- 1. Strictly resolve published funnel by verified UUID first
  SELECT * INTO v_funnel
  FROM public.website_funnels
  WHERE id = p_funnel_id
    AND is_published = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Funnel not found or unpublished'
    );
  END IF;

  v_clean_name := COALESCE(NULLIF(trim(p_name), ''), 'Inbound Visitor');
  v_clean_email := NULLIF(lower(trim(p_email)), '');
  v_clean_phone := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
  IF v_clean_phone IS NOT NULL THEN
    v_clean_phone := '+' || v_clean_phone;
  END IF;

  IF v_clean_phone IS NULL AND v_clean_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact email or phone is required');
  END IF;

  -- 2. Compute canonical payload hash
  v_payload_hash := md5(concat_ws('|', v_clean_name, COALESCE(v_clean_email, ''), COALESCE(v_clean_phone, ''), COALESCE(p_message, '')));

  -- 3. Idempotency Check namespaced by resolved workspace
  v_trimmed_key := NULLIF(trim(p_idempotency_key), '');
  IF v_trimmed_key IS NOT NULL THEN
    SELECT * INTO v_existing_lead
    FROM public.website_lead_idempotency
    WHERE workspace_id = v_funnel.workspace_id
      AND idempotency_key = v_trimmed_key;

    IF FOUND THEN
      -- Same key plus different payload must return conflict!
      IF v_existing_lead.payload_sha256 != v_payload_hash THEN
        RETURN jsonb_build_object(
          'success', false,
          'conflict', true,
          'error', 'Idempotency key reused with different payload'
        );
      END IF;

      -- Return duplicate confirmation without exposing internal UUIDs publicly
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true
      );
    END IF;

    -- Reserve the idempotency key before creating contact/thread/message records
    INSERT INTO public.website_lead_idempotency (
      workspace_id,
      idempotency_key,
      funnel_id,
      payload_sha256,
      status
    ) VALUES (
      v_funnel.workspace_id,
      v_trimmed_key,
      v_funnel.id,
      v_payload_hash,
      'reserved'
    );
  END IF;

  v_first_name := split_part(v_clean_name, ' ', 1);
  v_last_name := NULLIF(substr(v_clean_name, length(v_first_name) + 2), '');

  -- 4. Create Contact bound strictly to the funnel's workspace
  INSERT INTO public.contacts (
    workspace_id,
    name,
    first_name,
    last_name,
    email,
    phone,
    source,
    deal_stage,
    type,
    status,
    notes,
    metadata
  ) VALUES (
    v_funnel.workspace_id,
    v_clean_name,
    v_first_name,
    v_last_name,
    v_clean_email,
    v_clean_phone,
    'website_funnel:' || v_funnel.slug,
    'lead',
    'Lead',
    'New',
    p_notes,
    jsonb_build_object(
      'funnel_id', v_funnel.id,
      'funnel_slug', v_funnel.slug,
      'lead_message', p_message,
      'ingestion_metadata', COALESCE(p_metadata, '{}'::jsonb)
    )
  )
  RETURNING * INTO v_contact;

  -- 5. Create Inbox Thread bound strictly to the funnel's workspace
  INSERT INTO public.inbox_threads (
    workspace_id,
    contact_id,
    channel,
    status,
    priority,
    unread_count,
    last_message_at,
    metadata
  ) VALUES (
    v_funnel.workspace_id,
    v_contact.id,
    'website',
    'active',
    'medium',
    1,
    now(),
    jsonb_build_object('funnel_id', v_funnel.id, 'lead_name', v_clean_name)
  )
  RETURNING * INTO v_thread;

  -- 6. Create Initial Inbox Message bound strictly to the funnel's workspace
  INSERT INTO public.inbox_messages (
    workspace_id,
    thread_id,
    direction,
    provider,
    content,
    delivery_status,
    message_type,
    metadata
  ) VALUES (
    v_funnel.workspace_id,
    v_thread.id,
    'inbound',
    'website',
    COALESCE(NULLIF(trim(p_message), ''), 'Inbound lead inquiry from ' || v_funnel.title),
    'delivered',
    'text',
    jsonb_build_object('funnel_slug', v_funnel.slug)
  )
  RETURNING * INTO v_message;

  -- 7. Commit idempotency record if key was provided
  IF v_trimmed_key IS NOT NULL THEN
    UPDATE public.website_lead_idempotency
    SET
      status = 'committed',
      contact_id = v_contact.id,
      thread_id = v_thread.id,
      message_id = v_message.id,
      updated_at = now()
    WHERE workspace_id = v_funnel.workspace_id
      AND idempotency_key = v_trimmed_key;
  END IF;

  -- Return minimal response without exposing internal contact/thread/message UUIDs publicly
  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false
  );
END;
$$;

-- Revoke execute from PUBLIC, anon, and authenticated; grant ONLY to service_role
REVOKE ALL ON FUNCTION public.create_website_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_website_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.create_website_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_website_lead(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- 8. NOTIFY POSTGREST SCHEMA CACHE RELOAD
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
