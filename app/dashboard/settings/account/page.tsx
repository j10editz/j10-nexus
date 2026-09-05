"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Mail,
  Shield,
  User,
  AlertCircle,
  Clock,
  Briefcase,
  Phone,
  Globe,
} from "lucide-react";

export default function AccountSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [currentEmail, setCurrentEmail] = useState("");
  const [platformRole, setPlatformRole] = useState<string | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  // Email update state
  const [newEmail, setNewEmail] = useState("");
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    async function loadAccountData() {
      try {
        const res = await fetch("/api/account/profile", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load profile");
        const data = await res.json();
        if (data.success) {
          setDisplayName(data.profile?.display_name || "");
          setJobTitle(data.profile?.job_title || "");
          setPhone(data.profile?.phone || "");
          setTimezone(data.profile?.timezone || "UTC");
          setCurrentEmail(data.user?.email || "");
          setPlatformRole(data.platformRole);
          setWorkspaceRole(data.activeWorkspaceRole);
          setWorkspaceName(data.activeWorkspaceName);
        }
      } catch (err: any) {
        setProfileError(err.message || "Failed to load account data");
      } finally {
        setLoading(false);
      }
    }

    void loadAccountData();
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileNotice("");
    setProfileError("");

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          job_title: jobTitle,
          phone,
          timezone,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save profile");
      }

      setProfileNotice("Profile updated successfully.");
      setTimeout(() => setProfileNotice(""), 4000);
    } catch (err: any) {
      setProfileError(err.message || "An error occurred while saving profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRequestEmailChange(e: React.FormEvent) {
    e.preventDefault();
    setUpdatingEmail(true);
    setEmailNotice("");
    setEmailError("");

    try {
      const res = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to initiate email change");
      }

      setEmailNotice(
        data.message ||
          "Confirmation link sent. Please verify the link sent to your new email address to complete the change."
      );
      setNewEmail("");
    } catch (err: any) {
      setEmailError(err.message || "Failed to initiate email change.");
    } finally {
      setUpdatingEmail(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-white/50 text-sm">
        Loading account details...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Account &amp; Security</h1>
        <p className="mt-1 text-sm text-white/50">
          Manage your personal profile, credentials, and platform authorization status.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Platform Authorization Status Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E0F12] p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-violet-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Authorization &amp; Platform Role</h2>
              <p className="text-xs text-white/50">
                Separation of platform governance and customer workspace ownership
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                Platform Authority
              </span>
              <div className="mt-2 flex items-center gap-2">
                {platformRole === "platform_founder" ? (
                  <span className="inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-300">
                    Platform Founder
                  </span>
                ) : platformRole === "platform_admin" ? (
                  <span className="inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-300">
                    Platform Administrator
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/70">
                    Standard Member
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] text-white/40">
                {platformRole === "platform_founder"
                  ? "Permanent J10 NEXUS platform founder credentials."
                  : "Platform roles are managed exclusively by server administrators."}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                Active Workspace
              </span>
              <p className="mt-2 text-sm font-semibold text-white truncate">
                {workspaceName || "No active workspace"}
              </p>
              <p className="mt-2 text-[11px] text-white/40">
                Active tenant environment
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                Workspace Role
              </span>
              <div className="mt-2">
                <span className="inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs font-semibold capitalize text-white">
                  {workspaceRole || "Member"}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-white/40">
                Tenant permissions scoped to active workspace
              </p>
            </div>
          </div>
        </div>

        {/* User Profile Form */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E0F12] p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-blue-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Profile Details</h2>
              <p className="text-xs text-white/50">
                Customizable identity details displayed across workspaces
              </p>
            </div>
          </div>

          {profileNotice && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={16} />
              {profileNotice}
            </div>
          )}

          {profileError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-400">
              <AlertCircle size={16} />
              {profileError}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-white/70">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Name"
                  className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70">
                  Job Title
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. CEO, Product Manager, Agent"
                  className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70">
                  Timezone
                </label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="UTC, America/New_York, etc."
                  className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2 text-sm text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>

        {/* Email Address & Safe Email Change */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E0F12] p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Authentication Email</h2>
              <p className="text-xs text-white/50">
                Changing your email preserves all workspace access and ownership via immutable user UUID
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
              Current Authenticated Address
            </span>
            <p className="mt-1.5 text-sm font-semibold text-white">
              {currentEmail}
            </p>
          </div>

          {emailNotice && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-400">
              <CheckCircle2 size={16} />
              {emailNotice}
            </div>
          )}

          {emailError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-400">
              <AlertCircle size={16} />
              {emailError}
            </div>
          )}

          <form onSubmit={handleRequestEmailChange} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/70">
                New Email Address
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new.email@example.com"
                className="mt-1.5 w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2 text-sm text-white placeholder-white/30 focus:border-emerald-500 focus:outline-none"
              />
              <p className="mt-1.5 text-[11px] text-white/40">
                A verification link will be sent to confirm this update. Your workspace ownership and permissions remain unchanged.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updatingEmail || !newEmail}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {updatingEmail ? "Initiating..." : "Request Email Change"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
