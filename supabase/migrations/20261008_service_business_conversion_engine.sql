-- Migration: 20261008_service_business_conversion_engine.sql
-- Description: Establishes the universal J10 Service Business Conversion Engine:
--   1. inbox_threads integration-scoping, composite FK, duplicate detection, and backfill
--   2. service_conversion_journeys, service_conversion_events (auditable append-only history), service_followups
--   3. safe extension of crm_bookings booking types and status (requested, scheduled, etc.) with provider replay protection
--   4. transactional PostgreSQL RPC record_canonical_whatsapp_inbound_atomic with genuine 64-bit advisory locking
--   5. transactional PostgreSQL RPC transition_service_journey_atomic with state machine validation (booked state forbidden)
--   6. transactional PostgreSQL RPC confirm_workspace_booking_atomic for honest provider confirmation and revenue attribution
--   7. transactional PostgreSQL RPCs handoff_service_thread_atomic and resume_service_thread_atomic
--   8. strict RLS (active member gating, viewer read-only, append-only events, zero direct authenticated mutation)
-- Idempotent, workspace-scoped, and preserves all existing schemas and migrations.

BEGIN;

-- 1. Integration binding on inbox_threads with composite tenant ownership
-- Ensure composite unique constraint on integrations (workspace_id, id) for foreign key reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_integrations_workspace_id'
  ) THEN
    ALTER TABLE public.integrations ADD CONSTRAINT uq_integrations_workspace_id UNIQUE (workspace_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inbox_threads' AND column_name = 'integration_id'
  ) THEN
    ALTER TABLE public.inbox_threads
      ADD COLUMN integration_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_workspace_integration'
  ) THEN
    ALTER TABLE public.inbox_threads
      ADD CONSTRAINT fk_inbox_threads_workspace_integration
      FOREIGN KEY (workspace_id, integration_id)
      REFERENCES public.integrations(workspace_id, id)
      ON DELETE CASCADE;
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

