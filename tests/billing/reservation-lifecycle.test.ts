import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Accounting & Reservation Lifecycle Certification (PGlite)", () => {
  async function setupDatabase() {
    const db = new PGlite();

    // 1. Setup Auth & Extensions
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
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
    `);

    // 2. Setup Workspaces & Memberships
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

      CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID)
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      STABLE
      SECURITY DEFINER
      AS $$
      BEGIN
        RETURN p_user_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.platform_roles
          WHERE user_id = p_user_id
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

      CREATE TABLE IF NOT EXISTS public.contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_contacts_workspace_id UNIQUE (workspace_id, id)
      );
    `);

    // 3. Execute Preceding Migrations in Order
    const m18 = readFileSync(resolve(__dirname, "../../supabase/migrations/20260918_tier0g_saas_billing.sql"), "utf-8");
    await db.exec(m18);

    const m22 = readFileSync(resolve(__dirname, "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"), "utf-8");
    await db.exec(m22);

    // 4. Execute Forward Migration
    const m24 = readFileSync(resolve(__dirname, "../../supabase/migrations/20260924_align_channel_metrics_and_atomic_reservations.sql"), "utf-8");
    await db.exec(m24);

    return db;
  }

  async function createTestWorkspace(db: PGlite, name: string, slug: string, role: string = "owner") {
    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ($1) RETURNING id",
      [`${slug}@example.com`]
    );
    const userId = userRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ($1, $2, $3) RETURNING id",
      [name, slug, userId]
    );
    const wsId = wsRes.rows[0].id;

    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, $3, 'active')",
      [wsId, userId, role]
    );

    await db.query(`
      INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, provenance, monthly_message_limit, messages_used_this_period, current_period_start, current_period_end
      ) VALUES (
        $1, 'growth', 'active', 'stripe', 1000, 50, now() - INTERVAL '5 days', now() + INTERVAL '25 days'
      )
    `, [wsId]);

    return { userId, wsId };
  }

  it("verifies the full reservation lifecycle: reserve, settle, and release", async () => {
    const db = await setupDatabase();
    const { userId, wsId } = await createTestWorkspace(db, "Lifecycle Corp", "lifecycle-corp");

    // Authenticate as owner
    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    // 1. Reserve 10 messages for an omnichannel WhatsApp dispatch
    const reserveRes = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'whatsapp_outbound', 10, 'res-lifecycle-1')",
      [wsId]
    );
    const resData = reserveRes.rows[0].reserve_workspace_quota_atomic;
    expect(resData.success).toBe(true);
    expect(resData.quantity_reserved).toBe(10);
    expect(resData.messages_used_this_period).toBe(60); // 50 + 10

    // Verify reservation recorded in workspace_quota_reservations with billing period
    const resRow = await db.query<{ status: string; quantity: number; billing_period_start: string }>(
      "SELECT status, quantity, billing_period_start FROM public.workspace_quota_reservations WHERE reservation_id = 'res-lifecycle-1'"
    );
    expect(resRow.rows[0].status).toBe("reserved");
    expect(resRow.rows[0].quantity).toBe(10);
    expect(resRow.rows[0].billing_period_start).toBeTruthy();

    // 2. Settle the reservation with actual usage of 7 messages (refund difference of 3)
    const settleRes = await db.query<{ settle_workspace_quota_atomic: any }>(
      "SELECT public.settle_workspace_quota_atomic($1, 'res-lifecycle-1', 7)",
      [wsId]
    );
    const settleData = settleRes.rows[0].settle_workspace_quota_atomic;
    expect(settleData.success).toBe(true);
    expect(settleData.settled_quantity).toBe(7);
    expect(settleData.messages_used_this_period).toBe(57); // 60 - (10 - 7) = 57

    // 3. Test reservation release on a new reservation
    const reserveRes2 = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'sms_outbound', 8, 'res-lifecycle-2')",
      [wsId]
    );
    expect(reserveRes2.rows[0].reserve_workspace_quota_atomic.messages_used_this_period).toBe(65); // 57 + 8

    const releaseRes = await db.query<{ release_workspace_quota_atomic: any }>(
      "SELECT public.release_workspace_quota_atomic($1, 'res-lifecycle-2', 'provider_outage')",
      [wsId]
    );
    const releaseData = releaseRes.rows[0].release_workspace_quota_atomic;
    expect(releaseData.success).toBe(true);
    expect(releaseData.messages_used_this_period).toBe(57); // 65 - 8 = 57 refunded
  });

  it("verifies duplicate release idempotency prevents duplicate refunds", async () => {
    const db = await setupDatabase();
    const { userId, wsId } = await createTestWorkspace(db, "Idempotent Corp", "idempotent-corp");

    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    // Reserve 5
    await db.query(
      "SELECT public.reserve_workspace_quota_atomic($1, 'email_outbound', 5, 'res-dup-1')",
      [wsId]
    );

    // First release
    const firstRelease = await db.query<{ release_workspace_quota_atomic: any }>(
      "SELECT public.release_workspace_quota_atomic($1, 'res-dup-1', 'cancelled')",
      [wsId]
    );
    expect(firstRelease.rows[0].release_workspace_quota_atomic.success).toBe(true);
    expect(firstRelease.rows[0].release_workspace_quota_atomic.messages_used_this_period).toBe(50);

    // Second release with identical reservation: must be idempotent and NOT decrement again
    const secondRelease = await db.query<{ release_workspace_quota_atomic: any }>(
      "SELECT public.release_workspace_quota_atomic($1, 'res-dup-1', 'cancelled')",
      [wsId]
    );
    expect(secondRelease.rows[0].release_workspace_quota_atomic.success).toBe(true);
    expect(secondRelease.rows[0].release_workspace_quota_atomic.idempotent).toBe(true);
    expect(secondRelease.rows[0].release_workspace_quota_atomic.messages_used_this_period).toBe(50);
  });

  it("verifies missing reservation returns error", async () => {
    const db = await setupDatabase();
    const { userId, wsId } = await createTestWorkspace(db, "Missing Corp", "missing-corp");

    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    const missingRes = await db.query<{ release_workspace_quota_atomic: any }>(
      "SELECT public.release_workspace_quota_atomic($1, 'res-nonexistent')",
      [wsId]
    );
    expect(missingRes.rows[0].release_workspace_quota_atomic.success).toBe(false);
    expect(missingRes.rows[0].release_workspace_quota_atomic.error).toBe("Reservation not found");
  });

  it("verifies cross-workspace access is strictly rejected", async () => {
    const db = await setupDatabase();
    const tenantA = await createTestWorkspace(db, "Tenant A", "tenant-a");
    const tenantB = await createTestWorkspace(db, "Tenant B", "tenant-b");

    // Tenant A creates reservation
    await db.exec(`
      SET request.jwt.claim.sub = '${tenantA.userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${tenantA.userId}"}';
    `);
    await db.query(
      "SELECT public.reserve_workspace_quota_atomic($1, 'whatsapp_outbound', 5, 'res-tenant-a')",
      [tenantA.wsId]
    );

    // Tenant B attempts to release Tenant A's reservation
    await db.exec(`
      SET request.jwt.claim.sub = '${tenantB.userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${tenantB.userId}"}';
    `);
    const crossRes = await db.query<{ release_workspace_quota_atomic: any }>(
      "SELECT public.release_workspace_quota_atomic($1, 'res-tenant-a')",
      [tenantB.wsId]
    );
    expect(crossRes.rows[0].release_workspace_quota_atomic.success).toBe(false);
    expect(crossRes.rows[0].release_workspace_quota_atomic.error).toBe("Reservation not found");

    const crossSettle = await db.query<{ settle_workspace_quota_atomic: any }>(
      "SELECT public.settle_workspace_quota_atomic($1, 'res-tenant-a', 5)",
      [tenantB.wsId]
    );
    expect(crossSettle.rows[0].settle_workspace_quota_atomic.success).toBe(false);
    expect(crossSettle.rows[0].settle_workspace_quota_atomic.error).toBe("Reservation not found");
  });

  it("verifies unauthorized callers without workspace authority are rejected", async () => {
    const db = await setupDatabase();
    const { wsId } = await createTestWorkspace(db, "Secure Corp", "secure-corp");

    // Create a viewer user in the same workspace
    const viewerRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('viewer@secure.com') RETURNING id"
    );
    const viewerId = viewerRes.rows[0].id;
    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'viewer', 'active')",
      [wsId, viewerId]
    );

    // Authenticate as viewer
    await db.exec(`
      SET request.jwt.claim.sub = '${viewerId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${viewerId}"}';
    `);

    const viewerReserve = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'whatsapp_outbound', 1, 'res-viewer')",
      [wsId]
    );
    expect(viewerReserve.rows[0].reserve_workspace_quota_atomic.success).toBe(false);
    expect(viewerReserve.rows[0].reserve_workspace_quota_atomic.error).toContain("Unauthorized");

    const viewerSpend = await db.query<{ record_agent_execution_spend_atomic: any }>(
      "SELECT public.record_agent_execution_spend_atomic($1, 'agent-1', 1.0)",
      [wsId]
    );
    expect(viewerSpend.rows[0].record_agent_execution_spend_atomic.success).toBe(false);
    expect(viewerSpend.rows[0].record_agent_execution_spend_atomic.error).toContain("Unauthorized");
  });

  it("verifies expired subscriptions fail closed", async () => {
    const db = await setupDatabase();
    const { userId, wsId } = await createTestWorkspace(db, "Expired Corp", "expired-corp");

    // Set billing period expired
    await db.query(
      "UPDATE public.workspace_subscriptions SET current_period_end = now() - INTERVAL '1 day', grace_period_end = NULL WHERE workspace_id = $1",
      [wsId]
    );

    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    const expiredRes = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'whatsapp_outbound', 1, 'res-expired')",
      [wsId]
    );
    expect(expiredRes.rows[0].reserve_workspace_quota_atomic.success).toBe(false);
    expect(expiredRes.rows[0].reserve_workspace_quota_atomic.error).toBe("Subscription billing period expired");
  });

  it("verifies provenance none fails closed", async () => {
    const db = await setupDatabase();
    const { userId, wsId } = await createTestWorkspace(db, "Unverified Corp", "unverified-corp");

    // Set provenance to 'none'
    await db.query(
      "UPDATE public.workspace_subscriptions SET provenance = 'none' WHERE workspace_id = $1",
      [wsId]
    );

    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    const provRes = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'whatsapp_outbound', 1, 'res-prov-none')",
      [wsId]
    );
    expect(provRes.rows[0].reserve_workspace_quota_atomic.success).toBe(false);
    expect(provRes.rows[0].reserve_workspace_quota_atomic.error).toBe("Subscription lacks verified billing provenance");
  });

  it("verifies exhausted agent budgets enforce hard_stop and require_approval atomically", async () => {
    const db = await setupDatabase();
    const { userId, wsId } = await createTestWorkspace(db, "Budget Corp", "budget-corp");

    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    // Setup agent budget with $10 daily limit and hard_stop policy
    await db.query(`
      INSERT INTO public.ai_agent_budgets (
        workspace_id, agent_id, daily_budget_usd, monthly_budget_usd, max_cost_per_execution_usd,
        current_daily_spend_usd, current_monthly_spend_usd, over_budget_policy, last_reset_date
      ) VALUES (
        $1, 'agent-budgeted', 10.0, 100.0, 5.0, 8.0, 8.0, 'hard_stop', CURRENT_DATE
      )
    `, [wsId]);

    // Attempt to spend $3.0 (8.0 + 3.0 = 11.0 > 10.0) -> denied by hard_stop
    const spendRes = await db.query<{ record_agent_execution_spend_atomic: any }>(
      "SELECT public.record_agent_execution_spend_atomic($1, 'agent-budgeted', 3.0)",
      [wsId]
    );
    const spendData = spendRes.rows[0].record_agent_execution_spend_atomic;
    expect(spendData.success).toBe(false);
    expect(spendData.can_execute).toBe(false);
    expect(spendData.action_required).toBe("hard_stop");

    // Change policy to require_approval
    await db.query(
      "UPDATE public.ai_agent_budgets SET over_budget_policy = 'require_approval' WHERE workspace_id = $1 AND agent_id = 'agent-budgeted'",
      [wsId]
    );

    const spendRes2 = await db.query<{ record_agent_execution_spend_atomic: any }>(
      "SELECT public.record_agent_execution_spend_atomic($1, 'agent-budgeted', 3.0)",
      [wsId]
    );
    const spendData2 = spendRes2.rows[0].record_agent_execution_spend_atomic;
    expect(spendData2.success).toBe(false);
    expect(spendData2.can_execute).toBe(false);
    expect(spendData2.action_required).toBe("require_approval");
  });

  it("verifies negative spend adjustments require a valid reservation ID", async () => {
    const db = await setupDatabase();
    const { userId, wsId } = await createTestWorkspace(db, "Negative Spend Corp", "neg-spend-corp");

    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    await db.query(`
      INSERT INTO public.ai_agent_budgets (
        workspace_id, agent_id, daily_budget_usd, monthly_budget_usd, max_cost_per_execution_usd,
        current_daily_spend_usd, current_monthly_spend_usd, over_budget_policy, last_reset_date
      ) VALUES (
        $1, 'agent-neg', 20.0, 200.0, 5.0, 10.0, 10.0, 'hard_stop', CURRENT_DATE
      )
    `, [wsId]);

    // Arbitrary negative adjustment without reservation ID -> denied
    const negDenied = await db.query<{ record_agent_execution_spend_atomic: any }>(
      "SELECT public.record_agent_execution_spend_atomic($1, 'agent-neg', -5.0)",
      [wsId]
    );
    expect(negDenied.rows[0].record_agent_execution_spend_atomic.success).toBe(false);
    expect(negDenied.rows[0].record_agent_execution_spend_atomic.error).toContain(
      "Negative spend adjustments must be tied to a valid reservation ID"
    );

    await db.query(
      "SELECT public.reserve_workspace_quota_atomic($1, 'ai_agent_run', 1, 'exec-valid-res')",
      [wsId]
    );

    // Negative adjustment with a reservation in this workspace -> accepted and spend reduced
    const negAllowed = await db.query<{ record_agent_execution_spend_atomic: any }>(
      "SELECT public.record_agent_execution_spend_atomic($1, 'agent-neg', -3.0, 'exec-valid-res')",
      [wsId]
    );
    expect(negAllowed.rows[0].record_agent_execution_spend_atomic.success).toBe(true);
    expect(Number(negAllowed.rows[0].record_agent_execution_spend_atomic.daily_spend_usd)).toBe(7);
  });

  it("verifies idempotency conflict rejects reservation ID reuse with differing payload", async () => {
    const db = await setupDatabase();
    const { userId, wsId } = await createTestWorkspace(db, "Conflict Corp", "conflict-corp");

    await db.exec(`
      SET request.jwt.claim.sub = '${userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${userId}"}';
    `);

    // First reservation for quantity 5
    await db.query(
      "SELECT public.reserve_workspace_quota_atomic($1, 'whatsapp_outbound', 5, 'res-conflict-test')",
      [wsId]
    );

    // Attempt second reservation with same ID but quantity 10 -> rejected
    const conflictRes = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'whatsapp_outbound', 10, 'res-conflict-test')",
      [wsId]
    );
    expect(conflictRes.rows[0].reserve_workspace_quota_atomic.success).toBe(false);
    expect(conflictRes.rows[0].reserve_workspace_quota_atomic.error).toBe(
      "Idempotency conflict: reservation ID already used with different payload"
    );
  });

  it("scopes identical reservation IDs to their workspace without leaking results", async () => {
    const db = await setupDatabase();
    const tenantA = await createTestWorkspace(db, "Reservation A", "reservation-a");
    const tenantB = await createTestWorkspace(db, "Reservation B", "reservation-b");

    await db.exec(`
      SET request.jwt.claim.sub = '${tenantA.userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${tenantA.userId}"}';
    `);
    const first = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'sms_outbound', 3, 'shared-reservation')",
      [tenantA.wsId]
    );
    expect(first.rows[0].reserve_workspace_quota_atomic.success).toBe(true);

    const duplicate = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'sms_outbound', 3, 'shared-reservation')",
      [tenantA.wsId]
    );
    expect(duplicate.rows[0].reserve_workspace_quota_atomic.idempotent).toBe(true);

    await db.exec(`
      SET request.jwt.claim.sub = '${tenantB.userId}';
      SET request.jwt.claims = '{"role": "authenticated", "sub": "${tenantB.userId}"}';
    `);
    const independent = await db.query<{ reserve_workspace_quota_atomic: any }>(
      "SELECT public.reserve_workspace_quota_atomic($1, 'sms_outbound', 3, 'shared-reservation')",
      [tenantB.wsId]
    );
    expect(independent.rows[0].reserve_workspace_quota_atomic.success).toBe(true);
    expect(independent.rows[0].reserve_workspace_quota_atomic.idempotent).not.toBe(true);

    const rows = await db.query<{ workspace_id: string }>(
      "SELECT workspace_id FROM public.workspace_quota_reservations WHERE reservation_id = 'shared-reservation' ORDER BY workspace_id"
    );
    expect(rows.rows.map((row) => row.workspace_id).sort()).toEqual([tenantA.wsId, tenantB.wsId].sort());
  });

  it("enforces least-privilege ledger and exact atomic RPC grants", async () => {
    const db = await setupDatabase();
    const publicPrivileges = await db.query<{ table_public: boolean; function_public: boolean }>(`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_class c, LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
          WHERE c.oid = 'public.workspace_quota_reservations'::regclass
            AND acl.grantee = 0
            AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
        ) AS table_public,
        EXISTS (
          SELECT 1
          FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
          WHERE p.oid IN (
            'public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb)'::regprocedure,
            'public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb)'::regprocedure,
            'public.settle_workspace_quota_atomic(uuid, text, integer, jsonb)'::regprocedure,
            'public.release_workspace_quota_atomic(uuid, text, text)'::regprocedure,
            'public.record_agent_execution_spend_atomic(uuid, text, numeric, text)'::regprocedure
          )
            AND acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
        ) AS function_public
    `);
    const privileges = await db.query<{ role_name: string; function_name: string; can_execute: boolean }>(`
      SELECT role_name, function_name,
        has_function_privilege(role_name, function_signature, 'EXECUTE') AS can_execute
      FROM (VALUES
        ('record_verified_workspace_usage', 'public.record_verified_workspace_usage(uuid, text, integer, text, text, uuid, jsonb)'),
        ('reserve_workspace_quota_atomic', 'public.reserve_workspace_quota_atomic(uuid, text, integer, text, text, uuid, jsonb)'),
        ('settle_workspace_quota_atomic', 'public.settle_workspace_quota_atomic(uuid, text, integer, jsonb)'),
        ('release_workspace_quota_atomic', 'public.release_workspace_quota_atomic(uuid, text, text)'),
        ('record_agent_execution_spend_atomic', 'public.record_agent_execution_spend_atomic(uuid, text, numeric, text)')
      ) AS functions(function_name, function_signature)
      CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
      ORDER BY function_name, role_name
    `);
    const tablePrivileges = await db.query<{ role_name: string; can_select: boolean; can_modify: boolean }>(`
      SELECT role_name,
        has_table_privilege(role_name, 'public.workspace_quota_reservations', 'SELECT') AS can_select,
        has_table_privilege(role_name, 'public.workspace_quota_reservations', 'INSERT, UPDATE, DELETE') AS can_modify
      FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
      ORDER BY role_name
    `);
    const tableByRole = Object.fromEntries(tablePrivileges.rows.map((row) => [row.role_name, row]));
    expect(publicPrivileges.rows[0].table_public).toBe(false);
    expect(publicPrivileges.rows[0].function_public).toBe(false);
    expect(tableByRole.anon.can_select).toBe(false);
    expect(tableByRole.authenticated.can_select).toBe(true);
    expect(tableByRole.authenticated.can_modify).toBe(false);
    expect(tableByRole.service_role.can_select).toBe(true);
    expect(tableByRole.service_role.can_modify).toBe(true);
    for (const row of privileges.rows) {
      expect(row.can_execute).toBe(row.role_name !== "anon");
    }
  });

  it("keeps the final migration transaction-wrapped and bound to the production admin signature", () => {
    const migration = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20260924_align_channel_metrics_and_atomic_reservations.sql"),
      "utf-8"
    );
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(migration).not.toContain("is_platform_admin()");
    expect(migration).toContain("is_platform_admin(auth.uid())");
    expect(migration).not.toContain("idx_quota_reservations_res_id");
  });
});
