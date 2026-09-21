#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ADOPTION_CUTOFF,
  PRODUCTION_DATABASE_HOST,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
  buildCertificationReport,
  compareCanonicalContracts,
  inventoryLegacyExtras,
  invariantSql,
  loadCanonicalManifestArtifact,
  migrationVersions,
  parseSupabaseQueryOutput,
  schemaManifestSql,
  validateLegacyExtraSecurity,
} from "./lib/legacy-production-adoption.mjs";
import { runSupabaseCli } from "./lib/supabase-cli-process.mjs";

const repoRoot = resolve(import.meta.dirname, "..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function queryProduction(sql) {
  return parseSupabaseQueryOutput(runSupabaseCli({ args: ["db", "query", "--linked", "--project-ref", PRODUCTION_PROJECT_REF, "--output", "json"], sql, cwd: repoRoot })).rows;
}

async function main() {
  const target = argument("--target");
  const hostname = argument("--hostname");
  const canonicalManifestPath = argument("--canonical-manifest");
  const expectedSourceSha = argument("--expected-source-sha");
  const reportPath = argument("--report");
  const dryRun = process.argv.includes("--dry-run");

  if (!target || !hostname || !canonicalManifestPath || !expectedSourceSha || !reportPath || !dryRun) {
    throw new Error("USAGE: --target --hostname --canonical-manifest --expected-source-sha --report --dry-run are required. This command never initializes ledger history.");
  }
  assertProductionTarget(target, hostname);
  const versions = migrationVersions(resolve(repoRoot, "supabase", "migrations"));
  const canonicalArtifact = loadCanonicalManifestArtifact(resolve(repoRoot, canonicalManifestPath), {
    expectedSourceSha,
    expectedVersions: versions,
  });
  const canonical = canonicalArtifact.manifest;
  const [productionRow] = queryProduction(schemaManifestSql);
  if (!productionRow?.manifest) throw new Error("PRODUCTION_SCHEMA_MANIFEST_UNAVAILABLE");
  const comparison = compareCanonicalContracts(canonical, productionRow.manifest);
  const legacyExtras = inventoryLegacyExtras(canonical, productionRow.manifest);
  const invariants = queryProduction(invariantSql).map((row) => ({
    name: row.name,
    count: Number(row.count),
    status: Number(row.count) === 0 ? "pass" : "fail",
  }));
  if (!comparison.equal) invariants.push({ name: "normalized_schema_manifest", count: 1, status: "fail" });
  const extraSecurityIssues = validateLegacyExtraSecurity(productionRow.manifest, legacyExtras);
  if (extraSecurityIssues.length !== 0) invariants.push({ name: "legacy_extra_security", count: extraSecurityIssues.length, status: "fail" });

  const report = buildCertificationReport({
    canonicalCommit: canonicalArtifact.canonicalSourceSha,
    generatedAt: new Date().toISOString(),
    manifest: canonical,
    invariants,
    targetProjectRef: target,
  });
  report.versionsProvenByState = versions;
  report.canonicalArtifactSha256 = canonicalArtifact.sha256;
  report.legacyExtras = legacyExtras;
  report.legacyExtraSecurityIssues = extraSecurityIssues;
  report.mode = "dry-run";
  mkdirSync(dirname(resolve(repoRoot, reportPath)), { recursive: true });
  writeFileSync(resolve(repoRoot, reportPath), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

  if (report.result !== "pass") {
    throw new Error("ADOPTION_CERTIFICATION_FAILED: schema or bounded invariant mismatch; no migration history was modified.");
  }
  console.log(`ADOPTION_CERTIFICATION_PASS target=${target} through=${ADOPTION_CUTOFF} fingerprint=${report.normalizedSchemaFingerprint}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "ADOPTION_CERTIFICATION_FAILED");
  process.exit(1);
});
