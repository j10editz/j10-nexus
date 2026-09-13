BEGIN;

-- Stage 1 Telegram & Omnichannel Channel Extension
-- Forward-only migration to extend Stage 1 Lead Intake to canonical Telegram support.

-- 1. Expand inbox_threads channel constraint
ALTER TABLE public.inbox_threads
  DROP CONSTRAINT IF EXISTS chk_inbox_threads_channel,
  DROP CONSTRAINT IF EXISTS inbox_threads_channel_check;

ALTER TABLE public.inbox_threads
  ADD CONSTRAINT chk_inbox_threads_channel CHECK (channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm', 'telegram'
  ));

-- 2. Expand lead_intakes source and channel constraints
ALTER TABLE public.lead_intakes
  DROP CONSTRAINT IF EXISTS lead_intakes_source_check,
  DROP CONSTRAINT IF EXISTS chk_lead_intakes_source;

ALTER TABLE public.lead_intakes
  ADD CONSTRAINT chk_lead_intakes_source CHECK (source IN (
    'website_form', 'widget_form', 'webchat', 'manual', 'whatsapp', 'telegram'
  ));

ALTER TABLE public.lead_intakes
  DROP CONSTRAINT IF EXISTS lead_intakes_channel_check,
  DROP CONSTRAINT IF EXISTS chk_lead_intakes_channel;

ALTER TABLE public.lead_intakes
  ADD CONSTRAINT chk_lead_intakes_channel CHECK (channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm', 'telegram'
  ));

-- 3. Expand lead_intake_consents communication_channel constraint
ALTER TABLE public.lead_intake_consents
  DROP CONSTRAINT IF EXISTS lead_intake_consents_communication_channel_check,
  DROP CONSTRAINT IF EXISTS chk_lead_intake_consents_communication_channel;

ALTER TABLE public.lead_intake_consents
  ADD CONSTRAINT chk_lead_intake_consents_communication_channel CHECK (communication_channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm', 'telegram'
  ));

-- 4. Expand contact_identities identity_type constraint to permit 'telegram'
ALTER TABLE public.contact_identities
  DROP CONSTRAINT IF EXISTS contact_identities_identity_type_check,
  DROP CONSTRAINT IF EXISTS chk_contact_identities_identity_type;

ALTER TABLE public.contact_identities
  ADD CONSTRAINT chk_contact_identities_identity_type CHECK (
    identity_type IN ('email', 'phone', 'telegram')
  );

-- 5. Updated record_lead_intake supporting Telegram canonical resolution
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
  v_telegram_id text := NULLIF(trim(p_metadata->>'telegram_user_id'), '');
  v_candidates uuid[];
  v_contact_id uuid;
  v_intake_id uuid;
  v_thread_id uuid;
  v_message_id uuid;
  v_status text;
  v_consent jsonb;
  v_payload_sha256 text;
  v_existing_payload_sha256 text;
  v_thread_external_id text;
  v_msg_external_id text;
