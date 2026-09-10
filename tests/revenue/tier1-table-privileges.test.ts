import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tier 1 table privileges", () => {
  it("grants authenticated exactly CRUD after revocation", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260919b_restrict_tier1_authenticated_table_privileges.sql"), "utf8");
    expect(sql.trimStart()).toMatch(/^BEGIN;\s/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    for (const table of ["crm_proposals", "crm_bookings"]) {
      expect(sql).toContain(`REVOKE ALL ON public.${table} FROM authenticated;`);
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO authenticated;`);
    }
  });
});
