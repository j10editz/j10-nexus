#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRODUCTION_DATABASE_HOST,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
  migrationVersions,
  parseSupabaseQueryOutput,
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
    output = execFileSync("npx", ["--no-install", "supabase", ...args], options);
  }
  return parseSupabaseQueryOutput(output);
}

function queryProduction(sql) {
  return runSupabase(["db", "query", "--linked", "--project-ref", PRODUCTION_PROJECT_REF, "--output", "json", sql]).rows;
}

function applicationCounts() {
  const tables = queryProduction("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname");
  return Object.fromEntries(tables.map(({ relname }) => {
    const escaped = String(relname).replaceAll('"', '""');
    const [row] = queryProduction(`SELECT count(*)::bigint AS count FROM public.\"${escaped}\"`);
    return [relname, Number(row.count)];
  }));
}

function migrationLedgerVersions() {
  const [row] = queryProduction("SELECT to_regclass('supabase_migrations.schema_migrations')::text AS relation");
  if (!row?.relation) return [];
  return queryProduction("SELECT version::text FROM supabase_migrations.schema_migrations ORDER BY version").map(({ version }) => version);
}

async function main() {
  const target = argument("--target");
  const hostname = argument("--hostname");
  const reportPath = argument("--report");
  if (!process.argv.includes("--apply-ledger") || !target || !hostname || !reportPath) {
    throw new Error("USAGE: --target --hostname --report --apply-ledger are required. This command repairs only Supabase migration history.");
  }
  assertProductionTarget(target, hostname);
  const report = JSON.parse(readFileSync(resolve(repoRoot, reportPath), "utf8"));
  if (report.result !== "pass" || report.targetProjectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error("ADOPTION_REPORT_NOT_APPROVED: a passing report for the exact Production project is required.");
  }

  const versions = migrationVersions(resolve(repoRoot, "supabase", "migrations"));
  const beforeLedger = migrationLedgerVersions();
  if (beforeLedger.length !== 0) throw new Error("LEDGER_NOT_EMPTY: refuse to overwrite or mix historical adoption entries.");
  const beforeCounts = applicationCounts();

  // Supabase's supported repair command only records the supplied versions; it
  // does not execute migration SQL. This code has no schema-reset or raw-DDL path.
  const repairArgs = ["migration", "repair", "--linked", "--project-ref", PRODUCTION_PROJECT_REF, "--status", "applied", ...versions];
  try {
    execFileSync("supabase", repairArgs, { cwd: repoRoot, stdio: "inherit" });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--no-install", "supabase", ...repairArgs], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
  }

  const afterLedger = migrationLedgerVersions();
  const afterCounts = applicationCounts();
  if (afterLedger.length !== versions.length || new Set(afterLedger).size !== versions.length || afterLedger.some((version, index) => version !== versions[index])) {
    throw new Error("LEDGER_REPAIR_VERIFICATION_FAILED");
  }
  if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) {
    throw new Error("APPLICATION_TABLE_COUNTS_CHANGED: stop and investigate before any further migration.");
  }
  console.log(`LEDGER_ADOPTION_PASS versions=${versions.length} target=${PRODUCTION_PROJECT_REF}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "LEDGER_ADOPTION_FAILED");
  process.exit(1);
});
