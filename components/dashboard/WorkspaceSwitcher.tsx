"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Plus,
  Shield,
  X,
} from "lucide-react";

import {
  calculateAgencySubscriptionRevenue,
  PLAN_PRICING,
} from "@/lib/workspaces/service";
import type { Workspace, WorkspacePlan } from "@/types/workspace";

const DEMO_WORKSPACE_ITEM: Workspace = {
  id: "demo-workspace-apex-services",
  name: "Apex Commercial & Home Services",
  slug: "apex-services",
  type: "client",
  plan: "growth",
  monthlySubscriptionPrice: 149,
  status: "active",
  brandName: "Apex Commercial & Home Services",
  accentColor: "#00D9FF",
  clientContactName: "Demo Owner",
  clientContactEmail: "demo.owner@apexservices.com",
  createdAt: new Date().toISOString(),
};

export default function WorkspaceSwitcher() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";
  const switcherRef = useRef<HTMLDivElement>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    return isDemo ? [DEMO_WORKSPACE_ITEM] : [];
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    return isDemo ? DEMO_WORKSPACE_ITEM.id : "";
  });
  const [isLoading, setIsLoading] = useState(!isDemo);
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

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle Escape key to close
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setAddModalOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Load real authorized workspaces from server when not in demo mode
  useEffect(() => {
    if (isDemo) {
      setWorkspaces([DEMO_WORKSPACE_ITEM]);
      setActiveWorkspaceId(DEMO_WORKSPACE_ITEM.id);
      setIsLoading(false);
      return;
    }

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
              monthlySubscriptionPrice: PLAN_PRICING[w.plan as WorkspacePlan] || 149,
              status: w.status || "active",
              brandName: w.brand_name || w.name,
              accentColor: w.accent_color || "#00D9FF",
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
  }, [isDemo]);

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
        monthlySubscriptionPrice: 0,
        status: "active",
        brandName: w.brand_name || w.name,
        accentColor: w.accent_color || "#00D9FF",
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
      setNotice(`New client provisioned: ${newWs.name}`);
      setTimeout(() => setNotice(""), 4500);
    } catch (err: any) {
      setNotice(`Provisioning failed: ${err.message || "Server error."}`);
      setTimeout(() => setNotice(""), 5000);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-10 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#111216] px-3">
        <div className="h-6 w-6 animate-pulse rounded-lg bg-white/10" />
        <div className="hidden sm:block">
          <div className="h-2.5 w-24 animate-pulse rounded bg-white/10" />
          <div className="mt-1 h-2 w-14 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={switcherRef}>
      {/* Active Workspace Selector Button */}
      {!activeWorkspace ? (
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Open workspace selector"
          className="flex h-10 items-center gap-2.5 rounded-xl border border-slate-800 bg-[#111216] px-2.5 text-left transition hover:bg-white/[0.06] sm:px-3"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
            <Building2 size={13} />
          </div>

          <div className="hidden min-w-0 sm:block text-left">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-slate-300">
                No authorized workspace
              </span>
              <span className="rounded border border-red-500/30 bg-red-500/10 px-1 py-0.2 text-[9px] font-bold text-red-400">
                NO ACCESS
              </span>
            </div>
            <p className="truncate text-[11px] text-slate-400">
              Tenant unassigned
            </p>
          </div>

          <ChevronDown size={13} className="text-slate-400" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Open workspace selector"
          className="flex h-10 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#111216] px-2.5 text-left transition hover:bg-white/[0.06] sm:px-3"
        >
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: activeWorkspace.accentColor }}
          >
            {activeWorkspace.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="hidden min-w-0 sm:block text-left">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-white max-w-[140px]">
                {activeWorkspace.name}
              </span>
              <span
                className={`rounded px-1.5 py-0.2 text-[9px] font-medium border ${
                  isDemo
                    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                    : activeWorkspace.type === "agency_master"
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                    : "border-slate-700 bg-slate-800 text-slate-300"
                }`}
              >
                {isDemo
                  ? "Demo Workspace"
                  : activeWorkspace.type === "agency_master"
                  ? "AGENCY HQ"
                  : "Active"}
              </span>
            </div>
            <p className="truncate text-[11px] text-slate-400">
              {isDemo ? "Sample Business Data" : activeWorkspace.brandName}
            </p>
          </div>

          <ChevronDown size={13} className="text-slate-400" />
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
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-white/[0.1] bg-[#111216] p-2.5 shadow-2xl shadow-black/80">
          {workspaces.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-black/40 p-4 text-center">
              <Building2 className="mx-auto h-5 w-5 text-slate-400 mb-1.5" />
              <p className="text-xs font-semibold text-white">No authorized workspace</p>
              <p className="mt-1 text-xs text-slate-400 leading-normal">
                Tenant unassigned. Join a workspace via invitation or provision a new workspace.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setAddModalOpen(true);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 transition"
              >
                <Plus size={13} />
                Onboard Client Workspace
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>{isDemo ? "Demo Workspace" : "Switch Workspace"}</span>
                {agencyStats.totalMonthlyRevenue > 0 && (
                  <span className="text-[10px] text-emerald-400 font-medium">
                    Client Subscription MRR: ${agencyStats.totalMonthlyRevenue}/mo
                  </span>
                )}
              </div>

              {/* Workspaces List */}
              <div className="max-h-60 space-y-1 overflow-y-auto pt-0.5">
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
                          : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
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
                          <p className="truncate text-[11px] text-slate-400">
                            {isDemo
                              ? "Sample Workspace"
                              : ws.type === "agency_master"
                              ? "Master Agency Account"
                              : "Client Workspace"}
                          </p>
                        </div>
                      </div>

                      {isSelected && <Check size={14} className="text-cyan-400" />}
                    </button>
                  );
                })}
              </div>

              {!isDemo && (
                <div className="mt-2 border-t border-white/[0.06] pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setAddModalOpen(true);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                  >
                    <Plus size={14} />
                    Onboard Client Workspace
                  </button>
                </div>
              )}
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
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Building2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Onboard Workspace
                </h3>
                <p className="text-xs text-slate-400">
                  Provision an isolated J10 tenant workspace.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateClientWorkspace} className="mt-5 space-y-3.5">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Business / Workspace Name
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Apex Home & Commercial Services"
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Brand Title
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Apex Autonomous Reception Desk"
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Subscription Plan
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
                            ? "border-cyan-500 bg-cyan-500/20 text-white"
                            : "border-white/[0.08] bg-black/30 text-slate-400 hover:border-white/20"
                        }`}
                      >
                        <p className="text-xs font-semibold capitalize">{p}</p>
                        <p className="mt-0.5 text-xs font-bold text-emerald-400">
                          ${PLAN_PRICING[p]}/mo
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Contact Email
                </label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="admin@business.com"
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>

              <div className="mt-5 flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="w-1/2 rounded-lg border border-white/[0.08] py-2 text-xs font-medium text-slate-400 hover:bg-white/[0.05] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 py-2 text-xs font-medium text-white shadow-sm hover:brightness-105"
                >
                  Provision Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
