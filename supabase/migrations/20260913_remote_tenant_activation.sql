-- ============================================================================
-- J10 NEXUS: Complete Idempotent Multi-Tenant Remote Activation Migration
-- Migration: 20260913_remote_tenant_activation.sql
-- Description: Provisions the complete Tier 0 & Tier 0B multi-tenant data foundation,
--              composite referential integrity, financial immutability, RLS, and
--              bootstraps the founder's "J10 NEXUS HQ" workspace with legacy CRM data.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CANONICAL 8 MULTI-TENANT ENTITIES
-- ============================================================================

-- Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  workspace_type text NOT NULL DEFAULT 'client' CHECK (workspace_type IN ('agency_master', 'client')),
  plan text NOT NULL DEFAULT 'growth' CHECK (plan IN ('starter', 'growth', 'enterprise')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'past_due', 'suspended')),
  brand_name text NOT NULL,
  accent_color text NOT NULL DEFAULT '#3B82F6',
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Workspace Memberships
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_memberships_workspace_user UNIQUE (workspace_id, user_id)
);

-- Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  source text NOT NULL DEFAULT 'direct',
  deal_stage text NOT NULL DEFAULT 'lead' CHECK (deal_stage IN ('lead', 'qualified', 'proposal', 'won', 'churned')),
  estimated_value numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (estimated_value >= 0),
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_contact_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inbox Threads
CREATE TABLE IF NOT EXISTS public.inbox_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'website', 'crm')),
  external_thread_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'resolved')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inbox Messages
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  provider text NOT NULL DEFAULT 'internal',
  external_message_id text,
  content text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'payment_request', 'template', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payment Checkouts
CREATE TABLE IF NOT EXISTS public.payment_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  checkout_url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payment Ledger (Immutable)
CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  checkout_id uuid REFERENCES public.payment_checkouts(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'stripe',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'refunded', 'pending')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Webhook Events (Idempotency)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  payload_hash text,
  error_code text,
  error_message_sanitized text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT uq_webhook_events_provider_event UNIQUE (provider, provider_event_id)
);

