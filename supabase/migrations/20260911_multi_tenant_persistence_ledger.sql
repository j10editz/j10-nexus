-- J10 NEXUS Canonical Multi-Tenant Data Foundation & Stripe Payment Ledger
-- Migration: 20260911_multi_tenant_persistence_ledger.sql

-- ============================================================================
-- 1. WORKSPACES TABLE
-- ============================================================================
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  workspace_type text not null default 'client' check (workspace_type in ('agency_master', 'client')),
  plan text not null default 'growth' check (plan in ('starter', 'growth', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'trial', 'past_due', 'suspended')),
  brand_name text not null,
  accent_color text not null default '#3B82F6',
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. WORKSPACE MEMBERSHIPS TABLE
-- ============================================================================
create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'manager', 'agent', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_workspace_memberships_workspace_user unique (workspace_id, user_id)
);

-- ============================================================================
-- 3. CONTACTS TABLE
-- ============================================================================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  source text not null default 'direct',
  deal_stage text not null default 'lead' check (deal_stage in ('lead', 'qualified', 'proposal', 'won', 'churned')),
  estimated_value numeric(12,2) not null default 0.00 check (estimated_value >= 0),
  assigned_user_id uuid references auth.users(id) on delete set null,
  last_contact_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. INBOX THREADS TABLE
