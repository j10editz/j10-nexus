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
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Contact,
  MessageSquare,
  Plug,
  RefreshCw,
  Search,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

type ActivityItem = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type ActivityResponse = {
  success?: boolean;
  activity?: ActivityItem[];
  error?: string;
};

type ActivityCategory =
  | "all"
  | "ai"
  | "workflow"
  | "crm"
  | "integration"
  | "whatsapp";

const categories: Array<{
  id: ActivityCategory;
  label: string;
}> = [
  { id: "all", label: "All activity" },
  { id: "ai", label: "AI workforce" },
  { id: "workflow", label: "Workflows" },
  { id: "crm", label: "CRM" },
  { id: "integration", label: "Integrations" },
  { id: "whatsapp", label: "WhatsApp" },
];

function getCategory(
  item: ActivityItem
): ActivityCategory {
  const searchable =
    `${item.action} ${item.entity_type}`.toLowerCase();

  if (searchable.includes("whatsapp")) {
    return "whatsapp";
  }

  if (
    searchable.includes("integration") ||
    searchable.includes("oauth") ||
    searchable.includes("webhook")
  ) {
    return "integration";
  }

  if (searchable.includes("crm")) {
    return "crm";
  }

  if (
    searchable.includes("workflow") ||
    searchable.includes("automation")
  ) {
    return "workflow";
  }

  if (
    searchable.includes("ai_") ||
    searchable.includes("employee") ||
    searchable.includes("task")
  ) {
    return "ai";
  }

  return "all";
}

function getActivityPresentation(item: ActivityItem): {
  icon: LucideIcon;
  iconClassName: string;
  iconBackground: string;
  href: string | null;
} {
  const category = getCategory(item);

  switch (category) {
    case "ai":
      return {
        icon: Bot,
        iconClassName: "text-blue-300",
        iconBackground: "bg-blue-500/10",
        href: "/dashboard/ai-employees",
      };

    case "workflow":
      return {
        icon: Workflow,
        iconClassName: "text-violet-300",
        iconBackground: "bg-violet-500/10",
        href: item.entity_id
          ? `/dashboard/automation/flow/${item.entity_id}`
          : "/dashboard/automation",
      };

    case "crm":
      return {
        icon: Contact,
        iconClassName: "text-emerald-300",
        iconBackground: "bg-emerald-500/10",
        href: "/dashboard/crm",
      };

    case "integration":
      return {
        icon: Plug,
        iconClassName: "text-cyan-300",
        iconBackground: "bg-cyan-500/10",
        href: "/dashboard/settings/integrations",
      };

    case "whatsapp":
      return {
        icon: MessageSquare,
        iconClassName: "text-green-300",
        iconBackground: "bg-green-500/10",
        href: "/dashboard/whatsapp",
      };

    default:
      return {
        icon: Zap,
        iconClassName: "text-zinc-300",
        iconBackground: "bg-white/[0.05]",
        href: null,
      };
  }
}

