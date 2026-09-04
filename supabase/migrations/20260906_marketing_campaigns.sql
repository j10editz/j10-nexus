-- Migration: 20260906_marketing_campaigns.sql
-- J10 NEXUS Omni-Channel Marketing & Broadcast Engine

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  channel text not null default 'whatsapp',
  audience_segment text not null default 'all',
  status text not null default 'draft',
  target_count integer not null default 0,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  replied_count integer not null default 0,
  message_template text not null,
  scheduled_at timestamptz default null,
  completed_at timestamptz default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_campaigns_user_status
  on public.marketing_campaigns (user_id, status);

create index if not exists idx_marketing_campaigns_channel
  on public.marketing_campaigns (user_id, channel);

alter table public.marketing_campaigns enable row level security;

create policy "Users can view their own marketing campaigns"
  on public.marketing_campaigns
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own marketing campaigns"
  on public.marketing_campaigns
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own marketing campaigns"
  on public.marketing_campaigns
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own marketing campaigns"
  on public.marketing_campaigns
  for delete
  using (auth.uid() = user_id);
