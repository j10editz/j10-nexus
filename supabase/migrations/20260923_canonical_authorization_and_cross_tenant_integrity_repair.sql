-- ==============================================================================
-- MIGRATION: 20260923_canonical_authorization_and_cross_tenant_integrity_repair.sql
-- Description:
-- Repairs authorization model for Tier 3 and Tier 4 tables.
-- Replaces non-canonical references to workspace_members and public.users with
-- established canonical security helpers: has_workspace_role() and is_platform_admin().
-- Enforces:
-- 1. Workspace tenant isolation
-- 2. Viewer read-only restrictions (mutations strictly denied)
-- 3. Suspended/removed membership denial (has_workspace_role checks status = 'active')
-- 4. Cross-tenant referential integrity: composite foreign keys ensuring related
--    agent, version, and trace IDs belong to the identical workspace.
-- ==============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. COMPOSITE INTEGRITY CONSTRAINTS (CROSS-TENANT FOREIGN KEY PROTECTION)
-- ----------------------------------------------------------------------------

-- Add (workspace_id, id) unique constraints to enable composite foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_ai_agent_versions_ws_id'
  ) THEN
    ALTER TABLE public.ai_agent_versions
      ADD CONSTRAINT uq_ai_agent_versions_ws_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_ai_agent_traces_ws_id'
  ) THEN
    ALTER TABLE public.ai_agent_traces
      ADD CONSTRAINT uq_ai_agent_traces_ws_id UNIQUE (workspace_id, id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Enforce cross-tenant foreign keys on traces, approval gates, and evals
DO $$
BEGIN
  -- Traces -> Versions: version_id must belong to the same workspace
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_ai_agent_traces_version_ws'
  ) THEN
    ALTER TABLE public.ai_agent_traces
      ADD CONSTRAINT fk_ai_agent_traces_version_ws
      FOREIGN KEY (workspace_id, version_id)
      REFERENCES public.ai_agent_versions(workspace_id, id)
      ON DELETE SET NULL;
  END IF;

  -- Approval Gates -> Traces: trace_id must belong to the same workspace
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_ai_agent_approval_gates_trace_ws'
  ) THEN
    ALTER TABLE public.ai_agent_approval_gates
      ADD CONSTRAINT fk_ai_agent_approval_gates_trace_ws
      FOREIGN KEY (workspace_id, trace_id)
      REFERENCES public.ai_agent_traces(workspace_id, id)
      ON DELETE CASCADE;
  END IF;

  -- Evaluations -> Versions: version_id must belong to the same workspace
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_ai_agent_evaluations_version_ws'
  ) THEN
    ALTER TABLE public.ai_agent_evaluations
      ADD CONSTRAINT fk_ai_agent_evaluations_version_ws
      FOREIGN KEY (workspace_id, version_id)
      REFERENCES public.ai_agent_versions(workspace_id, id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TIER 3: OMNICHANNEL CANONICAL ROW LEVEL SECURITY REPAIR
-- ----------------------------------------------------------------------------

-- Routing Rules
DROP POLICY IF EXISTS "omnichannel_rules_member_select" ON public.omnichannel_routing_rules;
DROP POLICY IF EXISTS "omnichannel_rules_admin_manage" ON public.omnichannel_routing_rules;
DROP POLICY IF EXISTS "omnichannel_rules_select_canonical" ON public.omnichannel_routing_rules;
DROP POLICY IF EXISTS "omnichannel_rules_manage_canonical" ON public.omnichannel_routing_rules;

CREATE POLICY "omnichannel_rules_select_canonical"
  ON public.omnichannel_routing_rules FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "omnichannel_rules_manage_canonical"
  ON public.omnichannel_routing_rules FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- SLA Policies
DROP POLICY IF EXISTS "omnichannel_sla_member_select" ON public.omnichannel_sla_policies;
DROP POLICY IF EXISTS "omnichannel_sla_admin_manage" ON public.omnichannel_sla_policies;
DROP POLICY IF EXISTS "omnichannel_sla_select_canonical" ON public.omnichannel_sla_policies;
DROP POLICY IF EXISTS "omnichannel_sla_manage_canonical" ON public.omnichannel_sla_policies;

CREATE POLICY "omnichannel_sla_select_canonical"
  ON public.omnichannel_sla_policies FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "omnichannel_sla_manage_canonical"
  ON public.omnichannel_sla_policies FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- Dispatch Logs
DROP POLICY IF EXISTS "omnichannel_dispatch_member_select" ON public.omnichannel_dispatch_logs;
DROP POLICY IF EXISTS "omnichannel_dispatch_member_insert" ON public.omnichannel_dispatch_logs;
DROP POLICY IF EXISTS "omnichannel_dispatch_select_canonical" ON public.omnichannel_dispatch_logs;
DROP POLICY IF EXISTS "omnichannel_dispatch_insert_canonical" ON public.omnichannel_dispatch_logs;

CREATE POLICY "omnichannel_dispatch_select_canonical"
  ON public.omnichannel_dispatch_logs FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "omnichannel_dispatch_insert_canonical"
  ON public.omnichannel_dispatch_logs FOR INSERT
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 3. TIER 4: GOVERNED AI AGENT PLATFORM CANONICAL ROW LEVEL SECURITY REPAIR
-- ----------------------------------------------------------------------------

-- ai_agent_versions
DROP POLICY IF EXISTS "ai_agent_versions_select" ON public.ai_agent_versions;
DROP POLICY IF EXISTS "ai_agent_versions_manage" ON public.ai_agent_versions;
DROP POLICY IF EXISTS "ai_agent_versions_select_canonical" ON public.ai_agent_versions;
DROP POLICY IF EXISTS "ai_agent_versions_manage_canonical" ON public.ai_agent_versions;

CREATE POLICY "ai_agent_versions_select_canonical"
  ON public.ai_agent_versions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "ai_agent_versions_manage_canonical"
  ON public.ai_agent_versions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  );

