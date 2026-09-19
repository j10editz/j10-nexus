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
    expect(migrationNames).toContain("20261011_tenantization_contract_reconciliation.sql");
    expect(migrationNames).toContain("20261012_crm_contacts_tenantization_reconciliation.sql");
    expect(migrationNames).toContain("20261013_integration_credential_envelope_reconciliation.sql");
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

  it("reconciles every legacy tenant column before tenant-scoped indexes and RLS", () => {
    const sql = readFileSync(resolve(migrationsDir, "20260916_global_tenantization_launch_integrity.sql"), "utf8");
    const reconciliation = readFileSync(resolve(migrationsDir, "20261011_tenantization_contract_reconciliation.sql"), "utf8");
    const guard = sql.indexOf("Earlier product migrations created several of these relations user-scoped.");
    expect(guard).toBeGreaterThan(0);
    for (const table of ["company_knowledge_documents", "marketing_campaigns", "finance_invoices", "workforce_members", "website_funnels", "commerce_products", "commerce_orders", "notifications", "provider_subscriptions", "webhook_endpoints"]) {
      expect(sql.indexOf(`'${table}'`)).toBeGreaterThanOrEqual(guard);
      expect(sql.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`)).toBeGreaterThan(guard);
      expect(reconciliation).toContain(`'${table}'`);
    }
    expect(sql).toContain("Backfill assertion failed: %.workspace_id is unresolved.");
    expect(reconciliation).toContain("Tenantization reconciliation failed: %.workspace_id is unresolved.");
  });

  it("keeps multi-workspace CRM ownership unresolved instead of choosing a tenant", () => {
    const sql = readFileSync(resolve(migrationsDir, "20260917_tier0f_runtime_tenant_certification.sql"), "utf8");
    const crmBackfill = sql.slice(sql.indexOf("UPDATE public.crm_contacts legacy"), sql.indexOf("ALTER TABLE public.crm_contacts ALTER COLUMN workspace_id SET NOT NULL"));
    expect(crmBackfill).toContain("HAVING count(DISTINCT workspace_id) = 1");
    expect(crmBackfill).toContain("CRM consolidation aborted: crm_contacts.workspace_id is unresolved.");
    expect(crmBackfill).not.toContain("ORDER BY");
    const reconciliation = readFileSync(resolve(migrationsDir, "20261012_crm_contacts_tenantization_reconciliation.sql"), "utf8");
    expect(reconciliation).toContain("HAVING count(DISTINCT workspace_id)=1");
    expect(reconciliation).toContain("CRM reconciliation aborted: crm_contacts.workspace_id is unresolved.");
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

  it("replaces the credential envelope signature without cascade and restores tenant-safe access", () => {
    const foundation = readFileSync(
      resolve(migrationsDir, "20260820_day14b_integrations.sql"),
      "utf8",
    );
    const freshReconciliation = readFileSync(
      resolve(migrationsDir, "20261009_migration_chain_reconciliation.sql"),
      "utf8",
    );
    const ledgeredReconciliation = readFileSync(
      resolve(migrationsDir, "20261013_integration_credential_envelope_reconciliation.sql"),
      "utf8",
    );

    for (const sql of [foundation, freshReconciliation, ledgeredReconciliation]) {
      const start = sql.indexOf("drop function if exists public.get_integration_credential_envelope(uuid);");
      const definitionEnd = sql.indexOf("$$;", start) + 3;
      const securityEnd = sql.indexOf("grant execute on function public.get_integration_credential_envelope(uuid)", start);
      const envelope = sql.slice(start, definitionEnd);
      const security = sql.slice(definitionEnd, securityEnd);

      expect(start).toBeGreaterThanOrEqual(0);
      expect(envelope).not.toMatch(/drop\s+function[^;]*\bcascade\b/i);
      expect(envelope).toMatch(/security definer/i);
      expect(envelope).toMatch(/set search_path = pg_catalog, public/i);
      expect(security).toMatch(/owner to postgres/i);
      expect(security).toMatch(/revoke all[\s\S]*from public, anon/i);
    }

    for (const sql of [freshReconciliation, ledgeredReconciliation]) {
      const start = sql.indexOf("drop function if exists public.get_integration_credential_envelope(uuid);");
      const envelope = sql.slice(start, sql.indexOf("$$;", start) + 3);
      expect(envelope).toContain("workspace_id uuid");
      expect(envelope).not.toContain("rotated_at");
      expect(envelope).not.toContain("last_used_at");
      expect(envelope).toContain("has_workspace_role");
    }
  });
});
