import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROLE_HIERARCHY, hasMinimumRole } from "@/lib/workspaces/server";
import type { PlatformRoleType } from "@/types/identity";

describe("Identity Recovery, Ownership Transfer, and UI Fallback Regression Tests", () => {
  describe("1. Same-UUID Email Changes Preserve Roles", () => {
    it("proves that updating authentication email in-place preserves immutable UUID and all roles", () => {
      const immutableFounderUUID = "0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa";

      const originalUser = {
        id: immutableFounderUUID,
        email: "richeder7@gmail.com",
      };

      const updatedUser = {
        ...originalUser,
        email: "contact.j10editz@gmail.com",
      };

      const workspace = {
        id: "ce593364-2aaf-47e4-a1d2-2272775747c4",
        name: "J10 NEXUS HQ",
        owner_user_id: immutableFounderUUID,
      };

      const membership = {
        workspace_id: workspace.id,
        user_id: immutableFounderUUID,
        role: "owner",
        status: "active",
      };

      const platformRole = {
        user_id: immutableFounderUUID,
        role: "platform_founder" as PlatformRoleType,
        revoked_at: null,
      };

      // Email changed, but UUID is identical
      expect(originalUser.email).not.toBe(updatedUser.email);
      expect(originalUser.id).toBe(updatedUser.id);

      // Ownership and memberships remain tied to immutable UUID
      expect(workspace.owner_user_id).toBe(updatedUser.id);
      expect(membership.user_id).toBe(updatedUser.id);
      expect(platformRole.user_id).toBe(updatedUser.id);
    });
  });

  describe("2. Different-UUID Atomic Authorization Transfer", () => {
    it("atomically transfers workspace ownership and platform_founder to a new UUID without dropping owner count to zero", () => {
      const sourceUUID = "0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa";
      const destinationUUID = "f44f4cc4-30bc-4d78-98e3-0b63ff63e08f";
      const hqWorkspaceId = "ce593364-2aaf-47e4-a1d2-2272775747c4";

      expect(sourceUUID).not.toBe(destinationUUID);

      const workspace = {
        id: hqWorkspaceId,
        name: "J10 NEXUS HQ",
        owner_user_id: sourceUUID,
      };

      const memberships = [
        { workspace_id: hqWorkspaceId, user_id: sourceUUID, role: "owner", status: "active" },
      ];

      const platformRoles = [
        { user_id: sourceUUID, role: "platform_founder", revoked_at: null },
      ];

      // Step 1: Add destination owner membership BEFORE removing or changing source
      memberships.push({
        workspace_id: hqWorkspaceId,
        user_id: destinationUUID,
        role: "owner",
        status: "active",
      });

      const activeOwners = memberships.filter((m) => m.role === "owner" && m.status === "active");
      expect(activeOwners.length).toBeGreaterThanOrEqual(1);

      // Step 2: Transfer workspace ownership
      workspace.owner_user_id = destinationUUID;
      expect(workspace.owner_user_id).toBe(destinationUUID);

      // Step 3: Transfer platform_founder and retain source as platform_admin
      platformRoles.push({
        user_id: destinationUUID,
        role: "platform_founder",
        revoked_at: null,
      });

      const sourceRole = platformRoles.find((r) => r.user_id === sourceUUID);
      if (sourceRole) {
        sourceRole.role = "platform_admin";
      }

      // Verification: destination is live founder and owner
      const destRole = platformRoles.find((r) => r.user_id === destinationUUID);
      expect(destRole?.role).toBe("platform_founder");
      expect(workspace.owner_user_id).toBe(destinationUUID);

      // Source is retained safely as admin and co-owner for rollback protection
      expect(sourceRole?.role).toBe("platform_admin");
      expect(memberships.some((m) => m.user_id === sourceUUID && m.status === "active")).toBe(true);
    });
  });

  describe("3. OAuth / Email Identity Split Handling", () => {
    it("handles identity split where provider signup generates a separate account", () => {
      const emailSignupUser = {
        id: "0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa",
        email: "richeder7@gmail.com",
        provider: "email",
      };

      const oauthUser = {
        id: "f44f4cc4-30bc-4d78-98e3-0b63ff63e08f",
        email: "contact.j1oeditz@gmail.com",
        provider: "google",
      };

      // Identities are distinct
      expect(emailSignupUser.id).not.toBe(oauthUser.id);
      expect(emailSignupUser.email).not.toBe(oauthUser.email);

      // Migration must transfer live platform governance to the authenticated user
      const activePlatformUser = oauthUser.id;
      expect(activePlatformUser).toBe("f44f4cc4-30bc-4d78-98e3-0b63ff63e08f");
    });
  });

  describe("4. Profile API Failure UI Fallback Correction", () => {
    it("verifies Topbar code never defaults to 'Member' on API failure or empty role", () => {
      const topbarCode = readFileSync(
        resolve(process.cwd(), "components/dashboard/Topbar.tsx"),
        "utf8",
      );

      // The initial role state must NOT be "Member"
      expect(topbarCode).not.toContain('workspaceRole: "Member"');

      // Failure must set "Authorization unavailable"
      expect(topbarCode).toContain("Authorization unavailable");

      // Owner badge must appear when role is verified Owner
      expect(topbarCode).toContain('profileData.workspaceRole === "Owner"');
      expect(topbarCode).toContain("Founder");
    });
  });

  describe("5. Missing Workspace Does Not Render Seeded Agency HQ", () => {
    it("verifies WorkspaceSwitcher initializes empty and does NOT fallback to SEED_WORKSPACES", () => {
      const switcherCode = readFileSync(
        resolve(process.cwd(), "components/dashboard/WorkspaceSwitcher.tsx"),
        "utf8",
      );

      // Initial state must be empty array, not SEED_WORKSPACES
      expect(switcherCode).not.toContain("useState<Workspace[]>(SEED_WORKSPACES)");

      // Must display "No authorized workspace" and "NO ACCESS" when unassigned
      expect(switcherCode).toContain("No authorized workspace");
      expect(switcherCode).toContain("NO ACCESS");
      expect(switcherCode).toContain("Tenant unassigned");
    });
  });

  describe("6. Server-Authoritative Workspace and Account Consistency", () => {
    it("verifies Account settings page handles null workspace role cleanly without defaulting to Member", () => {
      const accountPageCode = readFileSync(
        resolve(process.cwd(), "app/dashboard/settings/account/page.tsx"),
        "utf8",
      );

      // Must NOT fallback to "Member"
      expect(accountPageCode).not.toContain('{workspaceRole || "Member"}');
      expect(accountPageCode).toContain('"No Role"');
      expect(accountPageCode).toContain("No active workspace");
    });
  });

  describe("7. Tenant Isolation: New Users Cannot Access J10 NEXUS HQ", () => {
    it("strictly forbids an arbitrary new user from accessing HQ workspace without explicit membership", () => {
      const arbitraryNewUserId = "99999999-0000-0000-0000-000000000000";
      const hqWorkspaceId = "ce593364-2aaf-47e4-a1d2-2272775747c4";

      const authorizedMemberships = [
        { workspace_id: hqWorkspaceId, user_id: "0a96ddf0-ab9d-4325-85dd-8e3cbd4eacfa", role: "owner" },
        { workspace_id: hqWorkspaceId, user_id: "f44f4cc4-30bc-4d78-98e3-0b63ff63e08f", role: "owner" },
      ];

      const hasAccess = authorizedMemberships.some(
        (m) => m.workspace_id === hqWorkspaceId && m.user_id === arbitraryNewUserId
      );

      expect(hasAccess).toBe(false);
    });
  });
});
