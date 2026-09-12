"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("intent") === "signup") {
      setMode("signup");
      const plan = params.get("plan");
      const trial = params.get("trial");
      if (plan) window.sessionStorage.setItem("j10_launch_plan", plan);
      if (trial === "1") window.sessionStorage.setItem("j10_launch_trial", "1");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        setMessage(
          "Account created. Check your email to confirm your account before signing in."
        );

        setMode("signin");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
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
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>

          <p className="mt-2 text-xs text-[#8d96a8]">
            {mode === "signin"
              ? "Sign in to access your workspace operating center."
              : "Set up your workspace and start your 14-day free trial."}
          </p>
        </div>

        {/* Card */}
        <div className="j10-surface rounded-[26px] p-6 sm:p-8 border border-white/[0.1] shadow-2xl">
          <div className="mb-6 grid grid-cols-2 rounded-xl bg-white/[0.03] p-1 border border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setMessage("");
                setErrorMessage("");
              }}
              className={`rounded-lg py-2.5 text-xs font-semibold transition ${
                mode === "signin"
                  ? "j10-gradient text-white shadow-sm"
                  : "text-[#8d96a8] hover:text-white"
              }`}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setMessage("");
                setErrorMessage("");
              }}
              className={`rounded-lg py-2.5 text-xs font-semibold transition ${
                mode === "signup"
                  ? "j10-gradient text-white shadow-sm"
                  : "text-[#8d96a8] hover:text-white"
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#8d96a8]">
                Work Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#5f697d] focus:border-cyan-400 focus:bg-white/[0.05]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#8d96a8]">
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password (min. 6 characters)"
                required
                minLength={6}
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-[#5f697d] focus:border-cyan-400 focus:bg-white/[0.05]"
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
              {loading
                ? "Processing..."
                : mode === "signin"
                ? "Sign In to Workspace"
                : "Create Account & Start Trial"}
            </button>
          </form>

          <div className="mt-6 text-center text-[11px] text-[#5f697d]">
            Protected by enterprise multi-tenant isolation &amp; RLS.
          </div>
        </div>
      </div>
    </main>
  );
}
