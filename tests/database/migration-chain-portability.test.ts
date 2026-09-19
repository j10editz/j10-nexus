import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

describe("Supabase migration-chain portability", () => {
  it("uses valid numeric versions and removes the skipped executable migrations", () => {
    const migrationNames = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
    const invalidVersionNames = migrationNames.filter((name) => !/^\d+_.+\.sql$/.test(name));
    const versions = migrationNames.map((name) => name.match(/^(\d+)_/)?.[1]);
    const ordered = [...migrationNames].sort();

    expect(invalidVersionNames).toEqual([]);
    expect(new Set(versions).size).toBe(versions.length);
    expect(migrationNames).toContain("20261009_migration_chain_reconciliation.sql");
    expect(migrationNames).not.toContain("20260915b_atomic_founder_ownership_transfer.sql");
    expect(migrationNames).not.toContain("20260918b_restrict_tier0g_rpc_execute.sql");
    expect(migrationNames).not.toContain("20260919b_restrict_tier1_authenticated_table_privileges.sql");
    expect(ordered.indexOf("20261009_migration_chain_reconciliation.sql"))
      .toBeGreaterThan(ordered.indexOf("20261007_whatsapp_embedded_signup.sql"));
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

    expect(identityMigration).toContain("Skipping historical founder ownership transfer");
    expect(tier0gMigration).toContain("Preserve the hardening formerly skipped in invalid migration 20260918b");
    expect(tier1Migration).toContain("Preserve the authenticated-role reset formerly skipped in invalid 20260919b");
    expect(reconciliation).toContain("Skipping historical founder ownership reconciliation");
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
