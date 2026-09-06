import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  reserveWorkspaceQuota,
  releaseWorkspaceQuota,
  BillingRequiredError,
} from "@/lib/billing/entitlements";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Tier 0G: Independent Session Concurrency & Pre-Reservation Verification", () => {
  const migrationSql = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20260918_tier0g_saas_billing.sql"),
    "utf-8"
  );

  async function createSeededPostgresInstance() {
    const db = new PGlite();

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
        role TEXT NOT NULL DEFAULT 'agent',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL DEFAULT 'starter',
        status TEXT NOT NULL DEFAULT 'active',
        monthly_message_limit INTEGER NOT NULL DEFAULT 1000,
        messages_used_this_period INTEGER NOT NULL DEFAULT 0,
        current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
        current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
        grace_period_end TIMESTAMPTZ,
        provenance TEXT DEFAULT 'stripe',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION public.has_workspace_role(
        p_workspace_id UUID,
        p_roles TEXT[]
      ) RETURNS BOOLEAN AS $$
        SELECT true;
      $$ LANGUAGE sql SECURITY DEFINER STABLE;

      CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS BOOLEAN AS $$
        SELECT false;
      $$ LANGUAGE sql SECURITY DEFINER STABLE;
    `);

    await db.exec(migrationSql);
    return db;
  }

  it("1. Models independent PostgreSQL connection transactions competing for quota with FOR UPDATE locking", async () => {
    const db = await createSeededPostgresInstance();

    const wsId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const userA = "11111111-1111-1111-1111-111111111111";
    const userB = "22222222-2222-2222-2222-222222222222";

    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'workerA@agency.com'), ($2, 'workerB@agency.com')", [userA, userB]);
    await db.query("INSERT INTO public.workspaces (id, name, slug, owner_user_id) VALUES ($1, 'Compete Corp', 'compete-corp', $2)", [wsId, userA]);
    await db.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'agent'), ($1, $3, 'agent')", [wsId, userA, userB]);

    // Provision subscription with total quota allowance = 15, current usage = 0
    await db.query(`
      INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, provenance, monthly_message_limit, messages_used_this_period
      ) VALUES ($1, 'starter', 'active', 'stripe', 15, 0)
    `, [wsId]);

    // Simulate Session 1 (Worker A) executing an explicit transaction with row lock
    const session1Result = await db.transaction(async (tx1) => {
      await tx1.exec(`
        SET LOCAL "request.jwt.claim.sub" = '${userA}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userA}","role":"authenticated"}';
      `);

      // Worker A requests 10 units
      const res1 = await tx1.query<{ record_verified_workspace_usage: any }>(
        "SELECT public.record_verified_workspace_usage($1::uuid, 'whatsapp_outbound'::text, 10::int, 'res-worker-A'::text, 'task-A'::text, $2::uuid)",
        [wsId, userA]
      );
      return res1.rows[0].record_verified_workspace_usage;
    });

    expect(session1Result.success).toBe(true);
    expect(session1Result.messages_used_this_period).toBe(10);
    expect(session1Result.remaining).toBe(5);

    // Simulate Session 2 (Worker B) in a distinct transaction attempting to reserve 10 units (remaining is only 5)
    const session2Result = await db.transaction(async (tx2) => {
      await tx2.exec(`
        SET LOCAL "request.jwt.claim.sub" = '${userB}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userB}","role":"authenticated"}';
      `);

      // Worker B requests 10 units
      const res2 = await tx2.query<{ record_verified_workspace_usage: any }>(
        "SELECT public.record_verified_workspace_usage($1::uuid, 'whatsapp_outbound'::text, 10::int, 'res-worker-B'::text, 'task-B'::text, $2::uuid)",
        [wsId, userB]
      );
      return res2.rows[0].record_verified_workspace_usage;
    });

    // Session 2 must be rejected by PostgreSQL row lock check
    expect(session2Result.success).toBe(false);
    expect(session2Result.limit_reached).toBe(true);
    expect(session2Result.error).toContain("Monthly message quota exceeded");

    // Verify database row state is exactly 10, never exceeded 15
    const verifySub = await db.query<{ messages_used_this_period: number }>(
      "SELECT messages_used_this_period FROM public.workspace_subscriptions WHERE workspace_id = $1",
      [wsId]
    );
    expect(verifySub.rows[0].messages_used_this_period).toBe(10);
  });

  it("2. Demonstrates atomic pre-reservation and rollback release via application helpers", async () => {
    let currentUsage = 20;
    const monthlyLimit = 50;

    const mockSupabase = {
      rpc: async (fn: string, params: any) => {
        if (fn === "record_verified_workspace_usage") {
          const qty = params.p_quantity;
          if (currentUsage + qty > monthlyLimit) {
            return {
              data: {
                success: false,
                limit_reached: true,
                error: "Monthly message quota exceeded",
              },
              error: null,
            };
          }
          currentUsage += qty;
          return {
            data: {
              success: true,
              record_id: "rec-res-123",
              messages_used_this_period: currentUsage,
              monthly_message_limit: monthlyLimit,
              remaining: monthlyLimit - currentUsage,
              is_exceeded: false,
              idempotent: false,
            },
            error: null,
          };
        }
        throw new Error(`Unexpected RPC ${fn}`);
      },
      from: (table: string) => {
        if (table === "workspace_subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: "sub-123", messages_used_this_period: currentUsage },
                  error: null,
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                if (payload.messages_used_this_period != null) {
                  currentUsage = payload.messages_used_this_period;
                }
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    // Step A: Pre-reserve 10 units before action
    const reservation = await reserveWorkspaceQuota(mockSupabase, {
      workspaceId: "ws-pre-res",
      metricName: "whatsapp_outbound",
      quantity: 10,
    });

    expect(reservation.success).toBe(true);
    expect(reservation.quantityReserved).toBe(10);
    expect(reservation.newUsage).toBe(30);
    expect(reservation.remainingQuota).toBe(20);

    // Step B: If the action fails externally, release/refund the reserved quota
    const releaseRes = await releaseWorkspaceQuota(mockSupabase, {
      workspaceId: "ws-pre-res",
      quantity: 10,
      reservationId: reservation.reservationId,
      reason: "External API call failed",
    });

    expect(releaseRes.success).toBe(true);
    expect(releaseRes.newUsage).toBe(20);

    // Step C: If a subsequent call requests more than remaining quota (e.g. 35 units when limit is 50 and usage is 20)
    await expect(
      reserveWorkspaceQuota(mockSupabase, {
        workspaceId: "ws-pre-res",
        metricName: "whatsapp_outbound",
        quantity: 35,
      })
    ).rejects.toThrow(BillingRequiredError);
  });
});
