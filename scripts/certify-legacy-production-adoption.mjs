#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ADOPTION_CUTOFF,
  PRODUCTION_DATABASE_HOST,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
  buildCertificationReport,
  compareManifests,
  invariantSql,
  migrationVersions,
  parseSupabaseQueryOutput,
  schemaManifestSql,
} from "./lib/legacy-production-adoption.mjs";

const repoRoot = resolve(import.meta.dirname, "..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function runSupabase(args) {
  const options = {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  };
  let output;
  try {
    output = execFileSync("supabase", args, options);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    output = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--no-install", "supabase", ...args], options);
  }
  return parseSupabaseQueryOutput(output);
}

function queryProduction(sql) {
  return runSupabase(["db", "query", "--linked", "--project-ref", PRODUCTION_PROJECT_REF, "--output", "json", sql]).rows;
}

function loadCanonicalManifest(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!parsed.manifest) throw new Error("CANONICAL_MANIFEST_INVALID");
  return parsed.manifest;
}

async function main() {
  const target = argument("--target");
  const hostname = argument("--hostname");
  const canonicalManifestPath = argument("--canonical-manifest");
  const reportPath = argument("--report");
  const dryRun = process.argv.includes("--dry-run");

  if (!target || !hostname || !canonicalManifestPath || !reportPath || !dryRun) {
    throw new Error("USAGE: --target --hostname --canonical-manifest --report --dry-run are required. This command never initializes ledger history.");
  }
  assertProductionTarget(target, hostname);
  const versions = migrationVersions(resolve(repoRoot, "supabase", "migrations"));
  const canonical = loadCanonicalManifest(resolve(repoRoot, canonicalManifestPath));
  const [productionRow] = queryProduction(schemaManifestSql);
  if (!productionRow?.manifest) throw new Error("PRODUCTION_SCHEMA_MANIFEST_UNAVAILABLE");
  const comparison = compareManifests(canonical, productionRow.manifest);
  const invariants = queryProduction(invariantSql).map((row) => ({
    name: row.name,
    count: Number(row.count),
    status: Number(row.count) === 0 ? "pass" : "fail",
  }));
  if (!comparison.equal) invariants.push({ name: "normalized_schema_manifest", count: 1, status: "fail" });

  const report = buildCertificationReport({
    canonicalCommit: process.env.GITHUB_SHA || "local-uncommitted-audit",
    generatedAt: new Date().toISOString(),
    manifest: canonical,
    invariants,
    targetProjectRef: target,
  });
  report.versionsProvenByState = versions;
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
