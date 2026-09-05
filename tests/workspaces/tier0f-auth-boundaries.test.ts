import { describe, expect, it } from "vitest";
import { hasMinimumRole, ROLE_HIERARCHY, type WorkspaceRole } from "@/lib/workspaces/server";

describe("Tier 0F: Authentication & Trust Boundaries", () => {
  it("enforces strict role hierarchy across all workspace roles", () => {
    expect(ROLE_HIERARCHY.viewer).toBe(10);
    expect(ROLE_HIERARCHY.agent).toBe(20);
    expect(ROLE_HIERARCHY.manager).toBe(30);
    expect(ROLE_HIERARCHY.admin).toBe(40);
    expect(ROLE_HIERARCHY.owner).toBe(50);

    expect(hasMinimumRole("owner", "admin")).toBe(true);
    expect(hasMinimumRole("admin", "manager")).toBe(true);
    expect(hasMinimumRole("manager", "agent")).toBe(true);
    expect(hasMinimumRole("agent", "viewer")).toBe(true);

    expect(hasMinimumRole("viewer", "agent")).toBe(false);
    expect(hasMinimumRole("agent", "admin")).toBe(false);
    expect(hasMinimumRole("admin", "owner")).toBe(false);
  });

  it("ensures viewer role has read-only access and cannot satisfy operational roles", () => {
    const viewerRole: WorkspaceRole = "viewer";
    expect(hasMinimumRole(viewerRole, "manager")).toBe(false);
    expect(hasMinimumRole(viewerRole, "owner")).toBe(false);
  });
});
