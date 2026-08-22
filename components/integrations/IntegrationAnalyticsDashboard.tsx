"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  Plug,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

import type {
  IntegrationAnalyticsApiResponse,
  IntegrationAnalyticsBreakdown,
  IntegrationAnalyticsPeriod,
  IntegrationAnalyticsSnapshot,
  IntegrationProviderAnalytics,
} from "../../types/integration-analytics";

const PERIODS: readonly {
  value: IntegrationAnalyticsPeriod;
  label: string;
}[] = [
  {
    value: 7,
    label: "Last 7 days",
  },
  {
    value: 30,
    label: "Last 30 days",
  },
  {
    value: 90,
    label: "Last 90 days",
  },
];

function number(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
  ).format(
    value,
  );
}

function dateTime(
  value: string | null,
) {
  if (!value) {
    return "No activity yet";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(
    new Date(
      value,
    ),
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0c0e13] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </p>

          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>

        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${accent}`}
        >
          {icon}
        </span>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        {detail}
      </p>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from(
          {
            length: 6,
          },
          (
            _,
            index,
          ) => (
            <div
              key={
                index
              }
              className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.025]"
            />
          ),
        )}
      </div>

      <div className="h-80 animate-pulse rounded-2xl border border-white/10 bg-white/[0.025]" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-300">
        <BarChart3
          size={
            28
          }
        />
      </span>

      <h2 className="mt-5 text-xl font-semibold text-white">
        Analytics is ready
      </h2>

      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
        Activity will appear as J10 receives webhooks, executes
        actions, processes retries, blocks unsafe requests, and
        suppresses duplicates.
      </p>
    </div>
  );
}

function ActivityTrend({
  analytics,
}: {
  analytics: IntegrationAnalyticsSnapshot;
}) {
  const maximum =
    Math.max(
      ...analytics.trend.map(
        (
          point,
        ) =>
          point.total,
      ),
      1,
    );

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0c0e13] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-400">
            Operations timeline
          </p>

          <h2 className="mt-2 text-xl font-semibold text-white">
            Integration activity trend
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Observable connector events across the selected period.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-500" />
            Total
          </span>

          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Succeeded
          </span>

          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            Failed
          </span>
        </div>
      </div>

      <div className="mt-8 flex h-56 items-end gap-1.5 overflow-hidden sm:gap-2">
        {analytics.trend.map(
          (
            point,
          ) => {
            const height =
              point.total >
              0
                ? Math.max(
                    8,
                    (
                      point.total /
                      maximum
                    ) *
                      100,
                  )
                : 3;

            const success =
              point.total >
              0
                ? (
                    point.succeeded /
                    point.total
                  ) *
                  100
                : 0;

            const failure =
              point.total >
              0
                ? (
                    point.failed /
                    point.total
                  ) *
                  100
                : 0;

            return (
              <div
                key={
                  point.bucketStart
                }
                title={`${point.label}: ${point.total} total, ${point.succeeded} succeeded, ${point.failed} failed, ${point.blocked} blocked, ${point.retries} retries`}
                className="flex h-full min-w-0 flex-1 items-end"
              >
                <div
                  className="relative w-full overflow-hidden rounded-t-md border border-violet-400/20 bg-violet-500/35 transition hover:bg-violet-500/55"
                  style={{
                    height:
                      `${height}%`,
                  }}
                >
                  <div
                    className="absolute inset-x-0 bottom-0 bg-emerald-400/70"
                    style={{
                      height:
                        `${success}%`,
                    }}
                  />

                  <div
                    className="absolute inset-x-0 top-0 bg-red-400/70"
                    style={{
                      height:
                        `${failure}%`,
                    }}
                  />
                </div>
              </div>
            );
          },
        )}
      </div>

      <div className="mt-3 flex justify-between text-[10px] text-slate-600">
        <span>
          {
            analytics
              .trend
              .at(
                0,
              )
              ?.label
          }
        </span>

        <span>
          {
            analytics
              .trend
              .at(
                -1,
              )
              ?.label
          }
        </span>
      </div>
    </section>
  );
}

function BreakdownPanel({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: readonly IntegrationAnalyticsBreakdown[];
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0c0e13] p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">
        {title}
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        {description}
      </p>

      <div className="mt-6 space-y-5">
        {
          items.length ===
          0
            ? (
                <p className="text-sm text-slate-600">
                  No data for this period.
                </p>
              )
            : items.map(
                (
                  item,
                ) => (
                  <div
                    key={
                      item.id
                    }
                  >
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-slate-300">
                        {
                          item.label
                        }
                      </span>

                      <span className="font-medium text-white">
                        {
                          number(
                            item.count,
                          )
                        }

                        <span className="ml-2 text-xs font-normal text-slate-600">
                          {
                            item.percentage
                          }
                          %
                        </span>
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
                        style={{
                          width:
                            `${Math.max(
                              item.percentage,
                              2,
                            )}%`,
                        }}
                      />
                    </div>
                  </div>
                ),
              )
        }
      </div>
    </section>
  );
}

function ProviderRow({
  provider,
}: {
  provider: IntegrationProviderAnalytics;
}) {
  const rateStyle =
    provider.successRate >=
    90
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : provider.successRate >=
          70
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : "border-red-500/20 bg-red-500/10 text-red-300";

  return (
    <tr className="border-t border-white/[0.06] text-sm">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300">
            <Plug
              size={
                16
              }
            />
          </span>

          <div>
            <p className="font-medium text-white">
              {
                provider.providerName
              }
            </p>

            <p className="mt-0.5 text-xs text-slate-600">
              {
                provider.providerId
              }
            </p>
          </div>
        </div>
      </td>

      <td className="px-5 py-4 text-right text-slate-300">
        {
          number(
            provider.operations,
          )
        }
      </td>

      <td className="px-5 py-4 text-right">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${rateStyle}`}
        >
          {
            provider.successRate
          }
          %
        </span>
      </td>

      <td className="px-5 py-4 text-right text-emerald-300">
        {
          number(
            provider.succeeded,
          )
        }
      </td>

      <td className="px-5 py-4 text-right text-red-300">
        {
          number(
            provider.failed,
          )
        }
      </td>

      <td className="px-5 py-4 text-right text-amber-300">
        {
          number(
            provider.blocked,
          )
        }
      </td>

      <td className="px-5 py-4 text-right text-slate-500">
        {
          dateTime(
            provider.lastActivityAt,
          )
        }
      </td>
    </tr>
  );
}

