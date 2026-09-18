-- Migration: 20261008_beauty_conversion_pipeline.sql
-- Description: Establishes the Beauty Booking Assistant conversion pipeline:
--   1. beauty_conversion_lifecycles and transition history
--   2. beauty_followups schedule foundation
--   3. safe extension of crm_bookings booking types for beauty appointments
--   4. atomic PostgreSQL RPC for exactly-once WhatsApp inbound ingestion
-- Idempotent, workspace-scoped, and preserves all existing schemas and migrations.

BEGIN;

-- 1. Beauty conversion lifecycles table
CREATE TABLE IF NOT EXISTS public.beauty_conversion_lifecycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
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
  CONSTRAINT uq_beauty_lifecycle_thread UNIQUE (workspace_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_beauty_lifecycle_ws_status
  ON public.beauty_conversion_lifecycles(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_beauty_lifecycle_ws_contact
  ON public.beauty_conversion_lifecycles(workspace_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_beauty_lifecycle_ws_phone
  ON public.beauty_conversion_lifecycles(workspace_id, normalized_phone);

-- 2. Transition history for auditability
CREATE TABLE IF NOT EXISTS public.beauty_lifecycle_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lifecycle_id UUID NOT NULL REFERENCES public.beauty_conversion_lifecycles(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('new', 'contacted', 'qualified', 'booking_offered', 'booked', 'lost', 'human_takeover')),
  reason TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'ai_assistant', 'operator')),
  actor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beauty_transitions_lifecycle
  ON public.beauty_lifecycle_transitions(workspace_id, lifecycle_id, created_at);

-- 3. Beauty follow-up schedule foundation
CREATE TABLE IF NOT EXISTS public.beauty_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lifecycle_id UUID NOT NULL REFERENCES public.beauty_conversion_lifecycles(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  followup_type TEXT NOT NULL CHECK (followup_type IN ('inquiry_followup', 'booking_reminder', 'deposit_reminder', 'noshow_recovery')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'cancelled', 'completed', 'expired')) DEFAULT 'scheduled',
  cancel_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beauty_followups_ws_sched
  ON public.beauty_followups(workspace_id, status, scheduled_for);

-- 4. Extend crm_bookings type constraint safely
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
        'beauty_service',
        'salon_appointment',
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

-- 5. Row Level Security
ALTER TABLE public.beauty_conversion_lifecycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beauty_lifecycle_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beauty_followups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- beauty_conversion_lifecycles policies
  DROP POLICY IF EXISTS beauty_lifecycles_select_member ON public.beauty_conversion_lifecycles;
  CREATE POLICY beauty_lifecycles_select_member ON public.beauty_conversion_lifecycles
    FOR SELECT TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()));

  DROP POLICY IF EXISTS beauty_lifecycles_modify_member ON public.beauty_conversion_lifecycles;
  CREATE POLICY beauty_lifecycles_modify_member ON public.beauty_conversion_lifecycles
    FOR ALL TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()))
    WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()));

  -- beauty_lifecycle_transitions policies
  DROP POLICY IF EXISTS beauty_transitions_select_member ON public.beauty_lifecycle_transitions;
  CREATE POLICY beauty_transitions_select_member ON public.beauty_lifecycle_transitions
    FOR SELECT TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()));

  DROP POLICY IF EXISTS beauty_transitions_modify_member ON public.beauty_lifecycle_transitions;
  CREATE POLICY beauty_transitions_modify_member ON public.beauty_lifecycle_transitions
    FOR ALL TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()))
    WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()));

  -- beauty_followups policies
  DROP POLICY IF EXISTS beauty_followups_select_member ON public.beauty_followups;
  CREATE POLICY beauty_followups_select_member ON public.beauty_followups
    FOR SELECT TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()));

  DROP POLICY IF EXISTS beauty_followups_modify_member ON public.beauty_followups;
  CREATE POLICY beauty_followups_modify_member ON public.beauty_followups
    FOR ALL TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()))
    WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()));
END $$;

-- 6. Permissions lockdown
REVOKE ALL ON public.beauty_conversion_lifecycles FROM PUBLIC, anon;
GRANT ALL ON public.beauty_conversion_lifecycles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beauty_conversion_lifecycles TO authenticated;

REVOKE ALL ON public.beauty_lifecycle_transitions FROM PUBLIC, anon;
GRANT ALL ON public.beauty_lifecycle_transitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beauty_lifecycle_transitions TO authenticated;

REVOKE ALL ON public.beauty_followups FROM PUBLIC, anon;
GRANT ALL ON public.beauty_followups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beauty_followups TO authenticated;

