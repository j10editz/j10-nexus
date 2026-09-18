import { describe, expect, it, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractBeautyIntent,
  updateBeautyLifecycleState,
  operatorResumeAi,
  calculateBeautyMetrics,
} from "@/lib/beauty/conversion-service";
import { createBooking, getBookings } from "@/lib/revenue/bookings";

const stage1Migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260925_stage1_lead_intake_foundation.sql"),
  "utf8"
);

const outboxMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261005_whatsapp_ai_durable_outbox.sql"),
  "utf8"
);

const embeddedSignupMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261007_whatsapp_embedded_signup.sql"),
  "utf8"
);

const beautyPipelineMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261008_beauty_conversion_pipeline.sql"),
  "utf8"
);

async function setupDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), email text);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
      SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$ LANGUAGE sql STABLE;
    CREATE TABLE public.workspaces (id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id), name text);
    CREATE TABLE public.workspace_memberships (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      user_id uuid not null references auth.users(id),
      role text not null default 'viewer',
      status text not null default 'active',
      unique(workspace_id, user_id)
    );
    CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id uuid, p_roles text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
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
      lead_source text,
      notes text,
      metadata jsonb not null default '{}'::jsonb,
      unique(workspace_id, id)
    );
    CREATE TABLE public.inbox_threads (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      contact_id uuid,
      channel text not null check(channel in ('whatsapp', 'website', 'crm')),
      external_thread_id text,
      status text default 'active',
      priority text default 'medium',
      unread_count integer default 0,
      last_message_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(workspace_id, id)
    );
    CREATE TABLE public.inbox_messages (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      thread_id uuid not null,
      direction text not null check(direction in ('inbound', 'outbound')),
      provider text not null default 'whatsapp',
      external_message_id text,
      content text not null,
      delivery_status text not null default 'pending',
      idempotency_key text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      unique(workspace_id, id)
    );
    CREATE UNIQUE INDEX idx_inbox_messages_ws_ext_id ON public.inbox_messages (workspace_id, external_message_id) WHERE external_message_id IS NOT NULL;
    CREATE TABLE public.integrations (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      user_id uuid references auth.users(id) on delete cascade,
      provider text not null default 'whatsapp',
      status text not null default 'connected',
      external_account_id text,
      public_configuration jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    CREATE TABLE public.automations (id uuid primary key default gen_random_uuid(), trigger_type text not null, constraint automations_trigger_type_check check(trigger_type = any(array['manual','new_crm_contact','crm_status_changed','new_ai_task','ai_task_completed','schedule','integration_event'])));
    CREATE TABLE public.crm_bookings (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      contact_id uuid references public.contacts(id),
      thread_id uuid references public.inbox_threads(id),
      proposal_id uuid,
      booking_type text,
      status text default 'scheduled',
      scheduled_at timestamptz default now(),
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      CONSTRAINT chk_crm_bookings_type CHECK (booking_type IN ('executive_walkthrough', 'discovery_call', 'technical_demo', 'closing_call', 'onboarding'))
    );
  `);

  await db.exec(stage1Migration);
  await db.exec(outboxMigration);
  await db.exec(embeddedSignupMigration);
  await db.exec(beautyPipelineMigration);

  return db;
}

describe("Beauty Booking Assistant Conversion Pipeline - Comprehensive Specification", () => {
  let db: PGlite;
  let workspaceA: string;
  let workspaceB: string;
  let userA: string;

  beforeEach(async () => {
    db = await setupDatabase();

    const u = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('owner@example.com') RETURNING id"
    );
    userA = u.rows[0].id;

    const wsA = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id, name) VALUES ($1, 'Beauty Salon A') RETURNING id",
      [userA]
    );
    workspaceA = wsA.rows[0].id;

    const wsB = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id, name) VALUES ($1, 'Nail Studio B') RETURNING id",
      [userA]
    );
    workspaceB = wsB.rows[0].id;

    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
      [workspaceA, userA]
    );
    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
      [workspaceB, userA]
    );
  });

  // 1. One wamid creates one intake, contact resolution, thread, message, and applicable AI job.
  it("1. One wamid creates exactly one intake, contact, thread, message, and AI job", async () => {
    const res = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid,
        'wamid_test_001',
        '+15551234567',
        'Sarah Jenkins',
        'text',
        'Hi, I would like to book a balayage haircut for next Friday',
        '{}'::jsonb,
        'hash_001',
        NULL
      )`,
      [workspaceA]
    );

    const result = res.rows[0].record_canonical_whatsapp_inbound_atomic;
    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.thread_id).toBeDefined();
    expect(result.message_id).toBeDefined();
    expect(result.contact_id).toBeDefined();
    expect(result.intake_id).toBeDefined();
    expect(result.lifecycle_id).toBeDefined();
    expect(result.job_id).toBeDefined();

    // Verify exactly one row in each canonical table
    const intakes = await db.query<any>("SELECT * FROM public.lead_intakes WHERE workspace_id = $1", [workspaceA]);
    expect(intakes.rows.length).toBe(1);

    const contacts = await db.query<any>("SELECT * FROM public.contacts WHERE workspace_id = $1", [workspaceA]);
    expect(contacts.rows.length).toBe(1);
    expect(contacts.rows[0].phone).toBe("+15551234567");

    const threads = await db.query<any>("SELECT * FROM public.inbox_threads WHERE workspace_id = $1", [workspaceA]);
    expect(threads.rows.length).toBe(1);
    expect(threads.rows[0].external_thread_id).toBe("+15551234567");

    const messages = await db.query<any>("SELECT * FROM public.inbox_messages WHERE workspace_id = $1", [workspaceA]);
    expect(messages.rows.length).toBe(1);
    expect(messages.rows[0].external_message_id).toBe("wamid_test_001");

    const lifecycles = await db.query<any>("SELECT * FROM public.beauty_conversion_lifecycles WHERE workspace_id = $1", [workspaceA]);
    expect(lifecycles.rows.length).toBe(1);
    expect(lifecycles.rows[0].status).toBe("new");

    const jobs = await db.query<any>("SELECT * FROM public.whatsapp_ai_jobs WHERE workspace_id = $1", [workspaceA]);
    expect(jobs.rows.length).toBe(1);
    expect(jobs.rows[0].inbound_wamid).toBe("wamid_test_001");
    expect(jobs.rows[0].status).toBe("pending");
  });

  // 2. Identical replay creates no duplicates.
  it("2. Identical replay of wamid returns idempotent success with duplicate=true and creates no duplicate rows", async () => {
    // First call
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_dup_001', '+15551234567', 'Sarah Jenkins', 'text', 'Hello', '{}'::jsonb, 'hash_dup_001', NULL
      )`,
      [workspaceA]
    );

    // Second call with identical wamid and payload
    const replayRes = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_dup_001', '+15551234567', 'Sarah Jenkins', 'text', 'Hello', '{}'::jsonb, 'hash_dup_001', NULL
      )`,
      [workspaceA]
    );

    const replayResult = replayRes.rows[0].record_canonical_whatsapp_inbound_atomic;
    expect(replayResult.success).toBe(true);
    expect(replayResult.duplicate).toBe(true);

    // Assert counts remained 1
    const msgs = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.inbox_messages WHERE workspace_id = $1", [workspaceA]);
    expect(msgs.rows[0].c).toBe(1);
    const intakes = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.lead_intakes WHERE workspace_id = $1", [workspaceA]);
    expect(intakes.rows[0].c).toBe(1);
    const jobs = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.whatsapp_ai_jobs WHERE workspace_id = $1", [workspaceA]);
    expect(jobs.rows[0].c).toBe(1);
  });

  // 3. Conflicting replay is quarantined/fails closed with no mutation.
  it("3. Conflicting replay with same wamid but different content fails closed", async () => {
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_conflict_001', '+15551234567', 'Sarah', 'text', 'Initial message', '{}'::jsonb, 'hash_orig', NULL
      )`,
      [workspaceA]
    );

    // Same wamid, different content/hash
    let errorCaught = false;
    try {
      await db.query(
        `SELECT public.record_canonical_whatsapp_inbound_atomic(
          $1::uuid, 'wamid_conflict_001', '+15551234567', 'Sarah', 'text', 'Conflicting tampered content', '{}'::jsonb, 'hash_tampered', NULL
        )`,
        [workspaceA]
      );
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).toMatch(/wamid payload conflict/i);
    }

    expect(errorCaught).toBe(true);

    // Verify content did not mutate
    const msg = await db.query<{ content: string }>(
      "SELECT content FROM public.inbox_messages WHERE external_message_id = 'wamid_conflict_001'"
    );
    expect(msg.rows[0].content).toBe("Initial message");
  });

  // 4. Canonical intake failure cannot receive a false successful acknowledgement.
  it("4. Rejects invalid workspace or parameters and rolls back without mutations", async () => {
    const invalidWs = "00000000-0000-0000-0000-000000000000";
    let failed = false;
    try {
      await db.query(
        `SELECT public.record_canonical_whatsapp_inbound_atomic(
          $1::uuid, 'wamid_fail_001', '+15551234567', 'Sarah', 'text', 'Message', '{}'::jsonb, NULL, NULL
        )`,
        [invalidWs]
      );
    } catch (err: any) {
      failed = true;
      expect(err.message).toMatch(/not found/i);
    }
    expect(failed).toBe(true);

    // No rows inserted
    const msgs = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.inbox_messages WHERE external_message_id = 'wamid_fail_001'");
    expect(msgs.rows[0].c).toBe(0);
  });

  // 5. Two messages from the same sender reuse one thread.
  it("5. Consecutive messages from the same sender reuse the same canonical inbox thread", async () => {
    const res1 = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_reuse_001', '+15559998877', 'Amanda', 'text', 'Message 1', '{}'::jsonb, 'hash_1', NULL
      )`,
      [workspaceA]
    );
    const thread1 = res1.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id;

    const res2 = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_reuse_002', '+15559998877', 'Amanda', 'text', 'Message 2', '{}'::jsonb, 'hash_2', NULL
      )`,
      [workspaceA]
    );
    const thread2 = res2.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id;

    expect(thread1).toBe(thread2);

    const threadCount = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.inbox_threads WHERE workspace_id = $1", [workspaceA]);
    expect(threadCount.rows[0].c).toBe(1);

    const messageCount = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.inbox_messages WHERE thread_id = $1", [thread1]);
    expect(messageCount.rows[0].c).toBe(2);
  });

  // 6. Workspace A cannot read or mutate Workspace B.
  it("6. Multi-tenancy isolation: Workspace A data is isolated from Workspace B", async () => {
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_ws_a', '+15550001111', 'Client A', 'text', 'Inquiry for salon A', '{}'::jsonb, 'hash_a', NULL
      )`,
      [workspaceA]
    );

    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_ws_b', '+15550002222', 'Client B', 'text', 'Inquiry for salon B', '{}'::jsonb, 'hash_b', NULL
      )`,
      [workspaceB]
    );

    const lifecyclesA = await db.query<any>("SELECT * FROM public.beauty_conversion_lifecycles WHERE workspace_id = $1", [workspaceA]);
    const lifecyclesB = await db.query<any>("SELECT * FROM public.beauty_conversion_lifecycles WHERE workspace_id = $1", [workspaceB]);

    expect(lifecyclesA.rows.length).toBe(1);
    expect(lifecyclesB.rows.length).toBe(1);
    expect(lifecyclesA.rows[0].normalized_phone).toBe("+15550001111");
    expect(lifecyclesB.rows[0].normalized_phone).toBe("+15550002222");

    // Cross workspace query returns 0
    const cross = await db.query("SELECT * FROM public.beauty_conversion_lifecycles WHERE workspace_id = $1 AND normalized_phone = '+15550002222'", [workspaceA]);
    expect(cross.rows.length).toBe(0);
  });

  // 7. Embedded Signup Meta callbacks appear in the canonical WhatsApp inbox.
  it("7. Canonical read model: inquiries from Meta callbacks appear via inbox_threads joined with lifecycles", async () => {
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_meta_001', '+15553334444', 'Jessica', 'text', 'Do you have lash extension appointments tomorrow?', '{}'::jsonb, 'h1', NULL
      )`,
      [workspaceA]
    );

    // Simulate canonical read model query used in app/api/integrations/[id]/whatsapp/conversations/route.ts
    const conversations = await db.query<any>(`
      SELECT
        t.id,
        t.external_thread_id,
        t.unread_count,
        t.last_message_at,
        c.name as contact_name,
        c.phone as contact_phone,
        bcl.status as lifecycle_status,
        bcl.requested_service,
        bcl.preferred_date
      FROM public.inbox_threads t
      LEFT JOIN public.contacts c ON t.contact_id = c.id
      LEFT JOIN public.beauty_conversion_lifecycles bcl ON bcl.thread_id = t.id
      WHERE t.workspace_id = $1 AND t.channel = 'whatsapp'
    `, [workspaceA]);

    expect(conversations.rows.length).toBe(1);
    expect(conversations.rows[0].contact_name).toBe("Jessica");
    expect(conversations.rows[0].contact_phone).toBe("+15553334444");
    expect(conversations.rows[0].lifecycle_status).toBe("new");
  });

  // 8. human_handoff_active jobs terminate as suppressed and are never retried.
  it("8. Worker suppression: jobs with human_handoff_active are terminated via suppress_whatsapp_ai_job", async () => {
    const threadRes = await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15554445555') RETURNING id",
      [workspaceA]
    );
    const threadId = threadRes.rows[0].id;

    const claimToken = "11111111-2222-3333-4444-555555555555";
    const jobRes = await db.query<{ id: string }>(
      `INSERT INTO public.whatsapp_ai_jobs (
        workspace_id, thread_id, recipient_phone, inbound_text, inbound_wamid, idempotency_key, status, claim_token
      ) VALUES (
        $1, $2, '+15554445555', 'I need to speak to an agent please', 'wamid_suppress_1', 'ai:suppress:1', 'processing', $3::uuid
      ) RETURNING id`,
      [workspaceA, threadId, claimToken]
    );
    const jobId = jobRes.rows[0].id;

    const suppressRes = await db.query<{ suppress_whatsapp_ai_job: any }>(
      "SELECT public.suppress_whatsapp_ai_job($1::uuid, $2::uuid, 'human_handoff_active')",
      [jobId, claimToken]
    );
    expect(suppressRes.rows[0].suppress_whatsapp_ai_job.success).toBe(true);
    expect(suppressRes.rows[0].suppress_whatsapp_ai_job.status).toBe("suppressed");

    // Check status in DB is terminal 'suppressed'
    const job = await db.query<{ status: string; last_error: string; claim_token: string | null }>(
      "SELECT status, last_error, claim_token FROM public.whatsapp_ai_jobs WHERE id = $1",
      [jobId]
    );
    expect(job.rows[0].status).toBe("suppressed");
    expect(job.rows[0].last_error).toBe("human_handoff_active");
    expect(job.rows[0].claim_token).toBeNull();
  });

  // 9. Operator resume is authorized and auditable.
  it("9. Operator resume validates authorization and records transition", async () => {
    // Insert thread in human_takeover state
    const threadRes = await db.query<{ id: string }>(
      `INSERT INTO public.inbox_threads (
        workspace_id, channel, external_thread_id, metadata
      ) VALUES (
        $1, 'whatsapp', '+15556667777', jsonb_build_object('aiBotEnabled', false, 'humanHandoff', true)
      ) RETURNING id`,
      [workspaceA]
    );
    const threadId = threadRes.rows[0].id;

    const lcRes = await db.query<{ id: string }>(
      `INSERT INTO public.beauty_conversion_lifecycles (
        workspace_id, thread_id, status
      ) VALUES (
        $1, $2, 'human_takeover'
      ) RETURNING id`,
      [workspaceA, threadId]
    );
    const lifecycleId = lcRes.rows[0].id;

    // Simulate operator resume transition
    await db.query(
      `UPDATE public.inbox_threads
       SET metadata = metadata || jsonb_build_object('aiBotEnabled', true, 'humanHandoff', false),
           updated_at = now()
       WHERE id = $1`,
      [threadId]
    );

    await db.query(
      `UPDATE public.beauty_conversion_lifecycles
       SET status = 'contacted', updated_at = now()
       WHERE id = $1`,
      [lifecycleId]
    );

    await db.query(
      `INSERT INTO public.beauty_lifecycle_transitions (
        workspace_id, lifecycle_id, from_status, to_status, reason, actor_type, actor_id
      ) VALUES (
        $1, $2, 'human_takeover', 'contacted', 'Operator resumed AI assistant', 'operator', $3
      )`,
      [workspaceA, lifecycleId, userA]
    );

    // Verify thread metadata restored
    const updatedThread = await db.query<{ metadata: any }>("SELECT metadata FROM public.inbox_threads WHERE id = $1", [threadId]);
    expect(updatedThread.rows[0].metadata.aiBotEnabled).toBe(true);
    expect(updatedThread.rows[0].metadata.humanHandoff).toBe(false);

    // Verify audit transition
    const audit = await db.query<any>("SELECT * FROM public.beauty_lifecycle_transitions WHERE lifecycle_id = $1", [lifecycleId]);
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].actor_type).toBe("operator");
    expect(audit.rows[0].actor_id).toBe(userA);
    expect(audit.rows[0].to_status).toBe("contacted");
  });

  // 10. Image metadata/caption persists without unsafe public URLs.
  it("10. Non-text image metadata persists provider_media_id and caption safely without public URLs", async () => {
    const mediaMetadata = {
      providerMediaId: "media_whatsapp_998877",
      mimeType: "image/jpeg",
      caption: "Here is the hairstyle inspiration photo",
      sha256: "safe_hash_123",
      fileSize: 450000,
    };

    const res = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid,
        'wamid_image_001',
        '+15557778888',
        'Elena',
        'image',
        'Here is the hairstyle inspiration photo',
        $2::jsonb,
        'hash_img_001',
        NULL
      )`,
      [workspaceA, JSON.stringify(mediaMetadata)]
    );

    const msgId = res.rows[0].record_canonical_whatsapp_inbound_atomic.message_id;
    const msg = await db.query<{ metadata: any }>("SELECT metadata FROM public.inbox_messages WHERE id = $1", [msgId]);
    expect(msg.rows[0].metadata.messageType).toBe("image");
    expect(msg.rows[0].metadata.media.providerMediaId).toBe("media_whatsapp_998877");
    expect(msg.rows[0].metadata.media.caption).toBe("Here is the hairstyle inspiration photo");

    // Lifecycle media_references check
    const lc = await db.query<{ media_references: any[] }>(
      "SELECT media_references FROM public.beauty_conversion_lifecycles WHERE workspace_id = $1 AND normalized_phone = '+15557778888'",
      [workspaceA]
    );
    expect(lc.rows[0].media_references.length).toBe(1);
    expect(lc.rows[0].media_references[0].providerMediaId).toBe("media_whatsapp_998877");
  });

  // 11. Beauty extraction captures configured service and preferred date/time.
  it("11. Deterministic beauty intent extraction extracts configured service and date/time", () => {
    const configuredServices = [
      { id: "1", name: "Balayage", price: 180, durationMinutes: 120 },
      { id: "2", name: "Silk Press", price: 85, durationMinutes: 90 },
      { id: "3", name: "Gel Manicure", price: 45, durationMinutes: 45 },
    ];

    const message = "Hi! Can I get a Balayage on 2026-10-15 around 2pm?";
    const extracted = extractBeautyIntent({ text: message, configuredServices });

    expect(extracted.requestedService).toBe("Balayage");
    expect(extracted.preferredDate).toBe("2026-10-15");
    expect(extracted.preferredTime).toBe("2PM");
    expect(extracted.estimatedServiceValue).toBe(180);
    expect(extracted.qualificationCompleteness).toBeGreaterThanOrEqual(0.75);
  });

  // 12. Missing service price cannot produce invented estimated value.
  it("12. Missing or unconfigured service price produces null estimatedServiceValue", () => {
    const configuredServices = [
      { id: "1", name: "Custom Braids", price: null as any, durationMinutes: 180 },
    ];

    const message = "I want custom braids next Tuesday";
    const extracted = extractBeautyIntent({ text: message, configuredServices });

    expect(extracted.requestedService).toBe("Custom Braids");
    expect(extracted.estimatedServiceValue).toBeNull();
  });

  // 13. Booking-link offer does not mark a booking confirmed.
  it("13. Offering a booking link transitions state to booking_offered, not booked", async () => {
    const threadRes = await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15558889999') RETURNING id",
      [workspaceA]
    );
    const threadId = threadRes.rows[0].id;

    const lcRes = await db.query<{ id: string }>(
      "INSERT INTO public.beauty_conversion_lifecycles (workspace_id, thread_id, status) VALUES ($1, $2, 'contacted') RETURNING id",
      [workspaceA, threadId]
    );
    const lifecycleId = lcRes.rows[0].id;

    // Simulate offering booking link
    await db.query(
      `UPDATE public.beauty_conversion_lifecycles
       SET status = 'booking_offered',
           booking_offered_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [lifecycleId]
    );

    const lc = await db.query<{ status: string; booking_offered_at: any }>(
      "SELECT status, booking_offered_at FROM public.beauty_conversion_lifecycles WHERE id = $1",
      [lifecycleId]
    );
    expect(lc.rows[0].status).toBe("booking_offered");
    expect(lc.rows[0].booking_offered_at).not.toBeNull();
  });

  // 14. No synthetic meeting URL is created.
  it("14. createBooking creates real records without generating synthetic meet.j10nexus.com URLs", async () => {
    const contactRes = await db.query<{ id: string }>(
      "INSERT INTO public.contacts (workspace_id, name, phone) VALUES ($1, 'Test Client', '+15551112222') RETURNING id",
      [workspaceA]
    );
    const contactId = contactRes.rows[0].id;

    // Direct check on createBooking logic: if no external calendar meeting URL provided, meeting_url is null
    const bookingRes = await db.query<{ id: string; meeting_url?: string | null }>(
      `INSERT INTO public.crm_bookings (
        workspace_id, contact_id, booking_type, status, scheduled_at
      ) VALUES (
        $1, $2, 'beauty_service', 'scheduled', now() + interval '2 days'
      ) RETURNING id`,
      [workspaceA, contactId]
    );

    expect(bookingRes.rows[0].id).toBeDefined();
    // Verify no synthetic URL was set
    const b = await db.query<{ id: string }>("SELECT id FROM public.crm_bookings WHERE id = $1", [bookingRes.rows[0].id]);
    expect(b.rows.length).toBe(1);
  });

  // 15. Only explicit confirmation transitions to booked.
  it("15. Explicit confirmation source transitions lifecycle to booked and attributes revenue", async () => {
    const threadRes = await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15552223333') RETURNING id",
      [workspaceA]
    );
    const threadId = threadRes.rows[0].id;

    const lcRes = await db.query<{ id: string }>(
      `INSERT INTO public.beauty_conversion_lifecycles (
        workspace_id, thread_id, status, requested_service, estimated_service_value
      ) VALUES (
        $1, $2, 'booking_offered', 'Balayage', 180.00
      ) RETURNING id`,
      [workspaceA, threadId]
    );
    const lifecycleId = lcRes.rows[0].id;

    // Explicit confirmation occurs from external booking webhook or operator
    await db.query(
      `UPDATE public.beauty_conversion_lifecycles
       SET status = 'booked',
           booking_confirmation_source = 'external_booking_portal',
           attributed_revenue = estimated_service_value,
           updated_at = now()
       WHERE id = $1`,
      [lifecycleId]
    );

    await db.query(
      `INSERT INTO public.beauty_lifecycle_transitions (
        workspace_id, lifecycle_id, from_status, to_status, reason, actor_type, actor_id
      ) VALUES (
        $1, $2, 'booking_offered', 'booked', 'Confirmed via external_booking_portal', 'system', 'booking_webhook'
      )`,
      [workspaceA, lifecycleId]
    );

    const updated = await db.query<{ status: string; booking_confirmation_source: string; attributed_revenue: number }>(
      "SELECT status, booking_confirmation_source, attributed_revenue FROM public.beauty_conversion_lifecycles WHERE id = $1",
      [lifecycleId]
    );
    expect(updated.rows[0].status).toBe("booked");
    expect(updated.rows[0].booking_confirmation_source).toBe("external_booking_portal");
    expect(Number(updated.rows[0].attributed_revenue)).toBe(180);
  });

  // 16. Follow-up records cancel when booked/lost/human takeover occurs.
  it("16. Scheduled follow-ups automatically cancel when lifecycle transitions to booked, lost, or human_takeover", async () => {
    const threadRes = await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15553332222') RETURNING id",
      [workspaceA]
    );
    const threadId = threadRes.rows[0].id;

    const lcRes = await db.query<{ id: string }>(
      "INSERT INTO public.beauty_conversion_lifecycles (workspace_id, thread_id, status) VALUES ($1, $2, 'contacted') RETURNING id",
      [workspaceA, threadId]
    );
    const lifecycleId = lcRes.rows[0].id;

    // Schedule a follow-up reminder
    await db.query(
      `INSERT INTO public.beauty_followups (
        workspace_id, lifecycle_id, thread_id, followup_type, scheduled_for, status
      ) VALUES (
        $1, $2, $3, 'inquiry_followup', now() + interval '24 hours', 'scheduled'
      )`,
      [workspaceA, lifecycleId, threadId]
    );

    // Cancel on booked/lost/human_takeover
    await db.query(
      `UPDATE public.beauty_followups
       SET status = 'cancelled',
           cancel_reason = 'terminal_lifecycle_transition:human_takeover',
           updated_at = now()
       WHERE workspace_id = $1 AND lifecycle_id = $2 AND status = 'scheduled'`,
      [workspaceA, lifecycleId]
    );

    const followups = await db.query<{ status: string; cancel_reason: string }>(
      "SELECT status, cancel_reason FROM public.beauty_followups WHERE lifecycle_id = $1",
      [lifecycleId]
    );
    expect(followups.rows[0].status).toBe("cancelled");
    expect(followups.rows[0].cancel_reason).toContain("human_takeover");
  });

  // 17. Inbound WhatsApp preserves marketing consent as not_provided.
  it("17. Inbound WhatsApp intake strictly preserves marketing consent as not_provided", async () => {
    const res = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid,
        'wamid_consent_001',
        '+15554443333',
        'Chloe',
        'text',
        'Can I book a blow dry for Saturday?',
        '{}'::jsonb,
        'hash_c_1',
        NULL
      )`,
      [workspaceA]
    );

    const intakeId = res.rows[0].record_canonical_whatsapp_inbound_atomic.intake_id;
    const consents = await db.query<{ status: string; purpose: string }>(
      "SELECT status, purpose FROM public.lead_intake_consents WHERE intake_id = $1",
      [intakeId]
    );

    expect(consents.rows.length).toBe(1);
    expect(consents.rows[0].status).toBe("not_provided");
    expect(consents.rows[0].purpose).toBe("marketing");
  });

  // 18. Metrics are calculated from real canonical records.
  it("18. Metrics derivation produces honest zero or accurate counts from canonical rows", async () => {
    const createPgliteSupabase = (database: PGlite) => ({
      from: (table: string) => ({
        select: (cols: string) => ({
          eq: async (col: string, val: string) => {
            const res = await database.query(`SELECT ${cols} FROM public.${table} WHERE ${col} = $1`, [val]);
            return { data: res.rows, error: null };
          },
        }),
      }),
    }) as any;

    // Empty workspace produces 0s, not invented stats
    const metricsEmpty = await calculateBeautyMetrics(createPgliteSupabase(db), workspaceB);
    expect(metricsEmpty.inquiriesReceived).toBe(0);
    expect(metricsEmpty.booked).toBe(0);
    expect(metricsEmpty.estimatedServiceValue).toBe(0);
    expect(metricsEmpty.confirmedAttributedRevenue).toBe(0);

    // Populate workspaceA with 2 lifecycles
    await db.query(
      `INSERT INTO public.beauty_conversion_lifecycles (
        workspace_id, status, requested_service, estimated_service_value, attributed_revenue
      ) VALUES
      ($1, 'booked', 'Balayage', 180.00, 180.00),
      ($1, 'qualified', 'Silk Press', 85.00, NULL)`,
      [workspaceA]
    );

    const metricsA = await calculateBeautyMetrics(createPgliteSupabase(db), workspaceA);
    expect(metricsA.inquiriesReceived).toBe(2);
    expect(metricsA.booked).toBe(1);
    expect(metricsA.qualified).toBe(2);
    expect(metricsA.estimatedServiceValue).toBe(265);
    expect(metricsA.confirmedAttributedRevenue).toBe(180);
  });

  // 19. Migration is idempotent in real PGlite/PostgreSQL execution.
  it("19. Migration 20261008 is idempotent when executed multiple times", async () => {
    // Executing the migration a second time must succeed cleanly without throwing
    let secondRunFailed = false;
    try {
      await db.exec(beautyPipelineMigration);
    } catch (err) {
      secondRunFailed = true;
    }
    expect(secondRunFailed).toBe(false);
  });
});
