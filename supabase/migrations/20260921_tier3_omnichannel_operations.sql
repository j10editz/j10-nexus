BEGIN;

-- Tier 3 — True Omnichannel Operations.

-- Expand the existing inbox contract deterministically. A legacy row using an
-- unsupported channel must abort the transaction instead of silently retaining
-- the old constraint.
ALTER TABLE public.inbox_threads
  DROP CONSTRAINT IF EXISTS inbox_threads_channel_check,
  DROP CONSTRAINT IF EXISTS chk_inbox_threads_channel;
ALTER TABLE public.inbox_threads
  ADD CONSTRAINT chk_inbox_threads_channel CHECK (channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm'
  ));

-- Assignment, routing, SLA, and collision-lease state.
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_team text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS routing_rule_id uuid,
  ADD COLUMN IF NOT EXISTS sla_status text NOT NULL DEFAULT 'healthy'
    CHECK (sla_status IN ('healthy', 'warning', 'breached')),
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid,
  ADD COLUMN IF NOT EXISTS sla_first_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_first_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_breached_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS active_viewers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- workforce_members is the canonical production workforce table. Its primary
-- key is global; this additional key permits tenant-safe composite references.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workforce_members'::regclass
      AND conname = 'uq_workforce_members_workspace_id'
  ) THEN
    ALTER TABLE public.workforce_members
      ADD CONSTRAINT uq_workforce_members_workspace_id UNIQUE (workspace_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.omnichannel_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel text NOT NULL CHECK (channel IN (
    'all', 'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram',
    'messenger', 'webchat', 'website', 'crm'
  )),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  routing_strategy text NOT NULL CHECK (routing_strategy IN (
    'round_robin', 'least_loaded', 'skill_based', 'ai_specialist', 'direct_assignment'
  )),
  target_user_id uuid,
  target_agent_id uuid,
  target_team text NOT NULL DEFAULT 'general',
  priority_order integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_omnichannel_routing_rules_workspace_id UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS public.omnichannel_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent', 'all')),
  channel text NOT NULL CHECK (channel IN (
    'all', 'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram',
    'messenger', 'webchat', 'website', 'crm'
  )),
  first_response_target_minutes integer NOT NULL CHECK (first_response_target_minutes > 0),
  resolution_target_minutes integer NOT NULL CHECK (resolution_target_minutes > 0),
  warning_threshold_percent integer NOT NULL DEFAULT 80 CHECK (warning_threshold_percent BETWEEN 1 AND 99),
  escalation_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_omnichannel_sla_policies_workspace_id UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS public.omnichannel_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid,
  message_id uuid,
  routing_rule_id uuid,
  sla_policy_id uuid,
  channel text NOT NULL CHECK (channel IN (
    'whatsapp', 'whatsapp_group', 'sms', 'email', 'instagram', 'messenger',
    'webchat', 'website', 'crm'
  )),
  provider text NOT NULL,
  recipient text NOT NULL,
  external_message_id text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every assignment, routing, SLA, and dispatch reference is workspace-scoped.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_assigned_user_workspace') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_assigned_user_workspace
      FOREIGN KEY (workspace_id, assigned_user_id)
      REFERENCES public.workspace_memberships(workspace_id, user_id)
      ON DELETE SET NULL (assigned_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_assigned_member_workspace') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_assigned_member_workspace
      FOREIGN KEY (workspace_id, assigned_agent_id)
      REFERENCES public.workforce_members(workspace_id, id)
      ON DELETE SET NULL (assigned_agent_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_routing_rule_target_user_workspace') THEN
    ALTER TABLE public.omnichannel_routing_rules ADD CONSTRAINT fk_routing_rule_target_user_workspace
      FOREIGN KEY (workspace_id, target_user_id)
      REFERENCES public.workspace_memberships(workspace_id, user_id)
      ON DELETE SET NULL (target_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_routing_rule_target_member_workspace') THEN
    ALTER TABLE public.omnichannel_routing_rules ADD CONSTRAINT fk_routing_rule_target_member_workspace
      FOREIGN KEY (workspace_id, target_agent_id)
      REFERENCES public.workforce_members(workspace_id, id)
      ON DELETE SET NULL (target_agent_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_routing_rule_workspace') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_routing_rule_workspace
      FOREIGN KEY (workspace_id, routing_rule_id)
      REFERENCES public.omnichannel_routing_rules(workspace_id, id)
      ON DELETE SET NULL (routing_rule_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_sla_policy_workspace') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_sla_policy_workspace
      FOREIGN KEY (workspace_id, sla_policy_id)
      REFERENCES public.omnichannel_sla_policies(workspace_id, id)
      ON DELETE SET NULL (sla_policy_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_thread_workspace') THEN
    ALTER TABLE public.omnichannel_dispatch_logs ADD CONSTRAINT fk_dispatch_thread_workspace
      FOREIGN KEY (workspace_id, thread_id)
      REFERENCES public.inbox_threads(workspace_id, id)
      ON DELETE SET NULL (thread_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_message_workspace') THEN
    ALTER TABLE public.omnichannel_dispatch_logs ADD CONSTRAINT fk_dispatch_message_workspace
      FOREIGN KEY (workspace_id, message_id)
      REFERENCES public.inbox_messages(workspace_id, id)
      ON DELETE SET NULL (message_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_routing_rule_workspace') THEN
    ALTER TABLE public.omnichannel_dispatch_logs ADD CONSTRAINT fk_dispatch_routing_rule_workspace
      FOREIGN KEY (workspace_id, routing_rule_id)
      REFERENCES public.omnichannel_routing_rules(workspace_id, id)
      ON DELETE SET NULL (routing_rule_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispatch_sla_policy_workspace') THEN
    ALTER TABLE public.omnichannel_dispatch_logs ADD CONSTRAINT fk_dispatch_sla_policy_workspace
      FOREIGN KEY (workspace_id, sla_policy_id)
      REFERENCES public.omnichannel_sla_policies(workspace_id, id)
      ON DELETE SET NULL (sla_policy_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inbox_threads_lease_state') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT chk_inbox_threads_lease_state CHECK (
      (locked_by_user_id IS NULL AND locked_at IS NULL AND lock_expires_at IS NULL)
      OR (
        locked_by_user_id IS NOT NULL
        AND locked_at IS NOT NULL
        AND lock_expires_at IS NOT NULL
        AND lock_expires_at > locked_at
      )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_channel ON public.inbox_threads(workspace_id, channel);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_sla_status ON public.inbox_threads(workspace_id, sla_status);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_locked ON public.inbox_threads(locked_by_user_id, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_omnichannel_rules_ws ON public.omnichannel_routing_rules(workspace_id, is_active, priority_order);
CREATE INDEX IF NOT EXISTS idx_omnichannel_sla_ws ON public.omnichannel_sla_policies(workspace_id, priority, channel);
CREATE INDEX IF NOT EXISTS idx_omnichannel_dispatch_ws ON public.omnichannel_dispatch_logs(workspace_id, created_at DESC);

-- The evaluator selects the first active rule. Equal active priorities in one
-- workspace/channel are contradictory; defaults must be unique by SLA scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichannel_active_routing_priority
  ON public.omnichannel_routing_rules(workspace_id, channel, priority_order)
  WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichannel_default_sla_scope
  ON public.omnichannel_sla_policies(workspace_id, priority, channel)
  WHERE is_default;

ALTER TABLE public.omnichannel_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_routing_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_sla_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omnichannel_dispatch_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS omnichannel_rules_member_select ON public.omnichannel_routing_rules;
CREATE POLICY omnichannel_rules_member_select ON public.omnichannel_routing_rules FOR SELECT
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']) OR is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS omnichannel_rules_admin_manage ON public.omnichannel_routing_rules;
CREATE POLICY omnichannel_rules_admin_manage ON public.omnichannel_routing_rules FOR ALL
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin']) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS omnichannel_sla_member_select ON public.omnichannel_sla_policies;
CREATE POLICY omnichannel_sla_member_select ON public.omnichannel_sla_policies FOR SELECT
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']) OR is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS omnichannel_sla_admin_manage ON public.omnichannel_sla_policies;
CREATE POLICY omnichannel_sla_admin_manage ON public.omnichannel_sla_policies FOR ALL
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin']) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin']) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS omnichannel_dispatch_member_select ON public.omnichannel_dispatch_logs;
CREATE POLICY omnichannel_dispatch_member_select ON public.omnichannel_dispatch_logs FOR SELECT
  USING (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']) OR is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS omnichannel_dispatch_member_insert ON public.omnichannel_dispatch_logs;
CREATE POLICY omnichannel_dispatch_member_insert ON public.omnichannel_dispatch_logs FOR INSERT
  WITH CHECK (has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent']) OR is_platform_admin(auth.uid()));

REVOKE ALL ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON public.omnichannel_routing_rules, public.omnichannel_sla_policies, public.omnichannel_dispatch_logs TO service_role';
  END IF;
END $$;

COMMIT;
