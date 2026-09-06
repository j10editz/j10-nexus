import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Tier 2: PostgreSQL Database Certification (PGlite)", () => {
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
        workspace_type TEXT NOT NULL DEFAULT 'client' CHECK (workspace_type IN ('agency_master', 'client')),
        plan TEXT DEFAULT 'growth',
        status TEXT DEFAULT 'active',
        brand_name TEXT NOT NULL DEFAULT 'J10 NEXUS',
        accent_color TEXT NOT NULL DEFAULT '#3B82F6',
        owner_user_id UUID REFERENCES auth.users(id),
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
      LANGUAGE sql
      STABLE
      AS $$ SELECT false; $$;
    `);

    // 3. Apply Tier 2 Migration
    const tier2Sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260920_tier2_agency_commercialization.sql"),
      "utf8"
    );
    await db.exec(tier2Sql);

    return db;
  }

  it("applies 20260920_tier2_agency_commercialization.sql cleanly and idempotently", async () => {
    const db = await setupDatabase();

    // Re-apply migration to prove idempotency
    const tier2Sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260920_tier2_agency_commercialization.sql"),
      "utf8"
    );
    await expect(db.exec(tier2Sql)).resolves.not.toThrow();

    // Verify workspace_domains and workspace_templates tables exist
    const tablesRes = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('workspace_domains', 'workspace_templates')`
    );
    expect(tablesRes.rows.map((r) => r.table_name)).toContain("workspace_domains");
    expect(tablesRes.rows.map((r) => r.table_name)).toContain("workspace_templates");
  });

  it("verifies that 5 core industry vertical blueprints are seeded into workspace_templates", async () => {
    const db = await setupDatabase();

    const tmplRes = await db.query<{ slug: string; vertical: string; name: string }>(
      `SELECT slug, vertical, name FROM public.workspace_templates ORDER BY slug`
    );

    const slugs = tmplRes.rows.map((r) => r.slug);
    expect(slugs).toContain("real-estate-brokerage");
    expect(slugs).toContain("solar-energy-residential");
    expect(slugs).toContain("legal-services-corporate");
    expect(slugs).toContain("healthcare-clinic-aesthetics");
    expect(slugs).toContain("ecommerce-dtc-brand");
  });

  it("enforces domain uniqueness and domain status constraints", async () => {
    const db = await setupDatabase();

    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Apex Agency', 'apex-agency') RETURNING id`
    );
    const wsId = wsRes.rows[0].id;

    // 1. Register domain
    await db.query(`
      INSERT INTO public.workspace_domains (
        workspace_id,
        domain,
        verification_token,
        status
      ) VALUES ($1, 'portal.apexagency.com', 'tok_123', 'pending')
    `, [wsId]);

    // 2. Reject duplicate domain
    await expect(
      db.query(`
        INSERT INTO public.workspace_domains (
          workspace_id,
          domain,
          verification_token
        ) VALUES ($1, 'portal.apexagency.com', 'tok_456')
      `, [wsId])
    ).rejects.toThrow();

    // 3. Reject invalid domain status
    await expect(
      db.query(`
        INSERT INTO public.workspace_domains (
          workspace_id,
          domain,
          verification_token,
          status
        ) VALUES ($1, 'invalid.apexagency.com', 'tok_789', 'magical')
      `, [wsId])
    ).rejects.toThrow();
  });

  it("links client workspaces to agency master and handles null on master deletion", async () => {
    const db = await setupDatabase();

    // Create Agency Master
    const agencyRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, workspace_type) VALUES ('Master Agency', 'master-agency', 'agency_master') RETURNING id`
    );
    const agencyId = agencyRes.rows[0].id;

    // Create Client Workspace under Agency Master
    const clientRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (
        name,
        slug,
        workspace_type,
        agency_master_id,
        billing_mode,
        client_tier
      ) VALUES ('Client Solar', 'client-solar', 'client', $1, 'agency_funded', 'pro') RETURNING id`,
      [agencyId]
    );
    const clientId = clientRes.rows[0].id;

    // Verify link
    const checkRes = await db.query<{ agency_master_id: string; billing_mode: string }>(
      `SELECT agency_master_id, billing_mode FROM public.workspaces WHERE id = $1`,
      [clientId]
    );
    expect(checkRes.rows[0].agency_master_id).toBe(agencyId);
    expect(checkRes.rows[0].billing_mode).toBe("agency_funded");

    // Delete Agency Master
    await db.query(`DELETE FROM public.workspaces WHERE id = $1`, [agencyId]);

    // Client workspace still exists, but agency_master_id is set to NULL
    const postRes = await db.query<{ agency_master_id: string | null }>(
      `SELECT agency_master_id FROM public.workspaces WHERE id = $1`,
      [clientId]
    );
    expect(postRes.rows.length).toBe(1);
    expect(postRes.rows[0].agency_master_id).toBeNull();
  });
});
