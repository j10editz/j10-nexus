-- ============================================================================
-- J10 NEXUS TIER 0E MIGRATION: IDENTITY, PLATFORM ROLES, INVITATIONS & ACCESS CONTROL
-- File: supabase/migrations/20260915_identity_platform_roles_invitations.sql
-- Description:
--   1. Creates persistent public.profiles for canonical user metadata.
--   2. Creates protected public.platform_roles for separation of platform and workspace authority.
--   3. Creates public.workspace_invitations with token hash security and single-use constraints.
--   4. Grants platform_founder explicitly and idempotently to the verified founder UUID.
--   5. Hardens provision_workspace RPC against unauthorized agency_master creation.
--   6. Enforces RLS on profiles, platform_roles, and invitations.
--   7. Guards workspace ownership transfer so no workspace can be left without an active owner.
-- ============================================================================

BEGIN;

-- 1. CANONICAL PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  job_title TEXT NOT NULL DEFAULT '',
  phone TEXT,
  locale TEXT NOT NULL DEFAULT 'en-US',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- 2. PROTECTED PLATFORM ROLES TABLE
CREATE TABLE IF NOT EXISTS public.platform_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('platform_founder', 'platform_admin', 'platform_support')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_platform_roles_role ON public.platform_roles(role) WHERE revoked_at IS NULL;

-- 3. WORKSPACE INVITATIONS TABLE
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'agent', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_lookup
  ON public.workspace_invitations(workspace_id, email_normalized);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token
  ON public.workspace_invitations(token_hash);

-- 4. HELPER FUNCTIONS FOR PLATFORM ROLES
CREATE OR REPLACE FUNCTION public.is_platform_founder(p_user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = p_user_id
      AND role = 'platform_founder'
      AND revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = p_user_id
      AND role IN ('platform_founder', 'platform_admin')
      AND revoked_at IS NULL
  );
$$;

-- 5. AUTOMATIC PROFILE PROVISIONING TRIGGER ON AUTH.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'active'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill profile for any existing user
INSERT INTO public.profiles (user_id, display_name, status)
SELECT id, split_part(email, '@', 1), 'active'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 6. IDEMPOTENT FOUNDER PROTECTION
-- Explicitly grant platform_founder to the verified immutable founder UUID
INSERT INTO public.platform_roles (user_id, role, granted_at)
VALUES ('0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa', 'platform_founder', now())
ON CONFLICT (user_id) DO UPDATE SET role = 'platform_founder', revoked_at = NULL;

UPDATE public.profiles
SET display_name = 'CEO & Founder',
    job_title = 'CEO',
    updated_at = now()
WHERE user_id = '0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa';

