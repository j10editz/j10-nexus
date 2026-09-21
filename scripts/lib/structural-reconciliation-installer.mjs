import { fingerprint, normalizeManifest } from "./legacy-production-adoption.mjs";
import { RECONCILIATION_RELATIONS, sha256 } from "./canonical-function-reconciliation-plan.mjs";

// This is a *closed*, additive installer plan.  It is deliberately not a
// schema dump runner: each item is an object extracted from the executed
// disposable schema and compared to its canonical fingerprint before it can
// be selected.  Operational objects (cron jobs and HTTP dispatch) are not a
// member of this plan.
const SECTIONS = Object.freeze([
  "relations", "columns", "constraints", "indexes", "functions", "triggers", "policies", "grants",
]);

const PHASES = Object.freeze({
  relations: 10,
  columns: 20,
  constraints: 30,
  indexes: 40,
  functions: 50,
  triggers: 60,
  policies: 70,
  grants: 80,
});

const OPERATIONAL_PATTERN = /\b(?:cron\.schedule|cron\.unschedule|net\.http_post|pg_net)\b/i;

function stableKey(section, item) {
  if (section === "functions") return `function:${item.regprocedure ?? `public.${item.name}(${item.identity ?? ""})`}`;
  if (section === "relations") return `relation:${item.schema ?? "public"}.${item.name}`;
  if (section === "columns") return `column:${item.table}.${item.name}`;
  if (section === "constraints") return `constraint:${item.table}.${item.name}`;
  if (section === "indexes") return `index:${item.schema ?? "public"}.${item.name}`;
  if (section === "triggers") return `trigger:${item.table}.${item.name}`;
  if (section === "policies") return `policy:${item.table}.${item.name}`;
  if (section === "grants") return `grant:${item.object}:${item.grantee}:${item.privilege}`;
  throw new Error(`STRUCTURAL_PLAN_UNKNOWN_SECTION:${section}`);
}

function itemHash(item) {
  return sha256(JSON.stringify(normalizeManifest(item)));
}

function selected(section, item) {
  if (section === "functions") return true;
  if (section === "relations") return RECONCILIATION_RELATIONS.includes(item.name);
  return RECONCILIATION_RELATIONS.includes(item.table ?? item.object?.replace(/^public\./, ""));
}

function ensureSafeDefinition(item) {
  const text = String(item.definition ?? item.definitionSql ?? "");
  if (OPERATIONAL_PATTERN.test(text)) throw new Error(`STRUCTURAL_PLAN_OPERATIONAL_OBJECT:${item.regprocedure ?? item.name}`);
}

/**
 * Produce an execution-independent plan for the observed legacy drift.
 * Missing canonical objects are installed in dependency order; an existing
 * same-name object with a different normalized fingerprint is a fail-closed
 * collision, never an implicit ALTER/DROP/replacement.
 */
export function buildDependencyOrderedInstaller(canonical, observed) {
  const actions = [];
  for (const section of SECTIONS) {
    const canonicalItems = (canonical?.[section] ?? []).filter((item) => selected(section, item));
    const observedByKey = new Map((observed?.[section] ?? []).map((item) => [stableKey(section, item), item]));
    for (const item of canonicalItems) {
      const key = stableKey(section, item);
      const existing = observedByKey.get(key);
      if (!existing) {
        ensureSafeDefinition(item);
        actions.push({ phase: PHASES[section], section, key, expectedFingerprint: itemHash(item), item });
        continue;
      }
      if (itemHash(existing) !== itemHash(item)) {
        throw new Error(`STRUCTURAL_PLAN_INCOMPATIBLE_COLLISION:${key}`);
      }
    }
  }
  return actions.sort((left, right) => left.phase - right.phase || left.key.localeCompare(right.key));
}

/**
 * Test-only observed-drift executor.  It models the only permitted result of
 * the installer: add exact missing canonical objects.  It neither executes
 * SQL nor has a channel capable of dispatching network/provider work.
 */
export function applyInstallerToFixture(observed, actions) {
  const result = structuredClone(observed);
  for (const action of actions) {
    if (!SECTIONS.includes(action.section) || !Number.isInteger(action.phase)) throw new Error("STRUCTURAL_PLAN_ACTION_INVALID");
    ensureSafeDefinition(action.item);
    const entries = result[action.section] ?? (result[action.section] = []);
    if (entries.some((entry) => stableKey(action.section, entry) === action.key)) {
      throw new Error(`STRUCTURAL_PLAN_NON_ADDITIVE_ACTION:${action.key}`);
    }
    entries.push(structuredClone(action.item));
  }
  return result;
}

export function selectedManifestFingerprint(manifest) {
  const selectedManifest = Object.fromEntries(SECTIONS.map((section) => [section, (manifest?.[section] ?? []).filter((item) => selected(section, item))]));
  return fingerprint(selectedManifest);
}

