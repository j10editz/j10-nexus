"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { getCanonicalOrigin } from "@/lib/auth/origin";
import { sanitizeAuthError } from "@/lib/auth/errors";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";

export default function SignupPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextUrl, setNextUrl] = useState<string>("/dashboard");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [providers, setProviders] = useState<{ google: boolean; apple: boolean }>({
    google: false,
    apple: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const nextParam = params.get("next");
    if (nextParam) {
      setNextUrl(getSafeRedirectUrl(nextParam, "/dashboard"));
    }

    const plan = params.get("plan");
    const trial = params.get("trial");
    if (plan) window.sessionStorage.setItem("j10_launch_plan", plan);
    if (trial === "1") window.sessionStorage.setItem("j10_launch_trial", "1");

    // Fetch active provider capabilities for truthful display
    async function loadProviders() {
      try {
        const res = await fetch("/api/auth/providers");
        if (res.ok) {
          const data = await res.json();
          setProviders({
            google: Boolean(data?.google),
            apple: Boolean(data?.apple),
          });
        }
      } catch {
        // Safe default: hide social auth if discovery fails
        setProviders({ google: false, apple: false });
      }
    }

    loadProviders();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return; // Prevent duplicate submissions

    setLoading(true);
    setMessage("");
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      setLoading(false);
      return;
    }

    try {
      const origin =
        typeof window !== "undefined" && window.location.origin
          ? window.location.origin
          : getCanonicalOrigin();

      const safeNext = getSafeRedirectUrl(nextUrl, "/dashboard");
      const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        setErrorMessage(sanitizeAuthError(error, "signup"));
        return;
      }

      setMessage(
        "Account created. Check your email to confirm your account before signing in."
      );
      setEmail("");
      setPassword("");
    } catch {
      setErrorMessage("We could not create the account. Please verify your information and try again.");
    } finally {
      setLoading(false);
    }
  }

  const loginUrl = nextUrl && nextUrl !== "/dashboard" ? `/login?next=${encodeURIComponent(nextUrl)}` : "/login";

  return (
    <main className="j10-canvas flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-8 text-center flex flex-col items-center">
          <Link href="/" className="mb-4 inline-flex items-center gap-2.5">
            <span className="j10-gradient flex h-11 w-11 items-center justify-center rounded-2xl p-2 shadow-[0_8px_24px_rgba(47,107,255,0.3)]">
              <Image
                src="/brand/j10-logo.png"
                alt="J10 monogram"
                width={30}
                height={30}
                className="h-full w-full object-contain"
                priority
              />
            </span>
          </Link>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            J10 NEXUS
          </p>

          <h1 className="mt-2 text-3xl font-extrabold text-white tracking-tight">
            Create your account
          </h1>

          <p className="mt-2 text-xs text-[#8d96a8]">
            Your 72-hour free trial starts after you complete and approve Outcome Onboarding.
          </p>
        </div>

        {/* Card */}
        <div className="j10-surface rounded-[26px] p-6 sm:p-8 border border-white/[0.1] shadow-2xl">
          <div className="space-y-5">
            {/* Truthful Social Auth Buttons (Google / Apple rendered ONLY when enabled) */}
            <SocialAuthButtons
              providers={providers}
              nextUrl={nextUrl}
              mode="signup"
              disabled={loading}
              onError={setErrorMessage}
              onLoadingChange={setLoading}
            />

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="signup-email"
                  className="mb-1.5 block text-xs font-semibold text-[#8d96a8]"
                >
                  Work Email
                </label>

                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  disabled={loading}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#5f697d] focus:border-cyan-400 focus:bg-white/[0.05] disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="mb-1.5 block text-xs font-semibold text-[#8d96a8]"
                >
                  Password
                </label>

                <input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password (min. 8 characters)"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#5f697d] focus:border-cyan-400 focus:bg-white/[0.05] disabled:opacity-50"
                />
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                  {errorMessage}
                </div>
              )}

              {message && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="j10-gradient w-full rounded-xl py-3.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(47,107,255,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Creating Account..." : "Create Account & Start Trial"}
              </button>
            </form>
          </div>

          {/* Navigation link to Login */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
            <p className="text-xs text-[#8d96a8]">
              Already have an account?{" "}
              <Link
                href={loginUrl}
                className="font-semibold text-cyan-300 hover:text-cyan-200 transition"
              >
                Sign In
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center text-[11px] text-[#5f697d]">
            Protected by enterprise multi-tenant isolation &amp; RLS.
          </div>
        </div>
      </div>
    </main>
  );
}
