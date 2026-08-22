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
  AtSign,
  Ban,
  Bot,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderOpen,
  KeyRound,
  LockKeyhole,
  Mail,
  Megaphone,
  MessageCircle,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Video,
  Webhook,
  Workflow,
  X,
  Zap,
} from "lucide-react";

import IntegrationOperationsPanel from "../../../../components/integrations/IntegrationOperationsPanel";
import DashboardLayout from "../../../../components/dashboard/DashboardLayout";

type IntegrationStatus =
  | "not_configured"
  | "pending"
  | "connected"
  | "degraded"
  | "disconnected"
  | "error"
  | "revoked"
  | "disabled";

type IntegrationAvailability =
  | "planned"
  | "development"
  | "beta"
  | "available";

type IntegrationEnvironment =
  | "development"
  | "sandbox"
  | "production";

type SetupField = {
  key: string;
  label: string;
  kind: "text" | "url" | "secret";
  required: boolean;
  storage: "connection" | "credential_vault";
  placeholder: string | null;
  helpText: string | null;
};

type IntegrationCapability = {
  id: string;
  name: string;
  kind: "trigger" | "action";
  description: string;
  requiresApprovalByDefault: boolean;
};

type SafeConnection = {
  id: string;
  providerId: string;
  provider: string;
  name: string;
  status: IntegrationStatus;
  environment: IntegrationEnvironment;
  externalAccountId: string | null;
  externalAccountLabel: string | null;
  grantedScopes: string[];
  enabledCapabilities: string[];
  publicConfiguration: Record<
    string,
    string | number | boolean | null
  >;
  hasCredentials: boolean;
  lastConnectedAt: string | null;
  lastHealthCheckAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type Integration = {
  provider: string;
  providerId: string;
  name: string;
  category: string;
  description: string;
  availability: IntegrationAvailability;
  iconKey: string;
  accentColor: string;
  auth: {
    type: string;
    requiredScopes: string[];
    supportsRefreshTokens: boolean;
    setupFields: SetupField[];
  };
  environments: IntegrationEnvironment[];
  webhookSupport: string;
  supportsHealthChecks: boolean;
  capabilities: IntegrationCapability[];
  connection: SafeConnection | null;
  id: string | null;
  status: IntegrationStatus;
  accountLabel: string | null;
  externalAccountId: string | null;
  connectedAt: string | null;
  metadata: Record<string, string | number | boolean | null>;
  hasCredentials: boolean;
  registered: boolean;
};

type IntegrationSummary = {
  total: number;
  totalProviders: number;
  registered: number;
  connected: number;
  pending: number;
  degraded: number;
  disconnected: number;
  errors: number;
  needsAttention: number;
};

type IntegrationsResponse = {
  success: boolean;
  integrations?: Integration[];
  summary?: Partial<IntegrationSummary>;
  error?: string;
};

type IntegrationReadinessState =
  | "blocked"
  | "needs_configuration"
  | "needs_credentials"
  | "needs_authorization"
  | "ready"
  | "operational"
  | "attention";

type IntegrationReadinessCheck = {
  code: string;
  label: string;
  status: "pass" | "warning" | "fail";
  message: string;
};

type IntegrationReadinessReport = {
  connectionId: string;
  providerId: string;
  connectionStatus: IntegrationStatus;
  evaluatedAt: string;
  state: IntegrationReadinessState;
  readyForUse: boolean;
  canRunHealthCheck: boolean;
  healthCheckMode: "configuration" | "none";
  checks: IntegrationReadinessCheck[];
  blockers: IntegrationReadinessCheck[];
  warnings: IntegrationReadinessCheck[];
  nextAction: string;
};

type ReadinessResponse = {
  success: boolean;
  readiness?: Record<string, IntegrationReadinessReport>;
  error?: string;
};

type HealthCheckResponse = {
  success: boolean;
  result?: {
    outcome: "passed" | "blocked" | "unsupported";
    message: string;
    readiness: IntegrationReadinessReport;
  };
  error?: string;
};

type SetupSubmission = {
  name: string;
  environment: IntegrationEnvironment;
  values: Record<string, string>;
};

const emptySummary: IntegrationSummary = {
  total: 0,
  totalProviders: 0,
  registered: 0,
  connected: 0,
  pending: 0,
  degraded: 0,
  disconnected: 0,
  errors: 0,
  needsAttention: 0,
};

const providerIcons: Record<string, typeof Plug> = {
  gmail: Mail,
  "outlook-mail": Mail,
  "google-calendar": CalendarDays,
  "outlook-calendar": CalendarDays,
  "whatsapp-business": MessageCircle,
  slack: MessageCircle,
  discord: MessageCircle,
  telegram: Send,
  shopify: ShoppingBag,
  woocommerce: ShoppingBag,
  stripe: CreditCard,
  paypal: CreditCard,
  github: Code2,
  "generic-webhook": Webhook,
  openai: BrainCircuit,
  anthropic: BrainCircuit,
  gemini: Sparkles,
  runway: Video,
  youtube: Video,
  x: AtSign,
};

const categoryIcons: Record<string, typeof Plug> = {
  communication: MessageCircle,
  productivity: FileSpreadsheet,
  "file-storage": FolderOpen,
  "project-management": Workflow,
  crm: Database,
  marketing: Megaphone,
  "social-media": AtSign,
  commerce: ShoppingBag,
  payments: CreditCard,
  finance: CreditCard,
  automation: Workflow,
  "developer-tools": Code2,
  "ai-models": Bot,
  "creative-ai": Sparkles,
};

function setupBlockReason(
  integration: Integration,
): string | null {
  if (
    integration.availability ===
    "planned"
  ) {
    return "Coming soon";
  }

  if (
    integration.auth.type ===
      "oauth2" &&
    integration.auth.setupFields
      .length === 0 &&
    !integration.registered
  ) {
    return "OAuth coming next";
  }

  return null;
}

export default function IntegrationsPage() {
  const [
    integrations,
    setIntegrations,
  ] = useState<Integration[]>([]);

  const [
    summary,
    setSummary,
  ] =
    useState<IntegrationSummary>(
      emptySummary,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionId,
    setActionId,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("all");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  const [
    selectedIntegration,
    setSelectedIntegration,
  ] =
    useState<Integration | null>(
      null,
    );

  const [
    operationsIntegration,
    setOperationsIntegration,
  ] =
    useState<Integration | null>(
      null,
    );

  const [
    modalSaving,
    setModalSaving,
  ] = useState(false);

  const [
    modalError,
    setModalError,
  ] = useState("");

  const [
    readinessByConnectionId,
    setReadinessByConnectionId,
  ] = useState<
    Record<
      string,
      IntegrationReadinessReport
    >
  >({});

  const loadIntegrations =
    useCallback(async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response =
          await fetch(
            "/api/integrations",
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as
            IntegrationsResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Could not load integrations.",
          );
        }

        setIntegrations(
          data.integrations ?? [],
        );

        setSummary({
          ...emptySummary,
          ...data.summary,
        });

        try {
          const readinessResponse =
            await fetch(
              "/api/integrations/readiness",
              {
                method: "GET",
                cache: "no-store",
              },
            );

          const readinessData =
            (await readinessResponse.json()) as
              ReadinessResponse;

          if (
            readinessResponse.ok &&
            readinessData.success
          ) {
            setReadinessByConnectionId(
              readinessData.readiness ??
                {},
            );
          } else {
            console.warn(
              "Integration readiness load warning:",
              readinessData.error,
            );

            setReadinessByConnectionId(
              {},
            );
          }
        } catch (
          readinessError
        ) {
          console.warn(
            "Integration readiness load warning:",
            readinessError,
          );

          setReadinessByConnectionId(
            {},
          );
        }
      } catch (error) {
        console.error(
          "Integration load error:",
          error,
        );

        setReadinessByConnectionId(
          {},
        );

        setErrorMessage(
          "Could not load integrations. Check your connection and try again.",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout =
      window.setTimeout(() => {
        setSuccessMessage("");
      }, 4500);

    return () =>
      window.clearTimeout(
        timeout,
      );
  }, [successMessage]);

  const categories =
    useMemo(
      () =>
        [
          ...new Set(
            integrations.map(
              (integration) =>
                integration.category,
            ),
          ),
        ].sort(),
      [integrations],
    );

  const setupEnabledCount =
    useMemo(
      () =>
        integrations.filter(
          (integration) =>
            !setupBlockReason(
              integration,
            ),
        ).length,
      [integrations],
    );

  const healthCheckReadyCount =
    useMemo(
      () =>
        Object.values(
          readinessByConnectionId,
        ).filter(
          (report) =>
            report.canRunHealthCheck,
        ).length,
      [readinessByConnectionId],
    );

  const filteredIntegrations =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return integrations.filter(
        (integration) => {
          const readiness =
            integration.id
              ? readinessByConnectionId[
                  integration.id
                ]
              : undefined;

          const matchesSearch =
            !query ||
            integration.name
              .toLowerCase()
              .includes(query) ||
            integration.category
              .toLowerCase()
              .includes(query) ||
            integration.description
              .toLowerCase()
              .includes(query);

          const matchesCategory =
            categoryFilter ===
              "all" ||
            integration.category ===
              categoryFilter;

          const matchesStatus =
            statusFilter ===
              "all" ||
            (
              statusFilter ===
                "setup-enabled" &&
              !setupBlockReason(
                integration,
              )
            ) ||
            (
              statusFilter ===
                "planned" &&
              integration.availability ===
                "planned"
            ) ||
            (
              statusFilter ===
                "development" &&
              integration.availability ===
                "development"
            ) ||
            (
              statusFilter ===
                "registered" &&
              integration.registered
            ) ||
            (
              statusFilter ===
                "connected" &&
              integration.status ===
                "connected"
            ) ||
            (
              statusFilter ===
                "readiness-ready" &&
              readiness
                ?.canRunHealthCheck ===
                true
            ) ||
            (
              statusFilter ===
                "readiness-blocked" &&
              readiness !==
                undefined &&
              readiness
                .canRunHealthCheck ===
                false
            ) ||
            (
              statusFilter ===
                "attention" &&
              [
                "degraded",
                "disconnected",
                "error",
                "revoked",
              ].includes(
                integration.status,
              )
            );

          return (
            matchesSearch &&
            matchesCategory &&
            matchesStatus
          );
        },
      );
    }, [
      categoryFilter,
      integrations,
      readinessByConnectionId,
      search,
      statusFilter,
    ]);

  async function saveIntegrationSetup(
    integration: Integration,
    submission: SetupSubmission,
  ) {
    if (
      modalSaving ||
      setupBlockReason(
        integration,
      )
    ) {
      return;
    }

    setModalSaving(true);
    setModalError("");

    let connectionId =
      integration.id;

    let newlyCreatedId:
      string | null = null;

    try {
      const connectionFields =
        integration.auth.setupFields
          .filter(
            (field) =>
              field.storage ===
              "connection",
          );

      const credentialFields =
        integration.auth.setupFields
          .filter(
            (field) =>
              field.storage ===
              "credential_vault",
          );

      const publicConfiguration =
        Object.fromEntries(
          connectionFields
            .map(
              (field) => [
                field.key,

                submission.values[
                  field.key
                ]?.trim() ?? "",
              ],
            )
            .filter(
              ([, value]) =>
                value !== "",
            ),
        );

      if (
        !integration.registered
      ) {
        const missingPublicField =
          connectionFields.find(
            (field) =>
              field.required &&
              !submission.values[
                field.key
              ]?.trim(),
          );

        if (
          missingPublicField
        ) {
          throw new Error(
            `${missingPublicField.label} is required.`,
          );
        }

        const registerResponse =
          await fetch(
            "/api/integrations",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  providerId:
                    integration.providerId,

                  name:
                    submission.name,

                  environment:
                    submission.environment,

                  publicConfiguration,

                  enabledCapabilities:
                    [],
                }),
            },
          );

        const registerData =
          await registerResponse
            .json();

        if (
          !registerResponse.ok ||
          !registerData.success ||
          !registerData.integration
            ?.id
        ) {
          throw new Error(
            registerData.error ||
              `Could not register ${integration.name}.`,
          );
        }

        connectionId =
          registerData.integration.id;

        newlyCreatedId =
          connectionId;
      }

      if (!connectionId) {
        throw new Error(
          "Integration connection ID is missing.",
        );
      }

      const credentialValues =
        Object.fromEntries(
          credentialFields
            .map(
              (field) => [
                field.key,

                submission.values[
                  field.key
                ]?.trim() ?? "",
              ],
            )
            .filter(
              ([, value]) =>
                value !== "",
            ),
        );

      const isCredentialSetupRequired =
        !integration.hasCredentials &&
        credentialFields.some(
          (field) =>
            field.required,
        );

      const isRotatingCredentials =
        Object.keys(
          credentialValues,
        ).length > 0;

      if (
        isCredentialSetupRequired ||
        isRotatingCredentials
      ) {
        const missingCredentialField =
          credentialFields.find(
            (field) =>
              field.required &&
              !credentialValues[
                field.key
              ],
          );

        if (
          missingCredentialField
        ) {
          throw new Error(
            `${missingCredentialField.label} is required.`,
          );
        }

        const credentialResponse =
          await fetch(
            `/api/integrations/${encodeURIComponent(
              connectionId,
            )}/credentials`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  values:
                    credentialValues,
                }),
            },
          );

        const credentialData =
          await credentialResponse
            .json();

        if (
          !credentialResponse.ok ||
          !credentialData.success
        ) {
          if (
            newlyCreatedId
          ) {
            await fetch(
              `/api/integrations/${encodeURIComponent(
                newlyCreatedId,
              )}`,
              {
                method:
                  "DELETE",
              },
            );
          }

          throw new Error(
            credentialData.error ||
              `Could not secure ${integration.name} credentials.`,
          );
        }
      }

      setSelectedIntegration(
        null,
      );

      setSuccessMessage(
        `${integration.name} setup saved securely.`,
      );

      await loadIntegrations();
    } catch (error) {
      console.error(
        "Integration setup error:",
        error,
      );

      setModalError(
        error instanceof Error
          ? error.message
          : `Could not configure ${integration.name}.`,
      );
    } finally {
      setModalSaving(false);
    }
  }

  async function removeIntegration(
    integration: Integration,
  ) {
    if (
      !integration.id ||
      actionId
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Remove ${integration.name} and its securely stored credentials from this workspace?`,
      );

    if (!confirmed) {
      return;
    }

    setActionId(
      integration.id,
    );

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          `/api/integrations/${encodeURIComponent(
            integration.id,
          )}`,
          {
            method: "DELETE",
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
            `Could not remove ${integration.name}.`,
        );
      }

      setSuccessMessage(
        `${integration.name} removed successfully.`,
      );

      await loadIntegrations();
    } catch (error) {
      console.error(
        "Integration removal error:",
        error,
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : `Could not remove ${integration.name}.`,
      );
    } finally {
      setActionId("");
    }
  }

  async function runHealthCheck(
    integration: Integration,
  ) {
    const connectionId =
      integration.id;

    if (
      !connectionId ||
      actionId
    ) {
      return;
    }

    setActionId(
      `health:${connectionId}`,
    );

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          `/api/integrations/${encodeURIComponent(
            connectionId,
          )}/readiness`,
          {
            method: "POST",
          },
        );

      const data =
        (await response.json()) as
          HealthCheckResponse;

      if (
        !response.ok ||
        !data.success ||
        !data.result
      ) {
        throw new Error(
          data.error ||
            `Could not check ${integration.name}.`,
        );
      }

      const result =
        data.result;

      setReadinessByConnectionId(
        (current) => ({
          ...current,

          [connectionId]:
            result.readiness,
        }),
      );

      await loadIntegrations();

      if (
        result.outcome ===
        "passed"
      ) {
        setSuccessMessage(
          result.message,
        );
      } else {
        setErrorMessage(
          result.message,
        );
      }
    } catch (error) {
      console.error(
        "Integration health check error:",
        error,
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : `Could not check ${integration.name}.`,
      );
    } finally {
      setActionId("");
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] pb-12">
        <header className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0d0e12] p-6 lg:p-8">
          <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl" />

          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />

          <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
                <Plug size={14} />

                J10 NEXUS CONNECTOR CLOUD
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white lg:text-4xl">
                Integration Command Center
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                One catalog for communication, CRM, commerce, finance,
                productivity, automation, developer tools, and AI providers.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadIntegrations()
              }
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-300 transition hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-white disabled:opacity-40"
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh connections
            </button>
          </div>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Connector Cloud"
            value={
              summary.totalProviders
            }
            detail={`${setupEnabledCount} setup paths enabled`}
            icon={Plug}
            tone="violet"
          />

          <StatCard
            label="Workspace"
            value={
              summary.registered
            }
            detail="Registered connections"
            icon={Activity}
            tone="blue"
          />

          <StatCard
            label="Check Ready"
            value={
              healthCheckReadyCount
            }
            detail={`${summary.connected} live connected`}
            icon={CheckCircle2}
            tone="emerald"
          />

          <StatCard
            label="Needs Attention"
            value={
              summary.needsAttention
            }
            detail="Review connection state"
            icon={AlertTriangle}
            tone="amber"
          />
        </section>

        <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <ShieldCheck
                size={19}
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-emerald-300">
                Secure credential architecture active
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                API keys and access tokens are encrypted server-side. Planned
                connectors remain locked until their adapter is implemented.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
            <LockKeyhole
              size={14}
            />

            AES-256-GCM protected
          </div>
        </section>

        {successMessage && (
          <MessageBanner
            tone="success"
            icon={CheckCircle2}
          >
            {successMessage}
          </MessageBanner>
        )}

        {errorMessage && (
          <MessageBanner
            tone="error"
            icon={AlertTriangle}
          >
            {errorMessage}
          </MessageBanner>
        )}

        <section className="mt-5 rounded-2xl border border-white/[0.07] bg-[#0d0e12] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
              />

              <input
                value={search}
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event.target
                      .value,
                  )
                }
                placeholder="Search Outlook, Slack, HubSpot, Shopify, AI..."
                className="w-full rounded-xl border border-white/[0.07] bg-[#090a0d] py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-500/40"
              />
            </div>

            <SlidersHorizontal
              size={16}
              className="text-zinc-600"
            />

            <select
              value={
                categoryFilter
              }
              onChange={(
                event,
              ) =>
                setCategoryFilter(
                  event.target
                    .value,
                )
              }
              className="rounded-xl border border-white/[0.07] bg-[#090a0d] px-4 py-3 text-sm text-zinc-300 outline-none focus:border-violet-500/40"
            >
              <option value="all">
                All categories
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={
                      category
                    }
                    value={
                      category
                    }
                  >
                    {formatLabel(
                      category,
                    )}
                  </option>
                ),
              )}
            </select>

            <select
              value={statusFilter}
              onChange={(
                event,
              ) =>
                setStatusFilter(
                  event.target
                    .value,
                )
              }
              className="rounded-xl border border-white/[0.07] bg-[#090a0d] px-4 py-3 text-sm text-zinc-300 outline-none focus:border-violet-500/40"
            >
              <option value="all">
                All statuses
              </option>

              <option value="setup-enabled">
                Setup enabled
              </option>

              <option value="development">
                In development
              </option>

              <option value="planned">
                Coming soon
              </option>

              <option value="registered">
                Registered
              </option>

              <option value="connected">
                Connected
              </option>

              <option value="readiness-ready">
                Check ready
              </option>

              <option value="readiness-blocked">
                Readiness blocked
              </option>

              <option value="attention">
                Needs attention
              </option>
            </select>
          </div>
        </section>

        {loading ? (
          <section className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {[
              1,
              2,
              3,
              4,
              5,
              6,
            ].map(
              (item) => (
                <div
                  key={item}
                  className="h-[380px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0d0e12]"
                />
              ),
            )}
          </section>
        ) : filteredIntegrations
            .length > 0 ? (
          <section className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredIntegrations.map(
              (
                integration,
              ) => (
                <IntegrationCard
                  key={
                    integration.providerId
                  }
                  integration={
                    integration
                  }
                  removing={
                    actionId ===
                    integration.id
                  }
                  checking={
                    actionId ===
                    `health:${integration.id}`
                  }
                  readiness={
                    integration.id
                      ? readinessByConnectionId[
                          integration
                            .id
                        ]
                      : undefined
                  }
                  onSetup={() => {
                    if (
                      setupBlockReason(
                        integration,
                      )
                    ) {
                      return;
                    }

                    setModalError(
                      "",
                    );

                    setSelectedIntegration(
                      integration,
                    );
                  }}
                  onRemove={() =>
                    void removeIntegration(
                      integration,
                    )
                  }
                  onHealthCheck={() =>
                    void runHealthCheck(
                      integration,
                    )
                  }
                  onOpenOperations={() =>
                    setOperationsIntegration(
                      integration,
                    )
                  }
                />
              ),
            )}
          </section>
        ) : (
          <section className="mt-5 rounded-2xl border border-dashed border-white/[0.09] bg-[#0d0e12] px-6 py-16 text-center">
            <Search
              size={26}
              className="mx-auto text-zinc-700"
            />

            <h2 className="mt-4 text-base font-semibold text-zinc-300">
              No integrations found
            </h2>

            <p className="mt-2 text-sm text-zinc-600">
              Try a different search or filter.
            </p>
          </section>
        )}

        {operationsIntegration?.id && (
          <IntegrationOperationsPanel
            key={
              operationsIntegration.id
            }
            integrationId={
              operationsIntegration.id
            }
            integrationName={
              operationsIntegration.name
            }
            onClose={() =>
              setOperationsIntegration(
                null,
              )
            }
          />
        )}

        {selectedIntegration && (
          <SetupModal
            key={
              selectedIntegration.providerId
            }
            integration={
              selectedIntegration
            }
            saving={
              modalSaving
            }
            errorMessage={
              modalError
            }
            onClose={() => {
              if (
                !modalSaving
              ) {
                setSelectedIntegration(
                  null,
                );

                setModalError(
                  "",
                );
              }
            }}
            onSubmit={(
              submission,
            ) =>
              void saveIntegrationSetup(
                selectedIntegration,
                submission,
              )
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function IntegrationCard({
  integration,
  removing,
  checking,
  readiness,
  onSetup,
  onRemove,
  onHealthCheck,
  onOpenOperations,
}: {
  integration: Integration;
  removing: boolean;
  checking: boolean;
  readiness:
    | IntegrationReadinessReport
    | undefined;
  onSetup: () => void;
  onRemove: () => void;
  onHealthCheck: () => void;
  onOpenOperations: () => void;
}) {
  const Icon =
    providerIcons[
      integration.providerId
    ] ??
    categoryIcons[
      integration.category
    ] ??
    Plug;

  const triggerCount =
    integration.capabilities
      .filter(
        (capability) =>
          capability.kind ===
          "trigger",
      ).length;

  const actionCount =
    integration.capabilities
      .filter(
        (capability) =>
          capability.kind ===
          "action",
      ).length;

  const blockReason =
    setupBlockReason(
      integration,
    );

  const buttonLabel =
    blockReason
      ? blockReason
      : !integration.registered
        ? "Set up integration"
        : integration.status ===
            "connected"
          ? "Manage connection"
          : integration
                .hasCredentials
            ? "Review setup"
            : "Secure credentials";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0e12] p-5 transition duration-300 hover:-translate-y-0.5 hover:border-violet-500/25">
      <div
        className="absolute -right-16 -top-16 h-36 w-36 rounded-full opacity-10 blur-3xl transition group-hover:opacity-20"
        style={{
          backgroundColor:
            integration.accentColor,
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl border"
            style={{
              color:
                integration.accentColor,

              backgroundColor:
                `${integration.accentColor}12`,

              borderColor:
                `${integration.accentColor}30`,
            }}
          >
            <Icon size={21} />
          </div>

          <StatusBadge
            status={
              integration.status
            }
            availability={
              integration.availability
            }
            registered={
              integration.registered
            }
          />
        </div>

        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            {formatLabel(
              integration.category,
            )}
          </p>

          <h2 className="mt-2 text-lg font-semibold text-white">
            {integration.name}
          </h2>

          <p className="mt-2 min-h-[44px] text-sm leading-[22px] text-zinc-500">
            {
              integration.description
            }
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <CapabilityMetric
            label="Triggers"
            value={triggerCount}
            icon={CircleDot}
          />

          <CapabilityMetric
            label="Actions"
            value={actionCount}
            icon={Zap}
          />
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-600">
              Authentication
            </span>

            <span className="text-xs font-medium text-zinc-300">
              {formatLabel(
                integration.auth
                  .type,
              )}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-600">
              Setup
            </span>

            <span
              className={`flex items-center gap-1.5 text-xs font-medium ${
                integration.hasCredentials
                  ? "text-emerald-400"
                  : blockReason
                    ? "text-amber-400"
                    : "text-zinc-500"
              }`}
            >
              {integration.hasCredentials ? (
                <ShieldCheck
                  size={12}
                />
              ) : blockReason ? (
                <Clock3
                  size={12}
                />
              ) : (
                <KeyRound
                  size={12}
                />
              )}

              {integration.hasCredentials
                ? "Credentials secured"
                : blockReason ??
                  "Ready to configure"}
            </span>
          </div>
        </div>

        {integration.connection
          ?.lastErrorMessage && (
          <div className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-3 py-2.5">
            <p className="text-xs leading-5 text-red-300">
              {
                integration
                  .connection
                  .lastErrorMessage
              }
            </p>
          </div>
        )}

        {integration.registered && (
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-600">
                Readiness
              </span>

              {readiness ? (
                <span
                  className={`flex items-center gap-1.5 text-xs font-medium ${readinessTextClass(
                    readiness.state,
                  )}`}
                >
                  {readiness.state ===
                  "attention" ? (
                    <AlertTriangle
                      size={12}
                    />
                  ) : readiness.canRunHealthCheck ? (
                    <ShieldCheck
                      size={12}
                    />
                  ) : (
                    <Clock3
                      size={12}
                    />
                  )}

                  {readinessStateLabel(
                    readiness.state,
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                  <RefreshCw
                    size={12}
                    className="animate-spin"
                  />

                  Evaluating
                </span>
              )}
            </div>

            {readiness && (
              <p className="mt-2 text-[11px] leading-4 text-zinc-600">
                {readiness
                  .blockers[0]
                  ?.message ??
                  readiness.nextAction}
              </p>
            )}

            {integration.connection
              ?.lastHealthCheckAt && (
              <p className="mt-2 text-[10px] text-zinc-700">
                Last configuration
                check:{" "}

                {formatDateTime(
                  integration
                    .connection
                    .lastHealthCheckAt,
                )}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-2 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={onSetup}
            disabled={
              Boolean(
                blockReason,
              )
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-600"
          >
            {blockReason ? (
              <Clock3
                size={14}
              />
            ) : integration.registered ? (
              <Plug
                size={14}
              />
            ) : (
              <Plus
                size={14}
              />
            )}

            {buttonLabel}

            {!blockReason && (
              <ChevronRight
                size={14}
              />
            )}
          </button>

          {integration.registered &&
            integration.id && (
              <button
                type="button"
                onClick={
                  onOpenOperations
                }
                disabled={
                  removing ||
                  checking
                }
                title={`View ${integration.name} operation history`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/[0.05] text-violet-400 transition hover:bg-violet-500/10 disabled:opacity-30"
              >
                <Clock3
                  size={14}
                />
              </button>
            )}
          {integration.registered &&
            integration.id && (
              <button
                type="button"
                onClick={
                  onHealthCheck
                }
                disabled={
                  checking ||
                  removing ||
                  !integration.supportsHealthChecks
                }
                title={
                  integration.supportsHealthChecks
                    ? `Run safe ${integration.name} configuration check`
                    : `${integration.name} has no health-check adapter yet`
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-400 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {checking ? (
                  <RefreshCw
                    size={14}
                    className="animate-spin"
                  />
                ) : (
                  <Activity
                    size={14}
                  />
                )}
              </button>
            )}

          {integration.registered &&
            integration.id && (
              <button
                type="button"
                onClick={
                  onRemove
                }
                disabled={
                  removing ||
                  checking
                }
                title={`Remove ${integration.name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/[0.05] text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
              >
                {removing ? (
                  <RefreshCw
                    size={14}
                    className="animate-spin"
                  />
                ) : (
                  <Trash2
                    size={14}
                  />
                )}
              </button>
            )}
        </div>
      </div>
    </article>
  );
}

