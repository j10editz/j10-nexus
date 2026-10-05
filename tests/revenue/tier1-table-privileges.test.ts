import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Tier 1 table privileges", () => {
  it("grants authenticated exactly CRUD after revocation", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260919_tier1_revenue_loop.sql"), "utf8");
    expect(sql.trimStart()).toMatch(/^BEGIN;\s/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    for (const table of ["crm_proposals", "crm_bookings"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON public\\.${table} FROM authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON public\\.${table} TO authenticated`));
    }
  });
});
