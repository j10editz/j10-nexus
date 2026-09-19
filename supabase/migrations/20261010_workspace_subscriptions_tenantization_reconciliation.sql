-- Repairs workspace-scoped subscription invariants for databases that recorded
-- the original tenantization migration before this portability guard existed.
-- The migration fails closed if legacy rows cannot be mapped unambiguously.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.workspace_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'workspace_subscriptions is required before reconciliation.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_subscriptions'
      AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.workspace_subscriptions
      ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END;
$$;

UPDATE public.workspace_subscriptions subscription
SET workspace_id = membership.workspace_id
FROM public.workspace_memberships membership
WHERE subscription.workspace_id IS NULL
  AND subscription.user_id = membership.user_id
  AND membership.status = 'active';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspace_subscriptions WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'workspace_subscriptions reconciliation failed: unresolved workspace_id.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workspace_subscriptions
    GROUP BY workspace_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'workspace_subscriptions reconciliation failed: duplicate workspace binding.';
  END IF;
END;
$$;

ALTER TABLE public.workspace_subscriptions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.workspace_subscriptions ALTER COLUMN user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_subscriptions_workspace_id
  ON public.workspace_subscriptions(workspace_id);

COMMIT;