-- ============================================================================
-- 2. COMPOSITE UNIQUENESS & CROSS-TENANT INTEGRITY
-- ============================================================================
DO $$
BEGIN
  -- Composite uniqueness on parent entities
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_contacts_workspace_id') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT uq_contacts_workspace_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_inbox_threads_workspace_id') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT uq_inbox_threads_workspace_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_inbox_messages_workspace_id') THEN
    ALTER TABLE public.inbox_messages ADD CONSTRAINT uq_inbox_messages_workspace_id UNIQUE (workspace_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_payment_checkouts_workspace_id') THEN
    ALTER TABLE public.payment_checkouts ADD CONSTRAINT uq_payment_checkouts_workspace_id UNIQUE (workspace_id, id);
  END IF;

  -- Composite foreign keys enforcing strict cross-tenant isolation
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_threads_workspace_contact') THEN
    ALTER TABLE public.inbox_threads ADD CONSTRAINT fk_inbox_threads_workspace_contact
      FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inbox_messages_workspace_thread') THEN
    ALTER TABLE public.inbox_messages ADD CONSTRAINT fk_inbox_messages_workspace_thread
      FOREIGN KEY (workspace_id, thread_id) REFERENCES public.inbox_threads(workspace_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_checkouts_workspace_contact') THEN
    ALTER TABLE public.payment_checkouts ADD CONSTRAINT fk_payment_checkouts_workspace_contact
      FOREIGN KEY (workspace_id, contact_id) REFERENCES public.contacts(workspace_id, id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_checkouts_workspace_thread') THEN
    ALTER TABLE public.payment_checkouts ADD CONSTRAINT fk_payment_checkouts_workspace_thread
      FOREIGN KEY (workspace_id, thread_id) REFERENCES public.inbox_threads(workspace_id, id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_ledger_workspace_checkout') THEN
    ALTER TABLE public.payment_ledger ADD CONSTRAINT fk_payment_ledger_workspace_checkout
      FOREIGN KEY (workspace_id, checkout_id) REFERENCES public.payment_checkouts(workspace_id, id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 3. ESSENTIAL PERFORMANCE & IDEMPOTENCY INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON public.workspaces(slug);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON public.workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_ws ON public.workspace_memberships(workspace_id);

CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON public.contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_deal_stage ON public.contacts(workspace_id, deal_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(workspace_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(workspace_id, phone);

CREATE INDEX IF NOT EXISTS idx_inbox_threads_ws ON public.inbox_threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_contact ON public.inbox_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_ws_channel ON public.inbox_threads(workspace_id, channel);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_ws_last_msg ON public.inbox_threads(workspace_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_ws_thread ON public.inbox_messages(workspace_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_created_at ON public.inbox_messages(thread_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_messages_ws_ext_id
  ON public.inbox_messages(workspace_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_checkouts_ws ON public.payment_checkouts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_checkouts_session ON public.payment_checkouts(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_payment_checkouts_thread ON public.payment_checkouts(thread_id);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_ws ON public.payment_ledger(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_checkout ON public.payment_ledger(checkout_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_provider_event ON public.payment_ledger(provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event ON public.webhook_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_ws ON public.webhook_events(workspace_id);

-- ============================================================================
-- 4. HARDENED SECURITY DEFINER AUTHORIZATION FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = target_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = target_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.status = 'active'
      AND wm.role = ANY(allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_workspace(target_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = target_workspace_id
      AND w.owner_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_workspace_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.owns_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_workspace(uuid) TO authenticated, service_role;

-- ============================================================================
-- 5. ATOMIC WORKSPACE PROVISIONING RPC
-- ============================================================================
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
    p_workspace_type,
    p_plan,
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

-- ============================================================================
-- 6. FINANCIAL IMMUTABILITY & MUTATION GUARDS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_payment_checkout_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Forbid non-service_role users from marking checkouts paid
  IF (NEW.status = 'paid' AND OLD.status != 'paid') THEN
    IF (auth.role() != 'service_role') THEN
      RAISE EXCEPTION 'Security violation: Only verified payment webhooks may mark checkouts as paid.';
    END IF;
  END IF;

  -- Amount and currency cannot be modified after initial creation
  IF (NEW.amount != OLD.amount OR NEW.currency != OLD.currency) THEN
    IF (auth.role() != 'service_role') THEN
      RAISE EXCEPTION 'Security violation: Financial amount and currency cannot be modified after creation.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_checkout_mutation ON public.payment_checkouts;
CREATE TRIGGER trg_payment_checkout_mutation
  BEFORE UPDATE ON public.payment_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.check_payment_checkout_mutation();

-- Payment ledger is strictly append-only
CREATE OR REPLACE FUNCTION public.check_payment_ledger_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Security violation: payment_ledger is an immutable audit log. Updates and deletes are prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_ledger_immutability ON public.payment_ledger;
CREATE TRIGGER trg_payment_ledger_immutability
  BEFORE UPDATE OR DELETE ON public.payment_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.check_payment_ledger_immutability();

-- ============================================================================
-- 7. ROW LEVEL SECURITY ACTIVATION & POLICIES
-- ============================================================================
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Idempotent policy drops
DROP POLICY IF EXISTS "workspaces_select_member" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_insert_authenticated" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update_owner_admin" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_delete_owner_only" ON public.workspaces;

DROP POLICY IF EXISTS "memberships_select_member" ON public.workspace_memberships;
DROP POLICY IF EXISTS "memberships_insert_privileged" ON public.workspace_memberships;
DROP POLICY IF EXISTS "memberships_update_admin" ON public.workspace_memberships;
DROP POLICY IF EXISTS "memberships_delete_admin" ON public.workspace_memberships;

DROP POLICY IF EXISTS "contacts_select_member" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert_operators" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update_operators" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete_managers" ON public.contacts;

DROP POLICY IF EXISTS "inbox_threads_select_member" ON public.inbox_threads;
DROP POLICY IF EXISTS "inbox_threads_insert_operators" ON public.inbox_threads;
DROP POLICY IF EXISTS "inbox_threads_update_operators" ON public.inbox_threads;
DROP POLICY IF EXISTS "inbox_threads_delete_managers" ON public.inbox_threads;

DROP POLICY IF EXISTS "inbox_messages_select_member" ON public.inbox_messages;
DROP POLICY IF EXISTS "inbox_messages_insert_operators" ON public.inbox_messages;
DROP POLICY IF EXISTS "inbox_messages_update_managers" ON public.inbox_messages;
DROP POLICY IF EXISTS "inbox_messages_delete_admin" ON public.inbox_messages;

DROP POLICY IF EXISTS "payment_checkouts_select_member" ON public.payment_checkouts;
DROP POLICY IF EXISTS "payment_checkouts_insert_operators" ON public.payment_checkouts;
DROP POLICY IF EXISTS "payment_checkouts_update_operators" ON public.payment_checkouts;
DROP POLICY IF EXISTS "payment_checkouts_delete_admin" ON public.payment_checkouts;

DROP POLICY IF EXISTS "payment_ledger_select_member" ON public.payment_ledger;
DROP POLICY IF EXISTS "payment_ledger_service_role_all" ON public.payment_ledger;

DROP POLICY IF EXISTS "webhook_events_select_member" ON public.webhook_events;
DROP POLICY IF EXISTS "webhook_events_service_role_all" ON public.webhook_events;

-- Workspaces
CREATE POLICY "workspaces_select_member"
  ON public.workspaces FOR SELECT
  USING (owner_user_id = auth.uid() OR public.is_workspace_member(id));

CREATE POLICY "workspaces_insert_authenticated"
  ON public.workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND owner_user_id = auth.uid());

CREATE POLICY "workspaces_update_owner_admin"
  ON public.workspaces FOR UPDATE
  USING (owner_user_id = auth.uid() OR public.has_workspace_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (owner_user_id = auth.uid() OR public.has_workspace_role(id, ARRAY['owner', 'admin']));

CREATE POLICY "workspaces_delete_owner_only"
  ON public.workspaces FOR DELETE
  USING (owner_user_id = auth.uid());

-- Workspace Memberships
CREATE POLICY "memberships_select_member"
  ON public.workspace_memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id));

CREATE POLICY "memberships_insert_privileged"
  ON public.workspace_memberships FOR INSERT
  WITH CHECK (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    OR (
      NOT EXISTS (SELECT 1 FROM public.workspace_memberships wm WHERE wm.workspace_id = workspace_id)
      AND user_id = auth.uid()
      AND role = 'owner'
    )
  );

CREATE POLICY "memberships_update_admin"
  ON public.workspace_memberships FOR UPDATE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

CREATE POLICY "memberships_delete_admin"
  ON public.workspace_memberships FOR DELETE
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

-- Contacts
CREATE POLICY "contacts_select_member"
  ON public.contacts FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "contacts_insert_operators"
  ON public.contacts FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "contacts_update_operators"
  ON public.contacts FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "contacts_delete_managers"
  ON public.contacts FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
  );

-- Inbox Threads
CREATE POLICY "inbox_threads_select_member"
  ON public.inbox_threads FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "inbox_threads_insert_operators"
  ON public.inbox_threads FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "inbox_threads_update_operators"
  ON public.inbox_threads FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "inbox_threads_delete_managers"
  ON public.inbox_threads FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
  );

-- Inbox Messages
CREATE POLICY "inbox_messages_select_member"
  ON public.inbox_messages FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "inbox_messages_insert_operators"
  ON public.inbox_messages FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "inbox_messages_update_managers"
  ON public.inbox_messages FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
  );

CREATE POLICY "inbox_messages_delete_admin"
  ON public.inbox_messages FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- Payment Checkouts
CREATE POLICY "payment_checkouts_select_member"
  ON public.payment_checkouts FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "payment_checkouts_insert_operators"
  ON public.payment_checkouts FOR INSERT
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "payment_checkouts_update_operators"
  ON public.payment_checkouts FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager', 'agent'])
  );

CREATE POLICY "payment_checkouts_delete_admin"
  ON public.payment_checkouts FOR DELETE
  USING (
    public.is_workspace_member(workspace_id)
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- Payment Ledger (Immutable, Service Role only for writes)
CREATE POLICY "payment_ledger_select_member"
  ON public.payment_ledger FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "payment_ledger_service_role_all"
  ON public.payment_ledger FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Webhook Events (Audit Log, Service Role only for writes)
CREATE POLICY "webhook_events_select_member"
  ON public.webhook_events FOR SELECT
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));

CREATE POLICY "webhook_events_service_role_all"
  ON public.webhook_events FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 8. FOUNDER CANONICAL RECOVERY & CRM BACKFILL (IDEMPOTENT)
-- ============================================================================
DO $$
DECLARE
  v_user RECORD;
  v_target_ws_id uuid;
  v_is_first_user boolean := true;
BEGIN
  -- Iterate through registered users in auth.users
  FOR v_user IN
    SELECT id, email, created_at FROM auth.users ORDER BY created_at ASC
  LOOP
    -- Check if user already holds an owner membership
    SELECT workspace_id INTO v_target_ws_id
    FROM public.workspace_memberships
    WHERE user_id = v_user.id AND role = 'owner'
    LIMIT 1;

    -- If no owner workspace exists, bootstrap appropriate workspace
    IF v_target_ws_id IS NULL THEN
      IF v_is_first_user THEN
        -- Primary Founder receives canonical "J10 NEXUS HQ"
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
          'J10 NEXUS HQ',
          'j10-nexus-hq-' || substring(v_user.id::text, 1, 8),
          'agency_master',
          'enterprise',
          'active',
          'J10 NEXUS HQ',
          '#3B82F6',
          v_user.id
        )
        RETURNING id INTO v_target_ws_id;
      ELSE
        -- Subsequent users receive standard client workspace
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
          COALESCE(split_part(v_user.email, '@', 1) || '''s Workspace', 'Client Workspace'),
          'ws-' || substring(v_user.id::text, 1, 8) || '-' || extract(epoch from now())::bigint::text,
          'client',
          'growth',
          'active',
          COALESCE(split_part(v_user.email, '@', 1) || '''s Workspace', 'Client Workspace'),
          '#3B82F6',
          v_user.id
        )
        RETURNING id INTO v_target_ws_id;
      END IF;

      -- Assign owner membership
      INSERT INTO public.workspace_memberships (
        workspace_id,
        user_id,
        role,
        status
      ) VALUES (
        v_target_ws_id,
        v_user.id,
        'owner',
        'active'
      );
    END IF;

    -- Bridge legacy crm_contacts: add workspace_id column if missing
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_contacts') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_contacts' AND column_name = 'workspace_id'
      ) THEN
        ALTER TABLE public.crm_contacts ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;
      END IF;

      -- Assign workspace_id to legacy crm_contacts
      UPDATE public.crm_contacts
      SET workspace_id = v_target_ws_id
      WHERE user_id = v_user.id AND workspace_id IS NULL;

      -- Backfill into canonical contacts table idempotently
      INSERT INTO public.contacts (
        id,
        workspace_id,
        name,
        email,
        phone,
        company,
        source,
        deal_stage,
        estimated_value,
        assigned_user_id,
        last_contact_at,
        created_at,
        updated_at
      )
      SELECT
        c.id,
        v_target_ws_id,
        trim(concat(c.first_name, ' ', COALESCE(c.last_name, ''))),
        c.email,
        c.phone,
        c.company,
        COALESCE(c.source, 'direct'),
        CASE lower(COALESCE(c.status, 'lead'))
          WHEN 'won' THEN 'won'
          WHEN 'qualified' THEN 'qualified'
          WHEN 'contacted' THEN 'qualified'
          WHEN 'interested' THEN 'proposal'
          WHEN 'lost' THEN 'churned'
          ELSE 'lead'
        END,
        COALESCE(c.estimated_value, 0.00),
        v_user.id,
        COALESCE(c.last_contacted_at, c.created_at, now()),
        COALESCE(c.created_at, now()),
        COALESCE(c.updated_at, now())
      FROM public.crm_contacts c
      WHERE c.user_id = v_user.id
      ON CONFLICT (id) DO NOTHING;
    END IF;

    v_is_first_user := false;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- 9. RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 10. VERIFICATION SUMMARY (Displayed in Supabase SQL Editor Results)
-- ============================================================================
SELECT
  (SELECT count(*) FROM public.workspaces) AS workspaces_count,
  (SELECT count(*) FROM public.workspace_memberships) AS memberships_count,
  (SELECT count(*) FROM public.contacts) AS contacts_count,
  (SELECT count(*) FROM public.inbox_threads) AS threads_count,
  (SELECT count(*) FROM public.payment_checkouts) AS checkouts_count,
  (SELECT count(*) FROM public.payment_ledger) AS ledger_count,
  (SELECT count(*) FROM public.webhook_events) AS webhook_events_count;
