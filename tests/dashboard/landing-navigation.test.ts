import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("landing page navigation", () => {
  it("connects the navbar calls to action to real destinations", async () => {
    const source = await readFile("components/Navbar.tsx", "utf8");
    expect(source).toContain('"/#product"');
    expect(source).toContain('href="/login"');
    expect(source).toContain('"/pricing"');
    expect(source).toContain('"/contact"');
    expect(source).not.toContain('href="#"');
  });

  it("centers the public story on the approved launch capabilities", async () => {
    const source = await readFile("components/marketing/LaunchHome.tsx", "utf8");
    expect(source).toContain("J10 Receptionist");
    expect(source).toContain("Revenue Agent");
    expect(source).toContain("Recovery Agent");
    expect(source).toContain("Unified Inbox + CRM");
  });

  it("keeps a direct pricing and signup path in the public story", async () => {
    const source = await readFile("components/marketing/LaunchHome.tsx", "utf8");
    expect(source).toContain("/pricing");
    expect(source).toContain("intent=signup&plan=growth&trial=1");
  });
});
