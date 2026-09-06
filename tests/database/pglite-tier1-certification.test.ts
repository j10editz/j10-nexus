import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Tier 1: PostgreSQL Database Certification (PGlite)", () => {
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

    // 3. Setup Contacts, Inbox Threads, Payment Checkouts & Ledger
    await db.exec(`
      CREATE TABLE IF NOT EXISTS public.contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        company TEXT,
        type TEXT DEFAULT 'Lead',
        status TEXT DEFAULT 'New',
        deal_stage TEXT NOT NULL DEFAULT 'lead' CHECK (deal_stage IN ('lead', 'qualified', 'proposal', 'won', 'churned')),
        estimated_value NUMERIC(12,2) DEFAULT 0,
        source TEXT DEFAULT 'whatsapp',
        notes TEXT,
        last_contacted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.inbox_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
        channel TEXT NOT NULL DEFAULT 'whatsapp',
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'active',
        unread_count INTEGER NOT NULL DEFAULT 0,
        last_message_at TIMESTAMPTZ DEFAULT now(),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.inbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        provider TEXT NOT NULL DEFAULT 'whatsapp',
        content TEXT NOT NULL,
        delivery_status TEXT DEFAULT 'delivered',
        message_type TEXT DEFAULT 'text',
        external_message_id TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.payment_checkouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
        thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
        stripe_checkout_session_id TEXT UNIQUE,
        amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
        currency TEXT NOT NULL DEFAULT 'USD',
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'cancelled')),
        checkout_url TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.payment_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        checkout_id UUID REFERENCES public.payment_checkouts(id) ON DELETE SET NULL,
        provider TEXT NOT NULL DEFAULT 'stripe',
        provider_event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'refunded', 'pending')),
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 4. Apply Tier 1 Migration
    const tier1Sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260919_tier1_revenue_loop.sql"),
      "utf8"
    );
    await db.exec(tier1Sql);

    return db;
  }

  it("applies 20260919_tier1_revenue_loop.sql cleanly and idempotently", async () => {
    const db = await setupDatabase();

    // Re-apply migration to guarantee idempotency
    const tier1Sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260919_tier1_revenue_loop.sql"),
      "utf8"
    );
    await expect(db.exec(tier1Sql)).resolves.not.toThrow();

    // Verify crm_proposals and crm_bookings tables exist
    const tablesRes = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('crm_proposals', 'crm_bookings')`
    );
    expect(tablesRes.rows.map((r) => r.table_name)).toContain("crm_proposals");
    expect(tablesRes.rows.map((r) => r.table_name)).toContain("crm_bookings");
  });

  it("enforces proposal status enum constraints and unique proposal numbers per workspace", async () => {
    const db = await setupDatabase();

    // Create workspace
    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Apex Corp', 'apex-corp') RETURNING id`
    );
    const wsId = wsRes.rows[0].id;

    // 1. Valid proposal insertion
    await db.query(`
      INSERT INTO public.crm_proposals (
        workspace_id,
        proposal_number,
        title,
        amount,
        currency,
        status,
        line_items
      ) VALUES (
        $1,
        'PROP-2026-0001',
        'Enterprise AI Workforce Setup',
        2500.00,
        'USD',
        'sent',
        '[{"description": "License", "quantity": 1, "unitPrice": 2500}]'::jsonb
      )
    `, [wsId]);

    // 2. Reject duplicate proposal_number in same workspace
    await expect(
      db.query(`
        INSERT INTO public.crm_proposals (
          workspace_id,
          proposal_number,
          title,
          amount
        ) VALUES ($1, 'PROP-2026-0001', 'Duplicate', 1000)
      `, [wsId])
    ).rejects.toThrow();

    // 3. Reject invalid status
    await expect(
      db.query(`
        INSERT INTO public.crm_proposals (
          workspace_id,
          proposal_number,
          title,
          amount,
          status
        ) VALUES ($1, 'PROP-2026-0002', 'Invalid Status', 1000, 'invalid_status')
      `, [wsId])
    ).rejects.toThrow();

    // 4. Reject negative amount
    await expect(
      db.query(`
        INSERT INTO public.crm_proposals (
          workspace_id,
          proposal_number,
          title,
          amount
        ) VALUES ($1, 'PROP-2026-0003', 'Negative Amount', -50)
      `, [wsId])
    ).rejects.toThrow();
  });

  it("enforces booking type and status constraints on crm_bookings", async () => {
    const db = await setupDatabase();

    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Quantum AI', 'quantum-ai') RETURNING id`
    );
    const wsId = wsRes.rows[0].id;

    // 1. Valid booking insertion
    await db.query(`
      INSERT INTO public.crm_bookings (
        workspace_id,
        title,
        booking_type,
        scheduled_at,
        duration_minutes,
        status
      ) VALUES (
        $1,
        'Executive Demo',
        'executive_walkthrough',
        now() + interval '2 days',
        45,
        'scheduled'
      )
    `, [wsId]);

    // 2. Reject invalid booking type
    await expect(
      db.query(`
        INSERT INTO public.crm_bookings (
          workspace_id,
          title,
          booking_type,
          scheduled_at
        ) VALUES ($1, 'Invalid Type', 'coffee_break', now())
      `, [wsId])
    ).rejects.toThrow();

    // 3. Reject invalid booking status
    await expect(
      db.query(`
        INSERT INTO public.crm_bookings (
          workspace_id,
          title,
          status,
          scheduled_at
        ) VALUES ($1, 'Invalid Status', 'dancing', now())
      `, [wsId])
    ).rejects.toThrow();
  });

  it("cascades deletion cleanly when a workspace is removed without cross-tenant bleed", async () => {
    const db = await setupDatabase();

    // Create Workspace A and Workspace B
    const wsARes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Workspace A', 'ws-a') RETURNING id`
    );
    const wsA = wsARes.rows[0].id;

    const wsBRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ('Workspace B', 'ws-b') RETURNING id`
    );
    const wsB = wsBRes.rows[0].id;

    // Add proposal to Workspace A and B
    await db.query(`
      INSERT INTO public.crm_proposals (workspace_id, proposal_number, title, amount)
      VALUES ($1, 'PROP-A-01', 'Proposal A', 1000)
    `, [wsA]);

    await db.query(`
      INSERT INTO public.crm_proposals (workspace_id, proposal_number, title, amount)
      VALUES ($1, 'PROP-B-01', 'Proposal B', 2000)
    `, [wsB]);

    // Add booking to Workspace A and B
    await db.query(`
      INSERT INTO public.crm_bookings (workspace_id, title, scheduled_at)
      VALUES ($1, 'Booking A', now())
    `, [wsA]);

    await db.query(`
      INSERT INTO public.crm_bookings (workspace_id, title, scheduled_at)
      VALUES ($1, 'Booking B', now())
    `, [wsB]);

    // Delete Workspace A
    await db.query(`DELETE FROM public.workspaces WHERE id = $1`, [wsA]);

    // Verify Workspace A's proposals and bookings are removed
    const propsA = await db.query(`SELECT id FROM public.crm_proposals WHERE workspace_id = $1`, [wsA]);
    expect(propsA.rows.length).toBe(0);

    const booksA = await db.query(`SELECT id FROM public.crm_bookings WHERE workspace_id = $1`, [wsA]);
    expect(booksA.rows.length).toBe(0);

    // Verify Workspace B's records are intact
    const propsB = await db.query(`SELECT id FROM public.crm_proposals WHERE workspace_id = $1`, [wsB]);
    expect(propsB.rows.length).toBe(1);

    const booksB = await db.query(`SELECT id FROM public.crm_bookings WHERE workspace_id = $1`, [wsB]);
    expect(booksB.rows.length).toBe(1);
  });
});
