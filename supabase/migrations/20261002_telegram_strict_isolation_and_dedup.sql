-- Migration: 20261002_telegram_strict_isolation_and_dedup.sql
-- Purpose: Authoritative database-backed deduplication (receiving_bot_id + update_id) without thread_id in uniqueness boundary,
-- and strict scoped thread lookup.

BEGIN;

-- 1. Ensure telegram_ai_jobs idempotency_key is unique and does not include thread_id
CREATE OR REPLACE FUNCTION public.ingest_telegram_update_transactional(
  p_workspace_id UUID,
  p_receiving_bot_id TEXT,
  p_update_id BIGINT,
  p_chat_id TEXT,
  p_sender_id TEXT,
  p_sender_name TEXT,
  p_message_text TEXT,
  p_business_connection_id TEXT DEFAULT NULL,
  p_is_business_message BOOLEAN DEFAULT false,
  p_external_message_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_integration_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id UUID;
  v_message_id UUID;
  v_job_id UUID;
  v_idempotency_key TEXT;
  v_thread_metadata JSONB;
  v_existing_job RECORD;
BEGIN
  IF p_workspace_id IS NULL OR p_chat_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and chat_id are required';
  END IF;

  -- Authoritative receipt idempotency key strictly bounded by (receiving_bot_id, update_id)
  -- thread_id is deliberately excluded from the uniqueness boundary
  v_idempotency_key := 'telegram-ai:' || COALESCE(p_integration_id::text, p_receiving_bot_id, 'official') || ':' || p_update_id;

  -- 0. Check for existing receipt / job to prevent duplicate message or thread re-creation
  SELECT id, thread_id INTO v_existing_job
  FROM public.telegram_ai_jobs
  WHERE idempotency_key = v_idempotency_key
  LIMIT 1;

  IF v_existing_job.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'job_id', v_existing_job.id,
      'thread_id', v_existing_job.thread_id
    );
  END IF;

  v_thread_metadata := jsonb_build_object(
    'receiving_bot_id', p_receiving_bot_id,
    'is_business_message', p_is_business_message
  );
  IF p_integration_id IS NOT NULL THEN
    v_thread_metadata := v_thread_metadata || jsonb_build_object('integration_id', p_integration_id);
  END IF;
  IF p_business_connection_id IS NOT NULL THEN
    v_thread_metadata := v_thread_metadata || jsonb_build_object('business_connection_id', p_business_connection_id);
  END IF;

  -- 1. Find or create thread strictly scoped by workspace, channel, chat_id, AND receiving_bot_id / integration_id
  SELECT id INTO v_thread_id
  FROM public.inbox_threads
  WHERE workspace_id = p_workspace_id
    AND channel = 'telegram'
    AND external_thread_id = p_chat_id
    AND (
      metadata->>'receiving_bot_id' = p_receiving_bot_id
      OR (p_integration_id IS NOT NULL AND metadata->>'integration_id' = p_integration_id::text)
      OR (p_business_connection_id IS NOT NULL AND metadata->>'business_connection_id' = p_business_connection_id)
      OR metadata->>'receiving_bot_id' IS NULL
    )
  ORDER BY last_message_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.inbox_threads (
      workspace_id,
      channel,
      external_thread_id,
      metadata,
      last_message_at
    ) VALUES (
      p_workspace_id,
      'telegram',
      p_chat_id,
      v_thread_metadata,
      now()
    ) RETURNING id INTO v_thread_id;
  ELSE
    UPDATE public.inbox_threads
    SET
      last_message_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || v_thread_metadata
    WHERE id = v_thread_id;
  END IF;

  -- 2. Insert inbound inbox message
  INSERT INTO public.inbox_messages (
    workspace_id,
    thread_id,
    direction,
    provider,
    external_message_id,
    content,
    delivery_status,
    metadata
  ) VALUES (
    p_workspace_id,
    v_thread_id,
    'inbound',
    'telegram',
    p_external_message_id,
    COALESCE(p_message_text, ''),
    'delivered',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'update_id', p_update_id,
      'receiving_bot_id', p_receiving_bot_id,
      'integration_id', p_integration_id,
      'business_connection_id', p_business_connection_id
    )
  ) RETURNING id INTO v_message_id;

  -- 3. Enqueue durable AI Job atomically within the same transaction if text is present
  IF p_message_text IS NOT NULL AND length(trim(p_message_text)) > 0 THEN
    INSERT INTO public.telegram_ai_jobs (
      workspace_id,
      thread_id,
      receiving_bot_id,
      integration_id,
      chat_id,
      message_text,
      sender_name,
      business_connection_id,
      idempotency_key,
      status
    ) VALUES (
      p_workspace_id,
      v_thread_id,
      p_receiving_bot_id,
      p_integration_id,
      p_chat_id,
      p_message_text,
      COALESCE(p_sender_name, 'Telegram User'),
      p_business_connection_id,
      v_idempotency_key,
      'pending'
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'job_id', v_job_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_telegram_update_transactional(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_telegram_update_transactional(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, UUID) TO service_role;

COMMIT;
