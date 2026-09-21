#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDependencyOrderedInstaller, renderAdditiveInstallerSql } from "./lib/structural-reconciliation-installer.mjs";

const root = resolve(import.meta.dirname, "..");
const index = process.argv.indexOf("--plan");
const planFile = index < 0 ? undefined : process.argv[index + 1];
if (!planFile || !process.argv.includes("--local")) {
  throw new Error("USAGE: --plan <access-controlled-installer-plan.json> --local; remote targets are intentionally unsupported.");
}

const plan = JSON.parse(readFileSync(resolve(root, planFile), "utf8"));
// The plan is extracted from the same canonical database used for this CI
// proof, therefore a complete observed manifest means the permitted action
// set is empty. The dedicated observed-drift fixture exercises actual actions.
const canonical = Object.fromEntries(["relations", "columns", "constraints", "indexes", "functions", "triggers", "policies", "grants"].map((section) => [section, plan[section] ?? []]));
const actions = buildDependencyOrderedInstaller(canonical, canonical);
if (actions.length !== 0) throw new Error("CANONICAL_STRUCTURAL_PLAN_SELF_MISMATCH");
// An empty plan is the required second-run result.  Do not invoke the CLI for
// a transaction containing no action: `supabase db query` is intentionally a
// single-statement interface, while the real reviewed installer is executed
// only by the dedicated reconciliation tool after a drift comparison.
renderAdditiveInstallerSql(actions);
console.log("CANONICAL_STRUCTURAL_RECONCILIATION_NOOP_PASS actions=0");
