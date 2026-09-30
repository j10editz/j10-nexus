"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function verifyRecoverySession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // Check query param for errors passed from callback
        const params = new URLSearchParams(window.location.search);
        if (params.get("error") === "expired" || !session) {
          setHasValidSession(false);
        } else {
          setHasValidSession(true);
        }
      } catch {
        setHasValidSession(false);
      } finally {
        setCheckingSession(false);
      }
    }

    verifyRecoverySession();
  }, [supabase.auth]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please verify and try again.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Failed to update password. Please request a new reset link.");
        return;
      }

      setSuccess(true);
      // Clean password from component state
      setPassword("");
      setConfirmPassword("");

      // Allow user to see confirmation before smooth redirect
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
            Create new password
          </h1>

          <p className="mt-2 text-xs text-[#8d96a8]">
            Set a secure password for your workspace account.
          </p>
        </div>

        {/* Card */}
        <div className="j10-surface rounded-[26px] p-6 sm:p-8 border border-white/[0.1] shadow-2xl">
          {checkingSession ? (
            <div className="py-8 text-center text-xs text-[#8d96a8]">
              Verifying recovery authorization...
            </div>
          ) : !hasValidSession ? (
            <div className="space-y-5 text-center">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-xs text-amber-300 leading-relaxed">
                Password reset link is invalid or has expired. For security, recovery links are single-use and time-limited.
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Link
                  href="/forgot-password"
                  className="j10-gradient w-full rounded-xl py-3.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(47,107,255,0.3)] transition hover:brightness-110 text-center block"
                >
                  Request New Reset Link
                </Link>

                <Link
                  href="/login"
                  className="text-xs font-semibold text-[#8d96a8] hover:text-white transition text-center"
                >
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="space-y-4 text-center">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-xs text-emerald-300 leading-relaxed">
                Password updated successfully. Redirecting to your workspace...
              </div>

              <Link
                href="/dashboard"
                className="j10-gradient w-full rounded-xl py-3 text-xs font-semibold text-white block transition hover:brightness-110 text-center"
              >
                Go to Workspace Now
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-1.5 block text-xs font-semibold text-[#8d96a8]"
                >
                  New Password
                </label>

                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#5f697d] focus:border-cyan-400 focus:bg-white/[0.05] disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1.5 block text-xs font-semibold text-[#8d96a8]"
                >
                  Confirm New Password
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#5f697d] focus:border-cyan-400 focus:bg-white/[0.05] disabled:opacity-50"
                />
              </div>

              {/* Password Requirement Guidelines */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-[#8d96a8] space-y-1">
                <div className="font-semibold text-white/80 mb-1">Password requirements:</div>
                <div className={password.length >= 8 ? "text-emerald-400" : ""}>
                  • Minimum 8 characters
                </div>
                <div
                  className={
                    password && confirmPassword && password === confirmPassword
                      ? "text-emerald-400"
                      : ""
                  }
                >
                  • Passwords must match
                </div>
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
                {loading ? "Updating password..." : "Set New Password"}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-[11px] text-[#5f697d]">
            Protected by enterprise multi-tenant isolation &amp; RLS.
          </div>
        </div>
      </div>
    </main>
  );
}
