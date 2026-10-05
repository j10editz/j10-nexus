"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useMemo } from "react";
import { RefreshCw, ChevronRight } from "lucide-react";
import type { CommandCenterData } from "@/app/api/dashboard/command-center/route";
import {
  DashboardMetricTile,
  DashboardStatusBadge,
  DashboardActionRow,
} from "./DashboardPrimitives";

interface J10CommandCenterProps {
  initialWorkspaceName?: string;
  userName?: string;
}

export default function J10CommandCenter({
  initialWorkspaceName = "Active Workspace",
}: J10CommandCenterProps) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

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
        throw new Error(json.error || "Failed to load workspace data.");
      }

      setData(json.data);
      const now = new Date();
      setLastUpdated(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    } catch (err) {
      console.error("J10 Command Center error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Workspace data is temporarily unavailable. Please retry."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Build the prioritized operational work list for "Priority Work"
  const priorityWorkItems = useMemo(() => {
    if (!data) return [];

    const items: Array<{
      id: string;
      title: string;
      context: string;
      priority: number; // 1: Failed automations, 2: Unanswered, 3: Follow-up leads, 4: Bookings, 5: Payments
      status: {
        label: string;
        variant: "error" | "warning" | "available" | "neutral" | "connected";
      };
      time?: string;
      actionLabel: string;
      actionHref: string;
    }> = [];

    // 1. Failed or blocked automations
    if (data.metrics.failedAutomations.count > 0) {
      items.push({
        id: "failed-automations-summary",
        title: `${data.metrics.failedAutomations.count} automation run${
          data.metrics.failedAutomations.count > 1 ? "s" : ""
        } could not finish`,
        context: "Review run logs to resolve trigger errors or retry failed steps",
        priority: 1,
        status: { label: "Failed", variant: "error" },
        actionLabel: "View run logs",
        actionHref: data.metrics.failedAutomations.href,
      });
    }

    // 2. Unanswered conversations
    if (data.recentConversations && data.recentConversations.length > 0) {
      data.recentConversations
        .filter((c) => c.isUnread)
        .slice(0, 3)
        .forEach((c) => {
          items.push({
            id: `conv-${c.id}`,
            title: `Reply to ${c.contactName}`,
            context: `${c.channel.toUpperCase()} - ${c.lastMessage || "No preview"}`,
            priority: 2,
            status: { label: "Unanswered", variant: "warning" },
            time: c.timestamp
              ? new Date(c.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : undefined,
            actionLabel: "Open thread",
            actionHref: `/dashboard/inbox?threadId=${c.id}`,
          });
        });
    }

    // 3. Leads needing follow-up
    if (data.recentLeads && data.recentLeads.length > 0) {
      data.recentLeads
        .filter((l) => l.status === "New" || l.status === "Qualified")
        .slice(0, 3)
        .forEach((l) => {
          items.push({
            id: `lead-${l.id}`,
            title: `Follow up with ${l.name}`,
            context: `${l.source.toUpperCase()} intake - Stage: ${l.status}`,
            priority: 3,
            status: {
              label: l.status === "New" ? "New lead" : "Qualified",
              variant: l.status === "New" ? "available" : "warning",
            },
            time: l.createdAt
              ? new Date(l.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : undefined,
            actionLabel: "View lead",
            actionHref: `/dashboard/crm?contactId=${l.id}`,
          });
        });
    }

    // 4. Upcoming bookings
    if (data.upcomingBookingsList && data.upcomingBookingsList.length > 0) {
      data.upcomingBookingsList.slice(0, 2).forEach((b) => {
        items.push({
          id: `booking-${b.id}`,
          title: `Upcoming: ${b.clientName}`,
          context: b.scheduledStart
            ? `Scheduled for ${new Date(b.scheduledStart).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Scheduled appointment",
          priority: 4,
          status: { label: b.status || "Scheduled", variant: "neutral" },
          actionLabel: "View booking",
          actionHref: `/dashboard/booking?id=${b.id}`,
        });
      });
    }

    // 5. Pending payments
    if (data.metrics.pendingPayments.count > 0) {
      items.push({
        id: "pending-payments-summary",
        title: `${data.metrics.pendingPayments.count} invoice${
          data.metrics.pendingPayments.count > 1 ? "s" : ""
        } awaiting settlement ($${data.metrics.pendingPayments.amount.toLocaleString()})`,
        context: "Sent payment checkouts awaiting client completion",
        priority: 5,
        status: { label: "Pending", variant: "warning" },
        actionLabel: "View invoices",
        actionHref: data.metrics.pendingPayments.href,
      });
    }

    return items.sort((a, b) => a.priority - b.priority);
  }, [data]);

  // Build recent activity stream
  const recentActivityItems = useMemo(() => {
    if (!data) return [];

    const activities: Array<{
      id: string;
      title: string;
      context: string;
      status: {
        label: string;
        variant: "connected" | "available" | "neutral";
      };
      time?: string;
      actionLabel: string;
      actionHref: string;
    }> = [];

    // Recent leads as new contacts
    if (data.recentLeads && data.recentLeads.length > 0) {
      data.recentLeads.slice(0, 4).forEach((lead) => {
        activities.push({
          id: `act-lead-${lead.id}`,
          title: `New contact recorded: ${lead.name}`,
          context: `${lead.source.toUpperCase()} intake - Stage: ${lead.status}`,
          status: { label: "Lead", variant: "available" },
          time: lead.createdAt
            ? new Date(lead.createdAt).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })
            : undefined,
          actionLabel: "View Lead",
          actionHref: `/dashboard/crm?contactId=${lead.id}`,
        });
      });
    }

    // Recent messages
    if (data.recentConversations && data.recentConversations.length > 0) {
      data.recentConversations.slice(0, 3).forEach((conv) => {
        activities.push({
          id: `act-conv-${conv.id}`,
          title: `Message from ${conv.contactName}`,
          context: `${conv.channel.toUpperCase()}: ${conv.lastMessage}`,
          status: { label: "Message", variant: "neutral" },
          time: conv.timestamp
            ? new Date(conv.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : undefined,
          actionLabel: "View Thread",
          actionHref: `/dashboard/inbox?threadId=${conv.id}`,
        });
      });
    }

    // Upcoming bookings as calendar events
    if (data.upcomingBookingsList && data.upcomingBookingsList.length > 0) {
      data.upcomingBookingsList.slice(0, 2).forEach((b) => {
        activities.push({
          id: `act-book-${b.id}`,
          title: `Confirmed appointment: ${b.clientName}`,
          context: b.scheduledStart
            ? `${new Date(b.scheduledStart).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })} at ${new Date(b.scheduledStart).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Scheduled",
          status: { label: "Booking", variant: "connected" },
          actionLabel: "Open Booking",
          actionHref: `/dashboard/booking?id=${b.id}`,
        });
      });
    }

    return activities;
  }, [data]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 text-white min-h-[calc(100dvh-56px)] bg-[#08080C]">
        <div className="mx-auto max-w-[1360px] space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-purple-900/25">
            <div className="space-y-1.5">
              <div className="h-6 w-48 animate-pulse rounded-lg bg-[#151322]" />
              <div className="h-3.5 w-64 animate-pulse rounded-lg bg-[#151322]" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded-lg bg-[#151322]" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[92px] animate-pulse rounded-xl border border-purple-500/15 bg-[#12111A]/80 shadow-sm"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 text-white min-h-[calc(100dvh-56px)] bg-[#08080C]">
        <div className="mx-auto max-w-[1360px]">
          <div className="rounded-xl border border-rose-500/30 bg-[#1A0E14] p-5 text-center shadow-[0_8px_30px_rgba(244,63,94,0.15)]">
            <h2 className="text-sm font-semibold text-rose-400">
              Unable to load workspace data
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              {error || "Could not retrieve live workspace metrics."}
            </p>
            <button
              type="button"
              onClick={() => void fetchData(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#1E1B2E] border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-white hover:border-purple-400 transition-colors shadow-sm"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { metrics } = data;

  return (
    <div className="p-4 sm:p-6 text-white min-h-[calc(100dvh-56px)] bg-[#08080C]">
      <div className="mx-auto max-w-[1360px] space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-900/25">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white drop-shadow-sm">
              J10 Command Center
            </h1>
            <p className="mt-0.5 text-xs text-slate-300">
              Operational business metrics and priority work items.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden sm:inline text-[11px] text-purple-200/60 font-mono">
                Updated {lastUpdated}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchData(true)}
              disabled={refreshing}
              aria-label="Refresh workspace metrics"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/25 bg-[#12111A] text-purple-200 transition-all hover:bg-[#181628] hover:text-white hover:border-purple-400/60 disabled:opacity-50 shadow-sm"
              title="Refresh metrics"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin text-purple-400" : ""}
              />
            </button>
          </div>
        </div>

        {/* 8 Compact Metric Panels (4-column desktop, 2-column mobile) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* 1. New Leads */}
          <DashboardMetricTile
            label="New Leads"
            value={metrics.newLeads.count}
            destinationLabel="J10 Lead Center"
            href={metrics.newLeads.href}
            semanticStatus="neutral"
          />

          {/* 2. Needs Attention */}
          <DashboardMetricTile
            label="Needs Attention"
            value={metrics.leadsNeedingAttention.count}
            destinationLabel="Qualified Leads"
            href={metrics.leadsNeedingAttention.href}
            semanticStatus={
              metrics.leadsNeedingAttention.count > 0 ? "warning" : "neutral"
            }
          />

          {/* 3. Unanswered */}
          <DashboardMetricTile
            label="Unanswered"
            value={metrics.unansweredConversations.count}
            destinationLabel="J10 Inbox"
            href={metrics.unansweredConversations.href}
            semanticStatus={
              metrics.unansweredConversations.count > 0 ? "warning" : "neutral"
            }
          />

          {/* 4. Upcoming Bookings */}
          <DashboardMetricTile
            label="Upcoming Bookings"
            value={metrics.upcomingBookings.count}
            destinationLabel="J10 Booking"
            href={metrics.upcomingBookings.href}
            semanticStatus="neutral"
          />

          {/* 5. Pending Payments */}
          <DashboardMetricTile
            label="Pending Payments"
            value={`$${metrics.pendingPayments.amount.toLocaleString()}`}
            destinationLabel="J10 Pay"
            href={metrics.pendingPayments.href}
            semanticStatus="neutral"
          />

          {/* 6. Human Actions */}
          <DashboardMetricTile
            label="Human Actions"
            value={metrics.tasksRequiringHumanAction.count}
            destinationLabel="Approvals"
            href={metrics.tasksRequiringHumanAction.href}
            semanticStatus="neutral"
          />

          {/* 7. AI Actions */}
          <DashboardMetricTile
            label="AI Actions"
            value={metrics.aiActionsCompleted.count}
            destinationLabel="J10 AI Operator"
            href={metrics.aiActionsCompleted.href}
            semanticStatus="neutral"
          />

          {/* 8. Failed Automations */}
          <DashboardMetricTile
            label="Failed Automations"
            value={metrics.failedAutomations.count}
            destinationLabel="Run Logs"
            href={metrics.failedAutomations.href}
            semanticStatus={
              metrics.failedAutomations.count > 0 ? "error" : "neutral"
            }
          />
        </div>

        {/* Section 1: Priority Work */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                Priority Work
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Items requiring operator attention or follow-up action.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-purple-300 rounded-full bg-purple-950/60 border border-purple-500/30 px-2.5 py-0.5 shadow-[0_0_12px_rgba(168,85,247,0.2)]">
              {priorityWorkItems.length}{" "}
              {priorityWorkItems.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="rounded-xl border border-purple-500/15 bg-[#12111A]/90 shadow-[0_6px_24px_rgba(0,0,0,0.45)] backdrop-blur-md overflow-hidden divide-y divide-purple-900/20">
            {priorityWorkItems.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-slate-400">
                No items require attention today. All systems are operating normally.
              </div>
            ) : (
              priorityWorkItems.slice(0, 6).map((item) => (
                <DashboardActionRow
                  key={item.id}
                  title={item.title}
                  context={item.context}
                  time={item.time}
                  statusBadge={
                    <DashboardStatusBadge
                      status={item.status.variant}
                      label={item.status.label}
                    />
                  }
                  actionLabel={item.actionLabel}
                  actionHref={item.actionHref}
                />
              ))
            )}
          </div>
        </div>

        {/* Section 2: Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                Recent Activity
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Latest customer engagements, bookings, and channel updates.
              </p>
            </div>
            <Link
              href="/dashboard/inbox"
              className="text-[11px] font-medium text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1"
            >
              <span>View all in Inbox</span>
              <ChevronRight size={12} />
            </Link>
          </div>

          <div className="rounded-xl border border-purple-500/15 bg-[#12111A]/90 shadow-[0_6px_24px_rgba(0,0,0,0.45)] backdrop-blur-md overflow-hidden divide-y divide-purple-900/20">
            {recentActivityItems.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-slate-400">
                No recent activity recorded yet for this workspace.
              </div>
            ) : (
              recentActivityItems.slice(0, 6).map((item) => (
                <DashboardActionRow
                  key={item.id}
                  title={item.title}
                  context={item.context}
                  time={item.time}
                  statusBadge={
                    <DashboardStatusBadge
                      status={item.status.variant}
                      label={item.status.label}
                    />
                  }
                  actionLabel={item.actionLabel}
                  actionHref={item.actionHref}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
