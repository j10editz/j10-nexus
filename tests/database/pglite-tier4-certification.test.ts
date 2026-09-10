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
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
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

    // 2. Setup Base Tables (Workspaces, Memberships, Platform Roles, Canonical Security Definers)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS public.workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
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
        role TEXT NOT NULL CHECK (role IN ('platform_founder', 'platform_admin', 'support_agent')),
        created_at TIMESTAMPTZ DEFAULT now()
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

      CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID)
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      STABLE
      SECURITY DEFINER
      AS $$
      DECLARE
        v_user_id UUID;
      BEGIN
        v_user_id := p_user_id;
        IF v_user_id IS NULL THEN
          RETURN false;
        END IF;

        RETURN EXISTS (
          SELECT 1 FROM public.platform_roles
          WHERE user_id = v_user_id
            AND role IN ('platform_founder', 'platform_admin')
        );
      END;
      $$;

      CREATE TABLE IF NOT EXISTS public.contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_contacts_workspace_id UNIQUE (workspace_id, id)
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

    // Canonical Memberships: u1 in ws1, u2 in ws2
    await db.exec(`
      INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
      VALUES
        ('${ws1Id}', '${u1Id}', 'admin', 'active'),
        ('${ws2Id}', '${u2Id}', 'admin', 'active');
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

  it("enforces canonical RLS: viewer read-only and suspended member denial on governance tables", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    const ws = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('Gov WS', 'gov-ws') RETURNING id;`)).rows[0].id;
    const ownerId = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('gov_owner@test.com') RETURNING id;`)).rows[0].id;
    const viewerId = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('gov_viewer@test.com') RETURNING id;`)).rows[0].id;
    const suspendedId = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('gov_suspended@test.com') RETURNING id;`)).rows[0].id;

    await db.query(`
      INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
      VALUES
        ($1, $2, 'owner', 'active'),
        ($1, $3, 'viewer', 'active'),
        ($1, $4, 'admin', 'suspended');
    `, [ws, ownerId, viewerId, suspendedId]);

    // Insert version as superuser
    const vId = (await db.query<{ id: string }>(`
      INSERT INTO public.ai_agent_versions (workspace_id, agent_id, version_number, system_prompt)
      VALUES ($1, 'agent-1', 1, 'System prompt v1') RETURNING id;
    `, [ws])).rows[0].id;

    // 1. Viewer can SELECT versions
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '${viewerId}';`);
      const res = await tx.query(`SELECT id FROM public.ai_agent_versions WHERE workspace_id = $1;`, [ws]);
      expect(res.rows.length).toBe(1);
    });

    // 2. Viewer CANNOT INSERT new version (mutation denied)
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '${viewerId}';`);
      await expect(tx.query(`
        INSERT INTO public.ai_agent_versions (workspace_id, agent_id, version_number, system_prompt)
        VALUES ($1, 'agent-1', 2, 'Unauthorized update');
      `, [ws])).rejects.toThrow();
    });

    // 3. Suspended member CANNOT SELECT (denied)
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '${suspendedId}';`);
      const res = await tx.query(`SELECT id FROM public.ai_agent_versions WHERE workspace_id = $1;`, [ws]);
      expect(res.rows.length).toBe(0);
    });
  });

  it("enforces cross-tenant composite foreign keys between traces, versions, and approval gates", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      __dirname,
      "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"
    );
    await db.exec(readFileSync(migrationPath, "utf-8"));

    const wsA = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('WS Alpha', 'ws-alpha') RETURNING id;`)).rows[0].id;
    const wsB = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('WS Beta', 'ws-beta') RETURNING id;`)).rows[0].id;

    // Create version in Workspace A
    const verA = (await db.query<{ id: string }>(`
      INSERT INTO public.ai_agent_versions (workspace_id, agent_id, version_number, system_prompt)
      VALUES ($1, 'agent-a', 1, 'Prompt A') RETURNING id;
    `, [wsA])).rows[0].id;

    // Attempting to create trace in Workspace B with version from Workspace A MUST FAIL composite FK
    await expect(db.query(`
      INSERT INTO public.ai_agent_traces (workspace_id, agent_id, version_id)
      VALUES ($1, 'agent-b', $2);
    `, [wsB, verA])).rejects.toThrow();

    // Valid trace in Workspace A with version from Workspace A succeeds
    await expect(db.query(`
      INSERT INTO public.ai_agent_traces (workspace_id, agent_id, version_id)
      VALUES ($1, 'agent-a', $2);
    `, [wsA, verA])).resolves.not.toThrow();
  });

  it("enforces Tier 4 workspace ownership, FORCE RLS, and least-privilege grants", async () => {
    const db = await setupDatabase();
    const migration = readFileSync(resolve(__dirname, "../../supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql"), "utf-8");
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(migration).toContain("is_platform_admin(auth.uid())");
    await db.exec(migration);

    const wsA = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('Owner A', 'owner-a') RETURNING id`)).rows[0].id;
    const wsB = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('Owner B', 'owner-b') RETURNING id`)).rows[0].id;
    const userA = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('owner-a@test') RETURNING id`)).rows[0].id;
    const userB = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('owner-b@test') RETURNING id`)).rows[0].id;
    await db.query(`INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`, [wsA, userA, wsB, userB]);
    const contactA = (await db.query<{ id: string }>(`INSERT INTO public.contacts (workspace_id, name) VALUES ($1, 'Contact A') RETURNING id`, [wsA])).rows[0].id;
    const contactB = (await db.query<{ id: string }>(`INSERT INTO public.contacts (workspace_id, name) VALUES ($1, 'Contact B') RETURNING id`, [wsB])).rows[0].id;
    const versionA = (await db.query<{ id: string }>(`INSERT INTO public.ai_agent_versions (workspace_id, agent_id, version_number, system_prompt, created_by) VALUES ($1, 'agent', 1, 'A', $2) RETURNING id`, [wsA, userA])).rows[0].id;
    await expect(db.query(`INSERT INTO public.ai_agent_versions (workspace_id, agent_id, version_number, system_prompt, created_by) VALUES ($1, 'agent', 1, 'bad', $2)`, [wsA, userB])).rejects.toThrow();
    const traceA = (await db.query<{ id: string }>(`INSERT INTO public.ai_agent_traces (workspace_id, agent_id, version_id) VALUES ($1, 'agent', $2) RETURNING id`, [wsA, versionA])).rows[0].id;
    await expect(db.query(`INSERT INTO public.ai_agent_traces (workspace_id, agent_id, version_id) VALUES ($1, 'agent', $2)`, [wsB, versionA])).rejects.toThrow();
    const gateA = (await db.query<{ id: string }>(`INSERT INTO public.ai_agent_approval_gates (workspace_id, trace_id, agent_id, action_type, reason) VALUES ($1, $2, 'agent', 'send', 'review') RETURNING id`, [wsA, traceA])).rows[0].id;
    await expect(db.query(`INSERT INTO public.ai_agent_approval_gates (workspace_id, trace_id, agent_id, action_type, reason) VALUES ($1, $2, 'agent', 'send', 'bad')`, [wsB, traceA])).rejects.toThrow();
    await expect(db.query(`UPDATE public.ai_agent_approval_gates SET reviewed_by = $1 WHERE id = $2`, [userB, gateA])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.ai_agent_evaluations (workspace_id, agent_id, version_id, benchmark_name) VALUES ($1, 'agent', $2, 'bad')`, [wsB, versionA])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.ai_agent_roi_attributions (workspace_id, agent_id, trace_id, contact_id) VALUES ($1, 'agent', $2, $3)`, [wsB, traceA, contactB])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.ai_agent_roi_attributions (workspace_id, agent_id, contact_id) VALUES ($1, 'agent', $2)`, [wsA, contactB])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.ai_agent_trace_steps (trace_id, step_number, step_type) VALUES ($1, 1, 'reasoning')`, [traceA])).resolves.not.toThrow();
    const stepOwner = await db.query<{ workspace_id: string }>(`SELECT t.workspace_id FROM public.ai_agent_trace_steps s JOIN public.ai_agent_traces t ON t.id = s.trace_id WHERE s.trace_id = $1`, [traceA]);
    expect(stepOwner.rows[0].workspace_id).toBe(wsA);

    const security = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname LIKE 'ai_agent_%' AND relkind = 'r'`);
    expect(security.rows).toHaveLength(8);
    expect(security.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const grants = await db.query<{ grantee: string; privilege_type: string }>(`SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('ai_agent_versions', 'ai_agent_traces', 'ai_agent_trace_steps', 'ai_agent_permissions', 'ai_agent_budgets', 'ai_agent_approval_gates', 'ai_agent_evaluations', 'ai_agent_roi_attributions') AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')`);
    expect(grants.rows.filter((row) => row.grantee === 'PUBLIC' || row.grantee === 'anon')).toEqual([]);
    expect([...new Set(grants.rows.filter((row) => row.grantee === 'authenticated').map((row) => row.privilege_type))].sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    expect([...new Set(grants.rows.filter((row) => row.grantee === 'service_role').map((row) => row.privilege_type))].sort()).toEqual(['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
  });
});
