#!/usr/bin/env node
import { resolve } from "node:path";
import {
  LEGACY_RUNTIME_CONTRACTS,
  LEGACY_WORKFLOW_RELATIONS,
  PRODUCTION_DATABASE_HOST,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
  parseSupabaseQueryOutput,
} from "./lib/legacy-production-adoption.mjs";
import { runSupabaseCli } from "./lib/supabase-cli-process.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const args = process.argv;
const target = args[args.indexOf("--target") + 1];
const hostname = args[args.indexOf("--hostname") + 1];
if (!target || !hostname) throw new Error("USAGE: --target --hostname");
assertProductionTarget(target, hostname);

// This query returns only relation metadata and aggregate counts. It never selects
// an application row or any credential, customer, message, or identity field.
const sql = `
WITH selected(name) AS (VALUES ${LEGACY_WORKFLOW_RELATIONS.map((name) => `('${name}')`).join(",")})
SELECT jsonb_agg(jsonb_build_object(
  'name', selected.name,
  'exists', relation.oid IS NOT NULL,
  'columns', COALESCE(columns.columns, '[]'::jsonb),
  'constraints', COALESCE(constraints.constraints, '[]'::jsonb),
  'indexes', COALESCE(indexes.indexes, '[]'::jsonb),
  'rls', COALESCE(relation.relrowsecurity, false),
  'policies', COALESCE(policies.policies, '[]'::jsonb),
  'grants', COALESCE(grants.grants, '[]'::jsonb),
  'dependentFunctions', COALESCE(functions.functions, '[]'::jsonb),
  'dependentTriggers', COALESCE(triggers.triggers, '[]'::jsonb),
  'rowCount', COALESCE(counts.row_count, 0)
) ORDER BY selected.name) AS extras
FROM selected
LEFT JOIN pg_class relation ON relation.relname = selected.name
  AND relation.relnamespace = 'public'::regnamespace
LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('name', a.attname, 'type', pg_catalog.format_type(a.atttypid,a.atttypmod), 'notNull', a.attnotnull) ORDER BY a.attnum) AS columns FROM pg_attribute a WHERE a.attrelid=relation.oid AND a.attnum>0 AND NOT a.attisdropped) columns ON true
LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('name', con.conname, 'type', con.contype) ORDER BY con.conname) AS constraints FROM pg_constraint con WHERE con.conrelid=relation.oid) constraints ON true
LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('name', i.relname, 'definition', pg_get_indexdef(i.oid)) ORDER BY i.relname) AS indexes FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=relation.oid) indexes ON true
LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('name', pol.polname, 'command', pol.polcmd, 'roles', ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(pol.polroles) ORDER BY rolname)) ORDER BY pol.polname) AS policies FROM pg_policy pol WHERE pol.polrelid=relation.oid) policies ON true
LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type) ORDER BY grantee, privilege_type) AS grants FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=selected.name) grants ON true
LEFT JOIN LATERAL (SELECT jsonb_agg(p.proname ORDER BY p.proname) AS functions FROM pg_depend d JOIN pg_proc p ON p.oid=d.objid WHERE d.refobjid=relation.oid) functions ON true
LEFT JOIN LATERAL (SELECT jsonb_agg(tg.tgname ORDER BY tg.tgname) AS triggers FROM pg_trigger tg WHERE tg.tgrelid=relation.oid AND NOT tg.tgisinternal) triggers ON true
LEFT JOIN LATERAL (SELECT count(*)::bigint AS row_count FROM pg_catalog.pg_class c WHERE c.oid=relation.oid) ignored_count ON true
LEFT JOIN LATERAL (SELECT CASE WHEN relation.oid IS NULL THEN 0 ELSE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', selected.name), false, true, '')))[1]::text::bigint END AS row_count) counts ON true;`;

const output = runSupabaseCli({ args: ["db", "query", "--linked", "--project-ref", PRODUCTION_PROJECT_REF, "--output", "json"], sql, cwd: repoRoot });
const [result] = parseSupabaseQueryOutput(output).rows;
if (!result?.extras) throw new Error("LEGACY_EXTRA_AUDIT_OUTPUT_INVALID");
// The runtime columns are source-defined, not inferred from Production.
const safe = result.extras.map((extra) => ({ ...extra, runtimeRequiredColumns: LEGACY_RUNTIME_CONTRACTS[extra.name] ?? [] }));
console.log(JSON.stringify({ target, hostname: PRODUCTION_DATABASE_HOST, extras: safe }, null, 2));
