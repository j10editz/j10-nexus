"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  PlayCircle,
  RefreshCw,
  ShieldQuestion,
  Workflow,
} from "lucide-react";

type NotificationKind =
  | "approval"
  | "failure"
  | "success"
  | "running"
  | "queued"
  | "information";

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  status: string;
  automationId: string;
  runId: string;
  executionMode: string;
  occurredAt: string | null;
  needsAttention: boolean;
  href: string;
};

type NotificationsResponse = {
  success?: boolean;
  summary?: {
    total: number;
    attention: number;
    approvals: number;
    failed: number;
    completed: number;
    active: number;
  };
  notifications?: NotificationItem[];
  error?: string;
};

type NotificationFilter =
  | "all"
  | "attention"
  | "approval"
  | "failure"
  | "success";

const READ_STORAGE_KEY =
  "j10-notifications-read-v1";

const filters: Array<{
  id: NotificationFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "approval", label: "Approvals" },
  { id: "failure", label: "Failures" },
  { id: "success", label: "Completed" },
];

function formatNotificationTime(
  occurredAt: string | null
) {
  if (!occurredAt) {
    return "Time unavailable";
  }

  const timestamp = new Date(occurredAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Time unavailable";
  }

  const difference = Math.max(
    0,
    Date.now() - timestamp
  );
  const minutes = Math.floor(
    difference / 60_000
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(occurredAt).toLocaleString();
}

function getNotificationPresentation(
  kind: NotificationKind
) {
  switch (kind) {
    case "approval":
      return {
        icon: ShieldQuestion,
        iconClassName: "text-amber-300",
        iconBackground: "bg-amber-500/10",
        label: "Approval",
        badgeClassName:
          "border-amber-400/15 bg-amber-400/[0.07] text-amber-300",
      };

    case "failure":
      return {
        icon: AlertTriangle,
        iconClassName: "text-red-300",
        iconBackground: "bg-red-500/10",
        label: "Failed",
        badgeClassName:
          "border-red-400/15 bg-red-400/[0.07] text-red-300",
      };

    case "success":
      return {
        icon: CheckCircle2,
        iconClassName: "text-emerald-300",
        iconBackground: "bg-emerald-500/10",
        label: "Completed",
        badgeClassName:
          "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300",
      };

    case "running":
      return {
        icon: PlayCircle,
        iconClassName: "text-blue-300",
        iconBackground: "bg-blue-500/10",
        label: "Running",
        badgeClassName:
          "border-blue-400/15 bg-blue-400/[0.07] text-blue-300",
      };

    case "queued":
      return {
        icon: Clock3,
        iconClassName: "text-cyan-300",
        iconBackground: "bg-cyan-500/10",
        label: "Queued",
        badgeClassName:
          "border-cyan-400/15 bg-cyan-400/[0.07] text-cyan-300",
      };

    default:
      return {
        icon: Bell,
        iconClassName: "text-zinc-300",
        iconBackground: "bg-white/[0.05]",
        label: "Update",
        badgeClassName:
          "border-white/[0.08] bg-white/[0.04] text-white/50",
      };
  }
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/35">
          {label}
        </span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    attention: 0,
    approvals: 0,
    failed: 0,
    completed: 0,
    active: 0,
  });
  const [readIds, setReadIds] = useState<Set<string>>(
    new Set()
  );
  const [filter, setFilter] =
    useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        READ_STORAGE_KEY
      );
      const parsed = saved
        ? (JSON.parse(saved) as unknown)
        : [];

      if (Array.isArray(parsed)) {
        setReadIds(
          new Set(
            parsed.filter(
              (value): value is string =>
                typeof value === "string"
            )
          )
        );
      }
    } catch {
      setReadIds(new Set());
    }
  }, []);

  const loadNotifications = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch(
          "/api/dashboard/notifications?limit=100",
          {
            method: "GET",
            cache: "no-store",
          }
        );
        const data =
          (await response.json()) as
            NotificationsResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ??
              "Could not load notifications."
          );
        }

        setNotifications(
          Array.isArray(data.notifications)
            ? data.notifications
            : []
        );

        if (data.summary) {
          setSummary(data.summary);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load notifications."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  function saveReadIds(next: Set<string>) {
    setReadIds(next);

    try {
      window.localStorage.setItem(
        READ_STORAGE_KEY,
        JSON.stringify(Array.from(next))
      );
    } catch {
      // Reading still works when browser storage is unavailable.
    }
  }

  function markRead(id: string) {
    if (readIds.has(id)) {
      return;
    }

    const next = new Set(readIds);
    next.add(id);
    saveReadIds(next);
  }

  function markAllRead() {
    saveReadIds(
      new Set(
        notifications.map(
          (notification) => notification.id
        )
      )
    );
  }

  const unreadCount = notifications.filter(
    (notification) => !readIds.has(notification.id)
  ).length;

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (filter === "all") {
          return true;
        }

        if (filter === "attention") {
          return notification.needsAttention;
        }

        return notification.kind === filter;
      }),
    [filter, notifications]
  );

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-4 py-7 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-400">
              J10 Operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Notifications
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/40">
              Real workflow approvals, failures, active executions, and completed operations from the J10 runtime.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={markAllRead}
              disabled={
                notifications.length === 0 ||
                unreadCount === 0
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 text-sm font-medium text-white/70 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Check size={16} />
              Mark all read
            </button>
            <button
              type="button"
              onClick={() =>
                void loadNotifications(true)
              }
              disabled={refreshing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Unread on this device"
            value={unreadCount}
            icon={<Bell size={16} />}
            accent="bg-blue-500/10 text-blue-300"
          />
          <SummaryCard
            label="Needs attention"
            value={summary.attention}
            icon={<AlertTriangle size={16} />}
            accent="bg-red-500/10 text-red-300"
          />
          <SummaryCard
            label="Awaiting approval"
            value={summary.approvals}
            icon={<ShieldQuestion size={16} />}
            accent="bg-amber-500/10 text-amber-300"
          />
          <SummaryCard
            label="Completed"
            value={summary.completed}
            icon={<CheckCircle2 size={16} />}
            accent="bg-emerald-500/10 text-emerald-300"
          />
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111216]">
          <div className="flex gap-2 overflow-x-auto border-b border-white/[0.06] p-4 sm:px-5">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition ${
                  filter === item.id
                    ? "bg-blue-500/15 text-blue-300"
                    : "bg-white/[0.025] text-white/35 hover:bg-white/[0.05] hover:text-white/70"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2 p-4 sm:p-5">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="h-[104px] animate-pulse rounded-xl bg-white/[0.025]"
                />
              ))}
            </div>
          ) : error ? (
            <div className="px-6 py-16 text-center">
              <AlertTriangle
                size={25}
                className="mx-auto text-red-300"
              />
              <h2 className="mt-4 font-semibold">
                Notifications could not load
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-white/40">
                {error}
              </p>
              <button
                type="button"
                onClick={() =>
                  void loadNotifications()
                }
                className="mt-5 rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/[0.1]"
              >
                Try again
              </button>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Bell
                size={25}
                className="mx-auto text-white/25"
              />
              <h2 className="mt-4 font-semibold">
                No notifications in this view
              </h2>
              <p className="mt-2 text-sm text-white/35">
                New workflow events will appear automatically after J10 runs.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {filteredNotifications.map(
                (notification) => {
                  const presentation =
                    getNotificationPresentation(
                      notification.kind
                    );
                  const Icon = presentation.icon;
                  const unread = !readIds.has(
                    notification.id
                  );

                  return (
                    <Link
                      key={notification.id}
                      href={notification.href}
                      onClick={() =>
                        markRead(notification.id)
                      }
                      className="group relative flex items-start gap-3 px-4 py-4 transition hover:bg-white/[0.025] sm:px-5"
                    >
                      {unread && (
                        <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                      )}

                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${presentation.iconBackground}`}
                      >
                        <Icon
                          size={18}
                          className={
                            presentation.iconClassName
                          }
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={`text-sm ${
                              unread
                                ? "font-semibold text-white"
                                : "font-medium text-white/65"
                            }`}
                          >
                            {notification.title}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${presentation.badgeClassName}`}
                          >
                            {presentation.label}
                          </span>
                          <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/30">
                            {notification.executionMode}
                          </span>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/35">
                          {notification.message}
                        </p>
                        <p className="mt-2 text-[11px] text-white/25">
                          {formatNotificationTime(
                            notification.occurredAt
                          )}
                        </p>
                      </div>

                      <ChevronRight
                        size={16}
                        className="mt-3 shrink-0 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-blue-300"
                      />
                    </Link>
                  );
                }
              )}
            </div>
          )}

          {!loading && !error && (
            <div className="flex flex-col gap-2 border-t border-white/[0.06] px-4 py-3 text-xs text-white/30 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <span>
                Showing {filteredNotifications.length} of {summary.total} recent workflow events
              </span>
              <Link
                href="/dashboard/automation"
                className="inline-flex items-center gap-1.5 text-blue-300/75 transition hover:text-blue-300"
              >
                <Workflow size={13} />
                Open automation operations
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
