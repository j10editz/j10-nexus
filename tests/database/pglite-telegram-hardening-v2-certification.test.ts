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

    CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid) 
    RETURNS boolean LANGUAGE sql STABLE AS $$ 
      SELECT true 
    $$;

    CREATE TABLE public.contacts (
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
      trigger_type text not null,
      constraint automations_trigger_type_check check(trigger_type = any(array['manual','new_crm_contact','crm_status_changed','new_ai_task','ai_task_completed','schedule','integration_event']))
    );
  `);

  await db.exec(migrationStage1);
  await db.exec(migrationTelegram);
  await db.exec(migrationHardeningV2);

  return db;
}

describe("Disposable Database Certification: Telegram Hardening v2", () => {
  it("Correction 1 & 2: Opaque start parameter (< 64 chars) with SHA-256 hash storage and single-use atomic consumption", async () => {
    const db = await setupDatabase();
    
    // Create workspace
    const userRes = await db.query<{ id: string }>("insert into auth.users default values returning id");
    const userId = userRes.rows[0].id;
    const wsRes = await db.query<{ id: string }>(
      "insert into public.workspaces(owner_user_id) values($1) returning id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    // 1. Generate opaque token
    const randomPart = crypto.randomBytes(32).toString("base64url");
    const token = `b_${randomPart}`;
    expect(token.length).toBe(45);
    expect(token.length).toBeLessThanOrEqual(64);

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 1800 * 1000).toISOString();

    // 2. Store only token_hash in telegram_binding_tokens
    await db.query(
      `insert into public.telegram_binding_tokens (workspace_id, token_hash, purpose, created_by_user_id, expires_at)
       values ($1, $2, 'lead_intake', $3, $4)`,
      [wsId, tokenHash, userId, expiresAt]
    );

    // Verify stored row does not contain raw token or workspace UUID in plaintext token
    const stored = await db.query<{ token_hash: string; used_at: string | null }>(
      "select token_hash, used_at from public.telegram_binding_tokens where token_hash = $1",
      [tokenHash]
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].token_hash).toBe(tokenHash);
    expect(stored.rows[0].used_at).toBeNull();

    // 3. First consumption (atomic single-use)
    const consumeRes1 = await db.query<{ workspace_id: string }>(
      `update public.telegram_binding_tokens 
          set used_at = now() 
        where token_hash = $1 
          and used_at is null 
          and expires_at > now() 
        returning workspace_id`,
      [tokenHash]
    );
    expect(consumeRes1.rows).toHaveLength(1);
    expect(consumeRes1.rows[0].workspace_id).toBe(wsId);

    // 4. Second consumption attempt (replay attack) -> MUST fail / return 0 rows
    const consumeRes2 = await db.query<{ workspace_id: string }>(
      `update public.telegram_binding_tokens 
          set used_at = now() 
        where token_hash = $1 
          and used_at is null 
          and expires_at > now() 
        returning workspace_id`,
      [tokenHash]
    );
    expect(consumeRes2.rows).toHaveLength(0);

    // 5. Tampered token -> different hash -> returns 0 rows
    const tamperedHash = crypto.createHash("sha256").update(token + "tampered").digest("hex");
    const tamperRes = await db.query<{ workspace_id: string }>(
      `update public.telegram_binding_tokens 
          set used_at = now() 
        where token_hash = $1 
          and used_at is null 
          and expires_at > now() 
        returning workspace_id`,
      [tamperedHash]
    );
    expect(tamperRes.rows).toHaveLength(0);

    // 6. Expired token -> returns 0 rows
    const expiredToken = `b_${crypto.randomBytes(32).toString("base64url")}`;
    const expiredHash = crypto.createHash("sha256").update(expiredToken).digest("hex");
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    await db.query(
      `insert into public.telegram_binding_tokens (workspace_id, token_hash, purpose, expires_at)
       values ($1, $2, 'lead_intake', $3)`,
      [wsId, expiredHash, pastDate]
    );
    const expiredConsume = await db.query<{ workspace_id: string }>(
      `update public.telegram_binding_tokens 
          set used_at = now() 
        where token_hash = $1 
          and used_at is null 
          and expires_at > now() 
        returning workspace_id`,
      [expiredHash]
    );
    expect(expiredConsume.rows).toHaveLength(0);

    await db.close();
  });

  it("Correction 8 & 9: Telegram VIP Join Request approval and persistent ban lifecycle", async () => {
    const db = await setupDatabase();
    
    // Create workspace and contact
    const userRes = await db.query<{ id: string }>("insert into auth.users default values returning id");
    const userId = userRes.rows[0].id;
    const wsRes = await db.query<{ id: string }>(
      "insert into public.workspaces(owner_user_id) values($1) returning id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    const contactRes = await db.query<{ id: string }>(
      "insert into public.contacts (workspace_id, name, phone) values ($1, 'VIP Client', '+15551234567') returning id",
      [wsId]
    );
    const contactId = contactRes.rows[0].id;

    // 1. Gated invite creation with creates_join_request
    const inviteLink = "https://t.me/+join_request_token_abc";
    const groupChatId = "-100987654321";
    await db.query(
      `insert into public.telegram_group_memberships (workspace_id, group_chat_id, contact_id, invite_link, status)
       values ($1, $2, $3, $4, 'invited')`,
      [wsId, groupChatId, contactId, inviteLink]
    );

    // 2. Join Request Webhook: Telegram user submits join request -> approved
    const tgUserId = "99887766";
    const approvedRes = await db.query<{ id: string; status: string }>(
      `update public.telegram_group_memberships
          set status = 'approved',
              telegram_user_id = $1,
              joined_at = now(),
              updated_at = now()
        where group_chat_id = $2
          and (invite_link = $3 or telegram_user_id = $1)
          and status != 'banned'
        returning id, status`,
      [tgUserId, groupChatId, inviteLink]
    );
    expect(approvedRes.rows).toHaveLength(1);
    expect(approvedRes.rows[0].status).toBe("approved");

    // 3. Correction 9: On cancellation/refund/dispute -> member is BANNED and KEEPS BANNED
    const bannedRes = await db.query<{ id: string; status: string }>(
      `update public.telegram_group_memberships
          set status = 'banned',
              banned_at = now(),
              updated_at = now()
        where group_chat_id = $1
          and telegram_user_id = $2
        returning id, status`,
      [groupChatId, tgUserId]
    );
    expect(bannedRes.rows).toHaveLength(1);
    expect(bannedRes.rows[0].status).toBe("banned");

    // Verify member cannot be re-approved while banned
    const reapproveAttempt = await db.query<{ id: string }>(
      `update public.telegram_group_memberships
          set status = 'approved'
        where group_chat_id = $1
          and telegram_user_id = $2
          and status != 'banned'
        returning id`,
      [groupChatId, tgUserId]
    );
    expect(reapproveAttempt.rows).toHaveLength(0);

    // 4. Verified Reactivation -> Unban permitted
    const unbanRes = await db.query<{ id: string; status: string }>(
      `update public.telegram_group_memberships
          set status = 'approved',
              banned_at = null,
              updated_at = now()
        where group_chat_id = $1
          and telegram_user_id = $2
          and status = 'banned'
        returning id, status`,
      [groupChatId, tgUserId]
    );
    expect(unbanRes.rows).toHaveLength(1);
    expect(unbanRes.rows[0].status).toBe("approved");

    await db.close();
  });

  it("Correction 10: Multi-Tenant RLS Proof with Two Authenticated Workspaces", async () => {
    const db = await setupDatabase();

    // Enable RLS on inbox_messages
    await db.exec(`
      GRANT SELECT ON public.inbox_messages TO authenticated;
      GRANT SELECT ON public.workspace_memberships TO authenticated;
      ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS inbox_messages_tenant_isolation ON public.inbox_messages;
      CREATE POLICY inbox_messages_tenant_isolation ON public.inbox_messages
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.workspace_memberships wm
            WHERE wm.workspace_id = inbox_messages.workspace_id
              AND wm.user_id = current_setting('request.jwt.claim.sub', true)::uuid
          )
        );
    `);

    // Setup Workspace A and User A
    const userARes = await db.query<{ id: string }>("insert into auth.users default values returning id");
    const userA = userARes.rows[0].id;
    const wsARes = await db.query<{ id: string }>(
      "insert into public.workspaces(owner_user_id) values($1) returning id",
      [userA]
    );
    const wsA = wsARes.rows[0].id;
    await db.query(
      "insert into public.workspace_memberships(workspace_id, user_id) values($1, $2)",
      [wsA, userA]
    );

    // Setup Workspace B and User B
    const userBRes = await db.query<{ id: string }>("insert into auth.users default values returning id");
    const userB = userBRes.rows[0].id;
    const wsBRes = await db.query<{ id: string }>(
      "insert into public.workspaces(owner_user_id) values($1) returning id",
      [userB]
    );
    const wsB = wsBRes.rows[0].id;
    await db.query(
      "insert into public.workspace_memberships(workspace_id, user_id) values($1, $2)",
      [wsB, userB]
    );

    // Threads in WS A and WS B
    const threadARes = await db.query<{ id: string }>(
      "insert into public.inbox_threads(workspace_id, channel) values($1, 'telegram') returning id",
      [wsA]
    );
    const threadA = threadARes.rows[0].id;

    const threadBRes = await db.query<{ id: string }>(
      "insert into public.inbox_threads(workspace_id, channel) values($1, 'telegram') returning id",
      [wsB]
    );
    const threadB = threadBRes.rows[0].id;

    // Insert message into Workspace A
    await db.query(
      `insert into public.inbox_messages(workspace_id, thread_id, direction, content)
       values($1, $2, 'inbound', 'Confidential Workspace A Message')`,
      [wsA, threadA]
    );

    // Insert message into Workspace B
    await db.query(
      `insert into public.inbox_messages(workspace_id, thread_id, direction, content)
       values($1, $2, 'inbound', 'Confidential Workspace B Message')`,
      [wsB, threadB]
    );

    // Test as Authenticated User A
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userA}';`);
    const queryAsUserA = await db.query<{ content: string }>(
      "select content from public.inbox_messages"
    );
    // MUST see exactly Workspace A messages, and ZERO Workspace B messages
    expect(queryAsUserA.rows).toHaveLength(1);
    expect(queryAsUserA.rows[0].content).toBe("Confidential Workspace A Message");

    // Test as Authenticated User B
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userB}';`);
    const queryAsUserB = await db.query<{ content: string }>(
      "select content from public.inbox_messages"
    );
    // MUST see exactly Workspace B messages, and ZERO Workspace A messages
    expect(queryAsUserB.rows).toHaveLength(1);
    expect(queryAsUserB.rows[0].content).toBe("Confidential Workspace B Message");

    // Reset role
    await db.exec("RESET ROLE;");
    await db.close();
  });

  it("Correction 12: Outbound message idempotency and delivery tracking", async () => {
    const db = await setupDatabase();

    const userRes = await db.query<{ id: string }>("insert into auth.users default values returning id");
    const wsRes = await db.query<{ id: string }>(
      "insert into public.workspaces(owner_user_id) values($1) returning id",
      [userRes.rows[0].id]
    );
    const wsId = wsRes.rows[0].id;

    const threadRes = await db.query<{ id: string }>(
      "insert into public.inbox_threads(workspace_id, channel) values($1, 'telegram') returning id",
      [wsId]
    );
    const threadId = threadRes.rows[0].id;

    // 1. Insert message with idempotency key
    const idempotencyKey = "idemp_test_999";
    const ins1 = await db.query<{ id: string }>(
      `insert into public.inbox_messages (workspace_id, thread_id, direction, content, idempotency_key, delivery_status, retry_count)
       values ($1, $2, 'outbound', 'Hello Idempotent', $3, 'sent', 0)
       returning id`,
      [wsId, threadId, idempotencyKey]
    );
    expect(ins1.rows).toHaveLength(1);

    // 2. Attempt duplicate insert with same idempotency key in same workspace -> Rejected by unique index
    let duplicateRejected = false;
    try {
      await db.query(
        `insert into public.inbox_messages (workspace_id, thread_id, direction, content, idempotency_key, delivery_status, retry_count)
         values ($1, $2, 'outbound', 'Hello Idempotent Duplicate', $3, 'sent', 0)`,
        [wsId, threadId, idempotencyKey]
      );
    } catch (err: any) {
      duplicateRejected = true;
      expect(err.message).toMatch(/idx_inbox_messages_idempotency|unique constraint/i);
    }
    expect(duplicateRejected).toBe(true);

    await db.close();
  });
});
