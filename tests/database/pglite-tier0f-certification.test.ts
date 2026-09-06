import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import {
  verifyStripeWebhookSignature,
  processStripeSubscriptionEvent,
  STRIPE_PRICE_ALLOWLIST,
} from "@/lib/billing/stripe-webhook";
import {
  createAutomationBridgeCookieHeader,
  readAutomationBridgeIdentity,
  setAutomationBridgeServiceClientFactory,
} from "@/lib/automation/bridge-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createIntegrationConnection } from "@/lib/integrations/database";
import { POST as j10AiTestPost } from "@/app/api/j10-ai/test/route";
import { NextRequest } from "next/server";
import { POST as continuePost } from "@/app/api/automation-runs/[runId]/continue/route";

export type QueryLog = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  filters: Record<string, unknown>;
  sql: string;
  params: unknown[];
  rowCount: number;
};

export function createPgliteSupabaseAdapter(
  db: PGlite,
  queryLog?: QueryLog[]
) {
  return {
    auth: {
      admin: {
        getUserById: async (userId: string) => {
          const res = await db.query<{ id: string; email: string; created_at: string }>(
            "SELECT id, email, created_at FROM auth.users WHERE id = $1",
            [userId]
          );
          if (res.rows.length === 0) {
            return { data: { user: null }, error: new Error("User not found") };
          }
          const u = res.rows[0];
          return {
            data: {
              user: {
                id: u.id,
                email: u.email,
                app_metadata: {},
                user_metadata: {},
                aud: "authenticated",
                created_at: u.created_at,
              },
            },
            error: null,
          };
        },
      },
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: (table: string) => {
      let op: "select" | "insert" | "update" | "delete" = "select";
      let insertValues: Record<string, unknown> | Record<string, unknown>[] | null = null;
      let updateValues: Record<string, unknown> | null = null;
      const filters: { col: string; op: string; val: unknown }[] = [];
      let orderClause: string | null = null;
      let limitCount: number | null = null;
      let isSingle = false;
      let isMaybeSingle = false;

      const builder = {
        select: () => builder,
        insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
          op = "insert";
          insertValues = values;
          return builder;
        },
        update: (values: Record<string, unknown>) => {
          op = "update";
          updateValues = values;
          return builder;
        },
        delete: () => {
          op = "delete";
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filters.push({ col, op: "=", val });
          return builder;
        },
        neq: (col: string, val: unknown) => {
          filters.push({ col, op: "!=", val });
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          filters.push({ col, op: "IN", val: vals });
          return builder;
        },
        gte: (col: string, val: unknown) => {
          filters.push({ col, op: ">=", val });
          return builder;
        },
        lte: (col: string, val: unknown) => {
          filters.push({ col, op: "<=", val });
          return builder;
        },
        order: (col: string, options?: { ascending?: boolean }) => {
          orderClause = `"${col}" ${options?.ascending === false ? "DESC" : "ASC"}`;
          return builder;
        },
        limit: (count: number) => {
          limitCount = count;
          return builder;
        },
        single: () => {
          isSingle = true;
          return builder;
        },
        maybeSingle: () => {
          isMaybeSingle = true;
          return builder;
        },
        execute: async () => {
          let sql = "";
          const params: unknown[] = [];

          if (op === "select") {
            sql = `SELECT * FROM public."${table}"`;
            if (filters.length > 0) {
              const whereClauses: string[] = [];
              for (const f of filters) {
                if (f.op === "IN") {
                  const inVals = Array.isArray(f.val) ? f.val : [f.val];
                  if (inVals.length === 0) {
                    whereClauses.push("false");
                  } else {
                    const inPlaceholders: string[] = [];
                    for (const v of inVals) {
                      inPlaceholders.push(`$${params.length + 1}`);
                      params.push(v);
                    }
                    whereClauses.push(`"${f.col}" IN (${inPlaceholders.join(", ")})`);
                  }
                } else {
                  whereClauses.push(`"${f.col}" ${f.op} $${params.length + 1}`);
                  params.push(f.val);
                }
              }
              sql += ` WHERE ${whereClauses.join(" AND ")}`;
            }
            if (orderClause) {
              sql += ` ORDER BY ${orderClause}`;
            }
            if (limitCount !== null) {
              sql += ` LIMIT ${limitCount}`;
            }
          } else if (op === "insert") {
            const rowsToInsert = Array.isArray(insertValues) ? insertValues : [insertValues ?? {}];
            if (rowsToInsert.length === 0) {
              return { data: [], error: null };
            }
            const keys = Object.keys(rowsToInsert[0]);
            const cols = keys.map((k) => `"${k}"`).join(", ");
            const rowPlaceholders: string[] = [];
            for (const row of rowsToInsert) {
              const placeholders: string[] = [];
              for (const k of keys) {
                const v = row[k];
                placeholders.push(`$${params.length + 1}`);
                if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                  params.push(JSON.stringify(v));
                } else {
                  params.push(v);
                }
              }
              rowPlaceholders.push(`(${placeholders.join(", ")})`);
            }
            sql = `INSERT INTO public."${table}" (${cols}) VALUES ${rowPlaceholders.join(", ")} RETURNING *`;
          } else if (op === "update") {
            const keys = Object.keys(updateValues ?? {});
            const setClauses: string[] = [];
            for (const k of keys) {
              const v = (updateValues as Record<string, unknown>)[k];
              setClauses.push(`"${k}" = $${params.length + 1}`);
              if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                params.push(JSON.stringify(v));
              } else {
                params.push(v);
              }
            }
            sql = `UPDATE public."${table}" SET ${setClauses.join(", ")}`;
            if (filters.length > 0) {
              const whereClauses: string[] = [];
              for (const f of filters) {
                if (f.op === "IN") {
                  const inVals = Array.isArray(f.val) ? f.val : [f.val];
                  if (inVals.length === 0) {
                    whereClauses.push("false");
                  } else {
                    const inPlaceholders: string[] = [];
                    for (const v of inVals) {
                      inPlaceholders.push(`$${params.length + 1}`);
                      params.push(v);
                    }
                    whereClauses.push(`"${f.col}" IN (${inPlaceholders.join(", ")})`);
                  }
                } else {
                  whereClauses.push(`"${f.col}" ${f.op} $${params.length + 1}`);
                  params.push(f.val);
                }
              }
              sql += ` WHERE ${whereClauses.join(" AND ")}`;
            }
            sql += ` RETURNING *`;
          }

          try {
            const res = await db.query(sql, params);
            const rows = res.rows as Record<string, unknown>[];

            if (queryLog) {
              queryLog.push({
                table,
                op,
                filters: Object.fromEntries(filters.map((f) => [f.col, f.val])),
                sql,
                params,
                rowCount: rows.length,
              });
            }

            if (isSingle) {
              if (rows.length === 0) {
                return { data: null, error: { message: "No rows returned", code: "PGRST116" } };
              }
              return { data: rows[0], error: null };
            }
            if (isMaybeSingle) {
              return { data: rows[0] ?? null, error: null };
            }
            return { data: rows, error: null };
          } catch (err: unknown) {
            const errObj = err as { message?: string; code?: string };
            if (queryLog) {
              queryLog.push({
                table,
                op,
                filters: Object.fromEntries(filters.map((f) => [f.col, f.val])),
                sql,
                params,
                rowCount: 0,
              });
            }
            return {
              data: null,
              error: {
                message: errObj?.message ?? "Database query error",
                code: errObj?.code ?? "UNKNOWN",
              },
            };
          }
        },
        then: <TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) => {
          return builder.execute().then(onfulfilled, onrejected);
        },
      };

      return builder;
    },
  };
}

