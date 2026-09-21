import { describe, expect, it } from "vitest";
import {
  applyInstallerToFixture,
  buildDependencyOrderedInstaller,
  selectedManifestFingerprint,
  renderAdditiveInstallerSql,
  hydrateInstallerPlan,
} from "../../scripts/lib/structural-reconciliation-installer.mjs";

const functionItem = {
  regprocedure: "public.set_integration_updated_at()",
  name: "set_integration_updated_at",
  identity: "",
  definition: "CREATE OR REPLACE FUNCTION public.set_integration_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;",
};
const canonical = {
  relations: [{ schema: "public", name: "integrations", kind: "r", rls: true }],
  columns: [{ table: "integrations", name: "workspace_id", type: "uuid", nullable: false }],
  constraints: [{ table: "integrations", name: "integrations_workspace_id_fkey", definition: "FOREIGN KEY (workspace_id) REFERENCES workspaces(id)" }],
  indexes: [{ schema: "public", name: "integrations_workspace_idx", table: "integrations", definition: "CREATE INDEX integrations_workspace_idx ON public.integrations(workspace_id)" }],
  functions: [functionItem],
  triggers: [{ table: "integrations", name: "trg_integrations_updated_at", definition: "CREATE TRIGGER trg_integrations_updated_at BEFORE UPDATE ON public.integrations EXECUTE FUNCTION public.set_integration_updated_at()" }],
  policies: [{ table: "integrations", name: "integrations_select_own", command: "r", roles: ["authenticated"], using: "workspace_id = auth.uid()" }],
  grants: [{ object: "public.integrations", grantee: "authenticated", privilege: "SELECT" }],
};

describe("dependency-ordered structural reconciliation installer", () => {
  it("adds only exact missing canonical objects in dependency order and is a no-op on the second pass", () => {
    const observed = { relations: [], columns: [], constraints: [], indexes: [], functions: [], triggers: [], policies: [], grants: [], applicationRows: { integrations: 3 } };
    const actions = buildDependencyOrderedInstaller(canonical, observed);
    expect(actions.map((action) => action.section)).toEqual(["relations", "columns", "constraints", "indexes", "functions", "triggers", "policies", "grants"]);
    const reconciled = applyInstallerToFixture(observed, actions);
    expect(reconciled.applicationRows).toEqual({ integrations: 3 });
    expect(selectedManifestFingerprint(reconciled)).toBe(selectedManifestFingerprint(canonical));
    expect(buildDependencyOrderedInstaller(canonical, reconciled)).toEqual([]);
  });

  it("fails closed on a same-name incompatible object instead of replacing it", () => {
    const observed = { ...canonical, functions: [{ ...functionItem, definition: "CREATE FUNCTION public.set_integration_updated_at() RETURNS trigger LANGUAGE sql AS $$ SELECT NULL::trigger $$;" }] };
    expect(() => buildDependencyOrderedInstaller(canonical, observed)).toThrow("STRUCTURAL_PLAN_INCOMPATIBLE_COLLISION:function:public.set_integration_updated_at()");
  });

  it("rejects operational definitions and never models schedules or provider calls", () => {
    const unsafe = { ...canonical, functions: [{ ...functionItem, definition: "SELECT cron.schedule('* * * * *', 'select 1')" }] };
    expect(() => buildDependencyOrderedInstaller(unsafe, { functions: [] })).toThrow("STRUCTURAL_PLAN_OPERATIONAL_OBJECT");
  });

  it("preserves unselected legacy extras without including them in the canonical fingerprint", () => {
    const observed = { ...canonical, relations: [...canonical.relations, { schema: "public", name: "legacy_workflow_cache", kind: "r", rls: true }] };
    expect(buildDependencyOrderedInstaller(canonical, observed)).toEqual([]);
    expect(selectedManifestFingerprint(observed)).toBe(selectedManifestFingerprint(canonical));
  });

  it("requires executed definitions for non-reconstructable objects and renders no operational DDL", () => {
    const actions = buildDependencyOrderedInstaller(canonical, { relations: [], columns: [], constraints: [], indexes: [], functions: [], triggers: [], policies: [], grants: [] });
    expect(() => renderAdditiveInstallerSql(actions)).toThrow("STRUCTURAL_PLAN_DEFINITION_REQUIRED:relation:integrations");

    const executable = actions.map((action) => {
      if (action.section === "relations") return { ...action, item: { ...action.item, definitionSql: "CREATE TABLE public.integrations (id uuid PRIMARY KEY)" } };
      if (action.section === "policies") return { ...action, item: { ...action.item, definitionSql: "CREATE POLICY integrations_select_own ON public.integrations FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)" } };
      if (action.section === "grants") return { ...action, item: { ...action.item, definitionSql: "GRANT SELECT ON TABLE public.integrations TO authenticated" } };
      return action;
    });
    const sql = renderAdditiveInstallerSql(executable);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
    expect(sql).not.toMatch(/cron\.schedule|net\.http_post|pg_net/i);
  });

  it("hydrates only reviewed table DDL from the private executed-schema export", () => {
    const plan = { ...canonical, relations: [{ ...canonical.relations[0], name: "integrations" }] };
    const exportText = "-- private CI artifact\nCREATE TABLE public.integrations (\n  id uuid NOT NULL\n);\n";
    const hydrated = hydrateInstallerPlan(plan, exportText);
    expect(hydrated.relations[0].definitionSql).toContain("CREATE TABLE public.integrations");
    expect(hydrated.policies[0].definitionSql).toContain("CREATE POLICY");
    expect(hydrated.grants[0].definitionSql).toContain("GRANT SELECT");
  });
});
