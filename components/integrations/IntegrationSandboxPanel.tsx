"use client";

import {
  useCallback,
  useMemo,
  useState,
  type ComponentType,
} from "react";

import {
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Database,
  DollarSign,
  EyeOff,
  Fingerprint,
  FlaskConical,
  Globe2,
  ListChecks,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldCheck,
  Webhook,
  XCircle,
  Zap,
} from "lucide-react";

import {
  INTEGRATION_SANDBOX_SCENARIO_IDS,
  type IntegrationSandboxApiResponse,
  type IntegrationSandboxRun,
  type IntegrationSandboxScenarioId,
} from "../../types/integration-sandbox";

type IconComponent = ComponentType<{
  className?: string;
  size?: number;
}>;

type ScenarioPresentation = {
  readonly name: string;
  readonly description: string;
  readonly icon: IconComponent;
};

const SCENARIO_PRESENTATION: Record<
  IntegrationSandboxScenarioId,
  ScenarioPresentation
> = {
  registry_integrity: {
    name:
      "Connector registry integrity",

    description:
      "Validate unique providers, capabilities, and installed development connectors.",

    icon:
      Boxes,
  },

  action_simulation: {
    name:
      "Zero-side-effect simulation",

    description:
      "Exercise the real action planner without sending an HTTP request.",

    icon:
      Zap,
  },

  internal_sandbox_receipt: {
    name:
      "Internal adapter receipt",

    description:
      "Call J10's isolated local adapter and verify that no external side effect occurred.",

    icon:
      FlaskConical,
  },

  live_mode_guardrail: {
    name:
      "Live provider guardrail",

    description:
      "Confirm an unavailable live provider adapter cannot execute.",

    icon:
      LockKeyhole,
  },

  approval_guardrail: {
    name:
      "Human approval guardrail",

    description:
      "Confirm side-effecting sandbox actions remain approval-gated.",

    icon:
      ShieldCheck,
  },

  trigger_normalization: {
    name:
      "Trigger normalization",

    description:
      "Normalize a deterministic webhook through the installed trigger adapter.",

    icon:
      Webhook,
  },

  idempotency_contract: {
    name:
      "Idempotency contract",

    description:
      "Verify stable fingerprints and safe detection of changed action input.",

    icon:
      Fingerprint,
  },

  credential_redaction: {
    name:
      "Credential redaction",

    description:
      "Test sensitive metadata against the production observability redactor.",

    icon:
      EyeOff,
  },
};

function formatDuration(
  durationMs: number,
) {
  if (durationMs < 1) {
    return "<1 ms";
  }

  if (durationMs < 1_000) {
    return `${Math.round(
      durationMs,
    )} ms`;
  }

  return `${(
    durationMs / 1_000
  ).toFixed(2)} s`;
}

function formatCompletedAt(
  value: string,
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        "medium",

      timeStyle:
        "medium",
    },
  ).format(date);
}

async function readResponse(
  response: Response,
): Promise<IntegrationSandboxApiResponse> {
  const text =
    await response.text();

  if (!text) {
    return {
      success:
        false,

      error:
        `Sandbox returned HTTP ${response.status}.`,
    };
  }

  try {
    return JSON.parse(
      text,
    ) as IntegrationSandboxApiResponse;
  } catch {
    return {
      success:
        false,

      error:
        "Sandbox returned an unreadable response.",
    };
  }
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "violet",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: IconComponent;
  tone?:
    | "violet"
    | "emerald"
    | "blue"
    | "amber";
}) {
  const tones = {
    violet:
      "border-violet-500/20 bg-violet-500/10 text-violet-300",

    emerald:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",

    blue:
      "border-blue-500/20 bg-blue-500/10 text-blue-300",

    amber:
      "border-amber-500/20 bg-amber-500/10 text-amber-300",
  } as const;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d0f14] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
            {label}
          </p>

          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>

        <div
          className={`rounded-xl border p-2.5 ${tones[tone]}`}
        >
          <Icon size={19} />
        </div>
      </div>

      <p className="mt-3 text-xs text-white/40">
        {detail}
      </p>
    </div>
  );
}

