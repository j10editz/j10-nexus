-- J10 NEXUS AI Website & Conversion Funnel Engine Schema
-- Migration: 20260909_website_funnels.sql

create table if not exists public.website_funnels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'High-Converting Business Landing Page',
  slug text not null default 'main',
  theme text not null default 'obsidian',
  custom_domain text,
  is_published boolean not null default false,
  hero_headline text not null default 'Transform Operations with Autonomous AI Systems',
  hero_subheadline text not null default 'Deploy 24/7 WhatsApp sales agents, automated CRM lead capture, and intelligent billing.',
  primary_cta_text text not null default 'Start on WhatsApp',
  primary_cta_link text,
  features jsonb not null default '[]'::jsonb,
  testimonials jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index if not exists idx_website_funnels_user_id
  on public.website_funnels(user_id);

create index if not exists idx_website_funnels_slug
  on public.website_funnels(slug);

-- Enable RLS
alter table public.website_funnels enable row level security;

-- Policies
create policy "Users can view own funnels"
  on public.website_funnels
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own funnels"
  on public.website_funnels
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own funnels"
  on public.website_funnels
  for update
  using (auth.uid() = user_id);

create policy "Users can delete own funnels"
  on public.website_funnels
  for delete
  using (auth.uid() = user_id);
