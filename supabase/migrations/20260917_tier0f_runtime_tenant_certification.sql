-- ============================================================================
-- J10 NEXUS TIER 0F RUNTIME TENANT CERTIFICATION & CONSOLIDATION MIGRATION
-- File: supabase/migrations/20260917_tier0f_runtime_tenant_certification.sql
-- Description:
--   1. Replaces broad webhook_events RLS policies so unassigned/NULL tenant events
--      are strictly service-role only, while resolved events are readable only
--      by matching workspace members. Drops all legacy permissive policies.
--   2. Safely consolidates split CRM contacts into canonical public.contacts,
--      preserving all 7 existing customer records without defaults overwriting real
--      values, discovers and rebinds foreign keys, and converts public.crm_contacts
--      into a read-only security-invoker view.
--   3. Introduces explicit subscription provenance ('stripe', 'trial', 'internal_grant', 'none')
--      derived deterministically without hardcoded UUIDs, deactivating unverified subscriptions.
--   4. Hardens public.increment_workspace_usage RPC with pre-mutation quota
--      verification, row locking (FOR UPDATE), caller authorization, and zero-increment on overage.
--   5. Implements atomic, service-role-only public.create_website_lead RPC with
--      funnel UUID validation, lead submission idempotency, and transactional rollback.
--   6. Reloads PostgREST schema cache and returns verification summary.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. WEBHOOK EVENTS RLS HARDENING (NULL TENANT DISCLOSURE FIX)
-- ----------------------------------------------------------------------------
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Drop all known historical and permissive SELECT policies on webhook_events
DROP POLICY IF EXISTS "webhook_events_select_member" ON public.webhook_events;
DROP POLICY IF EXISTS "webhook_events_select" ON public.webhook_events;
DROP POLICY IF EXISTS "allow_tenant_read_webhook_events" ON public.webhook_events;
DROP POLICY IF EXISTS "webhook_events_tenant_select" ON public.webhook_events;

-- Authenticated tenants may only read events explicitly resolved to their workspace.
-- NULL workspace_id events are service-role only (completely invisible to tenant clients).
CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

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
-- 2. CANONICAL CONTACTS CONSOLIDATION & OBJECT-AWARE CRM MIGRATION
-- ----------------------------------------------------------------------------
-- Add missing CRM columns as NULLABLE WITHOUT DEFAULTS to prevent overwriting legacy values
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
  v_archive_exists BOOLEAN;
  v_fk_record RECORD;
