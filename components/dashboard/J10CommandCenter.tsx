"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  MessageSquare,
  Plug,
  RefreshCw,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import type { CommandCenterData } from "@/app/api/dashboard/command-center/route";

interface J10CommandCenterProps {
  initialWorkspaceName?: string;
  userName?: string;
}

export default function J10CommandCenter({
  initialWorkspaceName = "Active Workspace",
  userName,
}: J10CommandCenterProps) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard/command-center", {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load authenticated workspace metrics.");
      }

      setData(json.data);
    } catch (err) {
      console.error("J10 Command Center load error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Workspace metrics are temporarily unavailable. Please retry."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-[calc(100dvh-72px)] bg-[#07090f] p-4 sm:p-6 lg:p-8 text-white">
        <div className="mx-auto max-w-[1360px] space-y-6">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
            <div>
              <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
              <div className="mt-2 h-8 w-64 animate-pulse rounded bg-white/10" />
            </div>
            <div className="h-9 w-24 animate-pulse rounded-lg bg-white/10" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[calc(100dvh-72px)] bg-[#07090f] p-4 sm:p-6 lg:p-8 text-white">
        <div className="mx-auto max-w-[1360px]">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.05] p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <h2 className="mt-3 text-lg font-semibold text-white">
              Data Synchronization Unavailable
            </h2>
            <p className="mt-2 text-sm text-[#8d96a8]">
              {error || "Unable to query verified workspace metrics."}
            </p>
            <button
              type="button"
              onClick={() => void fetchData(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
            >
              <RefreshCw size={14} />
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { metrics, attentionItems, recentLeads, recentConversations, upcomingBookingsList, channelOverview } = data;
  const workspaceDisplayName = data.brandName || data.workspaceName || initialWorkspaceName;

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#07090f] p-4 sm:p-6 lg:p-8 text-white">
      <div className="mx-auto max-w-[1360px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-400">
              <span>J10 NEXUS</span>
              <span className="text-white/20">/</span>
              <span className="text-[#8d96a8]">{workspaceDisplayName}</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              J10 Command Center
            </h1>
            <p className="mt-1 text-xs text-[#8d96a8]">
              Live operational summary and revenue movement for authenticated workspace.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Verified Workspace Data
            </span>

            <button
              type="button"
              onClick={() => void fetchData(true)}
              disabled={refreshing}
              aria-label="Refresh workspace metrics"
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-[#8d96a8] transition hover:bg-white/[0.07] hover:text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin text-cyan-400" : ""} />
              <span>{refreshing ? "Syncing..." : "Sync"}</span>
            </button>
          </div>
        </div>

        {/* 8-Tile Workspace Metric Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          {/* 1. New Leads */}
          <Link
            href={metrics.newLeads.href}
            className="group flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-200 hover:border-cyan-400/40 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">New Leads</span>
              <Users size={16} className="text-cyan-400 transition group-hover:scale-110" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white sm:text-3xl">
                {metrics.newLeads.count}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-cyan-300">
                <span>J10 Lead Center</span>
                <ChevronRight size={12} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {/* 2. Leads Needing Attention */}
          <Link
            href={metrics.leadsNeedingAttention.href}
            className="group flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-200 hover:border-amber-400/40 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Needs Attention</span>
              <AlertTriangle size={16} className="text-amber-400 transition group-hover:scale-110" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white sm:text-3xl">
                {metrics.leadsNeedingAttention.count}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-300">
                <span>Qualified Leads</span>
                <ChevronRight size={12} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {/* 3. Unanswered Conversations */}
          <Link
            href={metrics.unansweredConversations.href}
            className="group flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-200 hover:border-blue-400/40 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Unanswered</span>
              <MessageSquare size={16} className="text-blue-400 transition group-hover:scale-110" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white sm:text-3xl">
                {metrics.unansweredConversations.count}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-300">
                <span>J10 Inbox</span>
                <ChevronRight size={12} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {/* 4. Upcoming Bookings */}
          <Link
            href={metrics.upcomingBookings.href}
            className="group flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-200 hover:border-emerald-400/40 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Upcoming Bookings</span>
              <Calendar size={16} className="text-emerald-400 transition group-hover:scale-110" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white sm:text-3xl">
                {metrics.upcomingBookings.count}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-300">
                <span>J10 Booking</span>
                <ChevronRight size={12} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {/* 5. Pending Payments */}
          <Link
            href={metrics.pendingPayments.href}
            className="group flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-200 hover:border-violet-400/40 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Pending Payments</span>
              <CreditCard size={16} className="text-violet-400 transition group-hover:scale-110" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white sm:text-3xl">
                ${metrics.pendingPayments.amount.toLocaleString()}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-violet-300">
                <span>{metrics.pendingPayments.count} Invoices in J10 Pay</span>
                <ChevronRight size={12} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {/* 6. Tasks Requiring Action */}
          <Link
            href={metrics.tasksRequiringHumanAction.href}
            className="group flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-200 hover:border-amber-400/40 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Human Actions</span>
              <Zap size={16} className="text-amber-400 transition group-hover:scale-110" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white sm:text-3xl">
                {metrics.tasksRequiringHumanAction.count}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-300">
                <span>Handoffs & Approvals</span>
                <ChevronRight size={12} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {/* 7. AI Actions Completed */}
          <Link
            href={metrics.aiActionsCompleted.href}
            className="group flex flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-200 hover:border-cyan-400/40 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">AI Actions</span>
              <Bot size={16} className="text-cyan-400 transition group-hover:scale-110" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white sm:text-3xl">
                {metrics.aiActionsCompleted.count}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-cyan-300">
                <span>J10 AI Operator</span>
                <ChevronRight size={12} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {/* 8. Failed Automations */}
          <Link
            href={metrics.failedAutomations.href}
            className={`group flex flex-col justify-between rounded-2xl border p-4 transition duration-200 hover:bg-white/[0.04] ${
              metrics.failedAutomations.count > 0
                ? "border-rose-500/40 bg-rose-500/[0.04]"
                : "border-white/[0.07] bg-white/[0.025]"
            }`}
          >
            <div className="flex items-center justify-between text-[#8d96a8]">
              <span className="text-xs font-medium">Failed Automations</span>
              <Workflow
                size={16}
                className={
                  metrics.failedAutomations.count > 0
                    ? "text-rose-400 transition group-hover:scale-110"
                    : "text-emerald-400 transition group-hover:scale-110"
                }
              />
            </div>
            <div className="mt-3">
              <div
                className={`text-2xl font-bold sm:text-3xl ${
                  metrics.failedAutomations.count > 0 ? "text-rose-300" : "text-white"
                }`}
              >
                {metrics.failedAutomations.count}
              </div>
              <div
                className={`mt-1 flex items-center gap-1 text-[11px] ${
                  metrics.failedAutomations.count > 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                <span>{metrics.failedAutomations.count > 0 ? "Requires Inspection" : "Healthy Engine"}</span>
                <ChevronRight size={12} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>
        </div>

        {/* Priority Attention Items */}
        <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Requires Operator Attention
              </h2>
              <p className="mt-0.5 text-xs text-[#8d96a8]">
                Real-time operational alerts requiring human decision or closing action.
              </p>
            </div>
            {attentionItems.length > 0 && (
              <span className="rounded-full bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                {attentionItems.length} Urgent
              </span>
            )}
          </div>

          <div className="mt-4 space-y-2.5">
            {attentionItems.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] p-4 text-xs text-emerald-300">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
                <span>
                  All operational items are currently clear. AI Operator is managing inbound communication without backlog.
                </span>
              </div>
            ) : (
              attentionItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        item.priority === "high"
                          ? "bg-rose-500/10 text-rose-400"
                          : "bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      <AlertTriangle size={15} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {item.title}
                        </span>
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-[#8d96a8]">
                          {item.product}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#8d96a8]">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={item.actionHref}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                  >
                    <span>{item.actionLabel}</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Two-Column Activity & Operations Section */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column: Recent Leads & Inbound Conversations */}
          <div className="space-y-6">
            {/* Recent Leads */}
            <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Recent Inbound Leads
                  </h3>
                  <p className="text-xs text-[#8d96a8]">
                    Latest contacts captured across live channels.
                  </p>
                </div>
                <Link
                  href="/dashboard/crm"
                  className="text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"
                >
                  View All in J10 Lead Center
                </Link>
              </div>

              <div className="mt-4 divide-y divide-white/[0.05]">
                {recentLeads.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#8d96a8]">
                    No contacts recorded yet in this workspace.
                  </div>
                ) : (
                  recentLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {lead.name}
                        </div>
                        <div className="text-[11px] text-[#8d96a8]">
                          Source: {lead.source}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase text-cyan-300">
                          {lead.status}
                        </span>
                        {lead.estimatedValue > 0 && (
                          <div className="mt-0.5 text-xs font-semibold text-emerald-400">
                            ${lead.estimatedValue.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Recent Conversations */}
            <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Active Conversations
                  </h3>
                  <p className="text-xs text-[#8d96a8]">
                    Live messages synchronized into J10 Inbox.
                  </p>
                </div>
                <Link
                  href="/dashboard/inbox"
                  className="text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"
                >
                  Open J10 Inbox
                </Link>
              </div>

              <div className="mt-4 divide-y divide-white/[0.05]">
                {recentConversations.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#8d96a8]">
                    No conversation threads recorded yet.
                  </div>
                ) : (
                  recentConversations.map((thread) => (
                    <div key={thread.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white">
                            {thread.contactName}
                          </span>
                          <span className="rounded bg-white/[0.05] px-1.5 py-0.2 text-[9px] uppercase font-bold text-[#8d96a8]">
                            {thread.channel}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-[#8d96a8]">
                          {thread.lastMessage}
                        </p>
                      </div>
                      {thread.isUnread && (
                        <span className="shrink-0 h-2 w-2 rounded-full bg-cyan-400" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Right Column: Upcoming Bookings & Channel Status */}
          <div className="space-y-6">
            {/* Upcoming Bookings */}
            <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Upcoming Bookings
                  </h3>
                  <p className="text-xs text-[#8d96a8]">
                    Customer consultations scheduled via AI operator.
                  </p>
                </div>
                <Link
                  href="/dashboard/booking"
                  className="text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"
                >
                  Manage in J10 Booking
                </Link>
              </div>

              <div className="mt-4 divide-y divide-white/[0.05]">
                {upcomingBookingsList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#8d96a8]">
                    No appointments scheduled yet.
                  </div>
                ) : (
                  upcomingBookingsList.map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {booking.clientName}
                        </div>
                        <div className="text-[11px] text-[#8d96a8]">
                          {new Date(booking.scheduledStart).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        {booking.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Communication Channels Overview */}
            <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Channel Connectivity
                  </h3>
                  <p className="text-xs text-[#8d96a8]">
                    Verified status of communication channels.
                  </p>
                </div>
                <Link
                  href="/dashboard/connections"
                  className="text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"
                >
                  Manage J10 Connections
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {channelOverview.map((item) => (
                  <div
                    key={item.channel}
                    className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5"
                  >
                    <span className="text-xs font-medium text-white truncate pr-1">
                      {item.label}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        item.status === "Connected"
                          ? "bg-emerald-400/10 text-emerald-400"
                          : item.status === "Available to connect"
                            ? "bg-cyan-400/10 text-cyan-300"
                            : item.status === "Degraded" || item.status === "Setup incomplete"
                              ? "bg-amber-400/10 text-amber-300"
                              : "bg-white/[0.05] text-[#8d96a8]"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
