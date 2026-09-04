import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hasMinimumRole,
  ROLE_HIERARCHY,
  type WorkspaceRole,
} from "@/lib/workspaces/server";

describe("Tenant Isolation, Workspace RLS & Authorization Engine", () => {
  const migrationSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260911_multi_tenant_persistence_ledger.sql"),
    "utf8"
  );

  describe("A. Canonical Database Schema & Constraint Verification", () => {
    it("defines the 8 required canonical entities with workspace_id foreign keys", () => {
      const requiredTables = [
        "workspaces",
        "workspace_memberships",
        "contacts",
        "inbox_threads",
        "inbox_messages",
        "payment_checkouts",
        "payment_ledger",
        "webhook_events",
      ];

      for (const table of requiredTables) {
        expect(migrationSql).toContain(`create table if not exists public.${table}`);
      }

      // Check workspace_id foreign key references
      const tenantTables = [
        "contacts",
        "inbox_threads",
        "inbox_messages",
        "payment_checkouts",
        "payment_ledger",
      ];

      for (const table of tenantTables) {
        const regex = new RegExp(
          `create table if not exists public\\.${table}[\\s\\S]*?workspace_id uuid not null references public\\.workspaces\\(id\\) on delete cascade`,
          "i"
        );
        expect(migrationSql).toMatch(regex);
      }
    });

    it("enforces unique constraint on workspace_memberships (workspace_id, user_id)", () => {
      expect(migrationSql).toContain(
        "constraint uq_workspace_memberships_workspace_user unique (workspace_id, user_id)"
      );
    });

    it("enforces unique constraint on webhook_events (provider, provider_event_id)", () => {
      expect(migrationSql).toContain(
        "constraint uq_webhook_events_provider_event unique (provider, provider_event_id)"
      );
    });
  });

  describe("B. Row-Level Security (RLS) Policies & Authorization Functions", () => {
    it("enables RLS on every tenant-owned table without exception", () => {
      const tables = [
        "workspaces",
        "workspace_memberships",
        "contacts",
        "inbox_threads",
        "inbox_messages",
        "payment_checkouts",
        "payment_ledger",
        "webhook_events",
      ];

      for (const table of tables) {
        expect(migrationSql).toContain(`alter table public.${table} enable row level security;`);
      }
    });

    it("creates security definer authorization functions with search_path=public", () => {
      expect(migrationSql).toContain("function public.is_workspace_member(target_workspace_id uuid)");
      expect(migrationSql).toContain("function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])");
      expect(migrationSql).toContain("function public.owns_workspace(target_workspace_id uuid)");
      expect(migrationSql).toContain("security definer");
      expect(migrationSql).toContain("set search_path = public");
    });

    it("strictly forbids permissive USING (true) policies across all tables", () => {
      const matches = migrationSql.match(/using\s*\(\s*true\s*\)/gi);
      expect(matches).toBeNull();
    });

    it("restricts payment_ledger and webhook_events mutations to service_role", () => {
      expect(migrationSql).toContain("create policy \"payment_ledger_service_role_all\"");
      expect(migrationSql).toContain("auth.role() = 'service_role'");
      expect(migrationSql).toContain("create policy \"webhook_events_service_role_all\"");
    });
  });

  describe("C. Role Hierarchy & Permission Levels", () => {
    it("enforces strict role rank hierarchy: owner > admin > manager > agent > viewer", () => {
      expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
      expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.manager);
      expect(ROLE_HIERARCHY.manager).toBeGreaterThan(ROLE_HIERARCHY.agent);
      expect(ROLE_HIERARCHY.agent).toBeGreaterThan(ROLE_HIERARCHY.viewer);
    });

    it("allows owner and admin to perform administrative actions", () => {
      expect(hasMinimumRole("owner", "admin")).toBe(true);
      expect(hasMinimumRole("admin", "admin")).toBe(true);
      expect(hasMinimumRole("manager", "admin")).toBe(false);
      expect(hasMinimumRole("agent", "admin")).toBe(false);
      expect(hasMinimumRole("viewer", "admin")).toBe(false);
    });

    it("restricts viewer from executing agent or manager mutations", () => {
      expect(hasMinimumRole("viewer", "agent")).toBe(false);
      expect(hasMinimumRole("viewer", "manager")).toBe(false);
      expect(hasMinimumRole("viewer", "admin")).toBe(false);
      expect(hasMinimumRole("viewer", "viewer")).toBe(true);
    });

    it("allows agents to manage conversations and proposals but not delete threads", () => {
      expect(hasMinimumRole("agent", "agent")).toBe(true);
      expect(hasMinimumRole("agent", "manager")).toBe(false);
    });
  });

  describe("D. Cross-Tenant Isolation Scenarios", () => {
    it("verifies that contacts and inbox queries require matching workspace_id", () => {
      expect(migrationSql).toContain("public.is_workspace_member(workspace_id)");
    });

    it("verifies zero emojis across migration SQL", () => {
      const emojiRegex =
        /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
      expect(migrationSql).not.toMatch(emojiRegex);
    });
  });
});
