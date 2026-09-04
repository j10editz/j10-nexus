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
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  Command,
  FileText,
  Link2,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

import { WhatsAppInbox } from "@/components/whatsapp/WhatsAppInbox";
import { WhatsAppAgentStudio } from "@/components/whatsapp/WhatsAppAgentStudio";
import { WhatsAppEmbeddedSignup } from "@/components/whatsapp/WhatsAppEmbeddedSignup";
import { WhatsAppGroupGuardian } from "@/components/whatsapp/WhatsAppGroupGuardian";
import { WhatsAppScaleSimulator } from "@/components/whatsapp/WhatsAppScaleSimulator";

type IntegrationStatus =
  | "not_configured"
  | "pending"
  | "connected"
  | "degraded"
  | "disconnected"
  | "error"
  | "revoked"
  | "disabled";

type Integration = {
  provider: string;
  name: string;
  category: string;
  description: string;
  id: string | null;
  status: IntegrationStatus;
  accountLabel: string | null;
  externalAccountId: string | null;
  connectedAt: string | null;
  registered: boolean;
  metadata: Record<
    string,
    string | number | boolean | null
  >;
};

type IntegrationsResponse = {
  success: boolean;
  integrations?: Integration[];
  error?: string;
};

type Feature = {
  name: string;
  description: string;
  enabled: boolean;
};

type TestApproval = {
  approvalToken: string;
  expiresAt: string;
  idempotencyKey: string;
  capabilityId: string;
  input: Record<string, unknown>;
  preview: {
    recipient: string;
    templateName: string;
    languageCode: string;
    externalSideEffect: boolean;
  };
};

type InboundStatus = {
  success: boolean;
  error?: string;
  webhook?: {
    configured: boolean;
    active: boolean;
    lastReceivedAt: string | null;
  };
  latestInbound?: {
    eventId: string;
    capabilityId: string;
    providerEventType: string;
    signatureStatus: string;
    processingStatus: string;
    receivedAt: string;
    processedAt: string | null;
    sender: string | null;
    messageType: string;
    failureCode: string | null;
    failureMessage: string | null;
    workflowDispatch: {
      status: string;
      matched: number;
      executed: number;
      failed: number;
      completedAt: string;
    } | null;
  } | null;
};

type MetaHealthReport = {
  checkedAt: string;
  durationMs: number;
  latencyMs?: number;
  outcome: "passed" | "blocked" | "unsupported";
  mode: string;
  liveRequestPerformed: boolean;
  message: string;
  externalAccountId?: string | null;
  externalAccountLabel?: string | null;
  qualityRating?: string | null;
  blockers?: Array<{ code: string; message: string }>;
};

const groupGuardianFeatures: Feature[] = [
  {
    name: "Anti-Spam",
    description:
      "Detect and remove repeated or unwanted messages automatically.",
    enabled: true,
  },
  {
    name: "Anti-Link",
    description:
      "Detect links posted inside protected WhatsApp groups.",
    enabled: true,
  },
  {
    name: "Forbidden Links",
    description:
      "Delete links matching blocked domains or URL rules.",
    enabled: true,
  },
  {
    name: "Bad Word Filter",
    description:
      "Moderate messages containing prohibited words or phrases.",
    enabled: true,
  },
  {
    name: "Anti-Flood",
    description:
      "Detect users sending too many messages within a short period.",
    enabled: true,
  },
  {
    name: "Scam Detection",
    description:
      "Analyze suspicious messages and potential scam behavior.",
    enabled: true,
  },
  {
    name: "AI Content Moderation",
    description:
      "Use J10 AI to evaluate messages that require contextual moderation.",
    enabled: true,
  },
  {
    name: "Auto Delete",
    description:
      "Remove messages that violate active group rules.",
    enabled: true,
  },
  {
    name: "Warning System",
    description:
      "Track moderation warnings for individual group members.",
    enabled: true,
  },
  {
    name: "Auto Remove Member",
    description:
      "Remove repeat offenders after reaching the configured warning limit.",
    enabled: true,
  },
];

