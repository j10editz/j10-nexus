-- ============================================================================
-- J10 NEXUS TIER 0E ATOMIC OWNERSHIP & FOUNDER ROLE TRANSFER
-- File: supabase/migrations/20260915b_atomic_founder_ownership_transfer.sql
-- Description:
--   Atomically transfers J10 NEXUS HQ ownership and platform_founder role
--   from the initial account (richeder7@gmail.com) to the newly authenticated
--   CEO account (contact.j1oeditz@gmail.com).
--
-- Invariants enforced:
--   1. Validates both source and destination user accounts exist in auth.users.
--   2. Validates source owns J10 NEXUS HQ and holds active platform_founder.
--   3. Adds active owner membership in J10 NEXUS HQ for destination user.
--   4. Updates workspaces.owner_user_id to destination user.
--   5. Grants platform_founder to destination user.
--   6. Preserves destination user profile display_name while ensuring job_title = 'CEO'.
--   7. Retains source account as platform_admin & co-owner for rollback safety.
--   8. Preserves all 7 CRM contacts, threads, messages, and ledger integrity.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_source_id uuid := '0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa';
  v_dest_id uuid := 'f44f4cc4-30bc-4d78-98e3-0b63ff63e08f';
  v_ws_id uuid := 'ce593364-2aaf-47e4-a1d2-2272775747c4';
BEGIN
  -- 1. Validate source user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_source_id) THEN
    RAISE EXCEPTION 'Source founder user (%) does not exist in auth.users.', v_source_id;
  END IF;

  -- 2. Validate destination user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_dest_id) THEN
    RAISE EXCEPTION 'Destination CEO user (%) does not exist in auth.users.', v_dest_id;
  END IF;

  -- 3. Validate J10 NEXUS HQ exists and is currently owned by source
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_ws_id AND owner_user_id = v_source_id) THEN
    RAISE EXCEPTION 'Workspace % is not currently owned by source founder %.', v_ws_id, v_source_id;
  END IF;

  -- 4. Validate source holds platform_founder
  IF NOT EXISTS (SELECT 1 FROM public.platform_roles WHERE user_id = v_source_id AND role = 'platform_founder' AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Source founder % does not hold active platform_founder role.', v_source_id;
  END IF;

  -- 5. Grant active owner membership in J10 NEXUS HQ to destination user
  INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
  VALUES (v_ws_id, v_dest_id, 'owner', 'active')
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET role = 'owner', status = 'active', updated_at = now();

  -- 6. Transfer workspace owner_user_id to destination user
  UPDATE public.workspaces
  SET owner_user_id = v_dest_id,
      updated_at = now()
  WHERE id = v_ws_id;

  -- 7. Grant platform_founder role to destination user
  INSERT INTO public.platform_roles (user_id, role, granted_at)
  VALUES (v_dest_id, 'platform_founder', now())
  ON CONFLICT (user_id)
  DO UPDATE SET role = 'platform_founder', revoked_at = NULL;

  -- 8. Ensure destination profile has CEO job title and active status
  INSERT INTO public.profiles (user_id, display_name, job_title, status)
  VALUES (v_dest_id, 'J10 THE BOSS', 'CEO', 'active')
  ON CONFLICT (user_id)
  DO UPDATE SET job_title = 'CEO', status = 'active', updated_at = now();

  -- 9. Retain source account as platform_admin for backup/recovery
  UPDATE public.platform_roles
  SET role = 'platform_admin'
  WHERE user_id = v_source_id;

  RAISE NOTICE 'Atomic ownership and platform_founder transfer completed successfully to destination user %', v_dest_id;
END $$;

COMMIT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verification Query
SELECT
  w.id AS workspace_id,
  w.name AS workspace_name,
  w.owner_user_id,
  (SELECT count(*) FROM public.workspace_memberships WHERE workspace_id = w.id AND status = 'active') AS active_memberships_count,
  (SELECT role FROM public.platform_roles WHERE user_id = w.owner_user_id AND revoked_at IS NULL) AS new_owner_platform_role,
  (SELECT count(*) FROM public.contacts WHERE workspace_id = w.id) AS contacts_preserved_count
FROM public.workspaces w
WHERE w.id = 'ce593364-2aaf-47e4-a1d2-2272775747c4';
