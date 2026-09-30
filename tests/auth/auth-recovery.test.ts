import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { GET as authCallbackGet } from "@/app/auth/callback/route";

// Mock Supabase SSR and client modules
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
  createBrowserClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  }),
}));

describe("Phase 2B: Authentication Callback, Safe Redirects, and Password Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-supabase.j10nexus.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test_mock_publishable_key_123";
  });

  describe("1. Open Redirect Defense (getSafeRedirectUrl)", () => {
    it("permits standard internal application paths", () => {
      expect(getSafeRedirectUrl("/dashboard")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/dashboard/settings")).toBe("/dashboard/settings");
      expect(getSafeRedirectUrl("/onboarding")).toBe("/onboarding");
      expect(getSafeRedirectUrl("/reset-password")).toBe("/reset-password");
      expect(getSafeRedirectUrl("/dashboard?tab=workflows&id=123")).toBe("/dashboard?tab=workflows&id=123");
    });

    it("respects custom internal fallback", () => {
      expect(getSafeRedirectUrl("/custom", "/onboarding")).toBe("/custom");
      expect(getSafeRedirectUrl(null, "/onboarding")).toBe("/onboarding");
      expect(getSafeRedirectUrl("", "/onboarding")).toBe("/onboarding");
      expect(getSafeRedirectUrl("https://evil.com", "/onboarding")).toBe("/onboarding");
    });

    it("rejects absolute external URLs", () => {
      expect(getSafeRedirectUrl("https://evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("http://evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("https://phishing.com/login")).toBe("/dashboard");
      expect(getSafeRedirectUrl("ftp://attacker.com")).toBe("/dashboard");
    });

    it("rejects protocol-relative URLs", () => {
      expect(getSafeRedirectUrl("//evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("///evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("////evil.com/path")).toBe("/dashboard");
    });

    it("rejects backslash-based parser confusion bypasses", () => {
      expect(getSafeRedirectUrl("/\\evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("\\/evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("\\\\evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/dashboard\\evil.com")).toBe("/dashboard");
    });

    it("rejects JavaScript and other executable URI schemes", () => {
      expect(getSafeRedirectUrl("javascript:alert(1)")).toBe("/dashboard");
      expect(getSafeRedirectUrl("javascript:window.location='https://evil.com'")).toBe("/dashboard");
      expect(getSafeRedirectUrl("data:text/html,<script>alert(1)</script>")).toBe("/dashboard");
      expect(getSafeRedirectUrl("vbscript:MsgBox(1)")).toBe("/dashboard");
    });

    it("rejects multi-encoded and URL-encoded bypasses", () => {
      expect(getSafeRedirectUrl("/%2f/evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("%2f%2fevil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("%252f%252fevil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/%5c%5cevil.com")).toBe("/dashboard");
    });

    it("rejects control characters, newlines, and null bytes", () => {
      expect(getSafeRedirectUrl("/dashboard\r\nLocation: https://evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/dashboard\x00evil")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/\tevil.com")).toBe("/dashboard");
    });

    it("handles null, undefined, and non-string inputs safely", () => {
      expect(getSafeRedirectUrl(null)).toBe("/dashboard");
      expect(getSafeRedirectUrl(undefined)).toBe("/dashboard");
      expect(getSafeRedirectUrl("")).toBe("/dashboard");
      expect(getSafeRedirectUrl("   ")).toBe("/dashboard");
    });
  });

  describe("2. Canonical Authentication Callback Route (/auth/callback)", () => {
    it("exchanges code server-side and redirects to safe internal destination", async () => {
      const { createServerClient } = await import("@supabase/ssr");
      const mockExchangeCode = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createServerClient).mockReturnValue({
        auth: {
          exchangeCodeForSession: mockExchangeCode,
        },
      } as any);

      const request = new NextRequest(
        "https://j10nexus.com/auth/callback?code=mock_valid_code_xyz&next=/dashboard/settings"
      );

      const response = await authCallbackGet(request);

      // Verifies code exchange was executed
      expect(mockExchangeCode).toHaveBeenCalledWith("mock_valid_code_xyz");

      // Verifies redirect to internal destination
      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe("https://j10nexus.com/dashboard/settings");

      // Verifies sensitive code is stripped from final destination URL
      expect(location).not.toContain("code=");
      expect(location).not.toContain("mock_valid_code_xyz");
    });

    it("routes password recovery callbacks to /reset-password", async () => {
      const { createServerClient } = await import("@supabase/ssr");
      const mockExchangeCode = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createServerClient).mockReturnValue({
        auth: {
          exchangeCodeForSession: mockExchangeCode,
        },
      } as any);

      const request = new NextRequest(
        "https://j10nexus.com/auth/callback?code=mock_recovery_code_123&type=recovery"
      );

      const response = await authCallbackGet(request);

      expect(mockExchangeCode).toHaveBeenCalledWith("mock_recovery_code_123");
      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe("https://j10nexus.com/reset-password");
      expect(location).not.toContain("code=");
    });

    it("neutralizes external redirect attacks in ?next parameter", async () => {
      const { createServerClient } = await import("@supabase/ssr");
      const mockExchangeCode = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createServerClient).mockReturnValue({
        auth: {
          exchangeCodeForSession: mockExchangeCode,
        },
      } as any);

      const request = new NextRequest(
        "https://j10nexus.com/auth/callback?code=valid_code&next=https://attacker-site.com/steal"
      );

      const response = await authCallbackGet(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      // Must redirect to /dashboard and never to the external attacker site
      expect(location).toBe("https://j10nexus.com/dashboard");
      expect(location).not.toContain("attacker-site.com");
    });

    it("handles missing code safely without revealing secrets or crashing", async () => {
      const request = new NextRequest("https://j10nexus.com/auth/callback");
      const response = await authCallbackGet(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe("https://j10nexus.com/login?error=auth_callback_failed");
    });

    it("handles expired recovery links safely", async () => {
      const { createServerClient } = await import("@supabase/ssr");
      const mockExchangeCode = vi.fn().mockResolvedValue({
        error: { message: "Token has expired" },
      });
      vi.mocked(createServerClient).mockReturnValue({
        auth: {
          exchangeCodeForSession: mockExchangeCode,
        },
      } as any);

      const request = new NextRequest(
        "https://j10nexus.com/auth/callback?code=expired_code&type=recovery"
      );

      const response = await authCallbackGet(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe("https://j10nexus.com/reset-password?error=expired");
      expect(location).not.toContain("expired_code");
    });

    it("handles provider error query params gracefully", async () => {
      const request = new NextRequest(
        "https://j10nexus.com/auth/callback?error=access_denied&error_description=User%20denied"
      );

      const response = await authCallbackGet(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe("https://j10nexus.com/login?error=auth_callback_failed");
      expect(location).not.toContain("access_denied");
      expect(location).not.toContain("User%20denied");
    });
  });

  describe("3. User Enumeration Defense (/forgot-password)", () => {
    it("ensures forgot-password UI presents neutral confirmation text", () => {
      const fileContent = readFileSync(
        resolve(process.cwd(), "app/forgot-password/page.tsx"),
        "utf8"
      );

      // Must display exact neutral message
      expect(fileContent).toContain(
        "If an account exists for that email, we sent password reset instructions."
      );

      // Must direct redirectTo to canonical /auth/callback?type=recovery
      expect(fileContent).toContain("/auth/callback?type=recovery");

      // Must NOT reveal specific user or database existence
      expect(fileContent).not.toContain("User not found");
      expect(fileContent).not.toContain("Account does not exist");
    });
  });

  describe("4. Password Reset Form Requirements (/reset-password)", () => {
    it("requires at least 8 characters and checks password equality", () => {
      const fileContent = readFileSync(
        resolve(process.cwd(), "app/reset-password/page.tsx"),
        "utf8"
      );

      // Length requirement
      expect(fileContent).toContain("minLength={8}");
      expect(fileContent).toContain("Password must be at least 8 characters long");

      // Password match check
      expect(fileContent).toContain("Passwords do not match");

      // Clear expired state link to /forgot-password
      expect(fileContent).toContain("/forgot-password");
      expect(fileContent).toContain("Password reset link is invalid or has expired");
    });
  });

  describe("5. Login Page Security and Links (/login)", () => {
    it("provides visible link to /forgot-password and uses canonical /auth/callback", () => {
      const fileContent = readFileSync(
        resolve(process.cwd(), "app/login/page.tsx"),
        "utf8"
      );

      // Link to forgot password
      expect(fileContent).toContain('href="/forgot-password"');
      expect(fileContent).toContain("Forgot password?");

      // Email redirect points to /auth/callback
      expect(fileContent).toContain("/auth/callback");

      // Safe redirect validation for ?next
      expect(fileContent).toContain("getSafeRedirectUrl");

      // Does NOT include Google or Apple login buttons yet
      expect(fileContent).not.toContain("Sign in with Google");
      expect(fileContent).not.toContain("Sign in with Apple");
    });
  });

  describe("6. Client Bundle Secret Exclusion", () => {
    it("verifies service-role key is never imported or referenced in client-side code", () => {
      const clientFiles = [
        "lib/supabase.ts",
        "app/login/page.tsx",
        "app/forgot-password/page.tsx",
        "app/reset-password/page.tsx",
        "middleware.ts",
        "app/auth/callback/route.ts",
      ];

      for (const relativePath of clientFiles) {
        const content = readFileSync(resolve(process.cwd(), relativePath), "utf8");
        expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(content).not.toContain("SUPABASE_SECRET_KEY");
      }
    });
  });

  describe("7. Middleware and Session Safety", () => {
    it("ensures middleware protects dashboard and uses getSafeRedirectUrl", () => {
      const content = readFileSync(resolve(process.cwd(), "middleware.ts"), "utf8");
      expect(content).toContain('pathname.startsWith("/dashboard")');
      expect(content).toContain("getSafeRedirectUrl");
      expect(content).toContain("/login");
    });
  });
});
