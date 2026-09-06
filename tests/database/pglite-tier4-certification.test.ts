import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Tier 4: Governed AI Agent Platform Database Certification (PGlite)", () => {
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

    // 2. Setup Base Tables (Users, Workspaces, Members, Contacts)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS public.users (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
      );

      CREATE TABLE IF NOT EXISTS public.workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.workspace_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'viewer',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_ws_member UNIQUE (workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    `);

    return db;
  }

  it("applies 20260922_tier4_governed_ai_agent_platform.sql migration cleanly and idempotently", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"
    );
    const sql = readFileSync(migrationPath, "utf-8");

    // Apply migration
    await db.exec(sql);

    // Apply second time to verify idempotency
    await db.exec(sql);

    // Verify all 8 tables were created
    const tablesResult = await db.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'ai_agent_versions',
          'ai_agent_traces',
          'ai_agent_trace_steps',
          'ai_agent_permissions',
          'ai_agent_budgets',
          'ai_agent_approval_gates',
          'ai_agent_evaluations',
          'ai_agent_roi_attributions'
        )
      ORDER BY table_name;
    `);

    expect(tablesResult.rows.length).toBe(8);
  });

  it("enforces versioning constraints and uniqueness on ai_agent_versions", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    const ws = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Test WS', 'test-ws') RETURNING id;`
    );
    const wsId = ws.rows[0].id;

    // Insert Version 1
    await db.exec(`
      INSERT INTO public.ai_agent_versions (
        workspace_id, agent_id, version_number, system_prompt, model_id
      ) VALUES (
        '${wsId}', 'sales-agent', 1, 'You are Sarah Chen.', 'gpt-5.6-sol'
      );
    `);

    // Duplicate version number for same agent in same workspace should fail
    await expect(
      db.exec(`
        INSERT INTO public.ai_agent_versions (
          workspace_id, agent_id, version_number, system_prompt, model_id
        ) VALUES (
          '${wsId}', 'sales-agent', 1, 'Duplicate v1', 'gpt-5.6-sol'
        );
      `)
    ).rejects.toThrow();

    // Invalid status should fail check constraint
    await expect(
      db.exec(`
        INSERT INTO public.ai_agent_versions (
          workspace_id, agent_id, version_number, system_prompt, status
        ) VALUES (
          '${wsId}', 'sales-agent', 2, 'Invalid status', 'invalid_status'
        );
      `)
    ).rejects.toThrow();
  });

  it("enforces trace and step relationships with cascade deletion", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    const ws = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Trace WS', 'trace-ws') RETURNING id;`
    );
    const wsId = ws.rows[0].id;

    const traceRes = await db.query<{ id: string }>(`
      INSERT INTO public.ai_agent_traces (
        workspace_id, agent_id, model_used, status
      ) VALUES (
        '${wsId}', 'sales-agent', 'gpt-5.6-sol', 'running'
      ) RETURNING id;
    `);
    const traceId = traceRes.rows[0].id;

    // Insert steps
    await db.exec(`
      INSERT INTO public.ai_agent_trace_steps (
        trace_id, step_number, step_type, thought
      ) VALUES
        ('${traceId}', 1, 'reasoning', 'Step 1 thought'),
        ('${traceId}', 2, 'tool_call', 'Step 2 tool call');
    `);

    const countBefore = await db.query<{ count: number }>(`SELECT COUNT(*)::int as count FROM public.ai_agent_trace_steps WHERE trace_id = '${traceId}';`);
    expect(countBefore.rows[0].count).toBe(2);

    // Delete trace -> steps must cascade delete
    await db.exec(`DELETE FROM public.ai_agent_traces WHERE id = '${traceId}';`);

    const countAfter = await db.query<{ count: number }>(`SELECT COUNT(*)::int as count FROM public.ai_agent_trace_steps WHERE trace_id = '${traceId}';`);
    expect(countAfter.rows[0].count).toBe(0);
  });

  it("enforces unique agent budgets and over_budget_policy checks", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    const ws = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Budget WS', 'budget-ws') RETURNING id;`
    );
    const wsId = ws.rows[0].id;

    await db.exec(`
      INSERT INTO public.ai_agent_budgets (
        workspace_id, agent_id, daily_budget_usd, monthly_budget_usd, over_budget_policy
      ) VALUES (
        '${wsId}', 'sales-agent', 50.0, 1000.0, 'hard_stop'
      );
    `);

    // Duplicate budget per agent should fail
    await expect(
      db.exec(`
        INSERT INTO public.ai_agent_budgets (
          workspace_id, agent_id, daily_budget_usd
        ) VALUES (
          '${wsId}', 'sales-agent', 25.0
        );
      `)
    ).rejects.toThrow();

    // Invalid policy should fail check constraint
    await expect(
      db.exec(`
        INSERT INTO public.ai_agent_budgets (
          workspace_id, agent_id, daily_budget_usd, over_budget_policy
        ) VALUES (
          '${wsId}', 'support-agent', 25.0, 'invalid_policy'
        );
      `)
    ).rejects.toThrow();
  });

  it("verifies multi-tenant RLS isolation on governance tables", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    // Create 2 users
    const u1 = await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('user1@test.com') RETURNING id;`);
    const u2 = await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('user2@test.com') RETURNING id;`);
    const u1Id = u1.rows[0].id;
    const u2Id = u2.rows[0].id;

    // Create 2 workspaces
    const ws1 = await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('WS 1', 'ws-1') RETURNING id;`);
    const ws2 = await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('WS 2', 'ws-2') RETURNING id;`);
    const ws1Id = ws1.rows[0].id;
    const ws2Id = ws2.rows[0].id;

    // Membership: u1 in ws1, u2 in ws2
    await db.exec(`
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES
        ('${ws1Id}', '${u1Id}', 'admin'),
        ('${ws2Id}', '${u2Id}', 'admin');
    `);

    // Insert ROI attribution into ws1
    await db.exec(`
      INSERT INTO public.ai_agent_roi_attributions (
        workspace_id, agent_id, deal_value_usd, hours_saved, labor_savings_usd, model_cost_usd, net_roi_usd, roi_multiplier
      ) VALUES (
        '${ws1Id}', 'sales-agent', 5000.0, 2.0, 90.0, 0.05, 5089.95, 101799.0
      );
    `);

    // As user1 in ws1, query ROI -> sees 1 row
    const u1Roi = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${u1Id}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${u1Id}","role":"authenticated"}';
      `);
      return await tx.query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM public.ai_agent_roi_attributions;`
      );
    });
    expect(u1Roi.rows[0].count).toBe(1);

    // As user2 in ws2, query ROI -> sees 0 rows (isolated!)
    const u2Roi = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${u2Id}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${u2Id}","role":"authenticated"}';
      `);
      return await tx.query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM public.ai_agent_roi_attributions;`
      );
    });
    expect(u2Roi.rows[0].count).toBe(0);
  });
});
