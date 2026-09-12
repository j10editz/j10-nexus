"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Building2,
  Check,
  ChevronRight,
  Key,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase";

export default function OnboardingPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  // Tab state: "create" | "invite" | "contact"
  const [activeTab, setActiveTab] = useState<"create" | "invite" | "contact">("create");

  // Create Workspace Form
  const [workspaceName, setWorkspaceName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Accept Invitation Form
  const [inviteToken, setInviteToken] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "growth" | "enterprise">("starter");
  const [trialIntent, setTrialIntent] = useState(false);

  useEffect(() => {
    const savedPlan = window.sessionStorage.getItem("j10_launch_plan");
    if (savedPlan === "starter" || savedPlan === "growth" || savedPlan === "enterprise") {
      setSelectedPlan(savedPlan);
    }
    setTrialIntent(window.sessionStorage.getItem("j10_launch_trial") === "1");

    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?next=/onboarding");
        return;
      }

      setUserEmail(user.email || "");

      // Check if user already has an active workspace membership
      const { data: memberships } = await supabase
        .from("workspace_memberships")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1);

      if (memberships && memberships.length > 0) {
        router.push("/dashboard");
        return;
      }

      setLoading(false);
    }

    void checkAuth();
  }, [supabase, router]);

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceName.trim()) return;

    setCreating(true);
    setCreateError("");

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workspaceName.trim(),
          brandName: brandName.trim() || workspaceName.trim(),
          workspaceType: "client",
          plan: selectedPlan,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to provision workspace.");
      }

      // Successfully provisioned in PostgreSQL via RPC
      const planIntent = selectedPlan === "enterprise" ? "enterprise" : selectedPlan;
      router.push(`/dashboard/settings/billing?plan=${planIntent}${trialIntent ? "&trial=1" : ""}`);
    } catch (err: any) {
      setCreateError(err.message || "An unexpected error occurred during workspace creation.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAcceptInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteToken.trim()) return;

    setAccepting(true);
    setInviteError("");

    try {
      // Extract token if raw link was pasted
      let token = inviteToken.trim();
      if (token.includes("invitation=")) {
        const url = new URL(token);
        token = url.searchParams.get("invitation") || token;
      }

      const res = await fetch("/api/workspaces/invitations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to accept workspace invitation.");
      }

      router.push("/dashboard");
    } catch (err: any) {
      setInviteError(err.message || "Invalid or expired invitation token.");
    } finally {
      setAccepting(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07090f] text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="text-xs uppercase tracking-widest font-mono text-slate-500">
            Verifying Identity &amp; Memberships...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#07090f] px-4 py-12 text-slate-200 overflow-hidden font-sans">

      {/* Ambient background lighting */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.14),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-[10%] right-[10%] h-[300px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,217,255,0.08),transparent_70%)] blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-xl rounded-[24px] border border-white/[0.1] bg-[#0b1020]/95 p-6 sm:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl">

        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-3">
            <div className="j10-gradient flex h-10 w-10 items-center justify-center rounded-xl p-2 shadow-[0_0_15px_rgba(0,217,255,0.25)]">
              <Image
                src="/brand/j10-logo.png"
                alt="J10 Monogram"
                width={24}
                height={24}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                J10 NEXUS Workspace Setup
              </h1>
              <p className="text-xs text-slate-400">
                Authenticated as <span className="text-cyan-300 font-mono">{userEmail}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition px-2.5 py-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04]"
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Status Notice */}
        <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3.5 text-xs text-cyan-200 leading-relaxed">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <p className="font-semibold text-white">No Active Workspace Found</p>
          </div>
          <p className="mt-1 text-slate-300 text-[11.5px]">
            Your user account is ready. Create a new client workspace below to start operating J10, or join an existing organization with an invitation token.
          </p>
        </div>

        {/* Option Tabs */}
        <div className="mt-5 grid grid-cols-3 gap-2 border-b border-white/[0.08] pb-4">
          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
              activeTab === "create"
                ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md shadow-cyan-500/20 border border-cyan-400/30"
                : "border border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-white"
            }`}
          >
            <Building2 size={14} />
            <span>New Workspace</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("invite")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
              activeTab === "invite"
                ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md shadow-cyan-500/20 border border-cyan-400/30"
                : "border border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-white"
            }`}
          >
            <Key size={14} />
            <span>Join via Token</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("contact")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
              activeTab === "contact"
                ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md shadow-cyan-500/20 border border-cyan-400/30"
                : "border border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-white"
            }`}
          >
            <Mail size={14} />
            <span>Administrator</span>
          </button>
        </div>

        {/* Tab 1: Create Client Workspace */}
        {activeTab === "create" && (
          <form onSubmit={handleCreateWorkspace} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Workspace Name <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Apex Home Services"
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#07090f] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Brand Display Name (Optional)
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Apex Services"
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#07090f] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Plan Tier
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["starter", "growth", "enterprise"] as const).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`rounded-xl border p-2.5 text-xs font-medium capitalize transition text-center ${
                      selectedPlan === plan
                        ? "border-cyan-400/50 bg-gradient-to-r from-violet-600/30 to-cyan-500/30 text-white shadow-[0_0_12px_rgba(0,217,255,0.2)]"
                        : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-white"
                    }`}
                  >
                    <div className="font-semibold">{plan === "enterprise" ? "Scale" : plan}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {plan === "starter" ? "$49/mo" : plan === "growth" ? "$149/mo" : "$499/mo"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {trialIntent && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-400/[0.08] border border-emerald-400/20 px-3 py-2 text-[11px] text-emerald-300">
                <ShieldCheck size={14} className="shrink-0" />
                <span>14-day free trial will automatically activate upon workspace initialization.</span>
              </div>
            )}

            {createError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {createError}
              </div>
            )}

            <button
              type="submit"
              disabled={creating || !workspaceName.trim()}
              className="j10-btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-semibold text-white shadow-lg shadow-cyan-500/25 disabled:opacity-50 transition"
            >
              {creating ? "Provisioning Workspace..." : "Provision Client Workspace"}
              <ChevronRight size={14} />
            </button>
          </form>
        )}

        {/* Tab 2: Accept Invitation */}
        {activeTab === "invite" && (
          <form onSubmit={handleAcceptInvitation} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Invitation Token or Link <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                required
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="Paste token or invitation link..."
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#07090f] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none font-mono transition"
              />
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-slate-400 leading-relaxed">
              Invitation acceptance requires that your authenticated email address matches the recipient address designated by the workspace owner.
            </div>

            {inviteError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {inviteError}
              </div>
            )}

            <button
              type="submit"
              disabled={accepting || !inviteToken.trim()}
              className="j10-btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-semibold text-white shadow-lg shadow-cyan-500/25 disabled:opacity-50 transition"
            >
              {accepting ? "Verifying & Joining..." : "Accept Workspace Invitation"}
              <ChevronRight size={14} />
            </button>
          </form>
        )}

        {/* Tab 3: Contact Administrator */}
        {activeTab === "contact" && (
          <div className="mt-5 space-y-4 text-xs text-slate-400">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <p className="font-semibold text-white">Need an invite from your organization?</p>
              <p className="leading-relaxed">
                If your company already operates on J10 NEXUS, request an invitation link from your workspace Owner or Admin. Once sent, you can paste the token here or click the invitation link.
              </p>
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-slate-400">
                <span>Platform Support</span>
                <a
                  href="mailto:contact@j10-nexus.com?subject=J10%20NEXUS%20Workspace%20Access%20Request"
                  className="text-cyan-400 hover:underline font-mono"
                >
                  contact@j10-nexus.com
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.08] transition"
            >
              <LogOut size={14} />
              <span>Sign Out to Switch Accounts</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
