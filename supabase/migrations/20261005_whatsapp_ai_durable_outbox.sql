-- ============================================================================
-- J10 NEXUS: WhatsApp AI Durable Outbox & Atomic Claim Queue
-- Migration: 20261005_whatsapp_ai_durable_outbox.sql
--
-- Description:
-- Provides a crash-resilient, transactional outbox queue for WhatsApp AI responses.
-- Features:
-- 1. Strict idempotency key unique constraint: whatsapp-ai:<workspace_id>:<inbound_wamid>
-- 2. Status lifecycle: 'pending', 'processing', 'completed', 'retryable', 'dead'
-- 3. Atomic claim with FOR UPDATE SKIP LOCKED and lease expiration recovery (crash proof)
-- 4. Exponential backoff retry calculations and dead-letter classification
-- 5. Row-level security and service-role execution grants
-- ============================================================================

-- 1. Create whatsapp_ai_jobs queue table
CREATE TABLE IF NOT EXISTS public.whatsapp_ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  inbound_text TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT 'WhatsApp User',
  inbound_wamid TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'retryable', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  claim_token UUID,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  outbound_wamid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create indices for performant queue polling and tenant isolation
CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_jobs_queue
  ON public.whatsapp_ai_jobs(status, next_attempt_at, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_jobs_workspace
  ON public.whatsapp_ai_jobs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_ai_jobs_idempotency
  ON public.whatsapp_ai_jobs(idempotency_key);

-- 3. Row Level Security
ALTER TABLE public.whatsapp_ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_ai_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_ai_jobs_service_role" ON public.whatsapp_ai_jobs;
CREATE POLICY "wa_ai_jobs_service_role" ON public.whatsapp_ai_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "wa_ai_jobs_tenant_select" ON public.whatsapp_ai_jobs;
CREATE POLICY "wa_ai_jobs_tenant_select" ON public.whatsapp_ai_jobs
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

REVOKE ALL ON public.whatsapp_ai_jobs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_ai_jobs TO service_role;
GRANT SELECT ON public.whatsapp_ai_jobs TO authenticated;

-- 4. Atomic Claim Function with Lease Expiration Recovery
DROP FUNCTION IF EXISTS public.claim_whatsapp_ai_jobs(UUID, INT, INT);
CREATE OR REPLACE FUNCTION public.claim_whatsapp_ai_jobs(
  p_worker_id UUID,
  p_limit INT DEFAULT 3,
  p_lease_seconds INT DEFAULT 120
)
RETURNS TABLE (
  job_id UUID,
  workspace_id UUID,
  integration_id UUID,
  thread_id UUID,
  recipient_phone TEXT,
  inbound_text TEXT,
  sender_name TEXT,
  inbound_wamid TEXT,
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
    FROM public.whatsapp_ai_jobs j
    WHERE
      (j.status IN ('pending', 'retryable') AND j.next_attempt_at <= now() AND j.attempts < j.max_attempts)
      OR
      (j.status = 'processing' AND j.lease_expires_at < now() AND j.attempts < j.max_attempts) -- Crash Recovery!
    ORDER BY j.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_ai_jobs u
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
    u.integration_id,
    u.thread_id,
    u.recipient_phone,
    u.inbound_text,
    u.sender_name,
    u.inbound_wamid,
    u.attempts;
END;
$$;

-- 5. Complete Job Function
DROP FUNCTION IF EXISTS public.complete_whatsapp_ai_job(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.complete_whatsapp_ai_job(
  p_job_id UUID,
  p_claim_token UUID,
  p_outbound_wamid TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INT := 0;
BEGIN
  UPDATE public.whatsapp_ai_jobs
  SET
    status = 'completed',
    outbound_wamid = COALESCE(p_outbound_wamid, outbound_wamid),
    claim_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  WHERE id = p_job_id
    AND (claim_token = p_claim_token OR claim_token IS NULL);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- 6. Fail Job Function (Exponential Backoff & Dead-Letter)
DROP FUNCTION IF EXISTS public.fail_whatsapp_ai_job(UUID, UUID, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.fail_whatsapp_ai_job(
  p_job_id UUID,
  p_claim_token UUID,
  p_error TEXT,
  p_retryable BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
  v_next_status TEXT;
  v_backoff_seconds INT;
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

  IF p_retryable AND v_job.attempts < v_job.max_attempts THEN
    v_next_status := 'retryable';
    v_backoff_seconds := LEAST(300, (power(2, v_job.attempts)::INT * 15));
  ELSE
    v_next_status := 'dead';
    v_backoff_seconds := 0;
  END IF;

  UPDATE public.whatsapp_ai_jobs
  SET
    status = v_next_status,
    last_error = p_error,
    claim_token = NULL,
    lease_expires_at = NULL,
    next_attempt_at = now() + (v_backoff_seconds || ' seconds')::interval,
    updated_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_next_status,
    'attempts', v_job.attempts,
    'next_attempt_in_seconds', v_backoff_seconds
  );
END;
$$;

-- 7. Privileges
REVOKE ALL ON FUNCTION public.claim_whatsapp_ai_jobs(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_ai_jobs(UUID, INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_whatsapp_ai_job(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_ai_job(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.fail_whatsapp_ai_job(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_whatsapp_ai_job(UUID, UUID, TEXT, BOOLEAN) TO service_role;