-- ============================================================================
create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'website', 'crm')),
  external_thread_id text,
  status text not null default 'active' check (status in ('active', 'archived', 'resolved')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz not null default now(),
  assigned_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 5. INBOX MESSAGES TABLE
-- ============================================================================
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'internal',
  external_message_id text,
  content text not null,
  delivery_status text not null default 'sent' check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  message_type text not null default 'text' check (message_type in ('text', 'payment_request', 'template', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 6. PAYMENT CHECKOUTS TABLE
-- ============================================================================
create table if not exists public.payment_checkouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  description text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  checkout_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 7. PAYMENT LEDGER TABLE
-- ============================================================================
create table if not exists public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  checkout_id uuid references public.payment_checkouts(id) on delete set null,
  provider text not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null check (status in ('succeeded', 'failed', 'refunded', 'pending')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 8. WEBHOOK EVENTS TABLE
-- ============================================================================
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  payload_hash text,
  error_code text,
  error_message_sanitized text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint uq_webhook_events_provider_event unique (provider, provider_event_id)
);

-- ============================================================================
-- INDICES
-- ============================================================================
create index if not exists idx_workspaces_owner on public.workspaces(owner_user_id);
create index if not exists idx_workspaces_slug on public.workspaces(slug);

create index if not exists idx_workspace_memberships_user on public.workspace_memberships(user_id);
create index if not exists idx_workspace_memberships_ws on public.workspace_memberships(workspace_id);

create index if not exists idx_contacts_workspace on public.contacts(workspace_id);
create index if not exists idx_contacts_deal_stage on public.contacts(workspace_id, deal_stage);
create index if not exists idx_contacts_email on public.contacts(workspace_id, email);
create index if not exists idx_contacts_phone on public.contacts(workspace_id, phone);

create index if not exists idx_inbox_threads_ws on public.inbox_threads(workspace_id);
create index if not exists idx_inbox_threads_contact on public.inbox_threads(contact_id);
create index if not exists idx_inbox_threads_ws_channel on public.inbox_threads(workspace_id, channel);
create index if not exists idx_inbox_threads_ws_last_msg on public.inbox_threads(workspace_id, last_message_at desc);

create index if not exists idx_inbox_messages_ws_thread on public.inbox_messages(workspace_id, thread_id);
create index if not exists idx_inbox_messages_created_at on public.inbox_messages(thread_id, created_at asc);

create index if not exists idx_payment_checkouts_ws on public.payment_checkouts(workspace_id);
create index if not exists idx_payment_checkouts_session on public.payment_checkouts(stripe_checkout_session_id);
create index if not exists idx_payment_checkouts_thread on public.payment_checkouts(thread_id);

create index if not exists idx_payment_ledger_ws on public.payment_ledger(workspace_id);
create index if not exists idx_payment_ledger_checkout on public.payment_ledger(checkout_id);
create index if not exists idx_payment_ledger_provider_event on public.payment_ledger(provider, provider_event_id);

create index if not exists idx_webhook_events_provider_event on public.webhook_events(provider, provider_event_id);
create index if not exists idx_webhook_events_ws on public.webhook_events(workspace_id);

-- ============================================================================
-- AUTHORIZATION HELPER FUNCTIONS
-- ============================================================================
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function public.owns_workspace(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_user_id = auth.uid()
  );
$$;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.payment_checkouts enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.webhook_events enable row level security;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Workspaces Policies
create policy "workspaces_select_member"
  on public.workspaces
  for select
  using (
    owner_user_id = auth.uid()
    or public.is_workspace_member(id)
  );

create policy "workspaces_insert_authenticated"
  on public.workspaces
  for insert
  with check (
    auth.uid() is not null
    and owner_user_id = auth.uid()
  );

create policy "workspaces_update_owner_admin"
  on public.workspaces
  for update
  using (
    owner_user_id = auth.uid()
    or public.has_workspace_role(id, array['owner', 'admin'])
  )
  with check (
    owner_user_id = auth.uid()
    or public.has_workspace_role(id, array['owner', 'admin'])
  );

create policy "workspaces_delete_owner_only"
  on public.workspaces
  for delete
  using (
    owner_user_id = auth.uid()
  );

-- Workspace Memberships Policies
create policy "memberships_select_member"
  on public.workspace_memberships
  for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

create policy "memberships_insert_privileged"
  on public.workspace_memberships
  for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
    or (
      -- Initial workspace creation membership seed
      not exists (
        select 1 from public.workspace_memberships wm
        where wm.workspace_id = workspace_id
      )
      and user_id = auth.uid()
      and role = 'owner'
    )
  );

create policy "memberships_update_admin"
  on public.workspace_memberships
  for update
  using (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
  )
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

create policy "memberships_delete_admin"
  on public.workspace_memberships
  for delete
  using (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Contacts Policies
create policy "contacts_select_member"
  on public.contacts
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "contacts_insert_operators"
  on public.contacts
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "contacts_update_operators"
  on public.contacts
  for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "contacts_delete_managers"
  on public.contacts
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

-- Inbox Threads Policies
create policy "inbox_threads_select_member"
  on public.inbox_threads
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "inbox_threads_insert_operators"
  on public.inbox_threads
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_threads_update_operators"
  on public.inbox_threads
  for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_threads_delete_managers"
  on public.inbox_threads
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

-- Inbox Messages Policies
create policy "inbox_messages_select_member"
  on public.inbox_messages
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "inbox_messages_insert_operators"
  on public.inbox_messages
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_messages_update_managers"
  on public.inbox_messages
  for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

create policy "inbox_messages_delete_admin"
  on public.inbox_messages
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Payment Checkouts Policies
create policy "payment_checkouts_select_member"
  on public.payment_checkouts
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "payment_checkouts_insert_operators"
  on public.payment_checkouts
  for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "payment_checkouts_update_operators"
  on public.payment_checkouts
  for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "payment_checkouts_delete_admin"
  on public.payment_checkouts
  for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Payment Ledger Policies
create policy "payment_ledger_select_member"
  on public.payment_ledger
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

create policy "payment_ledger_service_role_all"
  on public.payment_ledger
  for all
  using (
    auth.role() = 'service_role'
  )
  with check (
    auth.role() = 'service_role'
  );

-- Webhook Events Policies
create policy "webhook_events_select_member"
  on public.webhook_events
  for select
  using (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
  );

create policy "webhook_events_service_role_all"
  on public.webhook_events
  for all
  using (
    auth.role() = 'service_role'
  );
