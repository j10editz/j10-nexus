import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isTrustedGoogleAvatarUrl,
  isSafeAvatarUrl,
  resolveAccountAvatar,
} from "@/lib/auth/avatar";
import { GET as profileGet } from "@/app/api/account/profile/route";

// Mock auth & workspaces modules for API route testing
const mockGetCurrentUser = vi.fn();
const mockGetUserProfile = vi.fn();
const mockGetActiveWorkspaceContext = vi.fn();
const mockGetUserPlatformRole = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/workspaces/server", () => ({
  getUserProfile: (id: string) => mockGetUserProfile(id),
  getActiveWorkspaceContext: () => mockGetActiveWorkspaceContext(),
  getUserPlatformRole: (id: string) => mockGetUserPlatformRole(id),
}));

describe("Phase 2C Polish: Authenticated Google Avatar & Security Controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. J10 Uploaded Avatar Takes Priority", () => {
    it("preserves local user-uploaded J10 avatar as first priority over Google avatar", () => {
      const localAvatar = "https://j10-nexus.vercel.app/uploads/avatars/user-99.png";
      const googleAvatar =
        "https://lh3.googleusercontent.com/a/ACg8ocISampleGoogleAvatarString";

      const resolved = resolveAccountAvatar({
        j10AvatarUrl: localAvatar,
        googleMetadata: {
          avatar_url: googleAvatar,
          picture: googleAvatar,
        },
      });

      expect(resolved).toBe(localAvatar);
    });

    it("accepts relative uploaded paths for J10 local avatars", () => {
      const relativeAvatar = "/uploads/avatars/custom_photo.jpg";
      const resolved = resolveAccountAvatar({
        j10AvatarUrl: relativeAvatar,
        googleMetadata: {
          avatar_url: "https://lh3.googleusercontent.com/a/photo",
        },
      });

      expect(resolved).toBe(relativeAvatar);
    });
  });

  describe("2. Google Avatar Appears When Local Avatar Is Absent", () => {
    it("falls back to Google avatar_url when local avatar is null or absent", () => {
      const googleAvatar =
        "https://lh3.googleusercontent.com/a/ACg8ocIUserVerified123";

      const resolved = resolveAccountAvatar({
        j10AvatarUrl: null,
        googleMetadata: {
          avatar_url: googleAvatar,
        },
      });

      expect(resolved).toBe(googleAvatar);
    });

    it("falls back to Google picture property when avatar_url is missing", () => {
      const googlePicture =
        "https://lh4.googleusercontent.com/photo/profile_picture_456.jpg";

      const resolved = resolveAccountAvatar({
        j10AvatarUrl: undefined,
        googleMetadata: {
          picture: googlePicture,
        },
      });

      expect(resolved).toBe(googlePicture);
    });

    it("accepts trusted Google ggpht host", () => {
      const ggphtAvatar = "https://lh3.ggpht.com/a/legacy_profile";

      const resolved = resolveAccountAvatar({
        j10AvatarUrl: "",
        googleMetadata: {
          avatar_url: ggphtAvatar,
        },
      });

      expect(resolved).toBe(ggphtAvatar);
    });
  });

  describe("3. Generic Icon Appears When Neither Exists", () => {
    it("returns null to trigger generic icon fallback when both local and Google avatars are absent", () => {
      const resolved = resolveAccountAvatar({
        j10AvatarUrl: null,
        googleMetadata: null,
      });

      expect(resolved).toBeNull();
    });

    it("returns null when googleMetadata is an empty object", () => {
      const resolved = resolveAccountAvatar({
        j10AvatarUrl: null,
        googleMetadata: {},
      });

      expect(resolved).toBeNull();
    });

    it("returns null when avatar strings are empty whitespace", () => {
      const resolved = resolveAccountAvatar({
        j10AvatarUrl: "   ",
        googleMetadata: { avatar_url: "  " },
      });

      expect(resolved).toBeNull();
    });
  });

  describe("4. Malformed and Untrusted Avatar URLs Are Rejected", () => {
    it("rejects non-HTTPS schemes for Google avatars", () => {
      expect(
        isTrustedGoogleAvatarUrl("http://lh3.googleusercontent.com/photo.jpg")
      ).toBe(false);

      const resolved = resolveAccountAvatar({
        j10AvatarUrl: null,
        googleMetadata: {
          avatar_url: "http://lh3.googleusercontent.com/photo.jpg",
        },
      });
      expect(resolved).toBeNull();
    });

    it("rejects untrusted domains attempting to spoof Google hosts", () => {
      const spoofDomains = [
        "https://evil-googleusercontent.com/avatar.jpg",
        "https://googleusercontent.com.attacker.com/avatar.jpg",
        "https://attacker.com/googleusercontent.com/avatar.jpg",
        "https://malicious-site.com/photo.jpg",
      ];

      for (const untrusted of spoofDomains) {
        expect(isTrustedGoogleAvatarUrl(untrusted)).toBe(false);
        const resolved = resolveAccountAvatar({
          j10AvatarUrl: null,
          googleMetadata: { avatar_url: untrusted },
        });
        expect(resolved).toBeNull();
      }
    });

    it("rejects javascript:, data:, and protocol-relative injection attempts", () => {
      const injectionAttacks = [
        "javascript:alert(document.cookie)",
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "//attacker.com/malicious.jpg",
        "/\\attacker.com/bypass",
        "vbscript:msgbox(1)",
      ];

      for (const attack of injectionAttacks) {
        expect(isTrustedGoogleAvatarUrl(attack)).toBe(false);
        expect(isSafeAvatarUrl(attack)).toBe(false);
        const resolved = resolveAccountAvatar({
          j10AvatarUrl: attack,
          googleMetadata: { avatar_url: attack },
        });
        expect(resolved).toBeNull();
      }
    });

    it("rejects URLs with embedded credentials or non-standard ports", () => {
      expect(
        isTrustedGoogleAvatarUrl(
          "https://admin:secret@lh3.googleusercontent.com/avatar.jpg"
        )
      ).toBe(false);
      expect(
        isTrustedGoogleAvatarUrl(
          "https://lh3.googleusercontent.com:8080/avatar.jpg"
        )
      ).toBe(false);
    });
  });

  describe("5. Privacy & Data Preservation: No Private Metadata Leaked & Username Preserved", () => {
    it("does not overwrite user existing J10 username or profile with Google metadata", async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "user-uuid-1234",
        email: "testuser@gmail.com",
        created_at: "2026-09-01T00:00:00Z",
        user_metadata: {
          full_name: "Google Given Name",
          name: "Google Given Name",
          avatar_url: "https://lh3.googleusercontent.com/a/sample-avatar",
        },
      });

      mockGetUserProfile.mockResolvedValueOnce({
        user_id: "user-uuid-1234",
        display_name: "Original_J10_Founder",
        avatar_url: null, // No local avatar
        job_title: "Chief Architect",
        phone: "+15551234567",
        locale: "en-US",
        timezone: "America/New_York",
        status: "active",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-15T00:00:00Z",
      });

      mockGetActiveWorkspaceContext.mockResolvedValueOnce({
        membership: { role: "owner" },
        workspace: { name: "Apex Commercial & Home Services" },
      });

      mockGetUserPlatformRole.mockResolvedValueOnce("platform_founder");

      const response = await profileGet();
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);

      // Existing display name MUST NOT be overwritten by Google metadata
      expect(json.profile.display_name).toBe("Original_J10_Founder");
      expect(json.profile.display_name).not.toBe("Google Given Name");

      // Google avatar should be safely resolved as fallback
      expect(json.profile.avatar_url).toBe(
        "https://lh3.googleusercontent.com/a/sample-avatar"
      );
    });

    it("ensures no private OAuth credentials, provider tokens, or internal secrets are exposed publicly", async () => {
      mockGetCurrentUser.mockResolvedValueOnce({
        id: "user-uuid-5678",
        email: "owner@j10nexus.com",
        created_at: "2026-09-01T00:00:00Z",
        user_metadata: {
          avatar_url: "https://lh3.googleusercontent.com/a/verified-avatar",
          provider_token: "sensitive_oauth_provider_token_xyz",
          provider_refresh_token: "sensitive_oauth_refresh_token_abc",
          secret_key: "internal_secret_key_123",
          google_account_id: "google_sub_1092384092",
        },
      });

      mockGetUserProfile.mockResolvedValueOnce(null); // Defaults to generated profile
      mockGetActiveWorkspaceContext.mockResolvedValueOnce(null);
      mockGetUserPlatformRole.mockResolvedValueOnce(null);

      const response = await profileGet();
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.profile.avatar_url).toBe(
        "https://lh3.googleusercontent.com/a/verified-avatar"
      );

      // Verify no sensitive tokens or raw metadata are exposed in the JSON payload
      const jsonString = JSON.stringify(json);
      expect(jsonString).not.toContain("sensitive_oauth_provider_token_xyz");
      expect(jsonString).not.toContain("sensitive_oauth_refresh_token_abc");
      expect(jsonString).not.toContain("internal_secret_key_123");
      expect(jsonString).not.toContain("provider_token");
      expect(jsonString).not.toContain("provider_refresh_token");
    });
  });

  describe("6. Visual Specs: Topbar and Dropdown Avatar Rendering", () => {
    it("verifies Topbar renders avatar image with circular crop, no-referrer policy, and explicit dimensions", () => {
      // Direct inspection of Topbar implementation to ensure rendering specifications
      const fs = require("node:fs");
      const path = require("node:path");
      const topbarCode = fs.readFileSync(
        path.resolve(process.cwd(), "components/dashboard/Topbar.tsx"),
        "utf8"
      );

      // Check circular crop classes
      expect(topbarCode).toContain("rounded-full");
      expect(topbarCode).toContain("object-cover");

      // Check referrerPolicy="no-referrer"
      expect(topbarCode).toContain('referrerPolicy="no-referrer"');

      // Check fixed dimensions preventing layout shift
      expect(topbarCode).toContain("width={24}");
      expect(topbarCode).toContain("height={24}");
      expect(topbarCode).toContain("width={36}");
      expect(topbarCode).toContain("height={36}");

      // Check meaningful alt text
      expect(topbarCode).toContain("alt={`${profileData.displayName} avatar`}");

      // Check generic fallback UserCircle2 icon
      expect(topbarCode).toContain("<UserCircle2");
    });
  });
});
