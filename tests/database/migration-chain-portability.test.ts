import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

describe("Supabase migration-chain portability", () => {
  it("does not seed environment-specific identities in executable migrations from 20260915 onward", () => {
    const identityLiteral = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|'\+?\d[\d ()-]{7,}\d'/gi;
    const executableMigrations = readdirSync(migrationsDir)
      .filter((name) => /^\d+_.+\.sql$/.test(name) && name >= "20260915")
      .sort();

    for (const name of executableMigrations) {
      const sqlWithoutComments = readFileSync(resolve(migrationsDir, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--[^\r\n]*/g, "");
      expect(sqlWithoutComments.match(identityLiteral), `${name} contains an environment-specific identity seed`).toBeNull();
    }
  });

  it("uses valid numeric versions and removes the skipped executable migrations", () => {
    const migrationNames = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
    const invalidVersionNames = migrationNames.filter((name) => !/^\d+_.+\.sql$/.test(name));
    const versions = migrationNames.map((name) => name.match(/^(\d+)_/)?.[1]);
    const ordered = [...migrationNames].sort();

    expect(invalidVersionNames).toEqual([]);
    expect(new Set(versions).size).toBe(versions.length);
    expect(migrationNames).toContain("20261009_migration_chain_reconciliation.sql");
    expect(migrationNames).toContain("20261010_workspace_subscriptions_tenantization_reconciliation.sql");
    expect(migrationNames).not.toContain("20260915b_atomic_founder_ownership_transfer.sql");
    expect(migrationNames).not.toContain("20260918b_restrict_tier0g_rpc_execute.sql");
    expect(migrationNames).not.toContain("20260919b_restrict_tier1_authenticated_table_privileges.sql");
    expect(ordered.indexOf("20261009_migration_chain_reconciliation.sql"))
      .toBeGreaterThan(ordered.indexOf("20261007_whatsapp_embedded_signup.sql"));
  });

  it("tenantizes legacy workspace subscriptions before workspace-scoped use", () => {
    const tenantization = readFileSync(
      resolve(migrationsDir, "20260916_global_tenantization_launch_integrity.sql"),
      "utf8",
    );
    const reconciliation = readFileSync(
      resolve(migrationsDir, "20261010_workspace_subscriptions_tenantization_reconciliation.sql"),
      "utf8",
    );
    const firstWorkspaceScopedInsert = tenantization.indexOf(
      "INSERT INTO public.workspace_subscriptions (workspace_id, plan_id, status, monthly_message_limit)",
    );

    expect(firstWorkspaceScopedInsert).toBeGreaterThan(0);
    expect(tenantization.indexOf("ADD COLUMN workspace_id UUID")).toBeGreaterThan(0);
    expect(tenantization.indexOf("ADD COLUMN workspace_id UUID")).toBeLessThan(firstWorkspaceScopedInsert);
    expect(tenantization).toContain("Backfill assertion failed: workspace_subscriptions row lacks workspace_id.");
    expect(tenantization).toContain("uq_workspace_subscriptions_workspace_id");
    expect(tenantization).toContain("ALTER COLUMN user_id DROP NOT NULL");
    expect(reconciliation).toContain("workspace_subscriptions reconciliation failed: unresolved workspace_id.");
    expect(reconciliation).toContain("uq_workspace_subscriptions_workspace_id");
  });

  it("creates every canonical pre-tenant core table before a later migration references it", () => {
    const migrations = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => ({ name, sql: readFileSync(resolve(migrationsDir, name), "utf8") }));
    const foundation = migrations.find((migration) => migration.name === "20260820_day14b_integrations.sql");

    expect(foundation).toBeDefined();
    for (const table of [
      "automations",
      "automation_runs",
      "automation_steps",
      "automation_run_steps",
      "crm_contacts",
      "employees",
      "ai_tasks",
      "activity_logs",
    ]) {
      expect(foundation!.sql).toMatch(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i"));
      const firstReference = migrations.findIndex((migration) =>
        new RegExp(`public\\.${table}\\b`, "i").test(migration.sql),
      );
      expect(firstReference).toBeGreaterThanOrEqual(0);
      expect(migrations[firstReference].name >= foundation!.name).toBe(true);
    }

    const createdAt = new Map<string, number>();
    const firstTableUse = new Map<string, number>();
    for (const [index, migration] of migrations.entries()) {
      for (const match of migration.sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
        createdAt.set(match[1], createdAt.get(match[1]) ?? index);
      }
      for (const match of migration.sql.matchAll(/\b(?:alter\s+table|insert\s+into|update|delete\s+from|references|on)\s+public\.([a-z_][a-z0-9_]*)\b/gi)) {
        firstTableUse.set(match[1], firstTableUse.get(match[1]) ?? index);
      }
    }

    // This relation is intentionally created by a guarded legacy-table rename
    // inside the same migration, so it has no standalone CREATE TABLE statement.
    const dynamicLegacyRelations = new Set(["crm_contacts_legacy_archive_tier0f"]);
    for (const [table, useIndex] of firstTableUse) {
      if (dynamicLegacyRelations.has(table)) continue;
      expect(createdAt.get(table), `${table} is referenced without a migration creation`).toBeDefined();
      expect(createdAt.get(table)!, `${table} is referenced before creation`).toBeLessThanOrEqual(useIndex);
    }
  });

  it("preserves consolidated behavior and makes reconciliation safe to rerun", () => {
    const identityMigration = readFileSync(
      resolve(migrationsDir, "20260915_identity_platform_roles_invitations.sql"),
      "utf8",
    );
    const tier0gMigration = readFileSync(resolve(migrationsDir, "20260918_tier0g_saas_billing.sql"), "utf8");
    const tier1Migration = readFileSync(resolve(migrationsDir, "20260919_tier1_revenue_loop.sql"), "utf8");
    const reconciliation = readFileSync(resolve(migrationsDir, "20261009_migration_chain_reconciliation.sql"), "utf8");
    const foundersMigration = readFileSync(
      resolve(migrationsDir, "20261004_founders3_strict_state_and_hash_isolation.sql"),
      "utf8",
    );

    expect(identityMigration).toContain("platform role must be granted by an explicit authenticated bootstrap flow");
    expect(tier0gMigration).toContain("Preserve the hardening formerly skipped in invalid migration 20260918b");
    expect(tier1Migration).toContain("Preserve the authenticated-role reset formerly skipped in invalid 20260919b");
    expect(reconciliation).toContain("not reconciled here");
    for (const [canonical, consolidated] of Object.entries({
      "20260820_day14b_integrations.sql": [
        "20260820_day14c_integration_credentials.sql",
        "20260820_day14e_integration_catalog.sql",
        "20260820_day14g_webhook_foundation.sql",
        "20260820_day14h_external_trigger_adapter.sql",
        "20260820_day14i_external_action_adapter.sql",
      ],
      "20260821_day14j_integration_event_trigger.sql": ["20260821_day14l_integration_observability_retry.sql"],
      "20260829_day16f_workflow_lifecycle.sql": [
        "20260829_day16g_runtime_step_history_fk.sql",
        "20260829_day16h_pgcrypto_checksum_schema.sql",
      ],
    })) {
      const canonicalSql = readFileSync(resolve(migrationsDir, canonical), "utf8");
      for (const file of consolidated) {
        expect(canonicalSql).toContain(`-- BEGIN CONSOLIDATED ${file}`);
        expect(reconciliation).toContain(`-- BEGIN LEDGER RECONCILIATION ${file}`);
      }
    }
    expect(reconciliation).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(foundersMigration).toContain("every legacy value must have a non-null SHA-256 hash");
    expect(foundersMigration).toContain("derived hashes are not one-to-one");
    expect(foundersMigration).toContain("a remaining database object depends on it");
    expect(foundersMigration).toContain("DROP COLUMN invitation_code");
  });
});