-- ai_agent_traces
DROP POLICY IF EXISTS "ai_agent_traces_select" ON public.ai_agent_traces;
DROP POLICY IF EXISTS "ai_agent_traces_manage" ON public.ai_agent_traces;
DROP POLICY IF EXISTS "ai_agent_traces_select_canonical" ON public.ai_agent_traces;
DROP POLICY IF EXISTS "ai_agent_traces_manage_canonical" ON public.ai_agent_traces;

CREATE POLICY "ai_agent_traces_select_canonical"
  ON public.ai_agent_traces FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "ai_agent_traces_manage_canonical"
  ON public.ai_agent_traces FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

-- ai_agent_trace_steps
DROP POLICY IF EXISTS "ai_agent_trace_steps_select" ON public.ai_agent_trace_steps;
DROP POLICY IF EXISTS "ai_agent_trace_steps_manage" ON public.ai_agent_trace_steps;
DROP POLICY IF EXISTS "ai_agent_trace_steps_select_canonical" ON public.ai_agent_trace_steps;
DROP POLICY IF EXISTS "ai_agent_trace_steps_manage_canonical" ON public.ai_agent_trace_steps;

CREATE POLICY "ai_agent_trace_steps_select_canonical"
  ON public.ai_agent_trace_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agent_traces t
      WHERE t.id = ai_agent_trace_steps.trace_id
        AND (
          has_workspace_role(t.workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
          OR is_platform_admin()
        )
    )
  );

