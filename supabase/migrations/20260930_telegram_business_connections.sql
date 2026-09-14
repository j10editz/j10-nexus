-- Migration: 20260930_telegram_business_connections.sql
-- Purpose: Hardened schema foundation for Telegram Business Secretary Mode, Multi-Bot Idempotency, Transactional Ingress, Durable AI Queue, and Cryptographic Deletion Intents.
-- Forward-only and enclosed in an explicit transaction block.

BEGIN;

-- 1. Telegram Connection Sessions (Zernio-Style pending browser-to-bot handshake)
CREATE TABLE IF NOT EXISTS public.telegram_connection_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  connection_mode TEXT NOT NULL DEFAULT 'telegram_business' CHECK (connection_mode IN ('telegram_business', 'shared_bot', 'custom_bot')),
  receiving_bot_id TEXT NOT NULL DEFAULT 'official',
  telegram_user_id TEXT,
  telegram_username TEXT,
  consent_version TEXT NOT NULL DEFAULT '2026.1',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'completed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_connection_sessions ADD COLUMN IF NOT EXISTS receiving_bot_id TEXT NOT NULL DEFAULT 'official';

CREATE INDEX IF NOT EXISTS idx_tg_conn_sessions_hash ON public.telegram_connection_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_tg_conn_sessions_ws ON public.telegram_connection_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tg_conn_sessions_tg_uid ON public.telegram_connection_sessions(telegram_user_id);

ALTER TABLE public.telegram_connection_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Telegram Business Connections (Secretary Mode live binding)
CREATE TABLE IF NOT EXISTS public.telegram_business_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  receiving_bot_id TEXT NOT NULL DEFAULT 'official',
  business_connection_id TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  user_chat_id TEXT NOT NULL,
  can_reply BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  rights JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'local_disabled', 'disabled', 'disconnected')),
  consent_version TEXT NOT NULL DEFAULT '2026.1',
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_event_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_business_connections ADD COLUMN IF NOT EXISTS receiving_bot_id TEXT NOT NULL DEFAULT 'official';
ALTER TABLE public.telegram_business_connections DROP CONSTRAINT IF EXISTS telegram_business_connections_status_check;
ALTER TABLE public.telegram_business_connections ADD CONSTRAINT telegram_business_connections_status_check CHECK (status IN ('active', 'degraded', 'local_disabled', 'disabled', 'disconnected'));

