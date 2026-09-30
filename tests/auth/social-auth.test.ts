import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import {
  getAuthProviderSettings,
  CANONICAL_SUPABASE_PROJECT_REF,
  CANONICAL_SUPABASE_URL,
} from "@/lib/auth/providers";
import {
  SocialAuthButtons,
  initiateOAuthSignIn,
} from "@/components/auth/social-auth-buttons";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { getCanonicalOrigin } from "@/lib/auth/origin";
import { sanitizeAuthError } from "@/lib/auth/errors";
import { GET as authCallbackGet } from "@/app/auth/callback/route";

// Mock Supabase SSR and headers for callback route behavioral test
const mockCookiesStore = new Map<string, { value: string; options?: any }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(async () => ({
    get: (name: string) => mockCookiesStore.get(name),
    getAll: () =>
      Array.from(mockCookiesStore.entries()).map(([name, item]) => ({
        name,
        value: item.value,
      })),
    set: (name: string, value: string, options?: any) => {
      mockCookiesStore.set(name, { value, options });
    },
    delete: (name: string) => {
      mockCookiesStore.delete(name);
    },
  })),
}));

const mockExchangeCode = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn().mockImplementation((url, key, { cookies }) => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        // Trigger cookie setting callback to test session persistence
        cookies.setAll([
          { name: "sb-access-token", value: "test-access-token-123", options: { httpOnly: true, path: "/" } },
          { name: "sb-refresh-token", value: "test-refresh-token-456", options: { httpOnly: true, path: "/" } },
        ]);
        return mockExchangeCode(code);
      },
    },
  })),
}));

// Mock browser Supabase client
vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn().mockImplementation(() => ({
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  })),
}));

