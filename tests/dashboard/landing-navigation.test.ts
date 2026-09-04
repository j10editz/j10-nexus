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

  it("provides direct card navigation links alongside interactive workstation inspection", async () => {
    const source = await readFile("components/Features.tsx", "utf8");
    // Direct link on every card to prevent UX confusion
    expect(source).toContain("href={destination}");
    expect(source).toContain("Open");
    // Workstation console with execution flow and specs
    expect(source).toContain("Step-By-Step Execution Flow");
    expect(source).toContain("System & Security Specs");
    expect(source).toContain("Runtime Pipeline");
  });
});
