-- Migration: 20261008_service_business_conversion_engine.sql
-- Description: Establishes the universal J10 Service Business Conversion Engine:
--   1. inbox_threads integration-scoping and backfill
--   2. service_conversion_journeys, service_conversion_events (auditable append-only history), service_followups
--   3. safe extension of crm_bookings booking types (service_appointment, consultation)
--   4. transactional PostgreSQL RPC record_canonical_whatsapp_inbound_atomic with advisory locking
--   5. transactional PostgreSQL RPC transition_service_journey_atomic with state machine validation
--   6. transactional PostgreSQL RPC confirm_workspace_booking_atomic for honest provider confirmation
--   7. strict RLS (active member gating, viewer read-only, append-only events, cross-tenant isolation)
-- Idempotent, workspace-scoped, and preserves all existing schemas and migrations.

BEGIN;

-- 1. Integration binding on inbox_threads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inbox_threads' AND column_name = 'integration_id'
  ) THEN
    ALTER TABLE public.inbox_threads
      ADD COLUMN integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill integration_id from trusted metadata where valid, unambiguous, and matching workspace
UPDATE public.inbox_threads
SET integration_id = (metadata->>'integrationId')::uuid
WHERE integration_id IS NULL
  AND metadata->>'integrationId' IS NOT NULL
  AND metadata->>'integrationId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.integrations i
    WHERE i.id = (public.inbox_threads.metadata->>'integrationId')::uuid
      AND i.workspace_id = public.inbox_threads.workspace_id
  );

-- Enforce thread uniqueness per workspace + integration + channel + sender
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_threads_ws_integration_sender
  ON public.inbox_threads(workspace_id, integration_id, channel, external_thread_id)
  WHERE integration_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_threads_ws_no_integration_sender
  ON public.inbox_threads(workspace_id, channel, external_thread_id)
  WHERE integration_id IS NULL;

-- Ensure composite unique constraint on integrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_integrations_workspace_id'
  ) THEN
    ALTER TABLE public.integrations ADD CONSTRAINT uq_integrations_workspace_id UNIQUE (workspace_id, id);
  END IF;
END $$;

