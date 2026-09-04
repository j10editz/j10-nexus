-- ============================================================================
-- J10 NEXUS: Adversarial Tenant Isolation, Referential Integrity,
-- Financial Immutability & Founder Workspace Recovery
-- Migration: 20260912_adversarial_tenant_integrity_recovery.sql
-- ============================================================================

-- 1. ENSURE CANONICAL 8 ENTITIES EXIST (IDEMPOTENT CREATION)
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
-- 2. COMPOSITE UNIQUENESS & CROSS-TENANT REFERENTIAL INTEGRITY
-- ============================================================================
do $$
begin
  -- Composite unique constraints on parent entities
  if not exists (select 1 from pg_constraint where conname = 'uq_contacts_workspace_id') then
    alter table public.contacts add constraint uq_contacts_workspace_id unique (workspace_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'uq_inbox_threads_workspace_id') then
    alter table public.inbox_threads add constraint uq_inbox_threads_workspace_id unique (workspace_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'uq_inbox_messages_workspace_id') then
    alter table public.inbox_messages add constraint uq_inbox_messages_workspace_id unique (workspace_id, id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'uq_payment_checkouts_workspace_id') then
    alter table public.payment_checkouts add constraint uq_payment_checkouts_workspace_id unique (workspace_id, id);
  end if;

  -- Composite foreign keys preventing cross-tenant record entanglement
  if not exists (select 1 from pg_constraint where conname = 'fk_inbox_threads_workspace_contact') then
    alter table public.inbox_threads add constraint fk_inbox_threads_workspace_contact
      foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_inbox_messages_workspace_thread') then
    alter table public.inbox_messages add constraint fk_inbox_messages_workspace_thread
      foreign key (workspace_id, thread_id) references public.inbox_threads(workspace_id, id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_payment_checkouts_workspace_contact') then
    alter table public.payment_checkouts add constraint fk_payment_checkouts_workspace_contact
      foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_payment_checkouts_workspace_thread') then
    alter table public.payment_checkouts add constraint fk_payment_checkouts_workspace_thread
      foreign key (workspace_id, thread_id) references public.inbox_threads(workspace_id, id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'fk_payment_ledger_workspace_checkout') then
    alter table public.payment_ledger add constraint fk_payment_ledger_workspace_checkout
      foreign key (workspace_id, checkout_id) references public.payment_checkouts(workspace_id, id) on delete set null;
  end if;
end $$;

-- Idempotency index on external message IDs per workspace
create unique index if not exists idx_inbox_messages_ws_ext_id
  on public.inbox_messages(workspace_id, external_message_id)
  where external_message_id is not null;

-- ============================================================================
-- 3. HARDENED SECURITY DEFINER AUTHORIZATION FUNCTIONS
-- ============================================================================
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_user_id = auth.uid()
  );
$$;

-- Revoke default public execution rights and grant only to trusted roles
revoke execute on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;

revoke execute on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;

revoke execute on function public.owns_workspace(uuid) from public;
grant execute on function public.owns_workspace(uuid) to authenticated, service_role;

