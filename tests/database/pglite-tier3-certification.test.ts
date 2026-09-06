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

    // 2. Setup Workspaces & Users
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

      CREATE TABLE IF NOT EXISTS public.workforce_agents (
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
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
});