function formatActivityTime(createdAt: string) {
  const timestamp = new Date(createdAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown time";
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

  return new Date(createdAt).toLocaleString();
}

function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number | string;
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

export default function ActivityPage() {
  const [activity, setActivity] =
    useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] =
    useState<ActivityCategory>("all");

  const loadActivity = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch(
          "/api/dashboard/activity?limit=100",
          {
            method: "GET",
            cache: "no-store",
          }
        );
        const data =
          (await response.json()) as ActivityResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ??
              "Could not load workspace activity."
          );
        }

        setActivity(
          Array.isArray(data.activity)
            ? data.activity
            : []
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load workspace activity."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const filteredActivity = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase();

    return activity.filter((item) => {
      const matchesCategory =
        category === "all" ||
        getCategory(item) === category;
      const matchesQuery =
        !normalizedQuery ||
        `${item.title} ${item.description ?? ""} ${item.action}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [activity, category, query]);

  const todayCount = useMemo(() => {
    const today = new Date();

    return activity.filter((item) => {
      const created = new Date(item.created_at);

      return (
        created.getFullYear() === today.getFullYear() &&
        created.getMonth() === today.getMonth() &&
        created.getDate() === today.getDate()
      );
    }).length;
  }, [activity]);

  const workflowCount = activity.filter(
    (item) => getCategory(item) === "workflow"
  ).length;
  const aiCount = activity.filter(
    (item) => getCategory(item) === "ai"
  ).length;

  return (
    <div className="min-h-[calc(100dvh-72px)] bg-[#09090B] px-4 py-7 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-400">
              J10 Operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Workspace activity
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/40">
              A searchable record of real actions performed by your AI workforce, workflows, CRM, WhatsApp, and integrations.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadActivity(true)}
            disabled={refreshing}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 text-sm font-medium text-white/70 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-wait disabled:opacity-50"
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

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Loaded records"
            value={activity.length}
            icon={<Activity size={16} />}
            accent="bg-blue-500/10 text-blue-300"
          />
          <MetricCard
            label="Actions today"
            value={todayCount}
            icon={<Clock3 size={16} />}
            accent="bg-cyan-500/10 text-cyan-300"
          />
          <MetricCard
            label="Workflow actions"
            value={workflowCount}
            icon={<Workflow size={16} />}
            accent="bg-violet-500/10 text-violet-300"
          />
          <MetricCard
            label="AI workforce actions"
            value={aiCount}
            icon={<Bot size={16} />}
            accent="bg-emerald-500/10 text-emerald-300"
          />
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111216]">
          <div className="border-b border-white/[0.06] p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full xl:max-w-md">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
                />
                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Search titles, descriptions, and actions..."
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-[#0B0C0F] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-blue-500/35"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 xl:pb-0">
                {categories.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition ${
                      category === item.id
                        ? "bg-blue-500/15 text-blue-300"
                        : "bg-white/[0.025] text-white/35 hover:bg-white/[0.05] hover:text-white/70"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 p-4 sm:p-5">
              {[1, 2, 3, 4, 5].map((item) => (
                <div
                  key={item}
                  className="h-[86px] animate-pulse rounded-xl bg-white/[0.025]"
                />
              ))}
            </div>
          ) : error ? (
            <div className="px-6 py-16 text-center">
              <Zap
                size={24}
                className="mx-auto text-red-300"
              />
              <h2 className="mt-4 font-semibold">
                Activity could not load
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-white/40">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void loadActivity()}
                className="mt-5 rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/[0.1]"
              >
                Try again
              </button>
            </div>
          ) : filteredActivity.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Search
                size={24}
                className="mx-auto text-white/25"
              />
              <h2 className="mt-4 font-semibold">
                No matching activity
              </h2>
              <p className="mt-2 text-sm text-white/35">
                Change the filter or run a J10 operation to create a new record.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {filteredActivity.map((item) => {
                const presentation =
                  getActivityPresentation(item);
                const Icon = presentation.icon;

                const content = (
                  <>
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
                      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                        <p className="truncate text-sm font-medium text-white/85">
                          {item.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-white/25">
                          {formatActivityTime(
                            item.created_at
                          )}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/35">
                        {item.description ??
                          item.action
                            .replaceAll("_", " ")
                            .replace(/\b\w/g, (letter) =>
                              letter.toUpperCase()
                            )}
                      </p>
                    </div>

                    {presentation.href && (
                      <ChevronRight
                        size={16}
                        className="shrink-0 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-blue-300"
                      />
                    )}
                  </>
                );

                if (presentation.href) {
                  return (
                    <Link
                      key={item.id}
                      href={presentation.href}
                      className="group flex items-center gap-3 px-4 py-4 transition hover:bg-white/[0.025] sm:px-5"
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-4 sm:px-5"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !error && (
            <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3 text-xs text-white/30 sm:px-5">
              <span>
                Showing {filteredActivity.length} of {activity.length} loaded records
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300/70">
                <CheckCircle2 size={13} />
                Live workspace data
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
