"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useMemo } from "react";
import { RefreshCw, ChevronRight } from "lucide-react";
import type { CommandCenterData } from "@/app/api/dashboard/command-center/route";
import {
  DashboardMetricTile,
  DashboardStatusBadge,
  DashboardActionRow,
  DashboardEmptyState,
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

  // Build the prioritized operational work list
  const operationalPriorities = useMemo(() => {
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
        actionLabel: "Open J10 Pay",
        actionHref: data.metrics.pendingPayments.href,
      });
    }

    // Sort strictly by priority
    return items.sort((a, b) => a.priority - b.priority);
  }, [data]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 text-[#F5F7FA]">
        <div className="mx-auto max-w-[1360px] space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-[#242A35]">
            <div className="space-y-1">
              <div className="h-6 w-44 animate-pulse rounded bg-[#151922]" />
              <div className="h-3.5 w-60 animate-pulse rounded bg-[#151922]" />
            </div>
            <div className="h-7 w-20 animate-pulse rounded bg-[#151922]" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-lg border border-[#242A35] bg-[#101319]"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 text-[#F5F7FA]">
        <div className="mx-auto max-w-[1360px]">
          <div className="rounded-lg border border-rose-500/20 bg-[#101319] p-5 text-center">
            <h2 className="text-sm font-semibold text-[#F5F7FA]">
              Unable to load workspace data
            </h2>
            <p className="mt-1 text-xs text-[#98A2B3]">
              {error || "Could not retrieve live workspace metrics."}
            </p>
            <button
              type="button"
              onClick={() => void fetchData(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#151922] border border-[#242A35] px-3 py-1.5 text-xs font-medium text-[#F5F7FA] hover:bg-[#242A35] transition-colors"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { metrics, upcomingBookingsList, channelOverview } = data;

  return (
    <div className="p-4 sm:p-6 text-[#F5F7FA]">
      <div className="mx-auto max-w-[1360px] space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#242A35]">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7FA]">
              J10 Command Center
            </h1>
            <p className="mt-0.5 text-xs text-[#98A2B3]">
              What needs your attention today.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden sm:inline text-[11px] text-[#667085]">
                Updated {lastUpdated}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchData(true)}
              disabled={refreshing}
              aria-label="Refresh workspace metrics"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[#242A35] bg-[#101319] text-[#98A2B3] transition-colors hover:bg-[#151922] hover:text-[#F5F7FA] disabled:opacity-50"
              title="Refresh metrics"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin text-[#4F7CFF]" : ""}
              />
            </button>
          </div>
        </div>

        {/* 8 Compact Neutral Metric Tiles */}
        {/* Desktop: 4 columns, 2 rows (88-100px) */}
        {/* Mobile: 2 columns, 4 rows (max 88-96px) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* 1. New Leads */}
          <DashboardMetricTile
            label="New Leads"
            value={metrics.newLeads.count}
            destinationLabel="J10 Lead Center"
            href={metrics.newLeads.href}
            semanticStatus="neutral"
          />

          {/* 2. Needs Attention (Warning emphasis only when count > 0) */}
          <DashboardMetricTile
            label="Needs Attention"
            value={metrics.leadsNeedingAttention.count}
            destinationLabel="Qualified Leads"
            href={metrics.leadsNeedingAttention.href}
            semanticStatus={
              metrics.leadsNeedingAttention.count > 0 ? "warning" : "neutral"
            }
          />

          {/* 3. Unanswered Conversations */}
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
            semanticStatus={
              metrics.tasksRequiringHumanAction.count > 0 ? "warning" : "neutral"
            }
          />

          {/* 7. AI Actions */}
          <DashboardMetricTile
            label="AI Actions"
            value={metrics.aiActionsCompleted.count}
            destinationLabel="J10 AI Operator"
            href={metrics.aiActionsCompleted.href}
            semanticStatus="neutral"
          />

          {/* 8. Failed Automations (Error emphasis only when count > 0) */}
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

        {/* Operational Priorities: Needs your attention */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#98A2B3]">
              Needs your attention
            </h2>
            <span className="text-[11px] text-[#667085]">
              {operationalPriorities.length}{" "}
              {operationalPriorities.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="rounded-lg border border-[#242A35] bg-[#101319] overflow-hidden">
            {operationalPriorities.length === 0 ? (
              <div className="px-4 py-3 text-center text-xs text-[#667085]">
                No items require attention today. All systems are operating normally.
              </div>
            ) : (
              operationalPriorities.slice(0, 6).map((item) => (
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

        {/* Secondary Information: At most two compact panels below priority list */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Panel 1: Recent Activity & Channels */}
          <div className="rounded-lg border border-[#242A35] bg-[#101319] p-4">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#242A35]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#98A2B3]">
                Channel Activity
              </h3>
              <Link
                href="/dashboard/connections"
                className="text-[11px] text-[#98A2B3] hover:text-[#4F7CFF] transition-colors inline-flex items-center gap-1"
              >
                <span>Channels</span>
                <ChevronRight size={12} />
              </Link>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-[#98A2B3]">WhatsApp</span>
                <DashboardStatusBadge
                  status={channelOverview?.find((c) => c.channel === "whatsapp")?.isOperational ? "connected" : "available"}
                  label={channelOverview?.find((c) => c.channel === "whatsapp")?.isOperational ? "Connected" : "Available"}
                />
              </div>

              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-[#98A2B3]">Telegram</span>
                <DashboardStatusBadge
                  status={channelOverview?.find((c) => c.channel === "telegram")?.isOperational ? "connected" : "available"}
                  label={channelOverview?.find((c) => c.channel === "telegram")?.isOperational ? "Connected" : "Available"}
                />
              </div>

              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-[#98A2B3]">Website Forms</span>
                <DashboardStatusBadge
                  status="connected"
                  label="Active"
                />
              </div>

              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-[#667085]">Email / Gmail</span>
                <DashboardStatusBadge
                  status="coming_soon"
                  label="Coming soon"
                />
              </div>

              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-[#667085]">Google Calendar</span>
                <DashboardStatusBadge
                  status="coming_soon"
                  label="Coming soon"
                />
              </div>
            </div>
          </div>

          {/* Panel 2: Upcoming Bookings & Revenue */}
          <div className="rounded-lg border border-[#242A35] bg-[#101319] p-4">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#242A35]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#98A2B3]">
                Upcoming Bookings
              </h3>
              <Link
                href="/dashboard/booking"
                className="text-[11px] text-[#98A2B3] hover:text-[#4F7CFF] transition-colors inline-flex items-center gap-1"
              >
                <span>Calendar</span>
                <ChevronRight size={12} />
              </Link>
            </div>

            {upcomingBookingsList && upcomingBookingsList.length > 0 ? (
              <div className="divide-y divide-[#242A35]">
                {upcomingBookingsList.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-[#F5F7FA]">{b.clientName}</p>
                      <p className="text-[11px] text-[#667085]">{b.status || "Confirmed"}</p>
                    </div>
                    <span className="text-[11px] text-[#98A2B3]">
                      {b.scheduledStart
                        ? new Date(b.scheduledStart).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })
                        : "Scheduled"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-[#667085]">
                No upcoming bookings scheduled.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
