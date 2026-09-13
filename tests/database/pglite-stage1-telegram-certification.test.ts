import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationStage1 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260925_stage1_lead_intake_foundation.sql"),
  "utf8"
);
const migrationTelegram = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260926_stage1_telegram_omnichannel.sql"),
  "utf8"
);

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid primary key default gen_random_uuid());
    CREATE TABLE public.workspaces (id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id));
    CREATE TABLE public.workspace_memberships (workspace_id uuid not null, user_id uuid not null, unique(workspace_id, user_id));
    CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE public.contacts (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), name text not null, first_name text, email text, phone text, source text not null default 'direct', deal_stage text not null default 'lead', type text, status text, metadata jsonb not null default '{}'::jsonb, unique(workspace_id, id));
    CREATE TABLE public.inbox_threads (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), contact_id uuid, channel text not null check(channel in ('whatsapp', 'website', 'crm')), external_thread_id text, metadata jsonb not null default '{}'::jsonb, unique(workspace_id, id));
    CREATE TABLE public.inbox_messages (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), thread_id uuid not null, direction text not null, provider text not null default 'internal', external_message_id text, content text not null, metadata jsonb not null default '{}'::jsonb, unique(workspace_id, id));
    CREATE TABLE public.automations (id uuid primary key default gen_random_uuid(), trigger_type text not null, constraint automations_trigger_type_check check(trigger_type = any(array['manual','new_crm_contact','crm_status_changed','new_ai_task','ai_task_completed','schedule','integration_event'])));
  `);
  await db.exec(migrationStage1);
  await db.exec(migrationTelegram);
  return db;
}

async function workspace(db: PGlite) {
  const user = await db.query<{ id: string }>("insert into auth.users default values returning id");
  const result = await db.query<{ id: string }>(
    "insert into public.workspaces(owner_user_id) values($1) returning id",
    [user.rows[0].id]
  );
  return result.rows[0].id;
}

async function telegramIntake(
  db: PGlite,
  workspaceId: string,
  key: string,
  telegramUserId = "tg_12345",
  chatId = "chat_888",
  message = "Hello from Telegram",
  sourceEventId = "msg_101"
) {
  return db.query<{ record_lead_intake: Record<string, unknown> }>(
    `select public.record_lead_intake(
      $1,
      'telegram',
      'telegram',
      $2,
      'Alex Telegram',
      null,
      null,
      $3,
      null,
      '{}'::jsonb,
      '[]'::jsonb,
      $4,
      jsonb_build_object('telegram_user_id', $5::text, 'telegram_chat_id', $6::text, 'telegram_username', 'alex_tg')
    )`,
    [workspaceId, key, message, sourceEventId, telegramUserId, chatId]
  );
}

describe("Stage 1 Telegram Omnichannel Extension (isolated PGlite)", () => {
  it("executes the forward-only migration cleanly over Stage 1 foundation", async () => {
    const db = await setup();
    const ws = await workspace(db);
    expect(ws).toBeDefined();
    await db.close();
  });

  it("creates contact, telegram identity, lead intake, thread, message, and outbox event", async () => {
    const db = await setup();
    const ws = await workspace(db);
    const result = await telegramIntake(db, ws, "tg-key-1");
    const intakeResult = result.rows[0].record_lead_intake;

    expect(intakeResult.success).toBe(true);
    expect(intakeResult.duplicate).toBe(false);
    expect(intakeResult.resolution_status).toBe("created");
    expect(intakeResult.canonical_event_id).toMatch(/^lead\.received:/);

    // Verify contact created
    const contact = await db.query<{ source: string; name: string }>(
      "select source, name from public.contacts where workspace_id = $1",
      [ws]
    );
    expect(contact.rows).toHaveLength(1);
    expect(contact.rows[0].source).toBe("telegram");
    expect(contact.rows[0].name).toBe("Alex Telegram");

    // Verify contact identity created with telegram type
    const identity = await db.query<{ identity_type: string; normalized_value: string }>(
      "select identity_type, normalized_value from public.contact_identities where workspace_id = $1",
      [ws]
    );
    expect(identity.rows).toHaveLength(1);
    expect(identity.rows[0].identity_type).toBe("telegram");
    expect(identity.rows[0].normalized_value).toBe("tg_12345");

    // Verify inbox thread created with telegram channel
    const thread = await db.query<{ channel: string; external_thread_id: string }>(
      "select channel, external_thread_id from public.inbox_threads where workspace_id = $1",
      [ws]
    );
    expect(thread.rows).toHaveLength(1);
    expect(thread.rows[0].channel).toBe("telegram");
    expect(thread.rows[0].external_thread_id).toBe("chat_888");

    // Verify inbox message created with inbound direction and telegram provider
    const msg = await db.query<{ direction: string; provider: string; content: string }>(
      "select direction, provider, content from public.inbox_messages where workspace_id = $1",
      [ws]
    );
    expect(msg.rows).toHaveLength(1);
    expect(msg.rows[0].direction).toBe("inbound");
    expect(msg.rows[0].provider).toBe("telegram");
    expect(msg.rows[0].content).toBe("Hello from Telegram");

    // Verify lead_event_outbox created
    const outbox = await db.query<{ event_type: string; status: string }>(
      "select event_type, status from public.lead_event_outbox where workspace_id = $1",
      [ws]
    );
    expect(outbox.rows).toHaveLength(1);
    expect(outbox.rows[0].event_type).toBe("lead.received");
    expect(outbox.rows[0].status).toBe("pending");

    await db.close();
  });

  it("handles duplicate retries idempotently without duplicate thread/message/outbox", async () => {
    const db = await setup();
    const ws = await workspace(db);

    const first = await telegramIntake(db, ws, "tg-retry-key");
    expect(first.rows[0].record_lead_intake.duplicate).toBe(false);

    const replay = await telegramIntake(db, ws, "tg-retry-key");
    expect(replay.rows[0].record_lead_intake.duplicate).toBe(true);

    // Ensure counts remain 1
    for (const table of ["contacts", "contact_identities", "lead_intakes", "inbox_threads", "inbox_messages", "lead_event_outbox"]) {
      const count = await db.query<{ count: number }>(`select count(*)::int as count from public.${table} where workspace_id = $1`, [ws]);
      expect(count.rows[0].count).toBe(1);
    }

    await db.close();
  });

  it("matches existing contact by telegram_user_id on subsequent inquiries", async () => {
    const db = await setup();
    const ws = await workspace(db);

    const first = await telegramIntake(db, ws, "tg-inquiry-1", "tg_same_user", "chat_888", "Inquiry 1", "msg_1");
    expect(first.rows[0].record_lead_intake.resolution_status).toBe("created");

    const second = await telegramIntake(db, ws, "tg-inquiry-2", "tg_same_user", "chat_888", "Inquiry 2", "msg_2");
    expect(second.rows[0].record_lead_intake.resolution_status).toBe("matched");
    expect(second.rows[0].record_lead_intake.contact_id).toBe(first.rows[0].record_lead_intake.contact_id);

    // Only 1 contact should exist
    const contactsCount = await db.query<{ count: number }>("select count(*)::int as count from public.contacts where workspace_id = $1", [ws]);
    expect(contactsCount.rows[0].count).toBe(1);

    // 2 intakes and 2 messages should exist
    const intakesCount = await db.query<{ count: number }>("select count(*)::int as count from public.lead_intakes where workspace_id = $1", [ws]);
    expect(intakesCount.rows[0].count).toBe(2);

    const messagesCount = await db.query<{ count: number }>("select count(*)::int as count from public.inbox_messages where workspace_id = $1", [ws]);
    expect(messagesCount.rows[0].count).toBe(2);

    await db.close();
  });
});
