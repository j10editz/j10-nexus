"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  PlugZap,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type Requirement = {
  id: string;
  name: string;
  type: "integration" | "system";
  provider?: string;
  ready: boolean;
  reason: string;
};

type ReadinessData = {
  ready: boolean;

  status:
    | "Ready"
    | "Integration Required"
    | "System Capability Required";

  requirementCount: number;
  missingCount: number;

  requirements: Requirement[];

  missingIntegrations: Requirement[];

  missingSystemCapabilities: Requirement[];
};

type ReadinessResponse = {
  success: boolean;

  workflow?: {
    id: string;
    name: string;
    status: string;
    triggerType: string;
    actionCount: number;
  };

  readiness?: ReadinessData;

  error?: string;
};

type Props = {
  workflowId: string;
};

export default function WorkflowReadinessPanel({
  workflowId,
}: Props) {
  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [readiness, setReadiness] =
    useState<ReadinessData | null>(
      null
    );

  const loadReadiness =
    useCallback(async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/automation/${workflowId}/readiness`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const data =
          (await response.json()) as ReadinessResponse;

        if (
          !response.ok ||
          !data.success ||
          !data.readiness
        ) {
          throw new Error(
            data.error ||
              "Could not check workflow readiness."
          );
        }

        setReadiness(
          data.readiness
        );
      } catch (error) {
        console.error(
          "Workflow readiness error:",
          error
        );

        setErrorMessage(
          "Could not determine workflow readiness."
        );
      } finally {
        setLoading(false);
      }
    }, [workflowId]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  return (
    <div className="border-t border-white/[0.07] px-6 py-6">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
            <ShieldCheck
              size={16}
              className="text-violet-400"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-white">
              Execution Readiness
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Requirements needed before
              this workflow can execute
              completely.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadReadiness();
          }}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-500 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
        >
          <RefreshCw
            size={14}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />
        </button>
      </div>

      {/* ERROR */}
      {errorMessage && (
        <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          {errorMessage}
        </div>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="mt-5 space-y-3">
          <div className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />

          <div className="h-20 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]" />
        </div>
      ) : readiness ? (
        <>
          {/* MAIN STATUS */}
          <div
            className={`mt-5 rounded-2xl border p-5 ${
              readiness.ready
                ? "border-emerald-500/20 bg-emerald-500/[0.05]"
                : "border-amber-500/20 bg-amber-500/[0.05]"
            }`}
          >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    readiness.ready
                      ? "bg-emerald-500/10"
                      : "bg-amber-500/10"
                  }`}
                >
                  {readiness.ready ? (
                    <CheckCircle2
                      size={18}
                      className="text-emerald-400"
                    />
                  ) : (
                    <AlertTriangle
                      size={18}
                      className="text-amber-400"
                    />
                  )}
                </div>

                <div>
                  <p
                    className={`text-sm font-semibold ${
                      readiness.ready
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  >
                    {readiness.ready
                      ? "Ready to Execute"
                      : readiness.status}
                  </p>

                  <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
                    {readiness.ready
                      ? "All required integrations and platform capabilities are available."
                      : `${readiness.missingCount} requirement${
                          readiness.missingCount ===
                          1
                            ? ""
                            : "s"
                        } must be resolved before this workflow can execute completely.`}
                  </p>
                </div>
              </div>

              <div
                className={`w-fit rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                  readiness.ready
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-amber-500/20 bg-amber-500/10 text-amber-400"
                }`}
              >
                {readiness.ready
                  ? "Ready"
                  : `${readiness.missingCount} Missing`}
              </div>
            </div>
          </div>

          {/* INTEGRATIONS */}
          {readiness
            .missingIntegrations
            .length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <PlugZap
                  size={14}
                  className="text-blue-400"
                />

                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Integrations Required
                </p>
              </div>

              <p className="mt-1 text-xs text-zinc-700">
                These connections must be
                configured by the workspace.
              </p>

              <div className="mt-3 space-y-2">
                {readiness.missingIntegrations.map(
                  (requirement) => (
                    <IntegrationRequirement
                      key={
                        requirement.id
                      }
                      requirement={
                        requirement
                      }
                    />
                  )
                )}
              </div>
            </div>
          )}

          {/* PLATFORM */}
          {readiness
            .missingSystemCapabilities
            .length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-2">
                <Cpu
                  size={14}
                  className="text-violet-400"
                />

                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Platform Capabilities
                </p>
              </div>

              <p className="mt-1 text-xs text-zinc-700">
                These capabilities are
                provided by J10 NEXUS, not
                by the customer.
              </p>

              <div className="mt-3 space-y-2">
                {readiness.missingSystemCapabilities.map(
                  (requirement) => (
                    <SystemRequirement
                      key={
                        requirement.id
                      }
                      requirement={
                        requirement
                      }
                    />
                  )
                )}
              </div>
            </div>
          )}

          {/* READY REQUIREMENTS */}
          {readiness.requirements.some(
            (requirement) =>
              requirement.ready
          ) && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Ready
              </p>

              <div className="mt-3 space-y-2">
                {readiness.requirements
                  .filter(
                    (requirement) =>
                      requirement.ready
                  )
                  .map(
                    (requirement) => (
                      <div
                        key={
                          requirement.id
                        }
                        className="flex items-start gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                          <CheckCircle2
                            size={14}
                            className="text-emerald-400"
                          />
                        </div>

                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {
                              requirement.name
                            }
                          </p>

                          <p className="mt-1 text-xs leading-5 text-zinc-600">
                            {
                              requirement.reason
                            }
                          </p>
                        </div>
                      </div>
                    )
                  )}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function IntegrationRequirement({
  requirement,
}: {
  requirement: Requirement;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
          <PlugZap
            size={15}
            className="text-amber-400"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-200">
            {requirement.name}
          </p>

          <p className="mt-1 max-w-lg text-xs leading-5 text-zinc-600">
            {requirement.reason}
          </p>

          {requirement.provider && (
            <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-700">
              Provider:{" "}
              {
                requirement.provider
              }
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled
        title="Integration connection flow is the next build step."
        className="shrink-0 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-zinc-600"
      >
        Connect{" "}
        {requirement.name}
      </button>
    </div>
  );
}

function SystemRequirement({
  requirement,
}: {
  requirement: Requirement;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-violet-500/15 bg-violet-500/[0.03] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
        <Cpu
          size={15}
          className="text-violet-400"
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-zinc-200">
            {requirement.name}
          </p>

          <span className="rounded-full border border-violet-500/15 bg-violet-500/10 px-2 py-0.5 text-[9px] font-medium text-violet-400">
            J10 NEXUS
          </span>
        </div>

        <p className="mt-1 text-xs leading-5 text-zinc-600">
          {requirement.reason}
        </p>
      </div>
    </div>
  );
}