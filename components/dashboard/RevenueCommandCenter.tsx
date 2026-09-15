"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Send,
  User,
  Users,
  X,
} from "lucide-react";

import { DEMO_REVENUE_DASHBOARD_DATA } from "@/lib/dashboard/demo-fixture";
import type {
  AppointmentItem,
  ConversationActivityItem,
  DateRangeFilter,
  FunnelStage,
  MetricTrend,
  PriorityLead,
  RevenueCommandDashboardData,
  WonDealItem,
} from "@/types/revenue-dashboard";

export type DashboardViewTab =
  | "overview"
  | "revenue"
  | "funnel"
  | "leads"
  | "conversations"
  | "operations";

interface RevenueCommandCenterProps {
  userName: string;
  initialWorkspaceName?: string;
}

type DrawerState =
  | { type: "lead"; lead: PriorityLead }
  | { type: "conversation"; conversation: ConversationActivityItem }
  | { type: "deal"; deal: WonDealItem }
  | { type: "ai-assistant" }
  | null;

export default function RevenueCommandCenter({
  userName,
  initialWorkspaceName,
}: RevenueCommandCenterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mode state: Demo vs Live
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [data, setData] = useState<RevenueCommandDashboardData>(DEMO_REVENUE_DASHBOARD_DATA);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active View Tab (Synchronized with URL `?view=...`)
  const currentViewParam = searchParams.get("view") as DashboardViewTab | null;
  const [activeTab, setActiveTab] = useState<DashboardViewTab>(
    currentViewParam &&
      ["overview", "revenue", "funnel", "leads", "conversations", "operations"].includes(
        currentViewParam
      )
      ? currentViewParam
      : "overview"
  );

  // Sync state when URL searchParams change
  useEffect(() => {
    if (
      currentViewParam &&
      ["overview", "revenue", "funnel", "leads", "conversations", "operations"].includes(
        currentViewParam
      ) &&
      currentViewParam !== activeTab
    ) {
      setActiveTab(currentViewParam);
    }
  }, [currentViewParam, activeTab]);

  const handleTabChange = useCallback(
    (nextTab: DashboardViewTab) => {
      setActiveTab(nextTab);
      const url = new URL(window.location.href);
      url.searchParams.set("view", nextTab);
      window.history.pushState(null, "", url.toString());
    },
    []
  );

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view") as DashboardViewTab | null;
      if (
        view &&
        ["overview", "revenue", "funnel", "leads", "conversations", "operations"].includes(view)
      ) {
        setActiveTab(view);
      } else {
        setActiveTab("overview");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Filter & interaction state
  const [leadFilter, setLeadFilter] = useState<"all" | "urgent" | "qualified" | "new" | "human">("all");
  const [conversationFilter, setConversationFilter] = useState<"all" | "unread" | "ai" | "human">("all");
  const [revenueRangeFilter, setRevenueRangeFilter] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedFunnelStageId, setSelectedFunnelStageId] = useState<string>("all");
  const [dismissedActionIds, setDismissedActionIds] = useState<Set<string>>(new Set());
  const [aiStatusOverride, setAiStatusOverride] = useState<"active" | "paused" | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Right-Side Context Drawer
  const [drawerState, setDrawerState] = useState<DrawerState>(null);
  const [aiPromptInput, setAiPromptInput] = useState<string>("");
  const [aiChatHistory, setAiChatHistory] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: "Hello! I am your J10 Revenue Assistant. I can analyze lead velocity, check receptionist SLA health, or summarize attributed revenue. What would you like to explore?",
    },
  ]);

  // Keyboard accessibility for tablist
  const tabRefs = useRef<{ [key in DashboardViewTab]?: HTMLButtonElement | null }>({});
  const tabListOrder: DashboardViewTab[] = [
    "overview",
    "revenue",
    "funnel",
    "leads",
    "conversations",
    "operations",
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextIndex = (index + 1) % tabListOrder.length;
      const nextTab = tabListOrder[nextIndex];
      handleTabChange(nextTab);
      tabRefs.current[nextTab]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIndex = (index - 1 + tabListOrder.length) % tabListOrder.length;
      const prevTab = tabListOrder[prevIndex];
      handleTabChange(prevTab);
      tabRefs.current[prevTab]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      const firstTab = tabListOrder[0];
      handleTabChange(firstTab);
      tabRefs.current[firstTab]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const lastTab = tabListOrder[tabListOrder.length - 1];
      handleTabChange(lastTab);
      tabRefs.current[lastTab]?.focus();
    }
  };

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawerState) {
        setDrawerState(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerState]);

  // Mode initialization from session
  useEffect(() => {
    try {
      const savedMode = sessionStorage.getItem("j10_dashboard_mode");
      if (savedMode === "live") {
        setIsDemoMode(false);
      }
    } catch {
      // Ignore
    }
  }, []);

  const fetchLiveData = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/revenue-command", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to load revenue dashboard (${response.status})`);
      }
      const payload = await response.json();
      if (!payload.success || !payload.data) {
        throw new Error(payload.error || "Malformed dashboard payload");
      }
      setData(payload.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error connecting to workspace live data";
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isDemoMode) {
      fetchLiveData(true);
    } else {
      setData(DEMO_REVENUE_DASHBOARD_DATA);
      setError(null);
      setIsLoading(false);
    }
  }, [isDemoMode]);

  const handleToggleMode = (nextModeDemo: boolean) => {
    setIsDemoMode(nextModeDemo);
    try {
      sessionStorage.setItem("j10_dashboard_mode", nextModeDemo ? "demo" : "live");
    } catch {
      // Ignore
    }
  };

  const handleDismissAction = (actionId: string) => {
    setDismissedActionIds((prev) => new Set(prev).add(actionId));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyBookingLink = (leadName?: string) => {
    navigator.clipboard?.writeText("https://apexservices.j10nexus.com/book/discovery");
    showToast(leadName ? `Booking link copied for ${leadName}!` : "Calendar booking link copied!");
  };

  // Filtered Priority Leads
  const filteredPriorityLeads = useMemo(() => {
    const leads = data.priorityLeads || [];
    if (leadFilter === "urgent") {
      return leads.filter((l) => l.isUrgent || l.qualificationScore >= 90);
    }
    if (leadFilter === "qualified") {
      return leads.filter((l) => l.dealStage === "qualified" || l.qualificationScore >= 80);
    }
    if (leadFilter === "new") {
      return leads.filter((l) => l.dealStage === "lead" || l.dealStage === "contacted");
    }
    if (leadFilter === "human") {
      return leads.filter((l) => l.assignedOwner === "Human Operator" || l.slaStatus === "warning");
    }
    return leads;
  }, [data.priorityLeads, leadFilter]);

  // Funnel Filtered Leads (in Funnel tab)
  const funnelFilteredLeads = useMemo(() => {
    const leads = data.priorityLeads || [];
    if (selectedFunnelStageId === "all") return leads;
    return leads.filter((l) => l.dealStage === selectedFunnelStageId);
  }, [data.priorityLeads, selectedFunnelStageId]);

  // Filtered Conversations
  const filteredConversations = useMemo(() => {
    const convs = data.recentActivity || [];
    if (conversationFilter === "unread") {
      return convs.filter((c) => c.isUnread);
    }
    if (conversationFilter === "ai") {
      return convs.filter((c) => c.isAiHandled);
    }
    if (conversationFilter === "human") {
      return convs.filter((c) => !c.isAiHandled || c.handoffStatus === "requested" || c.handoffStatus === "transferred");
    }
    return convs;
  }, [data.recentActivity, conversationFilter]);

  // Active Recommended Actions
  const activeRecommendations = useMemo(() => {
    return (data.recommendedActions || []).filter((a) => !dismissedActionIds.has(a.id));
  }, [data.recommendedActions, dismissedActionIds]);

  // Combined Appointments list
  const allAppointments = useMemo(() => {
    return [...(data.appointments?.today || []), ...(data.appointments?.upcoming || [])];
  }, [data.appointments]);

  // AI Receptionist runtime status
  const currentAiStatus = aiStatusOverride || data.aiReceptionist.status;
  const handleToggleAiStatus = () => {
    setAiStatusOverride((prev) => {
      const current = prev || data.aiReceptionist.status;
      return current === "active" ? "paused" : "active";
    });
  };

  const contextualGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const isEmptyLiveWorkspace = !isDemoMode && data.isEmptyWorkspace;

  // Handle Ask J10 AI input submit
  const handleSendAiPrompt = (presetText?: string) => {
    const textToSend = presetText || aiPromptInput;
    if (!textToSend.trim()) return;

    setAiChatHistory((prev) => [...prev, { role: "user", text: textToSend }]);
    setAiPromptInput("");

    setTimeout(() => {
      let reply = "I analyzed your current workspace revenue metrics: ";
      if (textToSend.toLowerCase().includes("receptionist") || textToSend.toLowerCase().includes("sla")) {
        reply = `AI Receptionist is currently active and answering in ~${data.aiReceptionist.averageResponseTimeSeconds}s across ${data.aiReceptionist.channels.filter((c) => c.isConnected).length} channels with a ${data.aiReceptionist.aiResolutionRate}% autonomous resolution rate.`;
      } else if (textToSend.toLowerCase().includes("lead") || textToSend.toLowerCase().includes("urgent")) {
        reply = `You have 4 high-intent leads requiring immediate attention. Marcus Vance ($3,400) is awaiting proposal review with 8m left on SLA.`;
      } else if (textToSend.toLowerCase().includes("revenue") || textToSend.toLowerCase().includes("won")) {
        reply = `Attributed revenue sits at $2,480 collected across 3 closed deals, with $8,940 in high-probability open pipeline. Telegram generated 59.7% of total revenue.`;
      } else {
        reply = `All lead capture channels are operating normally. 47 inbound leads have been processed this month with zero webhook errors.`;
      }
      setAiChatHistory((prev) => [...prev, { role: "assistant", text: reply }]);
    }, 400);
  };

  return (
    <div className="j10-canvas min-h-screen bg-[#080A0F] text-slate-200 font-sans antialiased selection:bg-cyan-500/20 w-full min-w-0">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0E121B] px-4 py-2.5 text-xs font-medium text-slate-100 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-150">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="mx-auto max-w-[1680px] w-full min-w-0 px-4 py-4 sm:px-6 lg:px-8 space-y-3.5">
        {/* =========================================================================
            ZONE 1: CLEAN EXECUTIVE HEADER
            ========================================================================= */}
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between py-1 border-b border-white/[0.06] pb-3.5">
          {/* Left: Greeting, Workspace & Date Range */}
          <div className="flex flex-wrap items-baseline gap-2.5 sm:gap-3">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
              {contextualGreeting}{userName ? `, ${userName}` : ""}
            </h1>
            <span className="text-xs text-slate-400 font-normal">
              {data.workspaceName || initialWorkspaceName || "Apex Commercial & Home Services"}
            </span>
            <span className="text-xs text-slate-400 font-normal">
              • Last 30 days
            </span>
          </div>

          {/* Right: Controls & Primary Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* AI Receptionist Status Dot */}
            <button
              type="button"
              onClick={handleToggleAiStatus}
              title="Toggle AI Receptionist Active / Paused"
              className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 transition"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  currentAiStatus === "active" ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <span>
                {currentAiStatus === "active"
                  ? `AI Receptionist (~${data.aiReceptionist.averageResponseTimeSeconds}s)`
                  : "AI Paused"}
              </span>
            </button>

            {/* Demo / Live Data Switch */}
            <div className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
              <button
                type="button"
                id="btn-toggle-demo-mode"
                onClick={() => handleToggleMode(true)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  isDemoMode
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                aria-pressed={isDemoMode}
              >
                Demo
              </button>
              <button
                type="button"
                id="btn-toggle-live-mode"
                onClick={() => handleToggleMode(false)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  !isDemoMode
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                aria-pressed={!isDemoMode}
              >
                Live
              </button>
            </div>

            {/* Refresh Button (Live mode) */}
            {!isDemoMode && (
              <button
                type="button"
                onClick={() => fetchLiveData(false)}
                disabled={isRefreshing}
                title="Refresh Live Metrics"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition disabled:opacity-50"
                aria-label="Refresh live data"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
              </button>
            )}

            {/* Primary CTA: Review New Leads */}
            <button
              type="button"
              id="btn-primary-review-leads"
              onClick={() => {
                setLeadFilter("new");
                handleTabChange("leads");
              }}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-3.5 py-1 text-xs font-medium text-white shadow-sm hover:brightness-105 active:scale-[0.99] transition"
            >
              <span>Review New Leads</span>
              <span className="rounded bg-black/25 px-1.5 py-0.2 text-xs font-semibold tabular-nums">
                {String(data.snapshot.newLeads.value)}
              </span>
            </button>
          </div>
        </header>

        {/* Informational Demo Workspace Notice (Restrained) */}
        {isDemoMode && (
          <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/40 border border-slate-800/80 px-3 py-1.5 rounded-lg">
            <span>Demo workspace — sample business data</span>
            <button
              type="button"
              onClick={() => handleToggleMode(false)}
              className="text-xs font-medium text-cyan-400 hover:underline"
            >
              Switch to Live Workspace
            </button>
          </div>
        )}

        {/* Priority SLA Alert Strip (when active) */}
        {activeRecommendations.length > 0 && !isEmptyLiveWorkspace && (
          <div className="flex items-center justify-between text-xs text-amber-300 bg-amber-950/20 border border-amber-900/40 px-3 py-1.5 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>{activeRecommendations[0].title}: {activeRecommendations[0].reason}</span>
            </div>
            <Link
              href={activeRecommendations[0].actionHref}
              className="text-xs font-medium text-amber-400 hover:underline"
            >
              {activeRecommendations[0].actionLabel} &rarr;
            </Link>
          </div>
        )}

        {/* =========================================================================
            ZONE 2: COMPACT KPI STRIP (CLEAN & METRIC-FOCUSED)
            ========================================================================= */}
        <section aria-label="Key Revenue Metrics">
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-2.5 pb-1 lg:grid lg:grid-cols-6 lg:gap-3 scrollbar-thin scrollbar-thumb-slate-800">
            {/* 1. New Leads */}
            <button
              type="button"
              onClick={() => {
                setLeadFilter("new");
                handleTabChange("leads");
              }}
              className="flex-none w-[160px] sm:w-[180px] lg:w-auto snap-start text-left rounded-lg border border-slate-800/80 bg-[#0E121B] p-3 transition hover:border-slate-700"
            >
              <span className="text-xs font-medium text-slate-400 block">New Leads</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-white tracking-tight tabular-nums">
                  {String(data.snapshot.newLeads.value)}
                </span>
                <span className="text-xs font-medium text-emerald-400 tabular-nums">
                  +18.4%
                </span>
              </div>
              <span className="text-xs text-slate-400 block mt-0.5">
                inbound this month
              </span>
            </button>

            {/* 2. Qualified Leads */}
            <button
              type="button"
              onClick={() => handleTabChange("funnel")}
              className="flex-none w-[160px] sm:w-[180px] lg:w-auto snap-start text-left rounded-lg border border-slate-800/80 bg-[#0E121B] p-3 transition hover:border-slate-700"
            >
              <span className="text-xs font-medium text-slate-400 block">Qualified Leads</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-white tracking-tight tabular-nums">
                  {String(data.snapshot.qualifiedLeads.value)}
                </span>
                <span className="text-xs font-medium text-slate-300 tabular-nums">
                  55.3%
                </span>
              </div>
              <span className="text-xs text-slate-400 block mt-0.5">
                qualification rate
              </span>
            </button>

            {/* 3. Appointments */}
            <button
              type="button"
              onClick={() => handleTabChange("operations")}
              className="flex-none w-[160px] sm:w-[180px] lg:w-auto snap-start text-left rounded-lg border border-slate-800/80 bg-[#0E121B] p-3 transition hover:border-slate-700"
            >
              <span className="text-xs font-medium text-slate-400 block">Appointments</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-white tracking-tight tabular-nums">
                  {String(data.snapshot.appointmentsBooked.value)}
                </span>
                <span className="text-xs font-medium text-slate-300">
                  3 this week
                </span>
              </div>
              <span className="text-xs text-slate-400 block mt-0.5">
                booked discovery calls
              </span>
            </button>

            {/* 4. Pipeline Value */}
            <button
              type="button"
              onClick={() => handleTabChange("revenue")}
              className="flex-none w-[160px] sm:w-[180px] lg:w-auto snap-start text-left rounded-lg border border-slate-800/80 bg-[#0E121B] p-3 transition hover:border-slate-700"
            >
              <span className="text-xs font-medium text-slate-400 block">Pipeline Value</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-white tracking-tight tabular-nums">
                  {String(data.snapshot.pipelineValue.value)}
                </span>
                <span className="text-xs font-medium text-slate-300">
                  8 deals
                </span>
              </div>
              <span className="text-xs text-slate-400 block mt-0.5">
                active open pipeline
              </span>
            </button>

            {/* 5. Revenue Won */}
            <button
              type="button"
              onClick={() => handleTabChange("revenue")}
              className="flex-none w-[160px] sm:w-[180px] lg:w-auto snap-start text-left rounded-lg border border-slate-800/80 bg-[#0E121B] p-3 transition hover:border-slate-700"
            >
              <span className="text-xs font-medium text-slate-400 block">Revenue Won</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-emerald-400 tracking-tight tabular-nums">
                  {String(data.snapshot.revenueWon.value)}
                </span>
                <span className="text-xs font-medium text-emerald-500">
                  3 closed
                </span>
              </div>
              <span className="text-xs text-slate-400 block mt-0.5">
                verified in ledger
              </span>
            </button>

            {/* 6. Avg Response */}
            <button
              type="button"
              onClick={() => handleTabChange("overview")}
              className="flex-none w-[160px] sm:w-[180px] lg:w-auto snap-start text-left rounded-lg border border-slate-800/80 bg-[#0E121B] p-3 transition hover:border-slate-700"
            >
              <span className="text-xs font-medium text-slate-400 block">Avg Response</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-white tracking-tight tabular-nums">
                  {String(data.snapshot.averageFirstResponseSeconds.value)}
                </span>
                <span className="text-xs font-medium text-cyan-400">
                  AI Triage
                </span>
              </div>
              <span className="text-xs text-slate-400 block mt-0.5">
                first touch latency
              </span>
            </button>
          </div>
        </section>

        {/* =========================================================================
            ZONE 3: TEXT-FIRST STICKY COMMAND TABS
            ========================================================================= */}
        <nav
          className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2 bg-[#080A0F]/95 backdrop-blur-md border-b border-white/[0.06]"
          aria-label="Workspace Views"
        >
          <div
            role="tablist"
            className="flex items-center gap-2 overflow-x-auto scrollbar-none"
          >
            {/* 1. Overview */}
            <button
              ref={(el) => {
                tabRefs.current["overview"] = el;
              }}
              role="tab"
              id="tab-overview"
              aria-controls="panel-overview"
              aria-selected={activeTab === "overview"}
              tabIndex={activeTab === "overview" ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, 0)}
              onClick={() => handleTabChange("overview")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0 ${
                activeTab === "overview"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <span>Overview</span>
            </button>

            {/* 2. Revenue */}
            <button
              ref={(el) => {
                tabRefs.current["revenue"] = el;
              }}
              role="tab"
              id="tab-revenue"
              aria-controls="panel-revenue"
              aria-selected={activeTab === "revenue"}
              tabIndex={activeTab === "revenue" ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, 1)}
              onClick={() => handleTabChange("revenue")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0 ${
                activeTab === "revenue"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <span>Revenue</span>
            </button>

            {/* 3. Lead Funnel */}
            <button
              ref={(el) => {
                tabRefs.current["funnel"] = el;
              }}
              role="tab"
              id="tab-funnel"
              aria-controls="panel-funnel"
              aria-selected={activeTab === "funnel"}
              tabIndex={activeTab === "funnel" ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, 2)}
              onClick={() => handleTabChange("funnel")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0 ${
                activeTab === "funnel"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <span>Lead Funnel</span>
            </button>

            {/* 4. Priority Leads */}
            <button
              ref={(el) => {
                tabRefs.current["leads"] = el;
              }}
              role="tab"
              id="tab-leads"
              aria-controls="panel-leads"
              aria-selected={activeTab === "leads"}
              tabIndex={activeTab === "leads" ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, 3)}
              onClick={() => handleTabChange("leads")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0 ${
                activeTab === "leads"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <span>Priority Leads</span>
              <span className="rounded-full bg-slate-700 text-slate-300 px-1.5 py-0.2 text-xs font-semibold tabular-nums">
                {data.priorityLeads.filter((l) => l.isUrgent).length || 4}
              </span>
            </button>

            {/* 5. Conversations */}
            <button
              ref={(el) => {
                tabRefs.current["conversations"] = el;
              }}
              role="tab"
              id="tab-conversations"
              aria-controls="panel-conversations"
              aria-selected={activeTab === "conversations"}
              tabIndex={activeTab === "conversations" ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, 4)}
              onClick={() => handleTabChange("conversations")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0 ${
                activeTab === "conversations"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <span>Conversations</span>
              <span className="rounded-full bg-slate-700 text-slate-300 px-1.5 py-0.2 text-xs font-semibold tabular-nums">
                {data.recentActivity.filter((c) => c.isUnread).length || 2}
              </span>
            </button>

            {/* 6. Operations */}
            <button
              ref={(el) => {
                tabRefs.current["operations"] = el;
              }}
              role="tab"
              id="tab-operations"
              aria-controls="panel-operations"
              aria-selected={activeTab === "operations"}
              tabIndex={activeTab === "operations" ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, 5)}
              onClick={() => handleTabChange("operations")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition shrink-0 ${
                activeTab === "operations"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <span>Operations</span>
              <span className="rounded-full bg-slate-700 text-slate-300 px-1.5 py-0.2 text-xs font-semibold tabular-nums">
                {activeRecommendations.length || 3}
              </span>
            </button>
          </div>
        </nav>

        {/* =========================================================================
            ZONE 4: SINGLE ACTIVE WORKSPACE CANVAS
            ========================================================================= */}
        <main className="min-h-[480px]">
          {/* TAB A: OVERVIEW */}
          {activeTab === "overview" && (
            <div
              id="panel-overview"
              role="tabpanel"
              aria-labelledby="tab-overview"
              className="space-y-4 animate-in fade-in duration-150"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 1. Lead-to-Revenue Velocity */}
                <div className="rounded-lg border border-slate-800/80 bg-[#0E121B] p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
                      <h2 className="text-sm font-semibold text-white">Lead-to-Revenue Velocity</h2>
                      <button
                        type="button"
                        onClick={() => handleTabChange("funnel")}
                        className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      >
                        View Funnel <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Overall Conversion Rate</span>
                        <span className="font-semibold text-emerald-400 tabular-nums">{data.funnel.overallConversionRate}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
                        <div className="bg-cyan-500 h-full" style={{ width: "80%" }} title="Active Pipeline Progression" />
                        <div className="bg-emerald-500 h-full" style={{ width: "20%" }} title="Won Deals" />
                      </div>

                      <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                        <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-xs text-slate-400 block">Inbound</span>
                          <span className="text-sm font-semibold text-white tabular-nums">47</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-xs text-slate-400 block">Qualified</span>
                          <span className="text-sm font-semibold text-slate-200 tabular-nums">26</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-xs text-slate-400 block">Appts</span>
                          <span className="text-sm font-semibold text-slate-200 tabular-nums">8</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                          <span className="text-xs text-slate-400 block">Won</span>
                          <span className="text-sm font-semibold text-emerald-400 tabular-nums">3</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
                    <span>Avg Time to Win: <strong className="text-slate-200 font-medium tabular-nums">{data.funnel.averageTimeToWinDays} days</strong></span>
                    <span>Open Pipeline: <strong className="text-slate-200 font-medium tabular-nums">$8,940</strong></span>
                  </div>
                </div>

                {/* 2. AI Receptionist Runtime */}
                <div className="rounded-lg border border-slate-800/80 bg-[#0E121B] p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
                      <h2 className="text-sm font-semibold text-white">AI Receptionist Runtime</h2>
                      <Link
                        href="/dashboard/bot-setup"
                        className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      >
                        View Runtime <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2.5">
                      <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/60">
                        <span className="text-xs text-slate-400 block">Response Time</span>
                        <span className="text-base font-semibold text-white mt-0.5 block tabular-nums">
                          ~{data.aiReceptionist.averageResponseTimeSeconds}s
                        </span>
                        <span className="text-xs text-slate-400">99.8% on SLA</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/60">
                        <span className="text-xs text-slate-400 block">Resolution</span>
                        <span className="text-base font-semibold text-white mt-0.5 block tabular-nums">
                          {data.aiReceptionist.aiResolutionRate}%
                        </span>
                        <span className="text-xs text-slate-400">34 resolved</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800/60">
                        <span className="text-xs text-slate-400 block">Handoffs</span>
                        <span className="text-base font-semibold text-slate-200 mt-0.5 block tabular-nums">
                          {data.aiReceptionist.humanHandoffCount}
                        </span>
                        <span className="text-xs text-slate-400">10.6% rate</span>
                      </div>
                    </div>

                    {/* Channels status */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400">Channels:</span>
                      <span className="text-slate-300 font-medium">• Telegram (@ApexLeadBot)</span>
                      <span className="text-slate-300 font-medium">• Web Chat</span>
                      <span className="text-slate-400">• WhatsApp (Coming Later)</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
                    <span className="text-slate-400">Knowledge Base: <strong className="text-slate-200 font-medium">Healthy (4 services)</strong></span>
                    <button
                      type="button"
                      onClick={() => setDrawerState({ type: "ai-assistant" })}
                      className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
                    >
                      Test Assistant &rarr;
                    </button>
                  </div>
                </div>

                {/* 3. Top Priority Leads */}
                <div className="rounded-lg border border-slate-800/80 bg-[#0E121B] p-4">
                  <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
                    <h2 className="text-sm font-semibold text-white">Top Priority Leads</h2>
                    <button
                      type="button"
                      onClick={() => handleTabChange("leads")}
                      className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      Review Leads <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {data.priorityLeads.slice(0, 3).map((lead) => (
                      <div
                        key={lead.id}
                        onClick={() => setDrawerState({ type: "lead", lead })}
                        className="flex items-center justify-between p-2.5 rounded bg-slate-900/40 border border-slate-800/60 hover:bg-slate-900/80 transition cursor-pointer"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white">
                              {lead.name}
                            </span>
                            <span className="text-xs text-slate-400 tabular-nums">
                              {lead.qualificationScore} pts
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 truncate max-w-[220px] block">
                            {lead.intent}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-semibold text-white block tabular-nums">
                            ${lead.estimatedValue.toLocaleString()}
                          </span>
                          <span className={`text-xs font-medium ${lead.isUrgent ? "text-amber-400" : "text-slate-400"}`}>
                            {lead.slaTimerText}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Top Recommended Actions */}
                <div className="rounded-lg border border-slate-800/80 bg-[#0E121B] p-4">
                  <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
                    <h2 className="text-sm font-semibold text-white">Recommended Actions</h2>
                    <button
                      type="button"
                      onClick={() => handleTabChange("operations")}
                      className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      Open Operations <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {activeRecommendations.slice(0, 3).map((action) => (
                      <div
                        key={action.id}
                        className="flex items-center justify-between p-2.5 rounded bg-slate-900/40 border border-slate-800/60"
                      >
                        <div className="max-w-[70%]">
                          <span className="text-xs font-medium text-white block truncate">
                            {action.title}
                          </span>
                          <span className="text-xs text-slate-400 block truncate">
                            {action.reason}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={action.actionHref}
                            className="text-xs font-medium text-cyan-400 hover:underline"
                          >
                            {action.actionLabel}
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDismissAction(action.id)}
                            title="Dismiss action"
                            className="text-slate-400 hover:text-slate-200 p-0.5"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB B: REVENUE */}
          {activeTab === "revenue" && (
            <div
              id="panel-revenue"
              role="tabpanel"
              aria-labelledby="tab-revenue"
              className="space-y-4 animate-in fade-in duration-150"
            >
              {/* Range Filters & Attribution Summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Revenue Attribution & Ledger
                  </h2>
                  <p className="text-xs text-slate-400">
                    Attributed revenue verified via payment ledger.
                  </p>
                </div>

                {/* Range Filter Buttons */}
                <div className="inline-flex rounded-md border border-slate-800 bg-slate-950 p-0.5">
                  {(["7d", "30d", "90d"] as const).map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setRevenueRangeFilter(range)}
                      className={`px-3 py-1 text-xs font-medium rounded transition ${
                        revenueRangeFilter === range
                          ? "bg-slate-800 text-white shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : "90 Days"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Attribution KPI Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                  <span className="text-xs font-medium text-slate-400 block">Collected Revenue</span>
                  <span className="text-xl font-bold text-emerald-400 mt-1 block tabular-nums">
                    ${data.revenueAttribution.revenueWon.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5 block">3 verified deals</span>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                  <span className="text-xs font-medium text-slate-400 block">Open Pipeline</span>
                  <span className="text-xl font-bold text-white mt-1 block tabular-nums">
                    ${data.revenueAttribution.openPipelineValue.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5 block">8 qualified deals</span>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                  <span className="text-xs font-medium text-slate-400 block">AI-Influenced Share</span>
                  <span className="text-xl font-bold text-white mt-1 block tabular-nums">
                    {data.revenueAttribution.aiInfluencePercentage}%
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5 block">${data.revenueAttribution.aiInfluencedRevenue.toLocaleString()} attributed to AI</span>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                  <span className="text-xs font-medium text-slate-400 block">Top Service</span>
                  <span className="text-base font-semibold text-white mt-1 block truncate">
                    {data.revenueAttribution.topPerformingService.name}
                  </span>
                  <span className="text-xs text-slate-400 block tabular-nums">
                    ${data.revenueAttribution.topPerformingService.revenue.toLocaleString()} ({data.revenueAttribution.topPerformingService.dealCount} deals)
                  </span>
                </div>
              </div>

              {/* Attribution By Channel & Won Deals Table */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Channel Breakdown */}
                <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Attribution by Channel
                  </h3>
                  <div className="space-y-3">
                    {data.revenueAttribution.bySource.map((source) => (
                      <div key={source.source} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-white">{source.label}</span>
                          <span className="text-emerald-400 tabular-nums">${source.wonRevenue.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{
                              width: `${(source.wonRevenue / data.revenueAttribution.revenueWon) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-slate-400 tabular-nums">
                          <span>{source.leadsCount} leads ({source.wonCount} won)</span>
                          <span>{source.conversionRate}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Won Deals List */}
                <div className="lg:col-span-2 p-4 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Recent Closed-Won Deals
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-slate-400">
                          <th className="pb-2 font-medium">Client</th>
                          <th className="pb-2 font-medium">Service</th>
                          <th className="pb-2 font-medium">Source</th>
                          <th className="pb-2 font-medium text-right">Amount</th>
                          <th className="pb-2 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {data.revenueAttribution.recentWonDeals.map((deal) => (
                          <tr key={deal.id} className="hover:bg-slate-900/40">
                            <td className="py-2.5 font-medium text-white">{deal.clientName}</td>
                            <td className="py-2.5 text-slate-300">{deal.serviceName}</td>
                            <td className="py-2.5 text-slate-300 capitalize">{deal.leadSource}</td>
                            <td className="py-2.5 text-right font-semibold text-emerald-400 tabular-nums">
                              ${deal.amount.toLocaleString()}
                            </td>
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => setDrawerState({ type: "deal", deal })}
                                className="text-xs font-medium text-cyan-400 hover:underline"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB C: LEAD FUNNEL */}
          {activeTab === "funnel" && (
            <div
              id="panel-funnel"
              role="tabpanel"
              aria-labelledby="tab-funnel"
              className="space-y-4 animate-in fade-in duration-150"
            >
              {/* Funnel Stage Selector Strip */}
              <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Lead-to-Revenue Funnel
                    </h2>
                    <p className="text-xs text-slate-400">
                      Select a stage to inspect conversion metrics and opportunities.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFunnelStageId("all")}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium border ${
                      selectedFunnelStageId === "all"
                        ? "bg-slate-800 text-white border-slate-700"
                        : "text-slate-400 border-transparent hover:text-white"
                    }`}
                  >
                    View All Stages
                  </button>
                </div>

                {/* Interactive Stage Pipeline Cards */}
                <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {data.funnel.stages.map((stage) => {
                    const isSelected = selectedFunnelStageId === stage.id;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => setSelectedFunnelStageId(stage.id)}
                        className={`text-left rounded-lg p-3 border transition ${
                          isSelected
                            ? "border-cyan-500 bg-cyan-950/20"
                            : "border-slate-800/80 bg-slate-900/40 hover:border-slate-700"
                        }`}
                      >
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                          {stage.label}
                        </span>
                        <span className="text-xl font-bold text-white mt-1 block tabular-nums">
                          {stage.count}
                        </span>
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-400 tabular-nums">
                          <span>{stage.conversionFromPrevious}%</span>
                          <span>${(stage.pipelineValue / 1000).toFixed(1)}k</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stage Filtered Leads List */}
              <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {selectedFunnelStageId === "all"
                      ? "All Active Pipeline Opportunities"
                      : `Opportunities in ${selectedFunnelStageId.toUpperCase()}`}
                  </h3>
                  <span className="text-xs text-slate-400 tabular-nums">{funnelFilteredLeads.length} leads</span>
                </div>

                <div className="space-y-2">
                  {funnelFilteredLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => setDrawerState({ type: "lead", lead })}
                      className="flex items-center justify-between p-3 rounded bg-slate-900/40 border border-slate-800/60 hover:bg-slate-900/80 transition cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white">{lead.name}</span>
                          <span className="text-xs text-slate-400 capitalize">• {lead.dealStage}</span>
                        </div>
                        <span className="text-xs text-slate-300">{lead.intent}</span>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="text-xs font-semibold text-white block tabular-nums">
                            ${lead.estimatedValue.toLocaleString()}
                          </span>
                          <span className="text-xs text-slate-400 tabular-nums">
                            {lead.qualificationScore} pts
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB D: PRIORITY LEADS */}
          {activeTab === "leads" && (
            <div
              id="panel-leads"
              role="tabpanel"
              aria-labelledby="tab-leads"
              className="space-y-4 animate-in fade-in duration-150"
            >
              {/* Lead Filters Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Priority Lead Triage
                  </h2>
                  <p className="text-xs text-slate-400">
                    High-intent qualified leads triaged by AI Receptionist.
                  </p>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {(
                    [
                      { id: "all", label: "All Leads" },
                      { id: "urgent", label: "Urgent" },
                      { id: "qualified", label: "Qualified (80+)" },
                      { id: "new", label: "New" },
                      { id: "human", label: "Awaiting Human" },
                    ] as const
                  ).map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setLeadFilter(filter.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition shrink-0 ${
                        leadFilter === filter.id
                          ? "bg-slate-800 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Leads Table */}
              <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-slate-400">
                      <th className="pb-2.5 font-medium">Contact</th>
                      <th className="pb-2.5 font-medium">Intent</th>
                      <th className="pb-2.5 font-medium">Score</th>
                      <th className="pb-2.5 font-medium">Stage</th>
                      <th className="pb-2.5 font-medium">SLA</th>
                      <th className="pb-2.5 font-medium">Est. Value</th>
                      <th className="pb-2.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredPriorityLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="hover:bg-slate-900/40 transition cursor-pointer"
                        onClick={() => setDrawerState({ type: "lead", lead })}
                      >
                        <td className="py-2.5 font-medium text-white">
                          <span>{lead.name}</span>
                          <span className="text-xs text-slate-400 block capitalize">{lead.source}</span>
                        </td>
                        <td className="py-2.5 text-slate-300">
                          <span>{lead.intent}</span>
                          <span className="text-xs text-slate-400 block truncate max-w-[200px]">
                            {lead.lastMessageSnippet}
                          </span>
                        </td>
                        <td className="py-2.5 font-medium tabular-nums text-slate-200">
                          {lead.qualificationScore} pts
                        </td>
                        <td className="py-2.5 capitalize text-slate-400">{lead.dealStage}</td>
                        <td className="py-2.5">
                          <span
                            className={`font-medium ${
                              lead.isUrgent ? "text-amber-400" : "text-slate-400"
                            }`}
                          >
                            {lead.slaTimerText}
                          </span>
                        </td>
                        <td className="py-2.5 font-semibold text-white tabular-nums">${lead.estimatedValue.toLocaleString()}</td>
                        <td className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyBookingLink(lead.name)}
                              className="text-xs font-medium text-cyan-400 hover:underline"
                            >
                              Send Link
                            </button>
                            <button
                              type="button"
                              onClick={() => setDrawerState({ type: "lead", lead })}
                              className="text-xs font-medium text-slate-300 hover:text-white"
                            >
                              Inspect
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB E: CONVERSATIONS */}
          {activeTab === "conversations" && (
            <div
              id="panel-conversations"
              role="tabpanel"
              aria-labelledby="tab-conversations"
              className="space-y-4 animate-in fade-in duration-150"
            >
              {/* Inbox Header & Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-slate-800/80 bg-[#0E121B]">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Live Conversation Activity
                  </h2>
                  <p className="text-xs text-slate-400">
                    Real-time feed across Telegram, Web Chat and Email.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 p-0.5">
                    {(
                      [
                        { id: "all", label: "All" },
                        { id: "unread", label: "Unread" },
                        { id: "ai", label: "AI Handled" },
                        { id: "human", label: "Handoffs" },
                      ] as const
                    ).map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setConversationFilter(filter.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition ${
                          conversationFilter === filter.id
                            ? "bg-slate-800 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  <Link
                    href="/dashboard/inbox"
                    className="text-xs font-medium text-cyan-400 hover:underline flex items-center gap-1 pl-2"
                  >
                    Open Full Inbox <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* Conversations Feed List */}
              <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B] space-y-2">
                {filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setDrawerState({ type: "conversation", conversation: conv })}
                    className="flex items-center justify-between p-3 rounded bg-slate-900/40 border border-slate-800/60 hover:bg-slate-900/80 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {conv.isUnread ? (
                        <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-slate-700 shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white">{conv.contactName}</span>
                          <span className="text-xs text-slate-400 capitalize">• {conv.channel}</span>
                          {conv.isAiHandled ? (
                            <span className="text-xs text-emerald-400">AI Active</span>
                          ) : (
                            <span className="text-xs text-amber-400">Human Transferred</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-300 block mt-0.5 truncate max-w-[380px]">
                          {conv.latestMessage}
                        </span>
                      </div>
                    </div>

                    <div className="text-right text-xs">
                      <span className="text-xs text-slate-400 block tabular-nums">{conv.timestamp}</span>
                      <span className="text-cyan-400 font-medium">Inspect &rarr;</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB F: OPERATIONS */}
          {activeTab === "operations" && (
            <div
              id="panel-operations"
              role="tabpanel"
              aria-labelledby="tab-operations"
              className="space-y-4 animate-in fade-in duration-150"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 1. Recommended Actions */}
                <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B] space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                    <h2 className="text-sm font-semibold text-white">
                      Recommended Operations
                    </h2>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {activeRecommendations.length} active
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activeRecommendations.map((action) => (
                      <div
                        key={action.id}
                        className="flex items-center justify-between p-3 rounded bg-slate-900/40 border border-slate-800/60"
                      >
                        <div>
                          <span className="text-xs font-medium text-white block">
                            {action.title}
                          </span>
                          <span className="text-xs text-slate-300 block">
                            {action.reason}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={action.actionHref}
                            className="text-xs font-medium text-cyan-400 hover:underline"
                          >
                            {action.actionLabel}
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDismissAction(action.id)}
                            className="text-slate-400 hover:text-white p-0.5"
                            title="Dismiss"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Upcoming Appointments */}
                <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B] space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                    <h2 className="text-sm font-semibold text-white">
                      Upcoming Appointments
                    </h2>
                    <Link
                      href="/dashboard/crm"
                      className="text-xs font-medium text-cyan-400 hover:underline"
                    >
                      View Calendar &rarr;
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {allAppointments.map((appt) => (
                      <div
                        key={appt.id}
                        className="flex items-center justify-between p-2.5 rounded bg-slate-900/40 border border-slate-800/60"
                      >
                        <div>
                          <span className="text-xs font-medium text-white block">
                            {appt.clientName}
                          </span>
                          <span className="text-xs text-slate-400 block">
                            {appt.serviceRequested} • {appt.dateTimeFormatted}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-medium text-emerald-400 uppercase block">
                            {appt.status}
                          </span>
                          <span className="text-xs text-white font-semibold tabular-nums">
                            ${appt.estimatedValue.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Operational Quick Actions */}
                <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B] space-y-3">
                  <h2 className="text-sm font-semibold text-white">
                    Quick Actions
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyBookingLink()}
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition"
                    >
                      <Copy className="h-3.5 w-3.5 text-slate-400" />
                      Copy Booking Link
                    </button>
                    <Link
                      href="/dashboard/bot-setup?tab=simulator"
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition"
                    >
                      <Bot className="h-3.5 w-3.5 text-slate-400" />
                      Test Receptionist
                    </Link>
                  </div>
                </div>

                {/* 4. Plan Quota & Subscription */}
                <div className="p-4 rounded-lg border border-slate-800/80 bg-[#0E121B] space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">
                      Plan & Quota Usage
                    </h2>
                    <span className="text-xs font-medium text-slate-400 uppercase">
                      {data.planUsage.planTier} Plan
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="flex justify-between text-slate-400 text-xs mb-1 tabular-nums">
                        <span>AI Conversations</span>
                        <span className="text-white font-medium">{data.planUsage.aiConversationsUsed}/{data.planUsage.aiConversationsLimit}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="bg-cyan-500 h-full rounded-full"
                          style={{
                            width: `${(data.planUsage.aiConversationsUsed / data.planUsage.aiConversationsLimit) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-400 text-xs mb-1 tabular-nums">
                        <span>Captured Leads</span>
                        <span className="text-white font-medium">{data.planUsage.leadsUsed}/{data.planUsage.leadsLimit}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="bg-cyan-500 h-full rounded-full"
                          style={{
                            width: `${(data.planUsage.leadsUsed / data.planUsage.leadsLimit) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* =========================================================================
          RIGHT-SIDE CONTEXT DRAWER (PROGRESSIVE DISCLOSURE)
          ========================================================================= */}
      {drawerState && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in"
            onClick={() => setDrawerState(null)}
          />

          {/* Slide-over Drawer Panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md sm:max-w-lg bg-[#0E121B] border-l border-slate-800 shadow-2xl p-6 overflow-y-auto space-y-4 animate-in slide-in-from-right duration-150">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white">
                  {drawerState.type === "lead" && "Lead Details"}
                  {drawerState.type === "conversation" && "Conversation Transcript"}
                  {drawerState.type === "deal" && "Deal Overview"}
                  {drawerState.type === "ai-assistant" && "Ask J10 AI"}
                </h3>

                <button
                  type="button"
                  onClick={() => setDrawerState(null)}
                  className="rounded p-1 text-slate-400 hover:text-white"
                  title="Close Drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* DRAWER CONTENT: LEAD */}
              {drawerState.type === "lead" && (
                <div className="space-y-4 text-xs">
                  <div>
                    <h4 className="text-base font-semibold text-white">{drawerState.lead.name}</h4>
                    <span className="text-slate-400">{drawerState.lead.email || drawerState.lead.phone || "Captured via Telegram"}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded bg-slate-900/60 border border-slate-800/60 p-2.5">
                      <span className="text-slate-400 block">Intent</span>
                      <span className="font-medium text-white mt-0.5 block">{drawerState.lead.intent}</span>
                    </div>
                    <div className="rounded bg-slate-900/60 border border-slate-800/60 p-2.5">
                      <span className="text-slate-400 block">Estimated Value</span>
                      <span className="font-semibold text-emerald-400 mt-0.5 block tabular-nums">${drawerState.lead.estimatedValue.toLocaleString()}</span>
                    </div>
                    <div className="rounded bg-slate-900/60 border border-slate-800/60 p-2.5">
                      <span className="text-slate-400 block">Qualification Score</span>
                      <span className="font-semibold text-white mt-0.5 block tabular-nums">{drawerState.lead.qualificationScore} / 100</span>
                    </div>
                    <div className="rounded bg-slate-900/60 border border-slate-800/60 p-2.5">
                      <span className="text-slate-400 block">SLA Status</span>
                      <span className="font-medium text-amber-400 mt-0.5 block">{drawerState.lead.slaTimerText}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="font-medium text-slate-400 block">Last Message</span>
                    <div className="rounded bg-slate-900/60 border border-slate-800/60 p-3 text-slate-200">
                      "{drawerState.lead.lastMessageSnippet}"
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="font-medium text-slate-400 block">Recommended Action</span>
                    <div className="rounded bg-slate-900/60 border border-slate-800/60 p-3 text-slate-300">
                      {drawerState.lead.recommendedNextAction}
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyBookingLink(drawerState.lead.name)}
                      className="flex items-center justify-center gap-2 rounded-lg bg-cyan-600 p-2.5 text-xs font-medium text-white hover:bg-cyan-500 transition"
                    >
                      <Copy className="h-4 w-4" /> Send Discovery Booking Link
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/dashboard/inbox?thread=${drawerState.lead.threadId || drawerState.lead.id}`}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-slate-400" /> Open in Inbox
                      </Link>
                      <Link
                        href={`/dashboard/crm?lead=${drawerState.lead.id}`}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        <User className="h-3.5 w-3.5 text-slate-400" /> Open in CRM
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* DRAWER CONTENT: CONVERSATION */}
              {drawerState.type === "conversation" && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">{drawerState.conversation.contactName}</h4>
                      <span className="text-slate-400 capitalize">Channel: {drawerState.conversation.channel}</span>
                    </div>
                    <span className="text-slate-400 font-medium">
                      {drawerState.conversation.isAiHandled ? "AI Handled" : "Human Transferred"}
                    </span>
                  </div>

                  <div className="space-y-2 rounded bg-slate-900/60 border border-slate-800/60 p-3 max-h-[300px] overflow-y-auto">
                    <div className="rounded bg-slate-800 p-2.5 max-w-[85%] text-slate-200">
                      <span className="text-slate-400 block font-medium mb-0.5">{drawerState.conversation.contactName}</span>
                      {drawerState.conversation.latestMessage}
                    </div>
                    <div className="rounded bg-cyan-950/30 border border-cyan-900/40 p-2.5 max-w-[85%] ml-auto text-cyan-200">
                      <span className="text-cyan-400 block font-medium mb-0.5">AI Receptionist (~11s)</span>
                      Thanks for reaching out! I've noted your interest and can schedule a consultation with our team.
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/inbox?thread=${drawerState.conversation.threadId}`}
                    className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 border border-slate-700 p-2.5 text-xs font-medium text-white hover:bg-slate-700 transition"
                  >
                    Open Full Inbox Thread &rarr;
                  </Link>
                </div>
              )}

              {/* DRAWER CONTENT: DEAL */}
              {drawerState.type === "deal" && (
                <div className="space-y-4 text-xs">
                  <div className="rounded bg-slate-900/60 border border-slate-800/60 p-4 text-center">
                    <span className="text-slate-400 font-medium block">Verified Closed Deal</span>
                    <span className="text-2xl font-bold text-emerald-400 mt-1 block tabular-nums">
                      ${drawerState.deal.amount.toLocaleString()}
                    </span>
                    <span className="text-slate-400 mt-0.5 block">Recorded on {drawerState.deal.wonDate}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between py-1.5 border-b border-white/[0.06]">
                      <span className="text-slate-400">Client Name</span>
                      <span className="font-medium text-white">{drawerState.deal.clientName}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-white/[0.06]">
                      <span className="text-slate-400">Service</span>
                      <span className="font-medium text-white">{drawerState.deal.serviceName}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-white/[0.06]">
                      <span className="text-slate-400">Channel</span>
                      <span className="font-medium text-white capitalize">{drawerState.deal.leadSource}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-white/[0.06]">
                      <span className="text-slate-400">Ledger Verification</span>
                      <span className="text-emerald-400 font-medium">Stripe Confirmed</span>
                    </div>
                  </div>

                  <Link
                    href="/dashboard/revenue"
                    className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 border border-slate-700 p-2.5 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    View in Revenue Ledger &rarr;
                  </Link>
                </div>
              )}

              {/* DRAWER CONTENT: AI ASSISTANT */}
              {drawerState.type === "ai-assistant" && (
                <div className="space-y-4 text-xs flex flex-col h-[500px] justify-between">
                  <div className="space-y-2.5 overflow-y-auto pr-1">
                    {aiChatHistory.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg p-3 ${
                          msg.role === "assistant"
                            ? "bg-slate-900 border border-slate-800 text-slate-200 mr-4"
                            : "bg-cyan-950/20 border border-cyan-900/40 text-cyan-200 ml-4"
                        }`}
                      >
                        <span className="font-medium block mb-1 text-slate-400">
                          {msg.role === "assistant" ? "J10 Assistant" : "You"}
                        </span>
                        <p className="leading-relaxed">{msg.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Pre-made Query Chips */}
                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <span className="text-slate-400 block">Suggested Queries:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSendAiPrompt("How is AI Receptionist SLA performing?")}
                        className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-800"
                      >
                        Receptionist SLA
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendAiPrompt("Which leads need human attention today?")}
                        className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-800"
                      >
                        Urgent Leads
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendAiPrompt("What is our revenue attribution breakdown?")}
                        className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-800"
                      >
                        Revenue Attribution
                      </button>
                    </div>

                    {/* Input field */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={aiPromptInput}
                        onChange={(e) => setAiPromptInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSendAiPrompt();
                        }}
                        placeholder="Ask anything about leads, SLA or revenue..."
                        className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:border-slate-700 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendAiPrompt()}
                        className="rounded-md bg-slate-800 p-2 text-white hover:bg-slate-700 font-medium"
                        title="Send"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
