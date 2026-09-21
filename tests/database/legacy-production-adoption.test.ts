import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRODUCTION_DATABASE_HOST,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
  buildCanonicalManifestArtifact,
  buildCertificationReport,
  compareManifests,
  compareCanonicalContracts,
  fingerprint,
  inventoryLegacyExtras,
  migrationVersions,
  validateLegacyExtraSecurity,
  validateCanonicalManifestArtifact,
  normalizeManifest,
  parseSupabaseQueryOutput,
} from "../../scripts/lib/legacy-production-adoption.mjs";

const canonical = {
  relations: [{ schema: "public", name: "workspaces", kind: "r", rls: true }],
  columns: [{ table: "workspaces", name: "id", type: "uuid", notNull: true }],
  functions: [{ name: "has_workspace_role", identity: "target_workspace_id uuid, allowed_roles text[]" }],
};
const migrationSet = migrationVersions(resolve(process.cwd(), "supabase", "migrations"));
const canonicalSourceSha = "8efd3b1722a1b3853b26d88392a3671ac1aee990";

function canonicalArtifact() {
  return buildCanonicalManifestArtifact({ canonicalSourceSha, manifest: canonical, versions: migrationSet });
}

describe("legacy Production adoption", () => {
  it("accepts only the explicit Production project and hostname", () => {
    expect(() => assertProductionTarget(PRODUCTION_PROJECT_REF, PRODUCTION_DATABASE_HOST)).not.toThrow();
    expect(() => assertProductionTarget("fulzdhltboospethnwfk", PRODUCTION_DATABASE_HOST)).toThrow("TARGET_MISMATCH");
    expect(() => assertProductionTarget(PRODUCTION_PROJECT_REF, "db.fulzdhltboospethnwfk.supabase.co")).toThrow("TARGET_MISMATCH");
  });

  it("produces the same fingerprint for a clean-chain and ledgerless-equivalent manifest", () => {
    const legacyLedgerless = { functions: [...canonical.functions], columns: [...canonical.columns], relations: [...canonical.relations] };
    expect(compareManifests(canonical, legacyLedgerless).equal).toBe(true);
    expect(fingerprint(canonical)).toBe(fingerprint(normalizeManifest(legacyLedgerless)));
  });

  it("builds a non-secret, checksummed artifact from the disposable canonical manifest only", () => {
    const artifact = canonicalArtifact();
    expect(artifact.canonicalSourceSha).toBe(canonicalSourceSha);
    expect(artifact.certifiedMigrationRange.through).toBe("20261013");
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(artifact)).not.toMatch(/https?:\/\/[^\s/:@]+:[^\s@]+@|\b(?:gh[pousr]_|sk_|eyJ)/i);
  });

  it("accepts only the verified versioned CI artifact and reads normalizedSchemaManifest directly", () => {
    const artifact = canonicalArtifact();
    expect(validateCanonicalManifestArtifact(artifact, { expectedSourceSha: canonicalSourceSha, expectedVersions: migrationSet })).toMatchObject({
      canonicalSourceSha,
      manifest: normalizeManifest(canonical),
      sha256: artifact.sha256,
    });
  });

  it("rejects malformed, legacy-shaped, stale, wrong-source, and modified artifacts", () => {
    const artifact = canonicalArtifact();
    const options = { expectedSourceSha: canonicalSourceSha, expectedVersions: migrationSet };
    expect(() => validateCanonicalManifestArtifact({ manifest: canonical }, options)).toThrow("CANONICAL_MANIFEST_ARTIFACT_MALFORMED");
    expect(() => validateCanonicalManifestArtifact(artifact, { ...options, expectedSourceSha: "0608a640a3250c29eb3a04e134a7ff1d6bb48bc0" })).toThrow("CANONICAL_MANIFEST_SOURCE_SHA_MISMATCH");
    expect(() => validateCanonicalManifestArtifact({ ...artifact, migrationVersions: [...artifact.migrationVersions].reverse() }, options)).toThrow("CANONICAL_MANIFEST_MIGRATION_RANGE_INVALID");
    expect(() => validateCanonicalManifestArtifact({ ...artifact, normalizedSchemaManifest: { ...artifact.normalizedSchemaManifest, relations: [] } }, options)).toThrow("CANONICAL_MANIFEST_FINGERPRINT_INVALID");
    expect(() => validateCanonicalManifestArtifact({ ...artifact, sha256: "0".repeat(64) }, options)).toThrow("CANONICAL_MANIFEST_CHECKSUM_INVALID");
  });

  it("fails closed when a representative legacy database diverges or an invariant is nonzero", () => {
    const divergent = { ...canonical, columns: [] };
    expect(compareManifests(canonical, divergent).equal).toBe(false);
    const report = buildCertificationReport({
      canonicalCommit: "test",
      generatedAt: "2026-09-20T00:00:00.000Z",
      manifest: canonical,
      targetProjectRef: PRODUCTION_PROJECT_REF,
      invariants: [
        { name: "unresolved_workspace_ownership", count: 0, status: "pass" },
        { name: "duplicate_idempotency_keys", count: 1, status: "fail" },
      ],
    });
    expect(report.result).toBe("fail");
    expect(JSON.stringify(report)).not.toMatch(/token|credential|email|phone/i);
  });

  it("inventories safe legacy extras without letting them change the canonical contract", () => {
    const production = {
      ...canonical,
      relations: [...canonical.relations, { schema: "public", name: "workflows", kind: "r", rls: true }],
      columns: [...canonical.columns, { table: "workflows", name: "workspace_id", type: "uuid", notNull: true }],
    };
    expect(compareCanonicalContracts(canonical, production).equal).toBe(true);
    expect(inventoryLegacyExtras(canonical, production)).toEqual([
      expect.objectContaining({ name: "workflows", classification: "runtime-validated-legacy-extra", runtimeRequiredColumns: ["id", "workspace_id", "status", "runs_count"] }),
    ]);
  });

  it("requires every canonical object even when a same-name legacy extra exists", () => {
    const production = { ...canonical, columns: [], relations: [...canonical.relations, { schema: "public", name: "workflow_runs", kind: "r", rls: true }] };
    expect(compareCanonicalContracts(canonical, production)).toMatchObject({ equal: false, missing: [expect.objectContaining({ section: "columns" })] });
  });

  it("accepts identity-scoped legacy extras but rejects unsafe anonymous access", () => {
    const candidate = {
      relations: [{ schema: "public", name: "workflow_runs", kind: "r", rls: true }],
      columns: [],
      policies: [{ table: "workflow_runs", name: "own", roles: [], using: "(auth.uid() = user_id)", check: null }],
    };
    const extras = [{ name: "workflow_runs", runtimeRequiredColumns: [] }];
    expect(validateLegacyExtraSecurity(candidate, extras)).toEqual([]);
    candidate.policies[0].using = "true";
    expect(validateLegacyExtraSecurity(candidate, extras)).toEqual([expect.objectContaining({ relation: "workflow_runs", reason: "public_policy_not_identity_scoped:own" })]);
  });

  it("keeps workflow canonicalization preflight aggregate-only and fail-closed", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/preflight-workflows-canonicalization.mjs"), "utf8");
    expect(source).toContain("count(DISTINCT workspace_id)");
    expect(source).toContain("WHEN COALESCE(m.active_workspace_count, 0) = 1");
    expect(source).toContain("'ambiguous'");
    expect(source).toContain("'unresolved'");
    expect(source).not.toContain("SELECT workflow.id");
  });

  it("treats subscription user_id as optional compatibility metadata and recognizes internal grants", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/lib/legacy-production-adoption.mjs"), "utf8");
    expect(source).toContain("c.relname='workspace_subscriptions' AND a.attname='user_id'");
    expect(source).toContain("'stripe','trial','internal_grant','none'");
  });

  it("keeps the only write path constrained to Supabase migration repair", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/apply-legacy-production-ledger-adoption.mjs"), "utf8");
    expect(source).toContain('"migration", "repair"');
    expect(source).toContain('"--status", "applied"');
    expect(source).toContain("LEDGER_NOT_EMPTY");
    expect(source).toContain("APPLICATION_TABLE_COUNTS_CHANGED");
    expect(source).not.toMatch(/db\s+(?:push|reset)/i);
    expect(source).not.toMatch(/\b(?:drop|truncate|cascade)\b/i);
  });

  it("exports and uploads the manifest only from the disposable local Supabase workflow", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/supabase-full-chain-certification.yml"), "utf8");
    const exporter = readFileSync(resolve(process.cwd(), "scripts/export-legacy-adoption-manifest.mjs"), "utf8");
    expect(workflow).toContain("canonical-schema-manifest-${{ github.sha }}");
    expect(workflow).toContain("--artifact-output .j10-adoption/canonical-manifest-artifact.json");
    expect(workflow).toContain("version: 2.117.0");
    expect(workflow).not.toContain("version: latest");
    expect(workflow).not.toContain(PRODUCTION_PROJECT_REF);
    expect(exporter).toContain('"--local"');
    expect(exporter).not.toContain('"--linked"');
  });

  it("routes every adoption query through the shared stdin-only CLI transport", () => {
    for (const file of [
      "scripts/export-legacy-adoption-manifest.mjs",
      "scripts/certify-legacy-production-adoption.mjs",
      "scripts/apply-legacy-production-ledger-adoption.mjs",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain('runSupabaseCli');
      expect(source).not.toContain('execFileSync');
    }
  });

  it("uses the final Supabase CLI result envelope when setup metadata precedes it", () => {
    const raw = '{"setup":true}\n{"boundary":"safe","rows":[{"manifest":true}]}';
    expect(parseSupabaseQueryOutput(raw)).toEqual({ boundary: "safe", rows: [{ manifest: true }] });
  });

  it("accepts the CLI JSON-array output mode", () => {
    expect(parseSupabaseQueryOutput('[{"manifest":true}]')).toEqual({ rows: [{ manifest: true }] });
  });

  it("accepts the CLI object-row output mode", () => {
    expect(parseSupabaseQueryOutput('{"manifest":{"relations":[]}}')).toEqual({ rows: [{ manifest: { relations: [] } }] });
  });
});
