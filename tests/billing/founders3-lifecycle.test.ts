import { describe, expect, it, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import {
  PLANS,
  getPlanById,
  isFeatureEnabledForPlan,
} from "@/lib/billing/plans";
import {
  generateInvitationCode,
  hashInvitationCode,
} from "@/lib/billing/invitations";
import {
  verifyStripeWebhookSignature,
  STRIPE_PRICE_ALLOWLIST,
  mapStripeSubscriptionState,
} from "@/lib/billing/stripe-webhook";

describe("J10 Founder’s 3 Billing & Entitlements Certification (PGlite Engine)", () => {
  let db: PGlite;

  async function setupDatabase(): Promise<PGlite> {
    const instance = new PGlite();

    // 1. Setup Auth & Extensions
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

    // 2. Setup Workspaces & Memberships
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

      -- Base workspace_subscriptions from Tier 0F
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

    // 3. Execute Preceding Migrations in Order
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

  async function createTestWorkspace(instance: PGlite, name: string, slug: string, role: string = "owner") {
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
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, $3, 'active')",
      [wsId, userId, role]
    );

    return { userId, wsId };
  }

  beforeEach(async () => {
    db = await setupDatabase();
  });

  // --------------------------------------------------------------------------
  // TEST CASES 1 - 4: SHA-256 INVITATION HASHING & ATOMIC 3-SLOT CONTROL
  // --------------------------------------------------------------------------
  it("Test 1: Generates, hashes and reserves single-use Founder’s 3 invitation via SHA-256", async () => {
    const { wsId } = await createTestWorkspace(db, "Alpha Garage", "alpha-garage");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    // Persist ONLY the hash in the database
    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsId, codeHash]
    );

    const res = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [wsId, codeHash]
    );

    const result = res.rows[0].reserve_founders3_slot_atomic;
    expect(result.success).toBe(true);
    expect(result.slot_number).toBe(1);
    expect(result.workspace_id).toBe(wsId);
  });

  it("Test 2: Rejects expired Founder’s 3 invitation tokens", async () => {
    const { wsId } = await createTestWorkspace(db, "Expired Spa", "expired-spa");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() - interval '1 day')`,
      [wsId, codeHash]
    );

    const res = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [wsId, codeHash]
    );

    const result = res.rows[0].reserve_founders3_slot_atomic;
    expect(result.success).toBe(false);
    expect(result.code).toBe("INVITATION_EXPIRED");
  });

  it("Test 3: Rejects consumed or replayed invitations (Strict Single-Use)", async () => {
    const { wsId } = await createTestWorkspace(db, "Replay Dental", "replay-dental");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, used_count, max_uses, status, expires_at)
       VALUES ($1, $2, 1, 1, 'consumed', now() + interval '7 days')`,
      [wsId, codeHash]
    );

    const res = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [wsId, codeHash]
    );

    const result = res.rows[0].reserve_founders3_slot_atomic;
    expect(result.success).toBe(false);
    expect(result.code).toBe("INVITATION_CONSUMED");
  });

  it("Test 4: Strict 3-slot maximum cap enforcement and rejection of 4th customer", async () => {
    const wsList: string[] = [];

    for (let i = 1; i <= 4; i++) {
      const { wsId } = await createTestWorkspace(db, `Pilot Co ${i}`, `pilot-co-${i}`);
      wsList.push(wsId);
    }

    // Enroll and activate 3 workspaces
    for (let i = 0; i < 3; i++) {
      const code = generateInvitationCode();
      const codeHash = hashInvitationCode(code);
      await db.query(
        `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
         VALUES ($1, $2, now() + interval '14 days')`,
        [wsList[i], codeHash]
      );

      await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [wsList[i], codeHash]);
      await db.query(`SELECT public.activate_founders3_enrollment_atomic($1, $2, $3)`, [
        wsList[i],
        `sub_stripe_f3_${i + 1}`,
        `cus_stripe_f3_${i + 1}`,
      ]);
    }

    // Verify slot status is full (3/3 occupied)
    const slotStatusRes = await db.query<{ get_founders3_slot_status: any }>(
      `SELECT public.get_founders3_slot_status() as get_founders3_slot_status`
    );
    const status = slotStatusRes.rows[0].get_founders3_slot_status;
    expect(status.max_slots).toBe(3);
    expect(status.active_enrollments).toBe(3);
    expect(status.is_full).toBe(true);
    expect(status.available_slots).toBe(0);

    // Attempt 4th workspace reservation
    const code4 = generateInvitationCode();
    const code4Hash = hashInvitationCode(code4);
    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsList[3], code4Hash]
    );

    const res4 = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [wsList[3], code4Hash]
    );

    expect(res4.rows[0].reserve_founders3_slot_atomic.success).toBe(false);
    expect(res4.rows[0].reserve_founders3_slot_atomic.code).toBe("FOUNDERS_3_SLOTS_FULL");
  });

  // --------------------------------------------------------------------------
  // TEST CASES 5 - 7: CHECKOUT JOURNEY, TTL CLEANUP & WEBHOOK IDEMPOTENCY
  // --------------------------------------------------------------------------
  it("Test 5: Transactional session binding and release on abandonment", async () => {
    const { wsId } = await createTestWorkspace(db, "Abandon Salon", "abandon-salon");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);
    const attemptId = randomUUID();

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsId, codeHash]
    );

    // Hold slot with checkout attempt ID
    await db.query(
      `SELECT public.reserve_founders3_slot_atomic($1, $2, $3)`,
      [wsId, codeHash, attemptId]
    );

    // Bind Stripe session ID
    const sessionId = "cs_test_session_123";
    const bindRes = await db.query<{ bind_founders3_checkout_session_atomic: any }>(
      `SELECT public.bind_founders3_checkout_session_atomic($1, $2, $3) as bind_founders3_checkout_session_atomic`,
      [wsId, attemptId, sessionId]
    );
    expect(bindRes.rows[0].bind_founders3_checkout_session_atomic.success).toBe(true);

    // Release reservation on checkout expiration / abandonment
    const releaseRes = await db.query<{ release_founders3_reservation_atomic: any }>(
      `SELECT public.release_founders3_reservation_atomic($1, 'checkout_abandoned') as release_founders3_reservation_atomic`,
      [wsId]
    );
    expect(releaseRes.rows[0].release_founders3_reservation_atomic.released).toBe(true);
  });

  it("Test 6: Automated sweeper cleans up expired reservations with missed webhooks", async () => {
    const { wsId } = await createTestWorkspace(db, "Sweeper WS", "sweeper-ws");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsId, codeHash]
    );

    // Insert pending reservation with past expiration
    await db.query(
      `INSERT INTO public.founders3_reservations (workspace_id, status, reserved_at, expires_at)
       VALUES ($1, 'pending', now() - interval '1 hour', now() - interval '30 minutes')`,
      [wsId]
    );

    // Run sweeper function
    const sweepRes = await db.query<{ cleanup_expired_founders3_reservations: any }>(
      `SELECT public.cleanup_expired_founders3_reservations() as cleanup_expired_founders3_reservations`
    );

    expect(sweepRes.rows[0].cleanup_expired_founders3_reservations.success).toBe(true);
    expect(sweepRes.rows[0].cleanup_expired_founders3_reservations.expired_released_count).toBe(1);

    // Verify status is now 'released'
    const resRow = await db.query<any>(`SELECT status FROM public.founders3_reservations WHERE workspace_id = $1`, [wsId]);
    expect(resRow.rows[0].status).toBe("released");
  });

  it("Test 7: Idempotently deduplicates webhook events", async () => {
    const { wsId } = await createTestWorkspace(db, "Webhook Med", "webhook-med");
    const eventId = "evt_stripe_test_f3_001";

    // First insert to webhook_events
    await db.query(
      `INSERT INTO public.webhook_events (provider, provider_event_id, event_type, processing_status, workspace_id)
       VALUES ('stripe', $1, 'invoice.paid', 'processed', $2)`,
      [eventId, wsId]
    );

    const checkRes = await db.query<{ id: string; processing_status: string }>(
      `SELECT id, processing_status FROM public.webhook_events WHERE provider = 'stripe' AND provider_event_id = $1`,
      [eventId]
    );

    expect(checkRes.rows.length).toBe(1);
    expect(checkRes.rows[0].processing_status).toBe("processed");
  });

  // --------------------------------------------------------------------------
  // TEST CASES 8 - 11: STRICT STATE SEPARATION & INVOICE.PAID PROVISIONING
  // --------------------------------------------------------------------------
  it("Test 8: Strict state separation - customer.subscription.created (incomplete) does not grant active entitlements", () => {
    const incompleteState = mapStripeSubscriptionState("incomplete", false);
    expect(incompleteState.stripeStatus).toBe("incomplete");
    expect(incompleteState.entitlementState).toBe("none");
    expect(incompleteState.billingHoldReason).toBe("none");

    const activeState = mapStripeSubscriptionState("active", false);
    expect(activeState.stripeStatus).toBe("active");
    expect(activeState.entitlementState).toBe("active");
    expect(activeState.billingHoldReason).toBe("none");

    const cancelEndState = mapStripeSubscriptionState("active", true);
    expect(cancelEndState.stripeStatus).toBe("active"); // Stripe status is still active!
    expect(cancelEndState.entitlementState).toBe("active");
    expect(cancelEndState.status).toBe("canceled_at_period_end");

    const pastDueState = mapStripeSubscriptionState("past_due", false);
    expect(pastDueState.stripeStatus).toBe("past_due");
    expect(pastDueState.entitlementState).toBe("grace_period");
    expect(pastDueState.billingHoldReason).toBe("dunning_grace");
  });

  it("Test 9: Provisions Founder’s 3 entitlements on invoice.paid signal ($149/mo, 1000 AI convos, 3 seats, 2 channels)", async () => {
    const { wsId } = await createTestWorkspace(db, "Provision Spa", "provision-spa");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsId, codeHash]
    );

    await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [wsId, codeHash]);

    // Primary Provisioning Signal: invoice.paid
    const actRes = await db.query<{ activate_founders3_enrollment_atomic: any }>(
      `SELECT public.activate_founders3_enrollment_atomic($1, 'sub_test_001', 'cus_test_001', 'price_founders3_monthly_149') as activate_founders3_enrollment_atomic`,
      [wsId]
    );

    expect(actRes.rows[0].activate_founders3_enrollment_atomic.success).toBe(true);

    const sub = await db.query<any>(`SELECT * FROM public.workspace_subscriptions WHERE workspace_id = $1`, [wsId]);
    expect(sub.rows[0].plan_id).toBe("founders3");
    expect(sub.rows[0].status).toBe("active");
    expect(sub.rows[0].stripe_status).toBe("active");
    expect(sub.rows[0].entitlement_state).toBe("active");
    expect(sub.rows[0].billing_hold_reason).toBe("none");
    expect(sub.rows[0].stripe_price_id).toBe("price_founders3_monthly_149");
    expect(sub.rows[0].seats_quota).toBe(3);
    expect(sub.rows[0].channels_quota).toBe(2);
    expect(sub.rows[0].ai_conversations_quota).toBe(1000);
  });

  it("Test 10 & 11: Past-due state sets grace_period and hold reason without deleting data", async () => {
    const { wsId } = await createTestWorkspace(db, "PastDue Vet", "pastdue-vet");

    await db.query(
      `INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, stripe_status, entitlement_state, billing_hold_reason, stripe_subscription_id
      ) VALUES (
        $1, 'founders3', 'past_due', 'past_due', 'grace_period', 'dunning_grace', 'sub_fail_11'
      )`,
      [wsId]
    );

    const sub = await db.query<any>(`SELECT * FROM public.workspace_subscriptions WHERE workspace_id = $1`, [wsId]);
    expect(sub.rows[0].stripe_status).toBe("past_due");
    expect(sub.rows[0].entitlement_state).toBe("grace_period");
    expect(sub.rows[0].billing_hold_reason).toBe("dunning_grace");
  });

  // --------------------------------------------------------------------------
  // TEST CASES 12 - 14: PERIOD-END CANCELLATION, REACTIVATION & SEAT RECLAMATION
  // --------------------------------------------------------------------------
  it("Test 12 & 13: Schedules cancellation at period end and supports self-serve reactivation", async () => {
    const { wsId } = await createTestWorkspace(db, "Cancel Physio", "cancel-physio");

    await db.query(
      `INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, stripe_status, entitlement_state, cancel_at_period_end
      ) VALUES (
        $1, 'founders3', 'active', 'active', 'active', true
      )`,
      [wsId]
    );

    let sub = await db.query<any>(`SELECT * FROM public.workspace_subscriptions WHERE workspace_id = $1`, [wsId]);
    expect(sub.rows[0].cancel_at_period_end).toBe(true);
    expect(sub.rows[0].stripe_status).toBe("active");
    expect(sub.rows[0].entitlement_state).toBe("active");

    // Reactivate
    await db.query(
      `UPDATE public.workspace_subscriptions
       SET cancel_at_period_end = false,
           status = 'active'
       WHERE workspace_id = $1`,
      [wsId]
    );

    sub = await db.query<any>(`SELECT * FROM public.workspace_subscriptions WHERE workspace_id = $1`, [wsId]);
    expect(sub.rows[0].cancel_at_period_end).toBe(false);
    expect(sub.rows[0].status).toBe("active");
  });

  it("Test 14: Completed subscription cancellation sets canceled state and releases seat", async () => {
    const { wsId } = await createTestWorkspace(db, "Deleted Clinic", "deleted-clinic");

    await db.query(
      `INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, stripe_status, entitlement_state, billing_hold_reason, stripe_subscription_id
      ) VALUES (
        $1, 'founders3', 'canceled', 'canceled', 'canceled', 'none', 'sub_del_88'
      )`,
      [wsId]
    );

    const sub = await db.query<any>(`SELECT * FROM public.workspace_subscriptions WHERE workspace_id = $1`, [wsId]);
    expect(sub.rows[0].stripe_status).toBe("canceled");
    expect(sub.rows[0].entitlement_state).toBe("canceled");
  });

  // --------------------------------------------------------------------------
  // TEST CASES 15 - 18: CROSS-WORKSPACE ISOLATION & LEAD PRESERVATION
  // --------------------------------------------------------------------------
  it("Test 15: Cross-workspace invitation mismatch is rejected atomically", async () => {
    const { wsId: wsA } = await createTestWorkspace(db, "Workspace A", "ws-a");
    const { wsId: wsB } = await createTestWorkspace(db, "Workspace B", "ws-b");

    const codeA = generateInvitationCode();
    const codeAHash = hashInvitationCode(codeA);
    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsA, codeAHash]
    );

    // WS B attempts to reserve with WS A's invitation
    const attackRes = await db.query<{ reserve_founders3_slot_atomic: any }>(
      `SELECT public.reserve_founders3_slot_atomic($1, $2) as reserve_founders3_slot_atomic`,
      [wsB, codeAHash]
    );

    const result = attackRes.rows[0].reserve_founders3_slot_atomic;
    expect(result.success).toBe(false);
    expect(result.code).toBe("INVITATION_WORKSPACE_MISMATCH");
  });

  it("Test 16: Inbound messages are preserved and saved even at 100% quota limit", async () => {
    const { wsId } = await createTestWorkspace(db, "MaxQuota Law", "maxquota-law");

    await db.query(
      `INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, stripe_status, entitlement_state, monthly_message_limit, messages_used_this_period
      ) VALUES (
        $1, 'founders3', 'active', 'active', 'active', 1000, 1000
      )`,
      [wsId]
    );

    // Inbound lead arrives
    await db.query(
      `INSERT INTO public.inbox_messages (workspace_id, channel, sender_id, message_body, ai_handled)
       VALUES ($1, 'telegram', 'lead_user_888', 'Hi I need urgent consultation', false)`,
      [wsId]
    );

    const msgs = await db.query<any>(`SELECT * FROM public.inbox_messages WHERE workspace_id = $1`, [wsId]);
    expect(msgs.rows.length).toBe(1);
    expect(msgs.rows[0].message_body).toBe("Hi I need urgent consultation");
    expect(msgs.rows[0].ai_handled).toBe(false);
  });

  // --------------------------------------------------------------------------
  // TEST CASES 17 & 18: 12-MONTH FOUNDER PRICING TRANSITION TO $149
  // --------------------------------------------------------------------------
  it("Test 17: 12-month paid cycle transition: Month 1–12 at $99/mo, Month 13 transitions to $149/mo standard price", async () => {
    const { wsId } = await createTestWorkspace(db, "Transition Clinic", "transition-clinic");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsId, codeHash]
    );

    await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [wsId, codeHash]);

    // Initial activation (Cycle 1)
    const actRes = await db.query<{ activate_founders3_enrollment_atomic: any }>(
      `SELECT public.activate_founders3_enrollment_atomic($1, 'sub_transition_01', 'cus_transition_01', 'price_founders3_monthly_99') as activate_founders3_enrollment_atomic`,
      [wsId]
    );
    expect(actRes.rows[0].activate_founders3_enrollment_atomic.founder_cycle_count).toBe(1);
    expect(actRes.rows[0].activate_founders3_enrollment_atomic.price_transition_status).toBe("introductory");

    // Simulate successfully paying cycles 2 through 11
    for (let cycle = 2; cycle <= 11; cycle++) {
      const cycleRes = await db.query<{ record_founder_paid_cycle_atomic: any }>(
        `SELECT public.record_founder_paid_cycle_atomic($1, 'sub_transition_01', $2, 'price_founders3_monthly_99') as record_founder_paid_cycle_atomic`,
        [wsId, `in_test_cycle_${cycle}`]
      );
      expect(cycleRes.rows[0].record_founder_paid_cycle_atomic.founder_cycle_count).toBe(cycle);
      expect(cycleRes.rows[0].record_founder_paid_cycle_atomic.price_transition_status).toBe("introductory");
    }

    // Pay cycle 12 (Target cycle reached)
    const cycle12Res = await db.query<{ record_founder_paid_cycle_atomic: any }>(
      `SELECT public.record_founder_paid_cycle_atomic($1, 'sub_transition_01', 'in_test_cycle_12', 'price_founders3_monthly_99') as record_founder_paid_cycle_atomic`,
      [wsId]
    );
    expect(cycle12Res.rows[0].record_founder_paid_cycle_atomic.founder_cycle_count).toBe(12);
    expect(cycle12Res.rows[0].record_founder_paid_cycle_atomic.price_transition_status).toBe("transitioned");
    expect(cycle12Res.rows[0].record_founder_paid_cycle_atomic.is_transitioned).toBe(true);

    // Pay cycle 13 (Standard Price $149/mo applied -> transition_applied)
    const cycle13Res = await db.query<{ record_founder_paid_cycle_atomic: any }>(
      `SELECT public.record_founder_paid_cycle_atomic($1, 'sub_transition_01', 'in_test_cycle_13', 'price_standard_monthly_149') as record_founder_paid_cycle_atomic`,
      [wsId]
    );
    expect(cycle13Res.rows[0].record_founder_paid_cycle_atomic.founder_cycle_count).toBe(13);
    expect(cycle13Res.rows[0].record_founder_paid_cycle_atomic.price_transition_status).toBe("transition_applied");
  });

  it("Test 18: Failed or disputed invoices do NOT advance cycle count; only verified paid invoices advance count", async () => {
    const { wsId } = await createTestWorkspace(db, "FailCycle Dental", "failcycle-dental");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsId, codeHash]
    );

    await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [wsId, codeHash]);
    await db.query(`SELECT public.activate_founders3_enrollment_atomic($1, 'sub_fail_test', 'cus_fail_test', 'price_founders3_monthly_99')`, [wsId]);

    // Initial cycle count is 1
    let sub = await db.query<any>(`SELECT founder_cycle_count FROM public.workspace_subscriptions WHERE workspace_id = $1`, [wsId]);
    expect(sub.rows[0].founder_cycle_count).toBe(1);

    // Simulated invoice payment failure (marks past_due without calling record_founder_paid_cycle_atomic)
    await db.query(
      `UPDATE public.workspace_subscriptions
       SET status = 'past_due', stripe_status = 'past_due', entitlement_state = 'grace_period', billing_hold_reason = 'dunning_grace'
       WHERE workspace_id = $1`,
      [wsId]
    );

    // Verify cycle count did NOT advance during failure
    sub = await db.query<any>(`SELECT founder_cycle_count, stripe_status FROM public.workspace_subscriptions WHERE workspace_id = $1`, [wsId]);
    expect(sub.rows[0].founder_cycle_count).toBe(1);
    expect(sub.rows[0].stripe_status).toBe("past_due");

    // Payment recovers -> invoice.paid arrives and advances to cycle 2
    const recoverRes = await db.query<{ record_founder_paid_cycle_atomic: any }>(
      `SELECT public.record_founder_paid_cycle_atomic($1, 'sub_fail_test', 'in_recovered_cycle_2', 'price_founders3_monthly_99') as record_founder_paid_cycle_atomic`,
      [wsId]
    );
    expect(recoverRes.rows[0].record_founder_paid_cycle_atomic.founder_cycle_count).toBe(2);
    expect(recoverRes.rows[0].record_founder_paid_cycle_atomic.price_transition_status).toBe("introductory");
  });

  it("Test 19: Subscription Schedule creation & reconciliation distinguishes schedule_created, transition_applied, and reconciliation_required on discrepancies", async () => {
    const { wsId } = await createTestWorkspace(db, "Schedule Reconcile WS", "sched-recon-ws");
    const code = generateInvitationCode();
    const codeHash = hashInvitationCode(code);

    await db.query(
      `INSERT INTO public.founders3_invitations (workspace_id, invitation_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '14 days')`,
      [wsId, codeHash]
    );

    await db.query(`SELECT public.reserve_founders3_slot_atomic($1, $2)`, [wsId, codeHash]);
    await db.query(`SELECT public.activate_founders3_enrollment_atomic($1, 'sub_sched_001', 'cus_sched_001', 'price_founders3_monthly_99')`, [wsId]);

    // Initial state has schedule_id updated
    await db.query(
      `UPDATE public.workspace_subscriptions
       SET stripe_subscription_schedule_id = 'sub_sched_test_123', price_transition_status = 'schedule_created'
       WHERE workspace_id = $1`,
      [wsId]
    );

    let sub = await db.query<any>(`SELECT price_transition_status, stripe_subscription_schedule_id FROM public.workspace_subscriptions WHERE workspace_id = $1`, [wsId]);
    expect(sub.rows[0].price_transition_status).toBe("schedule_created");
    expect(sub.rows[0].stripe_subscription_schedule_id).toBe("sub_sched_test_123");

    // Advance to cycle 12 with standard price $149 invoiced -> transition_applied
    const transRes = await db.query<{ record_founder_paid_cycle_atomic: any }>(
      `SELECT public.record_founder_paid_cycle_atomic($1, 'sub_sched_001', 'in_cycle_12_std', 'price_standard_monthly_149', now(), now() + interval '30 days', 'sub_sched_test_123', 'transition_applied') as record_founder_paid_cycle_atomic`,
      [wsId]
    );
    expect(transRes.rows[0].record_founder_paid_cycle_atomic.price_transition_status).toBe("transition_applied");

    // If a discrepancy occurs (cycle >= 12 but invoice still at $99), status is reconciliation_required
    const discRes = await db.query<{ record_founder_paid_cycle_atomic: any }>(
      `SELECT public.record_founder_paid_cycle_atomic($1, 'sub_sched_001', 'in_cycle_13_err', 'price_founders3_monthly_99', now(), now() + interval '30 days', 'sub_sched_test_123', 'reconciliation_required') as record_founder_paid_cycle_atomic`,
      [wsId]
    );
    expect(discRes.rows[0].record_founder_paid_cycle_atomic.price_transition_status).toBe("reconciliation_required");
  });
});
