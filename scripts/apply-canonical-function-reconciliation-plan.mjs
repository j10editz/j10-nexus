#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSupabaseQueryOutput, schemaManifestSql } from "./lib/legacy-production-adoption.mjs";
import { validateCanonicalFunctionPlan } from "./lib/canonical-function-reconciliation-plan.mjs";
import { runSupabaseCli } from "./lib/supabase-cli-process.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const index = process.argv.indexOf("--plan");
const planFile = index < 0 ? undefined : process.argv[index + 1];
if (!planFile || !process.argv.includes("--local")) {
  throw new Error("USAGE: --plan <access-controlled-plan.json> --local; Production is intentionally unsupported.");
}

const parsed = JSON.parse(readFileSync(resolve(repoRoot, planFile), "utf8"));
const functions = parsed.functions;
validateCanonicalFunctionPlan(functions);

// CREATE OR REPLACE only defines functions. It cannot invoke a function body,
// schedule cron work, dispatch a worker, or make a provider request.
const definitions = functions.map((entry) => entry.definition).join("\n");
runSupabaseCli({ args: ["db", "query", "--local", "--output", "json"], sql: `BEGIN;\n${definitions}\nCOMMIT;`, cwd: repoRoot });

const [row] = parseSupabaseQueryOutput(runSupabaseCli({ args: ["db", "query", "--local", "--output", "json"], sql: schemaManifestSql, cwd: repoRoot })).rows;
const actual = new Map((row?.manifest?.functions ?? []).map((entry) => [`public.${entry.name}(${entry.identity})`, entry.definitionHash]));
for (const entry of functions) {
  const key = entry.regprocedure.replace(/\b(integer|text|uuid|jsonb|boolean|timestamp with time zone)(?=,|\))/g, "$1");
  const expectedIdentity = entry.regprocedure.slice(entry.regprocedure.indexOf("(") + 1, -1);
  const candidate = [...actual.entries()].find(([name]) => name.startsWith(entry.regprocedure.slice(0, entry.regprocedure.indexOf("("))) && name.includes(expectedIdentity));
  if (!candidate || candidate[1] !== entry.definitionHash) throw new Error(`CANONICAL_FUNCTION_RECONCILIATION_VERIFY_FAILED:${entry.regprocedure}`);
}
console.log(`CANONICAL_FUNCTION_RECONCILIATION_PASS functions=${functions.length}`);