-- ============================================================================
-- 4. ATOMIC WORKSPACE PROVISIONING RPC
-- ============================================================================
create or replace function public.provision_workspace(
  p_name text,
  p_slug text,
  p_brand_name text,
  p_accent_color text default '#3B82F6',
  p_workspace_type text default 'client',
  p_plan text default 'growth'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_workspace public.workspaces%rowtype;
  v_membership public.workspace_memberships%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required to provision a workspace.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Workspace name is required.';
  end if;

  -- 1. Atomically insert workspace
  insert into public.workspaces (
    name,
    slug,
    workspace_type,
    plan,
    status,
    brand_name,
    accent_color,
    owner_user_id
  ) values (
    trim(p_name),
    trim(p_slug),
    p_workspace_type,
    p_plan,
    'active',
    coalesce(trim(p_brand_name), trim(p_name)),
    coalesce(p_accent_color, '#3B82F6'),
    v_user_id
  )
  returning * into v_workspace;

  -- 2. Atomically insert owner membership in same transaction
  insert into public.workspace_memberships (
    workspace_id,
    user_id,
    role,
    status
  ) values (
    v_workspace.id,
    v_user_id,
    'owner',
    'active'
  )
  returning * into v_membership;

  return jsonb_build_object(
    'workspace', to_jsonb(v_workspace),
    'membership', to_jsonb(v_membership)
  );
end;
$$;

revoke execute on function public.provision_workspace(text, text, text, text, text, text) from public;
grant execute on function public.provision_workspace(text, text, text, text, text, text) to authenticated, service_role;

-- ============================================================================
-- 5. FINANCIAL IMMUTABILITY TRIGGERS
-- ============================================================================
create or replace function public.check_payment_checkout_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Forbid regular users from marking checkouts as paid
  if (new.status = 'paid' and old.status != 'paid') then
    if (auth.role() != 'service_role') then
      raise exception 'Security violation: Only verified payment webhooks may mark checkouts as paid.';
    end if;
  end if;

  -- Amount and currency cannot be modified after initial checkout creation
  if (new.amount != old.amount or new.currency != old.currency) then
    if (auth.role() != 'service_role') then
      raise exception 'Security violation: Financial amount and currency cannot be modified after creation.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payment_checkout_mutation on public.payment_checkouts;
create trigger trg_payment_checkout_mutation
  before update on public.payment_checkouts
  for each row
  execute function public.check_payment_checkout_mutation();

-- Payment ledger is strictly append-only
create or replace function public.check_payment_ledger_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Security violation: payment_ledger is an immutable audit log. Updates and deletes are prohibited.';
end;
$$;

drop trigger if exists trg_payment_ledger_immutability on public.payment_ledger;
create trigger trg_payment_ledger_immutability
  before update or delete on public.payment_ledger
  for each row
  execute function public.check_payment_ledger_immutability();

-- ============================================================================
-- 6. ROW LEVEL SECURITY ACTIVATION
-- ============================================================================
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.payment_checkouts enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.webhook_events enable row level security;

-- Drop existing policies if re-running
drop policy if exists "workspaces_select_member" on public.workspaces;
drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
drop policy if exists "workspaces_update_owner_admin" on public.workspaces;
drop policy if exists "workspaces_delete_owner_only" on public.workspaces;

drop policy if exists "memberships_select_member" on public.workspace_memberships;
drop policy if exists "memberships_insert_privileged" on public.workspace_memberships;
drop policy if exists "memberships_update_admin" on public.workspace_memberships;
drop policy if exists "memberships_delete_admin" on public.workspace_memberships;

drop policy if exists "contacts_select_member" on public.contacts;
drop policy if exists "contacts_insert_operators" on public.contacts;
drop policy if exists "contacts_update_operators" on public.contacts;
drop policy if exists "contacts_delete_managers" on public.contacts;

drop policy if exists "inbox_threads_select_member" on public.inbox_threads;
drop policy if exists "inbox_threads_insert_operators" on public.inbox_threads;
drop policy if exists "inbox_threads_update_operators" on public.inbox_threads;
drop policy if exists "inbox_threads_delete_managers" on public.inbox_threads;

drop policy if exists "inbox_messages_select_member" on public.inbox_messages;
drop policy if exists "inbox_messages_insert_operators" on public.inbox_messages;
drop policy if exists "inbox_messages_update_managers" on public.inbox_messages;
drop policy if exists "inbox_messages_delete_admin" on public.inbox_messages;

drop policy if exists "payment_checkouts_select_member" on public.payment_checkouts;
drop policy if exists "payment_checkouts_insert_operators" on public.payment_checkouts;
drop policy if exists "payment_checkouts_update_operators" on public.payment_checkouts;
drop policy if exists "payment_checkouts_delete_admin" on public.payment_checkouts;

drop policy if exists "payment_ledger_select_member" on public.payment_ledger;
drop policy if exists "payment_ledger_service_role_all" on public.payment_ledger;

drop policy if exists "webhook_events_select_member" on public.webhook_events;
drop policy if exists "webhook_events_service_role_all" on public.webhook_events;

-- Workspaces Policies
create policy "workspaces_select_member"
  on public.workspaces for select
  using (owner_user_id = auth.uid() or public.is_workspace_member(id));

create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  with check (auth.uid() is not null and owner_user_id = auth.uid());

create policy "workspaces_update_owner_admin"
  on public.workspaces for update
  using (owner_user_id = auth.uid() or public.has_workspace_role(id, array['owner', 'admin']))
  with check (owner_user_id = auth.uid() or public.has_workspace_role(id, array['owner', 'admin']));

create policy "workspaces_delete_owner_only"
  on public.workspaces for delete
  using (owner_user_id = auth.uid());

-- Workspace Memberships Policies
create policy "memberships_select_member"
  on public.workspace_memberships for select
  using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

create policy "memberships_insert_privileged"
  on public.workspace_memberships for insert
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
    or (
      not exists (select 1 from public.workspace_memberships wm where wm.workspace_id = workspace_id)
      and user_id = auth.uid()
      and role = 'owner'
    )
  );

create policy "memberships_update_admin"
  on public.workspace_memberships for update
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "memberships_delete_admin"
  on public.workspace_memberships for delete
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- Contacts Policies
create policy "contacts_select_member"
  on public.contacts for select
  using (public.is_workspace_member(workspace_id));

