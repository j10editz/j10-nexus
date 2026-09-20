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
  fingerprint,
  normalizeManifest,
  parseSupabaseQueryOutput,
} from "../../scripts/lib/legacy-production-adoption.mjs";

const canonical = {
  relations: [{ schema: "public", name: "workspaces", kind: "r", rls: true }],
  columns: [{ table: "workspaces", name: "id", type: "uuid", notNull: true }],
  functions: [{ name: "has_workspace_role", identity: "target_workspace_id uuid, allowed_roles text[]" }],
};

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
    const artifact = buildCanonicalManifestArtifact({
      canonicalSourceSha: "0608a640a3250c29eb3a04e134a7ff1d6bb48bc0",
      manifest: canonical,
      versions: Array.from({ length: 45 }, (_, index) => index === 44 ? "20261013" : String(20260820 + index)),
    });
    expect(artifact.canonicalSourceSha).toBe("0608a640a3250c29eb3a04e134a7ff1d6bb48bc0");
    expect(artifact.certifiedMigrationRange.through).toBe("20261013");
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(artifact)).not.toMatch(/https?:\/\/[^\s/:@]+:[^\s@]+@|\b(?:gh[pousr]_|sk_|eyJ)/i);
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

  it("uses the Windows-compatible npx command for local CLI fallbacks", () => {
    for (const file of [
      "scripts/export-legacy-adoption-manifest.mjs",
      "scripts/certify-legacy-production-adoption.mjs",
      "scripts/apply-legacy-production-ledger-adoption.mjs",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toContain('process.platform === "win32" ? "npx.cmd" : "npx"');
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