BEGIN
  IF p_workspace_id IS NULL OR NULLIF(trim(p_idempotency_key), '') IS NULL OR NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'workspace, idempotency key, and name are required';
  END IF;

  IF v_email IS NULL AND v_phone IS NULL AND v_telegram_id IS NULL AND p_source <> 'telegram' THEN
    RAISE EXCEPTION 'an email or phone is required';
  END IF;

  IF p_source NOT IN ('website_form', 'widget_form', 'webchat', 'manual', 'whatsapp', 'telegram') THEN
    RAISE EXCEPTION 'invalid lead source';
  END IF;

  IF p_channel NOT IN ('whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger', 'webchat', 'website', 'crm', 'telegram') THEN
    RAISE EXCEPTION 'invalid lead channel';
  END IF;

  v_payload_sha256 := md5(jsonb_build_object(
    'source', p_source, 'channel', p_channel, 'name', trim(p_name), 'email', v_email,
    'phone', v_phone, 'message', NULLIF(trim(p_message), ''), 'campaign', NULLIF(trim(p_campaign), ''),
    'attribution', coalesce(p_attribution, '{}'::jsonb), 'metadata', coalesce(p_metadata, '{}'::jsonb),
    'consents', coalesce(p_consents, '[]'::jsonb)
  )::text);

  -- Advisory locks for deterministic serialization
  PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|key|' || trim(p_idempotency_key)));
  IF v_email IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|email|' || v_email)); END IF;
  IF v_phone IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|phone|' || v_phone)); END IF;
  IF v_telegram_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|tg|' || v_telegram_id)); END IF;

  IF NULLIF(trim(p_source_event_id), '') IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::text || '|source|' || p_source || '|' || trim(p_source_event_id)));
    SELECT id INTO v_intake_id FROM public.lead_intakes
      WHERE workspace_id = p_workspace_id AND source = p_source AND source_event_id = trim(p_source_event_id);
    IF FOUND THEN
      SELECT payload_sha256 INTO v_existing_payload_sha256 FROM public.lead_intakes WHERE id = v_intake_id;
      IF v_existing_payload_sha256 <> v_payload_sha256 THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'lead source event payload conflict';
      END IF;
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'intake_id', v_intake_id,
        'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id = v_intake_id),
        'resolution_status', (SELECT resolution_status FROM public.lead_intakes WHERE id = v_intake_id),
        'canonical_event_id', 'lead.received:' || v_intake_id::text
      );
    END IF;
  END IF;

  -- Identity resolution candidates
  SELECT array_agg(DISTINCT contact_id) INTO v_candidates FROM (
    SELECT ci.contact_id FROM public.contact_identities ci
     WHERE ci.workspace_id = p_workspace_id AND (
       (v_email IS NOT NULL AND ci.identity_type = 'email' AND ci.normalized_value = v_email) OR
       (v_phone IS NOT NULL AND ci.identity_type = 'phone' AND ci.normalized_value = v_phone) OR
       (v_telegram_id IS NOT NULL AND ci.identity_type = 'telegram' AND ci.normalized_value = v_telegram_id)
     )
    UNION
    SELECT c.id FROM public.contacts c
     WHERE c.workspace_id = p_workspace_id AND (
       (v_email IS NOT NULL AND lower(trim(c.email)) = v_email) OR
       (v_phone IS NOT NULL AND regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = v_phone)
     )
  ) candidates;

  IF coalesce(array_length(v_candidates, 1), 0) > 1 THEN
    v_status := 'ambiguous';
  ELSIF coalesce(array_length(v_candidates, 1), 0) = 1 THEN
    v_contact_id := v_candidates[1];
    v_status := 'matched';
  ELSE
    INSERT INTO public.contacts(workspace_id, name, first_name, email, phone, source, deal_stage, type, status, metadata)
    VALUES (
      p_workspace_id,
      trim(p_name),
      split_part(trim(p_name), ' ', 1),
      v_email,
      CASE WHEN v_phone IS NULL THEN NULL ELSE '+' || v_phone END,
      p_source,
      'lead',
      'Lead',
      'New',
      jsonb_build_object('stage1_first_touch', jsonb_build_object(
        'source', p_source,
        'channel', p_channel,
        'campaign', p_campaign,
        'attribution', p_attribution,
        'telegram_user_id', v_telegram_id,
        'telegram_username', p_metadata->>'telegram_username'
      ))
    )
    RETURNING id INTO v_contact_id;
    v_status := 'created';
  END IF;

  IF v_contact_id IS NOT NULL THEN
    IF v_email IS NOT NULL THEN
      INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value)
      VALUES (p_workspace_id, v_contact_id, 'email', v_email)
      ON CONFLICT DO NOTHING;
    END IF;
    IF v_phone IS NOT NULL THEN
      INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value)
      VALUES (p_workspace_id, v_contact_id, 'phone', v_phone)
      ON CONFLICT DO NOTHING;
    END IF;
    IF v_telegram_id IS NOT NULL THEN
      INSERT INTO public.contact_identities(workspace_id, contact_id, identity_type, normalized_value)
      VALUES (p_workspace_id, v_contact_id, 'telegram', v_telegram_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.lead_intakes(
    workspace_id, contact_id, source, channel, source_event_id, idempotency_key,
    resolution_status, name, email, phone, normalized_email, normalized_phone,
    payload_sha256, message, campaign, attribution, metadata
  ) VALUES (
    p_workspace_id, v_contact_id, p_source, p_channel, NULLIF(trim(p_source_event_id), ''),
    trim(p_idempotency_key), v_status, trim(p_name), v_email,
    CASE WHEN v_phone IS NULL THEN NULL ELSE '+' || v_phone END,
    v_email, v_phone, v_payload_sha256, NULLIF(trim(p_message), ''),
    NULLIF(trim(p_campaign), ''), coalesce(p_attribution, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_intake_id;

  IF v_intake_id IS NULL THEN
    SELECT id, payload_sha256 INTO v_intake_id, v_existing_payload_sha256
      FROM public.lead_intakes
     WHERE workspace_id = p_workspace_id AND idempotency_key = trim(p_idempotency_key);
    IF v_existing_payload_sha256 <> v_payload_sha256 THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'lead idempotency payload conflict';
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'intake_id', v_intake_id,
      'contact_id', (SELECT contact_id FROM public.lead_intakes WHERE id = v_intake_id),
      'resolution_status', (SELECT resolution_status FROM public.lead_intakes WHERE id = v_intake_id),
      'canonical_event_id', 'lead.received:' || v_intake_id::text
    );
  END IF;

  -- Create thread and message for conversational channels (website, webchat, whatsapp, telegram)
  IF v_contact_id IS NOT NULL AND p_channel IN ('website', 'webchat', 'whatsapp', 'telegram') THEN
    IF p_channel = 'telegram' THEN
      v_thread_external_id := coalesce(NULLIF(trim(p_metadata->>'telegram_chat_id'), ''), 'telegram:' || coalesce(v_telegram_id, v_intake_id::text));
      v_msg_external_id := coalesce(NULLIF(trim(p_source_event_id), ''), 'telegram:msg:' || v_intake_id::text);
    ELSE
      v_thread_external_id := 'lead-intake:' || v_intake_id::text;
      v_msg_external_id := 'lead-intake:' || v_intake_id::text;
    END IF;

    -- Check if thread already exists for this contact on this channel
    SELECT id INTO v_thread_id
      FROM public.inbox_threads
     WHERE workspace_id = p_workspace_id
       AND contact_id = v_contact_id
       AND channel = p_channel
     ORDER BY id DESC
     LIMIT 1;

    IF v_thread_id IS NULL THEN
      INSERT INTO public.inbox_threads(workspace_id, contact_id, channel, external_thread_id, metadata)
      VALUES (
        p_workspace_id,
        v_contact_id,
        CASE WHEN p_channel = 'webchat' THEN 'website' ELSE p_channel END,
        v_thread_external_id,
        jsonb_build_object(
          'lead_intake_id', v_intake_id,
          'telegram_chat_id', p_metadata->>'telegram_chat_id',
          'telegram_username', p_metadata->>'telegram_username'
        )
      )
      RETURNING id INTO v_thread_id;
    END IF;

    INSERT INTO public.inbox_messages(workspace_id, thread_id, direction, provider, external_message_id, content, metadata)
    VALUES (
      p_workspace_id,
      v_thread_id,
      'inbound',
      CASE WHEN p_channel = 'telegram' THEN 'telegram' ELSE 'j10_lead_intake' END,
      v_msg_external_id,
      coalesce(NULLIF(trim(p_message), ''), 'Lead intake received.'),
      jsonb_build_object(
        'lead_intake_id', v_intake_id,
        'telegram_chat_id', p_metadata->>'telegram_chat_id',
        'telegram_message_id', p_source_event_id
      )
    )
    RETURNING id INTO v_message_id;

    UPDATE public.lead_intakes
       SET thread_id = v_thread_id, message_id = v_message_id
     WHERE id = v_intake_id;
  END IF;

  FOR v_consent IN SELECT value FROM jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) LOOP
    INSERT INTO public.lead_intake_consents(workspace_id, intake_id, status, communication_channel, purpose, disclosure_version, captured_at, capture_source)
    VALUES (
      p_workspace_id,
      v_intake_id,
      v_consent->>'status',
      v_consent->>'communication_channel',
      v_consent->>'purpose',
      v_consent->>'disclosure_version',
      coalesce((v_consent->>'captured_at')::timestamptz, now()),
      v_consent->>'capture_source'
    );
  END LOOP;

  INSERT INTO public.lead_event_outbox(workspace_id, intake_id, canonical_event_id)
  VALUES (p_workspace_id, v_intake_id, 'lead.received:' || v_intake_id::text);

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'intake_id', v_intake_id,
    'contact_id', v_contact_id,
    'resolution_status', v_status,
    'canonical_event_id', 'lead.received:' || v_intake_id::text
  );
END; $$;

REVOKE ALL ON FUNCTION public.record_lead_intake(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_lead_intake(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb, text, jsonb) TO service_role;

COMMIT;
