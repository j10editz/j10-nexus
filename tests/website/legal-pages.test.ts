import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const publicLegalRoutes = ["privacy", "terms", "data-deletion"] as const;

describe("public legal pages", () => {
  it("ships privacy, terms, and deletion-instruction pages without authentication guards", async () => {
    for (const route of publicLegalRoutes) {
      const source = await readFile(path.join(repoRoot, "app", route, "page.tsx"), "utf8");
      expect(source).toContain("export default function");
      expect(source).not.toMatch(/redirect\s*\(|requireUser|requireAuth|getUser\s*\(/);
    }
  });

  it("publishes each public legal page in the sitemap", async () => {
    const sitemap = await readFile(path.join(repoRoot, "app", "sitemap.ts"), "utf8");
    for (const route of publicLegalRoutes) {
      expect(sitemap).toContain(`"/${route}"`);
    }
  });

  it("provides complete and actionable deletion instructions", async () => {
    const source = await readFile(path.join(repoRoot, "app", "data-deletion", "page.tsx"), "utf8");
    expect(source).toContain("contact@j10-nexus.com");
    expect(source).toContain("Identity and workspace verification");
    expect(source).toContain("Data covered");
    expect(source).toContain("Processing timeframe and confirmation");
    expect(source).toContain("Retention exceptions");
  });
});
