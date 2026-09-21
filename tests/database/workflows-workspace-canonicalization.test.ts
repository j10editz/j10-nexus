import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261015_workflows_workspace_canonicalization.sql"), "utf8");

describe("legacy workflows workspace canonicalization", () => {
  it("backfills only a single distinct active workspace membership", () => {
    expect(migration).toContain("HAVING count(DISTINCT membership.workspace_id) = 1");
    expect(migration).toContain("membership.status = 'active'");
    expect(migration).not.toContain("ORDER BY membership.created_at");
  });

  it("fails closed before NOT NULL when any ownership remains unresolved", () => {
    expect(migration).toContain("Workflow canonicalization aborted: % workflow rows have unresolved or ambiguous workspace ownership.");
    expect(migration.indexOf("WHERE workspace_id IS NULL;")).toBeLessThan(migration.indexOf("ALTER TABLE public.workflows ALTER COLUMN workspace_id SET NOT NULL"));
  });

  it("preserves the legacy table and adds a workspace-scoped dashboard contract", () => {
    expect(migration).toContain("ALTER TABLE public.workflows ADD COLUMN IF NOT EXISTS workspace_id uuid");
    expect(migration).toContain("FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)");
    expect(migration).toContain("workflows_workspace_status_idx ON public.workflows(workspace_id, status)");
    expect(migration).toContain("dashboard-required columns are missing");
    expect(migration).not.toMatch(/DROP\s+TABLE|TRUNCATE|\bCASCADE\b/i);
  });

  it("replaces only known user-scoped policies with tenant-safe RLS and grants", () => {
    expect(migration).toContain("unexpected existing policy % requires security review");
    expect(migration).toContain("public.has_workspace_role(workspace_id");
    expect(migration).toContain("REVOKE ALL ON TABLE public.workflows FROM anon");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workflows TO authenticated");
  });

  it("is idempotent for a clean-chain or a second legacy reconciliation pass", () => {
    expect(migration).toContain("IF v_kind IS NULL THEN\n    RETURN;");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS workspace_id");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS workflows_workspace_id_idx");
    expect(migration).toContain("IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint");
  });
});
