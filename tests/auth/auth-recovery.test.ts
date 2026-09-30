import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { getCanonicalOrigin, VERIFIED_PRODUCTION_ORIGIN } from "@/lib/auth/origin";
import { sanitizeAuthError } from "@/lib/auth/errors";
import {
  signRecoveryIntent,
  verifyRecoveryIntentToken,
  deriveRecoverySigningKey,
  RECOVERY_COOKIE_NAME,
  RECOVERY_KEY_CONTEXT,
} from "@/lib/auth/recovery";
import { GET as authCallbackGet } from "@/app/auth/callback/route";
import {
  GET as recoveryIntentGet,
  POST as recoveryIntentPost,
} from "@/app/api/auth/recovery-intent/route";

const SYNTHETIC_TEST_SECRET = "synthetic-auth-secret-for-unit-tests-only-xyz-123456789";

// Mock Supabase SSR and headers
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
const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockResetPasswordForEmail = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn().mockImplementation(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCode,
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  })),
  createBrowserClient: vi.fn().mockImplementation(() => ({
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  })),
}));

describe("Phase 2B Hardened: Authentication Callback, Password Recovery, and Cryptographic Security Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookiesStore.clear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-supabase.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test_publishable_123";
    process.env.AUTH_RECOVERY_HMAC_SECRET = SYNTHETIC_TEST_SECRET;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  describe("1. Canonical Origin and Fallback Verification", () => {
    it("uses the verified Production domain as server-side fallback", () => {
      expect(VERIFIED_PRODUCTION_ORIGIN).toBe("https://j10-nexus.vercel.app");
      expect(getCanonicalOrigin()).toBe("https://j10-nexus.vercel.app");
    });

    it("respects NEXT_PUBLIC_APP_URL when configured", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://preview-deploy.vercel.app";
      expect(getCanonicalOrigin()).toBe("https://preview-deploy.vercel.app");
    });

    it("ensures zero references to the unverified domain exist in auth files", () => {
      const authFiles = [
        "app/login/page.tsx",
        "app/forgot-password/page.tsx",
        "app/reset-password/page.tsx",
        "app/auth/callback/route.ts",
        "lib/auth/origin.ts",
        "lib/auth/redirect.ts",
        "lib/auth/recovery.ts",
        "lib/auth/errors.ts",
      ];

      for (const relativePath of authFiles) {
        const content = readFileSync(resolve(process.cwd(), relativePath), "utf8");
        expect(content, `Forbidden domain found in ${relativePath}`).not.toContain("j10nexus.com");
      }
    });
  });

  describe("2. Open Redirect Defense (getSafeRedirectUrl)", () => {
    it("permits standard internal application paths", () => {
      expect(getSafeRedirectUrl("/dashboard")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/dashboard/settings")).toBe("/dashboard/settings");
      expect(getSafeRedirectUrl("/onboarding")).toBe("/onboarding");
      expect(getSafeRedirectUrl("/reset-password")).toBe("/reset-password");
      expect(getSafeRedirectUrl("/dashboard?tab=workflows&id=123")).toBe("/dashboard?tab=workflows&id=123");
    });

    it("rejects absolute external URLs and protocol-relative bypasses", () => {
      expect(getSafeRedirectUrl("https://evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("http://evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("//evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("///evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("////evil.com/steal")).toBe("/dashboard");
    });

    it("rejects backslash-based parser confusion and script schemes", () => {
      expect(getSafeRedirectUrl("/\\evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("\\/evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("\\\\evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("javascript:alert(1)")).toBe("/dashboard");
      expect(getSafeRedirectUrl("data:text/html,<script>alert(1)</script>")).toBe("/dashboard");
    });

    it("rejects multi-encoded and control character bypasses", () => {
      expect(getSafeRedirectUrl("/%2f/evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("%2f%2fevil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/dashboard\r\nLocation: https://evil.com")).toBe("/dashboard");
      expect(getSafeRedirectUrl("/dashboard\x00evil")).toBe("/dashboard");
    });
  });

  describe("3. Forced Recovery Destination and Server-Controlled Recovery Intent", () => {
    it("forces type=recovery callbacks to /reset-password, ignoring supplied next destination", async () => {
      const mockUser = { id: "user-recovery-uuid-1", email: "user@example.com" };
      mockExchangeCode.mockResolvedValueOnce({
        data: {
          session: {
            user: mockUser,
            access_token: "act_test_secret_token",
            refresh_token: "ref_test_secret_token",
          },
        },
        error: null,
      });

      const request = new NextRequest(
        "https://j10-nexus.vercel.app/auth/callback?code=mock_valid_recovery_code&type=recovery&next=/dashboard"
      );

      const response = await authCallbackGet(request);

      expect(mockExchangeCode).toHaveBeenCalledWith("mock_valid_recovery_code");

      // Verifies destination is FORCED to /reset-password, ignoring ?next=/dashboard
      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toBe("https://j10-nexus.vercel.app/reset-password");
      expect(location).not.toContain("next=/dashboard");
      expect(location).not.toContain("code=");

      // Verifies that short-lived HttpOnly recovery intent cookie is established
      const setCookies = response.headers.getSetCookie();
      const recoveryCookie = setCookies.find((c) => c.includes(RECOVERY_COOKIE_NAME));
      expect(recoveryCookie).toBeDefined();
      expect(recoveryCookie).toContain("HttpOnly");
      expect(recoveryCookie?.toLowerCase()).toContain("samesite=lax");

      // Verifies tokens/passwords never leak in location header
      expect(location).not.toContain("act_test_secret_token");
      expect(location).not.toContain("ref_test_secret_token");
    });

    it("rejects ordinary authenticated sessions from recovery intent verification", async () => {
      // Ordinary session without recovery intent cookie
      const response = await recoveryIntentGet();
      const data = await response.json();

      expect(data.valid).toBe(false);
    });

    it("verifies valid recovery intent matching authenticated user", async () => {
      const recoveryUser = { id: "recovery-user-uuid-99", email: "target@example.com" };
      mockGetUser.mockResolvedValue({
        data: { user: recoveryUser },
        error: null,
      });

      const token = signRecoveryIntent(recoveryUser.id);
      expect(token).toBeTruthy();
      mockCookiesStore.set(RECOVERY_COOKIE_NAME, { value: token! });

      const response = await recoveryIntentGet();
      const data = await response.json();

      expect(data.valid).toBe(true);
    });

    it("rejects expired or mismatched recovery intent tokens", async () => {
      const userA = { id: "user-a-uuid", email: "a@example.com" };
      mockGetUser.mockResolvedValue({
        data: { user: userA },
        error: null,
      });

      // Cookie signed for user B
      const tokenForUserB = signRecoveryIntent("user-b-uuid");
      expect(tokenForUserB).toBeTruthy();
      mockCookiesStore.set(RECOVERY_COOKIE_NAME, { value: tokenForUserB! });

      const response = await recoveryIntentGet();
      const data = await response.json();

      expect(data.valid).toBe(false);
    });
  });

  describe("4. Password Reset Execution and Intent Clearance", () => {
    it("blocks ordinary sessions without recovery intent from resetting password", async () => {
      const request = new NextRequest("https://j10-nexus.vercel.app/api/auth/recovery-intent", {
        method: "POST",
        body: JSON.stringify({ password: "NewStrongPassword123!" }),
      });

      const response = await recoveryIntentPost(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("The recovery link is invalid or has expired. Request a new link to continue.");
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("rejects weak passwords (< 8 characters) before calling updateUser", async () => {
      const recoveryUser = { id: "valid-recovery-user", email: "user@example.com" };
      mockGetUser.mockResolvedValue({
        data: { user: recoveryUser },
        error: null,
      });

      const token = signRecoveryIntent(recoveryUser.id);
      expect(token).toBeTruthy();
      mockCookiesStore.set(RECOVERY_COOKIE_NAME, { value: token! });

      const request = new NextRequest("https://j10-nexus.vercel.app/api/auth/recovery-intent", {
        method: "POST",
        body: JSON.stringify({ password: "short" }),
      });

      const response = await recoveryIntentPost(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Password must be at least 8 characters long.");
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("calls updateUser exactly once and immediately clears recovery intent on success", async () => {
      const recoveryUser = { id: "valid-recovery-user-123", email: "target@example.com" };
      mockGetUser.mockResolvedValue({
        data: { user: recoveryUser },
        error: null,
      });
      mockUpdateUser.mockResolvedValueOnce({
        data: { user: recoveryUser },
        error: null,
      });

      const token = signRecoveryIntent(recoveryUser.id);
      expect(token).toBeTruthy();
      mockCookiesStore.set(RECOVERY_COOKIE_NAME, { value: token! });

      const request = new NextRequest("https://j10-nexus.vercel.app/api/auth/recovery-intent", {
        method: "POST",
        body: JSON.stringify({ password: "SecurePassphrase2026!" }),
      });

      const response = await recoveryIntentPost(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verifies updateUser was called exactly once with password
      expect(mockUpdateUser).toHaveBeenCalledTimes(1);
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: "SecurePassphrase2026!" });

      // Verifies recovery intent cookie is cleared (maxAge: 0)
      const setCookies = response.headers.getSetCookie();
      const clearedCookie = setCookies.find((c) => c.includes(RECOVERY_COOKIE_NAME));
      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain("Max-Age=0");
    });
  });

  describe("5. Cryptographic Hardening: Purpose-Separated HKDF Key Derivation and Fail-Closed Security", () => {
    it("proves public publishable/anon keys cannot sign or validate recovery intent", () => {
      delete process.env.AUTH_RECOVERY_HMAC_SECRET;
      delete process.env.SUPABASE_SECRET_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_live_test_pub_key_123";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon_key_test_456";

      // Must refuse to sign using public keys
      const token = signRecoveryIntent("user-test-uuid");
      expect(token).toBeNull();

      // Must refuse to validate using public keys
      const fakeToken = "eyJhbGciOiJIUzI1NiJ9.sig";
      const result = verifyRecoveryIntentToken(fakeToken, "user-test-uuid");
      expect(result.valid).toBe(false);
    });

    it("proves hardcoded fallback signing is impossible (missing secret fails closed)", () => {
      delete process.env.AUTH_RECOVERY_HMAC_SECRET;
      delete process.env.SUPABASE_SECRET_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const derivedKey = deriveRecoverySigningKey();
      expect(derivedKey).toBeNull();

      const token = signRecoveryIntent("user-uuid");
      expect(token).toBeNull();
    });

    it("validates signature derived from server-only secrets (AUTH_RECOVERY_HMAC_SECRET, SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY)", () => {
      // 1. With AUTH_RECOVERY_HMAC_SECRET
      process.env.AUTH_RECOVERY_HMAC_SECRET = "auth-secret-1";
      const token1 = signRecoveryIntent("user-crypto-1");
      expect(token1).toBeTruthy();
      expect(verifyRecoveryIntentToken(token1, "user-crypto-1").valid).toBe(true);

      // 2. With SUPABASE_SECRET_KEY fallback
      delete process.env.AUTH_RECOVERY_HMAC_SECRET;
      process.env.SUPABASE_SECRET_KEY = "supabase-secret-key-2";
      const token2 = signRecoveryIntent("user-crypto-2");
      expect(token2).toBeTruthy();
      expect(verifyRecoveryIntentToken(token2, "user-crypto-2").valid).toBe(true);

      // 3. With SUPABASE_SERVICE_ROLE_KEY legacy fallback
      delete process.env.SUPABASE_SECRET_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "supabase-service-role-key-3";
      const token3 = signRecoveryIntent("user-crypto-3");
      expect(token3).toBeTruthy();
      expect(verifyRecoveryIntentToken(token3, "user-crypto-3").valid).toBe(true);
    });

    it("rejects token if user ID, expiration, payload, or signature is tampered", () => {
      process.env.AUTH_RECOVERY_HMAC_SECRET = SYNTHETIC_TEST_SECRET;
      const validToken = signRecoveryIntent("legit-user")!;
      const [b64Payload, signature] = validToken.split(".");

      // 1. Tampered signature
      const tamperedSigToken = `${b64Payload}.${signature.slice(0, -4)}XXXX`;
      expect(verifyRecoveryIntentToken(tamperedSigToken, "legit-user").valid).toBe(false);

      // 2. Tampered user ID in payload
      const tamperedPayloadStr = JSON.stringify({ userId: "attacker-user", exp: Date.now() + 60000 });
      const tamperedB64Payload = Buffer.from(tamperedPayloadStr, "utf8").toString("base64url");
      const tamperedUserToken = `${tamperedB64Payload}.${signature}`;
      expect(verifyRecoveryIntentToken(tamperedUserToken, "attacker-user").valid).toBe(false);

      // 3. Expired token
      const expiredPayloadStr = JSON.stringify({ userId: "legit-user", exp: Date.now() - 1000 });
      const expiredB64 = Buffer.from(expiredPayloadStr, "utf8").toString("base64url");
      // Even if signed correctly, expired token must be rejected
      const key = deriveRecoverySigningKey()!;
      const crypto = require("node:crypto");
      const expiredSig = crypto.createHmac("sha256", key).update(expiredB64).digest("base64url");
      const expiredToken = `${expiredB64}.${expiredSig}`;
      expect(verifyRecoveryIntentToken(expiredToken, "legit-user").valid).toBe(false);

      // 4. User mismatch verification
      expect(verifyRecoveryIntentToken(validToken, "wrong-user").valid).toBe(false);
    });

    it("rejects tokens signed under a different HKDF purpose/context", () => {
      process.env.AUTH_RECOVERY_HMAC_SECRET = SYNTHETIC_TEST_SECRET;

      // Sign under different purpose context
      const tokenDifferentContext = signRecoveryIntent("user-context-test", "j10-other-purpose-v1");
      expect(tokenDifferentContext).toBeTruthy();

      // Verify with standard context -> must be rejected
      const verification = verifyRecoveryIntentToken(tokenDifferentContext, "user-context-test", RECOVERY_KEY_CONTEXT);
      expect(verification.valid).toBe(false);
    });

    it("ensures callback configuration failure creates no recovery cookie", async () => {
      // Missing all server-side secrets
      delete process.env.AUTH_RECOVERY_HMAC_SECRET;
      delete process.env.SUPABASE_SECRET_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const mockUser = { id: "user-no-secret", email: "user@example.com" };
      mockExchangeCode.mockResolvedValueOnce({
        data: {
          session: {
            user: mockUser,
            access_token: "act_token",
            refresh_token: "ref_token",
          },
        },
        error: null,
      });

      const request = new NextRequest(
        "https://j10-nexus.vercel.app/auth/callback?code=mock_code&type=recovery"
      );

      const response = await authCallbackGet(request);

      // Fails closed to safe expired/error destination
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://j10-nexus.vercel.app/reset-password?error=expired");

      // Zero recovery cookie set
      const setCookies = response.headers.getSetCookie();
      const recoveryCookie = setCookies.find((c) => c.includes(RECOVERY_COOKIE_NAME));
      expect(recoveryCookie).toBeUndefined();
    });

    it("proves missing Supabase credentials fail closed without placeholder URLs", async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const request = new NextRequest(
        "https://j10-nexus.vercel.app/auth/callback?code=mock_code&type=recovery"
      );

      const response = await authCallbackGet(request);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://j10-nexus.vercel.app/reset-password?error=expired");

      // Verify no network request was made or placeholder reached
      expect(mockExchangeCode).not.toHaveBeenCalled();
    });
  });

  describe("6. Sanitization of Provider Failures and Enumeration Defense", () => {
    it("maps provider errors to controlled messages without leaking internal exceptions", () => {
      const dbException = {
        message: "Database connection failed at pg_catalog.auth_users query execution (SQLSTATE 08006)",
        status: 500,
      };

      expect(sanitizeAuthError(dbException, "signin")).toBe("Email or password is incorrect.");
      expect(sanitizeAuthError(dbException, "signup")).toBe(
        "We could not create the account. Please verify your information and try again."
      );
      expect(sanitizeAuthError(dbException, "reset")).toBe(
        "We could not update the password. Please request a new recovery link."
      );
      expect(sanitizeAuthError(dbException, "callback")).toBe(
        "The recovery link is invalid or has expired. Request a new link to continue."
      );
    });

    it("displays identical neutral response for registered and unregistered recovery requests", async () => {
      const resRegistered = sanitizeAuthError(null, "recovery");
      const resUnregistered = sanitizeAuthError({ message: "User not found" }, "recovery");

      expect(resRegistered).toBe(resUnregistered);
      expect(resRegistered).toBe("If an account exists for that email, we sent password reset instructions.");
    });
  });

  describe("7. Server-Only Module and Client Bundle Secrets Exclusion", () => {
    it("verifies lib/auth/recovery.ts has import 'server-only'", () => {
      const recoveryFile = readFileSync(
        resolve(process.cwd(), "lib/auth/recovery.ts"),
        "utf8"
      );
      expect(recoveryFile).toContain('import "server-only";');
      expect(recoveryFile).not.toContain("NEXT_PUBLIC_");
      expect(recoveryFile).not.toContain("j10-nexus-recovery-internal-salt");
    });

    it("ensures private secrets never appear in client bundles, routes, or redirect targets", () => {
      const clientFiles = [
        "lib/supabase.ts",
        "app/login/page.tsx",
        "app/forgot-password/page.tsx",
        "app/reset-password/page.tsx",
        "middleware.ts",
      ];

      for (const relativePath of clientFiles) {
        const content = readFileSync(resolve(process.cwd(), relativePath), "utf8");
        expect(content).not.toContain("AUTH_RECOVERY_HMAC_SECRET");
        expect(content).not.toContain("SUPABASE_SECRET_KEY");
        expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      }
    });

    it("ensures zero placeholder credentials remain in callback route", () => {
      const callbackContent = readFileSync(
        resolve(process.cwd(), "app/auth/callback/route.ts"),
        "utf8"
      );
      expect(callbackContent).not.toContain("placeholder.supabase.co");
      expect(callbackContent).not.toContain("placeholder-anon-key");
    });
  });
});