-- Detect duplicate canonical thread bindings before creating unique index
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT workspace_id, integration_id, channel, external_thread_id
    FROM public.inbox_threads
    WHERE integration_id IS NOT NULL
    GROUP BY workspace_id, integration_id, channel, external_thread_id
    HAVING count(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot create index uq_inbox_threads_ws_integration_sender: detected % duplicate canonical thread bindings on (workspace_id, integration_id, channel, external_thread_id). Please resolve duplicates before applying migration.', v_dup_count;
  END IF;
END $$;

-- Enforce thread uniqueness per workspace + integration + channel + sender
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_threads_ws_integration_sender
  ON public.inbox_threads(workspace_id, integration_id, channel, external_thread_id)
  WHERE integration_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_threads_ws_no_integration_sender
  ON public.inbox_threads(workspace_id, channel, external_thread_id)
  WHERE integration_id IS NULL;

-- 2. Universal service conversion journeys table (idempotent with safe rerun column additions)
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

-- Ensure rerun safety if service_conversion_journeys existed from partial application
ALTER TABLE public.service_conversion_journeys
  ADD COLUMN IF NOT EXISTS playbook_key TEXT NOT NULL DEFAULT 'general_service',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS requested_service TEXT,
  ADD COLUMN IF NOT EXISTS preferred_date DATE,
  ADD COLUMN IF NOT EXISTS preferred_time TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS media_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualification_completeness NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS booking_offered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_confirmation_source TEXT,
  ADD COLUMN IF NOT EXISTS human_takeover_reason TEXT,
  ADD COLUMN IF NOT EXISTS estimated_service_value NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attributed_revenue NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Restore missing constraints if table existed partially
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_service_journeys_workspace_id') THEN
    ALTER TABLE public.service_conversion_journeys ADD CONSTRAINT uq_service_journeys_workspace_id UNIQUE (workspace_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_service_journey_thread') THEN
    ALTER TABLE public.service_conversion_journeys ADD CONSTRAINT uq_service_journey_thread UNIQUE (workspace_id, thread_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_scj_contact') THEN
    ALTER TABLE public.service_conversion_journeys ADD CONSTRAINT fk_scj_contact FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_scj_thread') THEN
    ALTER TABLE public.service_conversion_journeys ADD CONSTRAINT fk_scj_thread FOREIGN KEY (workspace_id, thread_id) REFERENCES public.inbox_threads(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_scj_intake') THEN
    ALTER TABLE public.service_conversion_journeys ADD CONSTRAINT fk_scj_intake FOREIGN KEY (workspace_id, lead_intake_id) REFERENCES public.lead_intakes(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_scj_status') THEN
    ALTER TABLE public.service_conversion_journeys ADD CONSTRAINT chk_scj_status CHECK (status IN ('new', 'contacted', 'qualified', 'booking_offered', 'booked', 'lost', 'human_takeover'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_scj_qualification') THEN
    ALTER TABLE public.service_conversion_journeys ADD CONSTRAINT chk_scj_qualification CHECK (qualification_completeness >= 0.0 AND qualification_completeness <= 1.0);
  END IF;
END $$;

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

-- Ensure rerun safety if service_conversion_events existed from partial application
ALTER TABLE public.service_conversion_events
  ADD COLUMN IF NOT EXISTS from_status TEXT,
  ADD COLUMN IF NOT EXISTS to_status TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS actor_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Restore missing constraints on service_conversion_events if table existed partially
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sce_journey') THEN
    ALTER TABLE public.service_conversion_events ADD CONSTRAINT fk_sce_journey FOREIGN KEY (workspace_id, journey_id) REFERENCES public.service_conversion_journeys(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sce_to_status') THEN
    ALTER TABLE public.service_conversion_events ADD CONSTRAINT chk_sce_to_status CHECK (to_status IN ('new', 'contacted', 'qualified', 'booking_offered', 'booked', 'lost', 'human_takeover'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sce_actor_type') THEN
    ALTER TABLE public.service_conversion_events ADD CONSTRAINT chk_sce_actor_type CHECK (actor_type IN ('system', 'ai_assistant', 'operator'));
  END IF;
END $$;

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

-- Ensure rerun safety if service_followups existed from partial application
ALTER TABLE public.service_followups
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS followup_type TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ NOT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS consent_basis TEXT NOT NULL DEFAULT 'not_provided',
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Restore missing constraints on service_followups if table existed partially
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sf_journey') THEN
    ALTER TABLE public.service_followups ADD CONSTRAINT fk_sf_journey FOREIGN KEY (workspace_id, journey_id) REFERENCES public.service_conversion_journeys(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sf_thread') THEN
    ALTER TABLE public.service_followups ADD CONSTRAINT fk_sf_thread FOREIGN KEY (workspace_id, thread_id) REFERENCES public.inbox_threads(workspace_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sf_contact') THEN
    ALTER TABLE public.service_followups ADD CONSTRAINT fk_sf_contact FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sf_followup_type') THEN
    ALTER TABLE public.service_followups ADD CONSTRAINT chk_sf_followup_type CHECK (followup_type IN ('inquiry_followup', 'booking_reminder', 'deposit_reminder', 'noshow_recovery'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sf_status') THEN
    ALTER TABLE public.service_followups ADD CONSTRAINT chk_sf_status CHECK (status IN ('scheduled', 'cancelled', 'completed', 'expired'));
  END IF;
END $$;

-- Future scheduling invariant: for scheduled follow-ups, scheduled_for must be strictly in the future relative to creation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_service_followups_future_sched'
  ) THEN
    ALTER TABLE public.service_followups DROP CONSTRAINT chk_service_followups_future_sched;
  END IF;

  ALTER TABLE public.service_followups
    ADD CONSTRAINT chk_service_followups_future_sched
    CHECK (status <> 'scheduled' OR scheduled_for > created_at)
    NOT VALID;
END $$;

-- Preflight reconciliation check: inspect existing records safely without silently mutating production data
DO $$
DECLARE
  v_violating_count INTEGER;
BEGIN
  SELECT count(*) INTO v_violating_count
  FROM public.service_followups
  WHERE status = 'scheduled' AND scheduled_for <= created_at;

  IF v_violating_count = 0 THEN
    ALTER TABLE public.service_followups VALIDATE CONSTRAINT chk_service_followups_future_sched;
  ELSE
    RAISE NOTICE 'Preflight found % existing scheduled follow-up records with scheduled_for <= created_at. Preserving historical records untouched; future-scheduling invariant enforced on new rows.', v_violating_count;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_followups_ws_sched
  ON public.service_followups(workspace_id, status, scheduled_for);

-- 5. Safe extension of crm_bookings for service businesses & provider confirmation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_bookings'
  ) THEN
    -- Safely add external confirmation columns if missing
    ALTER TABLE public.crm_bookings
      ADD COLUMN IF NOT EXISTS external_reservation_status TEXT DEFAULT 'pending_confirmation',
      ADD COLUMN IF NOT EXISTS external_calendar_provider TEXT,
      ADD COLUMN IF NOT EXISTS external_calendar_event_id TEXT,
      ADD COLUMN IF NOT EXISTS externally_confirmed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS confirmed_revenue NUMERIC(10,2);

    -- Replace chk_crm_bookings_type safely to support service appointments and consultations
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

    -- Replace chk_crm_bookings_status so it permits:
    -- requested, scheduled, completed, canceled, rescheduled, no_show
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'chk_crm_bookings_status'
    ) THEN
      ALTER TABLE public.crm_bookings DROP CONSTRAINT chk_crm_bookings_status;
    END IF;

    ALTER TABLE public.crm_bookings
      ADD CONSTRAINT chk_crm_bookings_status
      CHECK (status IN ('requested', 'scheduled', 'completed', 'canceled', 'rescheduled', 'no_show'));
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

-- Provider-confirmation replay protection: A provider + provider event ID must not confirm multiple booking records in the same workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_bookings_ws_provider_event
  ON public.crm_bookings(workspace_id, external_calendar_provider, external_calendar_event_id)
  WHERE external_calendar_provider IS NOT NULL AND external_calendar_event_id IS NOT NULL;

-- 6. Row Level Security & Strict Tenant / Role Isolation
ALTER TABLE public.service_conversion_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_conversion_journeys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.service_conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_conversion_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.service_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_followups FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- 1) service_conversion_journeys: Active member read-only via SELECT
  -- All mutations MUST occur through server-authorized RPCs via service_role
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

  -- 2) service_conversion_events: Active member read-only via SELECT
  -- Zero direct INSERT/UPDATE/DELETE for authenticated users to prevent forging events
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

  -- 3) service_followups: Active member read-only via SELECT
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
END $$;

-- 7. Permissions lockdown: Remove direct mutation access from authenticated users
REVOKE ALL ON public.service_conversion_journeys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_conversion_journeys TO authenticated;
GRANT ALL ON public.service_conversion_journeys TO service_role;

REVOKE ALL ON public.service_conversion_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_conversion_events TO authenticated;
GRANT ALL ON public.service_conversion_events TO service_role;

REVOKE ALL ON public.service_followups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_followups TO authenticated;
GRANT ALL ON public.service_followups TO service_role;

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
  v_thread_metadata JSONB;
  v_lead_idempotency_key TEXT;
  v_intake_payload_sha TEXT;
  v_ai_job_key TEXT;
  v_playbook_key TEXT := coalesce(nullif(trim(p_playbook_key), ''), 'general_service');
  v_ai_job_required BOOLEAN := false;
  v_ai_job_enqueued BOOLEAN := false;
  v_suppression_reason TEXT := NULL;
  v_lock_key BIGINT;
  v_candidates UUID[];
  v_contact_resolution_status TEXT := 'created';
  v_existing_resolution_status TEXT := NULL;
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
  -- Using hashtextextended with a fixed seed to generate a genuine 64-bit bigint lock key
  v_lock_key := hashtextextended(
    p_workspace_id::text || ':' ||
    coalesce(p_integration_id::text, '00000000-0000-0000-0000-000000000000') || ':' ||
    coalesce(v_normalized_phone, 'no_phone'),
    42::bigint
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
        'conflict', true,
        'duplicate', false,
        'error', 'WHATSAPP_WAMID_PAYLOAD_CONFLICT',
        'message_id', v_existing_msg.id,
        'thread_id', v_existing_msg.thread_id
      );
    END IF;

    -- Lookup existing associated records to return complete contract
    SELECT contact_id INTO v_existing_contact_id
    FROM public.inbox_threads
    WHERE id = v_existing_msg.thread_id AND workspace_id = p_workspace_id;

    SELECT id INTO v_existing_journey_id
    FROM public.service_conversion_journeys
    WHERE thread_id = v_existing_msg.thread_id AND workspace_id = p_workspace_id
    LIMIT 1;

    SELECT id, resolution_status INTO v_existing_intake_id, v_existing_resolution_status
    FROM public.lead_intakes
    WHERE workspace_id = p_workspace_id AND idempotency_key = 'whatsapp_inbound_' || trim(p_wamid)
    LIMIT 1;

    SELECT id INTO v_existing_job_id
    FROM public.whatsapp_ai_jobs
    WHERE workspace_id = p_workspace_id AND inbound_wamid = trim(p_wamid)
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'conflict', false,
      'message_id', v_existing_msg.id,
      'thread_id', v_existing_msg.thread_id,
      'contact_id', v_existing_contact_id,
      'resolution_status', v_existing_resolution_status,
      'intake_id', v_existing_intake_id,
      'journey_id', v_existing_journey_id,
      'job_id', v_existing_job_id,
      'ai_job_required', false,
      'ai_job_enqueued', false,
      'suppression_reason', 'idempotent_duplicate'
    );
  END IF;

  -- Step 2: Canonical Contact Resolution (Stage 1 Contract)
  v_candidates := '{}';
  IF v_normalized_phone IS NOT NULL THEN
    SELECT array_agg(DISTINCT cand.cid) INTO v_candidates FROM (
      SELECT ci.contact_id AS cid
      FROM public.contact_identities ci
      WHERE ci.workspace_id = p_workspace_id
        AND ci.identity_type = 'phone'
        AND ci.normalized_value = v_normalized_phone
      UNION
      SELECT c.id AS cid
      FROM public.contacts c
      WHERE c.workspace_id = p_workspace_id
        AND (c.phone = v_normalized_phone OR regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits)
    ) cand
    WHERE cand.cid IS NOT NULL;
  END IF;

  IF coalesce(array_length(v_candidates, 1), 0) > 1 THEN
    -- Multiple candidates match this normalized phone: ambiguous identity!
    -- Strictly DO NOT arbitrarily select oldest contact, and DO NOT auto-merge.
    v_contact_resolution_status := 'ambiguous';
    v_contact_id := NULL;
  ELSIF coalesce(array_length(v_candidates, 1), 0) = 1 THEN
    v_contact_id := v_candidates[1];
    v_contact_resolution_status := 'matched';
  ELSE
    -- Zero candidates: create new canonical contact and register phone identity
    INSERT INTO public.contacts (
      workspace_id,
      name,
      first_name,
      phone,
      source,
      deal_stage,
      type,
      status,
      lead_source,
      notes,
      metadata
    ) VALUES (
      p_workspace_id,
      v_sender_name,
      split_part(v_sender_name, ' ', 1),
      v_normalized_phone,
      'whatsapp',
      'lead',
      'Lead',
      'New',
      'whatsapp_inbound',
      'Auto-captured from WhatsApp service inquiry',
      jsonb_build_object(
        'wamid', trim(p_wamid),
        'integrationId', p_integration_id,
        'playbookKey', v_playbook_key
      )
    )
    RETURNING id INTO v_contact_id;

    v_contact_resolution_status := 'created';

    IF v_normalized_phone IS NOT NULL THEN
      INSERT INTO public.contact_identities (
        workspace_id,
        contact_id,
        identity_type,
        normalized_value
      ) VALUES (
        p_workspace_id,
        v_contact_id,
        'phone',
        v_normalized_phone
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Step 3: Canonical Thread Resolution
  IF p_integration_id IS NOT NULL THEN
    SELECT id, metadata INTO v_thread_id, v_thread_metadata
    FROM public.inbox_threads
    WHERE workspace_id = p_workspace_id
      AND integration_id = p_integration_id
      AND channel = 'whatsapp'
      AND external_thread_id = coalesce(v_normalized_phone, p_wamid)
    LIMIT 1;
  ELSE
    SELECT id, metadata INTO v_thread_id, v_thread_metadata
    FROM public.inbox_threads
    WHERE workspace_id = p_workspace_id
      AND integration_id IS NULL
      AND channel = 'whatsapp'
      AND external_thread_id = coalesce(v_normalized_phone, p_wamid)
    LIMIT 1;
  END IF;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.inbox_threads (
      workspace_id,
      contact_id,
      integration_id,
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
      p_integration_id,
      'whatsapp',
      coalesce(v_normalized_phone, p_wamid),
      'active',
      'medium',
      1,
      now(),
      jsonb_strip_nulls(jsonb_build_object(
        'aiBotEnabled', true,
        'humanHandoff', false,
        'integrationId', p_integration_id,
        'playbookKey', v_playbook_key,
        'senderPhone', v_normalized_phone,
        'senderName', v_sender_name
      ))
    )
    RETURNING id INTO v_thread_id;
  ELSE
    v_thread_ai_enabled := coalesce((v_thread_metadata->>'aiBotEnabled')::boolean, true);
    v_thread_human_handoff := coalesce((v_thread_metadata->>'humanHandoff')::boolean, false);

    UPDATE public.inbox_threads
    SET
      contact_id = coalesce(inbox_threads.contact_id, v_contact_id),
      integration_id = coalesce(inbox_threads.integration_id, p_integration_id),
      unread_count = inbox_threads.unread_count + 1,
      last_message_at = now(),
      updated_at = now(),
      metadata = jsonb_strip_nulls(inbox_threads.metadata || jsonb_build_object(
        'senderName', coalesce(v_sender_name, inbox_threads.metadata->>'senderName'),
        'senderPhone', coalesce(v_normalized_phone, inbox_threads.metadata->>'senderPhone'),
        'playbookKey', coalesce(inbox_threads.metadata->>'playbookKey', v_playbook_key)
      ))
    WHERE id = v_thread_id;
  END IF;

  -- Step 4: Record Message Atomically
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
    'msg_' || trim(p_wamid),
    jsonb_strip_nulls(jsonb_build_object(
      'wamid', trim(p_wamid),
      'messageType', p_message_type,
      'media', p_media_metadata,
      'payload_sha256', p_payload_hash,
      'sender_name', v_sender_name,
      'from_phone', v_normalized_phone,
      'integration_id', p_integration_id,
      'playbook_key', v_playbook_key
    ))
  )
  RETURNING id INTO v_message_id;

  -- Step 5: Canonical Lead Intake Record
  v_lead_idempotency_key := 'whatsapp_inbound_' || trim(p_wamid);
  v_intake_payload_sha := coalesce(p_payload_hash, md5(p_content));

  INSERT INTO public.lead_intakes (
    workspace_id,
    contact_id,
    thread_id,
    message_id,
    source,
    channel,
    source_event_id,
    idempotency_key,
    payload_sha256,
    resolution_status,
    name,
    phone,
    normalized_phone,
    message,
    attribution,
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
    v_intake_payload_sha,
    v_contact_resolution_status,
    v_sender_name,
    v_normalized_phone,
    v_normalized_phone,
    p_content,
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'whatsapp',
      'integration_id', p_integration_id,
      'playbook_key', v_playbook_key
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'wamid', trim(p_wamid),
      'messageType', p_message_type,
      'media', p_media_metadata
    ))
  )
  ON CONFLICT (workspace_id, idempotency_key) DO UPDATE
    SET message = EXCLUDED.message
  RETURNING id INTO v_intake_id;

  IF v_intake_id IS NULL THEN
    SELECT id INTO v_intake_id
    FROM public.lead_intakes
    WHERE workspace_id = p_workspace_id AND idempotency_key = v_lead_idempotency_key;
  END IF;

  -- Step 6: Canonical Universal Service Conversion Journey
  SELECT id INTO v_journey_id
  FROM public.service_conversion_journeys
  WHERE workspace_id = p_workspace_id AND thread_id = v_thread_id
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
      CASE WHEN p_media_metadata IS NOT NULL AND p_media_metadata <> '{}'::jsonb THEN jsonb_build_array(p_media_metadata) ELSE '[]'::jsonb END,
      jsonb_build_object('initial_wamid', trim(p_wamid))
    )
    RETURNING id INTO v_journey_id;

    -- Record initial audit event
    INSERT INTO public.service_conversion_events (
      workspace_id,
      journey_id,
      from_status,
      to_status,
      reason,
      actor_type,
      metadata
    ) VALUES (
      p_workspace_id,
      v_journey_id,
      NULL,
      'new',
      'Initial service inquiry captured via WhatsApp',
      'system',
      jsonb_build_object('wamid', trim(p_wamid), 'playbook', v_playbook_key)
    );
  END IF;

  -- Step 7: Decide AI Job Enqueueing Rules
  IF p_message_type <> 'text' THEN
    v_ai_job_required := false;
    v_suppression_reason := 'non_text_message';
  ELSIF v_thread_human_handoff = true THEN
    v_ai_job_required := false;
    v_suppression_reason := 'human_takeover_active';
  ELSIF v_thread_ai_enabled = false THEN
    v_ai_job_required := false;
    v_suppression_reason := 'ai_disabled_on_thread';
  ELSE
    v_ai_job_required := true;
  END IF;

  -- Step 8: Enqueue durable WhatsApp AI Job if required
  IF v_ai_job_required THEN
    v_ai_job_key := 'wa_ai_' || trim(p_wamid);

    INSERT INTO public.whatsapp_ai_jobs (
      workspace_id,
      integration_id,
      thread_id,
      recipient_phone,
      sender_name,
      inbound_wamid,
      inbound_text,
      status,
      idempotency_key
    ) VALUES (
      p_workspace_id,
      p_integration_id,
      v_thread_id,
      coalesce(v_normalized_phone, ''),
      v_sender_name,
      trim(p_wamid),
      p_content,
      'pending',
      v_ai_job_key
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET updated_at = now()
    RETURNING id INTO v_job_id;

    v_ai_job_enqueued := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'conflict', false,
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'contact_id', v_contact_id,
    'resolution_status', v_contact_resolution_status,
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
-- RULE: Ordinary lifecycle transition RPC must NEVER transition a journey to booked.
-- Only confirm_workspace_booking_atomic may set booked status, booking_confirmation_source, and attributed_revenue.
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
  -- Strict prohibition: ordinary lifecycle transition RPC must never transition a journey to booked
  IF p_to_status = 'booked' THEN
    RAISE EXCEPTION 'The transition_service_journey_atomic RPC cannot transition a journey to booked. Use confirm_workspace_booking_atomic instead.';
  END IF;

  IF p_attributed_revenue IS NOT NULL THEN
    RAISE EXCEPTION 'Attributed revenue cannot be updated via transition_service_journey_atomic. Use confirm_workspace_booking_atomic instead.';
  END IF;

  IF p_booking_confirmation_source IS NOT NULL THEN
    RAISE EXCEPTION 'Booking confirmation source cannot be updated via transition_service_journey_atomic. Use confirm_workspace_booking_atomic instead.';
  END IF;

  -- 1. Lock journey row for update and verify workspace ownership
  SELECT * INTO v_journey
  FROM public.service_conversion_journeys
  WHERE id = p_journey_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journey % not found in workspace %', p_journey_id, p_workspace_id;
  END IF;

  v_from_status := v_journey.status;

  -- 2. Validate transition state machine (excluding booked)
  IF v_from_status = p_to_status THEN
    v_is_valid_transition := true;
  ELSIF v_from_status = 'new' THEN
    v_is_valid_transition := p_to_status IN ('contacted', 'qualified', 'booking_offered', 'lost', 'human_takeover');
  ELSIF v_from_status = 'contacted' THEN
    v_is_valid_transition := p_to_status IN ('qualified', 'booking_offered', 'lost', 'human_takeover');
  ELSIF v_from_status = 'qualified' THEN
    v_is_valid_transition := p_to_status IN ('booking_offered', 'lost', 'human_takeover');
  ELSIF v_from_status = 'booking_offered' THEN
    v_is_valid_transition := p_to_status IN ('lost', 'human_takeover');
  ELSIF v_from_status = 'human_takeover' THEN
    -- Only authorized operator can resume human takeover back to contacted or qualified
    IF p_actor_type = 'operator' AND p_to_status IN ('contacted', 'qualified') THEN
      v_is_valid_transition := true;
    ELSE
      v_is_valid_transition := false;
    END IF;
  ELSIF v_from_status = 'booked' THEN
    -- Booked cannot regress
    v_is_valid_transition := false;
  ELSIF v_from_status = 'lost' THEN
    -- Lost cannot regress
    v_is_valid_transition := false;
  END IF;

  IF NOT v_is_valid_transition THEN
    RAISE EXCEPTION 'Invalid journey transition from % to % (actor: %)', v_from_status, p_to_status, p_actor_type;
  END IF;

  -- 3. Update journey record (excluding booking_confirmation_source and attributed_revenue)
  UPDATE public.service_conversion_journeys
  SET
    status = p_to_status,
    requested_service = coalesce(p_requested_service, requested_service),
    preferred_date = coalesce(p_preferred_date, preferred_date),
    preferred_time = coalesce(p_preferred_time, preferred_time),
    estimated_service_value = coalesce(p_estimated_value, estimated_service_value),
    qualification_completeness = coalesce(p_qualification_completeness, qualification_completeness),
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
    IF p_to_status IN ('lost', 'human_takeover') THEN
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
-- ONLY this function may set booking to scheduled, journey to booked, set confirmation source, and attribute revenue.
DROP FUNCTION IF EXISTS public.confirm_workspace_booking_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.confirm_workspace_booking_atomic(
  p_workspace_id UUID,
  p_booking_id UUID,
  p_provider TEXT,
  p_provider_event_id TEXT,
  p_confirmed_revenue NUMERIC(10,2),
  p_actor_id TEXT DEFAULT NULL,
  p_confirmed_meeting_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking RECORD;
  v_journey RECORD;
  v_existing_other_booking RECORD;
  v_provider TEXT;
  v_event_id TEXT;
  v_meeting_url TEXT;
BEGIN
  -- Strict input validation and normalization
  IF p_provider IS NULL OR trim(p_provider) = '' THEN
    RAISE EXCEPTION 'Provider is required for external confirmation';
  END IF;
  IF p_provider_event_id IS NULL OR trim(p_provider_event_id) = '' THEN
    RAISE EXCEPTION 'Provider event ID is required for external confirmation';
  END IF;

  v_provider := lower(trim(p_provider));
  v_event_id := trim(p_provider_event_id);

  -- Option B Infrastructure Validation: Revenue must be within 0.00 and 99999999.99 if supplied
  IF p_confirmed_revenue IS NOT NULL THEN
    IF p_confirmed_revenue < 0 OR p_confirmed_revenue > 99999999.99 THEN
      RAISE EXCEPTION 'Confirmed revenue % is invalid (must be between 0 and 99999999.99)', p_confirmed_revenue;
    END IF;
  END IF;

  -- Meeting URL validation: must be HTTPS if supplied
  IF p_confirmed_meeting_url IS NOT NULL AND trim(p_confirmed_meeting_url) <> '' THEN
    v_meeting_url := trim(p_confirmed_meeting_url);
    IF v_meeting_url !~* '^https://[^\s/$.?#].[^\s]*$' THEN
      RAISE EXCEPTION 'Meeting URL must be a valid HTTPS URL: %', p_confirmed_meeting_url;
    END IF;
  ELSE
    v_meeting_url := NULL;
  END IF;

  -- 1. Lock booking row for update and verify workspace ownership
  SELECT * INTO v_booking
  FROM public.crm_bookings
  WHERE id = p_booking_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found in workspace %', p_booking_id, p_workspace_id;
  END IF;

  -- Idempotency check: repeated delivery of exact same provider confirmation is idempotent
  IF v_booking.external_calendar_provider = v_provider AND v_booking.external_calendar_event_id = v_event_id THEN
    -- Check replay conflict: if revenue is provided and differs from already persisted confirmed revenue -> fail closed
    IF p_confirmed_revenue IS NOT NULL AND v_booking.confirmed_revenue IS NOT NULL AND v_booking.confirmed_revenue <> p_confirmed_revenue THEN
      RAISE EXCEPTION 'Booking % is already confirmed with revenue % but received conflicting revenue %', p_booking_id, v_booking.confirmed_revenue, p_confirmed_revenue;
    END IF;

    -- Return persisted values
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'duplicate', true,
      'booking_id', p_booking_id,
      'status', v_booking.status,
      'external_reservation_status', v_booking.external_reservation_status,
      'confirmed_revenue', coalesce(v_booking.confirmed_revenue, p_confirmed_revenue),
      'meeting_url', v_booking.meeting_url
    );
  END IF;

  -- Replay protection: if booking is already confirmed with differing provider or event ID -> fail closed
  IF v_booking.external_calendar_event_id IS NOT NULL AND (
    v_booking.external_calendar_provider <> v_provider OR v_booking.external_calendar_event_id <> v_event_id
  ) THEN
    RAISE EXCEPTION 'Booking % is already confirmed with provider % and event %', p_booking_id, v_booking.external_calendar_provider, v_booking.external_calendar_event_id;
  END IF;

  -- Cross-booking replay protection: provider event ID must not confirm multiple booking records in the same workspace
  SELECT id INTO v_existing_other_booking
  FROM public.crm_bookings
  WHERE workspace_id = p_workspace_id
    AND external_calendar_provider = v_provider
    AND external_calendar_event_id = v_event_id
    AND id <> p_booking_id
  LIMIT 1;

  IF v_existing_other_booking.id IS NOT NULL THEN
    RAISE EXCEPTION 'Provider event ID % for provider % already confirmed another booking (%) in workspace %', v_event_id, v_provider, v_existing_other_booking.id, p_workspace_id;
  END IF;

  -- 2. Update booking to confirmed status in the same transaction, including meeting_url and confirmed_revenue
  UPDATE public.crm_bookings
  SET
    status = 'scheduled',
    external_reservation_status = 'confirmed_external_calendar',
    external_calendar_provider = v_provider,
    external_calendar_event_id = v_event_id,
    confirmed_revenue = coalesce(p_confirmed_revenue, v_booking.confirmed_revenue),
    meeting_url = coalesce(v_meeting_url, v_booking.meeting_url),
    externally_confirmed_at = coalesce(v_booking.externally_confirmed_at, now()),
    updated_at = now()
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update booking % in workspace %', p_booking_id, p_workspace_id;
  END IF;

  -- 3. If booking is linked to a thread, update corresponding journey
  IF v_booking.thread_id IS NOT NULL THEN
    SELECT * INTO v_journey
    FROM public.service_conversion_journeys
    WHERE workspace_id = p_workspace_id AND thread_id = v_booking.thread_id
    FOR UPDATE;

    IF v_journey.id IS NOT NULL THEN
      -- Directly and safely transition the journey to booked
      UPDATE public.service_conversion_journeys
      SET
        status = 'booked',
        booking_confirmation_source = v_provider,
        attributed_revenue = coalesce(p_confirmed_revenue, v_journey.estimated_service_value, 0),
        updated_at = now()
      WHERE id = v_journey.id;

      -- Insert the booked audit event
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
        v_journey.id,
        v_journey.status,
        'booked',
        'Confirmed via external calendar provider ' || v_provider,
        'system',
        coalesce(p_actor_id, 'booking_webhook'),
        jsonb_build_object(
          'provider', v_provider,
          'provider_event_id', v_event_id,
          'confirmed_revenue', p_confirmed_revenue,
          'meeting_url', v_meeting_url
        )
      );

      -- Cancel scheduled follow-ups on terminal booked state
      UPDATE public.service_followups
      SET
        status = 'cancelled',
        cancel_reason = 'lifecycle_transition_to_booked',
        updated_at = now()
      WHERE workspace_id = p_workspace_id
        AND journey_id = v_journey.id
        AND status = 'scheduled';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'scheduled',
    'external_reservation_status', 'confirmed_external_calendar',
    'confirmed_revenue', coalesce(p_confirmed_revenue, v_booking.confirmed_revenue),
    'meeting_url', coalesce(v_meeting_url, v_booking.meeting_url)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_workspace_booking_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_workspace_booking_atomic(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;

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

-- 12. Transactional Human Handoff RPC (Service-Role Only)
CREATE OR REPLACE FUNCTION public.handoff_service_thread_atomic(
  p_workspace_id UUID,
  p_thread_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'ai_assistant',
  p_actor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread RECORD;
  v_journey RECORD;
  v_from_status TEXT;
  v_updated_meta JSONB;
  v_journey_final_status TEXT := 'none';
  v_already_sent_notice BOOLEAN;
BEGIN
  -- 1. Lock workspace-scoped thread
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread % not found in workspace %', p_thread_id, p_workspace_id;
  END IF;

  -- Check existing notice status
  v_already_sent_notice := (
    coalesce(v_thread.metadata->>'humanHandoffNoticeStatus', '') = 'sent'
    OR coalesce((v_thread.metadata->>'humanHandoffNoticeSent')::boolean, false) = true
  );

  -- 2. Lock and inspect journey if present
  SELECT * INTO v_journey
  FROM public.service_conversion_journeys
  WHERE thread_id = p_thread_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_journey.id IS NOT NULL THEN
    v_from_status := v_journey.status;

    -- PRESERVE TERMINAL STATES: booked and lost must NEVER regress to human_takeover
    IF v_from_status IN ('booked', 'lost') THEN
      v_journey_final_status := v_from_status;

      -- Log an audit event documenting the handoff request while preserving terminal state
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
        v_journey.id,
        v_from_status,
        v_from_status,
        coalesce(p_reason, 'Human handoff requested on terminal journey'),
        coalesce(p_actor_type, 'ai_assistant'),
        p_actor_id,
        jsonb_build_object('reason', p_reason, 'terminal_state_preserved', true)
      );
    ELSE
      v_journey_final_status := 'human_takeover';

      UPDATE public.service_conversion_journeys
      SET
        status = 'human_takeover',
        human_takeover_reason = coalesce(p_reason, 'Customer escalation keyword detected'),
        updated_at = now()
      WHERE id = v_journey.id;

      -- Write immutable audit event
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
        v_journey.id,
        v_from_status,
        'human_takeover',
        coalesce(p_reason, 'Escalated to human representative'),
        coalesce(p_actor_type, 'ai_assistant'),
        p_actor_id,
        jsonb_build_object('reason', p_reason)
      );

      -- Cancel applicable scheduled follow-ups
      UPDATE public.service_followups
      SET
        status = 'cancelled',
        cancel_reason = 'lifecycle_transition_to_human_takeover',
        updated_at = now()
      WHERE workspace_id = p_workspace_id
        AND journey_id = v_journey.id
        AND status = 'scheduled';
    END IF;
  END IF;

  -- 3. Update thread: disable AI and flag human handoff, initialize notice status to pending if not already sent
  v_updated_meta := coalesce(v_thread.metadata, '{}'::jsonb) || jsonb_build_object(
    'aiBotEnabled', false,
    'humanHandoff', true,
    'humanRequestedAt', now(),
    'humanHandoffNoticeStatus', CASE WHEN v_already_sent_notice THEN 'sent' ELSE 'pending' END
  );

  UPDATE public.inbox_threads
  SET
    metadata = v_updated_meta,
    updated_at = now()
  WHERE id = p_thread_id;

  RETURN jsonb_build_object(
    'success', true,
    'thread_id', p_thread_id,
    'journey_id', v_journey.id,
    'journey_status', v_journey_final_status,
    'already_sent_notice', v_already_sent_notice
  );
END;
$$;

REVOKE ALL ON FUNCTION public.handoff_service_thread_atomic(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_service_thread_atomic(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

-- 12b. Transactional Handoff Notice Status Recorder (Service-Role Only)
CREATE OR REPLACE FUNCTION public.record_thread_handoff_notice_atomic(
  p_workspace_id UUID,
  p_thread_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread RECORD;
  v_meta JSONB;
BEGIN
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread % not found in workspace %', p_thread_id, p_workspace_id;
  END IF;

  v_meta := coalesce(v_thread.metadata, '{}'::jsonb) || jsonb_build_object(
    'humanHandoffNoticeStatus', p_status,
    'humanHandoffNoticeAt', now()
  );

  IF p_status = 'sent' THEN
    v_meta := v_meta || jsonb_build_object('humanHandoffNoticeSent', true);
  END IF;

  IF p_error IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('humanHandoffNoticeError', p_error);
  END IF;

  UPDATE public.inbox_threads
  SET metadata = v_meta, updated_at = now()
  WHERE id = p_thread_id;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.record_thread_handoff_notice_atomic(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_thread_handoff_notice_atomic(UUID, UUID, TEXT, TEXT) TO service_role;

-- 13. Transactional Operator Resume RPC (Service-Role Only)
CREATE OR REPLACE FUNCTION public.resume_service_thread_atomic(
  p_workspace_id UUID,
  p_thread_id UUID,
  p_operator_user_id TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread RECORD;
  v_journey RECORD;
  v_resume_status TEXT := 'contacted';
  v_updated_meta JSONB;
BEGIN
  IF p_operator_user_id IS NULL OR trim(p_operator_user_id) = '' THEN
    RAISE EXCEPTION 'Operator user ID is required to resume service thread';
  END IF;

  -- 1. Lock workspace-scoped thread
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread % not found in workspace %', p_thread_id, p_workspace_id;
  END IF;

  -- 2. Lock and transition journey if present
  SELECT * INTO v_journey
  FROM public.service_conversion_journeys
  WHERE thread_id = p_thread_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_journey.id IS NOT NULL AND v_journey.status = 'human_takeover' THEN
    IF coalesce(v_journey.qualification_completeness, 0) >= 0.70 THEN
      v_resume_status := 'qualified';
    ELSE
      v_resume_status := 'contacted';
    END IF;

    UPDATE public.service_conversion_journeys
    SET
      status = v_resume_status,
      updated_at = now()
    WHERE id = v_journey.id;

    -- Write immutable audit event
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
      v_journey.id,
      'human_takeover',
      v_resume_status,
      coalesce(p_notes, 'Operator manually resumed AI assistance'),
      'operator',
      p_operator_user_id,
      jsonb_build_object('resumed_by', p_operator_user_id, 'notes', p_notes)
    );
  ELSIF v_journey.id IS NOT NULL THEN
    v_resume_status := v_journey.status;
  END IF;

  -- 3. Update thread: remove handoff notice markers, re-enable AI
  v_updated_meta := (coalesce(v_thread.metadata, '{}'::jsonb) - 'humanHandoffNoticeSent' - 'humanHandoffNoticeStatus' - 'humanHandoffNoticeError') || jsonb_build_object(
    'aiBotEnabled', true,
    'humanHandoff', false,
    'resumedByUserId', p_operator_user_id,
    'resumedAt', now()
  );

  UPDATE public.inbox_threads
  SET
    metadata = v_updated_meta,
    updated_at = now()
  WHERE id = p_thread_id;

  RETURN jsonb_build_object(
    'success', true,
    'thread_id', p_thread_id,
    'journey_id', v_journey.id,
    'status', v_resume_status,
    'aiBotEnabled', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resume_service_thread_atomic(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_service_thread_atomic(UUID, UUID, TEXT, TEXT) TO service_role;

COMMIT;
