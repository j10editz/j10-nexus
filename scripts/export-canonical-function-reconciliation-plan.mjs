#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseSupabaseQueryOutput } from "./lib/legacy-production-adoption.mjs";
import {
  REQUIRED_FUNCTION_REGPROCEDURES,
  FUNCTION_SOURCE_MIGRATIONS,
  classifyFunctionDefinition,
  buildStructuralDefinitionPlan,
  publicFunctionAttestation,
  sha256,
  validateCanonicalFunctionPlan,
} from "./lib/canonical-function-reconciliation-plan.mjs";
import { runSupabaseCli } from "./lib/supabase-cli-process.mjs";
import { migrationVersions, schemaManifestSql } from "./lib/legacy-production-adoption.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const privateOutput = argument("--private-output");
const attestationOutput = argument("--attestation-output");
const sourceSha = argument("--source-sha") ?? process.env.GITHUB_SHA;

if (!privateOutput || !attestationOutput) {
  throw new Error("USAGE: --private-output <access-controlled.json> --attestation-output <non-secret.json>");
}

const values = REQUIRED_FUNCTION_REGPROCEDURES.map((value) => {
  const name = value.match(/^public\.([^\(]+)/)?.[1];
  if (!name) throw new Error("CANONICAL_FUNCTION_PLAN_PROCEDURE_MALFORMED");
  return `('${value.replaceAll("'", "''")}', '${name.replaceAll("'", "''")}')`;
}).join(",");
const sql = `
WITH requested(regprocedure, name) AS (VALUES ${values}),
resolved AS (
  SELECT requested.regprocedure, p.oid
  FROM requested
  JOIN pg_proc p ON p.proname=requested.name
  JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
)
SELECT jsonb_build_object('manifest', jsonb_build_object('functions', COALESCE(jsonb_agg(jsonb_build_object(
  'regprocedure', resolved.regprocedure,
  'identity', pg_get_function_identity_arguments(p.oid),
  'owner', pg_get_userbyid(p.proowner),
  'searchPath', COALESCE(array_to_string(p.proconfig, ','), ''),
  'securityDefiner', p.prosecdef,
  'grants', COALESCE((SELECT jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type) ORDER BY grantee, privilege_type) FROM information_schema.routine_privileges rp WHERE rp.routine_schema='public' AND rp.specific_name=p.proname || '_' || p.oid), '[]'::jsonb),
  'dependencies', COALESCE((SELECT jsonb_agg(DISTINCT pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) ORDER BY pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)) FROM pg_depend d WHERE d.objid=p.oid AND d.deptype IN ('n','a')), '[]'::jsonb),
  'definition', pg_get_functiondef(p.oid)
) ORDER BY resolved.regprocedure), '[]'::jsonb))) AS manifest
FROM resolved
JOIN pg_proc p ON p.oid=resolved.oid;
`;

try {
  const raw = runSupabaseCli({ args: ["db", "query", "--local", "--output", "json"], sql, cwd: repoRoot });
  const [row] = parseSupabaseQueryOutput(raw).rows;
  const exportedFunctions = row?.manifest?.functions;
  if (!Array.isArray(exportedFunctions) || exportedFunctions.length !== REQUIRED_FUNCTION_REGPROCEDURES.length) {
    throw new Error(`CANONICAL_FUNCTION_PLAN_UNAVAILABLE count=${Array.isArray(exportedFunctions) ? exportedFunctions.length : "none"}`);
  }
  const functions = exportedFunctions.map((entry) => ({
    ...entry,
    sourceMigration: FUNCTION_SOURCE_MIGRATIONS[entry.regprocedure],
    definitionHash: sha256(entry.definition),
    classification: classifyFunctionDefinition(entry.definition),
  }));
  validateCanonicalFunctionPlan(functions);
  const manifestRaw = runSupabaseCli({ args: ["db", "query", "--local", "--output", "json"], sql: schemaManifestSql, cwd: repoRoot });
  const [manifestRow] = parseSupabaseQueryOutput(manifestRaw).rows;
  if (!manifestRow?.manifest) throw new Error("CANONICAL_STRUCTURAL_MANIFEST_UNAVAILABLE");
  const privatePlan = {
    purpose: "access-controlled canonical structural reconciliation plan",
    ...buildStructuralDefinitionPlan({ sourceSha, migrationVersions: migrationVersions(resolve(repoRoot, "supabase", "migrations")), manifest: manifestRow.manifest, functions }),
  };
  const attestation = { purpose: "non-secret canonical function reconciliation attestation", functions: publicFunctionAttestation(functions) };
  for (const output of [privateOutput, attestationOutput]) mkdirSync(dirname(resolve(repoRoot, output)), { recursive: true });
  writeFileSync(resolve(repoRoot, privateOutput), `${JSON.stringify(privatePlan, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(resolve(repoRoot, attestationOutput), `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o600 });
  console.log(`CANONICAL_FUNCTION_PLAN_EXPORTED functions=${functions.length} attestationSha256=${sha256(JSON.stringify(attestation))}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "CANONICAL_FUNCTION_PLAN_EXPORT_FAILED");
  process.exit(1);
}
