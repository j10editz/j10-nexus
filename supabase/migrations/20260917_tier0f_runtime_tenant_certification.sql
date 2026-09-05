-- ============================================================================
-- J10 NEXUS TIER 0F RUNTIME TENANT CERTIFICATION & CONSOLIDATION MIGRATION
-- File: supabase/migrations/20260917_tier0f_runtime_tenant_certification.sql
-- Description:
--   1. Replaces broad webhook_events RLS policy so unassigned/NULL tenant events
--      are strictly service-role only, while resolved events are readable only
--      by matching workspace members.
--   2. Consolidates split CRM contacts into canonical public.contacts, backfilling
--      all 7 existing customer records and converting public.crm_contacts into
--      a read-through security-invoker view.
--   3. Introduces explicit subscription provenance ('stripe', 'trial', 'internal_grant', 'none')
--      and labels J10 NEXUS HQ as internal_grant.
--   4. Hardens public.increment_workspace_usage RPC with pre-mutation quota
--      verification, row locking, caller authorization, and zero-increment on overage.
--   5. Implements atomic public.create_website_lead RPC ensuring lead contact,
--      inbox thread, and initial message are committed in a single transaction.
--   6. Reloads PostgREST schema cache and returns verification summary.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. WEBHOOK EVENTS RLS HARDENING (NULL TENANT DISCLOSURE FIX)
-- ----------------------------------------------------------------------------
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_events_select" ON public.webhook_events;
DROP POLICY IF EXISTS "allow_tenant_read_webhook_events" ON public.webhook_events;
DROP POLICY IF EXISTS "webhook_events_tenant_select" ON public.webhook_events;

-- Authenticated tenants may only read events explicitly resolved to their workspace.
-- NULL workspace_id events are service-role only (invisible to tenant clients).
CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id)
  );

-- ----------------------------------------------------------------------------
-- 2. CANONICAL CONTACTS CONSOLIDATION & CRM UNIFICATION
-- ----------------------------------------------------------------------------
-- Ensure public.contacts has all business and CRM columns
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Lead';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'New';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- Backfill data from crm_contacts into public.contacts for existing matches
UPDATE public.contacts c
SET
  first_name = COALESCE(c.first_name, crm.first_name),
  last_name = COALESCE(c.last_name, crm.last_name),
  job_title = COALESCE(c.job_title, crm.job_title),
  type = COALESCE(c.type, crm.type, 'Lead'),
  status = COALESCE(c.status, crm.status, 'New'),
  notes = COALESCE(c.notes, crm.notes),
  last_contacted_at = COALESCE(c.last_contacted_at, crm.last_contacted_at, c.last_contact_at),
  company = COALESCE(c.company, crm.company),
  phone = COALESCE(c.phone, crm.phone),
  email = COALESCE(c.email, crm.email),
  source = COALESCE(c.source, crm.source, 'crm')
FROM public.crm_contacts crm
WHERE c.id = crm.id;

-- Insert any missing crm_contacts rows into public.contacts
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
  notes,
  last_contact_at,
  last_contacted_at,
  created_at,
  updated_at
)
SELECT
  crm.id,
  crm.workspace_id,
  TRIM(COALESCE(crm.first_name, '') || ' ' || COALESCE(crm.last_name, '')),
  crm.first_name,
  crm.last_name,
  crm.email,
  crm.phone,
  crm.company,
  crm.job_title,
  COALESCE(crm.type, 'Lead'),
  COALESCE(crm.status, 'New'),
  COALESCE(crm.source, 'crm'),
  crm.notes,
  crm.last_contacted_at,
  crm.last_contacted_at,
  crm.created_at,
  crm.updated_at
FROM public.crm_contacts crm
WHERE NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = crm.id)
ON CONFLICT (id) DO NOTHING;

-- Populate first_name / last_name for any contact with name
UPDATE public.contacts
SET
  first_name = COALESCE(first_name, split_part(name, ' ', 1)),
  last_name = COALESCE(last_name, NULLIF(substr(name, length(split_part(name, ' ', 1)) + 2), ''))
WHERE first_name IS NULL OR last_name IS NULL;

-- Convert crm_contacts to a security-invoker read-through view
DROP TABLE IF EXISTS public.crm_contacts CASCADE;

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

