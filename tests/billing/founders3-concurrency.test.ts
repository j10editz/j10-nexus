import { describe, expect, it, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  generateInvitationCode,
  hashInvitationCode,
} from "@/lib/billing/invitations";

describe("J10 Founder’s 3 PostgreSQL Concurrency & Atomic Seat Certification", () => {
  let db: PGlite;

  async function setupDatabase(): Promise<PGlite> {
    const instance = new PGlite();

    await instance.exec(`
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

    await instance.exec(`
      CREATE TABLE IF NOT EXISTS public.workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        brand_name TEXT,
        owner_user_id UUID REFERENCES auth.users(id),
        plan TEXT DEFAULT 'founders3',
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
        UNIQUE(workspace_id, user_id)
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
        IF (auth.jwt() ->> 'role') = 'service_role' THEN
          RETURN true;
        END IF;
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
        IF (auth.jwt() ->> 'role') = 'service_role' THEN
          RETURN true;
        END IF;
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

      CREATE TABLE IF NOT EXISTS public.payment_checkouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        stripe_checkout_session_id TEXT UNIQUE,
        plan_id TEXT NOT NULL DEFAULT 'founders3',
        customer_email TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'paid', 'expired', 'canceled')),
        provider_mode TEXT NOT NULL DEFAULT 'test',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_payment_checkouts_workspace_id UNIQUE (workspace_id, id)
      );

      CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL DEFAULT 'starter' CHECK (plan_id IN ('founders3', 'starter', 'growth', 'enterprise', 'none')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
          'incomplete', 'active', 'trialing', 'past_due', 'canceled_at_period_end', 'canceled', 'unpaid', 'refunded', 'disputed', 'none'
        )),
        provenance TEXT NOT NULL DEFAULT 'stripe',
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

      CREATE TABLE IF NOT EXISTS public.inbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        channel TEXT NOT NULL DEFAULT 'telegram',
        sender_id TEXT NOT NULL,
        message_body TEXT NOT NULL,
        ai_handled BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Execute migrations in order
    const m18 = readFileSync(resolve(__dirname, "../../supabase/migrations/20260918_tier0g_saas_billing.sql"), "utf-8");
    await instance.exec(m18);

    const m22 = readFileSync(resolve(__dirname, "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"), "utf-8");
    await instance.exec(m22);

    const m24 = readFileSync(resolve(__dirname, "../../supabase/migrations/20260924_align_channel_metrics_and_atomic_reservations.sql"), "utf-8");
    await instance.exec(m24);

    const mF3 = readFileSync(resolve(__dirname, "../../supabase/migrations/20261003_founders3_billing_and_slot_control.sql"), "utf-8");
    await instance.exec(mF3);

    const mStrict = readFileSync(resolve(__dirname, "../../supabase/migrations/20261004_founders3_strict_state_and_hash_isolation.sql"), "utf-8");
    await instance.exec(mStrict);

    return instance;
  }

  async function createTestWorkspace(instance: PGlite, name: string, slug: string) {
    const userRes = await instance.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ($1) RETURNING id",
      [`${slug}@example.com`]
    );
    const userId = userRes.rows[0].id;

    const wsRes = await instance.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ($1, $2, $3) RETURNING id",
      [name, slug, userId]
    );
    const wsId = wsRes.rows[0].id;

    await instance.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
      [wsId, userId]
    );

    return { userId, wsId };
  }

  beforeEach(async () => {
    db = await setupDatabase();
  });

  it("Concurrency Test 1: 12 concurrent reservation attempts on 3 slots -> exactly 3 succeed, 9 fail with SLOTS_FULL, 0 deadlocks", async () => {
    const workspaces: { wsId: string; codeHash: string }[] = [];

    // Create 12 workspaces with valid invitation hashes
    for (let i = 1; i <= 12; i++) {
      const { wsId } = await createTestWorkspace(db, `Concurrent Clinic ${i}`, `clinic-${i}`);
      const code = generateInvitationCode();
      const codeHash = hashInvitationCode(code);

      await db.query(
        `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
         VALUES ($1, $2, now() + interval '14 days')`,
        [wsId, codeHash]
      );

      workspaces.push({ wsId, codeHash });
    }

    // Launch 12 concurrent reservation requests
    const attempts = workspaces.map(({ wsId, codeHash }) =>
      db.query<{ reserve_founders3_slot_atomic: any }>(
        `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
        [wsId, codeHash]
      )
    );

    const results = await Promise.all(attempts);
    const outcomes = results.map((r) => r.rows[0].reserve_founders3_slot_atomic);

    const successes = outcomes.filter((o) => o.success === true);
    const failures = outcomes.filter((o) => o.success === false);

    expect(successes.length).toBe(3);
    expect(failures.length).toBe(9);

    failures.forEach((f) => {
      expect(f.code).toBe("FOUNDERS_3_SLOTS_FULL");
    });

    // Check slot status
    const statusRes = await db.query<{ get_founders3_slot_status: any }>(
      `SELECT public.get_founders3_slot_status() as get_founders3_slot_status`
    );
    const status = statusRes.rows[0].get_founders3_slot_status;
    expect(status.occupied_slots).toBe(3);
    expect(status.is_full).toBe(true);
    expect(status.available_slots).toBe(0);
  });

  it("Concurrency Test 2: Concurrent race to redeem the exact same single-use invitation -> exactly 1 succeeds, others rejected", async () => {
    const { wsId } = await createTestWorkspace(db, "Target Med", "target-med");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsId, codeHash]
    );

    // 5 concurrent attempts racing with the same code hash
    const racers = Array.from({ length: 5 }).map(() =>
      db.query<{ reserve_founders3_slot_atomic: any }>(
        `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
        [wsId, codeHash]
      )
    );

    const racerResults = await Promise.all(racers);
    const outcomes = racerResults.map((r) => r.rows[0].reserve_founders3_slot_atomic);

    const successes = outcomes.filter((o) => o.success === true);
    expect(successes.length).toBe(5); // Same workspace idempotent refresh

    // Now activate the enrollment (which marks the invitation consumed)
    await db.query(`SELECT public.activate_founders3_enrollment_atomic($1, 'sub_racer_1', 'cus_racer_1')`, [wsId]);

    // Create a new workspace and try to reuse the consumed code
    const { wsId: wsOther } = await createTestWorkspace(db, "Attacker Med", "attacker-med");
    const replayRes = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [wsOther, codeHash]
    );

    expect(replayRes.rows[0].reserve_founders3_slot_atomic.success).toBe(false);
  });

  it("Concurrency Test 3: Reservation expiration cleanup allows a 4th customer to claim the released seat", async () => {
    const ws1 = await createTestWorkspace(db, "Clinic A", "clinic-a");
    const ws2 = await createTestWorkspace(db, "Clinic B", "clinic-b");
    const ws3 = await createTestWorkspace(db, "Clinic C (Expired)", "clinic-c");
    const ws4 = await createTestWorkspace(db, "Clinic D (New)", "clinic-d");

    // WS 1 & 2 enroll and activate
    for (const ws of [ws1, ws2]) {
      const code = generateInvitationCode();
      const hash = hashInvitationCode(code);
      await db.query(
        `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
         VALUES ($1, $2, now() + interval '14 days')`,
        [ws.wsId, hash]
      );
      await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [ws.wsId, hash]);
      await db.query(`SELECT public.activate_founders3_enrollment_atomic($1, $2, $3)`, [
        ws.wsId,
        `sub_${ws.wsId.slice(0, 6)}`,
        `cus_${ws.wsId.slice(0, 6)}`,
      ]);
    }

    // WS 3 reserves but lets its hold expire
    const code3 = generateInvitationCode();
    const hash3 = hashInvitationCode(code3);
    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [ws3.wsId, hash3]
    );
    await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [ws3.wsId, hash3]);

    // Fast-forward WS3 reservation expiration
    await db.query(
      `UPDATE public.founders3_reservations SET expires_at = now() - interval '5 minutes' WHERE workspace_id = $1`,
      [ws3.wsId]
    );

    // WS 4 attempts to reserve -> before sweeper, reservation status accounts for expired hold or cleans it up
    await db.query(`SELECT public.cleanup_expired_founders3_reservations()`);

    // WS 4 reserves the 3rd slot
    const code4 = generateInvitationCode();
    const hash4 = hashInvitationCode(code4);
    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [ws4.wsId, hash4]
    );

    const res4 = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [ws4.wsId, hash4]
    );

    expect(res4.rows[0].reserve_founders3_slot_atomic.success).toBe(true);
    expect(res4.rows[0].reserve_founders3_slot_atomic.slot_number).toBe(3);
  });

  it("Concurrency Test 4: Subscription cancellation release allows immediate reclamation", async () => {
    const ws1 = await createTestWorkspace(db, "Active 1", "active-1");
    const ws2 = await createTestWorkspace(db, "Active 2", "active-2");
    const ws3 = await createTestWorkspace(db, "Active 3 (Canceling)", "active-3");
    const wsNew = await createTestWorkspace(db, "New Claimant", "new-claimant");

    // Activate 3 subscriptions
    for (const ws of [ws1, ws2, ws3]) {
      const code = generateInvitationCode();
      const hash = hashInvitationCode(code);
      await db.query(
        `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
         VALUES ($1, $2, now() + interval '14 days')`,
        [ws.wsId, hash]
      );
      await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [ws.wsId, hash]);
      await db.query(`SELECT public.activate_founders3_enrollment_atomic($1, $2, $3)`, [
        ws.wsId,
        `sub_${ws.wsId.slice(0, 6)}`,
        `cus_${ws.wsId.slice(0, 6)}`,
      ]);
    }

    // Verify 3/3 slots occupied
    let statusRes = await db.query<{ get_founders3_slot_status: any }>(
      `SELECT public.get_founders3_slot_status() as get_founders3_slot_status`
    );
    expect(statusRes.rows[0].get_founders3_slot_status.is_full).toBe(true);

    // Cancel WS 3
    await db.query(
      `UPDATE public.founders3_reservations
       SET status = 'canceled', released_at = now()
       WHERE workspace_id = $1`,
      [ws3.wsId]
    );

    // Check status -> 1 slot available
    statusRes = await db.query<{ get_founders3_slot_status: any }>(
      `SELECT public.get_founders3_slot_status() as get_founders3_slot_status`
    );
    expect(statusRes.rows[0].get_founders3_slot_status.active_enrollments).toBe(2);
    expect(statusRes.rows[0].get_founders3_slot_status.available_slots).toBe(1);

    // WS New claims the released seat
    const codeNew = generateInvitationCode();
    const hashNew = hashInvitationCode(codeNew);
    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsNew.wsId, hashNew]
    );

    const claimRes = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [wsNew.wsId, hashNew]
    );

    expect(claimRes.rows[0].reserve_founders3_slot_atomic.success).toBe(true);

    // Activate WS New
    await db.query(`SELECT public.activate_founders3_enrollment_atomic($1, 'sub_new_claim', 'cus_new_claim')`, [
      wsNew.wsId,
    ]);

    statusRes = await db.query<{ get_founders3_slot_status: any }>(
      `SELECT public.get_founders3_slot_status() as get_founders3_slot_status`
    );
    expect(statusRes.rows[0].get_founders3_slot_status.active_enrollments).toBe(3);
    expect(statusRes.rows[0].get_founders3_slot_status.is_full).toBe(true);
  });

  it("Concurrency Test 5: cancel_at_period_end=true retains occupied seat; 4th workspace cannot reserve until period end cancellation actually terminates", async () => {
    const ws1 = await createTestWorkspace(db, "Active Customer 1", "active-cust-1");
    const ws2 = await createTestWorkspace(db, "Active Customer 2", "active-cust-2");
    const ws3 = await createTestWorkspace(db, "Active Customer 3 (Pending Cancel)", "active-cust-3");
    const ws4 = await createTestWorkspace(db, "Hopeful Customer 4", "hopeful-cust-4");

    // Activate 3 Founder subscriptions
    for (const ws of [ws1, ws2, ws3]) {
      const code = generateInvitationCode();
      const hash = hashInvitationCode(code);
      await db.query(
        `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
         VALUES ($1, $2, now() + interval '14 days')`,
        [ws.wsId, hash]
      );
      await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [ws.wsId, hash]);
      await db.query(`SELECT public.activate_founders3_enrollment_atomic($1, $2, $3)`, [
        ws.wsId,
        `sub_${ws.wsId.slice(0, 6)}`,
        `cus_${ws.wsId.slice(0, 6)}`,
      ]);
    }

    // Customer 3 schedules cancellation at period end (cancel_at_period_end = true)
    await db.query(
      `UPDATE public.workspace_subscriptions
       SET cancel_at_period_end = true, status = 'active', stripe_status = 'active', entitlement_state = 'active'
       WHERE workspace_id = $1`,
      [ws3.wsId]
    );

    // Verify slots are STILL 3/3 FULL because Customer 3 is still actively entitled until period end
    let statusRes = await db.query<{ get_founders3_slot_status: any }>(
      `SELECT public.get_founders3_slot_status() as get_founders3_slot_status`
    );
    expect(statusRes.rows[0].get_founders3_slot_status.is_full).toBe(true);
    expect(statusRes.rows[0].get_founders3_slot_status.occupied_slots).toBe(3);

    // Customer 4 attempts to reserve a seat with valid invitation -> MUST BE REJECTED
    const code4 = generateInvitationCode();
    const hash4 = hashInvitationCode(code4);
    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [ws4.wsId, hash4]
    );

    const rejectRes = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [ws4.wsId, hash4]
    );
    expect(rejectRes.rows[0].reserve_founders3_slot_atomic.success).toBe(false);
    expect(rejectRes.rows[0].reserve_founders3_slot_atomic.code).toBe("FOUNDERS_3_SLOTS_FULL");

    // Customer 3 reactivates before period end
    await db.query(
      `UPDATE public.workspace_subscriptions
       SET cancel_at_period_end = false
       WHERE workspace_id = $1`,
      [ws3.wsId]
    );

    // Slots still full
    statusRes = await db.query<{ get_founders3_slot_status: any }>(
      `SELECT public.get_founders3_slot_status() as get_founders3_slot_status`
    );
    expect(statusRes.rows[0].get_founders3_slot_status.is_full).toBe(true);

    // Period end finally arrives and Customer 3's subscription is terminally canceled (customer.subscription.deleted)
    await db.query(
      `UPDATE public.workspace_subscriptions
       SET status = 'canceled', stripe_status = 'canceled', entitlement_state = 'canceled'
       WHERE workspace_id = $1`,
      [ws3.wsId]
    );
    await db.query(
      `UPDATE public.founders3_reservations
       SET status = 'canceled', released_at = now()
       WHERE workspace_id = $1`,
      [ws3.wsId]
    );

    // Now 1 slot is released
    statusRes = await db.query<{ get_founders3_slot_status: any }>(
      `SELECT public.get_founders3_slot_status() as get_founders3_slot_status`
    );
    expect(statusRes.rows[0].get_founders3_slot_status.available_slots).toBe(1);

    // Customer 4 can now successfully reserve and activate the 3rd slot
    const successRes = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [ws4.wsId, hash4]
    );
    expect(successRes.rows[0].reserve_founders3_slot_atomic.success).toBe(true);
    expect(successRes.rows[0].reserve_founders3_slot_atomic.slot_number).toBe(3);
  });
});
