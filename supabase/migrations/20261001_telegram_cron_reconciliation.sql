-- Migration: 20261001_telegram_cron_reconciliation.sql
-- Purpose: Supabase pg_cron + pg_net background reconciliation for Telegram AI Worker.
-- Provides an every-minute background safety net to process pending or stale/reclaimed jobs.
-- Applied only to disposable/staging Supabase during certification.

-- 1. Enable required network and scheduling extensions if supported
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Dedicated secure worker invocation function via pg_net
CREATE OR REPLACE FUNCTION public.trigger_telegram_ai_worker_cron(
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
  -- Resolve application URL and dedicated worker secret securely
  v_url := COALESCE(p_app_url, current_setting('app.settings.app_url', true), 'http://localhost:3000');
  v_secret := COALESCE(p_worker_secret, current_setting('app.settings.telegram_worker_secret', true), '');

  -- Invariant: Reject invocation without configured worker secret
  IF v_secret = '' THEN
    RAISE WARNING 'trigger_telegram_ai_worker_cron: TELEGRAM_WORKER_SECRET is not configured. Skipping reconciliation call.';
    RETURN NULL;
  END IF;

  -- Issue asynchronous non-blocking HTTP POST via pg_net
  SELECT net.http_post(
    url := v_url || '/api/workers/telegram-ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) INTO v_request_id;

  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_telegram_ai_worker_cron failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_telegram_ai_worker_cron(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_telegram_ai_worker_cron(TEXT, TEXT) TO service_role;

-- 3. Register every-minute cron reconciliation job if pg_cron is active in this database
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing job if already registered to guarantee idempotency
    PERFORM cron.unschedule('telegram-ai-worker-reconciliation')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'telegram-ai-worker-reconciliation');

    -- Schedule every minute: * * * * *
    PERFORM cron.schedule(
      'telegram-ai-worker-reconciliation',
      '* * * * *',
      'SELECT public.trigger_telegram_ai_worker_cron();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped or not supported in this database: %', SQLERRM;
END;
$$;
