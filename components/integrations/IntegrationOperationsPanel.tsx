"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

type LogSeverity =
  | "debug"
  | "info"
  | "warning"
  | "error";

type LogSource =
  | "action"
  | "webhook"
  | "system";

type LogStatus =
  | "received"
  | "started"
  | "succeeded"
  | "failed"
  | "blocked"
  | "duplicate"
  | "retry_scheduled"
  | "retrying"
  | "exhausted";

type OperationLog = {
  id: string;
  source: LogSource;
  eventType: string;
  severity: LogSeverity;
  status: LogStatus;
  correlationId: string;
  actionExecutionId: string | null;
  webhookEventId: string | null;
  attempt: number;
  maxAttempts: number;
  retryable: boolean;
  nextRetryAt: string | null;
  errorCode: string | null;
  message: string;
  metadata:
    Record<string, unknown>;
  createdAt: string;
};

type OperationSummary = {
  total: number;
  succeeded: number;
  failed: number;
  retrying: number;
  blocked: number;
};

type LogsResponse = {
  success: boolean;
  logs?: OperationLog[];
  summary?:
    Partial<OperationSummary>;
  error?: string;
};

type IntegrationOperationsPanelProps = {
  integrationId: string;
  integrationName: string;
  onClose: () => void;
};

const emptySummary:
  OperationSummary = {
    total: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    blocked: 0,
  };

