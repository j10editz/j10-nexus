import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("landing page navigation", () => {
  it("connects the navbar calls to action to real destinations", async () => {
    const source = await readFile("components/Navbar.tsx", "utf8");
    expect(source).toContain('href="#features"');
    expect(source).toContain('href="/login"');
    expect(source).not.toContain('href="#"');
  });

  it("routes every feature module through its Explore action", async () => {
    const source = await readFile("components/Features.tsx", "utf8");
    expect(source).toContain("moduleDestinations");
    expect(source).toContain("href={moduleDestinations[active.id]");
    expect(source).toContain('whatsapp: "/dashboard/whatsapp"');
  });
});
