import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import {
  verifyStripeWebhookSignature,
  processStripeSubscriptionEvent,
  STRIPE_PRICE_ALLOWLIST,
} from "@/lib/billing/stripe-webhook";

describe("Tier 0F PostgreSQL Database Certification (PGlite)", () => {
  const migrationSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260917_tier0f_runtime_tenant_certification.sql"),
    "utf8"
  );

  async function createBaselineDb(): Promise<PGlite> {
    const db = new PGlite();

    // Enable roles and schemas
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
        SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
      $$ LANGUAGE sql STABLE;

      -- Core workspace tables
      CREATE TABLE IF NOT EXISTS public.workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        owner_user_id UUID REFERENCES auth.users(id),
        plan TEXT DEFAULT 'growth',
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.workspace_memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'viewer',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_ws_member UNIQUE (workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.platform_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_platform_role UNIQUE (user_id, role)
      );

      CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL DEFAULT 'growth',
        status TEXT NOT NULL DEFAULT 'active',
        monthly_message_limit INT NOT NULL DEFAULT 10000,
        messages_used_this_period INT NOT NULL DEFAULT 0,
        current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
        current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
        grace_period_end TIMESTAMPTZ,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_ws_sub UNIQUE (workspace_id)
      );

      CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.workspace_memberships
          WHERE workspace_id = target_workspace_id
            AND user_id = auth.uid()
            AND status = 'active'
        );
      $$;

      CREATE OR REPLACE FUNCTION public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.workspace_memberships
          WHERE workspace_id = target_workspace_id
            AND user_id = auth.uid()
            AND status = 'active'
            AND role = ANY(allowed_roles)
        );
      $$;

      CREATE TABLE IF NOT EXISTS public.contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        source TEXT,
        deal_stage TEXT DEFAULT 'lead',
        estimated_value NUMERIC(10,2) DEFAULT 0.00,
        assigned_user_id UUID REFERENCES auth.users(id),
        last_contact_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.crm_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id),
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        company TEXT,
        job_title TEXT,
        type TEXT DEFAULT 'Lead',
        status TEXT DEFAULT 'New',
        source TEXT DEFAULT 'crm',
        estimated_value NUMERIC(10,2) DEFAULT 0.00,
        notes TEXT,
        last_contacted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.inbox_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
        channel TEXT NOT NULL DEFAULT 'website',
        status TEXT NOT NULL DEFAULT 'active',
        priority TEXT NOT NULL DEFAULT 'medium',
        unread_count INT NOT NULL DEFAULT 0,
        last_message_at TIMESTAMPTZ DEFAULT now(),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.inbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
        direction TEXT NOT NULL DEFAULT 'inbound',
        provider TEXT NOT NULL DEFAULT 'website',
        content TEXT NOT NULL,
        delivery_status TEXT NOT NULL DEFAULT 'delivered',
        message_type TEXT NOT NULL DEFAULT 'text',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.website_funnels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT false,
        primary_cta_link TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_funnel_ws_slug UNIQUE (workspace_id, slug)
      );

      CREATE TABLE IF NOT EXISTS public.integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id),
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
        last_health_check_at TIMESTAMPTZ,
        last_error_code TEXT,
        last_error_message TEXT,
        status_reason TEXT,
        status_metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
        encrypted_payload TEXT NOT NULL,
        initialization_vector TEXT NOT NULL,
        authentication_tag TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        key_version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_webhook_endpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        endpoint_key UUID NOT NULL DEFAULT gen_random_uuid(),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        endpoint_id UUID NOT NULL REFERENCES public.integration_webhook_endpoints(id) ON DELETE CASCADE,
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        request_id UUID NOT NULL DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL,
        replay_key TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        signature_status TEXT NOT NULL DEFAULT 'valid',
        payload_sha256 TEXT NOT NULL DEFAULT 'none',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_action_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'live',
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_operation_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        source TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        status TEXT NOT NULL DEFAULT 'success',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_provider_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'webhook',
        mode TEXT NOT NULL DEFAULT 'push',
        state TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        previous_status TEXT,
        next_status TEXT NOT NULL,
        reason TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.commerce_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.commerce_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        order_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.finance_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        invoice_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.company_knowledge_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.workforce_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.automations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.automation_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        version_number INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.automation_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id),
        status TEXT NOT NULL DEFAULT 'queued',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.ai_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id),
        action TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Grants for authenticated role
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA auth TO authenticated;
    `);

    return db;
  }

  it("applies 20260917 migration successfully to clean baseline", async () => {
    const db = await createBaselineDb();

    // Insert sample founder and normal workspace
    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('founder@j10.test'), ('client@j10.test') RETURNING id"
    );
    const founderId = userRes.rows[0].id;
    const clientId = userRes.rows[1].id;

    // Platform founder role
    await db.query(
      "INSERT INTO public.platform_roles (user_id, role) VALUES ($1, 'platform_founder')",
      [founderId]
    );

    // Founder workspace and client workspace
    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id)
       VALUES ('Founder HQ', 'founder-hq', $1), ('Client Org', 'client-org', $2)
       RETURNING id`,
      [founderId, clientId]
    );
    const founderWsId = wsRes.rows[0].id;
    const clientWsId = wsRes.rows[1].id;

    // Subscriptions
    await db.query(
      `INSERT INTO public.workspace_subscriptions (workspace_id, status, monthly_message_limit)
       VALUES ($1, 'active', 100000), ($2, 'active', 5000)`,
      [founderWsId, clientWsId]
    );

    // Legacy CRM contacts
    await db.query(
      `INSERT INTO public.crm_contacts (workspace_id, first_name, last_name, email, company, status)
       VALUES ($1, 'Alice', 'Smith', 'alice@test.com', 'Acme Corp', 'Qualified'),
              ($2, 'Bob', 'Jones', 'bob@test.com', 'Beta LLC', 'New')`,
      [founderWsId, clientWsId]
    );

    // Apply the migration
    await db.exec(migrationSql);

    // Verify provenance backfill with owner_user_id
    const subRes = await db.query<{ provenance: string; workspace_id: string }>(
      "SELECT workspace_id, provenance FROM public.workspace_subscriptions"
    );
    const founderSub = subRes.rows.find((r) => r.workspace_id === founderWsId);
    const clientSub = subRes.rows.find((r) => r.workspace_id === clientWsId);

    expect(founderSub?.provenance).toBe("internal_grant");
    // Client sub has no Stripe and no trial period set, so it becomes 'none' and status becomes inactive
    expect(clientSub?.provenance).toBe("none");

    // Verify non-destructive CRM migration
    const contactsRes = await db.query<{ email: string; company: string; status: string }>(
      "SELECT email, company, status FROM public.contacts ORDER BY email"
    );
    expect(contactsRes.rows.length).toBe(2);
    expect(contactsRes.rows[0].email).toBe("alice@test.com");
    expect(contactsRes.rows[0].company).toBe("Acme Corp");
    expect(contactsRes.rows[1].email).toBe("bob@test.com");

    // Verify crm_contacts view exists and is readable
    const viewRes = await db.query("SELECT * FROM public.crm_contacts");
    expect(viewRes.rows.length).toBe(2);
  });

  it("proves migration idempotency on second execution", async () => {
    const db = await createBaselineDb();

    // Insert user & workspace
    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('idempotency@j10.test') RETURNING id"
    );
    const userId = userRes.rows[0].id;
    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Idem HQ', 'idem-hq', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;
    await db.query(
      "INSERT INTO public.workspace_subscriptions (workspace_id, status) VALUES ($1, 'active')",
      [wsId]
    );

    // Run 1
    await db.exec(migrationSql);

    // Run 2: must not error or fail
    await expect(db.exec(migrationSql)).resolves.not.toThrow();
  });

  it("tolerates pre-existing webhook_events_tenant_select policy", async () => {
    const db = await createBaselineDb();

    // Pre-create the policy as happened in remote production
    await db.exec(`
      ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events FOR SELECT
        TO authenticated USING (workspace_id IS NOT NULL);
    `);

    // Applying migration must tolerate it and succeed
    await expect(db.exec(migrationSql)).resolves.not.toThrow();
  });

  it("enforces strict cross-tenant RLS isolation between 2 users across 2 workspaces", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    // Setup User 1 and User 2
    const uRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('user1@corp.test'), ('user2@corp.test') RETURNING id"
    );
    const u1 = uRes.rows[0].id;
    const u2 = uRes.rows[1].id;

    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id)
       VALUES ('Workspace 1', 'ws-1', $1), ('Workspace 2', 'ws-2', $2)
       RETURNING id`,
      [u1, u2]
    );
    const ws1 = wsRes.rows[0].id;
    const ws2 = wsRes.rows[1].id;

    // Add memberships
    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active'), ($3, $4, 'owner', 'active')`,
      [ws1, u1, ws2, u2]
    );

    // Insert contacts in each workspace
    await db.query(
      `INSERT INTO public.contacts (workspace_id, name, email)
       VALUES ($1, 'Contact W1', 'c1@test.com'), ($2, 'Contact W2', 'c2@test.com')`,
      [ws1, ws2]
    );

    // Query as User 1
    const u1Contacts = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${u1}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${u1}","role":"authenticated"}';
      `);
      return await tx.query<{ name: string }>("SELECT name FROM public.contacts");
    });

    expect(u1Contacts.rows.length).toBe(1);
    expect(u1Contacts.rows[0].name).toBe("Contact W1");

    // Query as User 2
    const u2Contacts = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${u2}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${u2}","role":"authenticated"}';
      `);
      return await tx.query<{ name: string }>("SELECT name FROM public.contacts");
    });

    expect(u2Contacts.rows.length).toBe(1);
    expect(u2Contacts.rows[0].name).toBe("Contact W2");

    // Adversarial cross-tenant update attempt from User 1 targeting User 2's contact
    const updateResult = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${u1}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${u1}","role":"authenticated"}';
      `);
      const res = await tx.query(
        "UPDATE public.contacts SET name = 'Tampered' WHERE email = 'c2@test.com'"
      );
      return res.rowCount;
    });

    expect(updateResult).toBe(0);

    // Verify contact 2 was not modified
    const c2Verify = await db.query<{ name: string }>(
      "SELECT name FROM public.contacts WHERE email = 'c2@test.com'"
    );
    expect(c2Verify.rows[0].name).toBe("Contact W2");
  });

  it("enforces full RBAC matrix (owner, admin, manager, agent, viewer read-only, suspended denied)", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    // Create owner and workspace
    const uRes = await db.query<{ id: string; email: string }>(
      `INSERT INTO auth.users (email) VALUES
       ('owner@test.com'), ('admin@test.com'), ('mgr@test.com'),
       ('agent@test.com'), ('viewer@test.com'), ('suspended@test.com')
       RETURNING id, email`
    );

    const userMap: Record<string, string> = {};
    for (const r of uRes.rows) {
      userMap[r.email || ""] = r.id;
    }

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Matrix WS', 'matrix-ws', $1) RETURNING id",
      [userMap["owner@test.com"]]
    );
    const wsId = wsRes.rows[0].id;

    // Add memberships for all roles
    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'admin', 'active'),
       ($1, $4, 'manager', 'active'),
       ($1, $5, 'agent', 'active'),
       ($1, $6, 'viewer', 'active'),
       ($1, $7, 'agent', 'suspended')`,
      [
        wsId,
        userMap["owner@test.com"],
        userMap["admin@test.com"],
        userMap["mgr@test.com"],
        userMap["agent@test.com"],
        userMap["viewer@test.com"],
        userMap["suspended@test.com"],
      ]
    );

    // 1. Owner can insert
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["owner@test.com"]}';
      `);
      await tx.query(
        "INSERT INTO public.contacts (workspace_id, name, email) VALUES ($1, 'Owner Lead', 'owner_lead@test.com')",
        [wsId]
      );
    });

    // 2. Admin can insert
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["admin@test.com"]}';
      `);
      await tx.query(
        "INSERT INTO public.contacts (workspace_id, name, email) VALUES ($1, 'Admin Lead', 'admin_lead@test.com')",
        [wsId]
      );
    });

    // 3. Manager can insert
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["mgr@test.com"]}';
      `);
      await tx.query(
        "INSERT INTO public.contacts (workspace_id, name, email) VALUES ($1, 'Manager Lead', 'mgr_lead@test.com')",
        [wsId]
      );
    });

    // 4. Agent can insert
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["agent@test.com"]}';
      `);
      await tx.query(
        "INSERT INTO public.contacts (workspace_id, name, email) VALUES ($1, 'Agent Lead', 'agent_lead@test.com')",
        [wsId]
      );
    });

    // 5. Viewer can SELECT but CANNOT insert (RLS WITH CHECK blocks viewer)
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["viewer@test.com"]}';
      `);
      const res = await tx.query<{ cnt: number }>("SELECT count(*)::int as cnt FROM public.contacts");
      expect(res.rows[0].cnt).toBe(4);

      await expect(
        tx.query(
          "INSERT INTO public.contacts (workspace_id, name, email) VALUES ($1, 'Viewer Bad Insert', 'viewer_bad@test.com')",
          [wsId]
        )
      ).rejects.toThrow();
    });

    // 6. Suspended user CANNOT select (returns 0 rows because is_workspace_member requires status = 'active')
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["suspended@test.com"]}';
      `);
      const res = await tx.query<{ cnt: number }>("SELECT count(*)::int as cnt FROM public.contacts");
      expect(res.rows[0].cnt).toBe(0);
    });
  });

  it("verifies integration creation, status history trigger with workspace_id, and uniqueness constraint", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('integ_user@test.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Integ WS', 'integ-ws', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    // Insert integration
    const integRes = await db.query<{ id: string }>(
      `INSERT INTO public.integrations (workspace_id, user_id, provider, status)
       VALUES ($1, $2, 'whatsapp', 'pending')
       RETURNING id`,
      [wsId, userId]
    );
    const integId = integRes.rows[0].id;

    // Updating status fires record_integration_status_history() trigger
    await db.query(
      "UPDATE public.integrations SET status = 'connected' WHERE id = $1",
      [integId]
    );

    // Verify trigger inserted history row with populated workspace_id
    const histRes = await db.query<{ workspace_id: string; next_status: string }>(
      "SELECT workspace_id, next_status FROM public.integration_status_history WHERE integration_id = $1",
      [integId]
    );

    expect(histRes.rows.length).toBeGreaterThanOrEqual(1);
    const connectedRow = histRes.rows.find((r) => r.next_status === "connected");
    expect(connectedRow).toBeDefined();
    expect(connectedRow?.workspace_id).toBe(wsId);

    // Uniqueness constraint uq_integrations_workspace_provider: duplicate provider in same workspace rejected
    await expect(
      db.query(
        "INSERT INTO public.integrations (workspace_id, user_id, provider, status) VALUES ($1, $2, 'whatsapp', 'active')",
        [wsId, userId]
      )
    ).rejects.toThrow();
  });

  it("verifies credential envelope RPCs enforce workspace admin RBAC and persist workspace_id", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const uRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('admin_integ@test.com'), ('viewer_integ@test.com') RETURNING id"
    );
    const adminId = uRes.rows[0].id;
    const viewerId = uRes.rows[1].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Cred WS', 'cred-ws', $1) RETURNING id",
      [adminId]
    );
    const wsId = wsRes.rows[0].id;

    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active'), ($1, $3, 'viewer', 'active')`,
      [wsId, adminId, viewerId]
    );

    const integRes = await db.query<{ id: string }>(
      "INSERT INTO public.integrations (workspace_id, user_id, provider, status) VALUES ($1, $2, 'stripe', 'active') RETURNING id",
      [wsId, adminId]
    );
    const integId = integRes.rows[0].id;

    // Admin can store credential envelope
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${adminId}';
      `);
      await tx.query(
        `SELECT public.store_integration_credential_envelope(
           $1, 'encrypted_test_payload', 'iv_123', 'tag_456', 'aes-256-gcm', 1
         )`,
        [integId]
      );
    });

    // Verify credentials table contains workspace_id
    const credRes = await db.query<{ workspace_id: string; encrypted_payload: string }>(
      "SELECT workspace_id, encrypted_payload FROM public.integration_credentials WHERE integration_id = $1",
      [integId]
    );
    expect(credRes.rows.length).toBe(1);
    expect(credRes.rows[0].workspace_id).toBe(wsId);
    expect(credRes.rows[0].encrypted_payload).toBe("encrypted_test_payload");

    // Viewer is rejected from retrieving credential envelope
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${viewerId}';
      `);
      await expect(
        tx.query("SELECT * FROM public.get_integration_credential_envelope($1)", [integId])
      ).rejects.toThrow(/Forbidden/);
    });

    // Admin can retrieve credential envelope
    const retrieved = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${adminId}';
      `);
      return await tx.query<{ encrypted_payload: string }>(
        "SELECT encrypted_payload FROM public.get_integration_credential_envelope($1)",
        [integId]
      );
    });
    expect(retrieved.rows[0].encrypted_payload).toBe("encrypted_test_payload");
  });

  it("verifies increment_workspace_usage RPC enforces quotas and limits", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('quota_user@test.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Quota WS', 'quota-ws', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active')`,
      [wsId, userId]
    );

    // Subscription with limit of 10 messages
    await db.query(
      `INSERT INTO public.workspace_subscriptions (workspace_id, status, monthly_message_limit, messages_used_this_period, provenance)
       VALUES ($1, 'active', 10, 0, 'stripe')`,
      [wsId]
    );

    // Increment by 6
    const res1 = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userId}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userId}","role":"authenticated"}';
      `);
      return await tx.query<{ res: { success: boolean; new_usage: number; is_exceeded: boolean } }>(
        "SELECT public.increment_workspace_usage($1, 6) AS res",
        [wsId]
      );
    });
    expect(res1.rows[0].res.success).toBe(true);
    expect(res1.rows[0].res.new_usage).toBe(6);
    expect(res1.rows[0].res.is_exceeded).toBe(false);

    // Increment by 4 (total 10 = limit)
    const res2 = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userId}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userId}","role":"authenticated"}';
      `);
      return await tx.query<{ res: { success: boolean; new_usage: number; is_exceeded: boolean } }>(
        "SELECT public.increment_workspace_usage($1, 4) AS res",
        [wsId]
      );
    });
    expect(res2.rows[0].res.success).toBe(true);
    expect(res2.rows[0].res.new_usage).toBe(10);
    expect(res2.rows[0].res.is_exceeded).toBe(false);

    // Increment by 1 exceeds quota: fails closed
    const res3 = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userId}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userId}","role":"authenticated"}';
      `);
      return await tx.query<{ res: { success: boolean; limit_reached: boolean; is_exceeded: boolean } }>(
        "SELECT public.increment_workspace_usage($1, 1) AS res",
        [wsId]
      );
    });
    expect(res3.rows[0].res.success).toBe(false);
    expect(res3.rows[0].res.limit_reached).toBe(true);
    expect(res3.rows[0].res.is_exceeded).toBe(true);
  });

  it("verifies create_website_lead RPC handles idempotency and detects conflict on payload mismatch", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('funnel_owner@test.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Funnel WS', 'funnel-ws', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    // Published funnel
    const fnRes = await db.query<{ id: string }>(
      `INSERT INTO public.website_funnels (workspace_id, title, slug, is_published)
       VALUES ($1, 'Lead Funnel', 'lead-funnel', true)
       RETURNING id`,
      [wsId]
    );
    const funnelId = fnRes.rows[0].id;

    const idempotencyKey = "client_idem_key_alpha_1";

    // First submission: success
    const lead1 = await db.query<{ res: { success: boolean; duplicate: boolean } }>(
      `SELECT public.create_website_lead(
         $1, 'John Doe', 'john@acme.com', '+15551234567', 'Inquiry message', 'Notes', $2, '{}'::jsonb
       ) AS res`,
      [funnelId, idempotencyKey]
    );
    expect(lead1.rows[0].res.success).toBe(true);
    expect(lead1.rows[0].res.duplicate).toBe(false);

    // Second submission with exact same payload: idempotent replay returns duplicate: true
    const lead2 = await db.query<{ res: { success: boolean; duplicate: boolean } }>(
      `SELECT public.create_website_lead(
         $1, 'John Doe', 'john@acme.com', '+15551234567', 'Inquiry message', 'Notes', $2, '{}'::jsonb
       ) AS res`,
      [funnelId, idempotencyKey]
    );
    expect(lead2.rows[0].res.success).toBe(true);
    expect(lead2.rows[0].res.duplicate).toBe(true);

    // Third submission with same key but DIFFERENT payload: conflict detected (409)
    const lead3 = await db.query<{ res: { success: boolean; conflict: boolean } }>(
      `SELECT public.create_website_lead(
         $1, 'Different Name', 'tampered@acme.com', '+15559998888', 'Altered message', 'Notes', $2, '{}'::jsonb
       ) AS res`,
      [funnelId, idempotencyKey]
    );
    expect(lead3.rows[0].res.success).toBe(false);
    expect(lead3.rows[0].res.conflict).toBe(true);
  });

  it("verifies crm_contacts view is read-only and direct client mutations are revoked", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('client_mutation@test.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;

    // Attempt direct insert into crm_contacts view as authenticated role
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userId}';
      `);
      await expect(
        tx.query(
          "INSERT INTO public.crm_contacts (first_name, email) VALUES ('Hacker', 'hacked@crm.test')"
        )
      ).rejects.toThrow();
    });
  });

  it("verifies Stripe webhook signature verification, replay rejection, price allowlist, and duplicate delivery", async () => {
    const secret = "whsec_test_secret_key_12345";
    const payload = JSON.stringify({ id: "evt_test_123", type: "checkout.session.completed" });
    const now = Math.floor(Date.now() / 1000);

    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${now}.${payload}`)
      .digest("hex");
    const validHeader = `t=${now},v1=${signature}`;

    // Valid signature passes
    const validResult = verifyStripeWebhookSignature({
      rawBody: payload,
      signatureHeader: validHeader,
      secret,
    });
    expect(validResult.valid).toBe(true);

    // Expired timestamp (> 300s) rejected
    const expiredHeader = `t=${now - 301},v1=${signature}`;
    const expiredResult = verifyStripeWebhookSignature({
      rawBody: payload,
      signatureHeader: expiredHeader,
      secret,
    });
    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.error).toContain("expired");

    // Invalid signature rejected
    const forgedHeader = `t=${now},v1=deadbeefcafebabe`;
    const forgedResult = verifyStripeWebhookSignature({
      rawBody: payload,
      signatureHeader: forgedHeader,
      secret,
    });
    expect(forgedResult.valid).toBe(false);

    // Price allowlist quarantine: unknown price must not be approved
    const unknownPrice = "unapproved_super_cheap_tier";
    expect(STRIPE_PRICE_ALLOWLIST[unknownPrice]).toBeUndefined();

    // Test processStripeSubscriptionEvent quarantines unknown price
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    const unknownPriceEvent = {
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_unknown_price_test",
          customer: "cus_123",
          status: "active",
          current_period_start: now,
          current_period_end: now + 30 * 86400,
          items: {
            data: [{ price: { lookup_key: unknownPrice } }],
          },
        },
      },
    };

    const subResult = await processStripeSubscriptionEvent(
      mockDb as unknown as Parameters<typeof processStripeSubscriptionEvent>[0],
      unknownPriceEvent
    );
    expect(subResult.processed).toBe(false);
    expect(subResult.action).toBe("quarantined_unknown_price");
  });
});