-- 7. HARDENED PROVISION_WORKSPACE RPC
-- Enforces that only verified platform admins/founders can provision agency_master or enterprise workspaces.
CREATE OR REPLACE FUNCTION public.provision_workspace(
  p_name text,
  p_slug text,
  p_brand_name text,
  p_accent_color text DEFAULT '#3B82F6',
  p_workspace_type text DEFAULT 'client',
  p_plan text DEFAULT 'growth'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_is_platform_admin boolean;
  v_final_type text;
  v_final_plan text;
  v_workspace public.workspaces%ROWTYPE;
  v_membership public.workspace_memberships%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to provision a workspace.';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Workspace name is required.';
  END IF;

  -- Check platform privileges
  v_is_platform_admin := public.is_platform_admin(v_user_id);

  IF p_workspace_type = 'agency_master' AND NOT v_is_platform_admin THEN
    RAISE EXCEPTION 'Permission denied: Agency HQ workspaces can only be created by platform administrators.';
  END IF;

  v_final_type := CASE WHEN v_is_platform_admin THEN COALESCE(p_workspace_type, 'client') ELSE 'client' END;
  v_final_plan := CASE WHEN v_is_platform_admin THEN COALESCE(p_plan, 'growth') ELSE 'growth' END;

  -- 1. Insert workspace atomically
  INSERT INTO public.workspaces (
    name,
    slug,
    workspace_type,
    plan,
    status,
    brand_name,
    accent_color,
    owner_user_id
  ) VALUES (
    trim(p_name),
    trim(p_slug),
    v_final_type,
    v_final_plan,
    'active',
    COALESCE(trim(p_brand_name), trim(p_name)),
    COALESCE(p_accent_color, '#3B82F6'),
    v_user_id
  )
  RETURNING * INTO v_workspace;

  -- 2. Insert owner membership in same transaction
  INSERT INTO public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    status
  ) VALUES (
    v_workspace.id,
    v_user_id,
    'owner',
    'active'
  )
  RETURNING * INTO v_membership;

  RETURN jsonb_build_object(
    'workspace', to_jsonb(v_workspace),
    'membership', to_jsonb(v_membership)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_workspace(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_workspace(text, text, text, text, text, text) TO authenticated, service_role;

-- 8. OWNERSHIP TRANSFER SAFETY TRIGGER
-- Prevents removing or demoting the last active owner of a workspace without prior transfer
CREATE OR REPLACE FUNCTION public.check_last_active_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_owners_remaining int;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner' AND OLD.status = 'active') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role != 'owner' OR NEW.status != 'active')) THEN
    SELECT count(*) INTO v_active_owners_remaining
    FROM public.workspace_memberships
    WHERE workspace_id = OLD.workspace_id
      AND role = 'owner'
      AND status = 'active'
      AND id != OLD.id;

    IF v_active_owners_remaining < 1 THEN
      RAISE EXCEPTION 'Cannot demote or remove the last active owner. Transfer ownership to another active member first.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_last_owner ON public.workspace_memberships;
CREATE TRIGGER trg_guard_last_owner
  BEFORE UPDATE OR DELETE ON public.workspace_memberships
  FOR EACH ROW EXECUTE FUNCTION public.check_last_active_owner();

-- 9. ROW LEVEL SECURITY (RLS) POLICIES

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_permitted" ON public.profiles;
CREATE POLICY "profiles_select_permitted"
  ON public.profiles FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships my_mem
      JOIN public.workspace_memberships their_mem ON my_mem.workspace_id = their_mem.workspace_id
      WHERE my_mem.user_id = auth.uid()
        AND their_mem.user_id = profiles.user_id
        AND my_mem.status = 'active'
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Platform Roles RLS
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_roles_select_permitted" ON public.platform_roles;
CREATE POLICY "platform_roles_select_permitted"
  ON public.platform_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_platform_admin());

-- Notice: No INSERT/UPDATE/DELETE policies for authenticated users on platform_roles!
-- Only service_role can modify platform_roles.

-- Workspace Invitations RLS
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select_privileged" ON public.workspace_invitations;
CREATE POLICY "invitations_select_privileged"
  ON public.workspace_invitations FOR SELECT
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "invitations_insert_privileged" ON public.workspace_invitations;
CREATE POLICY "invitations_insert_privileged"
  ON public.workspace_invitations FOR INSERT
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "invitations_update_privileged" ON public.workspace_invitations;
CREATE POLICY "invitations_update_privileged"
  ON public.workspace_invitations FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "invitations_delete_privileged" ON public.workspace_invitations;
CREATE POLICY "invitations_delete_privileged"
  ON public.workspace_invitations FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

COMMIT;

-- 10. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- 11. VERIFICATION SUMMARY QUERY
SELECT
  (SELECT count(*) FROM public.profiles) AS profiles_count,
  (SELECT count(*) FROM public.platform_roles WHERE revoked_at IS NULL) AS platform_roles_count,
  (SELECT count(*) FROM public.workspace_invitations) AS invitations_count,
  (SELECT count(*) FROM public.workspaces) AS workspaces_count,
  (SELECT count(*) FROM public.workspace_memberships) AS memberships_count;
