import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Tier 0G: PostgreSQL Database Certification (PGlite)", () => {
  async function setupDatabase() {
    const db = new PGlite();

    // 1. Setup Auth & Extensions
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
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
    `);

    // 2. Setup Workspaces & Roles
    await db.exec(`
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
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'manager', 'agent', 'viewer')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'removed')),
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

      CREATE OR REPLACE FUNCTION public.has_workspace_role(
        p_workspace_id UUID,
        p_roles TEXT[]
      )
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      STABLE
      SECURITY DEFINER
      AS $$
      DECLARE
        v_user_id UUID;
      BEGIN
        v_user_id := auth.uid();
        IF v_user_id IS NULL THEN
          RETURN false;
        END IF;

        RETURN EXISTS (
          SELECT 1 FROM public.workspace_memberships
          WHERE workspace_id = p_workspace_id
            AND user_id = v_user_id
            AND status = 'active'
            AND role = ANY(p_roles)
        );
      END;
      $$;

      CREATE OR REPLACE FUNCTION public.is_platform_admin()
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      STABLE
      SECURITY DEFINER
      AS $$
      DECLARE
        v_user_id UUID;
      BEGIN
        v_user_id := auth.uid();
        IF v_user_id IS NULL THEN
          RETURN false;
        END IF;

        RETURN EXISTS (
          SELECT 1 FROM public.platform_roles
          WHERE user_id = v_user_id
            AND role IN ('platform_founder', 'platform_admin')
            AND revoked_at IS NULL
        );
      END;
      $$;

      -- Base workspace_subscriptions from Tier 0F
      CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL DEFAULT 'starter' CHECK (plan_id IN ('starter', 'growth', 'enterprise')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'none')),
        provenance TEXT NOT NULL DEFAULT 'stripe' CHECK (provenance IN ('stripe', 'trial', 'internal_grant', 'none')),
        monthly_message_limit INTEGER NOT NULL DEFAULT 1000 CHECK (monthly_message_limit >= 0),
        messages_used_this_period INTEGER NOT NULL DEFAULT 0 CHECK (messages_used_this_period >= 0),
        current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
        current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
        grace_period_end TIMESTAMPTZ,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    return db;
  }

  it("1. Applies 20260918_tier0g_saas_billing.sql cleanly to PostgreSQL", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260918_tier0g_saas_billing.sql"
    );
    const sql = readFileSync(migrationPath, "utf-8");

    await expect(db.exec(sql)).resolves.not.toThrow();

    // Verify columns exist on workspace_subscriptions
    const cols = await db.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workspace_subscriptions'
        AND column_name IN ('trial_start', 'trial_end', 'has_used_trial', 'dunning_status', 'dunning_attempt_count', 'last_dunning_at')
    `);
    expect(cols.rows).toHaveLength(6);
  });

  it("2. Validates migration idempotency: running twice causes no errors", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260918_tier0g_saas_billing.sql"
    );
    const sql = readFileSync(migrationPath, "utf-8");

    await db.exec(sql);
    await expect(db.exec(sql)).resolves.not.toThrow();
  });

  it("3. Validates trial activation via activate_workspace_trial RPC", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260918_tier0g_saas_billing.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    // Create user and workspace
    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('owner@tenant.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Tenant A', 'tenant-a', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
      [wsId, userId]
    );

    // Set JWT claims as the workspace owner
    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    // Activate trial
    const trialRes = await db.query<{ activate_workspace_trial: any }>(
      "SELECT public.activate_workspace_trial($1, 'growth', 14)",
      [wsId]
    );

    const trialData = trialRes.rows[0].activate_workspace_trial;
    expect(trialData.success).toBe(true);
    expect(trialData.status).toBe("trialing");
    expect(trialData.provenance).toBe("trial");
    expect(trialData.monthly_message_limit).toBe(1000);

    // Verify in database
    const subRecord = await db.query<{ status: string; has_used_trial: boolean }>(
      "SELECT status, has_used_trial FROM public.workspace_subscriptions WHERE workspace_id = $1",
      [wsId]
    );
    expect(subRecord.rows[0].status).toBe("trialing");
    expect(subRecord.rows[0].has_used_trial).toBe(true);

    // Second trial activation must be rejected (single-use trial protection)
    const secondTrialRes = await db.query<{ activate_workspace_trial: any }>(
      "SELECT public.activate_workspace_trial($1, 'growth', 14)",
      [wsId]
    );
    expect(secondTrialRes.rows[0].activate_workspace_trial.success).toBe(false);
    expect(secondTrialRes.rows[0].activate_workspace_trial.error).toContain("already utilized");
  });

  it("4. Tests atomic verified usage recording and idempotency via record_verified_workspace_usage", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260918_tier0g_saas_billing.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('agent@tenant.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Tenant B', 'tenant-b', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'agent')",
      [wsId, userId]
    );

    await db.query(`
      INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, provenance, monthly_message_limit, messages_used_this_period
      ) VALUES ($1, 'starter', 'active', 'stripe', 100, 0)
    `, [wsId]);

    // Set JWT claims
    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    // 1. Record 10 messages with an idempotency key
    const usageRes1 = await db.query<{ record_verified_workspace_usage: any }>(
      "SELECT public.record_verified_workspace_usage($1, 'whatsapp_outbound', 10, 'idem-key-001', 'msg-1', $2)",
      [wsId, userId]
    );
    const res1 = usageRes1.rows[0].record_verified_workspace_usage;
    expect(res1.success).toBe(true);
    expect(res1.messages_used_this_period).toBe(10);
    expect(res1.remaining).toBe(90);

    // Verify row was written to workspace_usage_records
    const auditRows = await db.query<{ id: string; quantity: number }>(
      "SELECT id, quantity FROM public.workspace_usage_records WHERE workspace_id = $1",
      [wsId]
    );
    expect(auditRows.rows).toHaveLength(1);
    expect(auditRows.rows[0].quantity).toBe(10);

    // 2. Idempotency test: Re-send identical call with same idempotency key
    const usageRes2 = await db.query<{ record_verified_workspace_usage: any }>(
      "SELECT public.record_verified_workspace_usage($1, 'whatsapp_outbound', 10, 'idem-key-001', 'msg-1', $2)",
      [wsId, userId]
    );
    const res2 = usageRes2.rows[0].record_verified_workspace_usage;
    expect(res2.success).toBe(true);
    expect(res2.idempotent).toBe(true);
    expect(res2.messages_used_this_period).toBe(10); // NOT incremented to 20!

    // Audit rows count remains 1
    const auditRowsAfter = await db.query<{ count: string }>(
      "SELECT count(*) FROM public.workspace_usage_records WHERE workspace_id = $1",
      [wsId]
    );
    expect(Number(auditRowsAfter.rows[0].count)).toBe(1);

    // 3. New call with new idempotency key for 30 messages
    const usageRes3 = await db.query<{ record_verified_workspace_usage: any }>(
      "SELECT public.record_verified_workspace_usage($1, 'whatsapp_outbound', 30, 'idem-key-002', 'msg-2', $2)",
      [wsId, userId]
    );
    expect(usageRes3.rows[0].record_verified_workspace_usage.messages_used_this_period).toBe(40);
    expect(usageRes3.rows[0].record_verified_workspace_usage.remaining).toBe(60);

    // 4. Quota exhaustion test: Attempting 70 messages when only 60 remain must fail closed
    const usageResExceeded = await db.query<{ record_verified_workspace_usage: any }>(
      "SELECT public.record_verified_workspace_usage($1, 'whatsapp_outbound', 70, 'idem-key-003', 'msg-3', $2)",
      [wsId, userId]
    );
    const resExceeded = usageResExceeded.rows[0].record_verified_workspace_usage;
    expect(resExceeded.success).toBe(false);
    expect(resExceeded.limit_reached).toBe(true);
    expect(resExceeded.error).toContain("quota exceeded");

    // Subscription counter remains at 40
    const finalSub = await db.query<{ messages_used_this_period: number }>(
      "SELECT messages_used_this_period FROM public.workspace_subscriptions WHERE workspace_id = $1",
      [wsId]
    );
    expect(finalSub.rows[0].messages_used_this_period).toBe(40);
  });

  it("5. Verifies multi-tenant RLS isolation on workspace_usage_records", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260918_tier0g_saas_billing.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    // User A in Workspace A
    const userARes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('userA@company.com') RETURNING id"
    );
    const userA = userARes.rows[0].id;

    const wsARes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Workspace A', 'ws-a', $1) RETURNING id",
      [userA]
    );
    const wsA = wsARes.rows[0].id;

    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')",
      [wsA, userA]
    );

    // User B in Workspace B
    const userBRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('userB@company.com') RETURNING id"
    );
    const userB = userBRes.rows[0].id;

    const wsBRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Workspace B', 'ws-b', $1) RETURNING id",
      [userB]
    );
    const wsB = wsBRes.rows[0].id;

    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')",
      [wsB, userB]
    );

    // Insert usage records into both workspaces via service role
    await db.query(`
      INSERT INTO public.workspace_usage_records (
        workspace_id, metric_name, quantity, idempotency_key, billing_period_start, billing_period_end
      ) VALUES
        ($1, 'whatsapp_outbound', 15, 'rec-a-1', now(), now() + interval '30 days'),
        ($2, 'whatsapp_outbound', 25, 'rec-b-1', now(), now() + interval '30 days')
    `, [wsA, wsB]);

    // Test as User A
    const userAVisible = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userA}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userA}","role":"authenticated"}';
      `);
      return await tx.query<{ workspace_id: string }>(
        "SELECT workspace_id FROM public.workspace_usage_records"
      );
    });
    // User A can only see Workspace A records
    expect(userAVisible.rows).toHaveLength(1);
    expect(userAVisible.rows[0].workspace_id).toBe(wsA);

    // Test as User B
    const userBVisible = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userB}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userB}","role":"authenticated"}';
      `);
      return await tx.query<{ workspace_id: string }>(
        "SELECT workspace_id FROM public.workspace_usage_records"
      );
    });
    // User B can only see Workspace B records
    expect(userBVisible.rows).toHaveLength(1);
    expect(userBVisible.rows[0].workspace_id).toBe(wsB);
  });
});
