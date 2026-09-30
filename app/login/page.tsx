"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { sanitizeAuthError } from "@/lib/auth/errors";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextUrl, setNextUrl] = useState<string>("/dashboard");

  const [loading, setLoading] = useState(false);
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

    // If an incoming request explicitly requested signup, redirect seamlessly to dedicated /signup
    if (params.get("intent") === "signup") {
      const search = params.toString();
      router.replace(search ? `/signup?${search}` : "/signup");
      return;
    }

    const errorParam = params.get("error");
    if (errorParam) {
      if (errorParam === "auth_callback_failed") {
        setErrorMessage("The recovery link is invalid or has expired. Request a new link to continue.");
      } else {
        setErrorMessage("Authentication could not be verified. Please try signing in again.");
      }
    }

    // Discover active provider capabilities for truthful display
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
        setProviders({ google: false, apple: false });
      }
    }

    loadProviders();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return; // Prevent duplicate submissions

    setLoading(true);
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(sanitizeAuthError(error, "signin"));
        return;
      }

      const safeDestination = getSafeRedirectUrl(nextUrl, "/dashboard");
      router.push(safeDestination);
      router.refresh();
    } catch {
      setErrorMessage("Email or password is incorrect.");
    } finally {
      setLoading(false);
    }
  }

  const signupUrl = nextUrl && nextUrl !== "/dashboard" ? `/signup?next=${encodeURIComponent(nextUrl)}` : "/signup";

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
            Welcome back
          </h1>

          <p className="mt-2 text-xs text-[#8d96a8]">
            Sign in to access your workspace operating center.
          </p>
        </div>

        {/* Card */}
        <div className="j10-surface rounded-[26px] p-6 sm:p-8 border border-white/[0.1] shadow-2xl">
          <div className="space-y-5">
            {/* Truthful Social Auth Buttons (Google / Apple rendered ONLY when enabled) */}
            <SocialAuthButtons
              providers={providers}
              nextUrl={nextUrl}
              mode="signin"
              disabled={loading}
              onError={setErrorMessage}
              onLoadingChange={setLoading}
            />

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-xs font-semibold text-[#8d96a8]"
                >
                  Work Email
                </label>

                <input
                  id="login-email"
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
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-[#8d96a8]"
                  >
                    Password
                  </label>

                  <Link
                    href="/forgot-password"
                    className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition"
                  >
                    Forgot password?
                  </Link>
                </div>

                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#5f697d] focus:border-cyan-400 focus:bg-white/[0.05] disabled:opacity-50"
                />
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="j10-gradient w-full rounded-xl py-3.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(47,107,255,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Signing In..." : "Sign In to Workspace"}
              </button>
            </form>
          </div>

          {/* Navigation link to dedicated Signup */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
            <p className="text-xs text-[#8d96a8]">
              Don&apos;t have an account?{" "}
              <Link
                href={signupUrl}
                className="font-semibold text-cyan-300 hover:text-cyan-200 transition"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
