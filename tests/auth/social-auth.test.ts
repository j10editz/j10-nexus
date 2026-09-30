import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAuthProviderSettings } from "@/lib/auth/providers";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { getCanonicalOrigin, VERIFIED_PRODUCTION_ORIGIN } from "@/lib/auth/origin";
import { sanitizeAuthError } from "@/lib/auth/errors";

describe("Phase 2C: Google and Apple Social Authentication Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_TEST_AUTH_PROVIDERS;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-supabase.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test_publishable_123";
  });

  describe("1. Truthful Provider Discovery (getAuthProviderSettings)", () => {
    it("reports providers as false when disabled in Supabase settings", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          external: {
            email: true,
            google: false,
            apple: false,
          },
        }),
      } as any);

      const settings = await getAuthProviderSettings();
      expect(settings.google).toBe(false);
      expect(settings.apple).toBe(false);
    });

    it("truthfully detects Google enabled when configured in Supabase settings", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          external: {
            email: true,
            google: true,
            apple: false,
          },
        }),
      } as any);

      const settings = await getAuthProviderSettings();
      expect(settings.google).toBe(true);
      expect(settings.apple).toBe(false);
    });

    it("truthfully detects both Google and Apple when both are configured in Supabase", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          external: {
            email: true,
            google: true,
            apple: true,
          },
        }),
      } as any);

      const settings = await getAuthProviderSettings();
      expect(settings.google).toBe(true);
      expect(settings.apple).toBe(true);
    });

    it("fails closed to false when Supabase settings endpoint returns error or network fails", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network connection failed"));

      const settings = await getAuthProviderSettings();
      expect(settings.google).toBe(false);
      expect(settings.apple).toBe(false);
    });

    it("fails closed when Supabase credentials are missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const settings = await getAuthProviderSettings();
      expect(settings.google).toBe(false);
      expect(settings.apple).toBe(false);
    });
  });

  describe("2. OAuth Flow and Reusable Callback Integration", () => {
    it("proves Google OAuth targets existing canonical /auth/callback with validated redirect", () => {
      const canonicalOrigin = getCanonicalOrigin();
      const safeNext = getSafeRedirectUrl("/dashboard/settings", "/dashboard");
      const callbackUrl = `${canonicalOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

      expect(callbackUrl).toBe("https://j10-nexus.vercel.app/auth/callback?next=%2Fdashboard%2Fsettings");
      expect(callbackUrl).not.toContain("j10nexus.com");
    });

    it("proves Apple OAuth targets existing canonical /auth/callback with validated redirect", () => {
      const canonicalOrigin = getCanonicalOrigin();
      const safeNext = getSafeRedirectUrl("/onboarding", "/dashboard");
      const callbackUrl = `${canonicalOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

      expect(callbackUrl).toBe("https://j10-nexus.vercel.app/auth/callback?next=%2Fonboarding");
      expect(callbackUrl).not.toContain("j10nexus.com");
    });

    it("neutralizes malicious external redirect targets in OAuth redirect_to options", () => {
      const canonicalOrigin = getCanonicalOrigin();

      const maliciousInputs = [
        "https://evil.com/steal-session",
        "//evil.com",
        "/\\evil.com",
        "javascript:alert(1)",
        "/%2f/attacker.com",
      ];

      for (const maliciousTarget of maliciousInputs) {
        const safeDestination = getSafeRedirectUrl(maliciousTarget, "/dashboard");
        const callbackUrl = `${canonicalOrigin}/auth/callback?next=${encodeURIComponent(safeDestination)}`;

        expect(safeDestination).toBe("/dashboard");
        expect(callbackUrl).toBe("https://j10-nexus.vercel.app/auth/callback?next=%2Fdashboard");
        expect(callbackUrl).not.toContain("evil.com");
        expect(callbackUrl).not.toContain("attacker.com");
      }
    });
  });

  describe("3. Error Sanitization and Security Guarantees", () => {
    it("sanitizes OAuth provider failures without leaking internal exceptions or tokens", () => {
      const oauthException = {
        message: "OAuth provider returned 400 invalid_grant: Bad client_secret credentials for google-project-id-998",
        status: 400,
      };

      const sanitizedSignin = sanitizeAuthError(oauthException, "signin");
      expect(sanitizedSignin).toBe("Email or password is incorrect.");
      expect(sanitizedSignin).not.toContain("google-project-id-998");
      expect(sanitizedSignin).not.toContain("invalid_grant");

      const sanitizedSignup = sanitizeAuthError(oauthException, "signup");
      expect(sanitizedSignup).toBe(
        "We could not create the account. Please verify your information and try again."
      );
      expect(sanitizedSignup).not.toContain("client_secret");
    });

    it("ensures OAuth client secrets and private keys never appear in client bundles or public code", () => {
      const publicFiles = [
        "app/login/page.tsx",
        "app/signup/page.tsx",
        "components/auth/social-auth-buttons.tsx",
        "lib/auth/providers.ts",
        "lib/auth/origin.ts",
        "lib/auth/redirect.ts",
      ];

      for (const relativePath of publicFiles) {
        const content = readFileSync(resolve(process.cwd(), relativePath), "utf8");
        expect(content, `OAuth client secret found in ${relativePath}`).not.toContain("GOOGLE_OAUTH_CLIENT_SECRET");
        expect(content, `Private key found in ${relativePath}`).not.toContain("APPLE_PRIVATE_KEY");
        expect(content, `Forbidden domain found in ${relativePath}`).not.toContain("j10nexus.com");
      }
    });

    it("ensures truthful provider display: unavailable providers are completely hidden", () => {
      const signupContent = readFileSync(resolve(process.cwd(), "app/signup/page.tsx"), "utf8");
      const loginContent = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");
      const buttonContent = readFileSync(
        resolve(process.cwd(), "components/auth/social-auth-buttons.tsx"),
        "utf8"
      );

      // Verifies that SocialAuthButtons returns null when neither provider is active
      expect(buttonContent).toContain("if (!hasAnyProvider) {");
      expect(buttonContent).toContain("return null;");

      // Verifies no disabled "Coming soon" buttons exist
      expect(buttonContent).not.toContain("Coming soon");
      expect(signupContent).not.toContain("Coming soon");
      expect(loginContent).not.toContain("Coming soon");
    });
  });

  describe("4. Dedicated Signup and Login Architecture", () => {
    it("ensures dedicated /signup page exists and links to /login", () => {
      const signupContent = readFileSync(resolve(process.cwd(), "app/signup/page.tsx"), "utf8");
      expect(signupContent).toContain("Create your account");
      expect(signupContent).toContain("Create Account & Start Trial");
      expect(signupContent).toContain("Already have an account?");
      expect(signupContent).toContain('href={loginUrl}');
    });

    it("ensures dedicated /login page exists for returning users and links to /signup", () => {
      const loginContent = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");
      expect(loginContent).toContain("Welcome back");
      expect(loginContent).toContain("Sign In to Workspace");
      expect(loginContent).toContain("Forgot password?");
      expect(loginContent).toContain("have an account?");
      expect(loginContent).toContain('href={signupUrl}');
    });

    it("preserves 72-hour trial language on /signup without outdated 14-day copy", () => {
      const signupContent = readFileSync(resolve(process.cwd(), "app/signup/page.tsx"), "utf8");
      expect(signupContent).toContain("72-hour free trial");
      expect(signupContent).not.toContain("14-day");
    });
  });
});
