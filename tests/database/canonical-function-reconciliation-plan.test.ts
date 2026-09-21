import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  REQUIRED_FUNCTION_REGPROCEDURES,
  FUNCTION_SOURCE_MIGRATIONS,
  classifyFunctionDefinition,
  publicFunctionAttestation,
  sha256,
  validateCanonicalFunctionPlan,
  buildStructuralDefinitionPlan,
} from "../../scripts/lib/canonical-function-reconciliation-plan.mjs";

function fixture(regprocedure: string) {
  const definition = `CREATE FUNCTION ${regprocedure} RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;`;
  return {
    regprocedure,
    sourceMigration: FUNCTION_SOURCE_MIGRATIONS[regprocedure as keyof typeof FUNCTION_SOURCE_MIGRATIONS],
    identity: "",
    owner: "postgres",
    searchPath: "search_path=pg_catalog, public",
    securityDefiner: true,
    grants: [],
    dependencies: [],
    definition,
    definitionHash: sha256(definition),
    classification: classifyFunctionDefinition(definition),
  };
}

describe("canonical function reconciliation plan", () => {
  it("requires exactly the reviewed missing canonical functions and validates executed-definition fingerprints", () => {
    const plan = REQUIRED_FUNCTION_REGPROCEDURES.map(fixture);
    expect(validateCanonicalFunctionPlan(plan)).toBe(true);
    plan[0].definition = "changed";
    expect(() => validateCanonicalFunctionPlan(plan)).toThrow("CANONICAL_FUNCTION_PLAN_FINGERPRINT_INVALID");
  });

  it("pins every definition to one versioned migration source", () => {
    expect(Object.keys(FUNCTION_SOURCE_MIGRATIONS).sort()).toEqual([...REQUIRED_FUNCTION_REGPROCEDURES].sort());
    for (const [procedure, source] of Object.entries(FUNCTION_SOURCE_MIGRATIONS)) {
      expect(source).toMatch(/^2026\d{4}_.+\.sql$/);
      const functionName = procedure.match(/^public\.([^\(]+)/)?.[1];
      expect(functionName).toBeTruthy();
      expect(readFileSync(resolve(process.cwd(), "supabase/migrations", source), "utf8").toLowerCase()).toContain(`function public.${functionName}`);
    }
  });

  it("rejects incomplete or substituted procedure sets", () => {
    expect(() => validateCanonicalFunctionPlan(REQUIRED_FUNCTION_REGPROCEDURES.slice(1).map(fixture))).toThrow("CANONICAL_FUNCTION_PLAN_INCOMPLETE");
    const plan = REQUIRED_FUNCTION_REGPROCEDURES.map(fixture);
    plan[0].regprocedure = "public.unreviewed_function()";
    expect(() => validateCanonicalFunctionPlan(plan)).toThrow("CANONICAL_FUNCTION_PLAN_PROCEDURE_MISMATCH");
  });

  it("keeps executable definitions out of the public attestation while preserving security metadata", () => {
    const plan = REQUIRED_FUNCTION_REGPROCEDURES.map(fixture);
    const attestation = publicFunctionAttestation(plan);
    expect(JSON.stringify(attestation)).not.toContain("CREATE FUNCTION");
    expect(attestation).toHaveLength(REQUIRED_FUNCTION_REGPROCEDURES.length);
    expect(attestation[0]).toMatchObject({ securityDefiner: true, definitionHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("flags secrets and operational references for review without invoking them", () => {
    expect(classifyFunctionDefinition("select net.http_post('https://example.test')").operationalReferences).toContain("net.http_post");
    expect(classifyFunctionDefinition("select cron.schedule('* * * * *', 'select 1')").operationalReferences).toContain("cron.schedule");
    expect(classifyFunctionDefinition("select 'sk_example_12345678901234567890'").containsSecretLikeMaterial).toBe(true);
  });

  it("builds a closed, SHA-bound structural source plan without a whole-schema dump", () => {
    const plan = buildStructuralDefinitionPlan({
      sourceSha: "d255e6f3b19a55a82e90849031af38fd8c1f2792",
      migrationVersions: Array.from({ length: 45 }, (_, index) => index === 44 ? "20261013" : `202608${String(index).padStart(2, "0")}`),
      manifest: { relations: [{ name: "integrations" }, { name: "unrelated" }], columns: [], constraints: [], indexes: [], triggers: [], policies: [], grants: [] },
      functions: REQUIRED_FUNCTION_REGPROCEDURES.map(fixture),
    });
    expect(plan.relations).toEqual([{ name: "integrations" }]);
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
