-- J10 NEXUS Subscription and Entitlement Enforcement Schema
-- Migration: 20260904_subscriptions_entitlements.sql

create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null default 'starter',
  status text not null default 'active',
  monthly_message_limit integer not null default 1000,
  messages_used_this_period integer not null default 0,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  grace_period_end timestamptz default null,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast user lookup
create index if not exists idx_workspace_subscriptions_user_id
  on public.workspace_subscriptions(user_id);

-- Index for active status filtering
create index if not exists idx_workspace_subscriptions_status
  on public.workspace_subscriptions(status);

-- Enable Row-Level Security
alter table public.workspace_subscriptions enable row level security;

-- RLS Policy: Users can view their own subscription
create policy "Users can view own subscription"
  on public.workspace_subscriptions
  for select
  using (auth.uid() = user_id);

-- RLS Policy: Users can update own subscription (or restricted to service role)
create policy "Service role manages subscriptions"
  on public.workspace_subscriptions
  for all
  using (true)
  with check (true);