describe("Phase 2C: Social Authentication Behavioral Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookiesStore.clear();
    delete process.env.NEXT_PUBLIC_TEST_AUTH_PROVIDERS;
    process.env.NEXT_PUBLIC_SUPABASE_URL = CANONICAL_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_canonical_test_123";
  });

  describe("1. Canonical Supabase Project Targeting & Discovery", () => {
    it("targets canonical Supabase project (fulzdhltboospethnwfk) and never legacy project", async () => {
      let requestedUrl = "";
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          json: async () => ({ external: { google: true, apple: false } }),
        };
      });

      const settings = await getAuthProviderSettings();

      expect(requestedUrl).toContain(CANONICAL_SUPABASE_PROJECT_REF);
      expect(requestedUrl).toBe("https://fulzdhltboospethnwfk.supabase.co/auth/v1/settings");
      expect(requestedUrl).not.toContain("qtzhcnyxbjocfgimtvvm");
      expect(settings.google).toBe(true);
      expect(settings.apple).toBe(false);
    });

    it("defaults to canonical Supabase URL if NEXT_PUBLIC_SUPABASE_URL is not set", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      let requestedUrl = "";
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          json: async () => ({ external: { google: false, apple: false } }),
        };
      });

      await getAuthProviderSettings();
      expect(requestedUrl).toBe("https://fulzdhltboospethnwfk.supabase.co/auth/v1/settings");
      expect(requestedUrl).not.toContain("qtzhcnyxbjocfgimtvvm");
    });

    it("fails closed when Supabase keys are missing", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const settings = await getAuthProviderSettings();
      expect(settings.google).toBe(false);
      expect(settings.apple).toBe(false);
    });

    it("fails closed when canonical Supabase settings request fails or errors", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Supabase network error"));
      const errorSettings = await getAuthProviderSettings();
      expect(errorSettings.google).toBe(false);
      expect(errorSettings.apple).toBe(false);

      global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
      const badStatusSettings = await getAuthProviderSettings();
      expect(badStatusSettings.google).toBe(false);
      expect(badStatusSettings.apple).toBe(false);
    });

    it("proves NEXT_PUBLIC_TEST_AUTH_PROVIDERS runtime override is removed and ignored", async () => {
      // Attacker or stale config trying to force button visibility
      (process.env as any).NEXT_PUBLIC_TEST_AUTH_PROVIDERS = JSON.stringify({
        google: true,
        apple: true,
      });

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          external: { google: false, apple: false },
        }),
      });

      const settings = await getAuthProviderSettings();
      // Must reflect actual Supabase settings (false, false), ignoring the env var
      expect(settings.google).toBe(false);
      expect(settings.apple).toBe(false);
    });
  });

  describe("2. Executable Component Rendering: Truthful Provider Visibility", () => {
    it("renders nothing (null / empty HTML) when both providers are disabled", () => {
      const html = renderToStaticMarkup(
        React.createElement(SocialAuthButtons, {
          providers: { google: false, apple: false },
          mode: "signin",
          onError: () => {},
        })
      );

      expect(html).toBe("");
    });

    it("renders Google button ONLY when canonical Supabase reports it enabled", () => {
      const html = renderToStaticMarkup(
        React.createElement(SocialAuthButtons, {
          providers: { google: true, apple: false },
          mode: "signin",
          onError: () => {},
        })
      );

      expect(html).toContain("Continue with Google");
      expect(html).not.toContain("Continue with Apple");
      expect(html).not.toContain("Sign up with Apple");
    });

    it("renders Google signup button in signup mode", () => {
      const html = renderToStaticMarkup(
        React.createElement(SocialAuthButtons, {
          providers: { google: true, apple: false },
          mode: "signup",
          onError: () => {},
        })
      );

      expect(html).toContain("Sign up with Google");
      expect(html).not.toContain("Continue with Apple");
    });

    it("renders Apple button ONLY when enabled and hides Google when disabled", () => {
      const html = renderToStaticMarkup(
        React.createElement(SocialAuthButtons, {
          providers: { google: false, apple: true },
          mode: "signin",
          onError: () => {},
        })
      );

      expect(html).toContain("Continue with Apple");
      expect(html).not.toContain("Continue with Google");
    });

    it("renders both buttons when both are enabled", () => {
      const html = renderToStaticMarkup(
        React.createElement(SocialAuthButtons, {
          providers: { google: true, apple: true },
          mode: "signin",
          onError: () => {},
        })
      );

      expect(html).toContain("Continue with Google");
      expect(html).toContain("Continue with Apple");
    });

    it("ensures no disabled 'Coming soon' placeholder buttons ever exist", () => {
      const html = renderToStaticMarkup(
        React.createElement(SocialAuthButtons, {
          providers: { google: false, apple: false },
          mode: "signin",
          onError: () => {},
        })
      );

      expect(html).not.toContain("Coming soon");
      expect(html).not.toContain("disabled");
    });
  });

  describe("3. Executable OAuth Flow & Security Contracts (initiateOAuthSignIn)", () => {
    it("calls signInWithOAuth exactly once with correct provider and canonical callback", async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockSupabase = {
        auth: {
          signInWithOAuth: mockSignInWithOAuth,
        },
      };

      const result = await initiateOAuthSignIn({
        supabase: mockSupabase as any,
        provider: "google",
        origin: "https://j10-nexus.vercel.app",
        nextUrl: "/dashboard",
        mode: "signin",
        onError: vi.fn(),
      });

      expect(result).toBe(true);
      expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: "https://j10-nexus.vercel.app/auth/callback?next=%2Fdashboard",
        },
      });
    });

    it("calls signInWithOAuth for Apple with correct provider value", async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockSupabase = {
        auth: {
          signInWithOAuth: mockSignInWithOAuth,
        },
      };

      const result = await initiateOAuthSignIn({
        supabase: mockSupabase as any,
        provider: "apple",
        origin: "https://j10-nexus.vercel.app",
        nextUrl: "/dashboard/settings",
        mode: "signin",
        onError: vi.fn(),
      });

      expect(result).toBe(true);
      expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "apple",
        options: {
          redirectTo: "https://j10-nexus.vercel.app/auth/callback?next=%2Fdashboard%2Fsettings",
        },
      });
    });

    it("preserves safe deep-link next destinations", async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockSupabase = {
        auth: {
          signInWithOAuth: mockSignInWithOAuth,
        },
      };

      await initiateOAuthSignIn({
        supabase: mockSupabase as any,
        provider: "google",
        origin: "https://j10-nexus.vercel.app",
        nextUrl: "/dashboard/revenue?period=30d",
        mode: "signin",
        onError: vi.fn(),
      });

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo:
            "https://j10-nexus.vercel.app/auth/callback?next=%2Fdashboard%2Frevenue%3Fperiod%3D30d",
        },
      });
    });

    it("rejects malicious open-redirect attempts and defaults to /dashboard", async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockSupabase = {
        auth: {
          signInWithOAuth: mockSignInWithOAuth,
        },
      };

      const maliciousInputs = [
        "https://evil.com/hack",
        "//evil.com/phish",
        "/\\evil.com",
        "javascript:alert(1)",
        "/%2f/attacker.com",
      ];

      for (const maliciousTarget of maliciousInputs) {
        mockSignInWithOAuth.mockClear();

        await initiateOAuthSignIn({
          supabase: mockSupabase as any,
          provider: "google",
          origin: "https://j10-nexus.vercel.app",
          nextUrl: maliciousTarget,
          mode: "signin",
          onError: vi.fn(),
        });

        expect(mockSignInWithOAuth).toHaveBeenCalledWith({
          provider: "google",
          options: {
            redirectTo: "https://j10-nexus.vercel.app/auth/callback?next=%2Fdashboard",
          },
        });
      }
    });

    it("blocks duplicate clicks while request is in-flight or disabled", async () => {
      const mockSignInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockSupabase = {
        auth: {
          signInWithOAuth: mockSignInWithOAuth,
        },
      };

      // 1. When submittingProvider is already set (click in flight)
      const inFlightResult = await initiateOAuthSignIn({
        supabase: mockSupabase as any,
        provider: "google",
        submittingProvider: "google",
        mode: "signin",
        onError: vi.fn(),
      });
      expect(inFlightResult).toBe(false);
      expect(mockSignInWithOAuth).not.toHaveBeenCalled();

      // 2. When disabled is true
      const disabledResult = await initiateOAuthSignIn({
        supabase: mockSupabase as any,
        provider: "google",
        disabled: true,
        mode: "signin",
        onError: vi.fn(),
      });
      expect(disabledResult).toBe(false);
      expect(mockSignInWithOAuth).not.toHaveBeenCalled();
    });

    it("sanitizes OAuth provider errors without leaking internal tokens, secrets, or codes", async () => {
      const errorMsgHolder: string[] = [];
      const mockSupabase = {
        auth: {
          signInWithOAuth: vi.fn().mockResolvedValue({
            data: {},
            error: {
              message:
                "OAuth 401: Invalid client_secret for google_project_98234 with token act_secret_token",
            },
          }),
        },
      };

      const result = await initiateOAuthSignIn({
        supabase: mockSupabase as any,
        provider: "google",
        mode: "signin",
        onError: (err) => errorMsgHolder.push(err),
      });

      expect(result).toBe(false);
      expect(errorMsgHolder.length).toBeGreaterThanOrEqual(1);
      const sanitized = errorMsgHolder[errorMsgHolder.length - 1];
      expect(sanitized).toBe("Email or password is incorrect.");
      expect(sanitized).not.toContain("client_secret");
      expect(sanitized).not.toContain("google_project");
      expect(sanitized).not.toContain("act_secret_token");
    });
  });

  describe("4. Session Cookies Survive Auth Callback", () => {
    it("exchanges code for session and attaches session cookies to redirect response", async () => {
      mockExchangeCode.mockResolvedValueOnce({
        data: {
          session: {
            user: { id: "test-user-uuid-1234", email: "user@example.com" },
            access_token: "mock-session-access-token",
            refresh_token: "mock-session-refresh-token",
          },
        },
        error: null,
      });

      const request = new NextRequest(
        "https://j10-nexus.vercel.app/auth/callback?code=valid-pkce-auth-code&next=/dashboard"
      );

      const response = await authCallbackGet(request);

      expect(mockExchangeCode).toHaveBeenCalledWith("valid-pkce-auth-code");
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://j10-nexus.vercel.app/dashboard");

      // Verify session cookies survive on the response headers
      const setCookies = response.headers.getSetCookie();
      expect(setCookies.some((c) => c.includes("sb-access-token"))).toBe(true);
      expect(setCookies.some((c) => c.includes("sb-refresh-token"))).toBe(true);
    });

    it("redirects to login with sanitized error when exchange fails", async () => {
      mockExchangeCode.mockResolvedValueOnce({
        data: null,
        error: { message: "Invalid or expired authorization code" },
      });

      const request = new NextRequest(
        "https://j10-nexus.vercel.app/auth/callback?code=bad-auth-code"
      );

      const response = await authCallbackGet(request);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://j10-nexus.vercel.app/login?error=auth_callback_failed"
      );
    });
  });

  describe("5. Accurate Copy and Non-Activation at Account Creation", () => {
    it("proves /signup button copy is 'Create Account' (not 'Create Account & Start Trial')", () => {
      const signupContent = readFileSync(resolve(process.cwd(), "app/signup/page.tsx"), "utf8");
      expect(signupContent).toContain('"Create Account"');
      expect(signupContent).not.toContain("Create Account & Start Trial");
    });

    it("proves accurate 72-hour trial copy is preserved", () => {
      const signupContent = readFileSync(resolve(process.cwd(), "app/signup/page.tsx"), "utf8");
      expect(signupContent).toContain(
        "Your 72-hour free trial starts after you complete and approve Outcome Onboarding."
      );
    });

    it("proves generic multi-tenant RLS copy is removed from all auth pages", () => {
      const authPages = [
        "app/signup/page.tsx",
        "app/login/page.tsx",
        "app/forgot-password/page.tsx",
        "app/reset-password/page.tsx",
      ];

      for (const pagePath of authPages) {
        const content = readFileSync(resolve(process.cwd(), pagePath), "utf8");
        expect(content, `Generic copy found in ${pagePath}`).not.toContain(
          "Protected by enterprise multi-tenant isolation & RLS."
        );
        expect(content, `Generic copy found in ${pagePath}`).not.toContain(
          "Protected by enterprise multi-tenant isolation &amp; RLS."
        );
      }
    });
  });

  describe("6. Zero Customer, Database, Stripe, or Connector Mutations", () => {
    it("ensures no new database migrations were added to supabase/migrations", () => {
      const { execSync } = require("node:child_process");
      const diff = execSync("git diff --name-only origin/main -- supabase/migrations", {
        encoding: "utf8",
      }).trim();
      expect(diff).toBe("");
    });

    it("ensures Google connector files remain dedicated and separate from customer auth", () => {
      const connectorPath = resolve(
        process.cwd(),
        "lib/integrations/providers/google/oauth-runtime.ts"
      );
      const content = readFileSync(connectorPath, "utf8");
      // Connector runtime must remain intact for Gmail / Calendar
      expect(content).toContain("GOOGLE_OAUTH_CLIENT_ID");
      expect(content).toContain("GOOGLE_OAUTH_CLIENT_SECRET");
    });

    it("ensures secrets are never exposed in public auth code", () => {
      const publicFiles = [
        "app/login/page.tsx",
        "app/signup/page.tsx",
        "components/auth/social-auth-buttons.tsx",
        "lib/auth/providers.ts",
        "lib/auth/origin.ts",
        "lib/auth/redirect.ts",
      ];

      for (const file of publicFiles) {
        const content = readFileSync(resolve(process.cwd(), file), "utf8");
        expect(content).not.toContain("GOOGLE_OAUTH_CLIENT_SECRET");
        expect(content).not.toContain("APPLE_PRIVATE_KEY");
        expect(content).not.toContain("j10nexus.com");
      }
    });
  });
});
