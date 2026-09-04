-- J10 NEXUS Hybrid Workforce & HR Schema
-- Migration: 20260908_workforce_hr.sql

create table if not exists public.workforce_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text not null,
  department text not null default 'Operations', -- Sales, Marketing, Customer Success, Engineering, Executive
  email text not null,
  phone text,
  status text not null default 'active', -- active, on_leave, remote
  assigned_agents text[] not null default '{}', -- names or IDs of AI employees supervised
  monthly_salary numeric(10,2) default 0.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index if not exists idx_workforce_members_user_id
  on public.workforce_members(user_id);

create index if not exists idx_workforce_members_department
  on public.workforce_members(department);

-- Enable RLS
alter table public.workforce_members enable row level security;

-- Policies
create policy "Users can view own workforce"
  on public.workforce_members
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own workforce"
  on public.workforce_members
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workforce"
  on public.workforce_members
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own workforce"
  on public.workforce_members
  for delete
  using (auth.uid() = user_id);