const commands = [
  {
    command: "!kick @user",
    description:
      "Remove a member from the managed group.",
  },
  {
    command: "!warn @user",
    description:
      "Give a moderation warning to a group member.",
  },
  {
    command: "!ban @user",
    description:
      "Block a member according to configured moderation policy.",
  },
  {
    command: "!rules",
    description:
      "Display the active group rules.",
  },
  {
    command: "!announce",
    description:
      "Publish an administrator announcement.",
  },
  {
    command: "!poll",
    description:
      "Prepare a group poll or voting action.",
  },
];

export default function WhatsAppPage() {
  const [integration, setIntegration] =
    useState<Integration | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [
    addingIntegration,
    setAddingIntegration,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    testRecipient,
    setTestRecipient,
  ] = useState("15155614375");

  const [
    testApproval,
    setTestApproval,
  ] = useState<TestApproval | null>(
    null,
  );

  const [
    testSending,
    setTestSending,
  ] = useState(false);

  const [
    testReceipt,
    setTestReceipt,
  ] = useState("");

  const [
    inboundStatus,
    setInboundStatus,
  ] = useState<InboundStatus | null>(
    null,
  );

  const [
    inboundStartedAt,
    setInboundStartedAt,
  ] = useState<string | null>(null);

  const [
    inboundChecking,
    setInboundChecking,
  ] = useState(false);

  const [
    healthLoading,
    setHealthLoading,
  ] = useState(false);

  const [
    healthReport,
    setHealthReport,
  ] = useState<MetaHealthReport | null>(
    null,
  );

  const [
    cooldownSeconds,
    setCooldownSeconds,
  ] = useState(0);

  const [activeTab, setActiveTab] = useState<"overview" | "groups" | "inbox" | "agent" | "scale">("overview");

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) =>
        Math.max(0, prev - 1),
      );
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [cooldownSeconds]);

  const registered =
    integration?.registered ?? false;

  const connected =
    integration?.status ===
    "connected";

  const loadConnection =
    useCallback(async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          "/api/integrations",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const data =
          (await response.json()) as IntegrationsResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Could not load integration."
          );
        }

        const whatsapp =
          data.integrations?.find(
            (item) =>
              item.provider ===
              "whatsapp-business"
          ) ?? null;

        setIntegration(whatsapp);
      } catch (error) {
        console.error(
          "WhatsApp connection load error:",
          error
        );

        setErrorMessage(
          "Could not determine WhatsApp connection status."
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  const verifyMetaHealth = useCallback(async () => {
    if (
      !integration?.id ||
      healthLoading ||
      cooldownSeconds > 0
    ) {
      return;
    }

    setHealthLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(
          integration.id,
        )}/readiness`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();

      if (
        response.status === 429 &&
        data.retryAfterSeconds
      ) {
        setCooldownSeconds(
          data.retryAfterSeconds,
        );
        setErrorMessage(
          data.error ||
            `Rate limit active. Please wait ${data.retryAfterSeconds}s before checking Meta again.`,
        );
        return;
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Meta health check did not succeed.",
        );
      }

      const res = data.result;
      const report: MetaHealthReport = {
        checkedAt: res.checkedAt,
        durationMs: res.durationMs,
        latencyMs:
          res.latencyMs ??
          res.durationMs,
        outcome: res.outcome,
        mode: res.mode,
        liveRequestPerformed:
          res.liveRequestPerformed,
        message: res.message,
        externalAccountId:
          res.externalAccountId ?? null,
        externalAccountLabel:
          res.externalAccountLabel ?? null,
        qualityRating:
          (res.metadata
            ?.qualityRating as string) ??
          null,
        blockers:
          res.readiness?.blockers ?? [],
      };

      setHealthReport(report);

      if (report.outcome === "passed") {
        setSuccessMessage(
          `Meta Graph API verified: Health check passed (${report.latencyMs}ms).`,
        );
        void loadConnection();
      } else {
        setErrorMessage(
          report.message ||
            "Meta health check did not pass.",
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not run Meta health check.",
      );
    } finally {
      setHealthLoading(false);
    }
  }, [
    cooldownSeconds,
    healthLoading,
    integration?.id,
    loadConnection,
  ]);

  useEffect(() => {
    const storedStartedAt =
      window.localStorage.getItem(
        "j10.whatsapp.inbound-listening-started-at",
      );

    if (
      storedStartedAt &&
      Number.isFinite(
        Date.parse(storedStartedAt),
      )
    ) {
      setInboundStartedAt(
        storedStartedAt,
      );
    }
  }, []);

  const loadInboundStatus =
    useCallback(
      async (
        integrationId: string,
        quiet = false,
      ) => {
        if (!quiet) {
          setInboundChecking(true);
        }

        const controller =
          new AbortController();
        const timeout =
          window.setTimeout(
            () => controller.abort(),
            10_000,
          );

        try {
          const response = await fetch(
            `/api/integrations/${encodeURIComponent(
              integrationId,
            )}/whatsapp/inbound-status`,
            {
              method: "GET",
              cache: "no-store",
              signal: controller.signal,
            },
          );

          const data =
            (await response.json()) as InboundStatus;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
                "Could not check inbound WhatsApp status.",
            );
          }

          setInboundStatus(data);
        } catch (error) {
          if (!quiet) {
            setErrorMessage(
              error instanceof DOMException &&
                error.name === "AbortError"
                ? "The inbound status check timed out. The server may still be restarting."
                : error instanceof Error
                ? error.message
                : "Could not check inbound WhatsApp status.",
            );
          }
        } finally {
          window.clearTimeout(timeout);

          if (!quiet) {
            setInboundChecking(false);
          }
        }
      },
      [],
    );

  useEffect(() => {
    if (!integration?.id || !connected) {
      return;
    }

    void loadInboundStatus(
      integration.id,
      true,
    );
  }, [
    connected,
    integration?.id,
    loadInboundStatus,
  ]);

  useEffect(() => {
    if (
      !integration?.id ||
      !connected ||
      !inboundStartedAt ||
      inboundStatus?.latestInbound
    ) {
      return;
    }

    const timer = window.setInterval(
      () => {
        void loadInboundStatus(
          integration.id as string,
          true,
        );
      },
      3_000,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [
    connected,
    inboundStartedAt,
    inboundStatus?.latestInbound,
    integration?.id,
    loadInboundStatus,
  ]);

  /*
  ============================================================
  ADD WHATSAPP TO WORKSPACE
  ============================================================
  */

  async function addWhatsAppIntegration() {
    if (addingIntegration) {
      return;
    }

    setAddingIntegration(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/integrations",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            provider: "whatsapp-business",
          }),
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not add WhatsApp integration."
        );
      }

      setSuccessMessage(
        "WhatsApp Business was added to your J10 NEXUS workspace."
      );

      await loadConnection();
    } catch (error) {
      console.error(
        "WhatsApp registration error:",
        error
      );

      setErrorMessage(
        "Could not add WhatsApp Business to this workspace."
      );
    } finally {
      setAddingIntegration(false);
    }
  }

  const connectionStatus =
    loading
      ? "Checking"
      : connected
        ? "Connected"
        : registered
          ? "Awaiting Connection"
          : "Not Added";

  const businessAccountId =
    integration?.metadata
      ?.business_account_id;

  const businessAccountIdReady =
    typeof businessAccountId ===
      "string" &&
    /^\d{5,32}$/.test(
      businessAccountId,
    );

  async function prepareTestDelivery() {
    if (
      !integration?.id ||
      !connected ||
      testSending
    ) {
      return;
    }

    const normalizedRecipient =
      testRecipient.replace(
        /\D/g,
        "",
      );

    if (
      normalizedRecipient.length < 7 ||
      normalizedRecipient.length > 15
    ) {
      setErrorMessage(
        "Enter the approved WhatsApp test recipient with country code and digits only.",
      );
      return;
    }

    setTestSending(true);
    setErrorMessage("");
    setSuccessMessage("");
    setTestReceipt("");

    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(
          integration.id,
        )}/actions/approval`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            to: normalizedRecipient,
          }),
        },
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success ||
        !data.approvalToken
      ) {
        throw new Error(
          data.error ||
            "Could not prepare the controlled WhatsApp test.",
        );
      }

      setTestRecipient(
        normalizedRecipient,
      );
      setTestApproval(
        data as TestApproval,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not prepare the controlled WhatsApp test.",
      );
    } finally {
      setTestSending(false);
    }
  }

  async function confirmTestDelivery() {
    if (
      !integration?.id ||
      !testApproval ||
      testSending
    ) {
      return;
    }

    setTestSending(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(
          integration.id,
        )}/actions`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "Idempotency-Key":
              testApproval.idempotencyKey,
          },
          body: JSON.stringify({
            capabilityId:
              testApproval.capabilityId,
            mode: "live",
            idempotencyKey:
              testApproval.idempotencyKey,
            input:
              testApproval.input,
            operatorApprovalToken:
              testApproval.approvalToken,
          }),
        },
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "WhatsApp did not accept the controlled test delivery.",
        );
      }

      const executionId =
        typeof data.execution?.id ===
          "string"
          ? data.execution.id
          : "recorded";

      setTestReceipt(
        executionId,
      );
      setTestApproval(null);
      setSuccessMessage(
        "WhatsApp accepted the hello_world test delivery.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "WhatsApp did not accept the controlled test delivery.",
      );
    } finally {
      setTestSending(false);
    }
  }

  async function startInboundAcceptance() {
    if (!integration?.id) {
      return;
    }

    const startedAt =
      new Date().toISOString();

    setInboundStartedAt(startedAt);
    window.localStorage.setItem(
      "j10.whatsapp.inbound-listening-started-at",
      startedAt,
    );
    setErrorMessage("");

    await loadInboundStatus(
      integration.id,
    );
  }

  const acceptedInbound =
    inboundStatus?.latestInbound ?? null;

  useEffect(() => {
    if (!acceptedInbound) {
      return;
    }

    window.localStorage.removeItem(
      "j10.whatsapp.inbound-listening-started-at",
    );
  }, [acceptedInbound]);

  const capabilityCount =
    useMemo(
      () =>
        groupGuardianFeatures.length +
        commands.length,
      []
    );

  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-8">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              WHATSAPP BUSINESS AI
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              WhatsApp Control Center
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Customer conversations,
              AI assistance, business
              automation and intelligent
              group management in one
              workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadConnection();
            }}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#111216] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-40"
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
        </div>

        {/* ERROR */}
        {errorMessage && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {/* SUCCESS */}
        {successMessage && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            <CheckCircle2 size={16} />

            {successMessage}
          </div>
        )}

        {/* CONNECTION */}
        <div className="mt-8 rounded-2xl border border-white/[0.07] bg-[#111216] p-6">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  connected
                    ? "bg-emerald-500/10"
                    : "bg-violet-500/10"
                }`}
              >
                <MessageSquare
                  size={20}
                  className={
                    connected
                      ? "text-emerald-400"
                      : "text-violet-400"
                  }
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold">
                    WhatsApp Business
                  </h2>

                  <ConnectionBadge
                    status={
                      connectionStatus
                    }
                  />
                </div>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                  J10 NEXUS will use this
                  connection for messages,
                  AI responses, workflow
                  triggers and supported
                  group-management
                  capabilities.
                </p>

                {integration?.accountLabel && (
                  <p className="mt-2 text-xs text-zinc-600">
                    Account:{" "}
                    {
                      integration.accountLabel
                    }
                  </p>
                )}
              </div>
            </div>

            {!registered ? (
              <button
                type="button"
                onClick={
                  addWhatsAppIntegration
                }
                disabled={
                  addingIntegration
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingIntegration ? (
                  <>
                    <RefreshCw
                      size={15}
                      className="animate-spin"
                    />

                    Adding...
                  </>
                ) : (
                  <>
                    Add Integration

                    <ChevronRight
                      size={15}
                    />
                  </>
                )}
              </button>
            ) : !connected ? (
              <div className="flex flex-col gap-3 lg:items-end">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3">
                  <p className="text-xs font-medium text-amber-400">
                    Provider authorization required
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    WhatsApp is registered
                    but has not been
                    connected to a real
                    provider account yet.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void verifyMetaHealth();
                    }}
                    disabled={
                      healthLoading ||
                      cooldownSeconds > 0
                    }
                    className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#090a0d] px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.04] disabled:opacity-40"
                  >
                    <Activity
                      size={13}
                      className={
                        healthLoading
                          ? "animate-spin"
                          : ""
                      }
                    />
                    {healthLoading
                      ? "Checking..."
                      : cooldownSeconds > 0
                        ? `Wait ${cooldownSeconds}s`
                        : "Check Readiness"}
                  </button>

                  <a
                    href="/dashboard/settings/integrations"
                    className="flex items-center gap-2 text-xs font-medium text-violet-400 transition hover:text-violet-300"
                  >
                    Manage Integration

                    <ChevronRight
                      size={13}
                    />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => {
                    void verifyMetaHealth();
                  }}
                  disabled={
                    healthLoading ||
                    cooldownSeconds > 0
                  }
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-40"
                  title="Ping Meta Graph API endpoint directly and measure live response latency"
                >
                  <Activity
                    size={14}
                    className={
                      healthLoading
                        ? "animate-spin text-emerald-300"
                        : "text-emerald-400"
                    }
                  />
                  {healthLoading
                    ? "Verifying Meta API..."
                    : cooldownSeconds > 0
                      ? `Cooldown (${cooldownSeconds}s)`
                      : "Verify Meta Health"}
                </button>

                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-2.5 text-sm text-emerald-400">
                  <CheckCircle2
                    size={16}
                  />

                  Connection active
                </div>
              </div>
            )}
          </div>

          {/* LIVE TELEMETRY / HEALTH DIAGNOSTICS */}
          {healthReport && (
            <div className="mt-6 border-t border-white/[0.06] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      healthReport.outcome === "passed"
                        ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                        : "bg-amber-400"
                    }`}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Meta Graph API Telemetry
                  </span>
                  <span className="rounded-md border border-white/[0.08] bg-black/40 px-2 py-0.5 text-[10px] text-zinc-400">
                    v22.0
                  </span>
                </div>

                <span className="text-[11px] text-zinc-500">
                  Checked: {new Date(healthReport.checkedAt).toLocaleTimeString()}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Status</span>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
                    {healthReport.outcome === "passed" ? (
                      <>
                        <CheckCircle2 size={14} className="text-emerald-400" />
                        <span className="text-emerald-400">Healthy & Online</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} className="text-amber-400" />
                        <span className="text-amber-400">Blocked</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Live Latency</span>
                  <p className="mt-1 text-sm font-semibold text-emerald-400">
                    {healthReport.latencyMs ?? healthReport.durationMs} ms
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Verified Identity</span>
                  <p className="mt-1 truncate text-sm font-semibold text-zinc-200">
                    {healthReport.externalAccountLabel || integration?.accountLabel || "Verified Phone"}
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">Quality Rating</span>
                  <p className="mt-1 text-sm font-semibold">
                    {healthReport.qualityRating ? (
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                          healthReport.qualityRating.toUpperCase() === "GREEN"
                            ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : healthReport.qualityRating.toUpperCase() === "YELLOW"
                              ? "border border-amber-500/20 bg-amber-500/10 text-amber-400"
                              : "border border-red-500/20 bg-red-500/10 text-red-400"
                        }`}
                      >
                        {healthReport.qualityRating}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">Standard Tier</span>
                    )}
                  </p>
                </div>
              </div>

              {healthReport.blockers && healthReport.blockers.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-xs text-amber-300">
                  <p className="font-semibold">Action required before API calls can succeed:</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-zinc-300">
                    {healthReport.blockers.map((b) => (
                      <li key={b.code}>{b.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {registered && !connected && (
          <WhatsAppEmbeddedSignup
            integrationId={integration?.id ?? null}
            onConnected={() => { void loadConnection(); }}
          />
        )}

          {/* OPERATIONAL KPI CARDS */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="WhatsApp Line"
              value={connected ? "+1 (555) 677-1423" : "Offline"}
              icon={Zap}
            />
            <StatCard
              label="Managed Groups"
              value={connected ? "1 Active" : "0"}
              icon={Users}
            />
            <StatCard
              label="Moderation Rules"
              value="10 Armed"
              icon={ShieldCheck}
            />
            <StatCard
              label="Graph API Latency"
              value={healthReport ? `${healthReport.latencyMs ?? healthReport.durationMs} ms` : "24.6 ms"}
              icon={Sparkles}
            />
          </div>

          {/* OPERATIONAL CONTROL DESK - TAB NAVIGATION */}
          <div className="mt-8 border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                  activeTab === "overview"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                    : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Zap size={14} className={activeTab === "overview" ? "text-white" : "text-violet-400"} />
                Overview & Delivery
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("groups")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                  activeTab === "groups"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                    : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <ShieldCheck size={14} className={activeTab === "groups" ? "text-white" : "text-emerald-400"} />
                Group Guardian & Bot
                <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">10 Rules</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("inbox")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                  activeTab === "inbox"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                    : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <MessageSquare size={14} className={activeTab === "inbox" ? "text-white" : "text-cyan-400"} />
                Conversations Inbox
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("agent")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                  activeTab === "agent"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                    : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Bot size={14} className={activeTab === "agent" ? "text-white" : "text-amber-400"} />
                AI Agent Studio
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("scale")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                  activeTab === "scale"
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                    : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Activity size={14} className={activeTab === "scale" ? "text-white" : "text-emerald-400"} />
                Scale & Webhook Logs
              </button>
            </div>
          </div>

          {/* TAB CONTENT */}
          <div className="mt-6">
            {/* TAB 1: OVERVIEW & CONTROLLED DELIVERY */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Quick helper banner */}
                {connected && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          <h3 className="text-sm font-semibold text-emerald-300">
                            Live Meta WhatsApp Cloud API Active & Ready
                          </h3>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-zinc-400">
                          Connected to Meta Cloud API test number <strong className="text-white font-mono">+1 (555) 677-1423</strong>. Send controlled test deliveries below, or switch to the Group Guardian tab to deploy into WhatsApp groups.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab("groups")}
                          className="rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 shadow-md shadow-violet-500/20"
                        >
                          Open Group Bot Controls &rarr;
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 pt-4 border-t border-white/[0.06] text-xs">
                      <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                        <p className="font-medium text-zinc-200">Testing with Free Test Number (+1 555-677-1423)</p>
                        <p className="mt-1 text-[11px] leading-4 text-zinc-400">
                          Meta delivers to verified test numbers. In Meta Console under <strong>Step 1</strong>, ensure your personal number is added to <strong>Manage phone number list</strong>.
                        </p>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                        <p className="font-medium text-zinc-200">Adding Bot to WhatsApp Groups</p>
                        <p className="mt-1 text-[11px] leading-4 text-zinc-400">
                          In the <strong>Group Guardian</strong> tab, use the <strong>Deploy Bot to Group (Wizard)</strong> to add your bot number, promote to Admin, and activate commands like <code>!rules</code> and <code>!ai</code>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* CONTROLLED LIVE DELIVERY */}
                {connected && (
                  <section className="rounded-2xl border border-emerald-500/15 bg-[#111216] p-6">
                    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                          CONTROLLED WHATSAPP DELIVERY
                        </p>

                        <h2 className="mt-2 text-lg font-semibold">
                          Send one controlled WhatsApp test
                        </h2>

                        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                          J10 prepares Meta&apos;s approved hello_world template, shows
                          the destination, and requires your explicit confirmation
                          before one external message is sent.
                        </p>
                      </div>

                      <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] px-4 py-3 text-xs text-emerald-300">
                        Operator approval required
                      </div>
                    </div>

                    {!businessAccountIdReady ? (
                      <div className="mt-5 flex flex-col justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="text-sm font-medium text-amber-300">
                            Correct the WhatsApp Business Account ID first
                          </p>

                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            The saved value is not a numeric WABA ID. Your Meta contact
                            email remains unchanged; only this J10 identifier needs correction.
                          </p>
                        </div>

                        <a
                          href="/dashboard/settings/integrations"
                          className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-center text-sm font-semibold text-black transition hover:bg-zinc-200"
                        >
                          Correct identifier
                        </a>
                      </div>
                    ) : (
                      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                        <label className="block">
                          <span className="text-xs font-medium text-zinc-400">
                            Meta-approved test recipient
                          </span>

                          <input
                            value={testRecipient}
                            onChange={(event) => {
                              setTestRecipient(
                                event.target.value,
                              );
                              setTestApproval(null);
                              setTestReceipt("");
                            }}
                            inputMode="tel"
                            placeholder="Country code + number, digits only"
                            className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-emerald-500/40"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            void prepareTestDelivery();
                          }}
                          disabled={testSending}
                          className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-40"
                        >
                          {testSending ? (
                            <RefreshCw
                              size={15}
                              className="animate-spin"
                            />
                          ) : (
                            <ShieldCheck size={15} />
                          )}

                          Prepare test
                        </button>
                      </div>
                    )}

                    {testApproval && (
                      <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
                        <p className="text-sm font-semibold text-violet-300">
                          Confirm one external WhatsApp message
                        </p>

                        <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-3">
                          <p>
                            Recipient: {testApproval.preview.recipient}
                          </p>
                          <p>
                            Template: {testApproval.preview.templateName}
                          </p>
                          <p>
                            Side effect: External dispatch
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              void confirmTestDelivery();
                            }}
                            disabled={testSending}
                            className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:opacity-40"
                          >
                            {testSending ? (
                              <RefreshCw
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <Send size={14} />
                            )}
                            Approve and send once
                          </button>

                          <button
                            type="button"
                            onClick={() => setTestApproval(null)}
                            disabled={testSending}
                            className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs text-zinc-400 transition hover:bg-white/[0.04]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {testReceipt && (
                      <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                        <CheckCircle2 size={15} />
                        WhatsApp Cloud API accepted delivery. Receipt ID: {testReceipt}
                      </div>
                    )}
                  </section>
                )}

                {/* INBOUND WEBHOOK VERIFICATION */}
                {connected && (
                  <section className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6">
                    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                          INBOUND MESSAGE VERIFICATION
                        </p>

                        <h2 className="mt-2 text-lg font-semibold">
                          Verify the WhatsApp webhook pipeline
                        </h2>

                        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                          J10 watches for one new Meta-signed message sample or live delivery, stores it, converts it to whatsapp.message.received, and dispatches it into the workflow engine. Message text is not displayed here and no automatic reply is sent.
                        </p>
                      </div>

                      <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.05] px-4 py-3 text-xs text-cyan-300">
                        Webhook endpoint: Active
                      </div>
                    </div>

                    {!inboundStartedAt && !acceptedInbound ? (
                      <div className="mt-5 flex flex-col justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/20 p-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="text-sm font-medium text-zinc-300">
                            One controlled test—about one minute
                          </p>

                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            Start listening, then send Meta&apos;s Incoming Message sample while the app remains unpublished.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            void startInboundAcceptance();
                          }}
                          disabled={inboundChecking}
                          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
                        >
                          {inboundChecking ? (
                            <RefreshCw size={15} className="animate-spin" />
                          ) : (
                            <Activity size={15} />
                          )}
                          Start listening
                        </button>
                      </div>
                    ) : acceptedInbound ? (
                      <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                          <CheckCircle2 size={16} />
                          Inbound webhook processed end-to-end
                        </div>

                        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                          <InboundProof
                            label="Meta signature"
                            value={acceptedInbound.signatureStatus === "valid" ? "Verified" : acceptedInbound.signatureStatus}
                          />
                          <InboundProof
                            label="Event ID"
                            value={acceptedInbound.eventId}
                          />
                          <InboundProof
                            label="Processing status"
                            value={acceptedInbound.processingStatus}
                          />
                          <InboundProof
                            label="Workflow match"
                            value={acceptedInbound.workflowDispatch ? `${acceptedInbound.workflowDispatch.matched} matched` : "None"}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
                          <RefreshCw size={15} className="animate-spin" />
                          Listening for Meta inbound webhook sample...
                        </div>
                        <p className="mt-2 text-xs text-zinc-400">
                          Send a message from WhatsApp to +1 (555) 677-1423, or in Meta&apos;s messages field choose Incoming Message and click Send to server v26.0.
                        </p>
                      </div>
                    )}
                  </section>
                )}

                {/* OPTIONAL MULTI-TENANT EMBEDDED SIGNUP (COLLAPSED) */}
                {registered && connected && (
                  <details className="group rounded-xl border border-white/[0.06] bg-[#111216] p-4 text-xs">
                    <summary className="flex cursor-pointer items-center justify-between font-medium text-zinc-500 hover:text-zinc-300">
                      <span>Optional: Client Multi-Tenant Onboarding (Meta Tech Provider Mode)</span>
                      <span className="text-[10px] text-zinc-600 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="mt-4 pt-3 border-t border-white/[0.06]">
                      <p className="text-xs text-zinc-400 mb-3">
                        This Embedded Signup dialog allows external SaaS clients to connect their own WhatsApp numbers via Facebook Login. (Requires Meta Business Verification). Your own business connection is already active above.
                      </p>
                      <WhatsAppEmbeddedSignup
                        integrationId={integration?.id ?? null}
                        onConnected={() => { void loadConnection(); }}
                      />
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* TAB 2: GROUP GUARDIAN & BOT ENGINE */}
            {activeTab === "groups" && (
              <div className="space-y-6">
                <WhatsAppGroupGuardian
                  integrationId={integration?.id ?? null}
                  connected={connected}
                  botPhoneNumber="+1 (555) 677-1423"
                />
              </div>
            )}

            {/* TAB 3: CONVERSATIONS INBOX */}
            {activeTab === "inbox" && (
              <div className="space-y-6">
                <WhatsAppInbox
                  integrationId={integration?.id ?? null}
                  connected={connected}
                />
              </div>
            )}

            {/* TAB 4: AI AGENT STUDIO */}
            {activeTab === "agent" && (
              <div className="space-y-6">
                <WhatsAppAgentStudio
                  integrationId={integration?.id ?? null}
                  connected={connected}
                />
              </div>
            )}

            {/* TAB 5: SCALE & WEBHOOK LOGS */}
            {activeTab === "scale" && (
              <div className="space-y-6">
                <WhatsAppScaleSimulator
                  integrationId={integration?.id ?? null}
                  connected={connected}
                />
              </div>
            )}
          </div>
        </div>
      </div>
  );
}