function ProviderTable({
  providers,
}: {
  providers: readonly IntegrationProviderAnalytics[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e13]">
      <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Provider performance
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Reliability and activity across connected services.
          </p>
        </div>

        <span className="text-xs text-slate-600">
          {
            providers.length
          }
          {" "}
          active in period
        </span>
      </div>

      {
        providers.length ===
        0
          ? (
              <div className="border-t border-white/[0.06] px-6 py-12 text-center text-sm text-slate-600">
                Provider performance will appear after activity is recorded.
              </div>
            )
          : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.16em] text-slate-600">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold">
                        Provider
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        Operations
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        Success rate
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        Succeeded
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        Failed
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        Blocked
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        Last activity
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {
                      providers.map(
                        (
                          provider,
                        ) => (
                          <ProviderRow
                            key={
                              provider.providerId
                            }
                            provider={
                              provider
                            }
                          />
                        ),
                      )
                    }
                  </tbody>
                </table>
              </div>
            )
      }
    </section>
  );
}

export default function IntegrationAnalyticsDashboard() {
  const [
    period,
    setPeriod,
  ] =
    useState<IntegrationAnalyticsPeriod>(
      30,
    );

  const [
    analytics,
    setAnalytics,
  ] =
    useState<IntegrationAnalyticsSnapshot | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const loadAnalytics =
    useCallback(
      async (
        nextPeriod: IntegrationAnalyticsPeriod,
        background =
          false,
      ) => {
        if (
          background
        ) {
          setRefreshing(
            true,
          );
        }
        else {
          setLoading(
            true,
          );
        }

        setError(
          null,
        );

        try {
          const response =
            await fetch(
              `/api/integrations/analytics?days=${nextPeriod}`,
              {
                cache:
                  "no-store",
              },
            );

          const result =
            await response.json() as IntegrationAnalyticsApiResponse;

          if (
            !response.ok ||
            !result.success ||
            !result.analytics
          ) {
            throw new Error(
              result.error ??
                "J10 could not load integration analytics.",
            );
          }

          setAnalytics(
            result.analytics,
          );
        }
        catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "J10 could not load integration analytics.",
          );
        }
        finally {
          setLoading(
            false,
          );

          setRefreshing(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void loadAnalytics(
        period,
      );
    },
    [
      loadAnalytics,
      period,
    ],
  );

  const generatedLabel =
    useMemo(
      () =>
        analytics
          ? dateTime(
              analytics.generatedAt,
            )
          : "Waiting for data",
      [
        analytics,
      ],
    );

  return (
    <main className="min-h-screen bg-[#07080b] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.22),transparent_42%),linear-gradient(120deg,#0d1018,#0b0d13_55%,#160d24)] px-6 py-8 sm:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-400">
                <TrendingUp
                  size={
                    15
                  }
                />
                J10 NEXUS Intelligence
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Integration Analytics
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
                Live operational intelligence for connectors, actions,
                webhooks, retries, duplicates, and security guardrails.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={
                  period
                }
                onChange={(
                  event,
                ) => {
                  const value =
                    Number(
                      event
                        .target
                        .value,
                    );

                  if (
                    value ===
                      7 ||
                    value ===
                      30 ||
                    value ===
                      90
                  ) {
                    setPeriod(
                      value,
                    );
                  }
                }}
                className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-violet-500/60"
              >
                {
                  PERIODS.map(
                    (
                      option,
                    ) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                        className="bg-[#11131a]"
                      >
                        {
                          option.label
                        }
                      </option>
                    ),
                  )
                }
              </select>

              <button
                type="button"
                onClick={
                  () =>
                    void loadAnalytics(
                      period,
                      true,
                    )
                }
                disabled={
                  refreshing
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-medium transition hover:bg-white/10 disabled:opacity-60"
              >
                <RefreshCw
                  size={
                    16
                  }
                  className={
                    refreshing
                      ? "animate-spin"
                      : ""
                  }
                />

                Refresh analytics
              </button>
            </div>
          </div>
        </header>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.055] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Database
              className="mt-0.5 text-emerald-400"
              size={
                18
              }
            />

            <div>
              <p className="text-sm font-medium text-emerald-300">
                Read-only operational analytics
              </p>

              <p className="mt-1 text-xs text-slate-500">
                RLS-scoped workspace data. No credentials, raw payloads,
                or AI tokens are used.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock3
              size={
                14
              }
            />

            Updated
            {" "}
            {
              generatedLabel
            }
          </div>
        </div>

        {
          error
            ? (
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-5">
                  <XCircle
                    className="mt-0.5 text-red-400"
                    size={
                      20
                    }
                  />

                  <div>
                    <p className="font-medium text-red-200">
                      Analytics could not load
                    </p>

                    <p className="mt-1 text-sm text-red-200/60">
                      {
                        error
                      }
                    </p>
                  </div>
                </div>
              )
            : null
        }

        <div className="mt-6">
          {
            loading
              ? (
                  <LoadingState />
                )
              : analytics
                ? (
                    <div className="space-y-6">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                        <MetricCard
                          label="Operations"
                          value={
                            number(
                              analytics
                                .summary
                                .uniqueOperations,
                            )
                          }
                          detail={`${number(
                            analytics
                              .summary
                              .totalEvents,
                          )} observable events recorded`}
                          icon={
                            <Activity
                              size={
                                19
                              }
                            />
                          }
                          accent="border-violet-500/20 bg-violet-500/10 text-violet-300"
                        />

                        <MetricCard
                          label="Success rate"
                          value={`${analytics.summary.successRate}%`}
                          detail={`${number(
                            analytics
                              .summary
                              .succeeded,
                          )} successful outcomes`}
                          icon={
                            <CheckCircle2
                              size={
                                19
                              }
                            />
                          }
                          accent="border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        />

                        <MetricCard
                          label="Failures"
                          value={
                            number(
                              analytics
                                .summary
                                .failed,
                            )
                          }
                          detail={`${analytics.summary.failureRate}% of completed outcomes`}
                          icon={
                            <AlertTriangle
                              size={
                                19
                              }
                            />
                          }
                          accent="border-red-500/20 bg-red-500/10 text-red-300"
                        />

                        <MetricCard
                          label="Retries"
                          value={
                            number(
                              analytics
                                .summary
                                .retries,
                            )
                          }
                          detail={`${analytics.summary.averageAttempts} average attempts`}
                          icon={
                            <RefreshCw
                              size={
                                19
                              }
                            />
                          }
                          accent="border-blue-500/20 bg-blue-500/10 text-blue-300"
                        />

                        <MetricCard
                          label="Duplicates"
                          value={
                            number(
                              analytics
                                .summary
                                .duplicates,
                            )
                          }
                          detail="Idempotent replays safely suppressed"
                          icon={
                            <Copy
                              size={
                                19
                              }
                            />
                          }
                          accent="border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
                        />

                        <MetricCard
                          label="Guardrails"
                          value={
                            number(
                              analytics
                                .summary
                                .blocked,
                            )
                          }
                          detail={`${analytics.summary.activeConnections} of ${analytics.summary.connectionCount} connections active`}
                          icon={
                            <ShieldAlert
                              size={
                                19
                              }
                            />
                          }
                          accent="border-amber-500/20 bg-amber-500/10 text-amber-300"
                        />
                      </div>

                      {
                        analytics
                          .summary
                          .totalEvents ===
                        0
                          ? (
                              <EmptyState />
                            )
                          : (
                              <>
                                <ActivityTrend
                                  analytics={
                                    analytics
                                  }
                                />

                                <div className="grid gap-6 xl:grid-cols-2">
                                  <BreakdownPanel
                                    title="Operation sources"
                                    description="Where observable integration activity originated."
                                    items={
                                      analytics.sources
                                    }
                                  />

                                  <BreakdownPanel
                                    title="Execution states"
                                    description="Distribution of operation outcomes and lifecycle events."
                                    items={
                                      analytics.statuses
                                    }
                                  />
                                </div>

                                <ProviderTable
                                  providers={
                                    analytics.providers
                                  }
                                />
                              </>
                            )
                      }

                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                          <Plug
                            className="text-violet-300"
                            size={
                              20
                            }
                          />

                          <div>
                            <p className="text-2xl font-semibold">
                              {
                                analytics
                                  .summary
                                  .providerCount
                              }
                            </p>

                            <p className="text-xs text-slate-500">
                              Providers represented
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                          <Zap
                            className="text-blue-300"
                            size={
                              20
                            }
                          />

                          <div>
                            <p className="text-2xl font-semibold">
                              {
                                analytics
                                  .summary
                                  .connectionCount
                              }
                            </p>

                            <p className="text-xs text-slate-500">
                              Workspace connections
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                          <Clock3
                            className="text-emerald-300"
                            size={
                              20
                            }
                          />

                          <div>
                            <p className="text-sm font-semibold">
                              {
                                dateTime(
                                  analytics
                                    .summary
                                    .lastOperationAt,
                                )
                              }
                            </p>

                            <p className="text-xs text-slate-500">
                              Latest operation
                            </p>
                          </div>
                        </div>
                      </div>

                      {
                        analytics.truncated
                          ? (
                              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-sm text-amber-200/80">
                                <AlertTriangle
                                  className="mt-0.5 shrink-0"
                                  size={
                                    17
                                  }
                                />

                                This workspace exceeded the 10,000-event
                                interactive analytics window.
                              </div>
                            )
                          : null
                      }
                    </div>
                  )
                : null
          }
        </div>
      </div>
    </main>
  );
}