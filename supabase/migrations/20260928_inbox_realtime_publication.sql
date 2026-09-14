-- Migration: 20260928_inbox_realtime_publication.sql
-- Purpose: Idempotently register inbox_messages and inbox_threads in supabase_realtime publication with full replica identity
-- Enclosed in transaction block. Safe when tables are already members of publication.

BEGIN;

DO $$
BEGIN
  -- 1. Add inbox_messages to supabase_realtime publication only if absent
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'inbox_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
  END IF;

  -- 2. Add inbox_threads to supabase_realtime publication only if absent
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'inbox_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_threads;
  END IF;
END $$;

-- 3. Set REPLICA IDENTITY FULL for comprehensive realtime change notifications
ALTER TABLE public.inbox_messages REPLICA IDENTITY FULL;
ALTER TABLE public.inbox_threads REPLICA IDENTITY FULL;

COMMIT;
