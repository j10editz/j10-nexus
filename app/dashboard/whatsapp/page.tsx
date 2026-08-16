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
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

type IntegrationStatus =
  | "Connected"
  | "Disconnected"
  | "Error";

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
              "whatsapp"
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
            provider: "whatsapp",
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

  const registered =
    integration?.registered ?? false;

  const connected =
    integration?.status ===
    "Connected";

  const connectionStatus =
    loading
      ? "Checking"
      : connected
        ? "Connected"
        : registered
          ? "Awaiting Connection"
          : "Not Added";

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
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm text-emerald-400">
                <CheckCircle2
                  size={16}
                />

                Connection active
              </div>
            )}
          </div>
        </div>

        {/* STATS */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Connection"
            value={
              connected
                ? "Active"
                : "Offline"
            }
            icon={Zap}
          />

          <StatCard
            label="Managed Groups"
            value="0"
            icon={Users}
          />

          <StatCard
            label="Moderation Rules"
            value={String(
              groupGuardianFeatures.length
            )}
            icon={ShieldCheck}
          />

          <StatCard
            label="Capabilities"
            value={String(
              capabilityCount
            )}
            icon={Sparkles}
          />
        </div>

        {/* CONTROL CENTER */}
        <div className="mt-8">
          <SectionTitle
            title="Control Center"
            description="Configure every WhatsApp capability from one workspace."
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ModuleCard
              icon={Bot}
              title="AI Assistant"
              description="Customer support, sales, FAQs, recommendations, lead capture and intelligent replies."
              locked={!connected}
            />

            <ModuleCard
              icon={ShieldCheck}
              title="Group Guardian"
              description="Anti-spam, anti-link, AI moderation, warnings and automatic member actions."
              locked={!connected}
              featured
            />

            <ModuleCard
              icon={Command}
              title="Admin Commands"
              description="Moderation and management commands for authorized administrators."
              locked={!connected}
            />

            <ModuleCard
              icon={Workflow}
              title="Automations"
              description="Trigger workflows from messages, events, moderation decisions and business actions."
              locked={!connected}
            />

            <ModuleCard
              icon={FileText}
              title="Templates"
              description="Deploy ready-made WhatsApp systems for support, sales, groups and operations."
              locked={!connected}
            />

            <ModuleCard
              icon={BarChart3}
              title="Analytics"
              description="Track messages, moderation events, warnings, removals and automation performance."
              locked={!connected}
            />
          </div>
        </div>

        {/* GROUP GUARDIAN */}
        <div className="mt-10">
          <SectionTitle
            title="Group Guardian"
            description="The moderation system for managed WhatsApp communities."
          />

          {!connected && (
            <LockedNotice />
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {groupGuardianFeatures.map(
              (feature) => (
                <GuardianFeature
                  key={feature.name}
                  feature={feature}
                  locked={!connected}
                />
              )
            )}
          </div>
        </div>

        {/* ADMIN COMMANDS */}
        <div className="mt-10">
          <SectionTitle
            title="Admin Commands"
            description="Commands available to approved group administrators."
          />

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111216]">
            <div className="grid grid-cols-[170px_1fr_100px] border-b border-white/[0.06] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              <span>Command</span>
              <span>Description</span>
              <span>Status</span>
            </div>

            {commands.map(
              (item) => (
                <div
                  key={
                    item.command
                  }
                  className="grid grid-cols-[170px_1fr_100px] items-center border-b border-white/[0.05] px-5 py-4 last:border-0"
                >
                  <code className="text-sm text-violet-400">
                    {item.command}
                  </code>

                  <p className="pr-4 text-sm text-zinc-500">
                    {
                      item.description
                    }
                  </p>

                  <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                    {!connected ? (
                      <>
                        <LockKeyhole
                          size={12}
                        />
                        Locked
                      </>
                    ) : (
                      <>
                        <CheckCircle2
                          size={12}
                          className="text-emerald-400"
                        />
                        Ready
                      </>
                    )}
                  </span>
                </div>
              )
            )}
          </div>
        </div>

        {/* EXAMPLE WORKFLOW */}
        <div className="mt-10 pb-10">
          <SectionTitle
            title="Example Moderation Workflow"
            description="How Group Guardian will execute a real moderation event."
          />

          <div className="mt-4 rounded-2xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.05] to-blue-500/[0.03] p-6">
            <div className="space-y-3">
              <WorkflowRow
                number="01"
                title="Message received"
                description="A new message enters a managed WhatsApp group."
              />

              <WorkflowRow
                number="02"
                title="Analyze message"
                description="Check links, spam, flood rules, prohibited content and AI moderation policy."
              />

              <WorkflowRow
                number="03"
                title="Apply moderation rule"
                description="Delete violating content and record the moderation decision."
              />

              <WorkflowRow
                number="04"
                title="Warn member"
                description="Increase the user's warning count when configured."
              />

              <WorkflowRow
                number="05"
                title="Remove repeat offender"
                description="If the warning threshold is reached and participant management is available, remove the member."
              />
            </div>
          </div>
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

