"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Layers,
  Plus,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import {
  calculateAgencySubscriptionRevenue,
  createClientWorkspace,
  PLAN_PRICING,
  SEED_WORKSPACES,
} from "@/lib/workspaces/service";
import type { Workspace, WorkspacePlan } from "@/types/workspace";

export default function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [isLivePersisted, setIsLivePersisted] = useState(false);

  // Form state for onboarding new client workspace
  const [clientName, setClientName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [plan, setPlan] = useState<WorkspacePlan>("growth");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notice, setNotice] = useState("");

  // Load real authorized workspaces from server
  useEffect(() => {
    let isMounted = true;

    async function loadServerWorkspaces() {
      try {
        const res = await fetch("/api/workspaces", { cache: "no-store" });
        if (!res.ok) {
          if (isMounted) {
            setWorkspaces([]);
            setActiveWorkspaceId("");
            setIsLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (isMounted) {
          if (data.success && Array.isArray(data.workspaces) && data.workspaces.length > 0) {
            const mapped: Workspace[] = data.workspaces.map((w: any) => ({
              id: w.id,
              name: w.name,
              slug: w.slug,
              type: w.workspace_type || "client",
              plan: w.plan || "growth",
              monthlySubscriptionPrice: PLAN_PRICING[w.plan as WorkspacePlan] || 499,
              status: w.status || "active",
              brandName: w.brand_name || w.name,
              accentColor: w.accent_color || "#3B82F6",
              clientContactName: "Account Administrator",
              clientContactEmail: "",
              createdAt: w.created_at || new Date().toISOString(),
            }));

            setWorkspaces(mapped);
            setIsLivePersisted(true);
            if (data.activeWorkspace?.id) {
              setActiveWorkspaceId(data.activeWorkspace.id);
            } else {
              setActiveWorkspaceId(mapped[0].id);
            }
          } else {
            setWorkspaces([]);
            setActiveWorkspaceId("");
          }
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setWorkspaces([]);
          setActiveWorkspaceId("");
          setIsLoading(false);
        }
      }
    }

    void loadServerWorkspaces();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeWorkspace = useMemo(() => {
    if (workspaces.length === 0) return null;
    return (
      workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0]
    );
  }, [workspaces, activeWorkspaceId]);

  const agencyStats = useMemo(() => {
    return calculateAgencySubscriptionRevenue(workspaces);
  }, [workspaces]);

  async function handleSelectWorkspace(id: string) {
    setActiveWorkspaceId(id);
    setMenuOpen(false);

    const targetWs = workspaces.find((w) => w.id === id);
    setNotice(`Switched to workspace: ${targetWs?.name}`);
    setTimeout(() => setNotice(""), 3000);

    // If connected to persistent backend, notify server
    if (isLivePersisted) {
      try {
        await fetch("/api/workspaces/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: id }),
        });
      } catch (err) {
        console.warn("Failed to persist workspace selection to server:", err);
      }
    }
  }

  async function handleCreateClientWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim() || !contactEmail.trim()) return;

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientName.trim(),
          brandName: brandName.trim() || clientName.trim(),
          plan,
          workspaceType: "client",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.workspace) {
        throw new Error(data.error || "Failed to provision workspace on server.");
      }

      const w = data.workspace;
      const newWs: Workspace = {
        id: w.id,
        name: w.name,
        slug: w.slug,
        type: "client",
        plan: w.plan || plan,
        monthlySubscriptionPrice: 0, // Unverified until Stripe payment exists
        status: "active",
        brandName: w.brand_name || w.name,
        accentColor: w.accent_color || "#3B82F6",
        clientContactName: contactName.trim() || "Account Lead",
        clientContactEmail: contactEmail.trim(),
        createdAt: w.created_at || new Date().toISOString(),
      };
      setWorkspaces((prev) => [...prev, newWs]);
      setActiveWorkspaceId(newWs.id);
      setAddModalOpen(false);
      setMenuOpen(false);
      setClientName("");
      setBrandName("");
      setContactName("");
      setContactEmail("");
      setNotice(`New client provisioned in database: ${newWs.name}`);
      setTimeout(() => setNotice(""), 4500);
    } catch (err: any) {
      setNotice(`Provisioning failed: ${err.message || "Server error."}`);
      setTimeout(() => setNotice(""), 5000);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#111216] px-3">
        <div className="h-7 w-7 animate-pulse rounded-lg bg-white/10" />
        <div className="hidden sm:block">
          <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
          <div className="mt-1.5 h-2 w-16 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Active Workspace Selector Button */}
      {!activeWorkspace ? (
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-11 items-center gap-2.5 rounded-xl border border-red-500/25 bg-[#111216] px-3 text-left transition hover:bg-white/[0.06]"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400">
            <Shield size={14} />
          </div>

          <div className="hidden min-w-0 sm:block text-left">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-white/80">
                No authorized workspace
              </span>
              <span className="rounded px-1.5 py-0.2 text-[9px] font-medium border border-red-500/30 bg-red-500/10 text-red-300">
                NO ACCESS
              </span>
            </div>
            <p className="truncate text-[10px] text-white/30">
              Tenant unassigned
            </p>
          </div>

          <ChevronDown size={14} className="text-white/40" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-11 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#111216] px-3 text-left transition hover:bg-white/[0.06]"
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: activeWorkspace.accentColor }}
          >
            {activeWorkspace.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="hidden min-w-0 sm:block text-left">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-white">
                {activeWorkspace.name}
              </span>
              <span
                className={`rounded px-1.5 py-0.2 text-[9px] font-medium border ${
                  activeWorkspace.type === "agency_master"
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                }`}
              >
                {activeWorkspace.type === "agency_master"
                  ? "AGENCY HQ"
                  : `$${activeWorkspace.monthlySubscriptionPrice}/mo`}
              </span>
            </div>
            <p className="truncate text-[10px] text-white/40">
              {activeWorkspace.brandName}
            </p>
          </div>

          <ChevronDown size={14} className="text-white/40" />
        </button>
      )}

      {/* Notice Toast */}
      {notice && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-[#12141A] px-4 py-2.5 text-xs font-medium text-emerald-400 shadow-2xl">
          <CheckCircle2 size={15} />
          {notice}
        </div>
      )}

      {/* Dropdown Menu */}
      {menuOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 rounded-2xl border border-white/[0.1] bg-[#111216] p-2.5 shadow-2xl shadow-black/80">
          {workspaces.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-black/40 p-4 text-center">
              <Shield className="mx-auto h-6 w-6 text-red-400/60 mb-2" />
              <p className="text-xs font-semibold text-white">No Authorized Workspace</p>
              <p className="mt-1 text-[11px] text-white/40">
                Your account is not assigned to any active workspace. Please accept an invitation or contact the platform administrator.
              </p>
            </div>
          ) : (
            <>
              {/* Agency Revenue Header */}
              <div className="rounded-xl border border-white/[0.06] bg-black/40 p-3">
                <div className="flex items-center justify-between text-white/40">
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    Client Subscription MRR
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-400">
                    {agencyStats.activeClientCount} Client Tenants
                  </span>
                </div>
                <p className="mt-1 text-lg font-bold text-white">
                  ${agencyStats.totalMonthlyRevenue.toLocaleString()} / mo
                </p>
                <p className="text-[10px] text-white/40">
                  {agencyStats.totalMonthlyRevenue > 0
                    ? `Verified subscription MRR`
                    : "Billing not configured (Stripe verification pending)"}
                </p>
              </div>

              {/* Workspaces List */}
              <div className="mt-2 max-h-60 space-y-1 overflow-y-auto pt-1">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Switch Workspace
            </p>

            {workspaces.map((ws) => {
              const isSelected = ws.id === activeWorkspaceId;

              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSelectWorkspace(ws.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition ${
                    isSelected
                      ? "bg-white/[0.08] text-white font-medium"
                      : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                      style={{ backgroundColor: ws.accentColor }}
                    >
                      {ws.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs">{ws.name}</p>
                      <p className="truncate text-[10px] text-white/40">
                        {ws.type === "agency_master"
                          ? "Master Agency Account"
                          : `Client: $${ws.monthlySubscriptionPrice}/mo (${ws.plan})`}
                      </p>
                    </div>
                  </div>

                  {isSelected && <Check size={14} className="text-blue-400" />}
                </button>
              );
            })}
          </div>

          {/* Onboard Client Workspace Trigger */}
          <div className="mt-2 border-t border-white/[0.06] pt-2">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setAddModalOpen(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 py-2 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20"
            >
              <Plus size={14} />
              Onboard Client Workspace ($/mo)
            </button>
          </div>
            </>
          )}
        </div>
      )}

      {/* Onboard Client Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111216] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="absolute right-4 top-4 text-white/40 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Building2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Onboard Client Workspace
                </h3>
                <p className="text-xs text-white/50">
                  Provision an isolated white-label J10 tenant and bill monthly.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateClientWorkspace} className="mt-5 space-y-3.5">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                  Client Business Name
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Horizon Wealth Advisory"
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-blue-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                  White-Label Brand Title
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Horizon Autonomous Client Desk"
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-blue-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                  Monthly Subscription Plan
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(["starter", "growth", "enterprise"] as WorkspacePlan[]).map((p) => {
                    const isSelected = plan === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlan(p)}
                        className={`rounded-xl border p-2.5 text-center transition ${
                          isSelected
                            ? "border-blue-500 bg-blue-500/20 text-white"
                            : "border-white/[0.08] bg-black/30 text-white/60 hover:border-white/20"
                        }`}
                      >
                        <p className="text-xs font-semibold capitalize">{p}</p>
                        <p className="mt-0.5 text-[11px] font-bold text-emerald-400">
                          ${PLAN_PRICING[p]}/mo
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="David Vance"
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-blue-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="david@horizon.com"
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-blue-500/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="rounded-lg px-3 py-2 text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-500"
                >
                  <Plus size={14} />
                  Provision Client Workspace (${PLAN_PRICING[plan]}/mo)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