export default function IntegrationSandboxPanel() {
  const [
    selectedScenarioIds,
    setSelectedScenarioIds,
  ] =
    useState<
      IntegrationSandboxScenarioId[]
    >([
      ...INTEGRATION_SANDBOX_SCENARIO_IDS,
    ]);

  const [
    seed,
    setSeed,
  ] =
    useState(
      "day14n",
    );

  const [
    run,
    setRun,
  ] =
    useState<
      IntegrationSandboxRun |
      null
    >(null);

  const [
    isRunning,
    setIsRunning,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(null);

  const resultById =
    useMemo(
      () =>
        new Map(
          run?.scenarios.map(
            (scenario) => [
              scenario.id,
              scenario,
            ],
          ) ?? [],
        ),

      [run],
    );

  const allSelected =
    selectedScenarioIds.length ===
    INTEGRATION_SANDBOX_SCENARIO_IDS.length;

  const toggleScenario =
    useCallback(
      (
        scenarioId:
          IntegrationSandboxScenarioId,
      ) => {
        setSelectedScenarioIds(
          (current) =>
            current.includes(
              scenarioId,
            )
              ? current.filter(
                  (item) =>
                    item !==
                    scenarioId,
                )
              : [
                  ...current,
                  scenarioId,
                ],
        );

        setRun(null);
        setError(null);
      },

      [],
    );

  const toggleAll =
    useCallback(
      () => {
        setSelectedScenarioIds(
          allSelected
            ? []
            : [
                ...INTEGRATION_SANDBOX_SCENARIO_IDS,
              ],
        );

        setRun(null);
        setError(null);
      },

      [
        allSelected,
      ],
    );

  const runSandbox =
    useCallback(
      async () => {
        if (
          isRunning ||
          selectedScenarioIds.length ===
            0
        ) {
          return;
        }

        setIsRunning(
          true,
        );

        setRun(null);
        setError(null);

        try {
          const response =
            await fetch(
              "/api/integrations/sandbox",

              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                cache:
                  "no-store",

                body:
                  JSON.stringify({
                    scenarioIds:
                      selectedScenarioIds,

                    seed,
                  }),
              },
            );

          const result =
            await readResponse(
              response,
            );

          if (
            !result.sandbox
          ) {
            throw new Error(
              result.error ??
                "J10 NEXUS could not run the development sandbox.",
            );
          }

          setRun(
            result.sandbox,
          );

          if (
            !result.sandbox.success
          ) {
            setError(
              "One or more sandbox checks failed. Review the failed scenario below.",
            );
          }
        } catch (
          caughtError
        ) {
          setError(
            caughtError instanceof
              Error
              ? caughtError.message
              : "J10 NEXUS could not run the development sandbox.",
          );
        } finally {
          setIsRunning(
            false,
          );
        }
      },

      [
        isRunning,
        seed,
        selectedScenarioIds,
      ],
    );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
      <section className="overflow-hidden rounded-[28px] border border-violet-500/20 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.24),transparent_38%),linear-gradient(135deg,#0c0e14,#10101a)] p-7 sm:p-9">
        <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-violet-300">
              <FlaskConical
                size={15}
              />

              J10 NEXUS Development Lab
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Integration Sandbox Control Center
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Validate real connector contracts,
              guardrails, triggers, idempotency,
              and redaction without provider calls,
              database writes, external side effects,
              or AI spending.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                Deterministic seed
              </span>

              <input
                value={seed}
                maxLength={64}
                disabled={
                  isRunning
                }
                onChange={(
                  event,
                ) => {
                  setSeed(
                    event.target
                      .value,
                  );

                  setRun(null);
                  setError(null);
                }}
                className="h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-400/60 sm:w-52"
                aria-label="Deterministic sandbox seed"
              />
            </label>

            <button
              type="button"
              disabled={
                isRunning ||
                selectedScenarioIds.length ===
                  0 ||
                !seed.trim()
              }
              onClick={() =>
                void runSandbox()
              }
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              {isRunning ? (
                <Loader2
                  className="animate-spin"
                  size={17}
                />
              ) : run ? (
                <RefreshCw
                  size={17}
                />
              ) : (
                <Play
                  size={17}
                />
              )}

              {isRunning
                ? "Running checks"
                : run
                  ? "Run again"
                  : "Run sandbox"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4">
          <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-300">
            <DollarSign
              size={18}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-emerald-200">
              $0 execution mode
            </p>

            <p className="mt-1 text-xs text-white/40">
              No paid APIs or AI tokens
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] p-4">
          <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-300">
            <Globe2
              size={18}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-blue-200">
              Provider network isolated
            </p>

            <p className="mt-1 text-xs text-white/40">
              Only one internal J10 receipt
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] p-4">
          <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-300">
            <Database
              size={18}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-violet-200">
              Read/write isolation
            </p>

            <p className="mt-1 text-xs text-white/40">
              No operational rows created
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
          <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-300">
            <LockKeyhole
              size={18}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-amber-200">
              Production disabled
            </p>

            <p className="mt-1 text-xs text-white/40">
              API returns 404 outside development
            </p>
          </div>
        </div>
      </section>

      {run ? (
        <section className="space-y-4">
          <div
            className={`rounded-2xl border p-5 ${
              run.success
                ? "border-emerald-500/25 bg-emerald-500/[0.07]"
                : "border-red-500/25 bg-red-500/[0.07]"
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                {run.success ? (
                  <CheckCircle2
                    className="mt-0.5 text-emerald-300"
                    size={22}
                  />
                ) : (
                  <XCircle
                    className="mt-0.5 text-red-300"
                    size={22}
                  />
                )}

                <div>
                  <p className="font-semibold text-white">
                    {run.success
                      ? "Day 14N sandbox checks passed"
                      : "Sandbox requires attention"}
                  </p>

                  <p className="mt-1 text-xs text-white/45">
                    Run {run.runId}
                    {" · "}
                    {formatCompletedAt(
                      run.completedAt,
                    )}
                    {" · "}
                    {formatDuration(
                      run.durationMs,
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/55">
                Schema {run.schemaVersion}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="Passed"
              value={`${run.summary.passed}/${run.summary.total}`}
              detail={`${run.summary.assertions} assertions`}
              icon={ListChecks}
              tone="emerald"
            />

            <MetricCard
              label="Provider calls"
              value={
                run.summary
                  .externalRequests
              }
              detail={`${run.summary.internalRequests} internal request`}
              icon={Globe2}
              tone="blue"
            />

            <MetricCard
              label="Side effects"
              value={
                run.summary
                  .externalSideEffects
              }
              detail="External mutations"
              icon={ShieldCheck}
              tone="violet"
            />

            <MetricCard
              label="Database writes"
              value={
                run.summary
                  .databaseWrites
              }
              detail="Persistent records"
              icon={Database}
              tone="violet"
            />

            <MetricCard
              label="AI requests"
              value={
                run.summary
                  .aiRequests
              }
              detail="Paid model calls"
              icon={BrainCircuit}
              tone="blue"
            />

            <MetricCard
              label="Estimated cost"
              value={`$${run.summary.estimatedCostUsd.toFixed(2)}`}
              detail="Acceptance run"
              icon={DollarSign}
              tone="emerald"
            />
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-5 text-sm text-red-200">
          <XCircle
            className="mt-0.5 shrink-0"
            size={18}
          />

          <p>
            {error}
          </p>
        </div>
      ) : null}

      <section className="rounded-[24px] border border-white/10 bg-[#0b0d12] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              Acceptance scenarios
            </p>

            <h2 className="mt-2 text-xl font-semibold text-white">
              Select the contracts to verify
            </h2>

            <p className="mt-1 text-sm text-white/40">
              {selectedScenarioIds.length}
              {" of "}
              {INTEGRATION_SANDBOX_SCENARIO_IDS.length}
              {" selected"}
            </p>
          </div>

          <button
            type="button"
            disabled={
              isRunning
            }
            onClick={
              toggleAll
            }
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/70 transition hover:border-violet-400/30 hover:text-white disabled:opacity-40"
          >
            {allSelected
              ? "Clear selection"
              : "Select all"}
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {INTEGRATION_SANDBOX_SCENARIO_IDS.map(
            (
              scenarioId,
            ) => {
              const presentation =
                SCENARIO_PRESENTATION[
                  scenarioId
                ];

              const Icon =
                presentation.icon;

              const selected =
                selectedScenarioIds.includes(
                  scenarioId,
                );

              const result =
                resultById.get(
                  scenarioId,
                );

              return (
                <button
                  key={
                    scenarioId
                  }
                  type="button"
                  disabled={
                    isRunning
                  }
                  onClick={() =>
                    toggleScenario(
                      scenarioId,
                    )
                  }
                  className={`group rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-violet-500/30 bg-violet-500/[0.07]"
                      : "border-white/10 bg-white/[0.02] opacity-55 hover:opacity-80"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`rounded-xl border p-2.5 ${
                        selected
                          ? "border-violet-500/25 bg-violet-500/10 text-violet-300"
                          : "border-white/10 bg-white/[0.03] text-white/35"
                      }`}
                    >
                      <Icon
                        size={18}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">
                            {presentation.name}
                          </p>

                          <p className="mt-1.5 text-xs leading-5 text-white/40">
                            {presentation.description}
                          </p>
                        </div>

                        {result ? (
                          result.status ===
                          "passed" ? (
                            <CheckCircle2
                              className="shrink-0 text-emerald-300"
                              size={18}
                            />
                          ) : (
                            <XCircle
                              className="shrink-0 text-red-300"
                              size={18}
                            />
                          )
                        ) : (
                          <span
                            className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                              selected
                                ? "border-violet-400 bg-violet-500 shadow-[inset_0_0_0_3px_#11131a]"
                                : "border-white/20"
                            }`}
                          />
                        )}
                      </div>

                      {result ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-white/50">
                            {result.assertions}
                            {" assertions"}
                          </span>

                          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-white/50">
                            {formatDuration(
                              result.durationMs,
                            )}
                          </span>

                          {result.error ? (
                            <span className="text-red-300">
                              {result.error}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            },
          )}
        </div>
      </section>

      {run ? (
        <section className="rounded-[24px] border border-white/10 bg-[#0b0d12] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Fingerprint
              className="text-violet-300"
              size={19}
            />

            <div>
              <h2 className="font-semibold text-white">
                Verification evidence
              </h2>

              <p className="mt-1 text-xs text-white/40">
                Redacted, non-secret evidence returned by each contract check.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {run.scenarios.map(
              (
                scenario,
              ) => (
                <details
                  key={
                    scenario.id
                  }
                  className="group rounded-2xl border border-white/10 bg-black/20"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                      {scenario.status ===
                      "passed" ? (
                        <CheckCircle2
                          className="text-emerald-300"
                          size={17}
                        />
                      ) : (
                        <XCircle
                          className="text-red-300"
                          size={17}
                        />
                      )}

                      <span className="text-sm font-medium text-white/80">
                        {scenario.name}
                      </span>
                    </div>

                    <span className="text-xs text-white/35 group-open:text-violet-300">
                      Evidence
                    </span>
                  </summary>

                  <div className="border-t border-white/10 p-4">
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-white/50">
                      {JSON.stringify(
                        scenario.evidence,
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </details>
              ),
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}