-- 2. Universal service conversion journeys table
CREATE TABLE IF NOT EXISTS public.service_conversion_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID,
  thread_id UUID,
  lead_intake_id UUID,
  playbook_key TEXT NOT NULL DEFAULT 'general_service',
  status TEXT NOT NULL CHECK (status IN ('new', 'contacted', 'qualified', 'booking_offered', 'booked', 'lost', 'human_takeover')) DEFAULT 'new',
  requested_service TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  customer_name TEXT,
  normalized_phone TEXT,
  notes TEXT,
  media_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualification_completeness NUMERIC(3,2) NOT NULL DEFAULT 0.0 CHECK (qualification_completeness >= 0.0 AND qualification_completeness <= 1.0),
  booking_offered_at TIMESTAMPTZ,
  booking_confirmation_source TEXT,
  human_takeover_reason TEXT,
  estimated_service_value NUMERIC(10,2) DEFAULT NULL,
  attributed_revenue NUMERIC(10,2) DEFAULT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_service_journeys_workspace_id UNIQUE (workspace_id, id),
  CONSTRAINT uq_service_journey_thread UNIQUE (workspace_id, thread_id),
  CONSTRAINT fk_scj_contact FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_scj_thread FOREIGN KEY (workspace_id, thread_id) REFERENCES public.inbox_threads(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_scj_intake FOREIGN KEY (workspace_id, lead_intake_id) REFERENCES public.lead_intakes(workspace_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_service_journey_ws_status
  ON public.service_conversion_journeys(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_service_journey_ws_contact
  ON public.service_conversion_journeys(workspace_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_service_journey_ws_phone
  ON public.service_conversion_journeys(workspace_id, normalized_phone);

CREATE INDEX IF NOT EXISTS idx_service_journey_ws_playbook
  ON public.service_conversion_journeys(workspace_id, playbook_key);

-- 3. Transition history for universal auditability (Append-Only)
CREATE TABLE IF NOT EXISTS public.service_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('new', 'contacted', 'qualified', 'booking_offered', 'booked', 'lost', 'human_takeover')),
  reason TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'ai_assistant', 'operator')),
  actor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_sce_journey FOREIGN KEY (workspace_id, journey_id) REFERENCES public.service_conversion_journeys(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_events_journey
  ON public.service_conversion_events(workspace_id, journey_id, created_at);

-- 4. Complete Service business follow-up schedule foundation
CREATE TABLE IF NOT EXISTS public.service_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  thread_id UUID NOT NULL,
  contact_id UUID,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  followup_type TEXT NOT NULL CHECK (followup_type IN ('inquiry_followup', 'booking_reminder', 'deposit_reminder', 'noshow_recovery')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'cancelled', 'completed', 'expired')) DEFAULT 'scheduled',
  consent_basis TEXT NOT NULL DEFAULT 'not_provided',
  template_name TEXT,
  cancel_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_sf_journey FOREIGN KEY (workspace_id, journey_id) REFERENCES public.service_conversion_journeys(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_sf_thread FOREIGN KEY (workspace_id, thread_id) REFERENCES public.inbox_threads(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_sf_contact FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_service_followups_ws_sched
  ON public.service_followups(workspace_id, status, scheduled_for);

-- 5. Extend crm_bookings type constraint safely for service businesses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_bookings'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_crm_bookings_type'
    ) THEN
      ALTER TABLE public.crm_bookings DROP CONSTRAINT chk_crm_bookings_type;
    END IF;

    ALTER TABLE public.crm_bookings
      ADD CONSTRAINT chk_crm_bookings_type
      CHECK (booking_type IN (
        'executive_walkthrough',
        'discovery_call',
        'technical_demo',
        'closing_call',
        'onboarding',
        'service_appointment',
        'consultation'
      ));
  END IF;

  -- Extend whatsapp_ai_jobs status check constraint to include 'suppressed'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_ai_jobs_status_check'
  ) THEN
    ALTER TABLE public.whatsapp_ai_jobs DROP CONSTRAINT whatsapp_ai_jobs_status_check;
    ALTER TABLE public.whatsapp_ai_jobs
      ADD CONSTRAINT whatsapp_ai_jobs_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'retryable', 'dead', 'suppressed'));
  END IF;
END $$;

-- 6. Row Level Security & Strict Tenant / Role Isolation
ALTER TABLE public.service_conversion_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_conversion_journeys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.service_conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_conversion_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.service_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_followups FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Helper subqueries:
  -- Active member (any role, viewer included) -> read
  -- Active operator (owner, admin, manager, agent) -> write

  -- 1) service_conversion_journeys
  DROP POLICY IF EXISTS service_journeys_select_active ON public.service_conversion_journeys;
  CREATE POLICY service_journeys_select_active ON public.service_conversion_journeys
    FOR SELECT TO authenticated
    USING (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND status = 'active'
      )
    );

  DROP POLICY IF EXISTS service_journeys_modify_operator ON public.service_conversion_journeys;
  CREATE POLICY service_journeys_modify_operator ON public.service_conversion_journeys
    FOR ALL TO authenticated
    USING (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'agent')
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'agent')
      )
    );

  -- 2) service_conversion_events (APPEND-ONLY FOR AUTHENTICATED: SELECT + INSERT, NO UPDATE, NO DELETE)
  DROP POLICY IF EXISTS service_events_select_active ON public.service_conversion_events;
  CREATE POLICY service_events_select_active ON public.service_conversion_events
    FOR SELECT TO authenticated
    USING (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND status = 'active'
      )
    );

  DROP POLICY IF EXISTS service_events_insert_operator ON public.service_conversion_events;
  CREATE POLICY service_events_insert_operator ON public.service_conversion_events
    FOR INSERT TO authenticated
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'agent')
      )
    );

  -- 3) service_followups
  DROP POLICY IF EXISTS service_followups_select_active ON public.service_followups;
  CREATE POLICY service_followups_select_active ON public.service_followups
    FOR SELECT TO authenticated
    USING (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND status = 'active'
      )
    );

  DROP POLICY IF EXISTS service_followups_modify_operator ON public.service_followups;
  CREATE POLICY service_followups_modify_operator ON public.service_followups
    FOR ALL TO authenticated
    USING (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'agent')
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'agent')
      )
    );
