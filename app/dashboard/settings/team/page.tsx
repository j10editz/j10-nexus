"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  RefreshCw,
  CheckCircle2,
  Trash2,
} from "lucide-react";

export default function J10TeamPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/account/profile");
      if (res.ok) {
        const json = await res.json();
        // Set current member as primary
        if (json.user) {
          setMembers([
            {
              id: json.user.id,
              name: json.profile?.display_name || json.user.email?.split("@")[0] || "User",
              email: json.user.email,
              role: json.activeWorkspaceRole || "owner",
              isCurrent: true,
            },
          ]);
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      setInviting(true);
      setNotice(null);
      const res = await fetch("/api/workspaces/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotice(`Invitation sent to ${inviteEmail.trim()}`);
        setInviteEmail("");
      } else {
        setNotice(data.error || "Failed to send invitation.");
      }
    } catch {
      setNotice("Network error while sending invitation.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#07090f] p-4 sm:p-6 lg:p-8 text-white">
      <div className="mx-auto max-w-[1360px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-400">
              <span>J10 NEXUS</span>
              <span className="text-white/20">/</span>
              <span className="text-[#8d96a8]">Access & Roles</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              J10 Team
            </h1>
            <p className="mt-1 text-xs text-[#8d96a8]">
              Manage authorized workspace collaborators, staff operators, and role-based permissions.
            </p>
          </div>
        </div>

        {notice && (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3.5 text-xs text-cyan-300">
            {notice}
          </div>
        )}

        {/* Invite Form */}
        <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-white">Invite Team Member</h2>
          <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@yourbusiness.com"
              required
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-xs text-white placeholder-white/20 focus:border-cyan-400/40 focus:outline-none"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-xl border border-white/[0.08] bg-[#111216] px-3.5 py-2.5 text-xs text-white focus:border-cyan-400/40 focus:outline-none"
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="agent">Agent / Staff</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-semibold text-[#07090f] transition hover:bg-cyan-300 disabled:opacity-50"
            >
              {inviting ? "Sending..." : "Send Invite"}
            </button>
          </form>
        </section>

        {/* Members List */}
        <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-white">Current Workspace Members</h2>
          <div className="mt-4 divide-y divide-white/[0.06]">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white">
                    {m.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {m.name} {m.isCurrent && <span className="text-[10px] text-[#8d96a8]">(You)</span>}
                    </div>
                    <div className="text-[11px] text-[#8d96a8]">{m.email}</div>
                  </div>
                </div>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-300">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
