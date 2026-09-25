import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { createClient } from "@supabase/supabase-js";
import {
  assertWorkspaceEntitlement,
  getTrialRuntimeStatus,
  getWorkspaceSubscription,
} from "../../lib/billing/entitlements";

const databaseUrl = process.env.J10_TRIAL_CERT_DATABASE_URL;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.runIf(databaseUrl && apiUrl && serviceRoleKey)("72-hour trial contract (disposable local Supabase)", () => {
  let sql: Sql;
  let expiredOwner: string;
  let paidOwner: string;
  let isolatedOwner: string;
  let expiredWorkspace: string;
  let paidWorkspace: string;
  let isolatedWorkspace: string;
  let expiredAutomation: string;
  let expiredThread: string;
  let originalFetch: typeof fetch;
  let externalRequestCount = 0;

  const service = createClient(apiUrl!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    const localOrigin = new URL(apiUrl!).origin;
    globalThis.fetch = async (input, init) => {
      const target = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!target.startsWith(localOrigin)) {
        externalRequestCount += 1;
        throw new Error(`External network access is forbidden in trial certification: ${new URL(target).origin}`);
      }
      return originalFetch(input, init);
    };

    sql = postgres(databaseUrl!, { max: 1, ssl: false, onnotice: () => {} });
    expiredOwner = randomUUID(); paidOwner = randomUUID(); isolatedOwner = randomUUID();
    expiredWorkspace = randomUUID(); paidWorkspace = randomUUID(); isolatedWorkspace = randomUUID();
    await sql`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      (${expiredOwner}::uuid, ${`trial-${expiredOwner}@example.test`}, now(), '{}'::jsonb),
      (${paidOwner}::uuid, ${`paid-${paidOwner}@example.test`}, now(), '{}'::jsonb),
      (${isolatedOwner}::uuid, ${`isolated-${isolatedOwner}@example.test`}, now(), '{}'::jsonb)`;
    await sql`insert into public.workspaces (id, name, slug, brand_name, owner_user_id) values
      (${expiredWorkspace}::uuid, 'Expired trial certification', ${`expired-${expiredWorkspace}`}, 'Expired trial certification', ${expiredOwner}::uuid),
      (${paidWorkspace}::uuid, 'Paid certification', ${`paid-${paidWorkspace}`}, 'Paid certification', ${paidOwner}::uuid),
      (${isolatedWorkspace}::uuid, 'Isolated certification', ${`isolated-${isolatedWorkspace}`}, 'Isolated certification', ${isolatedOwner}::uuid)`;
    await sql`insert into public.workspace_memberships (workspace_id, user_id, role, status) values
      (${expiredWorkspace}::uuid, ${expiredOwner}::uuid, 'owner', 'active'),
      (${paidWorkspace}::uuid, ${paidOwner}::uuid, 'owner', 'active'),
      (${isolatedWorkspace}::uuid, ${isolatedOwner}::uuid, 'owner', 'active')`;

    // Fixtures that must predate expiry: they allow the following attempted
    // writes to exercise the real BEFORE INSERT database trigger.
    const contact = (await sql`insert into public.contacts (workspace_id, name, source, deal_stage, type, status) values (${expiredWorkspace}::uuid, 'Existing certification contact', 'certification', 'lead', 'Lead', 'New') returning id`)[0].id;
    expiredThread = (await sql`insert into public.inbox_threads (workspace_id, contact_id, channel) values (${expiredWorkspace}::uuid, ${contact}::uuid, 'whatsapp') returning id`)[0].id;
    expiredAutomation = (await sql`insert into public.automations (workspace_id, user_id, name, trigger_type) values (${expiredWorkspace}::uuid, ${expiredOwner}::uuid, 'Expired certification automation', 'manual') returning id`)[0].id;

    await sql`insert into public.workspace_subscriptions (workspace_id, plan_id, status, provenance, monthly_message_limit, messages_used_this_period, current_period_start, current_period_end, trial_start, trial_end, trial_started_at, trial_ends_at, trial_status, has_used_trial, dunning_status, dunning_attempt_count)
      values (${expiredWorkspace}::uuid, 'growth', 'trialing', 'trial', 250, 0, now() - interval '73 hours', now() + interval '30 days', now() - interval '73 hours', now() - interval '1 hour', now() - interval '73 hours', now() - interval '1 hour', 'active', true, 'none', 0),
      (${paidWorkspace}::uuid, 'growth', 'active', 'stripe', 1000, 0, now() - interval '1 day', now() + interval '29 days', null, null, null, null, 'converted', false, 'none', 0),
      (${isolatedWorkspace}::uuid, 'growth', 'active', 'stripe', 1000, 0, now() - interval '1 day', now() + interval '29 days', null, null, null, null, 'converted', false, 'none', 0)`;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (sql) {
      await sql.end();
    }
  });

  it("uses the real Supabase API entitlement path: an expired server timestamp fails while a paid workspace remains entitled", async () => {
    await expect(assertWorkspaceEntitlement(service, expiredWorkspace)).rejects.toMatchObject({
      code: "BILLING_REQUIRED",
      reason: "TRIAL_EXPIRED",
    });
    await expect(assertWorkspaceEntitlement(service, paidWorkspace)).resolves.toMatchObject({ workspaceId: paidWorkspace, provenance: "stripe" });
    const expired = await getWorkspaceSubscription(service, expiredWorkspace);
    expect(expired).not.toBeNull();
    expect(getTrialRuntimeStatus(expired!)).toBe("expired");
  });

  it("rejects expired AI, automation, outbound, usage, and lead writes at PostgreSQL before any provider could run", async () => {
    await expect(sql`insert into public.ai_tasks (workspace_id, user_id, title) values (${expiredWorkspace}::uuid, ${expiredOwner}::uuid, 'Blocked AI job')`).rejects.toThrow(/TRIAL_EXPIRED/);
    await expect(sql`insert into public.automation_runs (workspace_id, automation_id, user_id, trigger_type) values (${expiredWorkspace}::uuid, ${expiredAutomation}::uuid, ${expiredOwner}::uuid, 'manual')`).rejects.toThrow(/TRIAL_EXPIRED/);
    await expect(sql`insert into public.inbox_messages (workspace_id, thread_id, direction, provider, content) values (${expiredWorkspace}::uuid, ${expiredThread}::uuid, 'outbound', 'certification', 'blocked outbound')`).rejects.toThrow(/TRIAL_EXPIRED/);
    await expect(sql`insert into public.workspace_usage_records (workspace_id, metric_name, quantity, idempotency_key, billing_period_start, billing_period_end, metadata) values (${expiredWorkspace}::uuid, 'whatsapp_outbound', 1, 'expired-certification', now() - interval '1 hour', now() + interval '1 hour', '{"browser_supplied_timestamp":"2099-01-01T00:00:00Z"}'::jsonb)`).rejects.toThrow(/TRIAL_EXPIRED/);
    await expect(sql`insert into public.contacts (workspace_id, name, source, deal_stage, type, status) values (${expiredWorkspace}::uuid, 'Blocked lead', 'certification', 'lead', 'Lead', 'New')`).rejects.toThrow(/TRIAL_EXPIRED/);
  });

  it("enforces tenant isolation with actual RLS reads and mutations", async () => {
    const rls = postgres(databaseUrl!, { max: 1, ssl: false, onnotice: () => {} });
    try {
      await rls`set role authenticated`;
      await rls`select set_config('request.jwt.claim.sub', ${paidOwner}, false)`;
      const ownRows = await rls`select count(*)::int as count from public.workspace_subscriptions where workspace_id = ${paidWorkspace}::uuid`;
      const foreignRows = await rls`select count(*)::int as count from public.workspace_subscriptions where workspace_id = ${isolatedWorkspace}::uuid`;
      expect(ownRows[0].count).toBe(1);
      expect(foreignRows[0].count).toBe(0);
      await expect(rls`insert into public.contacts (workspace_id, name, source, deal_stage, type, status) values (${isolatedWorkspace}::uuid, 'Cross-tenant write', 'certification', 'lead', 'Lead', 'New')`).rejects.toThrow();
    } finally {
      await rls.end();
    }
  });

  it("makes no external provider request in this isolated certification", () => {
    expect(externalRequestCount).toBe(0);
  });
});
