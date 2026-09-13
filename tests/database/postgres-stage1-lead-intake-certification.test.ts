import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.J10_STAGE1_CERT_DATABASE_URL;

describe.runIf(databaseUrl)("Stage 1 lead intake certification (local Supabase PostgreSQL)", () => {
  let sql: Sql;
  let ownerId: string;
  let workspaceA: string;
  let workspaceB: string;

  const callIntake = async (connection: Sql, workspaceId: string, key: string, email = "lead@example.test", phone = "+14155550123", message = "Need help", sourceEvent: string | null = null) => {
    const result = await connection`select public.record_lead_intake(${workspaceId}::uuid, 'website_form', 'website', ${key}, 'Avery Lead', ${email}, ${phone}, ${message}, 'Certification', '{"utm_source":"cert"}'::jsonb, '[{"status":"not_provided","communication_channel":"website","purpose":"marketing","disclosure_version":"cert-v1","capture_source":"certification"}]'::jsonb, ${sourceEvent}, '{}'::jsonb) as result`;
    return result[0].result as { duplicate: boolean; resolution_status: string };
  };

  beforeAll(async () => {
    sql = postgres(databaseUrl!, { max: 1, ssl: false, onnotice: () => {} });
    ownerId = randomUUID(); workspaceA = randomUUID(); workspaceB = randomUUID();
    await sql`insert into auth.users (id, email, raw_user_meta_data) values (${ownerId}::uuid, ${`stage1-${ownerId}@example.test`}, '{}'::jsonb)`;
    await sql`insert into public.workspaces (id, name, slug, brand_name, owner_user_id) values (${workspaceA}::uuid, 'Stage 1 A', ${`stage1-a-${ownerId}`}, 'Stage 1 A', ${ownerId}::uuid), (${workspaceB}::uuid, 'Stage 1 B', ${`stage1-b-${ownerId}`}, 'Stage 1 B', ${ownerId}::uuid)`;
  });

  afterAll(async () => {
    if (sql) {
      await sql`delete from public.workspaces where id in (${workspaceA}::uuid, ${workspaceB}::uuid)`;
      await sql`delete from auth.users where id = ${ownerId}::uuid`;
      await sql.end();
    }
  });

  it("handles 25 simultaneous idempotent retries as exactly one canonical intake", async () => {
    const clients = Array.from({ length: 25 }, () => postgres(databaseUrl!, { max: 1, ssl: false, onnotice: () => {} }));
    const results = await Promise.all(clients.map((client) => callIntake(client, workspaceA, "same-key")));
    await Promise.all(clients.map((client) => client.end()));
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    const [row] = await sql`select count(*)::int as intakes, (select count(*)::int from public.contacts where workspace_id=${workspaceA}::uuid) as contacts, (select count(*)::int from public.lead_event_outbox where workspace_id=${workspaceA}::uuid) as outbox from public.lead_intakes where workspace_id=${workspaceA}::uuid`;
    expect(row).toMatchObject({ intakes: 1, contacts: 1, outbox: 1 });
  });

  it("serializes normalized identities, rejects conflicts, and preserves tenant boundaries", async () => {
    const clients = Array.from({ length: 25 }, () => postgres(databaseUrl!, { max: 1, ssl: false, onnotice: () => {} }));
    await Promise.all(clients.map((client, index) => callIntake(client, workspaceA, `email-${index}`, "  CASE@Example.Test  ", index % 2 ? "+1 (415) 555-0199" : "14155550199")));
    await Promise.all(clients.map((client) => client.end()));
    const [contacts] = await sql`select count(*)::int as count from public.contacts where workspace_id=${workspaceA}::uuid and lower(trim(email))='case@example.test'`;
    expect(contacts.count).toBe(1);
    await expect(callIntake(sql, workspaceA, "conflict-key", "conflict@example.test", "+14155550999", "first")).resolves.toBeTruthy();
    await expect(callIntake(sql, workspaceA, "conflict-key", "conflict@example.test", "+14155550999", "changed")).rejects.toThrow(/payload conflict/i);
    await expect(callIntake(sql, workspaceA, "source-a", "event@example.test", "+14155550888", "one", "event-1")).resolves.toBeTruthy();
    await expect(callIntake(sql, workspaceA, "source-b", "event@example.test", "+14155550888", "two", "event-1")).rejects.toThrow(/source event payload conflict/i);
    await expect(callIntake(sql, workspaceB, "same-key", "lead@example.test")).resolves.toBeTruthy();
    const [crossTenant] = await sql`select count(*)::int as count from public.lead_intakes where workspace_id=${workspaceB}::uuid and idempotency_key='same-key'`;
    expect(crossTenant.count).toBe(1);
  });

  it("does not silently merge ambiguous email/phone ownership", async () => {
    const contactA = (await sql`insert into public.contacts(workspace_id,name,email,source,deal_stage,type,status) values (${workspaceA}::uuid,'Email Owner','ambiguous@example.test','manual','lead','Lead','New') returning id`)[0].id;
    const contactB = (await sql`insert into public.contacts(workspace_id,name,phone,source,deal_stage,type,status) values (${workspaceA}::uuid,'Phone Owner','+14155550777','manual','lead','Lead','New') returning id`)[0].id;
    await sql`insert into public.contact_identities(workspace_id,contact_id,identity_type,normalized_value) values (${workspaceA}::uuid,${contactA}::uuid,'email','ambiguous@example.test'),(${workspaceA}::uuid,${contactB}::uuid,'phone','14155550777')`;
    const result = await callIntake(sql, workspaceA, "ambiguous-key", "ambiguous@example.test", "+14155550777");
    expect(result.resolution_status).toBe("ambiguous");
  });

  it("enforces real PostgreSQL RLS and a tenant-scoped outbox lifecycle", async () => {
    const intake = await callIntake(sql, workspaceA, "lifecycle-key", "lifecycle@example.test", "+14155550666");
    const [intakeRow] = await sql`select id from public.lead_intakes where workspace_id=${workspaceA}::uuid and idempotency_key='lifecycle-key'`;
    const wrongWorkspaceClaim = await sql`select public.claim_lead_event_outbox(${workspaceB}::uuid, ${intakeRow.id}::uuid, ${randomUUID()}::uuid) as result`;
    expect(wrongWorkspaceClaim[0].result.claimed).toBe(false);

    const firstClaim = randomUUID();
    const claimed = await sql`select public.claim_lead_event_outbox(${workspaceA}::uuid, ${intakeRow.id}::uuid, ${firstClaim}::uuid) as result`;
    expect(claimed[0].result.claimed).toBe(true);
    expect(await sql`select public.complete_lead_event_outbox(${workspaceA}::uuid, ${intakeRow.id}::uuid, ${firstClaim}::uuid, false, 'temporary failure') as completed`).toMatchObject([{ completed: true }]);
    const retryClaim = randomUUID();
    expect(await sql`select public.claim_lead_event_outbox(${workspaceA}::uuid, ${intakeRow.id}::uuid, ${retryClaim}::uuid) as result`).toMatchObject([{ result: { claimed: true } }]);
    expect(await sql`select public.complete_lead_event_outbox(${workspaceA}::uuid, ${intakeRow.id}::uuid, ${retryClaim}::uuid, true, null) as completed`).toMatchObject([{ completed: true }]);

    await sql.begin(async (transaction) => {
      await transaction`set local role authenticated`;
      await transaction`select set_config('request.jwt.claim.sub', ${ownerId}, true)`;
      const visible = await transaction`select count(*)::int as count from public.lead_intakes where workspace_id=${workspaceA}::uuid`;
      const hidden = await transaction`select count(*)::int as count from public.lead_intakes where workspace_id=${workspaceB}::uuid`;
      expect(visible[0].count).toBeGreaterThan(0);
      expect(hidden[0].count).toBe(0);
    });
    void intake;
  });

  it("accepts a public website route submission through the local Supabase API", async () => {
    await sql`insert into public.website_funnels(workspace_id, user_id, slug, is_published) values (${workspaceA}::uuid, ${ownerId}::uuid, ${`certification-${ownerId}`}, true)`;
    const { POST } = await import("../../app/api/website/lead/route");
    const response = await POST(new Request("http://stage1.local/api/website/lead", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.42" },
      body: JSON.stringify({
        sourceFunnel: `certification-${ownerId}`,
        name: "Route Lead",
        email: "route@example.test",
        message: "Please contact me",
        idempotencyKey: "route-certification-key",
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(await sql`select count(*)::int as count from public.lead_intakes where workspace_id=${workspaceA}::uuid and idempotency_key='route-certification-key'`).toMatchObject([{ count: 1 }]);
  });
});
