const { requireDatabaseUrl } = require("./lib/database-url.cjs");
const postgres = require("postgres");
const fs = require("fs");
const path = require("path");

async function run() {
  const sql = postgres(requireDatabaseUrl(), { max: 1 });
  console.log("Connected to Docker Supabase PostgreSQL on port 54322 as supabase_admin");

  // 1. Base schema setup
  await sql.unsafe(`

    CREATE TABLE IF NOT EXISTS public.workspaces (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid references auth.users(id),
      name text default 'Test Workspace',
      plan text default 'starter',
      status text default 'active',
      created_at timestamptz default now()
    );

    CREATE TABLE IF NOT EXISTS public.workspace_memberships (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      user_id uuid not null references auth.users(id),
      role text not null default 'member',
      created_at timestamptz default now(),
      unique(workspace_id, user_id)
    );

    CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid) 
    RETURNS boolean LANGUAGE sql STABLE AS $$ 
      SELECT true 
    $$;

    CREATE TABLE IF NOT EXISTS public.contacts (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      name text not null,
      first_name text,
      email text,
      phone text,
      source text not null default 'direct',
      deal_stage text not null default 'lead',
      type text,
      status text,
      metadata jsonb not null default '{}'::jsonb,
      unique(workspace_id, id)
    );

    CREATE TABLE IF NOT EXISTS public.inbox_threads (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      contact_id uuid,
      channel text not null default 'telegram',
      external_thread_id text,
      unread_count int default 0,
      last_message_at timestamptz default now(),
      metadata jsonb not null default '{}'::jsonb,
      unique(workspace_id, id)
    );

    CREATE TABLE IF NOT EXISTS public.inbox_messages (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      thread_id uuid not null references public.inbox_threads(id) on delete cascade,
      direction text not null,
      provider text not null default 'internal',
      external_message_id text,
      content text not null,
      delivery_status text default 'delivered',
      message_type text default 'text',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(workspace_id, id)
    );

    CREATE TABLE IF NOT EXISTS public.integrations (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      provider text not null,
      status text not null default 'connected',
      metadata jsonb not null default '{}'::jsonb,
      public_configuration jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    CREATE TABLE IF NOT EXISTS public.integration_webhook_endpoints (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      integration_id uuid references public.integrations(id),
      user_id uuid references auth.users(id),
      provider text not null,
      environment text not null default 'production',
      endpoint_key text not null unique,
      status text not null default 'active',
      max_payload_bytes int default 5242880,
      last_received_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    CREATE TABLE IF NOT EXISTS public.automations (
      id uuid primary key default gen_random_uuid(),
      trigger_type text not null
    );
  `);
  console.log("Base tables created.");

  // 2. Stage 1 Lead Intake Migration
  const stage1 = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260925_stage1_lead_intake_foundation.sql"), "utf8");
  await sql.unsafe(stage1);
  console.log("Applied 20260925_stage1_lead_intake_foundation.sql");

  // 3. Stage 1 Telegram Omnichannel Migration
  const telegram = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260926_stage1_telegram_omnichannel.sql"), "utf8");
  await sql.unsafe(telegram);
  console.log("Applied 20260926_stage1_telegram_omnichannel.sql");

  // 4. Hardening v2 Migration
  const hardening = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260927_stage1_telegram_hardening_v2.sql"), "utf8");
  await sql.unsafe(hardening);
  console.log("Applied 20260927_stage1_telegram_hardening_v2.sql");

  // 5. Enable publication for Realtime replication
  await sql.unsafe(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
      END IF;
    END $$;

    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
    ALTER TABLE public.inbox_messages REPLICA IDENTITY FULL;
  `);
  console.log("Configured supabase_realtime publication for inbox_messages.");

  await sql.end();
  console.log("Database setup complete!");
}

run().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