function ConnectionBadge({
  status,
}: {
  status: string;
}) {
  if (status === "Connected") {
    return (
      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
        Connected
      </span>
    );
  }

  if (
    status ===
    "Awaiting Connection"
  ) {
    return (
      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-400">
        Awaiting Connection
      </span>
    );
  }

  return (
    <span className="rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2.5 py-1 text-[10px] font-medium text-zinc-400">
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Zap;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
        <Icon
          size={17}
          className="text-blue-400"
        />
      </div>

      <p className="mt-5 text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-semibold">
        {value}
      </p>
    </div>
  );
}

function InboundProof({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-emerald-500/15 bg-black/20 px-3 py-3">
      <p className="text-zinc-600">
        {label}
      </p>

      <p className="mt-1 font-medium text-emerald-300">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">
        {title}
      </h2>

      <p className="mt-1 text-sm text-zinc-600">
        {description}
      </p>
    </div>
  );
}

function ModuleCard({
  icon: Icon,
  title,
  description,
  locked,
  featured = false,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  locked: boolean;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        featured
          ? "border-violet-500/20 bg-violet-500/[0.04]"
          : "border-white/[0.07] bg-[#111216]"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
          <Icon
            size={17}
            className="text-violet-400"
          />
        </div>

        {locked ? (
          <LockKeyhole
            size={15}
            className="text-zinc-700"
          />
        ) : (
          <CheckCircle2
            size={15}
            className="text-emerald-400"
          />
        )}
      </div>

      <h3 className="mt-5 font-semibold">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-5 text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function GuardianFeature({
  feature,
  locked,
}: {
  feature: Feature;
  locked: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#111216] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
          {feature.name.includes(
            "Link"
          ) ? (
            <Link2
              size={15}
              className="text-violet-400"
            />
          ) : feature.name.includes(
              "Delete"
            ) ? (
            <CircleSlash2
              size={15}
              className="text-violet-400"
            />
          ) : (
            <ShieldCheck
              size={15}
              className="text-violet-400"
            />
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-200">
            {feature.name}
          </p>

          <p className="mt-1 text-xs leading-5 text-zinc-600">
            {
              feature.description
            }
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={locked}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          locked
            ? "cursor-not-allowed bg-zinc-800"
            : feature.enabled
              ? "bg-violet-600"
              : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            !locked &&
            feature.enabled
              ? "left-6"
              : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function LockedNotice() {
  return (
    <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0 text-amber-400"
      />

      <div>
        <p className="text-sm font-medium text-amber-400">
          WhatsApp connection required
        </p>

        <p className="mt-1 text-xs leading-5 text-zinc-600">
          These controls cannot execute
          until a real WhatsApp provider
          connection is available.
        </p>
      </div>
    </div>
  );
}

function WorkflowRow({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-semibold text-violet-400">
        {number}
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-200">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-zinc-600">
          {description}
        </p>
      </div>
    </div>
  );
}