-- ----------------------------------------------------------------------------
-- 3. SUBSCRIPTION PROVENANCE & INTERNAL GRANT TRACKING
-- ----------------------------------------------------------------------------
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'none'
  CHECK (provenance IN ('stripe', 'trial', 'internal_grant', 'none'));

-- Label J10 NEXUS HQ subscription honestly as internal_grant
UPDATE public.workspace_subscriptions
SET provenance = 'internal_grant'
WHERE workspace_id = 'ce593364-2aaf-47e4-a1d2-2272775747c4'
  AND stripe_subscription_id IS NULL;

-- ----------------------------------------------------------------------------
-- 4. HARDENED USAGE INCREMENT RPC (PRE-MUTATION QUOTA ENFORCEMENT)
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
  IF p_count <= 0 THEN
    p_count := 1;
  END IF;

  -- 1. Authorization: Only service_role or active members with operational roles can invoke
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.has_workspace_role(p_workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: caller lacks permission for this workspace',
      'limit_reached', true
    );
  END IF;

  -- 2. Lock row exclusively during evaluation
  SELECT * INTO v_sub
  FROM public.workspace_subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No subscription provisioned for this workspace',
      'limit_reached', true
    );
  END IF;

  -- 3. Status checks
  IF v_sub.status NOT IN ('active', 'trialing') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription is inactive (' || v_sub.status || ')',
      'limit_reached', true
    );
  END IF;

  -- 4. Expiration checks
  IF v_sub.current_period_end < now() AND (v_sub.grace_period_end IS NULL OR v_sub.grace_period_end < now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Subscription period expired',
      'limit_reached', true
    );
  END IF;

  -- 5. Pre-mutation quota check: DO NOT increment if overage would occur
  IF (v_sub.messages_used_this_period + p_count) > v_sub.monthly_message_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly message quota exceeded',
      'limit_reached', true,
      'messages_used_this_period', v_sub.messages_used_this_period,
      'monthly_message_limit', v_sub.monthly_message_limit
    );
  END IF;

  -- 6. Perform atomic increment within verified quota
  UPDATE public.workspace_subscriptions
  SET messages_used_this_period = messages_used_this_period + p_count,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
  RETURNING * INTO v_sub;

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
-- 5. ATOMIC WEBSITE LEAD INGESTION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_website_lead(
  p_slug TEXT,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_message TEXT,
  p_notes TEXT DEFAULT NULL,
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
  v_clean_phone TEXT;
  v_clean_email TEXT;
  v_clean_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_channel TEXT;
BEGIN
  -- 1. Strictly resolve published funnel by slug
  SELECT * INTO v_funnel
  FROM public.website_funnels
  WHERE slug = lower(trim(p_slug))
    AND is_published = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Funnel not found or unpublished'
    );
  END IF;

  v_clean_name := COALESCE(NULLIF(trim(p_name), ''), 'Inbound Lead');
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
  v_channel := CASE WHEN v_clean_phone IS NOT NULL THEN 'whatsapp' ELSE 'website' END;

  -- 2. Create Contact bound strictly to the funnel's workspace
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

  -- 3. Create Inbox Thread bound strictly to the funnel's workspace
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
    v_channel,
    'active',
    'medium',
    1,
    now(),
    jsonb_build_object('funnel_id', v_funnel.id, 'lead_name', v_clean_name)
  )
  RETURNING * INTO v_thread;

  -- 4. Create Initial Inbox Message bound strictly to the funnel's workspace
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

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', v_funnel.workspace_id,
    'contact_id', v_contact.id,
    'thread_id', v_thread.id,
    'message_id', v_message.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_website_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_website_lead(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- 6. NOTIFY POSTGREST & RUN NON-SENSITIVE VERIFICATION SUMMARY
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT count(*) FROM public.workspaces) AS workspaces_count,
  (SELECT count(*) FROM public.contacts WHERE workspace_id IS NOT NULL) AS canonical_contacts_count,
  (SELECT count(*) FROM public.workspace_subscriptions WHERE provenance = 'internal_grant') AS internal_grant_subs_count,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'webhook_events' AND policyname = 'webhook_events_tenant_select') AS webhook_tenant_policy_count;
