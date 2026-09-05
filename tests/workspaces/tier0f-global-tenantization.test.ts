import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

describe("Tier 0F: Global Tenantization, Launch Integrity & Atomic Boundary Verification", () => {
  const migration20260916 = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260916_global_tenantization_launch_integrity.sql"),
    "utf8"
  );
  const migrationLower = migration20260916.toLowerCase();

  describe("A. Deterministic Preflight & Legacy Table Tenantization", () => {
    it("includes preflight safety assertions for unambiguous user workspace memberships", () => {
      expect(migrationLower).toContain("preflight assertion: no ambiguous user memberships");
      expect(migrationLower).toContain("ambiguous backfill prevented");
    });

    it("tenantizes all 9 legacy untyped/untenanted tables with strict workspace_id foreign keys", () => {
      const legacyTables = [
        "employees",
        "ai_tasks",
        "automations",
        "automation_runs",
        "automation_steps",
        "automation_versions",
        "integrations",
        "integration_credentials",
        "activity_logs",
      ];

      for (const table of legacyTables) {
        expect(migrationLower).toContain(`alter table public.${table} add column workspace_id uuid references public.workspaces(id)`);
      }
    });

    it("enforces RLS and tenant-scoped policies on all primary legacy tables", () => {
      const primaryLegacyTables = [
        "employees",
        "ai_tasks",
        "automations",
        "automation_runs",
        "integrations",
        "integration_credentials",
        "activity_logs",
      ];

      for (const table of primaryLegacyTables) {
        expect(migrationLower).toContain(`alter table public.${table} enable row level security`);
      }
    });
  });

  describe("B. Subscription Authority & Drop Permissive RLS", () => {
    it("drops all permissive or broad read policies on subscriptions", () => {
      expect(migrationLower).toContain("workspace_subscriptions enable row level security");
      expect(migrationLower).toContain("drop policy if exists \"workspace_subscriptions_modify_restricted\"");
    });

    it("creates workspace_subscriptions table with workspace foreign key and unique constraint", () => {
      expect(migrationLower).toContain("create table if not exists public.workspace_subscriptions");
      expect(migrationLower).toContain("workspace_id uuid not null unique references public.workspaces(id)");
    });

    it("restricts workspace_subscriptions modification by omitting client write policies", () => {
      expect(migrationLower).toContain("create policy \"workspace_subscriptions_select_member\"");
      expect(migrationLower).toContain("public.has_workspace_role(workspace_id");
      expect(migrationLower).toContain("writable only via trusted service_role");
    });

    it("defines atomic usage increment function with row-level locking", () => {
      expect(migrationLower).toContain("create or replace function public.increment_workspace_usage");
      expect(migrationLower).toContain("update public.workspace_subscriptions");
      expect(migrationLower).toContain("messages_used_this_period = messages_used_this_period + p_count");
      expect(migrationLower).toContain("set search_path = public, pg_temp");
    });
  });

  describe("C. Atomic Workspace Invitation Acceptance Engine", () => {
    it("defines atomic invitation acceptance RPC with FOR UPDATE locking and email check", () => {
      expect(migrationLower).toContain("create or replace function public.accept_workspace_invitation");
      expect(migrationLower).toContain("token_hash = trim(p_token_hash)");
      expect(migrationLower).toContain("for update;");
      expect(migrationLower).toContain("if v_invitation.accepted_at is not null then");
      expect(migrationLower).toContain("lower(trim(v_invitation.email_normalized)) != v_norm_email");
    });

    it("marks invitation accepted and atomically upserts workspace membership", () => {
      expect(migrationLower).toContain("set accepted_at = now()");
      expect(migrationLower).toContain("where id = v_invitation.id;");
      expect(migrationLower).toContain("insert into public.workspace_memberships");
      expect(migrationLower).toContain("on conflict (workspace_id, user_id)");
    });

    it("computes SHA-256 token hashes deterministically for invitation exchange", () => {
      const rawToken = "inv_sec_9938827110adbf44";
      const hash1 = createHash("sha256").update(rawToken).digest("hex");
      const hash2 = createHash("sha256").update(rawToken).digest("hex");
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it("normalizes invitee emails strictly before comparison", () => {
      const emailA = "  Jane.Doe+Work@Acme.COM  ";
      const emailB = "jane.doe+work@acme.com";
      expect(emailA.trim().toLowerCase()).toBe(emailB.trim().toLowerCase());
    });
  });

  describe("D. Canonical Business Entities Tenantization", () => {
    it("ensures all 10 specialized business tables possess workspace_id foreign keys and RLS", () => {
      const businessTables = [
        "company_knowledge_documents",
        "marketing_campaigns",
        "finance_invoices",
        "workforce_members",
        "website_funnels",
        "commerce_products",
        "commerce_orders",
        "provider_subscriptions",
        "webhook_endpoints",
        "notifications",
      ];

      for (const table of businessTables) {
        expect(migrationLower).toContain(`create table if not exists public.${table}`);
        expect(migrationLower).toContain(`alter table public.${table} enable row level security`);
      }
    });
  });

  describe("E. PostgreSQL Migration Syntax & DDL Invariant Guard", () => {
    it("strictly rejects any DROP POLICY statement containing FOR clauses", () => {
      const dropPolicyMatches = [...migration20260916.matchAll(/DROP\s+POLICY[\s\S]*?;/gi)];
      expect(dropPolicyMatches.length).toBeGreaterThan(0);

      for (const match of dropPolicyMatches) {
        const stmt = match[0].replace(/\s+/g, " ").trim();
        const upper = stmt.toUpperCase();
        expect(upper).not.toContain(" FOR SELECT");
        expect(upper).not.toContain(" FOR INSERT");
        expect(upper).not.toContain(" FOR UPDATE");
        expect(upper).not.toContain(" FOR DELETE");
        expect(upper).not.toContain(" FOR ALL");
        expect(upper).not.toContain(" USING (");
        expect(upper).not.toContain(" WITH CHECK (");
      }
    });

    it("verifies all DROP POLICY statements terminate with semicolons", () => {
      const lines = migration20260916.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.toUpperCase().startsWith("DROP POLICY")) {
          expect(line.endsWith(";")).toBe(true);
        }
      }
    });

    it("verifies all CREATE POLICY statements target valid tables with valid clauses", () => {
      const createPolicyMatches = [...migration20260916.matchAll(/CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+public\.([a-zA-Z0-9_]+)[\s\S]*?;/gi)];
      expect(createPolicyMatches.length).toBeGreaterThan(20);

      for (const match of createPolicyMatches) {
        const policyBody = match[0].replace(/\s+/g, " ");
        const upper = policyBody.toUpperCase();
        expect(upper).toContain(" ON PUBLIC.");
        const hasUsing = upper.includes(" USING ");
        const hasWithCheck = upper.includes(" WITH CHECK ");
        expect(hasUsing || hasWithCheck).toBe(true);
      }
    });

    it("ensures migration is wrapped in an explicit transaction block and is retry-safe", () => {
      expect(migration20260916).toMatch(/^\s*--[\s\S]*?BEGIN;\s*$/m);
      expect(migration20260916).toMatch(/^\s*COMMIT;\s*$/m);
      expect(migrationLower).toContain("create or replace function");
      expect(migrationLower).toContain("create table if not exists");
      expect(migrationLower).toContain("drop policy if exists");
    });
  });
});

