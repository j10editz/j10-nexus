import { describe, expect, it, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractServiceIntent,
  updateServiceJourneyLifecycleState,
  operatorResumeJourneyAi,
  calculateServiceBusinessMetrics,
} from "@/lib/service-business/conversion-service";
import { beautyGroomingPlaybook } from "@/lib/service-business/playbooks/beauty-grooming";
import { autoDetailingPlaybook } from "@/lib/service-business/playbooks/auto-detailing";
import { getPlaybook, defaultPlaybook, isValidPlaybookKey, resolveAuthoritativePlaybookKey } from "@/lib/service-business/playbooks/registry";
import { createWorkspaceBooking, confirmWorkspaceBookingAtomic } from "@/lib/revenue/bookings";
import { processWhatsAppPayload } from "@/lib/whatsapp/webhook-handler";
import { buildAssistantSystemInstruction } from "@/lib/ai/whatsapp-assistant";
import type { IntegrationConnection } from "@/types/integration";

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
    GRANT SELECT ON public.workspace_memberships TO authenticated;
    CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.workspace_memberships
        WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND status = 'active'
      );
    $$;
    CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id uuid, p_roles text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.workspace_memberships
        WHERE workspace_id = p_workspace_id AND user_id = auth.uid() AND status = 'active' AND role = ANY(p_roles)
      );
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
      integration_id uuid,
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
      updated_at timestamptz not null default now(),
      unique(workspace_id, id)
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
      status text default 'requested',
      external_reservation_status text default 'pending_confirmation',
      external_calendar_provider text,
      external_calendar_event_id text,
      notes text,
      host_user_id uuid,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      CONSTRAINT chk_crm_bookings_type CHECK (booking_type IN ('executive_walkthrough', 'discovery_call', 'technical_demo', 'closing_call', 'onboarding', 'service_appointment', 'consultation'))
    );
  `);

  await db.exec(stage1Migration);
  await db.exec(outboxMigration);
  await db.exec(embeddedSignupMigration);
  await db.exec(serviceEngineMigration);

  return db;
}

/**
 * Creates an authoritative SupabaseClient adapter wrapping PGlite
 * to drive production routes and handlers with real database contracts.
 */
function createPgliteSupabaseAdapter(db: PGlite): SupabaseClient {
  return {
    from: (table: string) => {
      let filterCol: string | null = null;
      let filterVal: any = null;
      let insertedData: any = null;
      let updatedData: any = null;

      const builder: any = {
        select: (_cols?: string) => builder,
        insert: (data: any) => {
          insertedData = data;
          return builder;
        },
        update: (data: any) => {
          updatedData = data;
          return builder;
        },
        eq: (col: string, val: any) => {
          filterCol = col;
          filterVal = val;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const res = await db.query(`SELECT * FROM public.${table} WHERE ${filterCol} = $1 LIMIT 1`, [filterVal]);
          return { data: res.rows[0] || null, error: null };
        },
        single: async () => {
          if (insertedData) {
            const keys = Object.keys(insertedData);
            const vals = Object.values(insertedData);
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
            const cols = keys.join(", ");
            const res = await db.query(
              `INSERT INTO public.${table} (${cols}) VALUES (${placeholders}) RETURNING *`,
              vals
            );
            return { data: res.rows[0], error: null };
          }
          if (updatedData) {
            const keys = Object.keys(updatedData);
            const vals = Object.values(updatedData);
            const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
            const res = await db.query(
              `UPDATE public.${table} SET ${sets} WHERE ${filterCol} = $${keys.length + 1} RETURNING *`,
              [...vals, filterVal]
            );
            return { data: res.rows[0] || null, error: null };
          }
          const res = await db.query(`SELECT * FROM public.${table} WHERE ${filterCol} = $1 LIMIT 1`, [filterVal]);
          return { data: res.rows[0] || null, error: null };
        },
        then: async (resolve: any) => {
          if (updatedData && filterCol) {
            const keys = Object.keys(updatedData);
            const vals = Object.values(updatedData);
            const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
            const res = await db.query(
              `UPDATE public.${table} SET ${sets} WHERE ${filterCol} = $${keys.length + 1} RETURNING *`,
              [...vals, filterVal]
            );
            return resolve({ data: res.rows, error: null });
          }
          const res = await db.query(
            filterCol ? `SELECT * FROM public.${table} WHERE ${filterCol} = $1` : `SELECT * FROM public.${table}`,
            filterCol ? [filterVal] : []
          );
          return resolve({ data: res.rows, error: null });
        },
      };
      return builder;
    },
    rpc: async (fn: string, params: Record<string, any>) => {
      try {
        if (fn === "record_canonical_whatsapp_inbound_atomic") {
          const res = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
            `SELECT public.record_canonical_whatsapp_inbound_atomic(
              $1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::uuid, $10
            )`,
            [
              params.p_workspace_id,
              params.p_wamid,
              params.p_from_phone,
              params.p_sender_name,
              params.p_message_type,
              params.p_content,
              JSON.stringify(params.p_metadata || {}),
              params.p_payload_hash || null,
              params.p_integration_id || null,
              params.p_playbook_key || "general_service",
            ]
          );
          return { data: res.rows[0].record_canonical_whatsapp_inbound_atomic, error: null };
        }

        if (fn === "transition_service_journey_atomic") {
          const res = await db.query<{ transition_service_journey_atomic: any }>(
            `SELECT public.transition_service_journey_atomic(
              $1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8, $9::date, $10, $11::numeric, $12::numeric, $13, $14::numeric
            )`,
            [
              params.p_workspace_id,
              params.p_journey_id,
              params.p_to_status,
              params.p_actor_type,
              params.p_actor_id || null,
              params.p_reason || null,
              JSON.stringify(params.p_metadata || {}),
              params.p_requested_service || null,
              params.p_preferred_date || null,
              params.p_preferred_time || null,
              params.p_estimated_value ?? null,
              params.p_qualification_completeness ?? null,
              params.p_booking_confirmation_source || null,
              params.p_attributed_revenue ?? null,
            ]
          );
          return { data: res.rows[0].transition_service_journey_atomic, error: null };
        }

        if (fn === "confirm_workspace_booking_atomic") {
          const res = await db.query<{ confirm_workspace_booking_atomic: any }>(
            `SELECT public.confirm_workspace_booking_atomic(
              $1::uuid, $2::uuid, $3, $4, $5::numeric, $6
            )`,
            [
              params.p_workspace_id,
              params.p_booking_id,
              params.p_provider,
              params.p_provider_event_id,
              params.p_confirmed_revenue ?? 0,
              params.p_actor_id || "booking_provider_callback",
            ]
          );
          return { data: res.rows[0].confirm_workspace_booking_atomic, error: null };
        }

        if (fn === "suppress_whatsapp_ai_job") {
          const res = await db.query<{ suppress_whatsapp_ai_job: any }>(
            `SELECT public.suppress_whatsapp_ai_job($1::uuid, $2::uuid, $3)`,
            [params.p_job_id, params.p_claim_token, params.p_reason || "suppressed"]
          );
          return { data: res.rows[0].suppress_whatsapp_ai_job, error: null };
        }

        throw new Error(`Unknown RPC in adapter: ${fn}`);
      } catch (err: any) {
        return { data: null, error: err };
      }
    },
  } as any;
}

describe("J10 Service Business Conversion Engine - Production Path Invariants", () => {
  let db: PGlite;
  let supabase: SupabaseClient;
  let workspaceBeauty: string;
  let workspaceAuto: string;
  let workspaceGeneral: string;
  let workspaceInvalid: string;
  let integrationBeauty: string;
  let integrationAuto: string;
  let userOwner: string;
  let userViewer: string;
  let userSuspended: string;

  beforeEach(async () => {
    db = await setupDatabase();
    supabase = createPgliteSupabaseAdapter(db);

    const u1 = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('owner@example.com') RETURNING id"
    );
    userOwner = u1.rows[0].id;

    const u2 = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('viewer@example.com') RETURNING id"
    );
    userViewer = u2.rows[0].id;

    const u3 = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('suspended@example.com') RETURNING id"
    );
    userSuspended = u3.rows[0].id;

    // 1. Beauty workspace
    const ws1 = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id, name, metadata) VALUES ($1, 'Luxe Salon & Spa', '{\"playbook_key\": \"beauty_grooming\"}'::jsonb) RETURNING id",
      [userOwner]
    );
    workspaceBeauty = ws1.rows[0].id;

    // 2. Auto Detailing workspace
    const ws2 = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id, name, metadata) VALUES ($1, 'Apex Auto Detailing', '{\"playbook_key\": \"auto_detailing\"}'::jsonb) RETURNING id",
      [userOwner]
    );
    workspaceAuto = ws2.rows[0].id;

    // 3. Unconfigured workspace
    const ws3 = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id, name, metadata) VALUES ($1, 'Standard Enterprise', '{}'::jsonb) RETURNING id",
      [userOwner]
    );
    workspaceGeneral = ws3.rows[0].id;

    // 4. Invalid key workspace
    const ws4 = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (owner_user_id, name, metadata) VALUES ($1, 'Crypto Consulting', '{\"playbook_key\": \"crypto_speculation_unknown\"}'::jsonb) RETURNING id",
      [userOwner]
    );
    workspaceInvalid = ws4.rows[0].id;

    // Workspace memberships
    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
      [workspaceBeauty, userOwner]
    );
    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'viewer', 'active')",
      [workspaceBeauty, userViewer]
    );
    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'agent', 'suspended')",
      [workspaceBeauty, userSuspended]
    );

    // Integrations
    const int1 = await db.query<{ id: string }>(
      "INSERT INTO public.integrations (workspace_id, user_id, provider, status) VALUES ($1, $2, 'whatsapp', 'connected') RETURNING id",
      [workspaceBeauty, userOwner]
    );
    integrationBeauty = int1.rows[0].id;

    const int2 = await db.query<{ id: string }>(
      "INSERT INTO public.integrations (workspace_id, user_id, provider, status) VALUES ($1, $2, 'whatsapp', 'connected') RETURNING id",
      [workspaceAuto, userOwner]
    );
    integrationAuto = int2.rows[0].id;
  });

  // 1. Authoritative Workspace Playbook Resolution via Webhook Ingestion Path
  it("1. Webhook production path resolves authoritative playbook keys and defaults safely", async () => {
    const buildPayload = (wamid: string, text: string) => ({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: wamid, from: "15551234567", type: "text", text: { body: text } }],
                contacts: [{ profile: { name: "Test User" } }],
              },
            },
          ],
        },
      ],
    });

    // Test A: Beauty-configured workspace -> beauty_grooming
    const resBeauty = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationBeauty, workspaceId: workspaceBeauty } as IntegrationConnection,
      endpoint: { id: "ep1", integrationId: integrationBeauty },
      payload: buildPayload("wamid_prod_beauty_1", "I would like a silk press haircut"),
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    expect(resBeauty.status).toBe(200);
    const beautyJson = await resBeauty.json();
    expect(beautyJson.playbookKey).toBe("beauty_grooming");

    const jBeauty = await db.query<any>("SELECT playbook_key FROM public.service_conversion_journeys WHERE thread_id = $1", [beautyJson.threadId]);
    expect(jBeauty.rows[0].playbook_key).toBe("beauty_grooming");

    // Test B: Auto-detailing workspace -> auto_detailing
    const resAuto = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationAuto, workspaceId: workspaceAuto } as IntegrationConnection,
      endpoint: { id: "ep2", integrationId: integrationAuto },
      payload: buildPayload("wamid_prod_auto_1", "I need paint correction and ceramic coating"),
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    expect(resAuto.status).toBe(200);
    const autoJson = await resAuto.json();
    expect(autoJson.playbookKey).toBe("auto_detailing");

    const jAuto = await db.query<any>("SELECT playbook_key FROM public.service_conversion_journeys WHERE thread_id = $1", [autoJson.threadId]);
    expect(jAuto.rows[0].playbook_key).toBe("auto_detailing");

    // Test C: Unconfigured workspace -> general_service
    const intGen = (await db.query<{ id: string }>(
      "INSERT INTO public.integrations (workspace_id, provider, status) VALUES ($1, 'whatsapp', 'connected') RETURNING id",
      [workspaceGeneral]
    )).rows[0].id;

    const resGen = await processWhatsAppPayload({
      supabase,
      connection: { id: intGen, workspaceId: workspaceGeneral } as IntegrationConnection,
      endpoint: { id: "ep3", integrationId: intGen },
      payload: buildPayload("wamid_prod_gen_1", "Hello I need service"),
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    expect(resGen.status).toBe(200);
    const genJson = await resGen.json();
    expect(genJson.playbookKey).toBe("general_service");

    // Test D: Invalid key workspace -> safely general_service
    const intInv = (await db.query<{ id: string }>(
      "INSERT INTO public.integrations (workspace_id, provider, status) VALUES ($1, 'whatsapp', 'connected') RETURNING id",
      [workspaceInvalid]
    )).rows[0].id;

    const resInv = await processWhatsAppPayload({
      supabase,
      connection: { id: intInv, workspaceId: workspaceInvalid } as IntegrationConnection,
      endpoint: { id: "ep4", integrationId: intInv },
      payload: buildPayload("wamid_prod_inv_1", "Hello"),
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    expect(resInv.status).toBe(200);
    const invJson = await resInv.json();
    expect(invJson.playbookKey).toBe("general_service");

    // Test E: Registry verification helper
    expect(isValidPlaybookKey("beauty_grooming")).toBe(true);
    expect(isValidPlaybookKey("auto_detailing")).toBe(true);
    expect(isValidPlaybookKey("invalid_key_xyz")).toBe(false);
  });

  // 2. Playbooks as Templates, Prioritizing Workspace Effective Catalog
  it("2. Extractor prioritizes workspace effective catalog over static template prices and supports arbitrary services", () => {
    // Workspace with customized pricing: Balayage customized to $240 (template default is $180)
    const customServices = [
      { name: "Balayage Deluxe", price: 240, durationMinutes: 150 },
      { name: "Custom Hair Treatment", price: 95, durationMinutes: 45 },
    ];

    const extracted = extractServiceIntent({
      text: "Can I book Balayage Deluxe on Saturday?",
      playbook: beautyGroomingPlaybook,
      workspaceServices: customServices,
      bookingLink: "https://salon.example.com/book",
    });

    expect(extracted.requestedService).toBe("Balayage Deluxe");
    expect(extracted.estimatedServiceValue).toBe(240); // NOT static template price 180!

    // Arbitrary new service business without editing registry or migration
    const cleaningServices = [
      { name: "Move-In Deep Cleaning", price: 320, durationMinutes: 240 },
      { name: "Standard Maid Service", price: 140, durationMinutes: 120 },
    ];

    const cleanExtracted = extractServiceIntent({
      text: "How much for a Move-In Deep Cleaning next Monday?",
      playbook: defaultPlaybook,
      workspaceServices: cleaningServices,
      bookingLink: "https://clean.example.com/book",
    });

    expect(cleanExtracted.requestedService).toBe("Move-In Deep Cleaning");
    expect(cleanExtracted.estimatedServiceValue).toBe(320);
    expect(cleanExtracted.suggestedStatus).toBe("qualified");
  });

  // 3. Grounded AI Context Contract Test
  it("3. AI Assistant system instruction contains all grounded business details and safety constraints", () => {
    const instruction = buildAssistantSystemInstruction({
      businessName: "Prestige Auto Spa",
      businessDescription: "High-end automotive protection and detailing studio.",
      businessHours: "Monday - Saturday: 8:00 AM - 6:00 PM",
      bookingLink: "https://prestige.example.com/reserve",
      services: [
        { name: "Ceramic Pro Gold", price: 899, durationMinutes: 180, description: "Multi-layer ceramic coating" },
        { name: "Signature Interior Detail", price: 220, durationMinutes: 90 },
      ],
      pricingNotes: "Vehicles with heavy pet hair or mud require a $50 prep surcharge.",
      faqs: [
        { question: "How long does ceramic coating last?", answer: "Our Ceramic Pro Gold package lasts 5+ years." },
      ],
      policies: "24-hour advance notice required for appointment cancellation or reschedule.",
      escalationInstructions: "For damage claims or refund disputes, notify management immediately.",
      playbook: autoDetailingPlaybook,
    });

    expect(instruction).toContain("Prestige Auto Spa");
    expect(instruction).toContain("Ceramic Pro Gold");
    expect(instruction).toContain("899");
    expect(instruction).toContain("Signature Interior Detail");
    expect(instruction).toContain("220");
    expect(instruction).toContain("Monday - Saturday: 8:00 AM - 6:00 PM");
    expect(instruction).toContain("https://prestige.example.com/reserve");
    expect(instruction).toContain("heavy pet hair or mud require a $50 prep surcharge");
    expect(instruction).toContain("How long does ceramic coating last?");
    expect(instruction).toContain("24-hour advance notice required");
    expect(instruction).toContain("For damage claims or refund disputes");
    expect(instruction).toContain("NEVER claim an appointment or reservation is booked or confirmed");
    expect(instruction).toContain("NEVER invent");
  });

  // 4. Strict Atomic Ingestion & Job Suppression Rules
  it("4. Ingestion enforces strict atomic contracts without fallback insertions", async () => {
    // A. Normal text message creates exactly 1 AI job
    const resText = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationBeauty, workspaceId: workspaceBeauty } as IntegrationConnection,
      endpoint: { id: "ep1", integrationId: integrationBeauty },
      payload: {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: "wamid_strict_text", from: "15550001111", type: "text", text: { body: "Can I book a facial?" } }],
              contacts: [{ profile: { name: "Client 1" } }],
            },
          }],
        }],
      },
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    const textJson = await resText.json();
    expect(resText.status).toBe(200);
    expect(textJson.jobId).toBeDefined();

    const jobsCount = await db.query<{ c: number }>("SELECT count(*)::int as c FROM public.whatsapp_ai_jobs WHERE inbound_wamid = 'wamid_strict_text'");
    expect(jobsCount.rows[0].c).toBe(1);

    // B. Non-text input creates NO AI job
    const resImg = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationBeauty, workspaceId: workspaceBeauty } as IntegrationConnection,
      endpoint: { id: "ep1", integrationId: integrationBeauty },
      payload: {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: "wamid_strict_img", from: "15550001111", type: "image", image: { id: "media_123", caption: "Hair photo" } }],
              contacts: [{ profile: { name: "Client 1" } }],
            },
          }],
        }],
      },
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    const imgJson = await resImg.json();
    expect(resImg.status).toBe(200);
    expect(imgJson.jobId).toBeNull();
    expect(imgJson.suppressionReason).toBe("non_text_message");

    // C. Thread with AI disabled creates NO AI job
    await db.query(
      "UPDATE public.inbox_threads SET metadata = metadata || '{\"aiBotEnabled\": false}'::jsonb WHERE id = $1",
      [textJson.threadId]
    );

    const resAiDisabled = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationBeauty, workspaceId: workspaceBeauty } as IntegrationConnection,
      endpoint: { id: "ep1", integrationId: integrationBeauty },
      payload: {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: "wamid_strict_disabled", from: "15550001111", type: "text", text: { body: "Hello again" } }],
            },
          }],
        }],
      },
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    const disabledJson = await resAiDisabled.json();
    expect(disabledJson.jobId).toBeNull();
    expect(disabledJson.suppressionReason).toBe("ai_disabled_on_thread");

    // D. Thread with human takeover active creates NO AI job
    await db.query(
      "UPDATE public.inbox_threads SET metadata = metadata || '{\"aiBotEnabled\": true, \"humanHandoff\": true}'::jsonb WHERE id = $1",
      [textJson.threadId]
    );

    const resHandoff = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationBeauty, workspaceId: workspaceBeauty } as IntegrationConnection,
      endpoint: { id: "ep1", integrationId: integrationBeauty },
      payload: {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: "wamid_strict_handoff", from: "15550001111", type: "text", text: { body: "Where is the manager?" } }],
            },
          }],
        }],
      },
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    const handoffJson = await resHandoff.json();
    expect(handoffJson.jobId).toBeNull();
    expect(handoffJson.suppressionReason).toBe("human_takeover_active");
  });

  // 5. Correct Duplicate Conflict Handling (200 for Duplicate, 409 for Conflict)
  it("5. Route returns 200 on identical wamid replay and 409 WHATSAPP_WAMID_PAYLOAD_CONFLICT on conflicting replay", async () => {
    const payloadOriginal = {
      entry: [{
        changes: [{
          value: {
            messages: [{ id: "wamid_idemp_001", from: "15559876543", type: "text", text: { body: "Initial inquiry" } }],
          },
        }],
      }],
    };

    // 1st delivery
    const res1 = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationAuto, workspaceId: workspaceAuto } as IntegrationConnection,
      endpoint: { id: "ep2", integrationId: integrationAuto },
      payload: payloadOriginal,
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    expect(res1.status).toBe(200);

    // 2nd delivery: Identical replay -> HTTP 200 duplicate
    const resDup = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationAuto, workspaceId: workspaceAuto } as IntegrationConnection,
      endpoint: { id: "ep2", integrationId: integrationAuto },
      payload: payloadOriginal,
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    expect(resDup.status).toBe(200);
    const dupJson = await resDup.json();
    expect(dupJson.duplicate).toBe(true);

    // 3rd delivery: Conflicting payload with same wamid -> HTTP 409 Conflict
    const payloadConflict = {
      entry: [{
        changes: [{
          value: {
            messages: [{ id: "wamid_idemp_001", from: "15559876543", type: "text", text: { body: "Tampered inquiry content" } }],
          },
        }],
      }],
    };

    const resConflict = await processWhatsAppPayload({
      supabase,
      connection: { id: integrationAuto, workspaceId: workspaceAuto } as IntegrationConnection,
      endpoint: { id: "ep2", integrationId: integrationAuto },
      payload: payloadConflict,
      requestUrl: "https://app.j10nexus.com/api/webhooks/whatsapp",
    });
    expect(resConflict.status).toBe(409);
    const conflictJson = await resConflict.json();
    expect(conflictJson.error).toBe("WHATSAPP_WAMID_PAYLOAD_CONFLICT");
  });

  // 6. Thread Scoping to WhatsApp Integration
  it("6. Scopes threads to workspace + integration + channel + sender", async () => {
    // Create a 2nd WhatsApp integration in Workspace Beauty (e.g. 2nd branch or phone number)
    const intBeautyBranch2 = (await db.query<{ id: string }>(
      "INSERT INTO public.integrations (workspace_id, provider, status) VALUES ($1, 'whatsapp', 'connected') RETURNING id",
      [workspaceBeauty]
    )).rows[0].id;

    const senderPhone = "+15553337777";

    // Ingestion on Integration 1
    const resInt1 = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_int_1', $2, 'User', 'text', 'Hello branch 1', '{}'::jsonb, 'h1', $3::uuid, 'beauty_grooming'
      )`,
      [workspaceBeauty, senderPhone, integrationBeauty]
    );
    const threadId1 = resInt1.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id;

    // Consecutive message on Integration 1 reuses same thread
    const resInt1Repeat = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_int_1_rep', $2, 'User', 'text', 'More info branch 1', '{}'::jsonb, 'h2', $3::uuid, 'beauty_grooming'
      )`,
      [workspaceBeauty, senderPhone, integrationBeauty]
    );
    expect(resInt1Repeat.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id).toBe(threadId1);

    // Ingestion from same customer on Integration 2 creates SEPARATE thread
    const resInt2 = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_int_2', $2, 'User', 'text', 'Hello branch 2', '{}'::jsonb, 'h3', $3::uuid, 'beauty_grooming'
      )`,
      [workspaceBeauty, senderPhone, intBeautyBranch2]
    );
    const threadId2 = resInt2.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id;
    expect(threadId2).not.toBe(threadId1);

    // Ingestion with foreign workspace integration is rejected
    let rejected = false;
    try {
      await db.query(
        `SELECT public.record_canonical_whatsapp_inbound_atomic(
          $1::uuid, 'wamid_foreign', $2, 'User', 'text', 'Foreign test', '{}'::jsonb, 'h4', $3::uuid, 'beauty_grooming'
        )`,
        [workspaceBeauty, senderPhone, integrationAuto] // Auto integration belongs to wsAuto, not wsBeauty!
      );
    } catch (err: any) {
      rejected = true;
      expect(err.message).toMatch(/does not belong to workspace/i);
    }
    expect(rejected).toBe(true);
  });

  // 7. Removal of Legacy Inbox Fallbacks
  it("7. Canonical conversations and inbox service do not read from legacy integration_webhook_events", () => {
    const routeCode = readFileSync(
      resolve(process.cwd(), "app/api/integrations/[id]/whatsapp/conversations/route.ts"),
      "utf8"
    );
    const inboxServiceCode = readFileSync(
      resolve(process.cwd(), "lib/whatsapp/inbox-service.ts"),
      "utf8"
    );

    expect(routeCode).not.toContain("integration_webhook_events");
    expect(inboxServiceCode).not.toContain("integration_webhook_events");
  });

  // 8. Transaction-Level Advisory Lock Concurrency Protection
  it("8. Concurrent inbound messages serialize via advisory locks without duplicate contacts or threads", async () => {
    const phone = "+15558889999";
    const sender = "Simultaneous Customer";

    // Run 2 simultaneous inbound ingestion calls for the same phone & integration
    const [resA, resB] = await Promise.all([
      db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
        `SELECT public.record_canonical_whatsapp_inbound_atomic(
          $1::uuid, 'wamid_conc_a', $2, $3, 'text', 'Message A', '{}'::jsonb, 'ha', $4::uuid, 'auto_detailing'
        )`,
        [workspaceAuto, phone, sender, integrationAuto]
      ),
      db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
        `SELECT public.record_canonical_whatsapp_inbound_atomic(
          $1::uuid, 'wamid_conc_b', $2, $3, 'text', 'Message B', '{}'::jsonb, 'hb', $4::uuid, 'auto_detailing'
        )`,
        [workspaceAuto, phone, sender, integrationAuto]
      ),
    ]);

    expect(resA.rows[0].record_canonical_whatsapp_inbound_atomic.success).toBe(true);
    expect(resB.rows[0].record_canonical_whatsapp_inbound_atomic.success).toBe(true);

    const threadA = resA.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id;
    const threadB = resB.rows[0].record_canonical_whatsapp_inbound_atomic.thread_id;
    expect(threadA).toBe(threadB);

    const contactA = resA.rows[0].record_canonical_whatsapp_inbound_atomic.contact_id;
    const contactB = resB.rows[0].record_canonical_whatsapp_inbound_atomic.contact_id;
    expect(contactA).toBe(contactB);

    const contactCount = await db.query<{ c: number }>(
      "SELECT count(*)::int as c FROM public.contacts WHERE workspace_id = $1 AND phone = $2",
      [workspaceAuto, phone]
    );
    expect(contactCount.rows[0].c).toBe(1);

    const threadCount = await db.query<{ c: number }>(
      "SELECT count(*)::int as c FROM public.inbox_threads WHERE workspace_id = $1 AND external_thread_id = $2",
      [workspaceAuto, phone]
    );
    expect(threadCount.rows[0].c).toBe(1);
  });

  // 9. Atomic Lifecycle Transitions & Allowed State Machine
  it("9. Transactional lifecycle transition RPC enforces allowed transitions and terminal cancellation", async () => {
    // Ingest initial inquiry
    const inb = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_trans_1', '+15556667777', 'Lifecycle Client', 'text', 'Need full detail', '{}'::jsonb, 'ht1', $2::uuid, 'auto_detailing'
      )`,
      [workspaceAuto, integrationAuto]
    );
    const { journey_id: journeyId, thread_id: threadId } = inb.rows[0].record_canonical_whatsapp_inbound_atomic;

    // Create a scheduled follow-up
    await db.query(
      `INSERT INTO public.service_followups (
        workspace_id, journey_id, thread_id, followup_type, scheduled_for, status
      ) VALUES ($1, $2, $3, 'inquiry_followup', now() + interval '24 hours', 'scheduled')`,
      [workspaceAuto, journeyId, threadId]
    );

    // Legal transition: new -> contacted
    const step1 = await updateServiceJourneyLifecycleState(supabase, {
      workspaceId: workspaceAuto,
      journeyId,
      toStatus: "contacted",
      actorType: "ai_assistant",
      reason: "Automated greeting sent",
    });
    expect(step1.status).toBe("contacted");

    // Legal transition: contacted -> qualified
    const step2 = await updateServiceJourneyLifecycleState(supabase, {
      workspaceId: workspaceAuto,
      journeyId,
      toStatus: "qualified",
      actorType: "ai_assistant",
      requestedService: "Full Interior Detail",
      estimatedServiceValue: 175,
    });
    expect(step2.status).toBe("qualified");

    // Disallowed regression: qualified -> contacted throws
    await expect(
      updateServiceJourneyLifecycleState(supabase, {
        workspaceId: workspaceAuto,
        journeyId,
        toStatus: "contacted",
        actorType: "ai_assistant",
      })
    ).rejects.toThrow(/Invalid journey transition/i);

    // Legal transition: qualified -> booking_offered
    const step3 = await updateServiceJourneyLifecycleState(supabase, {
      workspaceId: workspaceAuto,
      journeyId,
      toStatus: "booking_offered",
      actorType: "ai_assistant",
    });
    expect(step3.status).toBe("booking_offered");

    // Transition to terminal state: human_takeover
    const stepHandoff = await updateServiceJourneyLifecycleState(supabase, {
      workspaceId: workspaceAuto,
      journeyId,
      toStatus: "human_takeover",
      actorType: "system",
      reason: "Customer requested human",
    });
    expect(stepHandoff.status).toBe("human_takeover");

    // Verify scheduled follow-up was automatically cancelled
    const fu = await db.query<any>("SELECT status, cancel_reason FROM public.service_followups WHERE journey_id = $1", [journeyId]);
    expect(fu.rows[0].status).toBe("cancelled");
    expect(fu.rows[0].cancel_reason).toBe("lifecycle_transition_to_human_takeover");

    // Disallowed: AI assistant cannot resume from human_takeover
    await expect(
      updateServiceJourneyLifecycleState(supabase, {
        workspaceId: workspaceAuto,
        journeyId,
        toStatus: "contacted",
        actorType: "ai_assistant",
      })
    ).rejects.toThrow(/Invalid journey transition/i);

    // Authorized: Operator resume path can transition back to contacted
    const resumed = await operatorResumeJourneyAi(supabase, {
      workspaceId: workspaceAuto,
      journeyId,
      threadId,
      operatorUserId: userOwner,
      notes: "Resolved customer inquiry, resuming AI reception",
    });
    expect(resumed.status).toBe("contacted");

    // Check audit events count
    const events = await db.query<any>("SELECT * FROM public.service_conversion_events WHERE journey_id = $1 ORDER BY created_at ASC", [journeyId]);
    expect(events.rows.length).toBeGreaterThanOrEqual(4);
  });

  // 10. Audit and Tenant Boundaries: RLS & Composite Ownership Enforcement
  it("10. Enforces strict RLS for viewers/suspended members and composite tenant ownership", async () => {
    // Ingest journey in Workspace Beauty
    const inb = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_rls_1', '+15551114444', 'RLS Test', 'text', 'Service needed', '{}'::jsonb, 'hrls1', $2::uuid, 'beauty_grooming'
      )`,
      [workspaceBeauty, integrationBeauty]
    );
    const { journey_id: journeyId } = inb.rows[0].record_canonical_whatsapp_inbound_atomic;

    // A. Viewer can SELECT but cannot UPDATE
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${userViewer}';
      SET request.jwt.claims = '{"sub": "${userViewer}", "role": "authenticated"}';
    `);

    const viewerSelect = await db.query("SELECT * FROM public.service_conversion_journeys WHERE id = $1", [journeyId]);
    expect(viewerSelect.rows.length).toBe(1);

    // Viewer update fails under RLS
    const viewerUpdate = await db.query("UPDATE public.service_conversion_journeys SET notes = 'tampered' WHERE id = $1 RETURNING id", [journeyId]);
    expect(viewerUpdate.rows.length).toBe(0);

    // B. Suspended member cannot SELECT
    await db.exec(`
      SET request.jwt.claim.sub = '${userSuspended}';
      SET request.jwt.claims = '{"sub": "${userSuspended}", "role": "authenticated"}';
    `);

    const suspendedSelect = await db.query("SELECT * FROM public.service_conversion_journeys WHERE id = $1", [journeyId]);
    expect(suspendedSelect.rows.length).toBe(0);

    // C. Append-only events: authenticated cannot UPDATE or DELETE
    await db.exec(`
      SET request.jwt.claim.sub = '${userOwner}';
      SET request.jwt.claims = '{"sub": "${userOwner}", "role": "authenticated"}';
    `);

    let deleteDenied = false;
    try {
      await db.query("DELETE FROM public.service_conversion_events WHERE workspace_id = $1 RETURNING id", [workspaceBeauty]);
    } catch (err: any) {
      deleteDenied = true;
      expect(err.message).toMatch(/permission denied/i);
    }
    expect(deleteDenied).toBe(true);

    // Reset role to postgres
    await db.exec("SET ROLE postgres; RESET request.jwt.claim.sub; RESET request.jwt.claims;");

    // D. Composite ownership: Workspace Beauty row cannot reference Workspace Auto contact
    const contactAuto = (await db.query<{ id: string }>(
      "INSERT INTO public.contacts (workspace_id, name, phone) VALUES ($1, 'Foreign Contact', '+15559990000') RETURNING id",
      [workspaceAuto]
    )).rows[0].id;

    let compositeFkRejected = false;
    try {
      await db.query(
        `INSERT INTO public.service_conversion_journeys (
          workspace_id, contact_id, playbook_key, status
        ) VALUES ($1, $2, 'beauty_grooming', 'new')`,
        [workspaceBeauty, contactAuto]
      );
    } catch (err: any) {
      compositeFkRejected = true;
      expect(err.message).toMatch(/foreign key/i);
    }
    expect(compositeFkRejected).toBe(true);
  });

  // 11. Honest Booking Truthfulness
  it("11. Newly requested booking remains requested and only verified provider callback sets confirmed revenue", async () => {
    // Step 1: Create booking through real createWorkspaceBooking
    const booking = await createWorkspaceBooking(supabase, {
      workspaceId: workspaceAuto,
      title: "Auto Detailing Session",
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      confirmationSource: "whatsapp_chat_text", // Caller-supplied text alone MUST NOT confirm
    });

    expect(booking.status).toBe("requested");
    expect(booking.external_reservation_status).toBe("pending_confirmation");

    // Ingest journey linked to thread
    const inb = await db.query<{ record_canonical_whatsapp_inbound_atomic: any }>(
      `SELECT public.record_canonical_whatsapp_inbound_atomic(
        $1::uuid, 'wamid_book_truth', '+15554443333', 'Booking Customer', 'text', 'I am ready to book', '{}'::jsonb, 'hbt', $2::uuid, 'auto_detailing'
      )`,
      [workspaceAuto, integrationAuto]
    );
    const { journey_id: journeyId, thread_id: threadId } = inb.rows[0].record_canonical_whatsapp_inbound_atomic;

    // Link booking to thread
    await db.query("UPDATE public.crm_bookings SET thread_id = $1 WHERE id = $2", [threadId, booking.id]);

    // Step 2: Atomic confirmation through trusted provider callback
    const confirmRes = await confirmWorkspaceBookingAtomic(supabase, {
      workspaceId: workspaceAuto,
      bookingId: booking.id,
      calendarProvider: "google_calendar",
      externalEventId: "gcal_event_987654",
      confirmedRevenue: 175.00,
    });

    expect(confirmRes.success).toBe(true);

    // Verify booking row updated to scheduled
    const confirmedBooking = await db.query<any>("SELECT * FROM public.crm_bookings WHERE id = $1", [booking.id]);
    expect(confirmedBooking.rows[0].status).toBe("scheduled");
    expect(confirmedBooking.rows[0].external_reservation_status).toBe("confirmed_external_calendar");
    expect(confirmedBooking.rows[0].external_calendar_provider).toBe("google_calendar");
    expect(confirmedBooking.rows[0].external_calendar_event_id).toBe("gcal_event_987654");

    // Verify journey atomically updated to booked with revenue attribution
    const confirmedJourney = await db.query<any>("SELECT * FROM public.service_conversion_journeys WHERE id = $1", [journeyId]);
    expect(confirmedJourney.rows[0].status).toBe("booked");
    expect(Number(confirmedJourney.rows[0].attributed_revenue)).toBe(175.00);
    expect(confirmedJourney.rows[0].booking_confirmation_source).toBe("google_calendar");

    // Verify audit event exists for transition to booked
    const auditEvents = await db.query<any>("SELECT * FROM public.service_conversion_events WHERE journey_id = $1 AND to_status = 'booked'", [journeyId]);
    expect(auditEvents.rows.length).toBe(1);
  });

  // 12. Correct Booking-Offer Detection
  it("12. offeredBookingLink is true ONLY when outbound reply contains the booking link", () => {
    const bookingLink = "https://salon.example.com/book";

    // Inbound customer mentions "book" -> offeredBookingLink must be FALSE
    const inboundIntent = extractServiceIntent({
      text: "I want to book an appointment please",
      playbook: beautyGroomingPlaybook,
      bookingLink,
      replyText: "Sure! What date and time were you hoping for?",
    });
    expect(inboundIntent.offeredBookingLink).toBe(false);

    // Outbound response contains the actual link -> offeredBookingLink is TRUE
    const outboundIntent = extractServiceIntent({
      text: "I want to book an appointment please",
      playbook: beautyGroomingPlaybook,
      bookingLink,
      replyText: `You can reserve your spot directly here: ${bookingLink}`,
    });
    expect(outboundIntent.offeredBookingLink).toBe(true);
  });

  // 13. AI Worker Suppression Verification
  it("13. Worker suppression verifies exact job ID, claim token, and suppressed status in database", async () => {
    const threadId = (await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15551239999') RETURNING id",
      [workspaceBeauty]
    )).rows[0].id;

    const claimToken = "99999999-8888-7777-6666-555555555555";
    const jobId = (await db.query<{ id: string }>(
      `INSERT INTO public.whatsapp_ai_jobs (
        workspace_id, thread_id, recipient_phone, inbound_text, inbound_wamid, idempotency_key, status, claim_token
      ) VALUES ($1, $2, '+15551239999', 'Speak to agent', 'wamid_claim_test', 'key_suppress', 'processing', $3::uuid) RETURNING id`,
      [workspaceBeauty, threadId, claimToken]
    )).rows[0].id;

    // Suppression with wrong claim token fails
    const wrongToken = "00000000-0000-0000-0000-000000000000";
    const failRes = await db.query<{ suppress_whatsapp_ai_job: any }>(
      "SELECT public.suppress_whatsapp_ai_job($1::uuid, $2::uuid, 'test_reason')",
      [jobId, wrongToken]
    );
    expect(failRes.rows[0].suppress_whatsapp_ai_job.success).toBe(false);

    // Suppression with matching claim token succeeds
    const okRes = await db.query<{ suppress_whatsapp_ai_job: any }>(
      "SELECT public.suppress_whatsapp_ai_job($1::uuid, $2::uuid, 'human_takeover_active')",
      [jobId, claimToken]
    );
    expect(okRes.rows[0].suppress_whatsapp_ai_job.success).toBe(true);
    expect(okRes.rows[0].suppress_whatsapp_ai_job.status).toBe("suppressed");

    const row = await db.query<any>("SELECT status, last_error, claim_token FROM public.whatsapp_ai_jobs WHERE id = $1", [jobId]);
    expect(row.rows[0].status).toBe("suppressed");
    expect(row.rows[0].last_error).toBe("human_takeover_active");
    expect(row.rows[0].claim_token).toBeNull();
  });

  // 14. Follow-Up Schema Completeness
  it("14. Durable follow-up record contains required fields and cancels on terminal state transition", async () => {
    const threadId = (await db.query<{ id: string }>(
      "INSERT INTO public.inbox_threads (workspace_id, channel, external_thread_id) VALUES ($1, 'whatsapp', '+15557776666') RETURNING id",
      [workspaceBeauty]
    )).rows[0].id;

    const jId = (await db.query<{ id: string }>(
      "INSERT INTO public.service_conversion_journeys (workspace_id, thread_id, status) VALUES ($1, $2, 'contacted') RETURNING id",
      [workspaceBeauty, threadId]
    )).rows[0].id;

    const fuId = (await db.query<{ id: string }>(
      `INSERT INTO public.service_followups (
        workspace_id, journey_id, thread_id, channel, followup_type, scheduled_for, status, consent_basis, template_name
      ) VALUES ($1, $2, $3, 'whatsapp', 'booking_reminder', now() + interval '2 hours', 'scheduled', 'implicit_inbound', 'booking_prompt_v1') RETURNING id`,
      [workspaceBeauty, jId, threadId]
    )).rows[0].id;

    // Execute atomic transition to lost
    await updateServiceJourneyLifecycleState(supabase, {
      workspaceId: workspaceBeauty,
      journeyId: jId,
      toStatus: "lost",
      actorType: "operator",
      reason: "Customer chose a competitor",
    });

    const fu = await db.query<any>("SELECT * FROM public.service_followups WHERE id = $1", [fuId]);
    expect(fu.rows[0].status).toBe("cancelled");
    expect(fu.rows[0].cancel_reason).toBe("lifecycle_transition_to_lost");
    expect(fu.rows[0].consent_basis).toBe("implicit_inbound");
    expect(fu.rows[0].template_name).toBe("booking_prompt_v1");
  });

  // 15. Metrics derived strictly from persisted data
  it("15. Conversion metrics calculate honest zero baselines and derive strictly from persisted rows", async () => {
    const emptyMetrics = await calculateServiceBusinessMetrics(supabase, workspaceBeauty);
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

    const autoMetrics = await calculateServiceBusinessMetrics(supabase, workspaceAuto);
    expect(autoMetrics.inquiriesReceived).toBe(2);
    expect(autoMetrics.qualified).toBe(2);
    expect(autoMetrics.booked).toBe(1);
    expect(autoMetrics.estimatedServiceValue).toBe(525);
    expect(autoMetrics.confirmedAttributedRevenue).toBe(175);
    expect(autoMetrics.inquiryToBookedRate).toBe(0.5);
  });
});