END $$;

-- 7. Permissions lockdown
REVOKE ALL ON public.service_conversion_journeys FROM PUBLIC, anon;
GRANT ALL ON public.service_conversion_journeys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_conversion_journeys TO authenticated;

REVOKE ALL ON public.service_conversion_events FROM PUBLIC, anon;
GRANT ALL ON public.service_conversion_events TO service_role;
GRANT SELECT, INSERT ON public.service_conversion_events TO authenticated; -- Append-only!

REVOKE ALL ON public.service_followups FROM PUBLIC, anon;
GRANT ALL ON public.service_followups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_followups TO authenticated;

-- 8. Atomic PostgreSQL RPC for exactly-once WhatsApp inbound ingestion across any service industry
CREATE OR REPLACE FUNCTION public.record_canonical_whatsapp_inbound_atomic(
  p_workspace_id UUID,
  p_wamid TEXT,
  p_from_phone TEXT,
  p_sender_name TEXT,
  p_message_type TEXT,
  p_content TEXT,
  p_media_metadata JSONB DEFAULT '{}'::jsonb,
  p_payload_hash TEXT DEFAULT NULL,
  p_integration_id UUID DEFAULT NULL,
  p_playbook_key TEXT DEFAULT 'general_service'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digits TEXT;
  v_normalized_phone TEXT;
  v_sender_name TEXT;
  v_existing_msg RECORD;
  v_existing_job_id UUID;
  v_existing_contact_id UUID;
  v_existing_journey_id UUID;
  v_existing_intake_id UUID;
  v_contact_id UUID;
  v_thread_id UUID;
  v_message_id UUID;
  v_intake_id UUID;
  v_journey_id UUID;
  v_job_id UUID := NULL;
  v_thread_ai_enabled BOOLEAN := true;
  v_thread_human_handoff BOOLEAN := false;
  v_resolution_status TEXT := 'created';
  v_lead_idempotency_key TEXT;
  v_intake_payload_sha TEXT;
  v_ai_job_key TEXT;
  v_playbook_key TEXT := coalesce(nullif(trim(p_playbook_key), ''), 'general_service');
  v_ai_job_required BOOLEAN := false;
  v_ai_job_enqueued BOOLEAN := false;
  v_suppression_reason TEXT := NULL;
  v_lock_key BIGINT;
BEGIN
  -- Workspace validation
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace % not found', p_workspace_id;
  END IF;

  IF p_wamid IS NULL OR trim(p_wamid) = '' THEN
    RAISE EXCEPTION 'wamid is required';
  END IF;

  -- Validate integration belongs to workspace if provided
  IF p_integration_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.integrations
      WHERE id = p_integration_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Integration % does not belong to workspace %', p_integration_id, p_workspace_id;
    END IF;
  END IF;

  -- Phone normalization (E.164)
  v_digits := regexp_replace(coalesce(p_from_phone, ''), '\D', '', 'g');
  IF length(v_digits) >= 7 THEN
    v_normalized_phone := '+' || v_digits;
  ELSE
    v_normalized_phone := NULL;
  END IF;

  v_sender_name := coalesce(nullif(trim(p_sender_name), ''), v_normalized_phone, 'WhatsApp User');

  -- Concurrency Protection: Transaction-level Advisory Lock scoped to workspace + integration + normalized sender
  v_lock_key := hashtext(
    p_workspace_id::text || ':' ||
    coalesce(p_integration_id::text, '00000000-0000-0000-0000-000000000000') || ':' ||
    coalesce(v_normalized_phone, 'no_phone')
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Step 1: Idempotency & Conflict Check on inbox_messages
  SELECT id, thread_id, content, metadata INTO v_existing_msg
  FROM public.inbox_messages
  WHERE workspace_id = p_workspace_id
    AND external_message_id = trim(p_wamid)
  LIMIT 1;

  IF v_existing_msg.id IS NOT NULL THEN
    -- Check for conflicting content or differing payload hash
    IF (p_payload_hash IS NOT NULL AND (v_existing_msg.metadata->>'payload_sha256') IS NOT NULL AND (v_existing_msg.metadata->>'payload_sha256') <> p_payload_hash)
       OR (v_existing_msg.content <> p_content) THEN
      RETURN jsonb_build_object(
        'success', false,
        'duplicate', false,
        'conflict', true,
        'error', 'WHATSAPP_WAMID_PAYLOAD_CONFLICT',
        'message', 'wamid payload conflict'
      );
    END IF;

    SELECT id INTO v_existing_job_id
    FROM public.whatsapp_ai_jobs
    WHERE workspace_id = p_workspace_id
      AND inbound_wamid = trim(p_wamid)
    LIMIT 1;

    SELECT id INTO v_existing_intake_id
    FROM public.lead_intakes
    WHERE workspace_id = p_workspace_id
      AND source_event_id = trim(p_wamid)
    LIMIT 1;

    SELECT contact_id INTO v_existing_contact_id
    FROM public.inbox_threads
    WHERE id = v_existing_msg.thread_id;

    SELECT id INTO v_existing_journey_id
    FROM public.service_conversion_journeys
    WHERE workspace_id = p_workspace_id
      AND thread_id = v_existing_msg.thread_id;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'conflict', false,
      'message_id', v_existing_msg.id,
      'thread_id', v_existing_msg.thread_id,
      'contact_id', v_existing_contact_id,
      'intake_id', v_existing_intake_id,
      'journey_id', v_existing_journey_id,
      'job_id', v_existing_job_id
    );
  END IF;

  -- Step 2: Contact Resolution / Creation
  IF v_normalized_phone IS NOT NULL THEN
    SELECT contact_id INTO v_contact_id
    FROM public.contact_identities
    WHERE workspace_id = p_workspace_id
      AND identity_type = 'phone'
      AND normalized_value = v_normalized_phone
    LIMIT 1;

    IF v_contact_id IS NULL THEN
      SELECT id INTO v_contact_id
      FROM public.contacts
      WHERE workspace_id = p_workspace_id
        AND phone = v_normalized_phone
      LIMIT 1;
    END IF;
  END IF;

  IF v_contact_id IS NULL THEN
    v_resolution_status := 'created';
    INSERT INTO public.contacts (
      workspace_id,
      name,
      first_name,
      phone,
      type,
      status,
      deal_stage,
      lead_source,
      notes
    ) VALUES (
      p_workspace_id,
      v_sender_name,
      split_part(v_sender_name, ' ', 1),
      v_normalized_phone,
      'Lead',
      'New',
      'lead',
      'whatsapp',
      'Created from inbound WhatsApp inquiry'
    )
    RETURNING id INTO v_contact_id;
  ELSE
    v_resolution_status := 'matched';
  END IF;

  IF v_contact_id IS NOT NULL AND v_normalized_phone IS NOT NULL THEN
    INSERT INTO public.contact_identities (workspace_id, contact_id, identity_type, normalized_value)
    VALUES (p_workspace_id, v_contact_id, 'phone', v_normalized_phone)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Step 3: Canonical Integration-Scoped Thread Resolution
  IF p_integration_id IS NOT NULL THEN
    SELECT id, (metadata->>'aiBotEnabled')::boolean, (metadata->>'humanHandoff')::boolean
    INTO v_thread_id, v_thread_ai_enabled, v_thread_human_handoff
    FROM public.inbox_threads
    WHERE workspace_id = p_workspace_id
      AND channel = 'whatsapp'
      AND external_thread_id = p_from_phone
      AND integration_id = p_integration_id
    LIMIT 1;
  ELSE
    SELECT id, (metadata->>'aiBotEnabled')::boolean, (metadata->>'humanHandoff')::boolean
    INTO v_thread_id, v_thread_ai_enabled, v_thread_human_handoff
    FROM public.inbox_threads
    WHERE workspace_id = p_workspace_id
      AND channel = 'whatsapp'
      AND external_thread_id = p_from_phone
      AND integration_id IS NULL
    LIMIT 1;
  END IF;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.inbox_threads (
      workspace_id,
      integration_id,
      contact_id,
      channel,
      external_thread_id,
      status,
      priority,
      unread_count,
      last_message_at,
      metadata
    ) VALUES (
      p_workspace_id,
      p_integration_id,
      v_contact_id,
      'whatsapp',
      p_from_phone,
      'active',
      'medium',
      1,
      now(),
      jsonb_build_object(
        'senderName', v_sender_name,
        'integrationId', p_integration_id,
        'lastMessageSnippet', left(p_content, 120),
        'aiBotEnabled', true,
        'humanHandoff', false,
        'playbookKey', v_playbook_key
      )
    )
    RETURNING id INTO v_thread_id;
    v_thread_ai_enabled := true;
    v_thread_human_handoff := false;
  ELSE
    UPDATE public.inbox_threads
    SET
      last_message_at = now(),
      unread_count = coalesce(unread_count, 0) + 1,
      metadata = metadata || jsonb_build_object(
        'lastMessageSnippet', left(p_content, 120),
        'senderName', coalesce(v_sender_name, metadata->>'senderName'),
        'playbookKey', coalesce(metadata->>'playbookKey', v_playbook_key)
      ),
      updated_at = now()
    WHERE id = v_thread_id;
  END IF;

  -- Step 4: Canonical Inbox Message Ingestion
  INSERT INTO public.inbox_messages (
    workspace_id,
    thread_id,
    direction,
    provider,
    external_message_id,
    content,
    delivery_status,
    idempotency_key,
    metadata
  ) VALUES (
    p_workspace_id,
    v_thread_id,
    'inbound',
    'whatsapp',
    trim(p_wamid),
    p_content,
    'delivered',
    'wamid_' || trim(p_wamid),
    jsonb_build_object(
      'messageType', p_message_type,
      'media', coalesce(p_media_metadata, '{}'::jsonb),
      'payload_sha256', p_payload_hash
    )
  )
  RETURNING id INTO v_message_id;

  -- Step 5: Canonical Lead Intake Ingestion
  v_lead_idempotency_key := 'wa_' || p_workspace_id || '_' || trim(p_wamid);
  v_intake_payload_sha := coalesce(p_payload_hash, md5(coalesce(p_content, '')));

  INSERT INTO public.lead_intakes (
    workspace_id,
    contact_id,
    thread_id,
    message_id,
    source,
    channel,
    source_event_id,
    idempotency_key,
    resolution_status,
    name,
    phone,
    normalized_phone,
    payload_sha256,
    message,
    metadata
  ) VALUES (
    p_workspace_id,
    v_contact_id,
    v_thread_id,
    v_message_id,
    'whatsapp',
    'whatsapp',
    trim(p_wamid),
    v_lead_idempotency_key,
    v_resolution_status,
    v_sender_name,
    v_normalized_phone,
    v_digits,
    v_intake_payload_sha,
    p_content,
    jsonb_build_object(
      'wamid', trim(p_wamid),
      'messageType', p_message_type,
      'integration_id', p_integration_id,
      'playbook_key', v_playbook_key
    )
  )
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_intake_id;

  -- Step 6: Marketing Consent Explicitly Set to not_provided
  IF v_intake_id IS NOT NULL THEN
    INSERT INTO public.lead_intake_consents (
      workspace_id,
      intake_id,
      status,
      communication_channel,
      purpose,
      disclosure_version,
      captured_at,
      capture_source
    ) VALUES (
      p_workspace_id,
      v_intake_id,
      'not_provided',
      'whatsapp',
      'marketing',
      'v1',
      now(),
      'inbound_whatsapp_message'
    );
  END IF;

  -- Step 7: Universal Service Conversion Journey State
  SELECT id INTO v_journey_id
  FROM public.service_conversion_journeys
  WHERE workspace_id = p_workspace_id
    AND thread_id = v_thread_id
  LIMIT 1;

  IF v_journey_id IS NULL THEN
    INSERT INTO public.service_conversion_journeys (
      workspace_id,
      contact_id,
      thread_id,
      lead_intake_id,
      playbook_key,
      status,
      customer_name,
      normalized_phone,
      media_references,
      metadata
    ) VALUES (
      p_workspace_id,
      v_contact_id,
      v_thread_id,
      v_intake_id,
      v_playbook_key,
      'new',
      v_sender_name,
      v_normalized_phone,
      CASE WHEN p_media_metadata IS NOT NULL AND p_media_metadata <> '{}'::jsonb
           THEN jsonb_build_array(p_media_metadata)
           ELSE '[]'::jsonb END,
      jsonb_build_object('initial_inquiry', left(p_content, 200))
    )
    RETURNING id INTO v_journey_id;

    INSERT INTO public.service_conversion_events (
      workspace_id,
      journey_id,
      from_status,
      to_status,
      reason,
      actor_type,
      actor_id
    ) VALUES (
      p_workspace_id,
      v_journey_id,
      NULL,
      'new',
      'inbound_whatsapp_inquiry',
      'system',
      'whatsapp_webhook'
    );
  ELSE
    UPDATE public.service_conversion_journeys
    SET
      customer_name = coalesce(v_sender_name, customer_name),
      normalized_phone = coalesce(v_normalized_phone, normalized_phone),
      media_references = CASE
        WHEN p_media_metadata IS NOT NULL AND p_media_metadata <> '{}'::jsonb
        THEN media_references || jsonb_build_array(p_media_metadata)
        ELSE media_references
      END,
      updated_at = now()
    WHERE id = v_journey_id;
  END IF;

  -- Step 8: WhatsApp AI Job Enqueueing with Explicit Suppression Reason
  IF p_message_type <> 'text' THEN
    v_ai_job_required := false;
    v_ai_job_enqueued := false;
    v_suppression_reason := 'non_text_message';
  ELSIF coalesce(v_thread_human_handoff, false) = true THEN
    v_ai_job_required := false;
    v_ai_job_enqueued := false;
    v_suppression_reason := 'human_takeover_active';
  ELSIF coalesce(v_thread_ai_enabled, true) = false THEN
    v_ai_job_required := false;
    v_ai_job_enqueued := false;
    v_suppression_reason := 'ai_disabled_on_thread';
  ELSE
    v_ai_job_required := true;
    v_ai_job_key := 'whatsapp-ai:' || p_workspace_id::text || ':' || trim(p_wamid);

    INSERT INTO public.whatsapp_ai_jobs (
      workspace_id,
      integration_id,
      thread_id,
      recipient_phone,
      inbound_text,
      sender_name,
      inbound_wamid,
      idempotency_key,
      status,
      next_attempt_at
    ) VALUES (
      p_workspace_id,
      p_integration_id,
      v_thread_id,
      p_from_phone,
      p_content,
      v_sender_name,
      trim(p_wamid),
      v_ai_job_key,
      'pending',
      now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    v_ai_job_enqueued := (v_job_id IS NOT NULL);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'conflict', false,
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'contact_id', v_contact_id,
    'intake_id', v_intake_id,
    'journey_id', v_journey_id,
    'job_id', v_job_id,
    'ai_job_required', v_ai_job_required,
    'ai_job_enqueued', v_ai_job_enqueued,
    'suppression_reason', v_suppression_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_canonical_whatsapp_inbound_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_canonical_whatsapp_inbound_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT) TO service_role;

-- 9. Transactional Lifecycle Transition RPC with State Machine Enforcement
CREATE OR REPLACE FUNCTION public.transition_service_journey_atomic(
  p_workspace_id UUID,
  p_journey_id UUID,
  p_to_status TEXT,
  p_actor_type TEXT,
  p_actor_id TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_requested_service TEXT DEFAULT NULL,
  p_preferred_date DATE DEFAULT NULL,
  p_preferred_time TEXT DEFAULT NULL,
  p_estimated_value NUMERIC DEFAULT NULL,
  p_qualification_completeness NUMERIC DEFAULT NULL,
  p_booking_confirmation_source TEXT DEFAULT NULL,
  p_attributed_revenue NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_journey RECORD;
  v_from_status TEXT;
  v_is_valid_transition BOOLEAN := false;
BEGIN
  -- 1. Lock journey row for update and verify workspace ownership
  SELECT * INTO v_journey
  FROM public.service_conversion_journeys
  WHERE id = p_journey_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service journey % not found in workspace %', p_journey_id, p_workspace_id;
  END IF;

  v_from_status := v_journey.status;

  -- 2. Validate transition state machine
  IF v_from_status = p_to_status THEN
    v_is_valid_transition := true;
  ELSIF v_from_status = 'new' THEN
    v_is_valid_transition := p_to_status IN ('contacted', 'qualified', 'booking_offered', 'booked', 'lost', 'human_takeover');
  ELSIF v_from_status = 'contacted' THEN
    v_is_valid_transition := p_to_status IN ('qualified', 'booking_offered', 'booked', 'lost', 'human_takeover');
  ELSIF v_from_status = 'qualified' THEN
    v_is_valid_transition := p_to_status IN ('booking_offered', 'booked', 'lost', 'human_takeover');
  ELSIF v_from_status = 'booking_offered' THEN
    v_is_valid_transition := p_to_status IN ('booked', 'lost', 'human_takeover');
  ELSIF v_from_status = 'human_takeover' THEN
    -- Only authorized operator can resume human takeover back to contacted or qualified
    IF p_actor_type = 'operator' AND p_to_status IN ('contacted', 'qualified') THEN
      v_is_valid_transition := true;
    ELSE
      v_is_valid_transition := false;
    END IF;
  ELSIF v_from_status = 'booked' THEN
    -- Booked cannot regress to contacted, qualified, or booking_offered
    v_is_valid_transition := false;
  ELSIF v_from_status = 'lost' THEN
    -- Lost cannot regress to contacted or qualified
    v_is_valid_transition := false;
  END IF;

  IF NOT v_is_valid_transition THEN
    RAISE EXCEPTION 'Invalid journey transition from % to % (actor: %)', v_from_status, p_to_status, p_actor_type;
  END IF;

  -- 3. Update journey record
  UPDATE public.service_conversion_journeys
  SET
    status = p_to_status,
    requested_service = coalesce(p_requested_service, requested_service),
    preferred_date = coalesce(p_preferred_date, preferred_date),
    preferred_time = coalesce(p_preferred_time, preferred_time),
    estimated_service_value = coalesce(p_estimated_value, estimated_service_value),
    qualification_completeness = coalesce(p_qualification_completeness, qualification_completeness),
    booking_confirmation_source = coalesce(p_booking_confirmation_source, booking_confirmation_source),
    attributed_revenue = coalesce(p_attributed_revenue, attributed_revenue),
    booking_offered_at = CASE WHEN p_to_status = 'booking_offered' AND booking_offered_at IS NULL THEN now() ELSE booking_offered_at END,
    human_takeover_reason = CASE WHEN p_to_status = 'human_takeover' THEN coalesce(p_reason, 'Escalated to human representative') ELSE human_takeover_reason END,
    metadata = metadata || p_metadata,
    updated_at = now()
  WHERE id = p_journey_id;

  -- 4. Record auditable transition event if status changed
  IF v_from_status <> p_to_status THEN
    INSERT INTO public.service_conversion_events (
      workspace_id,
      journey_id,
      from_status,
      to_status,
      reason,
      actor_type,
      actor_id,
      metadata
    ) VALUES (
      p_workspace_id,
      p_journey_id,
      v_from_status,
      p_to_status,
      coalesce(p_reason, 'Transitioned to ' || p_to_status),
      p_actor_type,
      p_actor_id,
      p_metadata
    );

    -- 5. Cancel pending follow-ups if journey enters a terminal state
    IF p_to_status IN ('booked', 'lost', 'human_takeover') THEN
      UPDATE public.service_followups
      SET
        status = 'cancelled',
        cancel_reason = 'lifecycle_transition_to_' || p_to_status,
        updated_at = now()
      WHERE workspace_id = p_workspace_id
        AND journey_id = p_journey_id
        AND status = 'scheduled';
    END IF;
  END IF;

  -- Return verified updated record
  SELECT * INTO v_journey
  FROM public.service_conversion_journeys
  WHERE id = p_journey_id;

  RETURN jsonb_build_object(
    'success', true,
    'journey_id', v_journey.id,
    'status', v_journey.status,
    'requested_service', v_journey.requested_service,
    'estimated_service_value', v_journey.estimated_service_value,
    'attributed_revenue', v_journey.attributed_revenue,
    'qualification_completeness', v_journey.qualification_completeness
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_service_journey_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, DATE, TEXT, NUMERIC, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_service_journey_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, DATE, TEXT, NUMERIC, NUMERIC, TEXT, NUMERIC) TO service_role;

-- 10. Transactional Booking Confirmation RPC for Honest Provider Confirmation
CREATE OR REPLACE FUNCTION public.confirm_workspace_booking_atomic(
  p_workspace_id UUID,
  p_booking_id UUID,
  p_provider TEXT,
  p_provider_event_id TEXT,
  p_confirmed_revenue NUMERIC(10,2),
  p_actor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking RECORD;
  v_journey RECORD;
BEGIN
  -- 1. Lock booking row for update and verify workspace ownership
  SELECT * INTO v_booking
  FROM public.crm_bookings
  WHERE id = p_booking_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found in workspace %', p_booking_id, p_workspace_id;
  END IF;

  IF p_provider IS NULL OR trim(p_provider) = '' THEN
    RAISE EXCEPTION 'Provider is required for external confirmation';
  END IF;

  -- 2. Update booking to confirmed status
  UPDATE public.crm_bookings
  SET
    status = 'scheduled',
    external_reservation_status = 'confirmed_external_calendar',
    external_calendar_provider = p_provider,
    external_calendar_event_id = p_provider_event_id,
    updated_at = now()
  WHERE id = p_booking_id;

  -- 3. If booking is linked to a thread, update corresponding journey
  IF v_booking.thread_id IS NOT NULL THEN
    SELECT * INTO v_journey
    FROM public.service_conversion_journeys
    WHERE workspace_id = p_workspace_id AND thread_id = v_booking.thread_id
    FOR UPDATE;

    IF v_journey.id IS NOT NULL THEN
      PERFORM public.transition_service_journey_atomic(
        p_workspace_id,
        v_journey.id,
        'booked',
        'system',
        coalesce(p_actor_id, 'booking_webhook'),
        'Confirmed via external calendar provider ' || p_provider,
        jsonb_build_object('provider', p_provider, 'provider_event_id', p_provider_event_id),
        v_journey.requested_service,
        v_journey.preferred_date,
        v_journey.preferred_time,
        v_journey.estimated_service_value,
        1.0,
        p_provider,
        p_confirmed_revenue
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'scheduled',
    'external_reservation_status', 'confirmed_external_calendar',
    'confirmed_revenue', p_confirmed_revenue
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_workspace_booking_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_workspace_booking_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT) TO service_role;

-- 11. Explicit Suppressed Outcome for AI Worker
CREATE OR REPLACE FUNCTION public.suppress_whatsapp_ai_job(
  p_job_id UUID,
  p_claim_token UUID,
  p_reason TEXT DEFAULT 'suppressed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
BEGIN
  SELECT * INTO v_job
  FROM public.whatsapp_ai_jobs
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found');
  END IF;

  IF v_job.claim_token IS NOT NULL AND v_job.claim_token != p_claim_token THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim token mismatch');
  END IF;

  UPDATE public.whatsapp_ai_jobs
  SET
    status = 'suppressed',
    last_error = p_reason,
    claim_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'status', 'suppressed');
END;
$$;

REVOKE ALL ON FUNCTION public.suppress_whatsapp_ai_job(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suppress_whatsapp_ai_job(UUID, UUID, TEXT) TO service_role;

COMMIT;
