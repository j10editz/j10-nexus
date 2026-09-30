"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function verifyRecoveryIntent() {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("error") === "expired") {
          setHasValidSession(false);
          setCheckingSession(false);
          return;
        }

        // Server-controlled recovery intent verification:
        // Verifies the presence and cryptographic signature of the short-lived
        // recovery intent cookie established during /auth/callback.
        // Ordinary authenticated sessions without recovery intent are strictly rejected.
        const res = await fetch("/api/auth/recovery-intent");
        if (!res.ok) {
          setHasValidSession(false);
          setCheckingSession(false);
          return;
        }

        const data = await res.json();
        setHasValidSession(Boolean(data.valid));
      } catch {
        setHasValidSession(false);
      } finally {
        setCheckingSession(false);
      }
    }

    verifyRecoveryIntent();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return; // Prevent duplicate submissions
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
      // Execute password reset through server-controlled endpoint that validates
      // recovery intent cookie, executes updateUser on user session, and immediately clears the intent.
      const res = await fetch("/api/auth/recovery-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(
          data.error || "We could not update the password. Please request a new recovery link."
        );
        return;
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");

      // Smooth transition to workspace
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    } catch {
      setErrorMessage("We could not update the password. Please request a new recovery link.");
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
                The recovery link is invalid or has expired. Request a new link to continue.
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