function formatLabel(
  value: string,
) {
  return value
    .replaceAll(
      "_",
      " ",
    )
    .replaceAll(
      ".",
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function formatDateTime(
  value: string,
) {
  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? value
    : date.toLocaleString();
}

function statusTone(
  status: LogStatus,
) {
  if (
    status === "succeeded"
  ) {
    return "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300";
  }

  if (
    status === "failed" ||
    status === "exhausted"
  ) {
    return "border-red-500/20 bg-red-500/[0.07] text-red-300";
  }

  if (
    status ===
      "retry_scheduled" ||
    status === "retrying" ||
    status === "blocked"
  ) {
    return "border-amber-500/20 bg-amber-500/[0.07] text-amber-300";
  }

  return "border-blue-500/20 bg-blue-500/[0.07] text-blue-300";
}

function severityDot(
  severity: LogSeverity,
) {
  if (
    severity === "error"
  ) {
    return "bg-red-400";
  }

  if (
    severity === "warning"
  ) {
    return "bg-amber-400";
  }

  if (
    severity === "debug"
  ) {
    return "bg-zinc-500";
  }

  return "bg-blue-400";
}

export default function IntegrationOperationsPanel({
  integrationId,
  integrationName,
  onClose,
}: IntegrationOperationsPanelProps) {
  const [
    logs,
    setLogs,
  ] =
    useState<OperationLog[]>(
      [],
    );

  const [
    summary,
    setSummary,
  ] =
    useState<OperationSummary>(
      emptySummary,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    severity,
    setSeverity,
  ] =
    useState("all");

  const [
    source,
    setSource,
  ] =
    useState("all");

  const [
    status,
    setStatus,
  ] =
    useState("all");

  const queryString =
    useMemo(() => {
      const params =
        new URLSearchParams({
          limit: "50",
        });

      if (
        severity !== "all"
      ) {
        params.set(
          "severity",
          severity,
        );
      }

      if (
        source !== "all"
      ) {
        params.set(
          "source",
          source,
        );
      }

      if (
        status !== "all"
      ) {
        params.set(
          "status",
          status,
        );
      }

      return params.toString();
    }, [
      severity,
      source,
      status,
    ]);

  const loadLogs =
    useCallback(
      async () => {
        setLoading(true);
        setErrorMessage("");

        try {
          const response =
            await fetch(
              `/api/integrations/${encodeURIComponent(
                integrationId,
              )}/logs?${queryString}`,
              {
                method: "GET",
                cache:
                  "no-store",
              },
            );

          const data =
            (
              await response.json()
            ) as LogsResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
                "Could not load operation history.",
            );
          }

          setLogs(
            data.logs ?? [],
          );

          setSummary({
            ...emptySummary,
            ...data.summary,
          });
        } catch (error) {
          console.error(
            "Integration operation history error:",
            error,
          );

          setLogs([]);

          setSummary(
            emptySummary,
          );

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not load operation history.",
          );
        } finally {
          setLoading(false);
        }
      },
      [
        integrationId,
        queryString,
      ],
    );

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${integrationName} operation history`}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/[0.09] bg-[#0b0c10] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              <Activity
                size={14}
              />

              Day 14L observability
            </div>

            <h2 className="mt-3 text-2xl font-semibold text-white">
              {integrationName} operations
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Redacted actions, webhooks, failures, duplicates, and bounded retries.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 transition hover:bg-white/[0.07] hover:text-white"
            aria-label="Close operation history"
          >
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard
              label="Loaded"
              value={
                summary.total
              }
              icon={Activity}
              tone="text-blue-300"
            />

            <SummaryCard
              label="Succeeded"
              value={
                summary.succeeded
              }
              icon={
                CheckCircle2
              }
              tone="text-emerald-300"
            />

            <SummaryCard
              label="Failures"
              value={
                summary.failed
              }
              icon={
                AlertTriangle
              }
              tone="text-red-300"
            />

            <SummaryCard
              label="Retrying"
              value={
                summary.retrying
              }
              icon={Clock3}
              tone="text-amber-300"
            />

            <SummaryCard
              label="Blocked"
              value={
                summary.blocked
              }
              icon={
                ShieldCheck
              }
              tone="text-violet-300"
            />
          </section>

          <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 lg:flex-row lg:items-center">
            <select
              value={source}
              onChange={(
                event,
              ) =>
                setSource(
                  event.target
                    .value,
                )
              }
              className="rounded-xl border border-white/[0.08] bg-[#08090c] px-3 py-2.5 text-sm text-zinc-300 outline-none"
            >
              <option value="all">
                All sources
              </option>

              <option value="action">
                Actions
              </option>

              <option value="webhook">
                Webhooks
              </option>

              <option value="system">
                System
              </option>
            </select>

            <select
              value={severity}
              onChange={(
                event,
              ) =>
                setSeverity(
                  event.target
                    .value,
                )
              }
              className="rounded-xl border border-white/[0.08] bg-[#08090c] px-3 py-2.5 text-sm text-zinc-300 outline-none"
            >
              <option value="all">
                All severities
              </option>

              <option value="info">
                Info
              </option>

              <option value="warning">
                Warning
              </option>

              <option value="error">
                Error
              </option>

              <option value="debug">
                Debug
              </option>
            </select>

            <select
              value={status}
              onChange={(
                event,
              ) =>
                setStatus(
                  event.target
                    .value,
                )
              }
              className="rounded-xl border border-white/[0.08] bg-[#08090c] px-3 py-2.5 text-sm text-zinc-300 outline-none"
            >
              <option value="all">
                All statuses
              </option>

              <option value="succeeded">
                Succeeded
              </option>

              <option value="failed">
                Failed
              </option>

              <option value="retry_scheduled">
                Retry scheduled
              </option>

              <option value="retrying">
                Retrying
              </option>

              <option value="exhausted">
                Exhausted
              </option>

              <option value="blocked">
                Blocked
              </option>

              <option value="duplicate">
                Duplicate
              </option>

              <option value="received">
                Received
              </option>

              <option value="started">
                Started
              </option>
            </select>

            <button
              type="button"
              onClick={() =>
                void loadLogs()
              }
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-2.5 text-sm font-medium text-violet-300 transition hover:bg-violet-500/10 disabled:opacity-40 lg:ml-auto"
            >
              <RefreshCw
                size={15}
                className={
                  loading
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>
          </section>

          {errorMessage && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div className="mt-4 space-y-3">
              {[
                1,
                2,
                3,
              ].map(
                (item) => (
                  <div
                    key={item}
                    className="h-28 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02]"
                  />
                ),
              )}
            </div>
          ) : logs.length ===
            0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/[0.09] px-6 py-14 text-center">
              <Activity
                size={26}
                className="mx-auto text-zinc-700"
              />

              <p className="mt-3 text-sm font-medium text-zinc-400">
                No operation records match these filters.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {logs.map(
                (log) => (
                  <article
                    key={log.id}
                    className="rounded-2xl border border-white/[0.07] bg-[#0e0f13] p-4"
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${severityDot(
                              log.severity,
                            )}`}
                          />

                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            {formatLabel(
                              log.source,
                            )}
                          </span>

                          <span className="text-xs text-zinc-700">
                            {formatDateTime(
                              log.createdAt,
                            )}
                          </span>
                        </div>

                        <h3 className="mt-2 break-words text-sm font-semibold text-zinc-200">
                          {formatLabel(
                            log.eventType,
                          )}
                        </h3>

                        <p className="mt-1 text-sm leading-6 text-zinc-500">
                          {log.message}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(
                          log.status,
                        )}`}
                      >
                        {formatLabel(
                          log.status,
                        )}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.05] pt-3 text-[11px] text-zinc-600">
                      <span>
                        Attempt{" "}
                        {log.attempt}/
                        {
                          log.maxAttempts
                        }
                      </span>

                      <span>
                        Correlation{" "}
                        {log.correlationId.slice(
                          0,
                          12,
                        )}
                      </span>

                      {log.errorCode && (
                        <span className="text-red-400/80">
                          {
                            log.errorCode
                          }
                        </span>
                      )}

                      {log.nextRetryAt && (
                        <span className="text-amber-400/80">
                          Retry{" "}

                          {formatDateTime(
                            log.nextRetryAt,
                          )}
                        </span>
                      )}
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div
        className={`flex items-center gap-2 ${tone}`}
      >
        <Icon size={14} />

        <span className="text-xs font-medium">
          {label}
        </span>
      </div>

      <p className="mt-2 text-xl font-semibold text-white">
        {value}
      </p>
    </div>
  );
}