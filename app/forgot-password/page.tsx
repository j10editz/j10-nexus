"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { getCanonicalOrigin } from "@/lib/auth/origin";
import { sanitizeAuthError } from "@/lib/auth/errors";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return; // Prevent duplicate submissions

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter a valid work email address.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const origin = getCanonicalOrigin();
      const redirectTo = `${origin}/auth/callback?type=recovery`;

      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
      });

      // User enumeration defense:
      // Even if the auth service returns an error or success,
      // we display the exact neutral confirmation message to prevent account probing.
      if (error) {
        const errorMsg = String(error.message || "").toLowerCase();
        if (error.status === 429 || errorMsg.includes("rate limit") || errorMsg.includes("too many requests")) {
          setErrorMessage("Too many requests. Please wait a few moments before trying again.");
          return;
        }
      }

      setSubmitted(true);
    } catch {
      // Safe generic retry state without exposing internal details
      setSubmitted(true);
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
            Reset your password
          </h1>

          <p className="mt-2 text-xs text-[#8d96a8]">
            Enter your work email to receive password reset instructions.
          </p>
        </div>

        {/* Card */}
        <div className="j10-surface rounded-[26px] p-6 sm:p-8 border border-white/[0.1] shadow-2xl">
          {submitted ? (
            <div className="space-y-5 text-center">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-xs text-emerald-300 leading-relaxed">
                If an account exists for that email, we sent password reset instructions.
              </div>

              <p className="text-xs text-[#8d96a8]">
                Please check your inbox and spam folder. The link will expire shortly for security.
              </p>

              <div className="pt-2 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setEmail("");
                    setErrorMessage("");
                  }}
                  className="rounded-xl border border-white/10 bg-white/[0.03] py-3 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  Send another link
                </button>

                <Link
                  href="/login"
                  className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition text-center"
                >
                  Back to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="recovery-email"
                  className="mb-1.5 block text-xs font-semibold text-[#8d96a8]"
                >
                  Work Email
                </label>

                <input
                  id="recovery-email"
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
                {loading ? "Sending..." : "Send Reset Instructions"}
              </button>

              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="text-xs font-semibold text-[#8d96a8] hover:text-white transition"
                >
                  Return to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
