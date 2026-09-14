-- Migration: 20260929_bot_configurations.sql
-- Purpose: Schema foundation for Multi-Tenant Client AI Receptionist & Business Knowledge Grounding
-- Enclosed in transaction block for safe, idempotent forward execution.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_details text NOT NULL DEFAULT '',
  business_hours text NOT NULL DEFAULT 'Mon-Fri 9:00 AM - 6:00 PM',
  faqs jsonb NOT NULL DEFAULT '[]'::jsonb,
  booking_link text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'professional' CHECK (tone IN ('professional', 'friendly', 'casual', 'luxury', 'direct')),
  supported_languages text[] NOT NULL DEFAULT ARRAY['English']::text[],
  escalation_instructions text NOT NULL DEFAULT 'Please type /human or leave your phone/email to speak directly with an executive specialist.',
  welcome_message text NOT NULL DEFAULT '',
  ai_enabled boolean NOT NULL DEFAULT true,
  privacy_policy_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bot_configurations_workspace UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_configurations_workspace_id 
  ON public.bot_configurations (workspace_id);

-- Enable Row Level Security
ALTER TABLE public.bot_configurations ENABLE ROW LEVEL SECURITY;

-- 1. Service role has unrestricted access (for webhooks and background AI processing)
DROP POLICY IF EXISTS "bot_configurations_service_role_all" ON public.bot_configurations;
CREATE POLICY "bot_configurations_service_role_all"
  ON public.bot_configurations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Authenticated users can read configuration if they belong to the workspace
DROP POLICY IF EXISTS "bot_configurations_tenant_select" ON public.bot_configurations;
CREATE POLICY "bot_configurations_tenant_select"
  ON public.bot_configurations
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NOT NULL 
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])
  );

-- 3. Authenticated owners and admins can insert or update configuration
DROP POLICY IF EXISTS "bot_configurations_tenant_insert" ON public.bot_configurations;
CREATE POLICY "bot_configurations_tenant_insert"
  ON public.bot_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IS NOT NULL 
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  );

DROP POLICY IF EXISTS "bot_configurations_tenant_update" ON public.bot_configurations;
CREATE POLICY "bot_configurations_tenant_update"
  ON public.bot_configurations
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IS NOT NULL 
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  )
  WITH CHECK (
    workspace_id IS NOT NULL 
    AND has_workspace_role(workspace_id, ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  );

-- Add bot_configurations to supabase_realtime publication if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'bot_configurations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_configurations;
  END IF;
END $$;

ALTER TABLE public.bot_configurations REPLICA IDENTITY FULL;

COMMIT;
