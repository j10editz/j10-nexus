-- ============================================================================
-- J10 NEXUS: WhatsApp AI Worker pg_cron + pg_net Background Reconciliation
-- Migration: 20261006_whatsapp_ai_cron_reconciliation.sql
--
-- Purpose:
-- Provides an every-minute background safety net to process pending, stale,
-- or reclaimed WhatsApp AI jobs via Supabase pg_cron + pg_net.
--
-- Architecture:
-- 1. Asynchronously invokes /api/workers/whatsapp-ai every minute via net.http_post.
-- 2. Dynamically reads app.settings.app_url and app.settings.whatsapp_worker_secret
--    from database configuration / Vault. Never hardcodes URLs, tokens, or secrets.
-- 3. Idempotently removes any existing 'whatsapp-ai-worker-reconciliation' job before rescheduling.
-- 4. Enforces SECURITY DEFINER, strict search_path, and service_role-only execution privileges.
-- ============================================================================

-- 1. Enable required network and scheduling extensions if supported
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Dedicated secure worker invocation function via pg_net
CREATE OR REPLACE FUNCTION public.trigger_whatsapp_ai_worker_cron(
  p_app_url TEXT DEFAULT NULL,
  p_worker_secret TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_request_id BIGINT;
BEGIN
  -- Resolve application URL and dedicated worker secret securely from database config
  v_url := COALESCE(p_app_url, current_setting('app.settings.app_url', true), 'http://localhost:3000');
  v_secret := COALESCE(
    p_worker_secret,
    current_setting('app.settings.whatsapp_worker_secret', true),
    current_setting('app.settings.telegram_worker_secret', true),
    ''
  );

  -- Invariant: Reject invocation without configured worker secret
  IF v_secret = '' THEN
    RAISE WARNING 'trigger_whatsapp_ai_worker_cron: WHATSAPP_WORKER_SECRET is not configured. Skipping reconciliation call.';
    RETURN NULL;
  END IF;

  -- Issue asynchronous non-blocking HTTP POST via pg_net
  SELECT net.http_post(
    url := v_url || '/api/workers/whatsapp-ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) INTO v_request_id;

  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_whatsapp_ai_worker_cron failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_whatsapp_ai_worker_cron(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_whatsapp_ai_worker_cron(TEXT, TEXT) TO service_role;

-- 3. Register every-minute cron reconciliation job if pg_cron is active in this database
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing job if already registered to guarantee idempotency
    PERFORM cron.unschedule('whatsapp-ai-worker-reconciliation')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-ai-worker-reconciliation');

    -- Schedule every minute: * * * * *
    PERFORM cron.schedule(
      'whatsapp-ai-worker-reconciliation',
      '* * * * *',
      'SELECT public.trigger_whatsapp_ai_worker_cron();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped or not supported in this database: %', SQLERRM;
END;
$$;
