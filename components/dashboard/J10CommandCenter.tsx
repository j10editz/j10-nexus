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
  userName = "",
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
        actionLabel: "Open J10 Pay",
        actionHref: data.metrics.pendingPayments.href,
      });
    }

    return items.sort((a, b) => a.priority - b.priority);
  }, [data]);

  // Build the factual "Recent Activity" stream
  const recentActivityItems = useMemo(() => {
    if (!data) return [];

    const activities: Array<{
      id: string;
      title: string;
      context: string;
      time?: string;
      status: {
        label: string;
        variant: "connected" | "available" | "neutral" | "warning";
      };
      actionLabel: string;
      actionHref: string;
    }> = [];

    // Recent lead activity
    if (data.recentLeads && data.recentLeads.length > 0) {
      data.recentLeads.slice(0, 3).forEach((lead) => {
        activities.push({
          id: `act-lead-${lead.id}`,
          title: `New contact recorded: ${lead.name}`,
          context: `${lead.source.toUpperCase()} intake - Stage: ${lead.status}`,
          time: lead.createdAt
            ? new Date(lead.createdAt).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })
            : undefined,
          status: { label: "Lead", variant: "available" },
          actionLabel: "View Lead",
          actionHref: `/dashboard/crm?contactId=${lead.id}`,
        });
      });
    }

    // Recent conversation activity
    if (data.recentConversations && data.recentConversations.length > 0) {
      data.recentConversations.slice(0, 3).forEach((conv) => {
        activities.push({
          id: `act-conv-${conv.id}`,
          title: `Message from ${conv.contactName}`,
          context: `${conv.channel.toUpperCase()}: ${conv.lastMessage || "Conversation active"}`,
          time: conv.timestamp
            ? new Date(conv.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : undefined,
          status: { label: conv.isUnread ? "Unread" : "Received", variant: conv.isUnread ? "warning" : "connected" },
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
      <div className="p-4 sm:p-6 text-[#17151F]">
        <div className="mx-auto max-w-[1360px] space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-[#E2DEEA]">
            <div className="space-y-1">
              <div className="h-6 w-44 animate-pulse rounded bg-[#F3F1F8]" />
              <div className="h-3.5 w-60 animate-pulse rounded bg-[#F3F1F8]" />
            </div>
            <div className="h-7 w-20 animate-pulse rounded bg-[#F3F1F8]" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] shadow-sm"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 text-[#17151F]">
        <div className="mx-auto max-w-[1360px]">
          <div className="rounded-xl border border-[#FECDD3] bg-[#FFE4E8] p-5 text-center shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <h2 className="text-sm font-semibold text-[#E11D48]">
              Unable to load workspace data
            </h2>
            <p className="mt-1 text-xs text-[#6F687A]">
              {error || "Could not retrieve live workspace metrics."}
            </p>
            <button
              type="button"
              onClick={() => void fetchData(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#FFFFFF] border border-[#E2DEEA] px-3 py-1.5 text-xs font-medium text-[#17151F] hover:bg-[#F3F1F8] transition-colors shadow-sm"
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
  const firstName = userName.trim().split(/\s+/)[0];

  return (
    <div className="px-5 py-7 text-[var(--j10-dashboard-text)] sm:px-7 xl:px-8">
      <div className="w-full space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.03em] text-[var(--j10-dashboard-text)] sm:text-4xl">
              {firstName ? `Good morning, ${firstName}` : "J10 Command Center"}
            </h1>
            <p className="mt-1 text-sm text-[var(--j10-dashboard-text-secondary)]">
              {data.isEmptyWorkspace
                ? `Connect ${initialWorkspaceName} to start receiving verified activity.`
                : "Here is what needs your attention today."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden sm:inline text-[11px] text-[#918A9D]">
                Updated {lastUpdated}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchData(true)}
              disabled={refreshing}
              aria-label="Refresh workspace metrics"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] text-[#6F687A] transition-colors hover:bg-[#F3F1F8] hover:text-[#17151F] disabled:opacity-50 shadow-sm"
              title="Refresh metrics"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin text-[#6347E8]" : ""}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <DashboardMetricTile
            label="New Leads"
            value={metrics.newLeads.count}
            destinationLabel="J10 Lead Center"
            href={metrics.newLeads.href}
            semanticStatus="neutral"
          />

          <DashboardMetricTile
            label="Unanswered"
            value={metrics.unansweredConversations.count}
            destinationLabel="J10 Inbox"
            href={metrics.unansweredConversations.href}
            semanticStatus={
              metrics.unansweredConversations.count > 0 ? "warning" : "neutral"
            }
          />

          <DashboardMetricTile
            label="Booked"
            value={metrics.upcomingBookings.count}
            destinationLabel="J10 Booking"
            href={metrics.upcomingBookings.href}
            semanticStatus="neutral"
          />

          <DashboardMetricTile
            label="Pending Payments"
            value={`$${metrics.pendingPayments.amount.toLocaleString()}`}
            destinationLabel="J10 Pay"
            href={metrics.pendingPayments.href}
            semanticStatus="neutral"
          />

        </div>

        <section className="rounded-2xl border border-[var(--j10-dashboard-gold)]/55 bg-[var(--j10-dashboard-surface)] px-5 py-4 shadow-[0_0_34px_rgba(216,181,101,0.08)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8B565]">
                Revenue workflow now
              </h2>
              <p className="mt-1 text-xs text-[var(--j10-dashboard-text-secondary)]">
                Live workspace counts, not conversion estimates.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ["New leads", metrics.newLeads.count],
              ["Awaiting reply", metrics.unansweredConversations.count],
              ["Upcoming bookings", metrics.upcomingBookings.count],
              ["Pending invoices", metrics.pendingPayments.count],
            ].map(([label, value], index) => (
              <div key={String(label)} className="relative rounded-xl border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-elevated)] px-4 py-3.5">
                <div className="text-2xl font-black text-[var(--j10-dashboard-text)]">{value}</div>
                <div className="mt-1 text-xs text-[var(--j10-dashboard-text-secondary)]">{label}</div>
                {index < 3 ? <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-[#D8B565]" size={14} /> : null}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--j10-dashboard-border)] pt-4 text-xs text-[var(--j10-dashboard-text-secondary)]">
            <Link href={metrics.aiActionsCompleted.href} className="font-medium text-[#6347E8]">J10 AI Operator</Link>
            <span>{metrics.aiActionsCompleted.count} completed AI actions</span>
            <span>{metrics.tasksRequiringHumanAction.count} human approvals</span>
            <span className={metrics.failedAutomations.count > 0 ? "text-[#E11D48]" : ""}>{metrics.failedAutomations.count} failed automations</span>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
          <section className="min-w-0 rounded-2xl border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] shadow-[var(--j10-dashboard-shadow)]">
            <div className="flex items-center justify-between border-b border-[var(--j10-dashboard-border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--j10-dashboard-text)]">Needs your attention</h2>
                <p className="text-xs text-[var(--j10-dashboard-text-secondary)]">Ordered by urgency and customer impact.</p>
              </div>
              <span className="rounded-md border border-[#E2DEEA] bg-[#F3F1F8] px-2 py-0.5 text-[11px] text-[#6F687A]">
                {priorityWorkItems.length}
              </span>
            </div>
            <div className="divide-y divide-[var(--j10-dashboard-border)] overflow-hidden">
              {priorityWorkItems.length === 0 ? (
                <DashboardEmptyState
                  message="Nothing needs attention"
                  subtext="J10 has not found unanswered conversations, failed automations, follow-up leads, or pending invoices in this workspace."
                />
              ) : priorityWorkItems.slice(0, 7).map((item) => (
                <DashboardActionRow
                  key={item.id}
                  title={item.title}
                  context={item.context}
                  time={item.time}
                  statusBadge={<DashboardStatusBadge status={item.status.variant} label={item.status.label} />}
                  actionLabel={item.actionLabel}
                  actionHref={item.actionHref}
                />
              ))}
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] shadow-[var(--j10-dashboard-shadow)]">
              <div className="flex items-center justify-between border-b border-[var(--j10-dashboard-border)] px-5 py-4">
                <h2 className="text-lg font-bold text-[var(--j10-dashboard-text)]">Today</h2>
                <Link href="/dashboard/booking" className="text-xs font-semibold text-[var(--j10-dashboard-accent-text)]">View calendar</Link>
              </div>
              <div className="divide-y divide-[#E2DEEA]">
                {data.upcomingBookingsList.length === 0 ? (
                  <p className="px-5 py-7 text-sm text-[var(--j10-dashboard-text-secondary)]">No upcoming bookings are recorded.</p>
                ) : data.upcomingBookingsList.slice(0, 4).map((booking) => (
                  <Link key={booking.id} href={`/dashboard/booking?id=${booking.id}`} className="block px-5 py-4 transition hover:bg-[var(--j10-dashboard-hover)]">
                    <div className="text-sm font-semibold text-[var(--j10-dashboard-text)]">{booking.clientName}</div>
                    <div className="mt-1 text-xs text-[var(--j10-dashboard-text-secondary)]">{new Date(booking.scheduledStart).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] p-5 shadow-[var(--j10-dashboard-shadow)]">
              <h2 className="text-lg font-bold text-[var(--j10-dashboard-text)]">Money moving</h2>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-3xl font-black text-[var(--j10-dashboard-gold)]">${metrics.pendingPayments.amount.toLocaleString()}</div>
                  <p className="mt-1 text-xs text-[var(--j10-dashboard-text-secondary)]">Across {metrics.pendingPayments.count} pending invoice{metrics.pendingPayments.count === 1 ? "" : "s"}</p>
                </div>
                <Link href="/dashboard/pay" className="text-xs font-semibold text-[var(--j10-dashboard-accent-text)]">Open J10 Pay</Link>
              </div>
            </section>
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--j10-dashboard-border)] bg-[var(--j10-dashboard-surface)] shadow-[var(--j10-dashboard-shadow)]">
          <div className="flex items-center justify-between border-b border-[var(--j10-dashboard-border)] px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-[var(--j10-dashboard-text)]">Recent activity</h2>
              <p className="text-xs text-[var(--j10-dashboard-text-secondary)]">Verified workspace events only.</p>
            </div>
            <Link href="/dashboard/inbox" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--j10-dashboard-accent-text)]">View inbox <ChevronRight size={13} /></Link>
          </div>
          <div className="divide-y divide-[var(--j10-dashboard-border)]">
            {recentActivityItems.length === 0 ? (
              <p className="px-5 py-7 text-sm text-[var(--j10-dashboard-text-secondary)]">No recent activity has been recorded for this workspace.</p>
            ) : recentActivityItems.slice(0, 6).map((item) => (
              <DashboardActionRow key={item.id} title={item.title} context={item.context} time={item.time} statusBadge={<DashboardStatusBadge status={item.status.variant} label={item.status.label} />} actionLabel={item.actionLabel} actionHref={item.actionHref} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
