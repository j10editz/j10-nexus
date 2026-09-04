"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Briefcase,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Layers,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { WorkforceMember, WorkforceStatus, WorkforceSummary } from "@/types/workforce";
import { DEFAULT_DEPARTMENTS, KNOWN_AI_AGENTS } from "@/lib/workforce/service";

export default function HRPage() {
  const [members, setMembers] = useState<WorkforceMember[]>([]);
  const [summary, setSummary] = useState<WorkforceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New Team Member Form
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("Operations");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function loadWorkforceData() {
    try {
      setLoading(true);
      const res = await fetch("/api/workforce");
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error("Failed to load workforce:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkforceData();
  }, []);

  function toggleAgentSelection(agentId: string) {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  }

  async function handleCreateMember(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !role.trim() || !email.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/workforce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          department,
          email,
          phone,
          assignedAgents: selectedAgents,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setActionSuccess(data.message || "Team member added.");
        setName("");
        setRole("");
        setEmail("");
        setPhone("");
        setSelectedAgents([]);
        await loadWorkforceData();
      }
    } catch (err) {
      console.error("Add team member error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMember(id: string, memberName: string) {
    if (!confirm(`Are you sure you want to remove ${memberName} from the workforce directory?`)) return;

    try {
      const res = await fetch(`/api/workforce/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess("Member removed.");
        await loadWorkforceData();
      }
    } catch (err) {
      console.error("Delete member error:", err);
    }
  }

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchesDept = departmentFilter === "all" || m.department === departmentFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q);
      return matchesDept && matchesSearch;
    });
  }, [members, departmentFilter, searchQuery]);

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-400">
              J10 Organizational Hub
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              HR & Hybrid Workforce Command
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Coordinate human specialists and autonomous AI agents into high-leverage operating units.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadWorkforceData()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.08]"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Sync Directory
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
            >
              <UserPlus size={15} />
              Add Team Member
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {actionSuccess && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-xs opacity-60 hover:opacity-100">
              Dismiss
            </button>
          </div>
        )}

        {/* Top Metric Cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Human Staff */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Human Specialists
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Users size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                {summary?.totalHumanStaff ?? 1}
              </span>
              <span className="text-xs text-white/40">members</span>
            </div>
            <div className="mt-2 text-xs text-white/40">
              <span>Across {Object.keys(summary?.departmentCounts || {}).length || 1} departments</span>
            </div>
          </div>

          {/* AI Workforce Fleet */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                AI Employee Fleet
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Bot size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                {summary?.activeAIAgents ?? 4}
              </span>
              <span className="text-xs text-white/40">active agents</span>
            </div>
            <div className="mt-2 text-xs text-emerald-400">
              <span>Running autonomous 24/7 loops</span>
            </div>
          </div>

          {/* Hours Automated */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Hours Automated
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <Clock size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                {(summary?.totalHoursSavedThisMonth ?? 600).toLocaleString()}
              </span>
              <span className="text-xs text-white/40">hrs saved</span>
            </div>
            <div className="mt-2 text-xs text-white/40">
              <span>Equivalent to 3.8 full-time hires</span>
            </div>
          </div>

          {/* Labor Dollars Saved (ROI) */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Labor Value Saved
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <Sparkles size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold">
                ${(summary?.laborSavingsDollars ?? 27000).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-emerald-400">
              <span>Huge ROI vs cloud compute</span>
            </div>
          </div>
        </div>

        {/* Hybrid Leverage Banner */}
        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-violet-950/20 via-[#111216] to-blue-950/20 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
                  Hybrid Organization Model
                </span>
              </div>
              <h3 className="text-base font-semibold text-white">
                Workforce Leverage: {summary?.hybridLeverageRatio ?? 4.0}x Agent Multiplier
              </h3>
              <p className="text-xs text-white/60 max-w-2xl">
                Every human team lead supervises dedicated autonomous AI employees. Low-confidence actions and high-stakes approvals route directly to assigned supervisors via WhatsApp and dashboard alerts.
              </p>
            </div>

            <Link
              href="/dashboard/ai-employees"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.10]"
            >
              <span>Manage AI Employee Fleet</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* Workforce Directory */}
        <div className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Team & Supervisor Directory
              </h2>
              <p className="mt-1 text-xs text-white/40">
                Human managers paired with autonomous AI agents across core business functions.
              </p>
            </div>

            {/* Filter & Search */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search staff or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#111216] py-2 pl-9 pr-4 text-xs text-white placeholder-white/30 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center rounded-xl border border-white/10 bg-[#111216] p-1 text-xs">
                <button
                  onClick={() => setDepartmentFilter("all")}
                  className={`rounded-lg px-3 py-1.5 capitalize transition ${
                    departmentFilter === "all"
                      ? "bg-white/10 font-semibold text-white"
                      : "text-white/40 hover:text-white/80"
                  }`}
                >
                  All Depts
                </button>
                {DEFAULT_DEPARTMENTS.slice(0, 4).map((dept) => (
                  <button
                    key={dept}
                    onClick={() => setDepartmentFilter(dept)}
                    className={`rounded-lg px-3 py-1.5 transition ${
                      departmentFilter === dept
                        ? "bg-white/10 font-semibold text-white"
                        : "text-white/40 hover:text-white/80"
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Directory Grid */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#111216] p-5 transition hover:border-white/15"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white text-sm">
                        {member.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-white/50">
                        {member.role}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300">
                      {member.department}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3 text-xs text-white/50">
                    <div className="flex items-center gap-2">
                      <Mail size={13} className="text-white/30" />
                      <span className="truncate">{member.email}</span>
                    </div>
                    {member.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-white/30" />
                        <span>{member.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Supervised AI Agents */}
                  <div className="mt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                      Supervised AI Agents ({member.assignedAgents.length})
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {member.assignedAgents.length > 0 ? (
                        member.assignedAgents.map((agentId) => {
                          const found = KNOWN_AI_AGENTS.find((a) => a.id === agentId);
                          return (
                            <span
                              key={agentId}
                              className="inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 font-medium"
                            >
                              <Bot size={11} />
                              <span>{found ? found.name.split(" ")[1] || found.name : agentId}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-white/30 italic">No AI agents assigned</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>{member.status}</span>
                  </span>

                  {members.length > 1 && (
                    <button
                      onClick={() => handleDeleteMember(member.id, member.name)}
                      className="text-white/30 hover:text-rose-400 transition"
                      title="Remove member"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Team Member Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-xl rounded-3xl border border-white/15 bg-[#121318] p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Add Team Member</h3>
                  <p className="text-xs text-white/50">Register a human specialist and assign AI direct reports.</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateMember} className="mt-6 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-white/60">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sarah Jenkins"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/60">Role Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Head of Revenue Operations"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-white/60">Department</label>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    >
                      {DEFAULT_DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/60">Work Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="sarah@j10nexus.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/60">Phone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="+1 (555) 234-5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-[#0B0C0F] px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* AI Agents to Supervise */}
                <div>
                  <label className="block text-xs font-semibold text-white/60">
                    Assign Autonomous AI Employees to Supervise
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {KNOWN_AI_AGENTS.map((agent) => {
                      const isSelected = selectedAgents.includes(agent.id);
                      return (
                        <div
                          key={agent.id}
                          onClick={() => toggleAgentSelection(agent.id)}
                          className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer transition ${
                            isSelected
                              ? "border-violet-500/50 bg-violet-500/10 text-white"
                              : "border-white/10 bg-[#0B0C0F] text-white/60 hover:border-white/20"
                          }`}
                        >
                          <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            isSelected ? "border-violet-400 bg-violet-500 text-white" : "border-white/20"
                          }`}>
                            {isSelected && <Check size={11} />}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-white">{agent.name}</p>
                            <p className="text-[10px] text-white/40">{agent.role}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-white/70 hover:bg-white/[0.08]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:brightness-110"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Adding Member...
                      </>
                    ) : (
                      <>
                        <UserPlus size={14} />
                        Add Member
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}