-- ============================================================
-- J10 NEXUS TIER 4 — GOVERNED AI AGENT PLATFORM SCHEMA
-- Migration: 20260922_tier4_governed_ai_agent_platform.sql
-- ============================================================

-- 1. Create AI Agent Versions Table
CREATE TABLE IF NOT EXISTS public.ai_agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  system_prompt text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  model_id text NOT NULL DEFAULT 'gpt-5.6-sol',
  temperature numeric(3,2) NOT NULL DEFAULT 0.70 CHECK (temperature >= 0.00 AND temperature <= 2.00),
  max_tokens integer NOT NULL DEFAULT 4096 CHECK (max_tokens > 0),
  reasoning_effort text NOT NULL DEFAULT 'medium' CHECK (reasoning_effort IN ('none', 'low', 'medium', 'high', 'xhigh', 'max')),
  tools_enabled text[] NOT NULL DEFAULT '{}',
  changelog text NOT NULL DEFAULT 'Initial version',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'rollback')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_agent_versions UNIQUE (workspace_id, agent_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_versions_workspace_agent
  ON public.ai_agent_versions(workspace_id, agent_id, status);

-- 2. Create AI Agent Traces Table
CREATE TABLE IF NOT EXISTS public.ai_agent_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  version_id uuid REFERENCES public.ai_agent_versions(id) ON DELETE SET NULL,
  task_id uuid,
  session_id text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'waiting_approval', 'rejected')),
  model_used text NOT NULL DEFAULT 'gpt-5.6-sol',
  provider_used text NOT NULL DEFAULT 'openai' CHECK (provider_used IN ('openai', 'gemini', 'development')),
  latency_ms integer NOT NULL DEFAULT 0,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0.000000,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_traces_workspace_agent
  ON public.ai_agent_traces(workspace_id, agent_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_agent_traces_task
  ON public.ai_agent_traces(task_id);

-- 3. Create AI Agent Trace Steps Table
CREATE TABLE IF NOT EXISTS public.ai_agent_trace_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL REFERENCES public.ai_agent_traces(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  step_type text NOT NULL CHECK (step_type IN ('reasoning', 'tool_call', 'approval_gate', 'eval_check', 'output')),
  tool_name text,
  tool_input jsonb,
  tool_output jsonb,
  thought text,
  latency_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'waiting_approval')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_trace_steps_trace
  ON public.ai_agent_trace_steps(trace_id, step_number);

-- 4. Create AI Agent Permissions Table
CREATE TABLE IF NOT EXISTS public.ai_agent_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  allowed_tools text[] NOT NULL DEFAULT '{}',
  denied_tools text[] NOT NULL DEFAULT '{}',
  data_boundaries jsonb NOT NULL DEFAULT '{}'::jsonb,
  can_execute_code boolean NOT NULL DEFAULT false,
  can_call_external_apis boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_agent_permissions UNIQUE (workspace_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_permissions_workspace_agent
  ON public.ai_agent_permissions(workspace_id, agent_id);

-- 5. Create AI Agent Budgets Table
CREATE TABLE IF NOT EXISTS public.ai_agent_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  daily_budget_usd numeric(10,2) NOT NULL DEFAULT 25.00 CHECK (daily_budget_usd >= 0),
  monthly_budget_usd numeric(10,2) NOT NULL DEFAULT 500.00 CHECK (monthly_budget_usd >= 0),
  max_cost_per_execution_usd numeric(10,4) NOT NULL DEFAULT 1.5000 CHECK (max_cost_per_execution_usd >= 0),
  current_daily_spend_usd numeric(10,6) NOT NULL DEFAULT 0.000000,
  current_monthly_spend_usd numeric(10,6) NOT NULL DEFAULT 0.000000,
  over_budget_policy text NOT NULL DEFAULT 'require_approval' CHECK (over_budget_policy IN ('hard_stop', 'require_approval', 'notify_only')),
  last_reset_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_agent_budgets UNIQUE (workspace_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_budgets_workspace_agent
  ON public.ai_agent_budgets(workspace_id, agent_id);

-- 6. Create AI Agent Approval Gates Table
CREATE TABLE IF NOT EXISTS public.ai_agent_approval_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trace_id uuid REFERENCES public.ai_agent_traces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  action_type text NOT NULL,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_risk text NOT NULL DEFAULT 'medium' CHECK (estimated_risk IN ('low', 'medium', 'high', 'critical')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_approval_gates_workspace_status
  ON public.ai_agent_approval_gates(workspace_id, status);

-- 7. Create AI Agent Evaluations Table
CREATE TABLE IF NOT EXISTS public.ai_agent_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  version_id uuid REFERENCES public.ai_agent_versions(id) ON DELETE CASCADE,
  benchmark_name text NOT NULL,
  test_cases_count integer NOT NULL DEFAULT 0,
  passed_count integer NOT NULL DEFAULT 0,
  pass_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  accuracy_score numeric(5,2) NOT NULL DEFAULT 0.00,
  groundedness_score numeric(5,2) NOT NULL DEFAULT 0.00,
  safety_score numeric(5,2) NOT NULL DEFAULT 100.00,
  p95_latency_ms integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_evaluations_workspace_agent
  ON public.ai_agent_evaluations(workspace_id, agent_id, version_id);

-- 8. Create AI Agent ROI Attributions Table
CREATE TABLE IF NOT EXISTS public.ai_agent_roi_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  trace_id uuid REFERENCES public.ai_agent_traces(id) ON DELETE SET NULL,
  task_id uuid,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_value_usd numeric(12,2) NOT NULL DEFAULT 0.00,
  hours_saved numeric(6,2) NOT NULL DEFAULT 0.00,
  labor_savings_usd numeric(10,2) NOT NULL DEFAULT 0.00,
  model_cost_usd numeric(10,6) NOT NULL DEFAULT 0.000000,
  net_roi_usd numeric(12,2) NOT NULL DEFAULT 0.00,
  roi_multiplier numeric(8,2) NOT NULL DEFAULT 0.00,
  attribution_type text NOT NULL DEFAULT 'labor_saved' CHECK (attribution_type IN ('won_deal', 'labor_saved', 'proposal_accepted', 'support_ticket_deflected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_roi_workspace_agent
  ON public.ai_agent_roi_attributions(workspace_id, agent_id, attribution_type);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.ai_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_trace_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_approval_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_roi_attributions ENABLE ROW LEVEL SECURITY;

--- 9. Composite Foreign Keys & Constraints for Cross-Tenant Integrity
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ai_agent_versions_ws_id') THEN
    ALTER TABLE public.ai_agent_versions ADD CONSTRAINT uq_ai_agent_versions_ws_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ai_agent_traces_ws_id') THEN
    ALTER TABLE public.ai_agent_traces ADD CONSTRAINT uq_ai_agent_traces_ws_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_traces_version_ws') THEN
    ALTER TABLE public.ai_agent_traces
      ADD CONSTRAINT fk_ai_agent_traces_version_ws
      FOREIGN KEY (workspace_id, version_id)
      REFERENCES public.ai_agent_versions(workspace_id, id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_approval_gates_trace_ws') THEN
    ALTER TABLE public.ai_agent_approval_gates
      ADD CONSTRAINT fk_ai_agent_approval_gates_trace_ws
      FOREIGN KEY (workspace_id, trace_id)
      REFERENCES public.ai_agent_traces(workspace_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_agent_evaluations_version_ws') THEN
    ALTER TABLE public.ai_agent_evaluations
      ADD CONSTRAINT fk_ai_agent_evaluations_version_ws
      FOREIGN KEY (workspace_id, version_id)
      REFERENCES public.ai_agent_versions(workspace_id, id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 10. Canonical Row Level Security (RLS) Policies
-- ai_agent_versions RLS
DROP POLICY IF EXISTS "ai_agent_versions_select" ON public.ai_agent_versions;
CREATE POLICY "ai_agent_versions_select" ON public.ai_agent_versions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "ai_agent_versions_manage" ON public.ai_agent_versions;
CREATE POLICY "ai_agent_versions_manage" ON public.ai_agent_versions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  );

-- ai_agent_traces RLS
DROP POLICY IF EXISTS "ai_agent_traces_select" ON public.ai_agent_traces;
CREATE POLICY "ai_agent_traces_select" ON public.ai_agent_traces FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "ai_agent_traces_manage" ON public.ai_agent_traces;
CREATE POLICY "ai_agent_traces_manage" ON public.ai_agent_traces FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
    OR is_platform_admin()
  );

-- ai_agent_trace_steps RLS
DROP POLICY IF EXISTS "ai_agent_trace_steps_select" ON public.ai_agent_trace_steps;
CREATE POLICY "ai_agent_trace_steps_select" ON public.ai_agent_trace_steps FOR SELECT
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

DROP POLICY IF EXISTS "ai_agent_trace_steps_manage" ON public.ai_agent_trace_steps;
CREATE POLICY "ai_agent_trace_steps_manage" ON public.ai_agent_trace_steps FOR ALL
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

-- ai_agent_permissions RLS
DROP POLICY IF EXISTS "ai_agent_permissions_select" ON public.ai_agent_permissions;
CREATE POLICY "ai_agent_permissions_select" ON public.ai_agent_permissions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "ai_agent_permissions_manage" ON public.ai_agent_permissions;
CREATE POLICY "ai_agent_permissions_manage" ON public.ai_agent_permissions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- ai_agent_budgets RLS
DROP POLICY IF EXISTS "ai_agent_budgets_select" ON public.ai_agent_budgets;
CREATE POLICY "ai_agent_budgets_select" ON public.ai_agent_budgets FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "ai_agent_budgets_manage" ON public.ai_agent_budgets;
CREATE POLICY "ai_agent_budgets_manage" ON public.ai_agent_budgets FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR is_platform_admin()
  );

-- ai_agent_approval_gates RLS
DROP POLICY IF EXISTS "ai_agent_approval_gates_select" ON public.ai_agent_approval_gates;
CREATE POLICY "ai_agent_approval_gates_select" ON public.ai_agent_approval_gates FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "ai_agent_approval_gates_manage" ON public.ai_agent_approval_gates;
CREATE POLICY "ai_agent_approval_gates_manage" ON public.ai_agent_approval_gates FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  );

-- ai_agent_evaluations RLS
DROP POLICY IF EXISTS "ai_agent_evaluations_select" ON public.ai_agent_evaluations;
CREATE POLICY "ai_agent_evaluations_select" ON public.ai_agent_evaluations FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "ai_agent_evaluations_manage" ON public.ai_agent_evaluations;
CREATE POLICY "ai_agent_evaluations_manage" ON public.ai_agent_evaluations FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  );

-- ai_agent_roi_attributions RLS
DROP POLICY IF EXISTS "ai_agent_roi_attributions_select" ON public.ai_agent_roi_attributions;
CREATE POLICY "ai_agent_roi_attributions_select" ON public.ai_agent_roi_attributions FOR SELECT
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer'])
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "ai_agent_roi_attributions_manage" ON public.ai_agent_roi_attributions;
CREATE POLICY "ai_agent_roi_attributions_manage" ON public.ai_agent_roi_attributions FOR ALL
  USING (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  )
  WITH CHECK (
    has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    OR is_platform_admin()
  );

-- Grant table access to authenticated role
GRANT ALL ON TABLE public.ai_agent_versions TO authenticated;
GRANT ALL ON TABLE public.ai_agent_traces TO authenticated;
GRANT ALL ON TABLE public.ai_agent_trace_steps TO authenticated;
GRANT ALL ON TABLE public.ai_agent_permissions TO authenticated;
GRANT ALL ON TABLE public.ai_agent_budgets TO authenticated;
GRANT ALL ON TABLE public.ai_agent_approval_gates TO authenticated;
GRANT ALL ON TABLE public.ai_agent_evaluations TO authenticated;
GRANT ALL ON TABLE public.ai_agent_roi_attributions TO authenticated;

