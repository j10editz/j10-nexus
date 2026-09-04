-- J10 NEXUS Finance & Invoicing Operations Schema
-- Migration: 20260907_finance_invoices.sql

create table if not exists public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  amount numeric(12,2) not null default 0.00,
  currency text not null default 'USD',
  status text not null default 'draft', -- draft, sent, paid, overdue, canceled
  issue_date date not null default current_date,
  due_date date not null default (current_date + interval '14 days'),
  paid_at timestamptz,
  line_items jsonb not null default '[]'::jsonb,
  notes text,
  payment_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices for rapid indexing
create index if not exists idx_finance_invoices_user_id
  on public.finance_invoices(user_id);

create index if not exists idx_finance_invoices_status
  on public.finance_invoices(status);

create index if not exists idx_finance_invoices_due_date
  on public.finance_invoices(due_date);

-- Enable RLS
alter table public.finance_invoices enable row level security;

-- Policies
create policy "Users can view own invoices"
  on public.finance_invoices
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own invoices"
  on public.finance_invoices
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own invoices"
  on public.finance_invoices
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own invoices"
  on public.finance_invoices
  for delete
  using (auth.uid() = user_id);
