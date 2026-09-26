import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "scripts/rehearse-retained-data-transfer.mjs"), "utf8");

describe("retained-data transfer rehearsal", () => {
  it("requires explicit, distinct source and target guards", () => {
    expect(source).toContain("TRANSFER_SOURCE_TARGET_MUST_DIFFER");
    expect(source).toContain("TRANSFER_${side}_HOST_MISMATCH");
  });

  it("copies the required auth, tenant, inbox, integration, credential, and binding records in dependency order", () => {
    for (const table of ["auth\", \"users", "auth\", \"identities", "public\", \"workspaces", "public\", \"workspace_memberships", "public\", \"workspace_subscriptions", "public\", \"contacts", "public\", \"inbox_threads", "public\", \"inbox_messages", "public\", \"integrations", "public\", \"integration_credentials", "public\", \"telegram_business_connections"]) {
      expect(source).toContain(table);
    }
    expect(source.indexOf('["auth", "users"]')).toBeLessThan(source.indexOf('["public", "workspaces"]'));
    expect(source.indexOf('["public", "integrations"]')).toBeLessThan(source.indexOf('["public", "integration_credentials"]'));
  });

  it("keeps credential values opaque while verifying the configured application envelope contract", () => {
    expect(source).toContain("J10_INTEGRATION_ENCRYPTION_KEY");
    expect(source).toContain("assertEnvelopeCompatibility");
    expect(source).toContain("credentialEnvelope: 'compatible'");
    expect(source).not.toMatch(/console\.log\([^\n]*(encrypted_payload|initialization_vector|authentication_tag|fixture-password)/i);
  });

  it("accepts an explicitly ledgerless source but derives an exact SHA-bound target ledger", () => {
    expect(source).toContain("J10_TRANSFER_CANONICAL_SHA");
    expect(source).toContain("TRANSFER_CANONICAL_SHA_MISMATCH");
    expect(source).toContain("readdirSync(resolve(repositoryRoot, \"supabase\", \"migrations\")");
    expect(source).toContain("targetLedger.map((row) => row.version).join(\",\") !== canonical.versions.join(\",\")");
    expect(source).toContain("TRANSFER_TARGET_CANONICAL_LEDGER_MISMATCH");
    expect(source).not.toMatch(/canonicalMigrationCount\s*=\s*\d+/);
  });

  it("fails closed on second execution, SHA or target ledger drift, count drift, or RLS failure", () => {
    for (const code of ["TRANSFER_TARGET_NOT_EMPTY", "TRANSFER_CANONICAL_SHA_MISMATCH", "TRANSFER_TARGET_CANONICAL_LEDGER_MISMATCH", "TRANSFER_ROW_COUNT_MISMATCH", "TRANSFER_REFERENTIAL_INTEGRITY_FAILED", "TRANSFER_TENANT_ISOLATION_FAILED", "TRANSFER_AUTH_LOGIN_FAILED"]) {
      expect(source).toContain(code);
    }
  });

  it("uses one target transaction for the dependency-ordered import", () => {
    expect(source).toContain("await target.begin(async (tx) =>");
    expect(source).toContain("copyTable(source, tx, pair)");
  });

  it("does not dispatch providers, schedules, webhooks, or billing activity", () => {
    expect(source).not.toMatch(/cron\.schedule|net\.http_post|fetch\(['\"]https:\/\//i);
    expect(source).not.toContain("/api/workers/");
  });
});