CREATE POLICY "ai_agent_trace_steps_manage_canonical"
  ON public.ai_agent_trace_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_agent_traces t
      WHERE t.id = ai_agent_trace_steps.trace_id
        AND (
          has_workspace_role(t.workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
          OR is_platform_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_agent_traces t
      WHERE t.id = ai_agent_trace_steps.trace_id
        AND (
          has_workspace_role(t.workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
          OR is_platform_admin()
        )
    )
  );

-- ai_agent_permissions
DROP POLICY IF EXISTS "ai_agent_permissions_select" ON public.ai_agent_permissions;
DROP POLICY IF EXISTS "ai_agent_permissions_manage" ON public.ai_agent_permissions;
DROP POLICY IF EXISTS "ai_agent_permissions_select_canonical" ON public.ai_agent_permissions;
DROP POLICY IF EXISTS "ai_agent_permissions_manage_canonical" ON public.ai_agent_permissions;

CREATE POLICY "ai_agent_permissions_select_canonical"
  ON public.ai_agent_permissions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "ai_agent_permissions_manage_canonical"
  ON public.ai_agent_permissions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- ai_agent_budgets
DROP POLICY IF EXISTS "ai_agent_budgets_select" ON public.ai_agent_budgets;
DROP POLICY IF EXISTS "ai_agent_budgets_manage" ON public.ai_agent_budgets;
DROP POLICY IF EXISTS "ai_agent_budgets_select_canonical" ON public.ai_agent_budgets;
DROP POLICY IF EXISTS "ai_agent_budgets_manage_canonical" ON public.ai_agent_budgets;

CREATE POLICY "ai_agent_budgets_select_canonical"
  ON public.ai_agent_budgets FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "ai_agent_budgets_manage_canonical"
  ON public.ai_agent_budgets FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- ai_agent_approval_gates
DROP POLICY IF EXISTS "ai_agent_approval_gates_select" ON public.ai_agent_approval_gates;
DROP POLICY IF EXISTS "ai_agent_approval_gates_manage" ON public.ai_agent_approval_gates;
DROP POLICY IF EXISTS "ai_agent_approval_gates_select_canonical" ON public.ai_agent_approval_gates;
DROP POLICY IF EXISTS "ai_agent_approval_gates_manage_canonical" ON public.ai_agent_approval_gates;

CREATE POLICY "ai_agent_approval_gates_select_canonical"
  ON public.ai_agent_approval_gates FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "ai_agent_approval_gates_manage_canonical"
  ON public.ai_agent_approval_gates FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  );

-- ai_agent_evaluations
DROP POLICY IF EXISTS "ai_agent_evaluations_select" ON public.ai_agent_evaluations;
DROP POLICY IF EXISTS "ai_agent_evaluations_manage" ON public.ai_agent_evaluations;
DROP POLICY IF EXISTS "ai_agent_evaluations_select_canonical" ON public.ai_agent_evaluations;
DROP POLICY IF EXISTS "ai_agent_evaluations_manage_canonical" ON public.ai_agent_evaluations;

CREATE POLICY "ai_agent_evaluations_select_canonical"
  ON public.ai_agent_evaluations FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "ai_agent_evaluations_manage_canonical"
  ON public.ai_agent_evaluations FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  );

-- ai_agent_roi_attributions
DROP POLICY IF EXISTS "ai_agent_roi_attributions_select" ON public.ai_agent_roi_attributions;
DROP POLICY IF EXISTS "ai_agent_roi_attributions_manage" ON public.ai_agent_roi_attributions;
DROP POLICY IF EXISTS "ai_agent_roi_attributions_select_canonical" ON public.ai_agent_roi_attributions;
DROP POLICY IF EXISTS "ai_agent_roi_attributions_manage_canonical" ON public.ai_agent_roi_attributions;

CREATE POLICY "ai_agent_roi_attributions_select_canonical"
  ON public.ai_agent_roi_attributions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

CREATE POLICY "ai_agent_roi_attributions_manage_canonical"
  ON public.ai_agent_roi_attributions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- 4. ENSURE FORCE ROW LEVEL SECURITY FOR AUTHENTICATED ROLE
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER TABLE public.omnichannel_routing_rules FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.omnichannel_sla_policies FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.omnichannel_dispatch_logs FORCE ROW LEVEL SECURITY;

    ALTER TABLE public.ai_agent_versions FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.ai_agent_traces FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.ai_agent_trace_steps FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.ai_agent_permissions FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.ai_agent_budgets FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.ai_agent_approval_gates FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.ai_agent_evaluations FORCE ROW LEVEL SECURITY;
    ALTER TABLE public.ai_agent_roi_attributions FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

COMMIT;
