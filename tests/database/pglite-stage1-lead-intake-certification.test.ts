import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260925_stage1_lead_intake_foundation.sql"), "utf8");

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
  await db.exec(migration);
  return db;
}

async function workspace(db: PGlite) {
  const user = await db.query<{ id: string }>("insert into auth.users default values returning id");
  const result = await db.query<{ id: string }>("insert into public.workspaces(owner_user_id) values($1) returning id", [user.rows[0].id]);
  return result.rows[0].id;
}

async function intake(db: PGlite, workspaceId: string, key: string, email = "lead@example.com", message = "Hello") {
  return db.query<{ record_lead_intake: Record<string, unknown> }>(`select public.record_lead_intake($1, 'website_form', 'website', $2, 'Avery Lead', $3, null, $4, 'Fall', '{"utm_source":"test"}', '[{"status":"not_provided","communication_channel":"website","purpose":"marketing","disclosure_version":"v1","capture_source":"test"}]', null, '{}')`, [workspaceId, key, email, message]);
}

describe("Stage 1 lead intake migration (isolated PGlite)", () => {
  it("executes transactionally and rolls back on a deliberate failure", async () => {
    const db = new PGlite();
    await db.exec("begin; create table public.rollback_probe(id int); select 1 / 0;").catch(() => undefined);
    await db.exec("rollback;");
    const exists = await db.query<{ count: number }>("select count(*)::int as count from information_schema.tables where table_schema='public' and table_name='rollback_probe'");
    expect(exists.rows[0].count).toBe(0);
    await db.close();
  });

  it("creates one canonical intake, contact, thread, message, consent, and outbox record", async () => {
    const db = await setup(); const ws = await workspace(db);
    const result = await intake(db, ws, "key-1");
    expect(result.rows[0].record_lead_intake.duplicate).toBe(false);
    for (const table of ["contacts", "contact_identities", "lead_intakes", "inbox_threads", "inbox_messages", "lead_intake_consents", "lead_event_outbox"]) {
      const count = await db.query<{ count: number }>(`select count(*)::int as count from public.${table}`);
      expect(count.rows[0].count).toBe(1);
    }
    await db.close();
  });

  it("scopes idempotency by workspace and rejects mismatched payloads", async () => {
    const db = await setup(); const wsA = await workspace(db); const wsB = await workspace(db);
    await intake(db, wsA, "same-key");
    await intake(db, wsB, "same-key");
    const duplicate = await intake(db, wsA, "same-key");
    expect(duplicate.rows[0].record_lead_intake.duplicate).toBe(true);
    await expect(intake(db, wsA, "same-key", "lead@example.com", "Changed payload")).rejects.toThrow(/payload conflict/i);
    const counts = await db.query<{ workspace_id: string; count: number }>("select workspace_id, count(*)::int as count from public.lead_intakes group by workspace_id order by workspace_id");
    expect(counts.rows.map((row) => row.count)).toEqual([1, 1]);
    await db.close();
  });

  it("admits 25 concurrent retries as one canonical intake and one outbox event", async () => {
    const db = await setup(); const ws = await workspace(db);
    const results = await Promise.all(Array.from({ length: 25 }, () => intake(db, ws, "concurrent-key")));
    expect(results.filter((result) => result.rows[0].record_lead_intake.duplicate === false)).toHaveLength(1);
    for (const table of ["contacts", "lead_intakes", "lead_event_outbox"]) {
      const count = await db.query<{ count: number }>(`select count(*)::int as count from public.${table} where workspace_id=$1`, [ws]);
      expect(count.rows[0].count).toBe(1);
    }
    await db.close();
  });

  it("does not merge ambiguous shared identities and keeps later intakes", async () => {
    const db = await setup(); const ws = await workspace(db);
    await db.query("insert into public.contacts(workspace_id, name, email) values($1, 'One', 'shared@example.com'), ($1, 'Two', 'other@example.com')", [ws]);
    const contacts = await db.query<{ id: string }>("select id from public.contacts where workspace_id=$1 order by name", [ws]);
    await db.query("insert into public.contact_identities(workspace_id, contact_id, identity_type, normalized_value) values($1,$2,'phone','4155550123')", [ws, contacts.rows[1].id]);
    const ambiguous = await db.query<{ record_lead_intake: Record<string, unknown> }>(`select public.record_lead_intake($1,'website_form','website','ambiguous','Avery','shared@example.com','+4155550123','Hello',null,'{}','[]',null,'{}')`, [ws]);
    expect(ambiguous.rows[0].record_lead_intake.resolution_status).toBe("ambiguous");
    await intake(db, ws, "later-intake", "unique@example.com");
    const count = await db.query<{ count: number }>("select count(*)::int as count from public.lead_intakes where workspace_id=$1", [ws]);
    expect(count.rows[0].count).toBe(2);
    await db.close();
  });

  it("claims an event once, recovers failures, and has least-privilege tables", async () => {
    const db = await setup(); const ws = await workspace(db); await intake(db, ws, "claim-key");
    const intakeId = (await db.query<{ id: string }>("select id from public.lead_intakes where workspace_id=$1", [ws])).rows[0].id;
    const claimA = await db.query<{ claim_lead_event_outbox: Record<string, unknown> }>("select public.claim_lead_event_outbox($1,$2,gen_random_uuid())", [ws, intakeId]);
    expect(claimA.rows[0].claim_lead_event_outbox.claimed).toBe(true);
    const claimB = await db.query<{ claim_lead_event_outbox: Record<string, unknown> }>("select public.claim_lead_event_outbox($1,$2,gen_random_uuid())", [ws, intakeId]);
    expect(claimB.rows[0].claim_lead_event_outbox.claimed).toBe(false);
    const grants = await db.query<{ grantee: string; privilege_type: string }>("select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='lead_event_outbox' and grantee in ('PUBLIC','anon','authenticated','service_role')");
    expect(grants.rows.filter((row) => row.grantee === "PUBLIC" || row.grantee === "anon" || row.grantee === "authenticated")).toEqual([]);
    expect(new Set(grants.rows.filter((row) => row.grantee === "service_role").map((row) => row.privilege_type))).toEqual(new Set(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]));
    await db.close();
  });
});