function SetupModal({
  integration,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: {
  integration: Integration;
  saving: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (
    submission: SetupSubmission,
  ) => void;
}) {
  const [
    name,
    setName,
  ] = useState(
    integration.connection
      ?.name ??
      integration.name,
  );

  const [
    environment,
    setEnvironment,
  ] =
    useState<IntegrationEnvironment>(
      integration.connection
        ?.environment ??
        integration
          .environments[0] ??
        "development",
    );

  const [
    values,
    setValues,
  ] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      integration.auth.setupFields
        .map((field) => {
          const savedValue =
            field.storage ===
            "connection"
              ? integration
                  .connection
                  ?.publicConfiguration[
                    field.key
                  ]
              : "";

          return [
            field.key,

            savedValue ===
                undefined ||
              savedValue ===
                null
              ? ""
              : String(
                  savedValue,
                ),
          ];
        }),
    ),
  );

  const [
    visibleSecrets,
    setVisibleSecrets,
  ] = useState<
    Record<string, boolean>
  >({});

  const isOAuth =
    integration.auth.type ===
    "oauth2";

  const credentialFields =
    integration.auth.setupFields
      .filter(
        (field) =>
          field.storage ===
          "credential_vault",
      );

  const publicFields =
    integration.auth.setupFields
      .filter(
        (field) =>
          field.storage ===
          "connection",
      );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close integration setup"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />

      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/[0.1] bg-[#0d0e12] shadow-2xl shadow-black/60">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.07] bg-[#0d0e12]/95 px-6 py-5 backdrop-blur-xl">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400">
              SECURE CONNECTOR SETUP
            </p>

            <h2 className="mt-2 text-xl font-semibold text-white">
              {integration.name}
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              {integration.registered
                ? "Review or continue this connection setup."
                : "Add this provider to your J10 NEXUS workspace."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] text-zinc-500 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {errorMessage && (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0"
              />

              {errorMessage}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Connection name"
              required
            >
              <input
                value={name}
                onChange={(
                  event,
                ) =>
                  setName(
                    event.target
                      .value,
                  )
                }
                disabled={
                  integration.registered
                }
                placeholder={
                  integration.name
                }
                className="w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-violet-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </FormField>

            <FormField
              label="Environment"
              required
            >
              <select
                value={
                  environment
                }
                onChange={(
                  event,
                ) =>
                  setEnvironment(
                    event.target
                      .value as IntegrationEnvironment,
                  )
                }
                disabled={
                  integration.registered
                }
                className="w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {integration.environments.map(
                  (item) => (
                    <option
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {formatLabel(
                        item,
                      )}
                    </option>
                  ),
                )}
              </select>
            </FormField>
          </div>

          {isOAuth && (
            <div className="rounded-2xl border border-blue-500/15 bg-blue-500/[0.05] p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  size={19}
                  className="mt-0.5 shrink-0 text-blue-400"
                />

                <div>
                  <p className="text-sm font-semibold text-blue-300">
                    OAuth connector
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    J10 NEXUS uses provider authorization and least-privilege
                    scopes. Provider passwords are never requested or stored.
                  </p>
                </div>
              </div>
            </div>
          )}

          {publicFields.length >
            0 && (
            <SetupFieldSection
              title="Connection details"
              description={
                integration.registered
                  ? "Public connection identifiers are locked after registration."
                  : "These identifiers are connection configuration, not secret credentials."
              }
            >
              {publicFields.map(
                (field) => (
                  <FormField
                    key={
                      field.key
                    }
                    label={
                      field.label
                    }
                    required={
                      field.required
                    }
                    helpText={
                      field.helpText
                    }
                  >
                    <input
                      value={
                        values[
                          field
                            .key
                        ] ?? ""
                      }
                      onChange={(
                        event,
                      ) =>
                        setValues(
                          (
                            current,
                          ) => ({
                            ...current,

                            [field.key]:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                      disabled={
                        integration.registered
                      }
                      placeholder={
                        field.placeholder ??
                        ""
                      }
                      className="w-full rounded-xl border border-white/[0.08] bg-[#090a0d] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-violet-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </FormField>
                ),
              )}
            </SetupFieldSection>
          )}

          {credentialFields.length >
            0 && (
            <SetupFieldSection
              title={
                integration.hasCredentials
                  ? "Rotate credentials"
                  : "Secure credentials"
              }
              description={
                integration.hasCredentials
                  ? "Leave fields empty to keep the current encrypted credentials."
                  : "These values are encrypted before storage and never returned to the browser."
              }
            >
              {credentialFields.map(
                (field) => (
                  <FormField
                    key={
                      field.key
                    }
                    label={
                      field.label
                    }
                    required={
                      field.required &&
                      !integration.hasCredentials
                    }
                    helpText={
                      field.helpText
                    }
                  >
                    <div className="relative">
                      <input
                        type={
                          visibleSecrets[
                            field
                              .key
                          ]
                            ? "text"
                            : "password"
                        }
                        value={
                          values[
                            field
                              .key
                          ] ?? ""
                        }
                        onChange={(
                          event,
                        ) =>
                          setValues(
                            (
                              current,
                            ) => ({
                              ...current,

                              [field.key]:
                                event
                                  .target
                                  .value,
                            }),
                          )
                        }
                        autoComplete="off"
                        placeholder={
                          integration.hasCredentials
                            ? "Leave blank to keep current value"
                            : field.placeholder ??
                              ""
                        }
                        className="w-full rounded-xl border border-white/[0.08] bg-[#090a0d] py-3 pl-4 pr-12 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-violet-500/40"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setVisibleSecrets(
                            (
                              current,
                            ) => ({
                              ...current,

                              [field.key]:
                                !current[
                                  field
                                    .key
                                ],
                            }),
                          )
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 transition hover:text-zinc-300"
                      >
                        {visibleSecrets[
                          field
                            .key
                        ] ? (
                          <EyeOff
                            size={
                              16
                            }
                          />
                        ) : (
                          <Eye
                            size={
                              16
                            }
                          />
                        )}
                      </button>
                    </div>
                  </FormField>
                ),
              )}
            </SetupFieldSection>
          )}

          {integration.registered &&
            publicFields.length >
              0 && (
              <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-zinc-600">
                To change locked public identifiers, remove this integration and
                add it again. Credential rotation does not require removal.
              </p>
            )}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-white/[0.07] bg-[#0d0e12]/95 px-6 py-5 backdrop-blur-xl sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-white/[0.08] px-5 py-3 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={
              saving ||
              !name.trim()
            }
            onClick={() =>
              onSubmit({
                name:
                  name.trim(),

                environment,

                values,
              })
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? (
              <RefreshCw
                size={15}
                className="animate-spin"
              />
            ) : integration.hasCredentials ? (
              <ShieldCheck
                size={15}
              />
            ) : (
              <Plug
                size={15}
              />
            )}

            {saving
              ? "Saving securely..."
              : integration.registered
                ? integration.hasCredentials
                  ? "Save credential changes"
                  : "Secure credentials"
                : "Add to workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupFieldSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-200">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-zinc-600">
          {description}
        </p>
      </div>

      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
}

function FormField({
  label,
  required = false,
  helpText,
  children,
}: {
  label: string;
  required?: boolean;
  helpText?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1 text-xs font-medium text-zinc-400">
        {label}

        {required && (
          <span className="text-red-400">
            *
          </span>
        )}
      </span>

      {children}

      {helpText && (
        <span className="mt-2 block text-[11px] leading-4 text-zinc-600">
          {helpText}
        </span>
      )}
    </label>
  );
}

function CapabilityMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Plug;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2 text-zinc-600">
        <Icon size={12} />

        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>

      <p className="mt-1.5 text-sm font-semibold text-zinc-300">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
  availability,
  registered,
}: {
  status: IntegrationStatus;
  availability: IntegrationAvailability;
  registered: boolean;
}) {
  if (!registered) {
    switch (availability) {
      case "available":
        return (
          <Badge
            label="Available"
            icon={CheckCircle2}
            className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          />
        );

      case "beta":
        return (
          <Badge
            label="Beta"
            icon={Sparkles}
            className="border-blue-500/20 bg-blue-500/10 text-blue-400"
          />
        );

      case "development":
        return (
          <Badge
            label="In development"
            icon={Workflow}
            className="border-violet-500/20 bg-violet-500/10 text-violet-400"
          />
        );

      default:
        return (
          <Badge
            label="Coming soon"
            icon={Clock3}
            className="border-amber-500/20 bg-amber-500/10 text-amber-400"
          />
        );
    }
  }

  switch (status) {
    case "connected":
      return (
        <Badge
          label="Connected"
          icon={CheckCircle2}
          className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
        />
      );

    case "pending":
      return (
        <Badge
          label="Pending"
          icon={CircleDot}
          className="border-blue-500/20 bg-blue-500/10 text-blue-400"
        />
      );

    case "degraded":
      return (
        <Badge
          label="Degraded"
          icon={AlertTriangle}
          className="border-amber-500/20 bg-amber-500/10 text-amber-400"
        />
      );

    case "error":
      return (
        <Badge
          label="Error"
          icon={AlertTriangle}
          className="border-red-500/20 bg-red-500/10 text-red-400"
        />
      );

    case "revoked":
      return (
        <Badge
          label="Revoked"
          icon={Ban}
          className="border-red-500/20 bg-red-500/10 text-red-400"
        />
      );

    case "disabled":
      return (
        <Badge
          label="Disabled"
          icon={Ban}
          className="border-zinc-500/20 bg-zinc-500/10 text-zinc-500"
        />
      );

    default:
      return (
        <Badge
          label="Disconnected"
          icon={Plug}
          className="border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
        />
      );
  }
}

function Badge({
  label,
  icon: Icon,
  className,
}: {
  label: string;
  icon: typeof Plug;
  className: string;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${className}`}
    >
      <Icon size={11} />

      {label}
    </span>
  );
}

function MessageBanner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "success" | "error";
  icon: typeof Plug;
  children: ReactNode;
}) {
  const styles =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : "border-red-500/20 bg-red-500/10 text-red-300";

  return (
    <div
      className={`mt-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}
    >
      <Icon size={17} />

      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Plug;
  tone:
    | "violet"
    | "blue"
    | "emerald"
    | "amber";
}) {
  const tones = {
    violet:
      "bg-violet-500/10 text-violet-400",

    blue:
      "bg-blue-500/10 text-blue-400",

    emerald:
      "bg-emerald-500/10 text-emerald-400",

    amber:
      "bg-amber-500/10 text-amber-400",
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0d0e12] p-5">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <Icon size={17} />
        </div>

        <span className="text-2xl font-semibold tracking-tight text-white">
          {value}
        </span>
      </div>

      <p className="mt-5 text-sm font-medium text-zinc-300">
        {label}
      </p>

      <p className="mt-1 text-xs text-zinc-600">
        {detail}
      </p>
    </div>
  );
}

function readinessStateLabel(
  state: IntegrationReadinessState,
): string {
  switch (state) {
    case "needs_configuration":
      return "Needs configuration";

    case "needs_credentials":
      return "Needs credentials";

    case "needs_authorization":
      return "Needs authorization";

    case "operational":
      return "Operational";

    case "attention":
      return "Needs attention";

    case "ready":
      return "Check ready";

    default:
      return "Blocked";
  }
}

function readinessTextClass(
  state: IntegrationReadinessState,
): string {
  switch (state) {
    case "operational":
    case "ready":
      return "text-emerald-400";

    case "attention":
    case "needs_configuration":
    case "needs_credentials":
    case "needs_authorization":
      return "text-amber-400";

    default:
      return "text-red-400";
  }
}

function formatDateTime(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}