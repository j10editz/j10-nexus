-- J10 NEXUS E-Commerce Catalog & Orders Schema
-- Migration: 20260910_commerce_catalog_orders.sql

create table if not exists public.commerce_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text not null,
  description text,
  price numeric(10,2) not null default 0.00,
  currency text not null default 'USD',
  inventory integer not null default 0,
  category text not null default 'General',
  status text not null default 'active', -- active, out_of_stock, archived
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  total_amount numeric(10,2) not null default 0.00,
  currency text not null default 'USD',
  status text not null default 'pending', -- pending, paid, fulfilled, canceled
  items jsonb not null default '[]'::jsonb,
  payment_method text not null default 'stripe',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index if not exists idx_commerce_products_user_id
  on public.commerce_products(user_id);

create index if not exists idx_commerce_products_category
  on public.commerce_products(category);

create index if not exists idx_commerce_orders_user_id
  on public.commerce_orders(user_id);

create index if not exists idx_commerce_orders_status
  on public.commerce_orders(status);

-- Enable RLS
alter table public.commerce_products enable row level security;
alter table public.commerce_orders enable row level security;

-- Products Policies
create policy "Users can view own products"
  on public.commerce_products
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own products"
  on public.commerce_products
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own products"
  on public.commerce_products
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own products"
  on public.commerce_products
  for delete
  using (auth.uid() = user_id);

-- Orders Policies
create policy "Users can view own orders"
  on public.commerce_orders
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own orders"
  on public.commerce_orders
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own orders"
  on public.commerce_orders
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own orders"
  on public.commerce_orders
  for delete
  using (auth.uid() = user_id);
