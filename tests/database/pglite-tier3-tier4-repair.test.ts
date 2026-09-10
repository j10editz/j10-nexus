import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Tier 3 & Tier 4 Canonical Authorization & Referential Integrity Repair (PGlite)", () => {
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
        );
      END;
      $$;

      -- Tier 3 uses the production-canonical one-argument helper; the legacy
      -- zero-argument fixture above remains for the later Tier 4 fixture.
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
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_contacts_workspace_id UNIQUE (workspace_id, id)
      );

      CREATE TABLE IF NOT EXISTS public.inbox_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
        channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'website', 'crm')),
        assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_inbox_threads_workspace_id UNIQUE (workspace_id, id)
      );

      CREATE TABLE IF NOT EXISTS public.inbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
        direction TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_inbox_messages_workspace_id UNIQUE (workspace_id, id)
      );
    `);

    // Apply Tier 3 and Tier 4 schema
    const tier3Path = resolve(process.cwd(), "supabase/migrations/20260921_tier3_omnichannel_operations.sql");
    const tier4Path = resolve(process.cwd(), "supabase/migrations/20260922_tier4_governed_ai_agent_platform.sql");
    await db.exec(readFileSync(tier3Path, "utf8"));
    await db.exec(readFileSync(tier4Path, "utf8"));

    return db;
  }

  it("applies 20260923 repair migration cleanly and idempotently", async () => {
    const db = await setupDatabase();
    const repairPath = resolve(process.cwd(), "supabase/migrations/20260923_canonical_authorization_and_cross_tenant_integrity_repair.sql");
    const sql = readFileSync(repairPath, "utf8");

    // First execution
    await expect(db.exec(sql)).resolves.not.toThrow();

    // Second execution proving idempotency
    await expect(db.exec(sql)).resolves.not.toThrow();
  });

  it("enforces cross-tenant composite integrity constraints on traces and approval gates", async () => {
    const db = await setupDatabase();
    const repairPath = resolve(process.cwd(), "supabase/migrations/20260923_canonical_authorization_and_cross_tenant_integrity_repair.sql");
    await db.exec(readFileSync(repairPath, "utf8"));

    const wsA = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('WS Alpha', 'alpha') RETURNING id;`)).rows[0].id;
    const wsB = (await db.query<{ id: string }>(`INSERT INTO public.workspaces (name, slug) VALUES ('WS Beta', 'beta') RETURNING id;`)).rows[0].id;

    const verA = (await db.query<{ id: string }>(`
      INSERT INTO public.ai_agent_versions (workspace_id, agent_id, version_number, system_prompt)
      VALUES ($1, 'agent-1', 1, 'Prompt A') RETURNING id;
    `, [wsA])).rows[0].id;

    // Cross-tenant trace creation fails
    await expect(db.query(`
      INSERT INTO public.ai_agent_traces (workspace_id, agent_id, version_id)
      VALUES ($1, 'agent-1', $2);
    `, [wsB, verA])).rejects.toThrow();

    // Same-workspace trace succeeds
    const traceA = (await db.query<{ id: string }>(`
      INSERT INTO public.ai_agent_traces (workspace_id, agent_id, version_id)
      VALUES ($1, 'agent-1', $2) RETURNING id;
    `, [wsA, verA])).rows[0].id;

    // Cross-tenant approval gate creation fails
    await expect(db.query(`
      INSERT INTO public.ai_agent_approval_gates (workspace_id, trace_id, agent_id, action_type, reason)
      VALUES ($1, $2, 'agent-1', 'send_message', 'Requires approval');
    `, [wsB, traceA])).rejects.toThrow();

    // Same-workspace approval gate succeeds
    await expect(db.query(`
      INSERT INTO public.ai_agent_approval_gates (workspace_id, trace_id, agent_id, action_type, reason)
      VALUES ($1, $2, 'agent-1', 'send_message', 'Requires approval');
    `, [wsA, traceA])).resolves.not.toThrow();
  });
});