BEGIN
  -- Discover current object type for public.crm_contacts
  SELECT c.relkind INTO v_crm_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'crm_contacts';

  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'crm_contacts_legacy_archive_tier0f'
  ) INTO v_archive_exists;

  -- If crm_contacts is a regular table ('r'), safely backfill and migrate
  IF v_crm_kind = 'r' THEN
    -- 1. Detect workspace-ID conflicts for matching contact IDs and abort if any exist
    IF EXISTS (
      SELECT 1 FROM public.contacts c
      JOIN public.crm_contacts crm ON c.id = crm.id
      WHERE c.workspace_id IS DISTINCT FROM crm.workspace_id
    ) THEN
      RAISE EXCEPTION 'Workspace ID mismatch detected between contacts and crm_contacts during Tier 0F consolidation';
    END IF;

    -- 2. Backfill exact legacy values first without defaults overriding real data
    UPDATE public.contacts c
    SET
      first_name = crm.first_name,
      last_name = crm.last_name,
      job_title = crm.job_title,
      type = crm.type,
      status = crm.status,
      notes = crm.notes,
      last_contacted_at = crm.last_contacted_at,
      company = COALESCE(c.company, crm.company),
      phone = COALESCE(c.phone, crm.phone),
      email = COALESCE(c.email, crm.email),
      source = COALESCE(c.source, crm.source),
      estimated_value = COALESCE(c.estimated_value, crm.estimated_value, 0.00),
      assigned_user_id = COALESCE(c.assigned_user_id, crm.user_id),
      updated_at = GREATEST(c.updated_at, crm.updated_at)
    FROM public.crm_contacts crm
    WHERE c.id = crm.id;

    -- 3. Insert any missing crm_contacts rows into public.contacts
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
      crm.id,
      crm.workspace_id,
      COALESCE(NULLIF(trim(concat(COALESCE(crm.first_name, ''), ' ', COALESCE(crm.last_name, ''))), ''), crm.email, crm.phone, 'Unnamed Contact'),
      crm.first_name,
      crm.last_name,
      crm.email,
      crm.phone,
      crm.company,
      crm.job_title,
      crm.type,
      crm.status,
      COALESCE(crm.source, 'crm'),
      CASE lower(COALESCE(crm.status, 'new'))
        WHEN 'won' THEN 'won'
        WHEN 'qualified' THEN 'qualified'
        WHEN 'contacted' THEN 'qualified'
        WHEN 'interested' THEN 'proposal'
        WHEN 'lost' THEN 'churned'
        ELSE 'lead'
      END,
      COALESCE(crm.estimated_value, 0.00),
      crm.notes,
      crm.user_id,
      COALESCE(crm.last_contacted_at, crm.created_at, now()),
      crm.last_contacted_at,
      COALESCE(crm.created_at, now()),
      COALESCE(crm.updated_at, now())
    FROM public.crm_contacts crm
    WHERE NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = crm.id);

    -- 4. Verify all original IDs exist in canonical contacts exactly once
    IF (SELECT count(*) FROM public.crm_contacts) <> (
      SELECT count(*) FROM public.contacts c
      WHERE c.id IN (SELECT id FROM public.crm_contacts)
    ) THEN
      RAISE EXCEPTION 'Consolidation verification failed: Not all legacy crm_contacts exist in public.contacts';
    END IF;

    -- 5. Rename table to archive without destructive CASCADE
    IF NOT v_archive_exists THEN
      ALTER TABLE public.crm_contacts RENAME TO crm_contacts_legacy_archive_tier0f;
    ELSE
      DROP TABLE IF EXISTS public.crm_contacts;
    END IF;

    -- Revoke client access to the archive
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'crm_contacts_legacy_archive_tier0f'
    ) THEN
      REVOKE ALL ON public.crm_contacts_legacy_archive_tier0f FROM PUBLIC, anon, authenticated;
    END IF;

    -- 6. Discover foreign keys referencing legacy table and rebind to public.contacts(id)
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
        AND ccu.table_name IN ('crm_contacts_legacy_archive_tier0f', 'crm_contacts')
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
  END IF;

  -- Apply defaults for future inserts now that legacy data is safely backfilled
  ALTER TABLE public.contacts ALTER COLUMN type SET DEFAULT 'Lead';
  ALTER TABLE public.contacts ALTER COLUMN status SET DEFAULT 'New';
END $$;

-- Populate first_name / last_name for any contacts with composite name
UPDATE public.contacts
SET
  first_name = COALESCE(first_name, split_part(name, ' ', 1)),
  last_name = COALESCE(last_name, NULLIF(substr(name, length(split_part(name, ' ', 1)) + 2), ''))
WHERE first_name IS NULL OR last_name IS NULL;

-- Create read-only security-invoker compatibility view over public.contacts
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

-- Compatibility view is strictly read-only for clients
GRANT SELECT ON public.crm_contacts TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.crm_contacts FROM anon, authenticated, PUBLIC;

-- ----------------------------------------------------------------------------
-- 3. DETERMINISTIC SUBSCRIPTION PROVENANCE
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'none';

-- Named, idempotently guarded provenance check constraint
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

-- Deterministic backfill of subscription provenance without hardcoded UUIDs:
-- A. Verified Stripe association
UPDATE public.workspace_subscriptions
SET provenance = 'stripe'
WHERE stripe_subscription_id IS NOT NULL
  AND status IN ('active', 'trialing');

