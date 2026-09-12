BEGIN;

-- Stage 1 preserves individual intake occurrences. contacts remain the canonical
-- CRM entity; identities are intentionally non-unique because shared contact
-- methods are legitimate and ambiguous matches must never be auto-merged.
CREATE TABLE public.contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  identity_type text NOT NULL CHECK (identity_type IN ('email', 'phone')),
  normalized_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, contact_id, identity_type, normalized_value),
  FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_contact_identities_resolution
  ON public.contact_identities(workspace_id, identity_type, normalized_value);

CREATE TABLE public.lead_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid,
  source text NOT NULL CHECK (source IN ('website_form', 'widget_form', 'webchat', 'manual', 'whatsapp')),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger', 'webchat', 'website', 'crm')),
  source_event_id text,
  idempotency_key text NOT NULL,
  resolution_status text NOT NULL CHECK (resolution_status IN ('created', 'matched', 'ambiguous')),
  name text NOT NULL,
  email text,
  phone text,
  normalized_email text,
  normalized_phone text,
  payload_sha256 text NOT NULL,
  thread_id uuid,
  message_id uuid,
  message text,
  campaign text,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY (workspace_id, thread_id)
    REFERENCES public.inbox_threads(workspace_id, id) ON DELETE SET NULL (thread_id),
  FOREIGN KEY (workspace_id, message_id)
    REFERENCES public.inbox_messages(workspace_id, id) ON DELETE SET NULL (message_id)
);