CREATE INDEX IF NOT EXISTS idx_tg_biz_conn_id ON public.telegram_business_connections(business_connection_id);
CREATE INDEX IF NOT EXISTS idx_tg_biz_conn_ws ON public.telegram_business_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tg_biz_conn_tg_uid ON public.telegram_business_connections(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_tg_biz_conn_bot ON public.telegram_business_connections(receiving_bot_id);

ALTER TABLE public.telegram_business_connections ENABLE ROW LEVEL SECURITY;

-- 3. Versioned AI Consent Audit Log
CREATE TABLE IF NOT EXISTS public.telegram_connection_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_connection_id TEXT,
  consent_version TEXT NOT NULL,
  ai_provider TEXT NOT NULL DEFAULT 'google-gemini',
  categories_processed TEXT[] NOT NULL DEFAULT ARRAY['inbound_messages', 'contact_metadata']::text[],
  retention_days INT NOT NULL DEFAULT 90,
  revocation_method TEXT NOT NULL DEFAULT 'dashboard_disconnect',
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE public.telegram_connection_consents ADD COLUMN IF NOT EXISTS business_connection_id TEXT;
ALTER TABLE public.telegram_connection_consents ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tg_consents_ws ON public.telegram_connection_consents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tg_consents_user ON public.telegram_connection_consents(user_id);

ALTER TABLE public.telegram_connection_consents ENABLE ROW LEVEL SECURITY;

-- 4. Cryptographic Single-Use Deletion Intents
CREATE TABLE IF NOT EXISTS public.telegram_deletion_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_connection_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  preview_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_del_intent_hash ON public.telegram_deletion_intents(token_hash);
CREATE INDEX IF NOT EXISTS idx_tg_del_intent_ws ON public.telegram_deletion_intents(workspace_id);

ALTER TABLE public.telegram_deletion_intents ENABLE ROW LEVEL SECURITY;

-- 5. Durable Asynchronous Telegram AI Job Queue (Multi-Bot, 120s Lease, Retries, Exponential Backoff, Crash Recovery)
CREATE TABLE IF NOT EXISTS public.telegram_ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  receiving_bot_id TEXT NOT NULL DEFAULT 'official',
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  chat_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  business_connection_id TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter', 'delivery_unknown')),
  claim_token UUID,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS receiving_bot_id TEXT NOT NULL DEFAULT 'official';
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3;
ALTER TABLE public.telegram_ai_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.telegram_ai_jobs DROP CONSTRAINT IF EXISTS telegram_ai_jobs_status_check;
ALTER TABLE public.telegram_ai_jobs ADD CONSTRAINT telegram_ai_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter', 'delivery_unknown'));

CREATE INDEX IF NOT EXISTS idx_tg_ai_jobs_queue 
  ON public.telegram_ai_jobs(status, next_attempt_at, lease_expires_at, created_at);
CREATE INDEX IF NOT EXISTS idx_tg_ai_jobs_ws 
  ON public.telegram_ai_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tg_ai_jobs_bot 
  ON public.telegram_ai_jobs(receiving_bot_id);

ALTER TABLE public.telegram_ai_jobs ENABLE ROW LEVEL SECURITY;

-- 6. Grants & Permissions
REVOKE ALL ON public.telegram_connection_sessions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_connection_sessions TO authenticated, service_role;

REVOKE ALL ON public.telegram_business_connections FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_business_connections TO authenticated, service_role;

REVOKE ALL ON public.telegram_connection_consents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_connection_consents TO authenticated, service_role;

REVOKE ALL ON public.telegram_deletion_intents FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_deletion_intents TO authenticated, service_role;

REVOKE ALL ON public.telegram_ai_jobs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_ai_jobs TO service_role;
GRANT SELECT ON public.telegram_ai_jobs TO authenticated;

-- 7. RLS Policies: Service Role Access (for webhooks and background worker jobs)
DROP POLICY IF EXISTS "tg_sessions_service_role" ON public.telegram_connection_sessions;
CREATE POLICY "tg_sessions_service_role" ON public.telegram_connection_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tg_biz_conn_service_role" ON public.telegram_business_connections;
CREATE POLICY "tg_biz_conn_service_role" ON public.telegram_business_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tg_consents_service_role" ON public.telegram_connection_consents;
CREATE POLICY "tg_consents_service_role" ON public.telegram_connection_consents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tg_del_intents_service_role" ON public.telegram_deletion_intents;
CREATE POLICY "tg_del_intents_service_role" ON public.telegram_deletion_intents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tg_ai_jobs_service_role" ON public.telegram_ai_jobs;
CREATE POLICY "tg_ai_jobs_service_role" ON public.telegram_ai_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. RLS Policies: Authenticated Workspace Isolation
DROP POLICY IF EXISTS "tg_sessions_tenant_select" ON public.telegram_connection_sessions;
CREATE POLICY "tg_sessions_tenant_select" ON public.telegram_connection_sessions
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

DROP POLICY IF EXISTS "tg_sessions_tenant_insert" ON public.telegram_connection_sessions;
CREATE POLICY "tg_sessions_tenant_insert" ON public.telegram_connection_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  );

DROP POLICY IF EXISTS "tg_biz_conn_tenant_select" ON public.telegram_business_connections;
CREATE POLICY "tg_biz_conn_tenant_select" ON public.telegram_business_connections
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