-- B. Valid active trial
UPDATE public.workspace_subscriptions
SET provenance = 'trial'
WHERE stripe_subscription_id IS NULL
  AND status = 'trialing'
  AND (current_period_end > now() OR (grace_period_end IS NOT NULL AND grace_period_end > now()));

-- C. Canonical platform founder internal grant (resolved via platform_roles)
UPDATE public.workspace_subscriptions
SET provenance = 'internal_grant'
WHERE workspace_id IN (
  SELECT w.id
  FROM public.workspaces w
  JOIN public.platform_roles pr ON pr.user_id = w.owner_id
  WHERE pr.role = 'platform_founder'
    AND pr.revoked_at IS NULL
);

-- D. Everything else defaults to 'none'
UPDATE public.workspace_subscriptions
SET provenance = 'none'
WHERE provenance IS NULL;

ALTER TABLE public.workspace_subscriptions
  ALTER COLUMN provenance SET DEFAULT 'none',
  ALTER COLUMN provenance SET NOT NULL;

-- Do not leave unverified provenance = none rows active
UPDATE public.workspace_subscriptions
SET status = 'inactive',
    updated_at = now()
WHERE provenance = 'none'
  AND status IN ('active', 'trialing');

-- ----------------------------------------------------------------------------
-- 4. HARDENED USAGE INCREMENT RPC
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
-- 5. SECURE WEBSITE LEAD INGESTION RPC WITH IDEMPOTENCY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_lead_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
BEGIN
  -- 1. Idempotency Check: return existing IDs if key was previously committed
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    SELECT * INTO v_existing_lead
    FROM public.website_lead_idempotency
    WHERE idempotency_key = trim(p_idempotency_key);

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'contact_id', v_existing_lead.contact_id,
        'thread_id', v_existing_lead.thread_id,
        'message_id', v_existing_lead.message_id
      );
    END IF;
  END IF;

  -- 2. Strictly resolve published funnel by verified UUID
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

  v_first_name := split_part(v_clean_name, ' ', 1);
  v_last_name := NULLIF(substr(v_clean_name, length(v_first_name) + 2), '');

  -- 3. Create Contact bound strictly to the funnel's workspace
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

  -- 4. Create Inbox Thread bound strictly to the funnel's workspace (channel is always 'website')
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

  -- 5. Create Initial Inbox Message bound strictly to the funnel's workspace
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

  -- 6. Record idempotency if key was provided
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    INSERT INTO public.website_lead_idempotency (
      idempotency_key,
      workspace_id,
      contact_id,
      thread_id,
      message_id
    ) VALUES (
      trim(p_idempotency_key),
      v_funnel.workspace_id,
      v_contact.id,
      v_thread.id,
      v_message.id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  -- Return minimal response without exposing workspace UUID publicly
  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'contact_id', v_contact.id,
    'thread_id', v_thread.id,
    'message_id', v_message.id
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
-- 6. NOTIFY POSTGREST & RUN NON-SENSITIVE VERIFICATION SUMMARY
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT count(*) FROM public.workspaces) AS workspaces_count,
  (SELECT count(*) FROM public.workspace_memberships) AS memberships_count,
  (SELECT count(*) FROM public.contacts WHERE workspace_id IS NOT NULL) AS canonical_contacts_count,
  (SELECT count(*) FROM public.crm_contacts WHERE workspace_id IS NOT NULL) AS crm_view_contacts_count,
  (SELECT count(*) FROM public.workspace_subscriptions WHERE provenance = 'internal_grant') AS internal_grant_subs_count,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'webhook_events' AND policyname = 'webhook_events_tenant_select') AS webhook_tenant_policy_count,
  (SELECT count(*) FROM pg_proc WHERE proname IN ('increment_workspace_usage', 'create_website_lead')) AS verified_rpc_count;
