import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Tier 3: Omnichannel Operations Database Certification (PGlite)", () => {
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

    // 2. Setup Workspaces & Canonical Workspace Memberships
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

      CREATE TABLE IF NOT EXISTS public.workforce_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS public.contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.inbox_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
        channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'website', 'crm')),
        external_thread_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        priority TEXT NOT NULL DEFAULT 'medium',
        unread_count INTEGER NOT NULL DEFAULT 0,
        last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_inbox_threads_workspace_id UNIQUE (workspace_id, id)
      );

      CREATE TABLE IF NOT EXISTS public.inbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
        direction TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'internal',
        external_message_id TEXT,
        content TEXT NOT NULL,
        delivery_status TEXT NOT NULL DEFAULT 'sent',
        message_type TEXT NOT NULL DEFAULT 'text',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_inbox_messages_workspace_id UNIQUE (workspace_id, id)
      );
    `);

    return db;
  }

  it("applies 20260921_tier3_omnichannel_operations.sql cleanly and idempotently", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260921_tier3_omnichannel_operations.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");

    // First execution
    await expect(db.exec(sql)).resolves.not.toThrow();

    // Second execution (proving strict idempotency)
    await expect(db.exec(sql)).resolves.not.toThrow();
  });

  it("enforces expanded 9-channel constraints on inbox_threads", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260921_tier3_omnichannel_operations.sql",
    );
    await db.exec(readFileSync(migrationPath, "utf8"));

    // Create workspace
    const wsRes = await db.query<{ id: string }>(`
      INSERT INTO public.workspaces (name, slug)
      VALUES ('Omni Workspace', 'omni-ws')
      RETURNING id;
    `);
    const wsId = wsRes.rows[0].id;

    // Verify all 9 channels succeed
    const validChannels = [
      "whatsapp",
      "website",
      "crm",
      "email",
      "sms",
      "webchat",
      "instagram",
      "messenger",
      "whatsapp_group",
    ];

    for (const channel of validChannels) {
      await expect(
        db.query(
          `INSERT INTO public.inbox_threads (workspace_id, channel) VALUES ($1, $2);`,
          [wsId, channel],
        ),
      ).resolves.not.toThrow();
    }

    // Invalid channel fails check constraint
    await expect(
      db.query(
        `INSERT INTO public.inbox_threads (workspace_id, channel) VALUES ($1, $2);`,
        [wsId, "carrier_pigeon"],
      ),
    ).rejects.toThrow();
  });

  it("enforces strategy and channel constraints on omnichannel_routing_rules", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260921_tier3_omnichannel_operations.sql",
    );
    await db.exec(readFileSync(migrationPath, "utf8"));

    const wsRes = await db.query<{ id: string }>(`
      INSERT INTO public.workspaces (name, slug)
      VALUES ('Rule Workspace', 'rule-ws')
      RETURNING id;
    `);
    const wsId = wsRes.rows[0].id;

    // Valid rule creation
    await expect(
      db.query(
        `
        INSERT INTO public.omnichannel_routing_rules (
          workspace_id, name, channel, routing_strategy, target_team, priority_order
        ) VALUES ($1, 'VIP Email Rule', 'email', 'round_robin', 'vip_team', 1);
      `,
        [wsId],
      ),
    ).resolves.not.toThrow();

    // Invalid strategy fails
    await expect(
      db.query(
        `
        INSERT INTO public.omnichannel_routing_rules (
          workspace_id, name, channel, routing_strategy
        ) VALUES ($1, 'Bad Rule', 'sms', 'random_guess');
      `,
        [wsId],
      ),
    ).rejects.toThrow();
  });

  it("enforces positive targets and priority constraints on omnichannel_sla_policies", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260921_tier3_omnichannel_operations.sql",
    );
    await db.exec(readFileSync(migrationPath, "utf8"));

    const wsRes = await db.query<{ id: string }>(`
      INSERT INTO public.workspaces (name, slug)
      VALUES ('SLA Workspace', 'sla-ws')
      RETURNING id;
    `);
    const wsId = wsRes.rows[0].id;

    // Valid SLA policy
    await expect(
      db.query(
        `
        INSERT INTO public.omnichannel_sla_policies (
          workspace_id, name, priority, channel, first_response_target_minutes, resolution_target_minutes
        ) VALUES ($1, 'Urgent WhatsApp SLA', 'urgent', 'whatsapp', 5, 30);
      `,
        [wsId],
      ),
    ).resolves.not.toThrow();

    // Non-positive target minutes fails check constraint
    await expect(
      db.query(
        `
        INSERT INTO public.omnichannel_sla_policies (
          workspace_id, name, priority, channel, first_response_target_minutes, resolution_target_minutes
        ) VALUES ($1, 'Invalid Zero SLA', 'urgent', 'whatsapp', 0, 30);
      `,
        [wsId],
      ),
    ).rejects.toThrow();
  });

  it("supports collision lease locking and cascades cleanly on workspace deletion", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260921_tier3_omnichannel_operations.sql",
    );
    await db.exec(readFileSync(migrationPath, "utf8"));

    const wsRes = await db.query<{ id: string }>(`
      INSERT INTO public.workspaces (name, slug)
      VALUES ('Cascade Workspace', 'cascade-ws')
      RETURNING id;
    `);
    const wsId = wsRes.rows[0].id;

    const userRes = await db.query<{ id: string }>(`
      INSERT INTO auth.users (email) VALUES ('operator@j10nexus.ai') RETURNING id;
    `);
    const userId = userRes.rows[0].id;

    const threadRes = await db.query<{ id: string }>(
      `
      INSERT INTO public.inbox_threads (
        workspace_id, channel, locked_by_user_id, locked_at, lock_expires_at, active_viewers
      ) VALUES ($1, 'email', $2, now(), now() + interval '60 seconds', '[{"userId":"op1","action":"typing"}]'::jsonb)
      RETURNING id;
    `,
      [wsId, userId],
    );
    const threadId = threadRes.rows[0].id;

    // Verify lock state is present
    const checkRes = await db.query<{ locked_by_user_id: string }>(
      `SELECT locked_by_user_id FROM public.inbox_threads WHERE id = $1;`,
      [threadId],
    );
    expect(checkRes.rows[0].locked_by_user_id).toBe(userId);

    // Verify cascade deletion
    await db.query(`DELETE FROM public.workspaces WHERE id = $1;`, [wsId]);
    const afterDelete = await db.query(
      `SELECT * FROM public.inbox_threads WHERE id = $1;`,
      [threadId],
    );
    expect(afterDelete.rows.length).toBe(0);
  });

  it("enforces canonical RLS: viewer read-only and suspended member denial on omnichannel tables", async () => {
    const db = await setupDatabase();
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260921_tier3_omnichannel_operations.sql",
    );
    await db.exec(readFileSync(migrationPath, "utf8"));

    // Create workspace
    const ws = (await db.query<{ id: string }>(`
      INSERT INTO public.workspaces (name, slug) VALUES ('Security WS', 'sec-ws') RETURNING id;
    `)).rows[0].id;

    // Create users
    const ownerId = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('owner@sec.com') RETURNING id;`)).rows[0].id;
    const viewerId = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('viewer@sec.com') RETURNING id;`)).rows[0].id;
    const suspendedId = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('suspended@sec.com') RETURNING id;`)).rows[0].id;

    // Add memberships
    await db.query(`
      INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
      VALUES
        ($1, $2, 'owner', 'active'),
        ($1, $3, 'viewer', 'active'),
        ($1, $4, 'agent', 'suspended');
    `, [ws, ownerId, viewerId, suspendedId]);

    // Insert a routing rule as superuser
    const ruleId = (await db.query<{ id: string }>(`
      INSERT INTO public.omnichannel_routing_rules (workspace_id, name, channel, routing_strategy)
      VALUES ($1, 'Support Rule', 'email', 'round_robin') RETURNING id;
    `, [ws])).rows[0].id;

    // 1. Owner can SELECT
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '${ownerId}';`);
      const res = await tx.query(`SELECT id FROM public.omnichannel_routing_rules WHERE workspace_id = $1;`, [ws]);
      expect(res.rows.length).toBe(1);
    });

    // 2. Viewer can SELECT (read-only allowed)
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '${viewerId}';`);
      const res = await tx.query(`SELECT id FROM public.omnichannel_routing_rules WHERE workspace_id = $1;`, [ws]);
      expect(res.rows.length).toBe(1);
    });

    // 3. Viewer CANNOT INSERT/UPDATE/DELETE (mutation denied)
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '${viewerId}';`);
      await expect(tx.query(`
        INSERT INTO public.omnichannel_routing_rules (workspace_id, name, channel, routing_strategy)
        VALUES ($1, 'Hacked Rule', 'email', 'round_robin');
      `, [ws])).rejects.toThrow();
    });

    // 4. Suspended member CANNOT SELECT (denied)
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '${suspendedId}';`);
      const res = await tx.query(`SELECT id FROM public.omnichannel_routing_rules WHERE workspace_id = $1;`, [ws]);
      expect(res.rows.length).toBe(0);
    });
  });

  it("enforces Tier 3 tenant FKs, leases, uniqueness, FORCE RLS, and grants", async () => {
    const db = await setupDatabase();
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260921_tier3_omnichannel_operations.sql"), "utf8");
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(migration).toContain("is_platform_admin(auth.uid())");
    await db.exec(migration);

    const wsA = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('A', 'tier3-a') RETURNING id;`)).rows[0].id;
    const wsB = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('B', 'tier3-b') RETURNING id;`)).rows[0].id;
    const userA = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('a@tier3.test') RETURNING id;`)).rows[0].id;
    const userB = (await db.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('b@tier3.test') RETURNING id;`)).rows[0].id;
    await db.query(`INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner');`, [wsA, userA, wsB, userB]);
    const memberA = (await db.query<{ id: string }>(`INSERT INTO public.workforce_members (workspace_id, name, role) VALUES ($1, 'Member A', 'agent') RETURNING id;`, [wsA])).rows[0].id;
    const memberB = (await db.query<{ id: string }>(`INSERT INTO public.workforce_members (workspace_id, name, role) VALUES ($1, 'Member B', 'agent') RETURNING id;`, [wsB])).rows[0].id;

    const threadA = (await db.query<{ id: string }>(`INSERT INTO public.inbox_threads (workspace_id, channel, assigned_agent_id) VALUES ($1, 'email', $2) RETURNING id;`, [wsA, memberA])).rows[0].id;
    const threadB = (await db.query<{ id: string }>(`INSERT INTO public.inbox_threads (workspace_id, channel) VALUES ($1, 'sms') RETURNING id;`, [wsB])).rows[0].id;
    await expect(db.query(`UPDATE public.inbox_threads SET assigned_agent_id = $1 WHERE id = $2`, [memberB, threadA])).rejects.toThrow();

    const messageA = (await db.query<{ id: string }>(`INSERT INTO public.inbox_messages (workspace_id, thread_id, direction, content) VALUES ($1, $2, 'outbound', 'A') RETURNING id;`, [wsA, threadA])).rows[0].id;
    const messageB = (await db.query<{ id: string }>(`INSERT INTO public.inbox_messages (workspace_id, thread_id, direction, content) VALUES ($1, $2, 'outbound', 'B') RETURNING id;`, [wsB, threadB])).rows[0].id;
    const ruleA = (await db.query<{ id: string }>(`INSERT INTO public.omnichannel_routing_rules (workspace_id, name, channel, routing_strategy, target_user_id, target_agent_id, priority_order) VALUES ($1, 'A rule', 'email', 'direct_assignment', $2, $3, 1) RETURNING id;`, [wsA, userA, memberA])).rows[0].id;
    const ruleB = (await db.query<{ id: string }>(`INSERT INTO public.omnichannel_routing_rules (workspace_id, name, channel, routing_strategy, target_user_id, target_agent_id, priority_order) VALUES ($1, 'B rule', 'email', 'direct_assignment', $2, $3, 1) RETURNING id;`, [wsB, userB, memberB])).rows[0].id;
    const slaA = (await db.query<{ id: string }>(`INSERT INTO public.omnichannel_sla_policies (workspace_id, name, priority, channel, first_response_target_minutes, resolution_target_minutes, is_default) VALUES ($1, 'A SLA', 'urgent', 'email', 5, 30, true) RETURNING id;`, [wsA])).rows[0].id;
    const slaB = (await db.query<{ id: string }>(`INSERT INTO public.omnichannel_sla_policies (workspace_id, name, priority, channel, first_response_target_minutes, resolution_target_minutes, is_default) VALUES ($1, 'B SLA', 'urgent', 'email', 5, 30, true) RETURNING id;`, [wsB])).rows[0].id;

    await expect(db.query(`UPDATE public.inbox_threads SET routing_rule_id = $1, sla_policy_id = $2 WHERE id = $3`, [ruleA, slaA, threadA])).resolves.not.toThrow();
    await expect(db.query(`UPDATE public.inbox_threads SET routing_rule_id = $1 WHERE id = $2`, [ruleB, threadA])).rejects.toThrow();
    await expect(db.query(`UPDATE public.inbox_threads SET sla_policy_id = $1 WHERE id = $2`, [slaB, threadA])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.omnichannel_dispatch_logs (workspace_id, thread_id, message_id, routing_rule_id, sla_policy_id, channel, provider, recipient) VALUES ($1, $2, $3, $4, $5, 'email', 'test', 'a@tier3.test')`, [wsA, threadA, messageA, ruleA, slaA])).resolves.not.toThrow();
    await expect(db.query(`INSERT INTO public.omnichannel_dispatch_logs (workspace_id, thread_id, channel, provider, recipient) VALUES ($1, $2, 'email', 'test', 'x')`, [wsA, threadB])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.omnichannel_dispatch_logs (workspace_id, message_id, channel, provider, recipient) VALUES ($1, $2, 'email', 'test', 'x')`, [wsA, messageB])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.omnichannel_dispatch_logs (workspace_id, routing_rule_id, channel, provider, recipient) VALUES ($1, $2, 'email', 'test', 'x')`, [wsA, ruleB])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.omnichannel_dispatch_logs (workspace_id, sla_policy_id, channel, provider, recipient) VALUES ($1, $2, 'email', 'test', 'x')`, [wsA, slaB])).rejects.toThrow();

    await expect(db.query(`UPDATE public.inbox_threads SET locked_by_user_id = $1 WHERE id = $2`, [userA, threadA])).rejects.toThrow();
    await expect(db.query(`UPDATE public.inbox_threads SET locked_by_user_id = $1, locked_at = now(), lock_expires_at = now() - interval '1 second' WHERE id = $2`, [userA, threadA])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.omnichannel_routing_rules (workspace_id, name, channel, routing_strategy, priority_order) VALUES ($1, 'duplicate', 'email', 'round_robin', 1)`, [wsA])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.omnichannel_sla_policies (workspace_id, name, priority, channel, first_response_target_minutes, resolution_target_minutes, is_default) VALUES ($1, 'duplicate', 'urgent', 'email', 5, 30, true)`, [wsA])).rejects.toThrow();

    const tableSecurity = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('omnichannel_routing_rules', 'omnichannel_sla_policies', 'omnichannel_dispatch_logs') ORDER BY relname;`);
    expect(tableSecurity.rows).toHaveLength(3);
    expect(tableSecurity.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const grants = await db.query<{ table_name: string; grantee: string; privilege_type: string }>(`SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('omnichannel_routing_rules', 'omnichannel_sla_policies', 'omnichannel_dispatch_logs') AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role') ORDER BY table_name, grantee, privilege_type;`);
    expect(grants.rows.filter((row) => row.grantee === 'PUBLIC' || row.grantee === 'anon')).toEqual([]);
    expect([...new Set(grants.rows.filter((row) => row.grantee === 'authenticated').map((row) => row.privilege_type))].sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    expect([...new Set(grants.rows.filter((row) => row.grantee === 'service_role').map((row) => row.privilege_type))].sort()).toEqual(['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']);
    const policies = await db.query<{ qual: string }>(`SELECT qual FROM pg_policies WHERE schemaname = 'public' AND policyname = 'omnichannel_rules_member_select';`);
    expect(policies.rows[0].qual).toContain('is_platform_admin(auth.uid())');
  });
});
