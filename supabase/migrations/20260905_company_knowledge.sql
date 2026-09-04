-- Migration: 20260905_company_knowledge.sql
-- J10 NEXUS Company Brain & Knowledge Grounding Foundation

create table if not exists public.company_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'product_service',
  content text not null,
  tags text[] not null default '{}'::text[],
  status text not null default 'published',
  is_grounding_active boolean not null default true,
  token_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_knowledge_user_status
  on public.company_knowledge_documents (user_id, status, is_grounding_active);

create index if not exists idx_knowledge_user_category
  on public.company_knowledge_documents (user_id, category);

alter table public.company_knowledge_documents enable row level security;

create policy "Users can read their own knowledge documents"
  on public.company_knowledge_documents
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own knowledge documents"
  on public.company_knowledge_documents
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own knowledge documents"
  on public.company_knowledge_documents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own knowledge documents"
  on public.company_knowledge_documents
  for delete
  using (auth.uid() = user_id);
