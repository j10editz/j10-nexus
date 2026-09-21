-- Canonicalize the legacy public.workflows relation without recreating it.
-- Ownership is derived only from one active workspace membership per owner.
-- A missing or ambiguous owner aborts before the tenant constraint is applied.
BEGIN;

DO $$
DECLARE
  v_kind "char";
  v_unresolved bigint;
  v_unexpected_policy text;
BEGIN
  SELECT c.relkind INTO v_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'workflows';

  -- Fresh canonical installs use public.automations and intentionally have no
  -- legacy workflows relation. Do not create a parallel runtime table.
  IF v_kind IS NULL THEN
    RETURN;
  END IF;

  IF v_kind IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'Workflow canonicalization aborted: public.workflows must be a table.';
  END IF;

  ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS workspace_id uuid;

  -- There is no authoritative workspace-scoped parent key on this legacy table.
  -- Backfill only owners with exactly one distinct active membership.
  UPDATE public.workflows workflow
  SET workspace_id = candidate.workspace_id
  FROM (
    SELECT membership.user_id, (array_agg(DISTINCT membership.workspace_id))[1] AS workspace_id
    FROM public.workspace_memberships membership
    WHERE membership.status = 'active'
    GROUP BY membership.user_id
    HAVING count(DISTINCT membership.workspace_id) = 1
  ) candidate
  WHERE workflow.workspace_id IS NULL
    AND workflow.user_id = candidate.user_id;

  SELECT count(*) INTO v_unresolved
  FROM public.workflows
  WHERE workspace_id IS NULL;
  IF v_unresolved <> 0 THEN
    RAISE EXCEPTION 'Workflow canonicalization aborted: % workflow rows have unresolved or ambiguous workspace ownership.', v_unresolved;
  END IF;

  -- Unknown existing policies are not silently retained because they may bypass
  -- workspace isolation. The known legacy policies are replaced below.
  SELECT pol.polname INTO v_unexpected_policy
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.workflows'::regclass
    AND pol.polname NOT IN (
      'Users can view their own workflows',
      'Users can create their own workflows',
      'Users can update their own workflows',
      'Users can delete their own workflows',
      'workflows_select', 'workflows_insert', 'workflows_update', 'workflows_delete'
    )
  LIMIT 1;
  IF v_unexpected_policy IS NOT NULL THEN
    RAISE EXCEPTION 'Workflow canonicalization aborted: unexpected existing policy % requires security review.', v_unexpected_policy;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workflows'::regclass
      AND conname = 'workflows_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.workflows
      ADD CONSTRAINT workflows_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
  END IF;

  ALTER TABLE public.workflows ALTER COLUMN workspace_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS workflows_workspace_id_idx ON public.workflows(workspace_id);
  CREATE INDEX IF NOT EXISTS workflows_workspace_status_idx ON public.workflows(workspace_id, status);

  ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Users can view their own workflows" ON public.workflows;
  DROP POLICY IF EXISTS "Users can create their own workflows" ON public.workflows;
  DROP POLICY IF EXISTS "Users can update their own workflows" ON public.workflows;
  DROP POLICY IF EXISTS "Users can delete their own workflows" ON public.workflows;
  DROP POLICY IF EXISTS workflows_select ON public.workflows;
  DROP POLICY IF EXISTS workflows_insert ON public.workflows;
  DROP POLICY IF EXISTS workflows_update ON public.workflows;
  DROP POLICY IF EXISTS workflows_delete ON public.workflows;

  CREATE POLICY workflows_select ON public.workflows FOR SELECT
    USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent', 'viewer']));
  CREATE POLICY workflows_insert ON public.workflows FOR INSERT
    WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));
  CREATE POLICY workflows_update ON public.workflows FOR UPDATE
    USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']))
    WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager']));
  CREATE POLICY workflows_delete ON public.workflows FOR DELETE
    USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

  REVOKE ALL ON TABLE public.workflows FROM anon;
  REVOKE ALL ON TABLE public.workflows FROM authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workflows TO authenticated;

-- Dashboard fallback contract: id, workspace_id, status, runs_count.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workflows'
      AND column_name IN ('id', 'workspace_id', 'status', 'runs_count')
    GROUP BY table_name HAVING count(*) <> 4
  ) OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='workflows' AND column_name IN ('id', 'workspace_id', 'status', 'runs_count')) <> 4 THEN
    RAISE EXCEPTION 'Workflow canonicalization aborted: dashboard-required columns are missing.';
  END IF;
END $$;

COMMIT;
