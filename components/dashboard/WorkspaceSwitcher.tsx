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
  accentColor: "#6347E8",
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
              accentColor: w.accent_color || "#6347E8",
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
        accentColor: w.accent_color || "#6347E8",
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
      <div className="flex h-8 items-center gap-2 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5">
        <div className="h-5 w-5 animate-pulse rounded bg-[#F3F1F8]" />
        <div className="hidden sm:block">
          <div className="h-2.5 w-20 animate-pulse rounded bg-[#F3F1F8]" />
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
          className="flex h-8 items-center gap-2 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 text-left transition hover:bg-[#F3F1F8] shadow-sm"
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#F3F1F8] text-[#6F687A]">
            <Building2 size={12} />
          </div>

          <div className="hidden min-w-0 sm:block text-left">
            <span className="truncate text-xs font-medium text-[#6F687A]">
              No authorized workspace
            </span>
            <span className="text-[9px] uppercase tracking-wider text-[#E11D48] font-semibold block">
              NO ACCESS
            </span>
          </div>

          <ChevronDown size={12} className="text-[#918A9D]" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Open workspace selector"
          className="flex h-8 items-center gap-2 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-2.5 text-left transition hover:bg-[#F3F1F8] shadow-sm"
        >
          <div
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white shadow-sm"
            style={{ backgroundColor: activeWorkspace.accentColor || "#6347E8" }}
          >
            {activeWorkspace.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="hidden min-w-0 sm:block text-left">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-[#17151F] max-w-[130px]">
                {activeWorkspace.name}
              </span>
              <span className="rounded bg-[#F0ECFF] px-1 py-0.2 text-[9px] font-medium text-[#6347E8]">
                {isDemo
                  ? "Demo"
                  : activeWorkspace.type === "agency_master"
                  ? "HQ"
                  : "Active"}
              </span>
            </div>
          </div>

          <ChevronDown size={12} className="text-[#918A9D]" />
        </button>
      )}

      {/* Notice Toast */}
      {notice && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-[#A3E6D0] bg-[#E8F8F2] px-4 py-2.5 text-xs font-medium text-[#168A65] shadow-lg">
          <CheckCircle2 size={15} />
          {notice}
        </div>
      )}

      {/* Dropdown Menu */}
      {menuOpen && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-72 rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-2 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
          {workspaces.length === 0 ? (
            <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-center">
              <Building2 className="mx-auto h-5 w-5 text-[#918A9D] mb-1.5" />
              <p className="text-xs font-semibold text-[#17151F]">No authorized workspace</p>
              <p className="mt-1 text-xs text-[#6F687A] leading-normal">
                Tenant unassigned. Join a workspace via invitation or provision a new workspace.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setAddModalOpen(true);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#6347E8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5136D6] transition"
              >
                <Plus size={13} />
                Onboard Client Workspace
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#918A9D]">
                <span>{isDemo ? "Demo Workspace" : "Switch Workspace"}</span>
                {agencyStats.totalMonthlyRevenue > 0 && (
                  <span className="text-[10px] text-[#168A65] font-medium">
                    MRR: ${agencyStats.totalMonthlyRevenue}/mo
                  </span>
                )}
              </div>

              {/* Workspaces List */}
              <div className="max-h-60 space-y-0.5 overflow-y-auto pt-0.5">
                {workspaces.map((ws) => {
                  const isSelected = ws.id === activeWorkspaceId;

                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => handleSelectWorkspace(ws.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition ${
                        isSelected
                          ? "bg-[#F0ECFF] text-[#6347E8] font-medium"
                          : "text-[#17151F] hover:bg-[#F3F1F8]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                          style={{ backgroundColor: ws.accentColor || "#6347E8" }}
                        >
                          {ws.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{ws.name}</p>
                          <p className="truncate text-[10px] text-[#6F687A]">
                            {isDemo
                              ? "Sample Workspace"
                              : ws.type === "agency_master"
                              ? "Master Agency Account"
                              : "Client Workspace"}
                          </p>
                        </div>
                      </div>

                      {isSelected && <Check size={14} className="text-[#6347E8]" />}
                    </button>
                  );
                })}
              </div>

              {!isDemo && (
                <div className="mt-2 border-t border-[#E2DEEA] pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setAddModalOpen(true);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E2DEEA] bg-[#F3F1F8] py-1.5 text-xs font-medium text-[#6347E8] transition hover:bg-[#F0ECFF]"
                  >
                    <Plus size={13} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="absolute right-4 top-4 text-[#6F687A] hover:text-[#17151F]"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F0ECFF] text-[#6347E8]">
                <Building2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#17151F]">
                  Onboard Workspace
                </h3>
                <p className="text-xs text-[#6F687A]">
                  Provision an isolated J10 tenant workspace.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateClientWorkspace} className="mt-5 space-y-3.5">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-[#6F687A]">
                  Business / Workspace Name
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Apex Home & Commercial Services"
                  className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3 py-2 text-xs text-[#17151F] placeholder:text-[#918A9D] focus:border-[#6347E8] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-[#6F687A]">
                  Brand Title
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Apex Autonomous Reception Desk"
                  className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3 py-2 text-xs text-[#17151F] placeholder:text-[#918A9D] focus:border-[#6347E8] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-[#6F687A]">
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
                        className={`rounded-lg border p-2.5 text-center transition ${
                          isSelected
                            ? "border-[#6347E8] bg-[#F0ECFF] text-[#6347E8]"
                            : "border-[#E2DEEA] bg-[#FFFFFF] text-[#6F687A] hover:bg-[#F3F1F8]"
                        }`}
                      >
                        <p className="text-xs font-semibold capitalize">{p}</p>
                        <p className="mt-0.5 text-xs font-bold text-[#168A65]">
                          ${PLAN_PRICING[p]}/mo
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-[#6F687A]">
                  Contact Email
                </label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="admin@business.com"
                  className="mt-1 w-full rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3 py-2 text-xs text-[#17151F] placeholder:text-[#918A9D] focus:border-[#6347E8] focus:outline-none"
                />
              </div>

              <div className="mt-5 flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="w-1/2 rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] py-2 text-xs font-medium text-[#6F687A] hover:bg-[#F3F1F8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 rounded-lg bg-[#6347E8] py-2 text-xs font-medium text-white shadow-sm hover:bg-[#5136D6]"
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
