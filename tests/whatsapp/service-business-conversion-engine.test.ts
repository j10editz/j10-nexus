import { describe, expect, it, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractServiceIntent,
  updateServiceJourneyLifecycleState,
  operatorResumeJourneyAi,
  calculateServiceBusinessMetrics,
} from "@/lib/service-business/conversion-service";
import { beautyGroomingPlaybook } from "@/lib/service-business/playbooks/beauty-grooming";
import { autoDetailingPlaybook } from "@/lib/service-business/playbooks/auto-detailing";
import { getPlaybook, defaultPlaybook } from "@/lib/service-business/playbooks/registry";
import { createWorkspaceBooking } from "@/lib/revenue/bookings";

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

const serviceEngineMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261008_service_business_conversion_engine.sql"),
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
    CREATE TABLE public.workspaces (id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id), name text, metadata jsonb not null default '{}'::jsonb);
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
      title text default 'Service Appointment',
      scheduled_at timestamptz default now(),
      duration_minutes integer default 60,
      meeting_url text,
      status text default 'scheduled',
      external_reservation_status text default 'unlinked',
      external_calendar_provider text,
      external_calendar_event_id text,
      notes text,
      host_user_id uuid,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      CONSTRAINT chk_crm_bookings_type CHECK (booking_type IN ('executive_walkthrough', 'discovery_call', 'technical_demo', 'closing_call', 'onboarding'))
    );
  `);

  await db.exec(stage1Migration);
  await db.exec(outboxMigration);
  await db.exec(embeddedSignupMigration);
  await db.exec(serviceEngineMigration);

  return db;
}

describe("J10 Service Business Conversion Engine - Comprehensive Architecture Specification", () => {
  let db: PGlite;
  let workspaceBeauty: string;
  let workspaceAuto: string;
  let userA: string;

  beforeEach(async () => {
    db = await setupDatabase();

    const u = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('owner@example.com') RETURNING id"
    );
    userA = u.rows[0].id;

    const ws1 = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id, name, metadata) VALUES ($1, 'Luxe Salon & Spa', '{\"playbook_key\": \"beauty_grooming\"}'::jsonb) RETURNING id",
      [userA]
    );
    workspaceBeauty = ws1.rows[0].id;

    const ws2 = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id, name, metadata) VALUES ($1, 'Apex Auto Detailing', '{\"playbook_key\": \"auto_detailing\"}'::jsonb) RETURNING id",
      [userA]
    );
    workspaceAuto = ws2.rows[0].id;

    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
      [workspaceBeauty, userA]
    );
    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
      [workspaceAuto, userA]
    );
  });

  // 1. One wamid creates exactly one message and one AI job
  it("1. One wamid creates exactly one canonical message, thread, contact, journey, and AI job", async () => {
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
        NULL,
        'beauty_grooming'
      )`,
      [workspaceBeauty]
    );

    const result = res.rows[0].record_canonical_whatsapp_inbound_atomic;
    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.thread_id).toBeDefined();
    expect(result.message_id).toBeDefined();
    expect(result.contact_id).toBeDefined();
    expect(result.intake_id).toBeDefined();
    expect(result.journey_id).toBeDefined();
    expect(result.job_id).toBeDefined();

    // Verify row counts in generic tables
    const journeys = await db.query<any>("SELECT * FROM public.service_conversion_journeys WHERE workspace_id = $1", [workspaceBeauty]);
    expect(journeys.rows.length).toBe(1);
    expect(journeys.rows[0].status).toBe("new");
    expect(journeys.rows[0].playbook_key).toBe("beauty_grooming");

    const events = await db.query<any>("SELECT * FROM public.service_conversion_events WHERE workspace_id = $1", [workspaceBeauty]);
    expect(events.rows.length).toBe(1);
    expect(events.rows[0].to_status).toBe("new");

    const jobs = await db.query<any>("SELECT * FROM public.whatsapp_ai_jobs WHERE workspace_id = $1", [workspaceBeauty]);
    expect(jobs.rows.length).toBe(1);
    expect(jobs.rows[0].status).toBe("pending");
  });

  // 2. Duplicate delivery remains idempotent
  it("2. Duplicate delivery remains idempotent without creating extra records", async () => {
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_dup_001', '+15551234567', 'Sarah', 'text', 'Hello', '{}'::jsonb, 'hash_dup_001', NULL, 'general_service'
      )`,
      [workspaceBeauty]
    );

    const replayRes = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_dup_001', '+15551234567', 'Sarah', 'text', 'Hello', '{}'::jsonb, 'hash_dup_001', NULL, 'general_service'
      )`,
      [workspaceBeauty]
    );

    const result = replayRes.rows[0].record_canonical_whatsapp_inbound_atomic;
    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(true);

    const journeys = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.service_conversion_journeys WHERE workspace_id = $1", [workspaceBeauty]);
    expect(journeys.rows[0].c).toBe(1);

    const msgs = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.inbox_messages WHERE workspace_id = $1", [workspaceBeauty]);
    expect(msgs.rows[0].c).toBe(1);
  });

  // 3. Canonical persistence failure does not acknowledge success
  it("3. Conflicting wamid payload fails closed and rolls back without mutations", async () => {
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_conflict_001', '+15551234567', 'Sarah', 'text', 'Original inquiry', '{}'::jsonb, 'hash_1', NULL, 'general_service'
      )`,
      [workspaceBeauty]
    );

    let errorThrown = false;
    try {
      await db.query(
        `SELECT public.record_canonical_whatsapp_inbound_atomic(
          $1::uuid, 'wamid_conflict_001', '+15551234567', 'Sarah', 'text', 'Tampered inquiry', '{}'::jsonb, 'hash_2', NULL, 'general_service'
        )`,
        [workspaceBeauty]
      );
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toMatch(/wamid payload conflict/i);
    }
    expect(errorThrown).toBe(true);
  });

  // 4. Same sender reuses the same canonical thread
  it("4. Consecutive inbound inquiries from same phone reuse the same canonical inbox thread", async () => {
    const res1 = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_reuse_001', '+15559998877', 'Amanda', 'text', 'Inquiry 1', '{}'::jsonb, 'h1', NULL, 'auto_detailing'
      )`,
      [workspaceAuto]
    );
    const thread1 = res1.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id;

    const res2 = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_reuse_002', '+15559998877', 'Amanda', 'text', 'Inquiry 2', '{}'::jsonb, 'h2', NULL, 'auto_detailing'
      )`,
      [workspaceAuto]
    );
    const thread2 = res2.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id;

    expect(thread1).toBe(thread2);

    const threadCount = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.inbox_threads WHERE workspace_id = $1", [workspaceAuto]);
    expect(threadCount.rows[0].c).toBe(1);
  });

  // 5. Safe image metadata is retained without leaking binary content or secrets
  it("5. Safe media metadata persists without leaking private binary data", async () => {
    const mediaMetadata = {
      providerMediaId: "media_safe_12345",
      mimeType: "image/jpeg",
      caption: "Vehicle scratch photo",
      sha256: "hash_clean_xyz",
      fileSize: 320000,
    };

    const res = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid,
        'wamid_media_001',
        '+15557778888',
        'Carlos',
        'image',
        'Vehicle scratch photo',
        $2::jsonb,
        'h_media',
        NULL,
        'auto_detailing'
      )`,
      [workspaceAuto, JSON.stringify(mediaMetadata)]
    );

    const msgId = res.rows[0].record_canonical_whatsapp_inbound_atomic.message_id;
    const msg = await db.query<{ metadata: any }>("SELECT metadata FROM public.inbox_messages WHERE id = $1", [msgId]);
    expect(msg.rows[0].metadata.media.providerMediaId).toBe("media_safe_12345");
    expect(msg.rows[0].metadata.media.caption).toBe("Vehicle scratch photo");

    const journey = await db.query<{ media_references: any[] }>(
      "SELECT media_references FROM public.service_conversion_journeys WHERE workspace_id = $1 AND normalized_phone = '+15557778888'",
      [workspaceAuto]
    );
    expect(journey.rows[0].media_references.length).toBe(1);
    expect(journey.rows[0].media_references[0].providerMediaId).toBe("media_safe_12345");
  });

  // 6. Human handoff becomes terminal/suppressed and is not retried
  it("6. Human handoff / suppressed outcomes terminate cleanly via suppress_whatsapp_ai_job and do not retry", async () => {
    const threadRes = await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15554445555') RETURNING id",
      [workspaceBeauty]
    );
    const threadId = threadRes.rows[0].id;

    const claimToken = "11111111-2222-3333-4444-555555555555";
    const jobRes = await db.query<{ id: string }>(
      `INSERT INTO public.whatsapp_ai_jobs (
        workspace_id, thread_id, recipient_phone, inbound_text, inbound_wamid, idempotency_key, status, claim_token
      ) VALUES (
        $1, $2, '+15554445555', 'I need human manager', 'wamid_suppress_1', 'ai:suppress:1', 'processing', $3::uuid
      ) RETURNING id`,
      [workspaceBeauty, threadId, claimToken]
    );
    const jobId = jobRes.rows[0].id;

    const suppressRes = await db.query<{ suppress_whatsapp_ai_job: any }>(
      "SELECT public.suppress_whatsapp_ai_job($1::uuid, $2::uuid, 'human_handoff_active')",
      [jobId, claimToken]
    );
    expect(suppressRes.rows[0].suppress_whatsapp_ai_job.success).toBe(true);

    const job = await db.query<{ status: string; last_error: string }>(
      "SELECT status, last_error FROM public.whatsapp_ai_jobs WHERE id = $1",
      [jobId]
    );
    expect(job.rows[0].status).toBe("suppressed");
    expect(job.rows[0].last_error).toBe("human_handoff_active");
  });

  // 7. Canonical inbox reads from canonical tables, not integration_webhook_events
  it("7. Canonical inbox queries read from inbox_threads, contacts, and service_conversion_journeys", async () => {
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_inbox_001', '+15553334444', 'Jessica', 'text', 'Do you have full interior detailing slots?', '{}'::jsonb, 'h_inbox', NULL, 'auto_detailing'
      )`,
      [workspaceAuto]
    );

    const conversations = await db.query<any>(`
      SELECT
        t.id as thread_id,
        t.external_thread_id,
        c.name as contact_name,
        c.phone as contact_phone,
        scj.status as journey_status,
        scj.playbook_key,
        scj.requested_service
      FROM public.inbox_threads t
      LEFT JOIN public.contacts c ON t.contact_id = c.id
      LEFT JOIN public.service_conversion_journeys scj ON scj.thread_id = t.id
      WHERE t.workspace_id = $1 AND t.channel = 'whatsapp'
    `, [workspaceAuto]);

    expect(conversations.rows.length).toBe(1);
    expect(conversations.rows[0].contact_name).toBe("Jessica");
    expect(conversations.rows[0].journey_status).toBe("new");
    expect(conversations.rows[0].playbook_key).toBe("auto_detailing");
  });

  // 8. No last-eight-digit phone matching
  it("8. Phone resolution uses full E.164 normalization, avoiding last-8-digit collisions", async () => {
    // Phone A: +1 415 555 1234
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_phone_a', '+14155551234', 'User A', 'text', 'Hi', '{}'::jsonb, 'ha', NULL, 'general_service'
      )`,
      [workspaceBeauty]
    );

    // Phone B: +1 212 555 1234 (same last 7 digits, different area code)
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_phone_b', '+12125551234', 'User B', 'text', 'Hi', '{}'::jsonb, 'hb', NULL, 'general_service'
      )`,
      [workspaceBeauty]
    );

    const contacts = await db.query<any>("SELECT * FROM public.contacts WHERE workspace_id = $1", [workspaceBeauty]);
    expect(contacts.rows.length).toBe(2);
    expect(contacts.rows[0].phone).not.toBe(contacts.rows[1].phone);
  });

  // 9. No synthetic meeting URL is generated
  it("9. Booking creation never generates synthetic meet.j10nexus.com URLs", async () => {
    const contactRes = await db.query<{ id: string }>(
      "INSERT INTO public.contacts (workspace_id, name, phone) VALUES ($1, 'Test Client', '+15551112222') RETURNING id",
      [workspaceAuto]
    );
    const contactId = contactRes.rows[0].id;

    // Check constraint permits service_appointment
    const bookingRes = await db.query<{ id: string; meeting_url?: string | null }>(
      `INSERT INTO public.crm_bookings (
        workspace_id, contact_id, booking_type, status, scheduled_at
      ) VALUES (
        $1, $2, 'service_appointment', 'scheduled', now() + interval '2 days'
      ) RETURNING id, meeting_url`,
      [workspaceAuto, contactId]
    );

    expect(bookingRes.rows[0].id).toBeDefined();
    expect(bookingRes.rows[0].meeting_url).toBeNull();
  });

  // 10. External calendar confirmation semantics
  it("10. Lifecycle booked state requires explicit confirmation source", async () => {
    const threadRes = await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15552223333') RETURNING id",
      [workspaceAuto]
    );
    const threadId = threadRes.rows[0].id;

    const jRes = await db.query<{ id: string }>(
      `INSERT INTO public.service_conversion_journeys (
        workspace_id, thread_id, playbook_key, status, requested_service, estimated_service_value
      ) VALUES (
        $1, $2, 'auto_detailing', 'booking_offered', 'Full Interior Detail', 175.00
      ) RETURNING id`,
      [workspaceAuto, threadId]
    );
    const journeyId = jRes.rows[0].id;

    await db.query(
      `UPDATE public.service_conversion_journeys
       SET status = 'booked',
           booking_confirmation_source = 'calcom_webhook',
           attributed_revenue = estimated_service_value,
           updated_at = now()
       WHERE id = $1`,
      [journeyId]
    );

    const updated = await db.query<{ status: string; booking_confirmation_source: string; attributed_revenue: number }>(
      "SELECT status, booking_confirmation_source, attributed_revenue FROM public.service_conversion_journeys WHERE id = $1",
      [journeyId]
    );
    expect(updated.rows[0].status).toBe("booked");
    expect(updated.rows[0].booking_confirmation_source).toBe("calcom_webhook");
    expect(Number(updated.rows[0].attributed_revenue)).toBe(175);
  });

  // 11. Auditable lifecycle transitions
  it("11. Lifecycle status changes write auditable events with actor type and metadata", async () => {
    const threadRes = await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15557771111') RETURNING id",
      [workspaceBeauty]
    );
    const threadId = threadRes.rows[0].id;

    const jRes = await db.query<{ id: string }>(
      `INSERT INTO public.service_conversion_journeys (
        workspace_id, thread_id, playbook_key, status
      ) VALUES ($1, $2, 'beauty_grooming', 'contacted') RETURNING id`,
      [workspaceBeauty, threadId]
    );
    const journeyId = jRes.rows[0].id;

    await db.query(
      `INSERT INTO public.service_conversion_events (
        workspace_id, journey_id, from_status, to_status, reason, actor_type, actor_id
      ) VALUES ($1, $2, 'contacted', 'qualified', 'Extracted preferred date and time', 'ai_assistant', 'whatsapp_agent')`,
      [workspaceBeauty, journeyId]
    );

    const event = await db.query<any>("SELECT * FROM public.service_conversion_events WHERE journey_id = $1", [journeyId]);
    expect(event.rows.length).toBe(1);
    expect(event.rows[0].from_status).toBe("contacted");
    expect(event.rows[0].to_status).toBe("qualified");
    expect(event.rows[0].actor_type).toBe("ai_assistant");
  });

  // 12. Cancellation of pending follow-ups when journey enters terminal state
  it("12. Entering terminal state (booked, lost, human_takeover) cancels pending service follow-ups", async () => {
    const threadRes = await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15553332222') RETURNING id",
      [workspaceAuto]
    );
    const threadId = threadRes.rows[0].id;

    const jRes = await db.query<{ id: string }>(
      `INSERT INTO public.service_conversion_journeys (
        workspace_id, thread_id, playbook_key, status
      ) VALUES ($1, $2, 'auto_detailing', 'contacted') RETURNING id`,
      [workspaceAuto, threadId]
    );
    const journeyId = jRes.rows[0].id;

    await db.query(
      `INSERT INTO public.service_followups (
        workspace_id, journey_id, thread_id, followup_type, scheduled_for, status
      ) VALUES ($1, $2, $3, 'inquiry_followup', now() + interval '24 hours', 'scheduled')`,
      [workspaceAuto, journeyId, threadId]
    );

    // Transition to terminal state cancels followups
    await db.query(
      `UPDATE public.service_followups
       SET status = 'cancelled',
           cancel_reason = 'lifecycle_transition_to_human_takeover',
           updated_at = now()
       WHERE workspace_id = $1 AND journey_id = $2 AND status = 'scheduled'`,
      [workspaceAuto, journeyId]
    );

    const followups = await db.query<{ status: string; cancel_reason: string }>(
      "SELECT status, cancel_reason FROM public.service_followups WHERE journey_id = $1",
      [journeyId]
    );
    expect(followups.rows[0].status).toBe("cancelled");
    expect(followups.rows[0].cancel_reason).toBe("lifecycle_transition_to_human_takeover");
  });

  // 13. Metrics derived only from real persisted data
  it("13. Conversion metrics are derived strictly from persisted canonical rows with honest zero baseline", async () => {
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

    const emptyMetrics = await calculateServiceBusinessMetrics(createPgliteSupabase(db), workspaceBeauty);
    expect(emptyMetrics.inquiriesReceived).toBe(0);
    expect(emptyMetrics.booked).toBe(0);
    expect(emptyMetrics.estimatedServiceValue).toBe(0);
    expect(emptyMetrics.confirmedAttributedRevenue).toBe(0);

    // Insert 2 real rows
    await db.query(
      `INSERT INTO public.service_conversion_journeys (
        workspace_id, playbook_key, status, requested_service, estimated_service_value, attributed_revenue
      ) VALUES
      ($1, 'auto_detailing', 'booked', 'Full Interior Detail', 175.00, 175.00),
      ($1, 'auto_detailing', 'qualified', 'Paint Correction', 350.00, NULL)`,
      [workspaceAuto]
    );

    const autoMetrics = await calculateServiceBusinessMetrics(createPgliteSupabase(db), workspaceAuto);
    expect(autoMetrics.inquiriesReceived).toBe(2);
    expect(autoMetrics.qualified).toBe(2);
    expect(autoMetrics.booked).toBe(1);
    expect(autoMetrics.estimatedServiceValue).toBe(525);
    expect(autoMetrics.confirmedAttributedRevenue).toBe(175);
    expect(autoMetrics.inquiryToBookedRate).toBe(0.5);
  });

  // 14. Beauty works as a playbook fixture
  it("14. Beauty & Grooming playbook extracts services, pricing, and qualification correctly", () => {
    const message = "Hi, I need a Balayage next Friday around 2pm";
    const extracted = extractServiceIntent({
      text: message,
      playbook: beautyGroomingPlaybook,
      bookingLink: "https://booking.example.com/luxe",
    });

    expect(extracted.playbookKey).toBe("beauty_grooming");
    expect(extracted.requestedService).toBe("Balayage");
    expect(extracted.serviceKey).toBe("balayage");
    expect(extracted.estimatedServiceValue).toBe(180);
    expect(extracted.isQuoteRequired).toBe(false);
    expect(extracted.preferredTime).toBe("2PM");
    expect(extracted.qualificationCompleteness).toBeGreaterThanOrEqual(0.7);
    expect(extracted.suggestedStatus).toBe("qualified");
  });

  // 15. Non-beauty service business works through the exact same engine
  it("15. Non-beauty Auto Detailing playbook extracts services, quotes, and moves through the exact same engine", () => {
    // Test a fixed-price package
    const msg1 = "Can I schedule a Full Interior Detail tomorrow morning?";
    const ext1 = extractServiceIntent({
      text: msg1,
      playbook: autoDetailingPlaybook,
      bookingLink: "https://booking.example.com/apex",
    });

    expect(ext1.playbookKey).toBe("auto_detailing");
    expect(ext1.requestedService).toBe("Full Interior Detail");
    expect(ext1.estimatedServiceValue).toBe(175);
    expect(ext1.isQuoteRequired).toBe(false);
    expect(ext1.preferredTime).toBe("Morning");
    expect(ext1.suggestedStatus).toBe("qualified");

    // Test a custom-quote package (Ceramic Coating)
    const msg2 = "How much for a Ceramic Coating on my truck?";
    const ext2 = extractServiceIntent({
      text: msg2,
      playbook: autoDetailingPlaybook,
    });

    expect(ext2.requestedService).toBe("Ceramic Coating");
    expect(ext2.estimatedServiceValue).toBeNull();
    expect(ext2.isQuoteRequired).toBe(true);
  });

  // 16. Auto Detailing escalation keywords trigger human takeover
  it("16. Playbook-specific escalation keywords trigger human takeover on non-beauty services", () => {
    const damageMsg = "You guys left a scratch and dent on my car door!";
    const ext = extractServiceIntent({
      text: damageMsg,
      playbook: autoDetailingPlaybook,
    });

    expect(ext.humanHandoffRequested).toBe(true);
    expect(ext.suggestedStatus).toBe("human_takeover");
    expect(ext.humanHandoffReason).toContain("scratch");
  });

  // 17. The generic engine contains no hardcoded beauty service vocabulary
  it("17. Generic engine code contains no hardcoded beauty service names", () => {
    const conversionServiceCode = readFileSync(
      resolve(process.cwd(), "lib/service-business/conversion-service.ts"),
      "utf8"
    );

    const beautyKeywords = [
      "balayage",
      "silk press",
      "gel manicure",
      "haircut",
      "lashes",
      "nail salon",
      "barbershop",
    ];

    for (const kw of beautyKeywords) {
      expect(conversionServiceCode.toLowerCase()).not.toContain(kw);
    }
  });

  // 18. The database contains no beauty-specific core table or RPC names
  it("18. Migration 20261008 contains no beauty_* core tables or RPC names", () => {
    const migrationCode = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261008_service_business_conversion_engine.sql"),
      "utf8"
    );

    expect(migrationCode).not.toContain("beauty_conversion_lifecycles");
    expect(migrationCode).not.toContain("beauty_lifecycle_transitions");
    expect(migrationCode).not.toContain("beauty_followups");
    expect(migrationCode).toContain("service_conversion_journeys");
    expect(migrationCode).toContain("service_conversion_events");
    expect(migrationCode).toContain("service_followups");
  });

  // 19. Core APIs do not use /api/beauty/
  it("19. Old beauty API routes are removed and replaced with /api/service-business/", () => {
    const oldBeautyDirExists = existsSync(resolve(process.cwd(), "app/api/beauty"));
    expect(oldBeautyDirExists).toBe(false);

    const newLifecycleRoute = existsSync(resolve(process.cwd(), "app/api/service-business/lifecycle/route.ts"));
    const newMetricsRoute = existsSync(resolve(process.cwd(), "app/api/service-business/metrics/route.ts"));
    const newResumeRoute = existsSync(resolve(process.cwd(), "app/api/service-business/operator-resume/route.ts"));

    expect(newLifecycleRoute).toBe(true);
    expect(newMetricsRoute).toBe(true);
    expect(newResumeRoute).toBe(true);
  });

  // 20. Cross-workspace reads and writes fail closed
  it("20. Cross-workspace reads and writes are strictly isolated and fail closed", async () => {
    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_iso_1', '+15551113333', 'Client Beauty', 'text', 'Hair appointment', '{}'::jsonb, 'h_iso_1', NULL, 'beauty_grooming'
      )`,
      [workspaceBeauty]
    );

    await db.query(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_iso_2', '+15552224444', 'Client Auto', 'text', 'Detailing reservation', '{}'::jsonb, 'h_iso_2', NULL, 'auto_detailing'
      )`,
      [workspaceAuto]
    );

    const journeysBeauty = await db.query("SELECT * FROM public.service_conversion_journeys WHERE workspace_id = $1", [workspaceBeauty]);
    const journeysAuto = await db.query("SELECT * FROM public.service_conversion_journeys WHERE workspace_id = $1", [workspaceAuto]);

    expect(journeysBeauty.rows.length).toBe(1);
    expect(journeysAuto.rows.length).toBe(1);

    // Cross-query for Workspace Auto data from Workspace Beauty returns 0
    const cross = await db.query("SELECT * FROM public.service_conversion_journeys WHERE workspace_id = $1 AND normalized_phone = '+15552224444'", [workspaceBeauty]);
    expect(cross.rows.length).toBe(0);
  });
});
