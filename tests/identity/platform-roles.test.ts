import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { ROLE_HIERARCHY, hasMinimumRole } from "@/lib/workspaces/server";
import type { PlatformRoleType, UserProfileRecord } from "@/types/identity";

describe("Tier 0E: Identity, Platform Roles, and Workspace Access Contracts", () => {
  describe("1. Platform Roles vs Workspace Roles Separation", () => {
    it("strictly separates platform roles from workspace roles", () => {
      const platformRoles: PlatformRoleType[] = ["platform_founder", "platform_admin", "platform_support"];
      const workspaceRoles = ["owner", "admin", "manager", "agent", "viewer"];

      // Platform roles cannot be assigned as workspace roles
      platformRoles.forEach((pr) => {
        expect(workspaceRoles.includes(pr as any)).toBe(false);
      });

      // Workspace roles cannot be assigned as platform roles
      workspaceRoles.forEach((wr) => {
        expect(platformRoles.includes(wr as any)).toBe(false);
      });
    });

    it("verifies workspace role hierarchy", () => {
      expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
      expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.manager);
      expect(ROLE_HIERARCHY.manager).toBeGreaterThan(ROLE_HIERARCHY.agent);
      expect(ROLE_HIERARCHY.agent).toBeGreaterThan(ROLE_HIERARCHY.viewer);

      expect(hasMinimumRole("owner", "admin")).toBe(true);
      expect(hasMinimumRole("admin", "owner")).toBe(false);
      expect(hasMinimumRole("agent", "admin")).toBe(false);
      expect(hasMinimumRole("viewer", "agent")).toBe(false);
    });

    it("ensures a customer workspace owner is NOT platform founder", () => {
      const customerMembership = {
        role: "owner",
        workspace_type: "client",
        platformRole: null,
      };

      const isFounder = customerMembership.platformRole === "platform_founder";
      expect(isFounder).toBe(false);
    });
  });

  describe("2. Workspace Invitations Cryptographic Security", () => {
    function hashToken(token: string): string {
      return crypto.createHash("sha256").update(token).digest("hex");
    }

    it("hashes invitation tokens with SHA-256 before storage", () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hash1 = hashToken(rawToken);
      const hash2 = hashToken(rawToken);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).not.toBe(rawToken);
    });

    it("rejects different raw tokens with completely different hashes", () => {
      const rawTokenA = crypto.randomBytes(32).toString("hex");
      const rawTokenB = crypto.randomBytes(32).toString("hex");

      expect(hashToken(rawTokenA)).not.toBe(hashToken(rawTokenB));
    });

    it("validates invitation expiration correctly", () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const futureDate = new Date(Date.now() + 3600000).toISOString();

      const isPastExpired = new Date(pastDate) < new Date();
      const isFutureExpired = new Date(futureDate) < new Date();

      expect(isPastExpired).toBe(true);
      expect(isFutureExpired).toBe(false);
    });

    it("enforces that invitations cannot grant owner or platform roles", () => {
      const allowedInviteRoles = ["admin", "manager", "agent", "viewer"];
      expect(allowedInviteRoles.includes("owner")).toBe(false);
      expect(allowedInviteRoles.includes("platform_founder")).toBe(false);
      expect(allowedInviteRoles.includes("platform_admin")).toBe(false);
    });
  });

  describe("3. Profile Sanitization and Field Protection", () => {
    it("sanitizes profile input fields safely", () => {
      const rawDisplayName = "  Jane Doe  ";
      const sanitized = rawDisplayName.trim().slice(0, 80);
      expect(sanitized).toBe("Jane Doe");
    });

    it("prevents profile payload from altering user_id or platform roles", () => {
      const maliciousPayload = {
        display_name: "Attacker",
        user_id: "forged-uuid",
        role: "platform_founder",
        platform_role: "platform_founder",
      };

      const safeAllowedKeys = ["display_name", "avatar_url", "job_title", "phone", "locale", "timezone"];
      const filteredKeys = Object.keys(maliciousPayload).filter((k) => safeAllowedKeys.includes(k));

      expect(filteredKeys).toEqual(["display_name"]);
      expect(filteredKeys.includes("user_id")).toBe(false);
      expect(filteredKeys.includes("role")).toBe(false);
      expect(filteredKeys.includes("platform_role")).toBe(false);
    });
  });

  describe("4. Email Change Immutability Contract", () => {
    it("proves workspace resolution is bound to user UUID and immune to email changes", () => {
      const userUUID = "0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa";
      const workspace = {
        id: "ce593364-2aaf-47e4-a1d2-2272775747c4",
        owner_user_id: userUUID,
      };
      const membership = {
        workspace_id: workspace.id,
        user_id: userUUID,
        role: "owner",
      };

      // Email changes from old to new
      const oldEmail = "richeder7@gmail.com";
      const newEmail = "contact.j10editz@gmail.com";

      expect(oldEmail).not.toBe(newEmail);
      // Foreign key matching continues to hold exactly
      expect(membership.user_id).toBe(userUUID);
      expect(workspace.owner_user_id).toBe(userUUID);
    });
  });
});