-- 7. Atomic PostgreSQL RPC for exactly-once WhatsApp inbound ingestion
CREATE OR REPLACE FUNCTION public.record_canonical_whatsapp_inbound_atomic(
  p_workspace_id UUID,
  p_wamid TEXT,
  p_from_phone TEXT,
  p_sender_name TEXT,
  p_message_type TEXT,
  p_content TEXT,
  p_media_metadata JSONB DEFAULT '{}'::jsonb,
  p_payload_hash TEXT DEFAULT NULL,
  p_integration_id UUID DEFAULT NULL
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
  v_contact_id UUID;
  v_thread_id UUID;
  v_message_id UUID;
  v_intake_id UUID;
  v_lifecycle_id UUID;
  v_job_id UUID := NULL;
  v_thread_ai_enabled BOOLEAN := true;
  v_thread_human_handoff BOOLEAN := false;
  v_resolution_status TEXT := 'created';
  v_lead_idempotency_key TEXT;
  v_intake_payload_sha TEXT;
  v_ai_job_key TEXT;
BEGIN
  -- Workspace validation
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace % not found', p_workspace_id;
  END IF;

  IF p_wamid IS NULL OR trim(p_wamid) = '' THEN
    RAISE EXCEPTION 'wamid is required';
  END IF;

  -- Phone normalization
  v_digits := regexp_replace(coalesce(p_from_phone, ''), '\D', '', 'g');
  IF length(v_digits) >= 7 THEN
    v_normalized_phone := '+' || v_digits;
  ELSE
    v_normalized_phone := NULL;
  END IF;

  v_sender_name := coalesce(nullif(trim(p_sender_name), ''), v_normalized_phone, 'WhatsApp User');

  -- Step 1: Idempotency & Conflict Check on inbox_messages
  SELECT id, thread_id, content, metadata INTO v_existing_msg
  FROM public.inbox_messages
  WHERE workspace_id = p_workspace_id
    AND external_message_id = trim(p_wamid)
  LIMIT 1;

  IF v_existing_msg.id IS NOT NULL THEN
    -- Check for conflicting content or differing payload hash
    IF p_payload_hash IS NOT NULL AND (v_existing_msg.metadata->>'payload_sha256') IS NOT NULL THEN
      IF (v_existing_msg.metadata->>'payload_sha256') <> p_payload_hash THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'wamid payload conflict';
      END IF;
    ELSIF v_existing_msg.content <> p_content THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'wamid payload conflict';
    END IF;

    SELECT id INTO v_existing_job_id
    FROM public.whatsapp_ai_jobs
    WHERE workspace_id = p_workspace_id
      AND inbound_wamid = trim(p_wamid)
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'message_id', v_existing_msg.id,
      'thread_id', v_existing_msg.thread_id,
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

  -- Step 3: Canonical Inbox Thread Resolution (Reused by external_thread_id = fromPhone)
  SELECT id, (metadata->>'aiBotEnabled')::boolean, (metadata->>'humanHandoff')::boolean
  INTO v_thread_id, v_thread_ai_enabled, v_thread_human_handoff
  FROM public.inbox_threads
  WHERE workspace_id = p_workspace_id
    AND channel = 'whatsapp'
    AND external_thread_id = p_from_phone
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.inbox_threads (
      workspace_id,
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
        'humanHandoff', false
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
        'senderName', coalesce(v_sender_name, metadata->>'senderName')
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
      'integration_id', p_integration_id
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

  -- Step 7: Beauty Conversion Lifecycle State
  SELECT id INTO v_lifecycle_id
  FROM public.beauty_conversion_lifecycles
  WHERE workspace_id = p_workspace_id
    AND thread_id = v_thread_id
  LIMIT 1;

  IF v_lifecycle_id IS NULL THEN
    INSERT INTO public.beauty_conversion_lifecycles (
      workspace_id,
      contact_id,
      thread_id,
      status,
      customer_name,
      normalized_phone,
      media_references,
      metadata
    ) VALUES (
      p_workspace_id,
      v_contact_id,
      v_thread_id,
      'new',
      v_sender_name,
      v_normalized_phone,
      CASE WHEN p_media_metadata IS NOT NULL AND p_media_metadata <> '{}'::jsonb
           THEN jsonb_build_array(p_media_metadata)
           ELSE '[]'::jsonb END,
      jsonb_build_object('initial_inquiry', left(p_content, 200))
    )
    RETURNING id INTO v_lifecycle_id;

    INSERT INTO public.beauty_lifecycle_transitions (
      workspace_id,
      lifecycle_id,
      from_status,
      to_status,
      reason,
      actor_type,
      actor_id
    ) VALUES (
      p_workspace_id,
      v_lifecycle_id,
      NULL,
      'new',
      'inbound_whatsapp_inquiry',
      'system',
      'whatsapp_webhook'
    );
  ELSE
    UPDATE public.beauty_conversion_lifecycles
    SET
      customer_name = coalesce(v_sender_name, customer_name),
      normalized_phone = coalesce(v_normalized_phone, normalized_phone),
      media_references = CASE
        WHEN p_media_metadata IS NOT NULL AND p_media_metadata <> '{}'::jsonb
        THEN media_references || jsonb_build_array(p_media_metadata)
        ELSE media_references
      END,
      updated_at = now()
    WHERE id = v_lifecycle_id;
  END IF;

  -- Step 8: WhatsApp AI Job Enqueueing
  -- Only enqueue if message is text and thread AI is not disabled or in human handoff
  IF p_message_type = 'text' AND coalesce(v_thread_ai_enabled, true) = true AND coalesce(v_thread_human_handoff, false) = false THEN
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
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'contact_id', v_contact_id,
    'intake_id', v_intake_id,
    'lifecycle_id', v_lifecycle_id,
    'job_id', v_job_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_canonical_whatsapp_inbound_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_canonical_whatsapp_inbound_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID) TO service_role;

-- 8. Explicit Suppressed Outcome for AI Worker
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
