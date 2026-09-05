"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Key,
  LogOut,
  Mail,
  Shield,
  Sparkles,
  UserCheck,
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

  useEffect(() => {
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
          plan: "starter",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to provision workspace.");
      }

      // Successfully provisioned in PostgreSQL via RPC
      router.push("/dashboard");
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
      <div className="flex min-h-screen items-center justify-center bg-[#09090B] text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-xs uppercase tracking-widest font-mono text-zinc-500">
            Verifying Identity & Memberships...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090B] px-4 py-12 text-zinc-200">
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#111115] p-8 shadow-2xl shadow-black/80">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Building2 size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                J10 NEXUS Workspace Onboarding
              </h1>
              <p className="text-xs text-zinc-400">
                Authenticated as <span className="text-violet-400 font-mono">{userEmail}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition px-2.5 py-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04]"
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Notice */}
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-xs text-amber-200 leading-relaxed">
          <p className="font-semibold text-amber-300">No Active Workspace Assigned</p>
          <p className="mt-1 text-zinc-400">
            Your identity has been verified, but your account is not yet enrolled in any active workspace. Choose an option below to proceed into the system.
          </p>
        </div>

        {/* Option Tabs */}
        <div className="mt-6 grid grid-cols-3 gap-2 border-b border-white/[0.08] pb-4">
          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
              activeTab === "create"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                : "border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white"
            }`}
          >
            <Sparkles size={14} />
            <span>New Workspace</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("invite")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
              activeTab === "invite"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                : "border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white"
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
                ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                : "border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white"
            }`}
          >
            <Mail size={14} />
            <span>Administrator</span>
          </button>
        </div>

        {/* Tab 1: Create Client Workspace */}
        {activeTab === "create" && (
          <form onSubmit={handleCreateWorkspace} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                Workspace Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="e.g. Acme Operations"
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#16161C] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400">
                Brand Name (Optional)
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Acme Group"
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#16161C] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-zinc-500 leading-relaxed">
              Standard client workspaces are provisioned with Owner authority over their individual tenant domain. Administrative authority over J10 NEXUS HQ or Agency Master is reserved for verified platform leadership.
            </div>

            {createError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {createError}
              </div>
            )}

            <button
              type="submit"
              disabled={creating || !workspaceName.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-xs font-semibold text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500 disabled:opacity-50 transition"
            >
              {creating ? "Provisioning in Database..." : "Provision Client Workspace"}
              <ChevronRight size={14} />
            </button>
          </form>
        )}

        {/* Tab 2: Accept Invitation */}
        {activeTab === "invite" && (
          <form onSubmit={handleAcceptInvitation} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                Invitation Token or Link <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="Paste token or https://j10-nexus.vercel.app/login?invitation=..."
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#16161C] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none font-mono"
              />
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] text-zinc-500 leading-relaxed">
              Invitation acceptance requires that your authenticated email address matches the recipient address designated by the inviting workspace administrator.
            </div>

            {inviteError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {inviteError}
              </div>
            )}

            <button
              type="submit"
              disabled={accepting || !inviteToken.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-xs font-semibold text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500 disabled:opacity-50 transition"
            >
              {accepting ? "Verifying & Joining..." : "Accept Workspace Invitation"}
              <ChevronRight size={14} />
            </button>
          </form>
        )}

        {/* Tab 3: Contact Administrator */}
        {activeTab === "contact" && (
          <div className="mt-6 space-y-4 text-xs text-zinc-400">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <p className="font-semibold text-white">Need an invite from your organization?</p>
              <p>
                If your company already operates on J10 NEXUS, request an invitation link from your workspace Owner or Admin. Once sent, you can paste the token here or click the invitation link.
              </p>
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-zinc-400">
                <span>Platform Support</span>
                <a
                  href="mailto:contact.j10editz@gmail.com?subject=J10%20NEXUS%20Workspace%20Access%20Request"
                  className="text-violet-400 hover:underline font-mono"
                >
                  contact.j10editz@gmail.com
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.08] transition"
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
