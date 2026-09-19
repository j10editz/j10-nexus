-- Reconciles invariants from invalid historical `b` migrations for databases
-- that already recorded the surrounding valid migration versions.
BEGIN;

DO $$
DECLARE
  v_source_id uuid := '0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa';
  v_dest_id uuid := 'f44f4cc4-30bc-4d78-98e3-0b63ff63e08f';
  v_ws_id uuid := 'ce593364-2aaf-47e4-a1d2-2272775747c4';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_source_id)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_dest_id)
    OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_ws_id) THEN
    RAISE NOTICE 'Skipping historical founder ownership reconciliation: original identities are absent.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_ws_id AND owner_user_id = v_dest_id) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_ws_id AND owner_user_id = v_source_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.platform_roles
      WHERE user_id = v_source_id AND role = 'platform_founder' AND revoked_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Historical founder reconciliation precondition failed; ownership state is not the expected source state.';
  END IF;

  INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
  VALUES (v_ws_id, v_dest_id, 'owner', 'active')
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET role = 'owner', status = 'active', updated_at = now();
  UPDATE public.workspaces SET owner_user_id = v_dest_id, updated_at = now() WHERE id = v_ws_id;
  INSERT INTO public.platform_roles (user_id, role, granted_at)
  VALUES (v_dest_id, 'platform_founder', now())
  ON CONFLICT (user_id) DO UPDATE SET role = 'platform_founder', revoked_at = NULL;
  INSERT INTO public.profiles (user_id, display_name, job_title, status)
  VALUES (v_dest_id, 'J10 THE BOSS', 'CEO', 'active')
  ON CONFLICT (user_id) DO UPDATE SET job_title = 'CEO', status = 'active', updated_at = now();
  UPDATE public.platform_roles SET role = 'platform_admin' WHERE user_id = v_source_id;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.record_verified_workspace_usage(uuid,text,integer,text,text,uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB) TO authenticated, service_role';
  END IF;
  IF to_regprocedure('public.activate_workspace_trial(uuid,text,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.activate_workspace_trial(UUID, TEXT, INT) TO authenticated, service_role';
  END IF;
  IF to_regclass('public.crm_proposals') IS NOT NULL AND to_regclass('public.crm_bookings') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.crm_proposals FROM authenticated';
    EXECUTE 'REVOKE ALL ON public.crm_bookings FROM authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_proposals TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bookings TO authenticated';
  END IF;
END $$;

COMMIT;
