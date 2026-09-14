import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

const migrationStage1 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260925_stage1_lead_intake_foundation.sql"),
  "utf8"
);
const migrationTelegram = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260926_stage1_telegram_omnichannel.sql"),
  "utf8"
);
const migrationHardeningV2 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260927_stage1_telegram_hardening_v2.sql"),
  "utf8"
);
const migrationBusiness = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260930_telegram_business_connections.sql"),
  "utf8"
);

async function setupDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid primary key default gen_random_uuid(),
      email text
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    CREATE TABLE public.workspaces (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid references auth.users(id),
      plan text default 'starter',
      status text default 'active'
    );

    CREATE TABLE public.workspace_memberships (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      user_id uuid not null references auth.users(id),
      role text not null default 'member',
      unique(workspace_id, user_id)
    );

    CREATE OR REPLACE FUNCTION public.current_user_workspace_ids()
    RETURNS SETOF uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    AS $$
      SELECT workspace_id 
      FROM public.workspace_memberships 
      WHERE user_id = auth.uid()
    $$;

    CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    AS $$
      SELECT EXISTS (
        SELECT 1 
        FROM public.workspace_memberships 
        WHERE workspace_id = p_workspace_id 
          AND user_id = auth.uid()
      );
    $$;

    CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id uuid, p_roles text[])
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    AS $$
    DECLARE
      v_role text;
    BEGIN
      SELECT role INTO v_role
      FROM public.workspace_memberships
      WHERE workspace_id = p_workspace_id AND user_id = auth.uid();

      RETURN v_role IS NOT NULL AND v_role = ANY(p_roles);
    END;
    $$;

    CREATE TABLE public.contacts (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      name text not null,
      first_name text,
      last_name text,
      email text,
      phone text,
      source text not null default 'direct',
      deal_stage text not null default 'lead',
      type text,
      status text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(workspace_id, id)
    );

    CREATE TABLE public.inbox_threads (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      contact_id uuid,
      channel text not null check(channel in ('whatsapp', 'website', 'crm')),
      external_thread_id text,
      unread_count int default 0,
      last_message_at timestamptz default now(),
      metadata jsonb not null default '{}'::jsonb,
      unique(workspace_id, id)
    );

    CREATE TABLE public.inbox_messages (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      thread_id uuid not null,
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

    CREATE TABLE public.automations (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      name text not null,
      status text not null default 'active',
      trigger_type text not null,
      actions jsonb not null default '[]'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    CREATE TABLE public.outbox_events (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      event_type text not null,
      payload jsonb not null,
      status text not null default 'pending',
      created_at timestamptz not null default now()
    );

    CREATE TABLE IF NOT EXISTS public.integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      user_id UUID REFERENCES auth.users(id),
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      environment TEXT NOT NULL DEFAULT 'development',
      account_label TEXT,
      credential_reference TEXT,
      external_account_id TEXT,
      external_account_label TEXT,
      granted_scopes TEXT[] DEFAULT '{}'::TEXT[],
      enabled_capabilities TEXT[] DEFAULT '{}'::TEXT[],
      public_configuration JSONB DEFAULT '{}'::jsonb,
      metadata JSONB DEFAULT '{}'::jsonb,
      connected_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.exec(migrationStage1);
  await db.exec(migrationTelegram);
  await db.exec(migrationHardeningV2);
  await db.exec(migrationBusiness);

  return db;
}

describe("Telegram Business & Connection Sessions Migration Certification", () => {
  it("creates connection sessions and atomically consumes them with Telegram identity binding", async () => {
    const db = await setupDatabase();

    // Create user & workspace
    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('owner@tenant-a.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id) VALUES ($1) RETURNING id",
      [userId]
    );
    const workspaceId = wsRes.rows[0].id;

    // Generate token hash
    const rawToken = "tb_" + crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Insert pending session
    await db.query(
      `INSERT INTO public.telegram_connection_sessions (workspace_id, created_by_user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '15 minutes')`,
      [workspaceId, userId, tokenHash]
    );

    // Consume session via atomic RPC
    const consumeRes = await db.query<{ consume_telegram_business_session: any }>(
      `SELECT public.consume_telegram_business_session($1, $2, $3)`,
      [tokenHash, "99887766", "alice_business"]
    );
    const result = consumeRes.rows[0].consume_telegram_business_session;
    expect(result.valid).toBe(true);
    expect(result.workspace_id).toBe(workspaceId);

    // Replay attempt must fail (single use)
    const replayRes = await db.query<{ consume_telegram_business_session: any }>(
      `SELECT public.consume_telegram_business_session($1, $2, $3)`,
      [tokenHash, "99887766", "alice_business"]
    );
    expect(replayRes.rows[0].consume_telegram_business_session.valid).toBe(false);

    // Verify session row updated
    const sessionRow = await db.query<any>(
      "SELECT * FROM public.telegram_connection_sessions WHERE token_hash = $1",
      [tokenHash]
    );
    expect(sessionRow.rows[0].status).toBe("verified");
    expect(sessionRow.rows[0].telegram_user_id).toBe("99887766");
    expect(sessionRow.rows[0].telegram_username).toBe("alice_business");
  });

  it("enforces RLS cross-workspace isolation on business connections", async () => {
    const db = await setupDatabase();

    // Tenant A
    const uARes = await db.query<{ id: string }>("INSERT INTO auth.users (email) VALUES ('a@test.com') RETURNING id");
    const userA = uARes.rows[0].id;
    const wsARes = await db.query<{ id: string }>("INSERT INTO public.workspaces (owner_user_id) VALUES ($1) RETURNING id", [userA]);
    const wsA = wsARes.rows[0].id;
    await db.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [wsA, userA]);

    // Tenant B
    const uBRes = await db.query<{ id: string }>("INSERT INTO auth.users (email) VALUES ('b@test.com') RETURNING id");
    const userB = uBRes.rows[0].id;
    const wsBRes = await db.query<{ id: string }>("INSERT INTO public.workspaces (owner_user_id) VALUES ($1) RETURNING id", [userB]);
    const wsB = wsBRes.rows[0].id;
    await db.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [wsB, userB]);

    // Insert connection for Tenant A via service_role
    await db.query(`
      INSERT INTO public.telegram_business_connections (
        workspace_id, business_connection_id, telegram_user_id, user_chat_id, can_reply, is_enabled
      ) VALUES ($1, 'bc_tenant_a_123', '11111', '11111', true, true)
    `, [wsA]);

    // Query as User B (Tenant B)
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userB}';`);
    const tenantBQuery = await db.query("SELECT * FROM public.telegram_business_connections");
    // Tenant B must see 0 rows
    expect(tenantBQuery.rows.length).toBe(0);

    // Query as User A (Tenant A)
    await db.exec(`SET "request.jwt.claim.sub" = '${userA}';`);
    const tenantAQuery = await db.query("SELECT * FROM public.telegram_business_connections");
    // Tenant A must see its own connection
    expect(tenantAQuery.rows.length).toBe(1);
    expect((tenantAQuery.rows[0] as any).business_connection_id).toBe("bc_tenant_a_123");

    // Reset role
    await db.exec("RESET ROLE;");
  });

  it("revokes rights and deletes data cleanly via delete_telegram_business_data RPC", async () => {
    const db = await setupDatabase();

    const uRes = await db.query<{ id: string }>("INSERT INTO auth.users (email) VALUES ('clean@test.com') RETURNING id");
    const userId = uRes.rows[0].id;
    const wsRes = await db.query<{ id: string }>("INSERT INTO public.workspaces (owner_user_id) VALUES ($1) RETURNING id", [userId]);
    const workspaceId = wsRes.rows[0].id;
    await db.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [workspaceId, userId]);

    // Setup active connection & thread & messages
    await db.query(`
      INSERT INTO public.telegram_business_connections (
        workspace_id, business_connection_id, telegram_user_id, user_chat_id, can_reply, is_enabled, status
      ) VALUES ($1, 'bc_del_test', '22222', '22222', true, true, 'active')
    `, [workspaceId]);

    await db.query(`
      INSERT INTO public.telegram_connection_consents (workspace_id, user_id, consent_version)
      VALUES ($1, $2, '2026.1')
    `, [workspaceId, userId]);

    const threadRes = await db.query<{ id: string }>(`
      INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id, metadata)
      VALUES ($1, 'telegram', '22222', '{"business_connection_id": "bc_del_test"}'::jsonb) RETURNING id
    `, [workspaceId]);
    const threadId = threadRes.rows[0].id;

    await db.query(`
      INSERT INTO public.inbox_messages (workspace_id, thread_id, direction, provider, content)
      VALUES ($1, $2, 'inbound', 'telegram', 'Hello business test')
    `, [workspaceId, threadId]);

    // Call create_telegram_deletion_intent & execute_telegram_scoped_deletion as owner
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}';`);
    const rawDelToken = `tdel_${crypto.randomBytes(32).toString("hex")}`;
    const delTokenHash = crypto.createHash("sha256").update(rawDelToken).digest("hex");

    const intentRes = await db.query<{ create_telegram_deletion_intent: any }>(
      "SELECT public.create_telegram_deletion_intent($1, 'bc_del_test', $2, $3) as create_telegram_deletion_intent",
      [workspaceId, delTokenHash, userId]
    );
    expect(intentRes.rows[0].create_telegram_deletion_intent.intent_id).toBeDefined();

    const delRes = await db.query<{ execute_telegram_scoped_deletion: any }>(
      "SELECT public.execute_telegram_scoped_deletion($1, 'bc_del_test', $2, true) as execute_telegram_scoped_deletion",
      [workspaceId, delTokenHash]
    );
    const delResult = delRes.rows[0].execute_telegram_scoped_deletion;
    expect(delResult.success).toBe(true);
    expect(delResult.connections_updated).toBe(1);
    expect(delResult.messages_deleted).toBe(1);
    expect(delResult.threads_deleted).toBe(1);

    // Verify connection is local_disabled and can_reply is false
    const connCheck = await db.query<any>(
      "SELECT * FROM public.telegram_business_connections WHERE workspace_id = $1",
      [workspaceId]
    );
    expect(connCheck.rows[0].status).toBe("local_disabled");
    expect(connCheck.rows[0].can_reply).toBe(false);
    expect(connCheck.rows[0].is_enabled).toBe(false);

    // Verify consent is revoked
    const consentCheck = await db.query<any>(
      "SELECT * FROM public.telegram_connection_consents WHERE workspace_id = $1",
      [workspaceId]
    );
    expect(consentCheck.rows[0].revoked_at).not.toBeNull();

    await db.exec("RESET ROLE;");
  });
});