CREATE UNIQUE INDEX uq_lead_intakes_workspace_source_event
  ON public.lead_intakes(workspace_id, source, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX idx_lead_intakes_workspace_received
  ON public.lead_intakes(workspace_id, created_at DESC);

CREATE TABLE public.lead_intake_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  intake_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('granted', 'denied', 'revoked', 'not_provided')),
  communication_channel text NOT NULL CHECK (communication_channel IN ('whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger', 'webchat', 'website', 'crm')),
  purpose text NOT NULL CHECK (purpose IN ('operational', 'marketing')),
  disclosure_version text NOT NULL,
  captured_at timestamptz NOT NULL,
  capture_source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, intake_id)
    REFERENCES public.lead_intakes(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE public.lead_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  intake_id uuid NOT NULL,
  canonical_event_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'lead.received' CHECK (event_type = 'lead.received'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claim_token uuid,
  claim_expires_at timestamptz,
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, canonical_event_id),
  FOREIGN KEY (workspace_id, intake_id)
    REFERENCES public.lead_intakes(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_lead_event_outbox_delivery
  ON public.lead_event_outbox(workspace_id, status, created_at);

ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intakes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intake_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intake_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lead_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_event_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY contact_identities_member_select ON public.contact_identities FOR SELECT
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY lead_intakes_member_select ON public.lead_intakes FOR SELECT
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY lead_intake_consents_member_select ON public.lead_intake_consents FOR SELECT
  USING (public.is_workspace_member(workspace_id));
CREATE POLICY lead_event_outbox_service_role ON public.lead_event_outbox FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY contact_identities_service_role ON public.contact_identities FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY lead_intakes_service_role ON public.lead_intakes FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY lead_intake_consents_service_role ON public.lead_intake_consents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.contact_identities, public.lead_intakes, public.lead_intake_consents, public.lead_event_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contact_identities, public.lead_intakes, public.lead_intake_consents TO authenticated;
GRANT ALL ON public.contact_identities, public.lead_intakes, public.lead_intake_consents, public.lead_event_outbox TO service_role;

ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE public.automations ADD CONSTRAINT automations_trigger_type_check CHECK (trigger_type = ANY (ARRAY[
  'manual', 'new_crm_contact', 'crm_status_changed', 'new_ai_task', 'ai_task_completed', 'schedule', 'integration_event', 'lead.received'
]));

CREATE OR REPLACE FUNCTION public.record_lead_intake(
  p_workspace_id uuid,
  p_source text,
  p_channel text,
  p_idempotency_key text,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_campaign text DEFAULT NULL,
  p_attribution jsonb DEFAULT '{}'::jsonb,
  p_consents jsonb DEFAULT '[]'::jsonb,
  p_source_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_email text := NULLIF(lower(trim(p_email)), '');
  v_phone text := NULLIF(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_candidates uuid[];
  v_contact_id uuid;
  v_intake_id uuid;
  v_thread_id uuid;
  v_message_id uuid;
  v_status text;
  v_consent jsonb;
  v_payload_sha256 text;
  v_existing_payload_sha256 text;
BEGIN
  IF p_workspace_id IS NULL OR NULLIF(trim(p_idempotency_key), '') IS NULL OR NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'workspace, idempotency key, and name are required';
  END IF;
  IF v_email IS NULL AND v_phone IS NULL THEN RAISE EXCEPTION 'an email or phone is required'; END IF;
  IF p_source NOT IN ('website_form', 'widget_form', 'webchat', 'manual', 'whatsapp') THEN RAISE EXCEPTION 'invalid lead source'; END IF;
  IF p_channel NOT IN ('whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger', 'webchat', 'website', 'crm') THEN RAISE EXCEPTION 'invalid lead channel'; END IF;
  v_payload_sha256 := md5(jsonb_build_object(
    'source', p_source, 'channel', p_channel, 'name', trim(p_name), 'email', v_email,
    'phone', v_phone, 'message', NULLIF(trim(p_message), ''), 'campaign', NULLIF(trim(p_campaign), ''),
    'attribution', coalesce(p_attribution, '{}'::jsonb), 'metadata', coalesce(p_metadata, '{}'::jsonb),
    'consents', coalesce(p_consents, '[]'::jsonb)
  )::text);

  -- Serialize identity resolution by workspace and normalized identity. This is
  -- deliberately not a uniqueness rule: shared addresses remain valid and are
  -- recorded as ambiguous rather than silently merged.
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|key|' || trim(p_idempotency_key)));
  IF v_email IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|email|' || v_email)); END IF;
  IF v_phone IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|phone|' || v_phone)); END IF;
  IF NULLIF(trim(p_source_event_id), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|source|' || p_source || '|' || trim(p_source_event_id)));
    SELECT id INTO v_intake_id FROM public.lead_intakes
      WHERE workspace_id = p_workspace_id AND source = p_source AND source_event_id = trim(p_source_event_id);
    IF FOUND THEN
      SELECT payload_sha256 INTO v_existing_payload_sha256 FROM public.lead_intakes WHERE id = v_intake_id;
      IF v_existing_payload_sha256 <> v_payload_sha256 THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'lead source event payload conflict'; END IF;
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'intake_id', v_intake_id, 'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id=v_intake_id), 'resolution_status', (SELECT resolution_status FROM public.lead_intakes WHERE id=v_intake_id), 'canonical_event_id', 'lead.received:' || v_intake_id::text);
    END IF;
  END IF;

  SELECT array_agg(DISTINCT contact_id) INTO v_candidates FROM (
    SELECT ci.contact_id FROM public.contact_identities ci
     WHERE ci.workspace_id = p_workspace_id AND ((v_email IS NOT NULL AND ci.identity_type = 'email' AND ci.normalized_value = v_email) OR (v_phone IS NOT NULL AND ci.identity_type = 'phone' AND ci.normalized_value = v_phone))
    UNION
    SELECT c.id FROM public.contacts c
     WHERE c.workspace_id = p_workspace_id AND ((v_email IS NOT NULL AND lower(trim(c.email)) = v_email) OR (v_phone IS NOT NULL AND regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = v_phone))
  ) candidates;

  IF coalesce(array_length(v_candidates, 1), 0) > 1 THEN
    v_status := 'ambiguous';
  ELSIF coalesce(array_length(v_candidates, 1), 0) = 1 THEN
    v_contact_id := v_candidates[1]; v_status := 'matched';
  ELSE
    INSERT INTO public.contacts(workspace_id, name, first_name, email, phone, source, deal_stage, type, status, metadata)
    VALUES (p_workspace_id, trim(p_name), split_part(trim(p_name), ' ', 1), v_email, CASE WHEN v_phone IS NULL THEN NULL ELSE '+' || v_phone END, p_source, 'lead', 'Lead', 'New', jsonb_build_object('stage1_first_touch', jsonb_build_object('source', p_source, 'channel', p_channel, 'campaign', p_campaign, 'attribution', p_attribution)))
    RETURNING id INTO v_contact_id;
    v_status := 'created';
  END IF;

  IF v_contact_id IS NOT NULL THEN
    IF v_email IS NOT NULL THEN INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value) VALUES (p_workspace_id, v_contact_id, 'email', v_email) ON CONFLICT DO NOTHING; END IF;
    IF v_phone IS NOT NULL THEN INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value) VALUES (p_workspace_id, v_contact_id, 'phone', v_phone) ON CONFLICT DO NOTHING; END IF;
  END IF;

  INSERT INTO public.lead_intakes(workspace_id, contact_id, source, channel, source_event_id, idempotency_key, resolution_status, name, email, phone, normalized_email, normalized_phone, payload_sha256, message, campaign, attribution, metadata)
  VALUES (p_workspace_id, v_contact_id, p_source, p_channel, NULLIF(trim(p_source_event_id), ''), trim(p_idempotency_key), v_status, trim(p_name), v_email, CASE WHEN v_phone IS NULL THEN NULL ELSE '+' || v_phone END, v_email, v_phone, v_payload_sha256, NULLIF(trim(p_message), ''), NULLIF(trim(p_campaign), ''), coalesce(p_attribution, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING RETURNING id INTO v_intake_id;
  IF v_intake_id IS NULL THEN
    SELECT id, payload_sha256 INTO v_intake_id, v_existing_payload_sha256 FROM public.lead_intakes WHERE workspace_id=p_workspace_id AND idempotency_key=trim(p_idempotency_key);
    IF v_existing_payload_sha256 <> v_payload_sha256 THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'lead idempotency payload conflict'; END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'intake_id', v_intake_id, 'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id=v_intake_id), 'resolution_status', (SELECT resolution_status FROM public.lead_intakes WHERE id=v_intake_id), 'canonical_event_id', 'lead.received:' || v_intake_id::text);
  END IF;
  IF v_contact_id IS NOT NULL AND p_channel IN ('website', 'webchat', 'whatsapp') THEN
    INSERT INTO public.inbox_threads(workspace_id, contact_id, channel, external_thread_id, metadata)
    VALUES (p_workspace_id, v_contact_id, CASE WHEN p_channel = 'webchat' THEN 'website' ELSE p_channel END, 'lead-intake:' || v_intake_id::text, jsonb_build_object('lead_intake_id', v_intake_id))
    RETURNING id INTO v_thread_id;
    INSERT INTO public.inbox_messages(workspace_id, thread_id, direction, provider, external_message_id, content, metadata)
    VALUES (p_workspace_id, v_thread_id, 'inbound', 'j10_lead_intake', 'lead-intake:' || v_intake_id::text, coalesce(NULLIF(trim(p_message), ''), 'Lead intake received.'), jsonb_build_object('lead_intake_id', v_intake_id))
    RETURNING id INTO v_message_id;
    UPDATE public.lead_intakes SET thread_id = v_thread_id, message_id = v_message_id WHERE id = v_intake_id;
  END IF;
  FOR v_consent IN SELECT value FROM jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) LOOP
    INSERT INTO public.lead_intake_consents(workspace_id, intake_id, status, communication_channel, purpose, disclosure_version, captured_at, capture_source)
    VALUES (p_workspace_id, v_intake_id, v_consent->>'status', v_consent->>'communication_channel', v_consent->>'purpose', v_consent->>'disclosure_version', coalesce((v_consent->>'captured_at')::timestamptz, now()), v_consent->>'capture_source');
  END LOOP;
  INSERT INTO public.lead_event_outbox(workspace_id, intake_id, canonical_event_id)
  VALUES (p_workspace_id, v_intake_id, 'lead.received:' || v_intake_id::text);
  RETURN jsonb_build_object('success', true, 'duplicate', false, 'intake_id', v_intake_id, 'contact_id', v_contact_id, 'resolution_status', v_status, 'canonical_event_id', 'lead.received:' || v_intake_id::text);
END; $$;

REVOKE ALL ON FUNCTION public.record_lead_intake(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_lead_intake(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, jsonb) TO service_role;

-- A worker must claim a row before dispatching. SKIP LOCKED lets concurrent
-- workers progress without ever dispatching the same canonical event twice.
CREATE OR REPLACE FUNCTION public.claim_lead_event_outbox(
  p_workspace_id uuid,
  p_intake_id uuid,
  p_claim_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.lead_event_outbox%ROWTYPE;
BEGIN
  UPDATE public.lead_event_outbox
  SET status = 'processing', claim_token = p_claim_token,
      claim_expires_at = now() + interval '5 minutes', attempts = attempts + 1,
      last_attempt_at = now(), updated_at = now()
  WHERE id = (
    SELECT id FROM public.lead_event_outbox
    WHERE workspace_id = p_workspace_id AND intake_id = p_intake_id
      AND (status IN ('pending', 'failed') OR (status = 'processing' AND claim_expires_at < now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false); END IF;
  RETURN jsonb_build_object('claimed', true, 'outbox_id', v_row.id, 'canonical_event_id', v_row.canonical_event_id, 'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id = v_row.intake_id));
END; $$;

CREATE OR REPLACE FUNCTION public.complete_lead_event_outbox(
  p_workspace_id uuid,
  p_intake_id uuid,
  p_claim_token uuid,
  p_delivered boolean,
  p_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.lead_event_outbox
  SET status = CASE WHEN p_delivered THEN 'delivered' ELSE 'failed' END,
      delivered_at = CASE WHEN p_delivered THEN now() ELSE NULL END,
      last_error = CASE WHEN p_delivered THEN NULL ELSE NULLIF(left(p_error, 500), '') END,
      claim_token = NULL, claim_expires_at = NULL, updated_at = now()
  WHERE workspace_id = p_workspace_id AND intake_id = p_intake_id
    AND status = 'processing' AND claim_token = p_claim_token;
  RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.claim_lead_event_outbox(uuid, uuid, uuid), public.complete_lead_event_outbox(uuid, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lead_event_outbox(uuid, uuid, uuid), public.complete_lead_event_outbox(uuid, uuid, uuid, boolean, text) TO service_role;

COMMIT;
