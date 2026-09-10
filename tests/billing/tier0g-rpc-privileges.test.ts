import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/20260918b_restrict_tier0g_rpc_execute.sql"
  ),
  "utf-8"
);

describe("Tier 0G RPC execution privileges", () => {
  it("restricts both billing RPCs to authenticated and service_role", () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;\s/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);

    for (const signature of [
      "record_verified_workspace_usage(UUID, TEXT, INT, TEXT, TEXT, UUID, JSONB)",
      "activate_workspace_trial(UUID, TEXT, INT)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM anon;`);
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`
      );
    }
  });
});
