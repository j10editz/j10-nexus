-- ==============================================================================
-- MIGRATION: 20260921_tier3_omnichannel_operations.sql
-- Tier 3 — True Omnichannel Operations
-- Covers: Email, SMS, WebChat, Instagram, Messenger, WhatsApp Groups,
-- Routing, Assignments, SLAs, Collision Prevention, and Outbound Dispatch.
-- ==============================================================================

-- 1. Safely expand channel check constraint on inbox_threads
DO $$
BEGIN
  -- Drop existing channel check constraints if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.inbox_threads'::regclass
      AND (conname = 'inbox_threads_channel_check' OR conname = 'chk_inbox_threads_channel')
  ) THEN
    EXECUTE 'ALTER TABLE public.inbox_threads DROP CONSTRAINT IF EXISTS inbox_threads_channel_check';
    EXECUTE 'ALTER TABLE public.inbox_threads DROP CONSTRAINT IF EXISTS chk_inbox_threads_channel';
  END IF;

  -- Add updated check constraint with all 9 omnichannel channels
  ALTER TABLE public.inbox_threads
    ADD CONSTRAINT chk_inbox_threads_channel
    CHECK (channel IN (
      'whatsapp',
      'website',
      'crm',
      'email',
      'sms',
      'webchat',
      'instagram',
      'messenger',
      'whatsapp_group'
    ));
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Tolerate if table or constraint already exists in mock/partial environments
END $$;

-- 2. Add assignment, SLA, and collision columns to inbox_threads
DO $$
BEGIN
  -- AI Agent Assignment
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'assigned_agent_id') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN assigned_agent_id uuid REFERENCES public.workforce_agents(id) ON DELETE SET NULL;
  END IF;

  -- Team Queue
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'assigned_team') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN assigned_team text NOT NULL DEFAULT 'general';
  END IF;

  -- Assigned Timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'assigned_at') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN assigned_at timestamptz;
  END IF;

  -- Routing Rule reference
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'routing_rule_id') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN routing_rule_id uuid;
  END IF;

  -- SLA Tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'sla_status') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN sla_status text NOT NULL DEFAULT 'healthy' CHECK (sla_status IN ('healthy', 'warning', 'breached'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'sla_policy_id') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN sla_policy_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'sla_first_response_due_at') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN sla_first_response_due_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'sla_resolution_due_at') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN sla_resolution_due_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'sla_first_responded_at') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN sla_first_responded_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'sla_resolved_at') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN sla_resolved_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'sla_breached_at') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN sla_breached_at timestamptz;
  END IF;

  -- Collision Prevention & Lease Locking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'locked_by_user_id') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN locked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'locked_at') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN locked_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'lock_expires_at') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN lock_expires_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_threads' AND column_name = 'active_viewers') THEN
    ALTER TABLE public.inbox_threads ADD COLUMN active_viewers jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 3. Create Omnichannel Routing Rules Table
CREATE TABLE IF NOT EXISTS public.omnichannel_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel text NOT NULL CHECK (channel IN (
    'all',
    'whatsapp',
    'website',
    'crm',
    'email',
    'sms',
    'webchat',
    'instagram',
    'messenger',
    'whatsapp_group'
  )),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  routing_strategy text NOT NULL CHECK (routing_strategy IN (
    'round_robin',
    'least_loaded',
    'skill_based',
    'ai_specialist',
    'direct_assignment'
  )),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_agent_id uuid REFERENCES public.workforce_agents(id) ON DELETE SET NULL,
  target_team text NOT NULL DEFAULT 'general',
  priority_order integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create Omnichannel SLA Policies Table
CREATE TABLE IF NOT EXISTS public.omnichannel_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'all')),
  channel text NOT NULL CHECK (channel IN (
    'all',
    'whatsapp',
    'website',
    'crm',
    'email',
    'sms',
    'webchat',
    'instagram',
    'messenger',
    'whatsapp_group'
  )),
  first_response_target_minutes integer NOT NULL CHECK (first_response_target_minutes > 0),
  resolution_target_minutes integer NOT NULL CHECK (resolution_target_minutes > 0),
  warning_threshold_percent integer NOT NULL DEFAULT 80 CHECK (warning_threshold_percent BETWEEN 1 AND 99),
  escalation_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Create Omnichannel Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.omnichannel_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN (
    'whatsapp',
    'website',
    'crm',
    'email',
    'sms',
    'webchat',
    'instagram',
    'messenger',
    'whatsapp_group'
  )),
  provider text NOT NULL,
  recipient text NOT NULL,
  external_message_id text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Indexes for High-Performance Queries
CREATE INDEX IF NOT EXISTS idx_inbox_threads_channel ON public.inbox_threads(workspace_id, channel);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_sla_status ON public.inbox_threads(workspace_id, sla_status);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_locked ON public.inbox_threads(locked_by_user_id, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_omnichannel_rules_ws ON public.omnichannel_routing_rules(workspace_id, is_active, priority_order);
CREATE INDEX IF NOT EXISTS idx_omnichannel_sla_ws ON public.omnichannel_sla_policies(workspace_id, priority, channel);
CREATE INDEX IF NOT EXISTS idx_omnichannel_dispatch_ws ON public.omnichannel_dispatch_logs(workspace_id, created_at DESC);

-- 7. Enable Row Level Security (RLS)
ALTER TABLE public.omnichannel_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies (Canonical Authorization via has_workspace_role and is_platform_admin)
DROP POLICY IF EXISTS "omnichannel_rules_member_select" ON public.omnichannel_routing_rules;
CREATE POLICY "omnichannel_rules_member_select"
  ON public.omnichannel_routing_rules FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "omnichannel_rules_admin_manage" ON public.omnichannel_routing_rules;
CREATE POLICY "omnichannel_rules_admin_manage"
  ON public.omnichannel_routing_rules FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "omnichannel_sla_member_select" ON public.omnichannel_sla_policies;
CREATE POLICY "omnichannel_sla_member_select"
  ON public.omnichannel_sla_policies FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "omnichannel_sla_admin_manage" ON public.omnichannel_sla_policies;
CREATE POLICY "omnichannel_sla_admin_manage"
  ON public.omnichannel_sla_policies FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "omnichannel_dispatch_member_select" ON public.omnichannel_dispatch_logs;
CREATE POLICY "omnichannel_dispatch_member_select"
  ON public.omnichannel_dispatch_logs FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "omnichannel_dispatch_member_insert" ON public.omnichannel_dispatch_logs;
CREATE POLICY "omnichannel_dispatch_member_insert"
  ON public.omnichannel_dispatch_logs FOR INSERT
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

-- 9. Table Grants for Authenticated Role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT ALL ON public.omnichannel_routing_rules TO authenticated;
    GRANT ALL ON public.omnichannel_sla_policies TO authenticated;
    GRANT ALL ON public.omnichannel_dispatch_logs TO authenticated;
  END IF;
END $$;
