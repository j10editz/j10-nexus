#!/usr/bin/env node
import { resolve } from "node:path";
import {
  PRODUCTION_DATABASE_HOST,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
  parseSupabaseQueryOutput,
} from "./lib/legacy-production-adoption.mjs";
import { runSupabaseCli } from "./lib/supabase-cli-process.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const targetIndex = process.argv.indexOf("--target");
const hostnameIndex = process.argv.indexOf("--hostname");
const target = targetIndex < 0 ? undefined : process.argv[targetIndex + 1];
const hostname = hostnameIndex < 0 ? undefined : process.argv[hostnameIndex + 1];
if (!target || !hostname) throw new Error("USAGE: --target --hostname");
assertProductionTarget(target, hostname);

// A workflow has no canonical workspace-scoped parent FK. Therefore the only
// admissible fallback is exactly one active membership for its owner. This
// returns aggregates only: no workflow, user, workspace, or customer fields.
const sql = `
WITH membership_counts AS (
  SELECT user_id, count(DISTINCT workspace_id) FILTER (WHERE status = 'active') AS active_workspace_count
  FROM public.workspace_memberships
  GROUP BY user_id
), classified AS (
  SELECT CASE
    WHEN COALESCE(m.active_workspace_count, 0) = 1 THEN 'membership_derived'
    WHEN COALESCE(m.active_workspace_count, 0) = 0 THEN 'unresolved'
    ELSE 'ambiguous'
  END AS classification
  FROM public.workflows workflow
  LEFT JOIN membership_counts m ON m.user_id = workflow.user_id
)
SELECT
  count(*) FILTER (WHERE classification = 'membership_derived')::bigint AS membership_derived,
  count(*) FILTER (WHERE classification = 'ambiguous')::bigint AS ambiguous,
  count(*) FILTER (WHERE classification = 'unresolved')::bigint AS unresolved,
  count(*)::bigint AS total
FROM classified;`;

const raw = runSupabaseCli({
  args: ["db", "query", "--linked", "--project-ref", PRODUCTION_PROJECT_REF, "--output", "json"],
  sql,
  cwd: repoRoot,
});
const [result] = parseSupabaseQueryOutput(raw).rows;
if (!result || !["membership_derived", "ambiguous", "unresolved", "total"].every((key) => Object.hasOwn(result, key))) {
  throw new Error("WORKFLOW_OWNERSHIP_PREFLIGHT_OUTPUT_INVALID");
}
console.log(JSON.stringify({
  target,
  hostname: PRODUCTION_DATABASE_HOST,
  membershipDerived: Number(result.membership_derived),
  ambiguous: Number(result.ambiguous),
  unresolved: Number(result.unresolved),
  total: Number(result.total),
}, null, 2));
