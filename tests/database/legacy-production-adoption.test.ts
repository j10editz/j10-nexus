import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRODUCTION_DATABASE_HOST,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
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