function quoted(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function relationSql(item) {
  if (typeof item.definitionSql !== "string" || !/^CREATE TABLE\b/i.test(item.definitionSql.trim())) {
    throw new Error(`STRUCTURAL_PLAN_DEFINITION_REQUIRED:relation:${item.name}`);
  }
  return item.definitionSql;
}

/**
 * Render only additive DDL for a plan sourced from the executed disposable
 * database.  This function intentionally refuses to synthesize table
 * definitions or mutate same-name existing objects.  A caller must provide
 * the reviewed private definitions export for objects whose catalog metadata
 * cannot safely be reconstructed (notably relations and functions).
 */
export function renderAdditiveInstallerSql(actions) {
  const statements = ["BEGIN;"];
  for (const action of actions) {
    const item = action.item;
    let sql;
    switch (action.section) {
      case "relations": sql = relationSql(item); break;
      case "columns":
        sql = `ALTER TABLE public.${quoted(item.table)} ADD COLUMN IF NOT EXISTS ${quoted(item.name)} ${item.type}${item.notNull ? " NOT NULL" : ""}${item.default ? ` DEFAULT ${item.default}` : ""};`;
        break;
      case "constraints":
        if (!item.definition) throw new Error(`STRUCTURAL_PLAN_DEFINITION_REQUIRED:constraint:${item.name}`);
        sql = `ALTER TABLE public.${quoted(item.table)} ADD CONSTRAINT ${quoted(item.name)} ${item.definition};`;
        break;
      case "indexes":
        if (!item.definition || !/^CREATE (?:UNIQUE )?INDEX\b/i.test(item.definition.trim())) throw new Error(`STRUCTURAL_PLAN_DEFINITION_REQUIRED:index:${item.name}`);
        sql = item.definition.replace(/^CREATE (UNIQUE )?INDEX\b/i, (_, unique = "") => `CREATE ${unique}INDEX IF NOT EXISTS`);
        break;
      case "functions":
        if (!item.definition) throw new Error(`STRUCTURAL_PLAN_DEFINITION_REQUIRED:function:${item.regprocedure ?? item.name}`);
        sql = item.definition;
        break;
      case "triggers":
        if (!item.definition || !/^CREATE TRIGGER\b/i.test(item.definition.trim())) throw new Error(`STRUCTURAL_PLAN_DEFINITION_REQUIRED:trigger:${item.name}`);
        sql = item.definition;
        break;
      case "policies":
        if (!item.definitionSql || !/^CREATE POLICY\b/i.test(item.definitionSql.trim())) throw new Error(`STRUCTURAL_PLAN_DEFINITION_REQUIRED:policy:${item.name}`);
        sql = item.definitionSql;
        break;
      case "grants":
        if (!item.definitionSql || !/^GRANT\b/i.test(item.definitionSql.trim())) throw new Error(`STRUCTURAL_PLAN_DEFINITION_REQUIRED:grant:${item.object}`);
        sql = item.definitionSql;
        break;
      default: throw new Error(`STRUCTURAL_PLAN_UNKNOWN_SECTION:${action.section}`);
    }
    ensureSafeDefinition({ ...item, definition: sql });
    statements.push(sql.endsWith(";") ? sql : `${sql};`);
  }
  statements.push("COMMIT;");
  return statements.join("\n");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull only CREATE TABLE statements for the reviewed missing relations from
 * the private pg_dump export.  The output stays private because it is
 * executable source material; it is never placed in a public artifact. */
export function tableDefinitionsFromPrivateExport(sql, relationNames) {
  const definitions = new Map();
  for (const name of relationNames) {
    const identifier = escapeRegex(name);
    const match = sql.match(new RegExp(`CREATE TABLE public\\.\\"?${identifier}\\"? \\([\\s\\S]*?\\n\\);`, "i"));
    if (!match) throw new Error(`STRUCTURAL_PLAN_TABLE_DEFINITION_UNAVAILABLE:${name}`);
    definitions.set(name, match[0]);
  }
  return definitions;
}

function policyDefinition(item) {
  const command = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE", "*": "ALL" }[item.command] ?? item.command;
  if (!command || !Array.isArray(item.roles) || item.roles.length === 0) throw new Error(`STRUCTURAL_PLAN_POLICY_METADATA_INVALID:${item.name}`);
  const using = item.using ? ` USING (${item.using})` : "";
  const check = item.check ? ` WITH CHECK (${item.check})` : "";
  return `CREATE POLICY ${quoted(item.name)} ON public.${quoted(item.table)} FOR ${command} TO ${item.roles.map((role) => role === "PUBLIC" ? "PUBLIC" : quoted(role)).join(", ")}${using}${check}`;
}

function grantDefinition(item) {
  if (!item.object || !item.grantee || !item.privilege) throw new Error("STRUCTURAL_PLAN_GRANT_METADATA_INVALID");
  return `GRANT ${item.privilege} ON TABLE public.${quoted(item.object.replace(/^public\./, ""))} TO ${quoted(item.grantee)}`;
}

/** Attach executed, private DDL to an otherwise non-executable plan. */
export function hydrateInstallerPlan(privatePlan, privateDefinitionExport) {
  const definitions = tableDefinitionsFromPrivateExport(privateDefinitionExport, privatePlan.relations.map((relation) => relation.name));
  return {
    ...privatePlan,
    relations: privatePlan.relations.map((relation) => ({ ...relation, definitionSql: definitions.get(relation.name) })),
    policies: privatePlan.policies.map((policy) => ({ ...policy, definitionSql: policyDefinition(policy) })),
    grants: privatePlan.grants.map((grant) => ({ ...grant, definitionSql: grantDefinition(grant) })),
  };
}
