"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Database,
  Mail,
  Megaphone,
  MessageCircle,
  Plug,
  RefreshCw,
  ShoppingBag,
  Trash2,
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

  externalAccountId:
    | string
    | null;

  connectedAt:
    | string
    | null;

  metadata: Record<
    string,
    unknown
  >;

  registered: boolean;
};

type IntegrationSummary = {
  total: number;
  connected: number;
  disconnected: number;
  errors: number;
};

type IntegrationsResponse = {
  success: boolean;

  integrations?: Integration[];

  summary?: IntegrationSummary;

  error?: string;
};

const providerIcons = {
  whatsapp: MessageCircle,
  email: Mail,
  crm: Database,
  marketing: Megaphone,
  notifications: Zap,
  google_calendar: CalendarDays,
  shopify: ShoppingBag,
  stripe: CreditCard,
};

export default function IntegrationsPage() {
  const [
    integrations,
    setIntegrations,
  ] = useState<Integration[]>(
    []
  );

  const [
    summary,
    setSummary,
  ] = useState<IntegrationSummary>({
    total: 0,
    connected: 0,
    disconnected: 0,
    errors: 0,
  });

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionProvider,
    setActionProvider,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  /*
  ============================================================
  LOAD INTEGRATIONS
  ============================================================
  */

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
              "Could not load integrations."
          );
        }

        setIntegrations(
          data.integrations ?? []
        );

        setSummary(
          data.summary ?? {
            total: 0,
            connected: 0,
            disconnected: 0,
            errors: 0,
          }
        );
      } catch (error) {
        console.error(
          "Integration load error:",
          error
        );

        setErrorMessage(
          "Could not load integrations."
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  /*
  ============================================================
  REGISTER
  ============================================================
  */

  async function registerIntegration(
    integration: Integration
  ) {
    if (actionProvider) {
      return;
    }

    setActionProvider(
      integration.provider
    );

    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/integrations",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              provider:
                integration.provider,
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
            "Could not add integration."
        );
      }

      await loadIntegrations();
    } catch (error) {
      console.error(
        "Integration registration error:",
        error
      );

      setErrorMessage(
        `Could not add ${integration.name}.`
      );
    } finally {
      setActionProvider("");
    }
  }

  /*
  ============================================================
  REMOVE
  ============================================================
  */

  async function removeIntegration(
    integration: Integration
  ) {
    if (actionProvider) {
      return;
    }

    const confirmed =
      window.confirm(
        `Remove ${integration.name} from this workspace?`
      );

    if (!confirmed) {
      return;
    }

    setActionProvider(
      integration.provider
    );

    setErrorMessage("");

    try {
      const response =
        await fetch(
          `/api/integrations?provider=${encodeURIComponent(
            integration.provider
          )}`,
          {
            method:
              "DELETE",
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
            "Could not remove integration."
        );
      }

      await loadIntegrations();
    } catch (error) {
      console.error(
        "Integration removal error:",
        error
      );

      setErrorMessage(
        `Could not remove ${integration.name}.`
      );
    } finally {
      setActionProvider("");
    }
  }

  /*
  ============================================================
  SEARCH
  ============================================================
  */

  const filteredIntegrations =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return integrations;
      }

      return integrations.filter(
        (integration) =>
          integration.name
            .toLowerCase()
            .includes(query) ||
          integration.category
            .toLowerCase()
            .includes(query) ||
          integration.description
            .toLowerCase()
            .includes(query)
      );
    }, [
      integrations,
      search,
    ]);

  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-8">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              J10 NEXUS CONNECTIONS
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Integrations
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Connect external business
              platforms to your J10 NEXUS
              workspace and make your
              automations executable.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadIntegrations();
            }}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#111216] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
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

        {/* STATS */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Available"
            value={
              summary.total
            }
            icon={Plug}
          />

          <StatCard
            label="Connected"
            value={
              summary.connected
            }
            icon={
              CheckCircle2
            }
            type="connected"
          />

          <StatCard
            label="Disconnected"
            value={
              summary.disconnected
            }
            icon={Plug}
            type="disconnected"
          />

          <StatCard
            label="Errors"
            value={
              summary.errors
            }
            icon={
              AlertTriangle
            }
            type="error"
          />
        </div>

        {/* ERROR */}
        {errorMessage && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {/* SEARCH */}
        <div className="mt-6">
          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search integrations..."
            className="w-full max-w-md rounded-xl border border-white/[0.07] bg-[#111216] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-500/30"
          />
        </div>

        {/* CONTENT */}
        {loading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(
              (item) => (
                <div
                  key={item}
                  className="h-[250px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]"
                />
              )
            )}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredIntegrations.map(
              (integration) => (
                <IntegrationCard
                  key={
                    integration.provider
                  }
                  integration={
                    integration
                  }
                  loading={
                    actionProvider ===
                    integration.provider
                  }
                  onRegister={() =>
                    registerIntegration(
                      integration
                    )
                  }
                  onRemove={() =>
                    removeIntegration(
                      integration
                    )
                  }
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/*
============================================================
INTEGRATION CARD
============================================================
*/

function IntegrationCard({
  integration,
  loading,
  onRegister,
  onRemove,
}: {
  integration: Integration;
  loading: boolean;
  onRegister: () => void;
  onRemove: () => void;
}) {
  const Icon =
    providerIcons[
      integration.provider as keyof typeof providerIcons
    ] ?? Plug;

  const connected =
    integration.status ===
    "Connected";

  const hasError =
    integration.status ===
    "Error";

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5 transition-all hover:border-violet-500/20">
      {/* TOP */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/10">
          <Icon
            size={18}
            className="text-violet-400"
          />
        </div>

        <StatusBadge
          status={
            integration.status
          }
        />
      </div>

      {/* INFO */}
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {integration.category}
      </p>

      <h2 className="mt-2 text-base font-semibold text-white">
        {integration.name}
      </h2>

      <p className="mt-2 min-h-[60px] text-sm leading-5 text-zinc-500">
        {integration.description}
      </p>

      {/* CONNECTION INFO */}
      {connected && (
        <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
          <p className="text-xs font-medium text-emerald-400">
            Connected
          </p>

          {integration.accountLabel && (
            <p className="mt-1 text-xs text-zinc-500">
              {
                integration.accountLabel
              }
            </p>
          )}
        </div>
      )}

      {hasError && (
        <div className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[0.04] p-3">
          <p className="text-xs font-medium text-red-400">
            Connection error
          </p>

          <p className="mt-1 text-xs text-zinc-600">
            This integration requires
            attention.
          </p>
        </div>
      )}

      {/* ACTIONS */}
      <div className="mt-5 border-t border-white/[0.06] pt-4">
        {!integration.registered ? (
          <button
            type="button"
            onClick={onRegister}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
          >
            {loading ? (
              <RefreshCw
                size={14}
                className="animate-spin"
              />
            ) : (
              <PlusIcon />
            )}

            {loading
              ? "Adding..."
              : "Add to Workspace"}
          </button>
        ) : connected ? (
          <div className="flex gap-2">
            <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-2.5 text-sm text-emerald-400">
              <CheckCircle2
                size={14}
              />

              Connected
            </div>

            <button
              type="button"
              onClick={onRemove}
              disabled={loading}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/[0.05] text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              {loading ? (
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
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled
              title="Real provider authorization comes next."
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-violet-500/15 bg-violet-500/[0.05] px-4 py-2.5 text-sm font-medium text-zinc-500"
            >
              <Plug size={14} />

              Connect Provider
            </button>

            <button
              type="button"
              onClick={onRemove}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] px-4 py-2.5 text-xs text-zinc-500 transition hover:bg-white/[0.03] hover:text-red-400 disabled:opacity-40"
            >
              <Trash2
                size={13}
              />

              Remove from Workspace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/*
============================================================
STATUS
============================================================
*/

function StatusBadge({
  status,
}: {
  status: IntegrationStatus;
}) {
  if (
    status === "Connected"
  ) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400">
        <CheckCircle2
          size={11}
        />
        Connected
      </span>
    );
  }

  if (status === "Error") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-medium text-red-400">
        <AlertTriangle
          size={11}
        />
        Error
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2.5 py-1 text-[10px] font-medium text-zinc-400">
      <Plug size={11} />
      Disconnected
    </span>
  );
}

/*
============================================================
STAT
============================================================
*/

function StatCard({
  label,
  value,
  icon: Icon,
  type = "default",
}: {
  label: string;
  value: number;
  icon: typeof Plug;

  type?:
    | "default"
    | "connected"
    | "disconnected"
    | "error";
}) {
  const iconClass =
    type === "connected"
      ? "bg-emerald-500/10 text-emerald-400"
      : type === "error"
        ? "bg-red-500/10 text-red-400"
        : type ===
            "disconnected"
          ? "bg-zinc-500/10 text-zinc-400"
          : "bg-blue-500/10 text-blue-400";

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}
      >
        <Icon size={17} />
      </div>

      <p className="mt-5 text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
SMALL PLUS ICON
============================================================
*/

function PlusIcon() {
  return (
    <span className="flex h-4 w-4 items-center justify-center text-lg leading-none">
      +
    </span>
  );
}