create policy "contacts_insert_operators"
  on public.contacts for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "contacts_update_operators"
  on public.contacts for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "contacts_delete_managers"
  on public.contacts for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

-- Inbox Threads Policies
create policy "inbox_threads_select_member"
  on public.inbox_threads for select
  using (public.is_workspace_member(workspace_id));

create policy "inbox_threads_insert_operators"
  on public.inbox_threads for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_threads_update_operators"
  on public.inbox_threads for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_threads_delete_managers"
  on public.inbox_threads for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

-- Inbox Messages Policies
create policy "inbox_messages_select_member"
  on public.inbox_messages for select
  using (public.is_workspace_member(workspace_id));

create policy "inbox_messages_insert_operators"
  on public.inbox_messages for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "inbox_messages_update_managers"
  on public.inbox_messages for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager'])
  );

create policy "inbox_messages_delete_admin"
  on public.inbox_messages for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Payment Checkouts Policies
create policy "payment_checkouts_select_member"
  on public.payment_checkouts for select
  using (public.is_workspace_member(workspace_id));

create policy "payment_checkouts_insert_operators"
  on public.payment_checkouts for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "payment_checkouts_update_operators"
  on public.payment_checkouts for update
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  )
  with check (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'manager', 'agent'])
  );

create policy "payment_checkouts_delete_admin"
  on public.payment_checkouts for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

-- Payment Ledger Policies (Append-Only, Service Role for Mutations)
create policy "payment_ledger_select_member"
  on public.payment_ledger for select
  using (public.is_workspace_member(workspace_id));

create policy "payment_ledger_service_role_all"
  on public.payment_ledger for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Webhook Events Policies (Audit Log, Service Role for Mutations)
create policy "webhook_events_select_member"
  on public.webhook_events for select
  using (workspace_id is null or public.is_workspace_member(workspace_id));

create policy "webhook_events_service_role_all"
  on public.webhook_events for all
  using (auth.role() = 'service_role');

-- ============================================================================
-- 7. LEGACY DATA MIGRATION & FOUNDER WORKSPACE BOOTSTRAP
-- ============================================================================
do $$
declare
  v_founder record;
  v_founder_ws_id uuid;
begin
  for v_founder in
    select id, email from auth.users order by created_at asc
  loop
    -- Check if user already holds an owner membership in any workspace
    select workspace_id into v_founder_ws_id
    from public.workspace_memberships
    where user_id = v_founder.id and role = 'owner'
    limit 1;

    -- If no owner workspace exists, idempotently provision "J10 NEXUS HQ"
    if v_founder_ws_id is null then
      insert into public.workspaces (
        name,
        slug,
        workspace_type,
        plan,
        status,
        brand_name,
        accent_color,
        owner_user_id
      ) values (
        'J10 NEXUS HQ',
        'j10-nexus-hq-' || substring(v_founder.id::text, 1, 8),
        'agency_master',
        'enterprise',
        'active',
        'J10 NEXUS HQ',
        '#3B82F6',
        v_founder.id
      )
      returning id into v_founder_ws_id;

      insert into public.workspace_memberships (
        workspace_id,
        user_id,
        role,
        status
      ) values (
        v_founder_ws_id,
        v_founder.id,
        'owner',
        'active'
      );
    end if;

    -- Bridge legacy crm_contacts: add workspace_id column and backfill records
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'crm_contacts') then
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'crm_contacts' and column_name = 'workspace_id'
      ) then
        alter table public.crm_contacts add column workspace_id uuid references public.workspaces(id) on delete set null;
      end if;

      -- Assign workspace_id to legacy contacts
      update public.crm_contacts
      set workspace_id = v_founder_ws_id
      where user_id = v_founder.id and workspace_id is null;

      -- Backfill into canonical contacts table
      insert into public.contacts (
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
      select
        c.id,
        v_founder_ws_id,
        trim(concat(c.first_name, ' ', coalesce(c.last_name, ''))),
        c.email,
        c.phone,
        c.company,
        coalesce(c.source, 'direct'),
        case lower(coalesce(c.status, 'lead'))
          when 'won' then 'won'
          when 'qualified' then 'qualified'
          when 'contacted' then 'qualified'
          when 'interested' then 'proposal'
          when 'lost' then 'churned'
          else 'lead'
        end,
        coalesce(c.estimated_value, 0.00),
        v_founder.id,
        coalesce(c.last_contacted_at, c.created_at, now()),
        coalesce(c.created_at, now()),
        coalesce(c.updated_at, now())
      from public.crm_contacts c
      where c.user_id = v_founder.id
      on conflict (id) do nothing;
    end if;
  end loop;
end $$;