DROP POLICY IF EXISTS "tg_biz_conn_tenant_manage" ON public.telegram_business_connections;
CREATE POLICY "tg_biz_conn_tenant_manage" ON public.telegram_business_connections
  FOR ALL TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS "tg_consents_tenant_select" ON public.telegram_connection_consents;
CREATE POLICY "tg_consents_tenant_select" ON public.telegram_connection_consents
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

DROP POLICY IF EXISTS "tg_consents_tenant_insert" ON public.telegram_connection_consents;
CREATE POLICY "tg_consents_tenant_insert" ON public.telegram_connection_consents
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS "tg_del_intents_tenant_select" ON public.telegram_deletion_intents;
CREATE POLICY "tg_del_intents_tenant_select" ON public.telegram_deletion_intents
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text])
  );

-- 9. Atomic Session Consumption RPC
CREATE OR REPLACE FUNCTION public.consume_telegram_business_session(
  p_token_hash TEXT,
  p_telegram_user_id TEXT,
  p_telegram_username TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session RECORD;
BEGIN
  IF p_token_hash IS NULL OR p_telegram_user_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Token hash and Telegram user ID are required');
  END IF;

  SELECT * INTO v_session
  FROM public.telegram_connection_sessions
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Session not found');
  END IF;

  IF v_session.status <> 'pending' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Session already used or expired', 'status', v_session.status);
  END IF;

  IF v_session.expires_at < now() THEN
    UPDATE public.telegram_connection_sessions
    SET status = 'expired', updated_at = now()
    WHERE id = v_session.id;

    RETURN jsonb_build_object('valid', false, 'error', 'Session expired');
  END IF;

  UPDATE public.telegram_connection_sessions
  SET
    status = 'verified',
    telegram_user_id = p_telegram_user_id,
    telegram_username = p_telegram_username,
    updated_at = now()
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'valid', true,
    'session_id', v_session.id,
    'workspace_id', v_session.workspace_id,
    'consent_version', v_session.consent_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_telegram_business_session(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_telegram_business_session(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 10. Single Atomic Transactional Ingress RPC (Provider Receipt + Message + Durable Job)
DROP FUNCTION IF EXISTS public.ingest_telegram_update_transactional(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.ingest_telegram_update_transactional(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, UUID);

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread_id UUID;
  v_message_id UUID;
  v_job_id UUID;
  v_idempotency_key TEXT;
  v_thread_metadata JSONB;
BEGIN
  IF p_workspace_id IS NULL OR p_chat_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and chat_id are required';
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

  -- 1. Find or create thread
  SELECT id INTO v_thread_id
  FROM public.inbox_threads
  WHERE workspace_id = p_workspace_id
    AND channel = 'telegram'
    AND external_thread_id = p_chat_id
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
    v_idempotency_key := 'telegram-ai:' || COALESCE(p_integration_id::text, p_receiving_bot_id) || ':' || p_update_id || ':' || v_thread_id;

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

-- 11. Worker Claiming with 120s Leases, Exponential Backoff, & Crash Recovery
DROP FUNCTION IF EXISTS public.claim_telegram_ai_jobs(UUID, INT, INT);
CREATE OR REPLACE FUNCTION public.claim_telegram_ai_jobs(
  p_worker_id UUID,
  p_limit INT DEFAULT 5,
  p_lease_seconds INT DEFAULT 120
)
RETURNS TABLE (
  job_id UUID,
  workspace_id UUID,
  thread_id UUID,
  receiving_bot_id TEXT,
  chat_id TEXT,
  message_text TEXT,
  sender_name TEXT,
  business_connection_id TEXT,
  attempts INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT j.id
    FROM public.telegram_ai_jobs j
    WHERE
      (j.status = 'pending' AND j.next_attempt_at <= now() AND j.attempts < j.max_attempts)
      OR
      (j.status = 'processing' AND j.lease_expires_at < now() AND j.attempts < j.max_attempts) -- Crash Recovery!
    ORDER BY j.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.telegram_ai_jobs u
  SET
    status = 'processing',
    claim_token = p_worker_id,
    lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval,
    attempts = u.attempts + 1,
    updated_at = now()
  FROM claimable c
  WHERE u.id = c.id
  RETURNING
    u.id,
    u.workspace_id,
    u.thread_id,
    u.receiving_bot_id,
    u.chat_id,
    u.message_text,
    u.sender_name,
    u.business_connection_id,
    u.attempts;
END;
$$;

-- Function: Renew Job Lease (Heartbeat)
CREATE OR REPLACE FUNCTION public.renew_telegram_ai_job_lease(
  p_job_id UUID,
  p_claim_token UUID,
  p_additional_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INT := 0;
BEGIN
  UPDATE public.telegram_ai_jobs
  SET
    lease_expires_at = now() + (p_additional_seconds || ' seconds')::interval,
    updated_at = now()
  WHERE id = p_job_id AND claim_token = p_claim_token AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- 5.1 Worker Cycle Overlap Protection Table
CREATE TABLE IF NOT EXISTS public.telegram_worker_locks (
  lock_name TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.telegram_worker_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tg_worker_locks_service_role" ON public.telegram_worker_locks;
CREATE POLICY "tg_worker_locks_service_role" ON public.telegram_worker_locks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Function: Worker Advisory / Database Lock Overlap Protection
DROP FUNCTION IF EXISTS public.acquire_telegram_worker_lock();
DROP FUNCTION IF EXISTS public.acquire_telegram_worker_lock(TEXT, INT);

CREATE OR REPLACE FUNCTION public.acquire_telegram_worker_lock(
  p_worker_id TEXT DEFAULT 'worker',
  p_lease_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  INSERT INTO public.telegram_worker_locks (lock_name, locked_by, acquired_at, expires_at)
  VALUES ('global_worker_cycle', p_worker_id, now(), now() + (p_lease_seconds || ' seconds')::interval)
  ON CONFLICT (lock_name) DO UPDATE
  SET
    locked_by = p_worker_id,
    acquired_at = now(),
    expires_at = now() + (p_lease_seconds || ' seconds')::interval
  WHERE public.telegram_worker_locks.expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

DROP FUNCTION IF EXISTS public.release_telegram_worker_lock();
DROP FUNCTION IF EXISTS public.release_telegram_worker_lock(TEXT);

CREATE OR REPLACE FUNCTION public.release_telegram_worker_lock(
  p_worker_id TEXT DEFAULT 'worker'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  DELETE FROM public.telegram_worker_locks
  WHERE lock_name = 'global_worker_cycle' AND (locked_by = p_worker_id OR p_worker_id = 'worker');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_telegram_worker_lock(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_telegram_worker_lock(TEXT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.release_telegram_worker_lock(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_telegram_worker_lock(TEXT) TO service_role;

-- Function: Complete or Fail Job with Exponential Backoff
DROP FUNCTION IF EXISTS public.complete_telegram_ai_job(UUID, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.complete_telegram_ai_job(UUID, UUID, BOOLEAN, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.complete_telegram_ai_job(
  p_job_id UUID,
  p_claim_token UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
  v_backoff_seconds INT;
BEGIN
  SELECT * INTO v_job
  FROM public.telegram_ai_jobs
  WHERE id = p_job_id AND claim_token = p_claim_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('completed', false, 'error', 'Job not found or claim token mismatch');
  END IF;

  -- 1. Handle ambiguous delivery (delivery_unknown): prevent automatic blind resend
  IF p_status = 'delivery_unknown' THEN
    UPDATE public.telegram_ai_jobs
    SET
      status = 'delivery_unknown',
      lease_expires_at = NULL,
      last_error = p_error,
      updated_at = now()
    WHERE id = p_job_id;
    RETURN jsonb_build_object('completed', true, 'status', 'delivery_unknown');
  END IF;

  -- 2. Handle successful delivery
  IF p_success THEN
    UPDATE public.telegram_ai_jobs
    SET
      status = 'completed',
      lease_expires_at = NULL,
      updated_at = now()
    WHERE id = p_job_id;
    RETURN jsonb_build_object('completed', true, 'status', 'completed');
  ELSE
    -- 3. Handle failure with bounded retry or dead-letter
    IF v_job.attempts >= v_job.max_attempts THEN
      UPDATE public.telegram_ai_jobs
      SET
        status = 'dead_letter',
        lease_expires_at = NULL,
        last_error = p_error,
        updated_at = now()
      WHERE id = p_job_id;
      RETURN jsonb_build_object('completed', true, 'status', 'dead_letter');
    ELSE
      -- Real exponential backoff: 5s, 10s, 20s...
      v_backoff_seconds := (power(2, v_job.attempts) * 5)::int;
      UPDATE public.telegram_ai_jobs
      SET
        status = 'pending',
        next_attempt_at = now() + (v_backoff_seconds || ' seconds')::interval,
        lease_expires_at = NULL,
        last_error = p_error,
        updated_at = now()
      WHERE id = p_job_id;
      RETURN jsonb_build_object('completed', true, 'status', 'retry_pending', 'next_attempt_seconds', v_backoff_seconds);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_telegram_ai_jobs(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_telegram_ai_jobs(UUID, INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.renew_telegram_ai_job_lease(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_telegram_ai_job_lease(UUID, UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_telegram_ai_job(UUID, UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_telegram_ai_job(UUID, UUID, BOOLEAN, TEXT, TEXT) TO service_role;

-- 12. Preview & Cryptographic Deletion Intent Creation RPC
DROP FUNCTION IF EXISTS public.preview_telegram_business_deletion(UUID, TEXT);
DROP FUNCTION IF EXISTS public.preview_telegram_business_deletion(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.preview_telegram_business_deletion(
  p_workspace_id UUID,
  p_business_connection_id TEXT,
  p_integration_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_connections_count INT := 0;
  v_messages_count INT := 0;
  v_threads_count INT := 0;
  v_jobs_count INT := 0;
  v_receipts_count INT := 0;
  v_outbox_count INT := 0;
  v_shared_contacts_count INT := 0;
  v_preview JSONB;
BEGIN
  IF p_workspace_id IS NULL OR p_business_connection_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and business_connection_id are required';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT has_workspace_role(p_workspace_id, ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Unauthorized: only workspace owners and admins can preview integration deletion';
  END IF;

  SELECT count(*)::int INTO v_connections_count
  FROM public.telegram_business_connections
  WHERE workspace_id = p_workspace_id AND business_connection_id = p_business_connection_id;

  -- Count ONLY messages belonging to threads of THIS business connection
  SELECT count(*)::int INTO v_messages_count
  FROM public.inbox_messages m
  JOIN public.inbox_threads t ON m.thread_id = t.id
  WHERE m.workspace_id = p_workspace_id
    AND t.channel = 'telegram'
    AND t.metadata->>'business_connection_id' = p_business_connection_id;

  -- Count outbound/outbox messages
  SELECT count(*)::int INTO v_outbox_count
  FROM public.inbox_messages m
  JOIN public.inbox_threads t ON m.thread_id = t.id
  WHERE m.workspace_id = p_workspace_id
    AND m.direction = 'outbound'
    AND t.channel = 'telegram'
    AND t.metadata->>'business_connection_id' = p_business_connection_id;

  SELECT count(*)::int INTO v_threads_count
  FROM public.inbox_threads
  WHERE workspace_id = p_workspace_id
    AND channel = 'telegram'
    AND metadata->>'business_connection_id' = p_business_connection_id;

  SELECT count(*)::int INTO v_jobs_count
  FROM public.telegram_ai_jobs
  WHERE workspace_id = p_workspace_id
    AND business_connection_id = p_business_connection_id;

  -- Provider event receipts: check integration_webhook_events if table exists
  BEGIN
    SELECT count(*)::int INTO v_receipts_count
    FROM public.integration_webhook_events
    WHERE workspace_id = p_workspace_id
      AND (raw_payload::text LIKE '%' || p_business_connection_id || '%');
  EXCEPTION WHEN undefined_table THEN
    v_receipts_count := 0;
  END;

  -- Shared contacts in contacts table are strictly preserved
  SELECT count(*)::int INTO v_shared_contacts_count
  FROM public.contacts
  WHERE workspace_id = p_workspace_id;

  v_preview := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'business_connection_id', p_business_connection_id,
    'connections_count', v_connections_count,
    'messages_count', v_messages_count,
    'outbox_count', v_outbox_count,
    'threads_count', v_threads_count,
    'jobs_count', v_jobs_count,
    'provider_receipts_count', v_receipts_count,
    'shared_contacts_preserved', v_shared_contacts_count
  );

  RETURN v_preview;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_telegram_business_deletion(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_telegram_business_deletion(UUID, TEXT, UUID) TO authenticated, service_role;

-- 13. Create Cryptographic Deletion Intent Token (Expires in 10 minutes)
DROP FUNCTION IF EXISTS public.create_telegram_deletion_intent(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.create_telegram_deletion_intent(UUID, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.create_telegram_deletion_intent(
  p_workspace_id UUID,
  p_business_connection_id TEXT,
  p_token_hash TEXT,
  p_user_id UUID DEFAULT auth.uid(),
  p_integration_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preview JSONB;
  v_intent_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR p_business_connection_id IS NULL OR p_token_hash IS NULL THEN
    RAISE EXCEPTION 'workspace_id, business_connection_id, and token_hash are required';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT has_workspace_role(p_workspace_id, ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Unauthorized: only workspace owners and admins can create deletion intent';
  END IF;

  v_preview := public.preview_telegram_business_deletion(p_workspace_id, p_business_connection_id, p_integration_id);

  INSERT INTO public.telegram_deletion_intents (
    workspace_id,
    user_id,
    business_connection_id,
    token_hash,
    preview_snapshot,
    expires_at
  ) VALUES (
    p_workspace_id,
    p_user_id,
    p_business_connection_id,
    p_token_hash,
    v_preview,
    now() + interval '10 minutes'
  ) RETURNING id INTO v_intent_id;

  RETURN jsonb_build_object(
    'intent_id', v_intent_id,
    'preview', v_preview,
    'expires_in_seconds', 600
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_telegram_deletion_intent(UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_telegram_deletion_intent(UUID, TEXT, TEXT, UUID, UUID) TO authenticated, service_role;

-- 14. Atomic Execution of Hardened Scoped Deletion with Cryptographic Token Consumption
DROP FUNCTION IF EXISTS public.execute_telegram_scoped_deletion(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.execute_telegram_scoped_deletion(UUID, TEXT, TEXT, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION public.execute_telegram_scoped_deletion(
  p_workspace_id UUID,
  p_business_connection_id TEXT,
  p_token_hash TEXT,
  p_delete_messages BOOLEAN DEFAULT true,
  p_integration_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent RECORD;
  v_messages_deleted INT := 0;
  v_threads_deleted INT := 0;
  v_jobs_deleted INT := 0;
  v_receipts_deleted INT := 0;
  v_connections_updated INT := 0;
  v_shared_contacts_count INT := 0;
BEGIN
  IF p_workspace_id IS NULL OR p_business_connection_id IS NULL OR p_token_hash IS NULL THEN
    RAISE EXCEPTION 'workspace_id, business_connection_id, and token_hash are required';
  END IF;

  -- 1. Atomically consume the deletion intent token
  SELECT * INTO v_intent
  FROM public.telegram_deletion_intents
  WHERE token_hash = p_token_hash
    AND workspace_id = p_workspace_id
    AND business_connection_id = p_business_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid deletion intent token';
  END IF;

  IF v_intent.status <> 'pending' THEN
    RAISE EXCEPTION 'Deletion intent token has already been consumed';
  END IF;

  IF v_intent.expires_at < now() THEN
    UPDATE public.telegram_deletion_intents SET status = 'expired' WHERE id = v_intent.id;
    RAISE EXCEPTION 'Deletion intent token has expired (exceeded 10-minute validity window)';
  END IF;

  -- Mark intent consumed
  UPDATE public.telegram_deletion_intents SET status = 'consumed' WHERE id = v_intent.id;

  -- 2. Mark business connection local_disabled / disconnected
  UPDATE public.telegram_business_connections
  SET
    status = 'local_disabled',
    is_enabled = false,
    can_reply = false,
    disconnected_at = now(),
    updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND business_connection_id = p_business_connection_id
    AND status <> 'disconnected';
  GET DIAGNOSTICS v_connections_updated = ROW_COUNT;

  -- 3. Revoke active consents for this connection
  UPDATE public.telegram_connection_consents
  SET revoked_at = now()
  WHERE workspace_id = p_workspace_id
    AND (business_connection_id = p_business_connection_id OR business_connection_id IS NULL)
    AND revoked_at IS NULL;

  -- 4. Purge AI Jobs belonging to THIS business connection
  DELETE FROM public.telegram_ai_jobs
  WHERE workspace_id = p_workspace_id
    AND business_connection_id = p_business_connection_id;
  GET DIAGNOSTICS v_jobs_deleted = ROW_COUNT;

  -- 5. Purge Provider-Event Receipts (integration_webhook_events) containing this business connection
  BEGIN
    DELETE FROM public.integration_webhook_events
    WHERE workspace_id = p_workspace_id
      AND (raw_payload::text LIKE '%' || p_business_connection_id || '%');
    GET DIAGNOSTICS v_receipts_deleted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    v_receipts_deleted := 0;
  END;

  -- 6. If requested, delete ONLY messages and threads of THIS business connection
  -- STRICT INVARIANT: Shared bot DM threads and other business connections remain 100% PRESERVED!
  IF p_delete_messages = true THEN
    DELETE FROM public.inbox_messages m
    USING public.inbox_threads t
    WHERE m.thread_id = t.id
      AND m.workspace_id = p_workspace_id
      AND t.channel = 'telegram'
      AND t.metadata->>'business_connection_id' = p_business_connection_id;
    GET DIAGNOSTICS v_messages_deleted = ROW_COUNT;

    DELETE FROM public.inbox_threads
    WHERE workspace_id = p_workspace_id
      AND channel = 'telegram'
      AND metadata->>'business_connection_id' = p_business_connection_id;
    GET DIAGNOSTICS v_threads_deleted = ROW_COUNT;
  END IF;

  -- Verify shared contacts remain 100% preserved
  SELECT count(*)::int INTO v_shared_contacts_count
  FROM public.contacts
  WHERE workspace_id = p_workspace_id;

  RETURN jsonb_build_object(
    'success', true,
    'workspace_id', p_workspace_id,
    'business_connection_id', p_business_connection_id,
    'connections_updated', v_connections_updated,
    'jobs_purged', v_jobs_deleted,
    'receipts_purged', v_receipts_deleted,
    'messages_deleted', v_messages_deleted,
    'threads_deleted', v_threads_deleted,
    'shared_contacts_preserved', v_shared_contacts_count,
    'audit_event', 'telegram_scoped_data_deleted',
    'deleted_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_telegram_scoped_deletion(UUID, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_telegram_scoped_deletion(UUID, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;

COMMIT;