describe("Tier 0F PostgreSQL Database Certification (PGlite)", () => {
  const migrationSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260917_tier0f_runtime_tenant_certification.sql"),
    "utf8"
  );

  async function createBaselineDb(): Promise<PGlite> {
    const db = new PGlite();

    // Enable roles and schemas
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
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

      -- Core workspace tables
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

      CREATE TABLE IF NOT EXISTS public.platform_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_platform_role UNIQUE (user_id, role)
      );

      CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL DEFAULT 'starter' CHECK (plan_id IN ('starter', 'growth', 'enterprise')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'none')),
        monthly_message_limit INT NOT NULL DEFAULT 1000 CHECK (monthly_message_limit >= 0),
        messages_used_this_period INT NOT NULL DEFAULT 0 CHECK (messages_used_this_period >= 0),
        current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
        current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
        grace_period_end TIMESTAMPTZ,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_ws_sub UNIQUE (workspace_id)
      );

      CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.workspace_memberships
          WHERE workspace_id = target_workspace_id
            AND user_id = auth.uid()
            AND status = 'active'
        );
      $$;

      CREATE OR REPLACE FUNCTION public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
      RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.workspace_memberships
          WHERE workspace_id = target_workspace_id
            AND user_id = auth.uid()
            AND status = 'active'
            AND role = ANY(allowed_roles)
        );
      $$;

      ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "memberships_select_member" ON public.workspace_memberships;
      CREATE POLICY "memberships_select_member" ON public.workspace_memberships
        FOR SELECT TO authenticated
        USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id));
      DROP POLICY IF EXISTS "memberships_insert_privileged" ON public.workspace_memberships;
      CREATE POLICY "memberships_insert_privileged" ON public.workspace_memberships
        FOR INSERT TO authenticated
        WITH CHECK (
          public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
          OR (
            NOT EXISTS (SELECT 1 FROM public.workspace_memberships wm WHERE wm.workspace_id = workspace_id)
            AND user_id = auth.uid()
            AND role = 'owner'
          )
        );

      ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "workspace_subscriptions_select_member" ON public.workspace_subscriptions;
      CREATE POLICY "workspace_subscriptions_select_member" ON public.workspace_subscriptions
        FOR SELECT TO authenticated
        USING (public.is_workspace_member(workspace_id));
      DROP POLICY IF EXISTS "workspace_subscriptions_service_role_all" ON public.workspace_subscriptions;
      CREATE POLICY "workspace_subscriptions_service_role_all" ON public.workspace_subscriptions
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);

      CREATE TABLE IF NOT EXISTS public.contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        source TEXT,
        deal_stage TEXT DEFAULT 'lead',
        estimated_value NUMERIC(10,2) DEFAULT 0.00,
        assigned_user_id UUID REFERENCES auth.users(id),
        last_contact_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.crm_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id),
        first_name TEXT,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        company TEXT,
        job_title TEXT,
        type TEXT DEFAULT 'Lead',
        status TEXT DEFAULT 'New',
        source TEXT DEFAULT 'crm',
        estimated_value NUMERIC(10,2) DEFAULT 0.00,
        notes TEXT,
        last_contacted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "webhook_events_select_member" ON public.webhook_events;
      CREATE POLICY "webhook_events_select_member" ON public.webhook_events
        FOR SELECT TO authenticated
        USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));
      DROP POLICY IF EXISTS "webhook_events_service_role_all" ON public.webhook_events;
      CREATE POLICY "webhook_events_service_role_all" ON public.webhook_events
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);

      CREATE TABLE IF NOT EXISTS public.inbox_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
        channel TEXT NOT NULL DEFAULT 'website',
        status TEXT NOT NULL DEFAULT 'active',
        priority TEXT NOT NULL DEFAULT 'medium',
        unread_count INT NOT NULL DEFAULT 0,
        last_message_at TIMESTAMPTZ DEFAULT now(),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.inbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        thread_id UUID NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
        direction TEXT NOT NULL DEFAULT 'inbound',
        provider TEXT NOT NULL DEFAULT 'website',
        content TEXT NOT NULL,
        delivery_status TEXT NOT NULL DEFAULT 'delivered',
        message_type TEXT NOT NULL DEFAULT 'text',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.website_funnels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT false,
        primary_cta_link TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT uq_funnel_ws_slug UNIQUE (workspace_id, slug)
      );

      CREATE TABLE IF NOT EXISTS public.integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id),
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        environment TEXT NOT NULL DEFAULT 'development',
        account_label TEXT,
        credential_reference TEXT,
        external_account_id TEXT,
        external_account_label TEXT,
        granted_scopes TEXT[] DEFAULT '{}'::TEXT[],
        enabled_capabilities TEXT[] DEFAULT '{}'::TEXT[],
        public_configuration JSONB DEFAULT '{}'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        connected_at TIMESTAMPTZ,
        last_health_check_at TIMESTAMPTZ,
        last_error_code TEXT,
        last_error_message TEXT,
        status_reason TEXT,
        status_metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
        encrypted_payload TEXT NOT NULL,
        initialization_vector TEXT NOT NULL,
        authentication_tag TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        key_version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_webhook_endpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        endpoint_key UUID NOT NULL DEFAULT gen_random_uuid(),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        endpoint_id UUID NOT NULL REFERENCES public.integration_webhook_endpoints(id) ON DELETE CASCADE,
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        request_id UUID NOT NULL DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL,
        replay_key TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        signature_status TEXT NOT NULL DEFAULT 'valid',
        payload_sha256 TEXT NOT NULL DEFAULT 'none',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_action_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'live',
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_operation_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        source TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        status TEXT NOT NULL DEFAULT 'success',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_provider_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'webhook',
        mode TEXT NOT NULL DEFAULT 'push',
        state TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.integration_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        previous_status TEXT,
        next_status TEXT NOT NULL,
        reason TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.commerce_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.commerce_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        order_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.finance_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        invoice_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.company_knowledge_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.workforce_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.automations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        successful_executions INT DEFAULT 0,
        failed_executions INT DEFAULT 0,
        awaiting_approval_executions INT DEFAULT 0,
        last_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.automation_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        version_number INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.automation_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id),
        automation_version_id UUID,
        graph_snapshot JSONB,
        trigger_type TEXT DEFAULT 'manual',
        trigger_payload JSONB DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'queued',
        current_step_order INT DEFAULT 1,
        result_summary TEXT,
        error_message TEXT,
        execution_mode TEXT DEFAULT 'live',
        api_called BOOLEAN DEFAULT false,
        total_cost_usd NUMERIC(10,4) DEFAULT 0,
        started_at TIMESTAMPTZ DEFAULT now(),
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.automation_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
        step_order INT NOT NULL,
        name TEXT,
        step_type TEXT NOT NULL DEFAULT 'action',
        action_type TEXT,
        employee_id UUID,
        employee_name TEXT,
        task_type TEXT,
        instructions TEXT,
        config JSONB DEFAULT '{}'::jsonb,
        requires_approval BOOLEAN DEFAULT false,
        approval_type TEXT,
        is_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.automation_run_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
        automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
        automation_step_id UUID,
        automation_version_id UUID,
        graph_node_id TEXT,
        user_id UUID REFERENCES auth.users(id),
        step_order INT NOT NULL,
        step_type TEXT NOT NULL DEFAULT 'action',
        action_type TEXT,
        employee_id UUID,
        employee_name TEXT,
        ai_task_id UUID,
        status TEXT NOT NULL DEFAULT 'queued',
        requires_approval BOOLEAN DEFAULT false,
        approval_status TEXT NOT NULL DEFAULT 'not_required',
        input_payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.ai_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id),
        action TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Grants for authenticated role
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA auth TO authenticated;
    `);

    return db;
  }

  it("1. Apply repaired 20260917 twice: proves idempotency, founder internal grant, unverified de-entitlement, and CRM preservation", async () => {
    const db = await createBaselineDb();

    // 1. Seed users: founder, client (non-founder owner), secondary viewer
    const userRes = await db.query<{ id: string; email: string }>(
      `INSERT INTO auth.users (email) VALUES
       ('founder@j10.test'),
       ('client@j10.test'),
       ('viewer@j10.test')
       RETURNING id, email`
    );
    const founderId = userRes.rows.find((u) => u.email === "founder@j10.test")!.id;
    const clientId = userRes.rows.find((u) => u.email === "client@j10.test")!.id;
    const viewerId = userRes.rows.find((u) => u.email === "viewer@j10.test")!.id;

    // Platform founder role in platform_roles
    await db.query(
      "INSERT INTO public.platform_roles (user_id, role) VALUES ($1, 'platform_founder')",
      [founderId]
    );

    // 2. Workspaces: Founder HQ (founder-owned) and Client Org (non-founder)
    const wsRes = await db.query<{ id: string; slug: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id)
       VALUES ('Founder HQ', 'founder-hq', $1), ('Client Org', 'client-org', $2)
       RETURNING id, slug`,
      [founderId, clientId]
    );
    const founderWsId = wsRes.rows.find((w) => w.slug === "founder-hq")!.id;
    const clientWsId = wsRes.rows.find((w) => w.slug === "client-org")!.id;

    // 3. Memberships:
    // - Founder owner membership in Founder HQ
    // - Client owner membership in Client Org
    // - Secondary viewer membership in Client Org
    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($3, $4, 'owner', 'active'),
       ($3, $5, 'viewer', 'active')`,
      [founderWsId, founderId, clientWsId, clientId, viewerId]
    );

    // 4. Subscriptions:
    // - Founder active subscription without Stripe ID (will receive internal_grant)
    // - Client active unverified subscription without Stripe ID (will become non-entitled: provenance='none', status='none')
    await db.query(
      `INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, monthly_message_limit)
       VALUES ($1, 'growth', 'active', 100000), ($2, 'starter', 'active', 5000)`,
      [founderWsId, clientWsId]
    );

    // 5. CRM records with non-null fields
    // Canonical contacts row in founder workspace
    await db.query(
      `INSERT INTO public.contacts (
         workspace_id, name, email, phone, company, deal_stage, estimated_value
       ) VALUES ($1, 'George Washington', 'george@mountvernon.org', '+17035550100', 'Mount Vernon', 'lead', 50000.00)`,
      [founderWsId]
    );

    // Legacy crm_contacts row in client workspace
    await db.query(
      `INSERT INTO public.crm_contacts (
         workspace_id, first_name, last_name, email, phone, company, job_title, type, status, estimated_value, notes
       ) VALUES ($1, 'Alexander', 'Hamilton', 'alex@treasury.gov', '+12125550100', 'Treasury Corp', 'Secretary', 'Lead', 'Qualified', 75000.00, 'VIP Founding Note')`,
      [clientWsId]
    );

    // Execute the complete migration twice
    await expect(db.exec(migrationSql)).resolves.not.toThrow();
    await expect(db.exec(migrationSql)).resolves.not.toThrow();

    // Prove 1: Founder ownership and membership remain unchanged
    const founderWs = await db.query<{ owner_user_id: string }>(
      "SELECT owner_user_id FROM public.workspaces WHERE id = $1",
      [founderWsId]
    );
    expect(founderWs.rows[0].owner_user_id).toBe(founderId);

    const founderMem = await db.query<{ role: string; status: string }>(
      "SELECT role, status FROM public.workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
      [founderWsId, founderId]
    );
    expect(founderMem.rows[0].role).toBe("owner");
    expect(founderMem.rows[0].status).toBe("active");

    // Prove 2: Secondary viewer membership is preserved
    const viewerMem = await db.query<{ role: string; status: string }>(
      "SELECT role, status FROM public.workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
      [clientWsId, viewerId]
    );
    expect(viewerMem.rows[0].role).toBe("viewer");
    expect(viewerMem.rows[0].status).toBe("active");

    // Prove 3: Founder subscription receives internal_grant and remains active
    const founderSub = await db.query<{ provenance: string; status: string; plan_id: string }>(
      "SELECT provenance, status, plan_id FROM public.workspace_subscriptions WHERE workspace_id = $1",
      [founderWsId]
    );
    expect(founderSub.rows[0].provenance).toBe("internal_grant");
    expect(founderSub.rows[0].status).toBe("active");

    // Prove 4: Unverified subscription becomes non-entitled (provenance='none', status='none')
    const clientSub = await db.query<{ provenance: string; status: string; plan_id: string }>(
      "SELECT provenance, status, plan_id FROM public.workspace_subscriptions WHERE workspace_id = $1",
      [clientWsId]
    );
    expect(clientSub.rows[0].provenance).toBe("none");
    expect(clientSub.rows[0].status).toBe("none");

    // Prove 5: CRM records and non-null fields are preserved
    const contactsRes = await db.query<{
      name: string;
      email: string;
      phone: string;
      company: string;
      estimated_value: number;
      notes?: string;
    }>(
      "SELECT name, email, phone, company, estimated_value, notes FROM public.contacts ORDER BY name"
    );
    expect(contactsRes.rows.length).toBe(2);

    const alex = contactsRes.rows.find((c) => c.email === "alex@treasury.gov");
    expect(alex).toBeDefined();
    expect(alex?.name).toBe("Alexander Hamilton");
    expect(alex?.phone).toBe("+12125550100");
    expect(alex?.company).toBe("Treasury Corp");
    expect(alex?.notes).toBe("VIP Founding Note");
    expect(Number(alex?.estimated_value)).toBe(75000.00);

    const george = contactsRes.rows.find((c) => c.email === "george@mountvernon.org");
    expect(george).toBeDefined();
    expect(george?.phone).toBe("+17035550100");
    expect(george?.company).toBe("Mount Vernon");
    expect(Number(george?.estimated_value)).toBe(50000.00);

    // Archive table preserved
    const archiveRes = await db.query<{ first_name: string; phone: string; company: string }>(
      "SELECT first_name, phone, company FROM public.crm_contacts_legacy_archive_tier0f WHERE email = 'alex@treasury.gov'"
    );
    expect(archiveRes.rows.length).toBe(1);
    expect(archiveRes.rows[0].first_name).toBe("Alexander");
    expect(archiveRes.rows[0].phone).toBe("+12125550100");
    expect(archiveRes.rows[0].company).toBe("Treasury Corp");
  });

  it("2. Apply it a second time successfully (idempotency)", async () => {
    const db = await createBaselineDb();

    // Insert user & workspace
    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('idempotency@j10.test') RETURNING id"
    );
    const userId = userRes.rows[0].id;
    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Idem HQ', 'idem-hq', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;
    await db.query(
      "INSERT INTO public.workspace_subscriptions (workspace_id, status) VALUES ($1, 'active')",
      [wsId]
    );

    // Run 1
    await db.exec(migrationSql);

    // Run 2: must succeed without error
    await expect(db.exec(migrationSql)).resolves.not.toThrow();
  });

  it("3. Test documented pre-existing webhook policy transition and idempotent rerun", async () => {
    const db = await createBaselineDb();

    // Baseline starts with documented pre-existing webhook policies from 20260913:
    // - "webhook_events_select_member" USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
    // - "webhook_events_service_role_all" USING (auth.role() = 'service_role')
    // We also test if webhook_events_tenant_select already exists before migration:
    await db.exec(`
      DROP POLICY IF EXISTS "webhook_events_tenant_select" ON public.webhook_events;
      CREATE POLICY "webhook_events_tenant_select" ON public.webhook_events FOR SELECT
        TO authenticated USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id));
    `);

    // Applying migration must tolerate it and succeed
    await expect(db.exec(migrationSql)).resolves.not.toThrow();

    // Verify security assertion: no SELECT policy permits NULL workspace_id
    const policies = await db.query<{ policyname: string; qual: string }>(
      `SELECT policyname, qual FROM pg_policies
       WHERE tablename = 'webhook_events' AND cmd = 'SELECT'`
    );
    expect(policies.rows.length).toBeGreaterThan(0);
    for (const pol of policies.rows) {
      expect(pol.qual).not.toContain("workspace_id IS NULL");
    }

    // Applying migration a second time succeeds idempotently
    await expect(db.exec(migrationSql)).resolves.not.toThrow();
  });

  it("4. Confirm provenance exists and has the correct constraint", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('prov_test@j10.test') RETURNING id"
    );
    const userId = userRes.rows[0].id;
    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Prov WS', 'prov-ws', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    // Check column exists
    const colRes = await db.query(
      `SELECT column_name, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'workspace_subscriptions' AND column_name = 'provenance'`
    );
    expect(colRes.rows.length).toBe(1);

    // Allowed provenance values: stripe, trial, internal_grant, none
    for (const prov of ["stripe", "trial", "internal_grant", "none"]) {
      const subWs = await db.query<{ id: string }>(
        `INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
        [`WS ${prov}`, `ws-${prov}-${Date.now()}`, userId]
      );
      await expect(
        db.query(
          `INSERT INTO public.workspace_subscriptions (workspace_id, status, provenance) VALUES ($1, 'active', $2)`,
          [subWs.rows[0].id, prov]
        )
      ).resolves.not.toThrow();
    }

    // Disallowed provenance value fails CHECK constraint
    await expect(
      db.query(
        `INSERT INTO public.workspace_subscriptions (workspace_id, status, provenance) VALUES ($1, 'active', 'fraudulent_grant')`,
        [wsId]
      )
    ).rejects.toThrow(/chk_workspace_subscriptions_provenance/);
  });

  it("5. Confirm Stripe provenance is preserved", async () => {
    const db = await createBaselineDb();

    const uRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('stripe_user@j10.test') RETURNING id"
    );
    const userId = uRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Stripe WS', 'stripe-ws', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    // Existing Stripe subscription
    await db.query(
      `INSERT INTO public.workspace_subscriptions (workspace_id, status, stripe_customer_id, stripe_subscription_id)
       VALUES ($1, 'active', 'cus_12345', 'sub_12345')`,
      [wsId]
    );

    // Apply migration (which backfills provenance)
    await db.exec(migrationSql);

    const sub = await db.query<{ provenance: string; status: string }>(
      "SELECT provenance, status FROM public.workspace_subscriptions WHERE workspace_id = $1",
      [wsId]
    );

    expect(sub.rows[0].provenance).toBe("stripe");
    expect(sub.rows[0].status).toBe("active");

    // Re-running provenance backfill logic preserves 'stripe'
    await db.query(
      `UPDATE public.workspace_subscriptions
       SET provenance = 'none'
       WHERE provenance IS NULL`
    );

    const subAfter = await db.query<{ provenance: string }>(
      "SELECT provenance FROM public.workspace_subscriptions WHERE workspace_id = $1",
      [wsId]
    );
    expect(subAfter.rows[0].provenance).toBe("stripe");
  });

  it("6. Confirm CRM row and field preservation", async () => {
    const db = await createBaselineDb();

    const uRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('crm_test@j10.test') RETURNING id"
    );
    const userId = uRes.rows[0].id;
    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('CRM WS', 'crm-ws', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    // Seed legacy crm_contacts with distinct fields
    await db.query(
      `INSERT INTO public.crm_contacts (
         workspace_id, first_name, last_name, email, phone, company, job_title, type, status, estimated_value, notes
       ) VALUES ($1, 'Alexander', 'Hamilton', 'alex@treasury.gov', '+12125550100', 'Treasury Corp', 'Secretary', 'Lead', 'Qualified', 50000.00, 'VIP Founding Partner')`,
      [wsId]
    );

    // Also seed canonical contacts with an existing contact
    await db.query(
      `INSERT INTO public.contacts (
         workspace_id, name, email, company, deal_stage, estimated_value
       ) VALUES ($1, 'George Washington', 'george@mountvernon.org', 'Mount Vernon Estate', 'customer', 100000.00)`,
      [wsId]
    );

    // Apply migration
    await db.exec(migrationSql);

    // 1. Archive table exists and has the legacy row
    const archiveRes = await db.query<{ first_name: string; company: string; notes: string }>(
      "SELECT first_name, company, notes FROM public.crm_contacts_legacy_archive_tier0f WHERE email = 'alex@treasury.gov'"
    );
    expect(archiveRes.rows.length).toBe(1);
    expect(archiveRes.rows[0].first_name).toBe("Alexander");
    expect(archiveRes.rows[0].company).toBe("Treasury Corp");
    expect(archiveRes.rows[0].notes).toBe("VIP Founding Partner");

    // 2. Canonical contacts has both rows, and canonical George was not overwritten by nulls
    const canonicalRes = await db.query<{ name: string; email: string; company: string; deal_stage: string; estimated_value: number; notes?: string }>(
      "SELECT name, email, company, deal_stage, estimated_value, notes FROM public.contacts ORDER BY name"
    );
    expect(canonicalRes.rows.length).toBe(2);

    const alex = canonicalRes.rows.find((r) => r.email === "alex@treasury.gov");
    expect(alex).toBeDefined();
    expect(alex?.name).toBe("Alexander Hamilton");
    expect(alex?.company).toBe("Treasury Corp");
    expect(alex?.notes).toBe("VIP Founding Partner");

    const george = canonicalRes.rows.find((r) => r.email === "george@mountvernon.org");
    expect(george).toBeDefined();
    expect(george?.company).toBe("Mount Vernon Estate");
    expect(george?.deal_stage).toBe("customer");

    // 3. Compatibility view crm_contacts is readable
    const viewRes = await db.query("SELECT * FROM public.crm_contacts");
    expect(viewRes.rows.length).toBe(2);

    // 4. Mutations on view are revoked
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userId}';
      `);
      await expect(
        tx.query("INSERT INTO public.crm_contacts (first_name) VALUES ('Disallowed')")
      ).rejects.toThrow();
    });
  });

  it("7. Test two real users across two workspaces", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    // Setup User 1 and User 2
    const uRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('user1@corp.test'), ('user2@corp.test') RETURNING id"
    );
    const u1 = uRes.rows[0].id;
    const u2 = uRes.rows[1].id;

    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id)
       VALUES ('Workspace 1', 'ws-1', $1), ('Workspace 2', 'ws-2', $2)
       RETURNING id`,
      [u1, u2]
    );
    const ws1 = wsRes.rows[0].id;
    const ws2 = wsRes.rows[1].id;

    // Add memberships
    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active'), ($3, $4, 'owner', 'active')`,
      [ws1, u1, ws2, u2]
    );

    // Insert contacts in each workspace
    await db.query(
      `INSERT INTO public.contacts (workspace_id, name, email)
       VALUES ($1, 'Contact W1', 'c1@test.com'), ($2, 'Contact W2', 'c2@test.com')`,
      [ws1, ws2]
    );

    // Query as User 1: sees only Contact W1
    const u1Contacts = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${u1}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${u1}","role":"authenticated"}';
      `);
      return await tx.query<{ name: string }>("SELECT name FROM public.contacts");
    });

    expect(u1Contacts.rows.length).toBe(1);
    expect(u1Contacts.rows[0].name).toBe("Contact W1");

    // Query as User 2: sees only Contact W2
    const u2Contacts = await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${u2}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${u2}","role":"authenticated"}';
      `);
      return await tx.query<{ name: string }>("SELECT name FROM public.contacts");
    });

    expect(u2Contacts.rows.length).toBe(1);
    expect(u2Contacts.rows[0].name).toBe("Contact W2");
  });

  it("8. Test owner, admin, manager, agent, viewer, suspended, and removed roles", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const uRes = await db.query<{ id: string; email: string }>(
      `INSERT INTO auth.users (email) VALUES
       ('r_owner@test.com'), ('r_admin@test.com'), ('r_mgr@test.com'),
       ('r_agent@test.com'), ('r_viewer@test.com'), ('r_suspended@test.com'), ('r_removed@test.com')
       RETURNING id, email`
    );

    const userMap: Record<string, string> = {};
    for (const r of uRes.rows) {
      userMap[r.email || ""] = r.id;
    }

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Role WS', 'role-ws', $1) RETURNING id",
      [userMap["r_owner@test.com"]]
    );
    const wsId = wsRes.rows[0].id;

    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES
       ($1, $2, 'owner', 'active'),
       ($1, $3, 'admin', 'active'),
       ($1, $4, 'manager', 'active'),
       ($1, $5, 'agent', 'active'),
       ($1, $6, 'viewer', 'active'),
       ($1, $7, 'agent', 'suspended'),
       ($1, $8, 'agent', 'removed')`,
      [
        wsId,
        userMap["r_owner@test.com"],
        userMap["r_admin@test.com"],
        userMap["r_mgr@test.com"],
        userMap["r_agent@test.com"],
        userMap["r_viewer@test.com"],
        userMap["r_suspended@test.com"],
        userMap["r_removed@test.com"],
      ]
    );

    // Pre-insert a contact
    await db.query("INSERT INTO public.contacts (workspace_id, name, email) VALUES ($1, 'Role Target', 'role@test.com')", [wsId]);

    // Test Viewer: can SELECT, cannot UPDATE (0 rows affected)
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["r_viewer@test.com"]}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userMap["r_viewer@test.com"]}","role":"authenticated"}';
      `);
      const viewSelect = await tx.query("SELECT * FROM public.contacts WHERE workspace_id = $1", [wsId]);
      expect(viewSelect.rows.length).toBe(1);

      const viewUpdate = await tx.query("UPDATE public.contacts SET name = 'Viewer Tampered' WHERE email = 'role@test.com'");
      expect(viewUpdate.rowCount).toBe(0);
    });

    // Test Suspended: 0 rows on SELECT
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["r_suspended@test.com"]}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userMap["r_suspended@test.com"]}","role":"authenticated"}';
      `);
      const res = await tx.query("SELECT * FROM public.contacts WHERE workspace_id = $1", [wsId]);
      expect(res.rows.length).toBe(0);
    });

    // Test Removed: 0 rows on SELECT
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${userMap["r_removed@test.com"]}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${userMap["r_removed@test.com"]}","role":"authenticated"}';
      `);
      const res = await tx.query("SELECT * FROM public.contacts WHERE workspace_id = $1", [wsId]);
      expect(res.rows.length).toBe(0);
    });

    // Test Owner, Admin, Manager, Agent can SELECT
    for (const roleEmail of ["r_owner@test.com", "r_admin@test.com", "r_mgr@test.com", "r_agent@test.com"]) {
      await db.transaction(async (tx) => {
        await tx.exec(`
          SET LOCAL ROLE authenticated;
          SET LOCAL "request.jwt.claim.sub" = '${userMap[roleEmail]}';
          SET LOCAL "request.jwt.claims" = '{"sub":"${userMap[roleEmail]}","role":"authenticated"}';
        `);
        const res = await tx.query("SELECT * FROM public.contacts WHERE workspace_id = $1", [wsId]);
        expect(res.rows.length).toBe(1);
      });
    }
  });

  it("9. Prove cross-tenant CRM, integration, automation, AI-task, billing, and webhook denial", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const uRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('cross_u1@test.com'), ('cross_u2@test.com') RETURNING id"
    );
    const u1 = uRes.rows[0].id;
    const u2 = uRes.rows[1].id;

    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id)
       VALUES ('WS Alpha', 'ws-alpha', $1), ('WS Beta', 'ws-beta', $2)
       RETURNING id`,
      [u1, u2]
    );
    const ws1 = wsRes.rows[0].id;
    const ws2 = wsRes.rows[1].id;

    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active'), ($3, $4, 'owner', 'active')`,
      [ws1, u1, ws2, u2]
    );

    // Seed resources in WS 2 (Beta)
    await db.query("INSERT INTO public.contacts (workspace_id, name, email) VALUES ($1, 'Beta Contact', 'bc@test.com')", [ws2]);
    await db.query("INSERT INTO public.integrations (workspace_id, user_id, provider, status) VALUES ($1, $2, 'whatsapp', 'connected')", [ws2, u2]);
    await db.query("INSERT INTO public.automations (workspace_id, name) VALUES ($1, 'Beta Automation')", [ws2]);
    await db.query("INSERT INTO public.ai_tasks (workspace_id, user_id, title) VALUES ($1, $2, 'Beta AI Task')", [ws2, u2]);
    await db.query("INSERT INTO public.workspace_subscriptions (workspace_id, status, monthly_message_limit) VALUES ($1, 'active', 5000)", [ws2]);
    await db.query("INSERT INTO public.webhook_events (workspace_id, event_type) VALUES ($1, 'beta.event')", [ws2]);

    // User 1 executes queries under authenticated role with JWT claim for u1
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${u1}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${u1}","role":"authenticated"}';
      `);

      // Attempt to access WS 2 CRM contacts
      const c = await tx.query("SELECT * FROM public.contacts WHERE workspace_id = $1", [ws2]);
      expect(c.rows.length).toBe(0);

      // Attempt to access WS 2 integrations
      const i = await tx.query("SELECT * FROM public.integrations WHERE workspace_id = $1", [ws2]);
      expect(i.rows.length).toBe(0);

      // Attempt to access WS 2 automations
      const a = await tx.query("SELECT * FROM public.automations WHERE workspace_id = $1", [ws2]);
      expect(a.rows.length).toBe(0);

      // Attempt to access WS 2 AI tasks
      const at = await tx.query("SELECT * FROM public.ai_tasks WHERE workspace_id = $1", [ws2]);
      expect(at.rows.length).toBe(0);

      // Attempt to access WS 2 workspace subscriptions
      const s = await tx.query("SELECT * FROM public.workspace_subscriptions WHERE workspace_id = $1", [ws2]);
      expect(s.rows.length).toBe(0);

      // Attempt to access WS 2 webhook events
      const w = await tx.query("SELECT * FROM public.webhook_events WHERE workspace_id = $1", [ws2]);
      expect(w.rows.length).toBe(0);

      // Adversarial mutation attempts
      const upC = await tx.query("UPDATE public.contacts SET name = 'Hacked' WHERE workspace_id = $1", [ws2]);
      expect(upC.rowCount).toBe(0);

      const upI = await tx.query("UPDATE public.integrations SET status = 'disabled' WHERE workspace_id = $1", [ws2]);
      expect(upI.rowCount).toBe(0);
    });
  });

  it("10. Test integration creation with correct workspace and actor IDs across two workspaces and viewer denial", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string; email: string }>(
      `INSERT INTO auth.users (email) VALUES
       ('admin_a@test.com'),
       ('viewer_a@test.com'),
       ('admin_b@test.com')
       RETURNING id, email`
    );
    const adminA = userRes.rows.find((u) => u.email === "admin_a@test.com")!.id;
    const viewerA = userRes.rows.find((u) => u.email === "viewer_a@test.com")!.id;
    const adminB = userRes.rows.find((u) => u.email === "admin_b@test.com")!.id;

    const wsRes = await db.query<{ id: string; slug: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES
       ('Integ WS A', 'integ-ws-a', $1),
       ('Integ WS B', 'integ-ws-b', $2)
       RETURNING id, slug`,
      [adminA, adminB]
    );
    const wsA = wsRes.rows.find((w) => w.slug === "integ-ws-a")!.id;
    const wsB = wsRes.rows.find((w) => w.slug === "integ-ws-b")!.id;

    // Memberships: Admin A (admin, wsA), Viewer A (viewer, wsA), Admin B (admin, wsB)
    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES
       ($1, $2, 'admin', 'active'),
       ($1, $3, 'viewer', 'active'),
       ($4, $5, 'admin', 'active')`,
      [wsA, adminA, viewerA, wsB, adminB]
    );

    const adapter = createPgliteSupabaseAdapter(db);

    // 1. Admin A creates integration in Workspace A using createIntegrationConnection through adapter
    const created = await createIntegrationConnection(
      adapter as unknown as SupabaseClient,
      { workspaceId: wsA, actorUserId: adminA },
      { providerId: "whatsapp-business" }
    );
    expect(created.workspaceId).toBe(wsA);
    expect(created.userId).toBe(adminA);
    expect(created.providerId).toBe("whatsapp-business");
    expect(created.status).toBe("pending");

    // Verify row in underlying PGlite database
    const dbCheck = await db.query<{ id: string; workspace_id: string; user_id: string; provider: string }>(
      "SELECT id, workspace_id, user_id, provider FROM public.integrations WHERE id = $1",
      [created.id]
    );
    expect(dbCheck.rows.length).toBe(1);
    expect(dbCheck.rows[0].workspace_id).toBe(wsA);
    expect(dbCheck.rows[0].user_id).toBe(adminA);

    // 2. createIntegrationConnection helper rejects actorUserId === workspaceId
    await expect(
      createIntegrationConnection(
        adapter as unknown as SupabaseClient,
        { workspaceId: wsA, actorUserId: wsA }, // Forbidden: workspaceId passed as actorUserId
        { providerId: "google-calendar" }
      )
    ).rejects.toThrow("actorUserId must be an authenticated user identifier, not a workspace identifier.");

    // 3. Duplicate provider in same workspace rejected by helper and uniqueness constraint
    await expect(
      createIntegrationConnection(
        adapter as unknown as SupabaseClient,
        { workspaceId: wsA, actorUserId: adminA },
        { providerId: "whatsapp-business" }
      )
    ).rejects.toThrow(/already registered/);

    await expect(
      db.query(
        "INSERT INTO public.integrations (workspace_id, user_id, provider, status) VALUES ($1, $2, 'whatsapp-business', 'active')",
        [wsA, adminA]
      )
    ).rejects.toThrow();

    // 4. Cross-workspace access rejection: Admin B querying Workspace A integration gets 0 rows
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${adminB}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${adminB}","role":"authenticated"}';
      `);
      const crossRes = await tx.query("SELECT * FROM public.integrations WHERE id = $1", [created.id]);
      expect(crossRes.rows.length).toBe(0);
    });

    // 5. Viewer mutation denial: Viewer A in Workspace A attempting to insert an integration is denied by RLS
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${viewerA}';
        SET LOCAL "request.jwt.claims" = '{"sub":"${viewerA}","role":"authenticated"}';
      `);
      await expect(
        tx.query(
          "INSERT INTO public.integrations (workspace_id, user_id, provider, status) VALUES ($1, $2, 'slack', 'pending')",
          [wsA, viewerA]
        )
      ).rejects.toThrow();
    });
  });

  it("11. Test webhook credential isolation and viewer denial across workspaces", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const uRes = await db.query<{ id: string; email: string }>(
      `INSERT INTO auth.users (email) VALUES
       ('ws_a_admin@test.com'),
       ('ws_a_viewer@test.com'),
       ('ws_b_admin@test.com')
       RETURNING id, email`
    );
    const adminA = uRes.rows.find((u) => u.email === "ws_a_admin@test.com")!.id;
    const viewerA = uRes.rows.find((u) => u.email === "ws_a_viewer@test.com")!.id;
    const adminB = uRes.rows.find((u) => u.email === "ws_b_admin@test.com")!.id;

    const wsRes = await db.query<{ id: string; slug: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES
       ('WS Alpha Corp', 'ws-alpha-corp', $1),
       ('WS Beta Corp', 'ws-beta-corp', $2)
       RETURNING id, slug`,
      [adminA, adminB]
    );
    const wsA = wsRes.rows.find((w) => w.slug === "ws-alpha-corp")!.id;
    const wsB = wsRes.rows.find((w) => w.slug === "ws-beta-corp")!.id;

    await db.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES
       ($1, $2, 'admin', 'active'),
       ($1, $3, 'viewer', 'active'),
       ($4, $5, 'admin', 'active')`,
      [wsA, adminA, viewerA, wsB, adminB]
    );

    // Integration in Workspace A
    const integRes = await db.query<{ id: string }>(
      "INSERT INTO public.integrations (workspace_id, user_id, provider, status) VALUES ($1, $2, 'whatsapp', 'active') RETURNING id",
      [wsA, adminA]
    );
    const integA = integRes.rows[0].id;

    // Admin A stores credentials
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${adminA}';
      `);
      await tx.query(
        "SELECT public.store_integration_credential_envelope($1, 'top_secret_a', 'iv_a', 'tag_a', 'aes-256-gcm', 1)",
        [integA]
      );
    });

    // 1. Admin A can retrieve credentials
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${adminA}';
      `);
      const creds = await tx.query<{ encrypted_payload: string }>(
        "SELECT encrypted_payload FROM public.get_integration_credential_envelope($1)",
        [integA]
      );
      expect(creds.rows.length).toBe(1);
      expect(creds.rows[0].encrypted_payload).toBe("top_secret_a");
    });

    // 2. Admin B in Workspace B attempts to retrieve Workspace A credentials: rejected with Forbidden
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${adminB}';
      `);
      await expect(
        tx.query("SELECT * FROM public.get_integration_credential_envelope($1)", [integA])
      ).rejects.toThrow(/Forbidden/);
    });

    // 3. Viewer in Workspace A attempts to retrieve credentials: rejected with Forbidden
    await db.transaction(async (tx) => {
      await tx.exec(`
        SET LOCAL ROLE authenticated;
        SET LOCAL "request.jwt.claim.sub" = '${viewerA}';
      `);
      await expect(
        tx.query("SELECT * FROM public.get_integration_credential_envelope($1)", [integA])
      ).rejects.toThrow(/Forbidden/);
    });
  });

  it("12. Test automation bridge cross-tenant rejection via continuation handler", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const uRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('bridge_u1@test.com'), ('bridge_u2@test.com') RETURNING id"
    );
    const u1 = uRes.rows[0].id;
    const u2 = uRes.rows[1].id;

    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id)
       VALUES ('WS A', 'ws-a-bridge', $1), ('WS B', 'ws-b-bridge', $2)
       RETURNING id`,
      [u1, u2]
    );
    const wsA = wsRes.rows[0].id;
    const wsB = wsRes.rows[1].id;

    const autoRes = await db.query<{ id: string }>(
      `INSERT INTO public.automations (workspace_id, name)
       VALUES ($1, 'Automation A'), ($2, 'Automation B')
       RETURNING id`,
      [wsA, wsB]
    );
    const autoA = autoRes.rows[0].id;
    const autoB = autoRes.rows[1].id;

    // Seed run in Workspace A for user 1
    const runARes = await db.query<{ id: string }>(
      `INSERT INTO public.automation_runs (automation_id, workspace_id, user_id, status, current_step_order)
       VALUES ($1, $2, $3, 'queued', 1)
       RETURNING id`,
      [autoA, wsA, u1]
    );
    const runA = runARes.rows[0].id;

    // Seed run in Workspace B for user 2
    const runBRes = await db.query<{ id: string }>(
      `INSERT INTO public.automation_runs (automation_id, workspace_id, user_id, status, current_step_order)
       VALUES ($1, $2, $3, 'queued', 1)
       RETURNING id`,
      [autoB, wsB, u2]
    );
    const runB = runBRes.rows[0].id;

    const queryLog: QueryLog[] = [];
    const adapter = createPgliteSupabaseAdapter(db, queryLog);

    // Create a bridge cookie signed for Workspace A and Automation A
    const originalSecret = process.env.AUTOMATION_BRIDGE_SECRET;
    const originalKey = process.env.J10_INTEGRATION_ENCRYPTION_KEY;
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.AUTOMATION_BRIDGE_SECRET = "test_bridge_secret_at_least_32_characters_long_for_security";
    process.env.J10_INTEGRATION_ENCRYPTION_KEY = "test_bridge_secret_at_least_32_characters_long_for_security";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_role_key_that_is_at_least_32_chars_long";

    setAutomationBridgeServiceClientFactory(() => adapter as unknown as SupabaseClient);

    try {
      const cookieHeader = createAutomationBridgeCookieHeader(
        u1,
        wsA,
        autoA,
        "evt_bridge_123"
      );

      // 1. Demonstrate that a valid Workspace A credential can reach its own seeded run (runA)
      const fakeReqA = new NextRequest("http://localhost:3000/api/automation-runs/" + runA + "/continue", {
        method: "POST",
        headers: { cookie: cookieHeader },
      });

      const responseA = await continuePost(fakeReqA, {
        params: Promise.resolve({ runId: runA }),
      });

      // Explicitly fail on connection or authentication-configuration errors
      if (responseA.status === 401) {
        throw new Error("Authentication-configuration error: bridge credentials failed to authenticate user against database.");
      }
      if (responseA.status === 500) {
        const bodyA = await responseA.json().catch(() => ({}));
        throw new Error(`Database-connection error on runA continuation: ${JSON.stringify(bodyA)}`);
      }
      expect(responseA.status).toBe(200);

      // Verify runA transitioned in the underlying PGlite database
      const runAAfter = await db.query<{ status: string }>(
        "SELECT status FROM public.automation_runs WHERE id = $1",
        [runA]
      );
      expect(runAAfter.rows[0].status).toBe("completed");

      // 2. Use that Workspace A credential against Workspace B's seeded run (runB)
      const trackerBeforeB = queryLog.length;

      const fakeReqB = new NextRequest("http://localhost:3000/api/automation-runs/" + runB + "/continue", {
        method: "POST",
        headers: { cookie: cookieHeader },
      });

      const responseB = await continuePost(fakeReqB, {
        params: Promise.resolve({ runId: runB }),
      });

      // A 401 or database-connection failure must not count as tenant-isolation evidence
      if (responseB.status === 401) {
        throw new Error("401 Unauthorized must not count as tenant-isolation evidence; auth configuration failed.");
      }
      if (responseB.status === 500) {
        throw new Error("500 Internal Server Error must not count as tenant-isolation evidence; database connection failed.");
      }

      // Require the intended authorization/not-found response (404 Not Found)
      expect(responseB.status).toBe(404);
      const bodyB = await responseB.json();
      expect(bodyB.error).toBe("Workflow execution not found.");

      // Prove the lookup reached the database with the correct workspace and automation scope
      const queriesForB = queryLog.slice(trackerBeforeB).filter((q) => q.table === "automation_runs" && q.op === "select");
      expect(queriesForB.length).toBeGreaterThan(0);
      const lookupQuery = queriesForB[0];
      expect(lookupQuery.filters.id).toBe(runB);
      expect(lookupQuery.filters.workspace_id).toBe(wsA);
      expect(lookupQuery.filters.automation_id).toBe(autoA);
      expect(lookupQuery.rowCount).toBe(0);

      // Assert zero mutation on Workspace B run in that same database
      const runBAfter = await db.query<{ status: string }>(
        "SELECT status FROM public.automation_runs WHERE id = $1",
        [runB]
      );
      expect(runBAfter.rows[0].status).toBe("queued");

      const identity = readAutomationBridgeIdentity(fakeReqB);
      expect(identity).not.toBeNull();
      expect(identity?.workspaceId).toBe(wsA);
      expect(identity?.automationId).toBe(autoA);
    } finally {
      setAutomationBridgeServiceClientFactory(null);
      if (originalSecret !== undefined) {
        process.env.AUTOMATION_BRIDGE_SECRET = originalSecret;
      } else {
        delete process.env.AUTOMATION_BRIDGE_SECRET;
      }
      if (originalKey !== undefined) {
        process.env.J10_INTEGRATION_ENCRYPTION_KEY = originalKey;
      } else {
        delete process.env.J10_INTEGRATION_ENCRYPTION_KEY;
      }
      if (originalUrl !== undefined) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      } else {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      }
      if (originalRoleKey !== undefined) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalRoleKey;
      } else {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    }
  });

  it("13. Test production AI diagnostic rejection", async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDiagnostic = process.env.ENABLE_AI_DIAGNOSTIC_MODE;
    const envObj = process.env as Record<string, string | undefined>;
    try {
      envObj.NODE_ENV = "production";
      delete process.env.ENABLE_AI_DIAGNOSTIC_MODE;
      const res = await j10AiTestPost();
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Not found");
    } finally {
      envObj.NODE_ENV = originalEnv;
      if (originalDiagnostic !== undefined) {
        process.env.ENABLE_AI_DIAGNOSTIC_MODE = originalDiagnostic;
      } else {
        delete process.env.ENABLE_AI_DIAGNOSTIC_MODE;
      }
    }
  });

  it("14. Sequential quota exhaustion test", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('concur_quota@test.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;

    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Concur WS', 'concur-ws', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    await db.query(
      "INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status) VALUES ($1, $2, 'admin', 'active')",
      [wsId, userId]
    );

    // Monthly limit = 10, current usage = 8 (remaining allowance = 2)
    await db.query(
      `INSERT INTO public.workspace_subscriptions (workspace_id, status, monthly_message_limit, messages_used_this_period, provenance)
       VALUES ($1, 'active', 10, 8, 'stripe')`,
      [wsId]
    );

    // Run 5 sequential increments of 1 each in transactions
    const results = [];
    for (let i = 0; i < 5; i++) {
      const r = await db.transaction(async (tx) => {
        await tx.exec(`
          SET LOCAL ROLE authenticated;
          SET LOCAL "request.jwt.claim.sub" = '${userId}';
          SET LOCAL "request.jwt.claims" = '{"sub":"${userId}","role":"authenticated"}';
        `);
        return await tx.query<{ res: { success: boolean; is_exceeded: boolean; limit_reached: boolean; new_usage: number } }>(
          "SELECT public.increment_workspace_usage($1, 1) AS res",
          [wsId]
        );
      });
      results.push(r.rows[0].res);
    }

    const succeeded = results.filter((r) => r.success);
    const rejected = results.filter((r) => !r.success && r.is_exceeded);

    expect(succeeded.length).toBe(2);
    expect(rejected.length).toBe(3);
  });

  it("15. Test Stripe spoofing and partial write failure", async () => {
    const secret = "whsec_test_secret_key_hardened_12345";
    const now = Math.floor(Date.now() / 1000);

    // 1. Valid signature verification
    const payload = JSON.stringify({ id: "evt_valid_123", type: "checkout.session.completed" });
    const signature = crypto.createHmac("sha256", secret).update(`${now}.${payload}`).digest("hex");
    const validHeader = `t=${now},v1=${signature}`;
    expect(verifyStripeWebhookSignature({ rawBody: payload, signatureHeader: validHeader, secret }).valid).toBe(true);

    // 2. Expired signature (> 300s) rejected
    const expiredHeader = `t=${now - 301},v1=${signature}`;
    expect(verifyStripeWebhookSignature({ rawBody: payload, signatureHeader: expiredHeader, secret }).valid).toBe(false);

    // 3. Forged signature rejected
    const forgedHeader = `t=${now},v1=forged_mac_hash`;
    expect(verifyStripeWebhookSignature({ rawBody: payload, signatureHeader: forgedHeader, secret }).valid).toBe(false);

    // 4. Unknown price ID quarantine
    const unknownPrice = "unapproved_price_bypass";
    expect(STRIPE_PRICE_ALLOWLIST[unknownPrice]).toBeUndefined();

    const mockDb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    const unknownPriceEvent = {
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_spoof_price",
          customer: "cus_123",
          status: "active",
          current_period_start: now,
          current_period_end: now + 30 * 86400,
          items: {
            data: [{ price: { lookup_key: unknownPrice } }],
          },
        },
      },
    };

    const res = await processStripeSubscriptionEvent(
      mockDb as unknown as Parameters<typeof processStripeSubscriptionEvent>[0],
      unknownPriceEvent
    );
    expect(res.processed).toBe(false);
    expect(res.action).toBe("quarantined_unknown_price");
  });

  it("16. Sequential lead idempotency test", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('lead_concur@test.com') RETURNING id"
    );
    const userId = userRes.rows[0].id;
    const wsRes = await db.query<{ id: string }>(
      "INSERT INTO public.workspaces (name, slug, owner_user_id) VALUES ('Lead WS', 'lead-ws', $1) RETURNING id",
      [userId]
    );
    const wsId = wsRes.rows[0].id;

    const fnRes = await db.query<{ id: string }>(
      `INSERT INTO public.website_funnels (workspace_id, title, slug, is_published)
       VALUES ($1, 'Lead Intake', 'lead-intake', true) RETURNING id`,
      [wsId]
    );
    const funnelId = fnRes.rows[0].id;

    const key = "concur_lead_key_123";

    // 4 calls with identical payload
    const results = [];
    for (let i = 0; i < 4; i++) {
      const res = await db.query<{ res: { success: boolean; duplicate: boolean; conflict: boolean } }>(
        `SELECT public.create_website_lead(
           $1, 'Jane Smith', 'jane@test.com', '+15550001111', 'Hello J10', 'Notes', $2, '{}'::jsonb
         ) AS res`,
        [funnelId, key]
      );
      results.push(res.rows[0].res);
    }

    expect(results[0].success).toBe(true);
    expect(results[0].duplicate).toBe(false);
    expect(results[1].duplicate).toBe(true);
    expect(results[2].duplicate).toBe(true);
    expect(results[3].duplicate).toBe(true);

    // Call with same key but different payload detects conflict
    const conflictRes = await db.query<{ res: { success: boolean; conflict: boolean } }>(
      `SELECT public.create_website_lead(
         $1, 'Tampered Name', 'tampered@test.com', '+15550009999', 'Altered', 'Notes', $2, '{}'::jsonb
       ) AS res`,
      [funnelId, key]
    );
    expect(conflictRes.rows[0].res.success).toBe(false);
    expect(conflictRes.rows[0].res.conflict).toBe(true);
  });

  it("17. Test duplicate public funnel identities", async () => {
    const db = await createBaselineDb();
    await db.exec(migrationSql);

    const userRes = await db.query<{ id: string }>(
      "INSERT INTO auth.users (email) VALUES ('funnel_u1@test.com'), ('funnel_u2@test.com') RETURNING id"
    );
    const u1 = userRes.rows[0].id;
    const u2 = userRes.rows[1].id;

    const wsRes = await db.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug, owner_user_id)
       VALUES ('WS 1 Funnel', 'ws-1-funnel', $1), ('WS 2 Funnel', 'ws-2-funnel', $2)
       RETURNING id`,
      [u1, u2]
    );
    const ws1 = wsRes.rows[0].id;
    const ws2 = wsRes.rows[1].id;

    // Publish funnel in WS 1 with slug 'exclusive-offer'
    await db.query(
      `INSERT INTO public.website_funnels (workspace_id, title, slug, is_published)
       VALUES ($1, 'Funnel 1', 'exclusive-offer', true)`,
      [ws1]
    );

    // Attempt to publish funnel in WS 2 with identical normalized slug
    await expect(
      db.query(
        `INSERT INTO public.website_funnels (workspace_id, title, slug, is_published)
         VALUES ($1, 'Funnel 2', 'EXCLUSIVE-OFFER ', true)`,
        [ws2]
      )
    ).rejects.toThrow();

    // Unpublished funnel in WS 2 with same slug is allowed
    await expect(
      db.query(
        `INSERT INTO public.website_funnels (workspace_id, title, slug, is_published)
         VALUES ($1, 'Draft Funnel', 'exclusive-offer', false)`,
        [ws2]
      )
    ).resolves.not.toThrow();
  });
});
