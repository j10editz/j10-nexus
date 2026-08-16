"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  BrainCircuit,
  CircleDollarSign,
  Flame,
  RefreshCw,
  Sparkles,
  Target,
  UserRoundSearch,
} from "lucide-react";

type PriorityLevel =
  | "Hot"
  | "High"
  | "Medium"
  | "Low";

type IntelligenceContact = {
  contactId: string;
  name: string;
  company: string | null;

  type:
    | "Lead"
    | "Prospect"
    | "Customer";

  status:
    | "New"
    | "Contacted"
    | "Qualified"
    | "Interested"
    | "Won"
    | "Lost";

  estimatedValue: number;

  priorityScore: number;

  priority: PriorityLevel;

  recommendedAction: string;

  reasons: string[];

  needsFollowUp: boolean;

  daysSinceLastContact:
    | number
    | null;
};

type IntelligenceResponse = {
  success: boolean;

  engine?: {
    name: string;
    version: string;
    mode: string;
  };

  summary?: {
    totalContacts: number;
    activeOpportunities: number;
    hotLeads: number;
    highPriorityLeads: number;
    requiresFollowUp: number;
    uncontactedLeads: number;
    pipelineValue: number;
    revenueWon: number;
  };

  topPriority?: IntelligenceContact[];

  followUpQueue?: IntelligenceContact[];

  contacts?: IntelligenceContact[];

  error?: string;
};

type CRMIntelligencePanelProps = {
  refreshKey?: number;
};

export default function CRMIntelligencePanel({
  refreshKey = 0,
}: CRMIntelligencePanelProps) {
  const [
    data,
    setData,
  ] =
    useState<IntelligenceResponse | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    lastAnalyzed,
    setLastAnalyzed,
  ] = useState<Date | null>(
    null
  );

  const loadIntelligence =
    useCallback(async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const response =
          await fetch(
            "/api/j10-ai/crm",
            {
              method: "GET",
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as IntelligenceResponse;

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ||
              "Could not load CRM intelligence."
          );
        }

        setData(result);

        setLastAnalyzed(
          new Date()
        );
      } catch (error) {
        console.error(
          "CRM intelligence panel error:",
          error
        );

        setErrorMessage(
          "J10 AI could not analyze the CRM."
        );
      } finally {
        setLoading(false);
      }
    }, []);

  /*
  ============================================================
  AUTO ANALYZE
  ============================================================
  */

  useEffect(() => {
    void loadIntelligence();
  }, [
    loadIntelligence,
    refreshKey,
  ]);

  const summary =
    data?.summary;

  const priorities =
    data?.topPriority ?? [];

  return (
    <section className="rounded-2xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.06] via-[#111216] to-blue-500/[0.03] p-6">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
            <BrainCircuit
              size={19}
              className="text-violet-400"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">
                J10 CRM Intelligence
              </h2>

              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-violet-400">
                AI Intelligence
              </span>

              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
                Auto Analyze
              </span>
            </div>

            <p className="mt-1 text-sm text-zinc-600">
              J10 AI analyzes your CRM,
              prioritizes opportunities and
              recommends the next sales
              action.
            </p>

            {lastAnalyzed && (
              <p className="mt-2 text-[10px] text-zinc-700">
                Last analyzed{" "}
                {lastAnalyzed.toLocaleTimeString(
                  [],
                  {
                    hour:
                      "2-digit",
                    minute:
                      "2-digit",
                  }
                )}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadIntelligence();
          }}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          <RefreshCw
            size={14}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />

          {loading
            ? "Analyzing..."
            : "Analyze CRM"}
        </button>
      </div>

      {errorMessage && (
        <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorMessage}
        </div>
      )}

      {/* SUMMARY */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          label="Active Opportunities"
          value={
            summary?.activeOpportunities ??
            0
          }
          icon={Target}
        />

        <MiniStat
          label="Hot Leads"
          value={
            summary?.hotLeads ??
            0
          }
          icon={Flame}
        />

        <MiniStat
          label="Need Follow-Up"
          value={
            summary?.requiresFollowUp ??
            0
          }
          icon={UserRoundSearch}
        />

        <MiniStat
          label="AI Pipeline"
          value={formatMoney(
            summary?.pipelineValue ??
              0
          )}
          icon={
            CircleDollarSign
          }
        />
      </div>

      {/* PRIORITIES */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <Sparkles
            size={14}
            className="text-violet-400"
          />

          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Priority Opportunities
          </p>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[1, 2].map(
              (item) => (
                <div
                  key={item}
                  className="h-[90px] animate-pulse rounded-xl border border-white/[0.05] bg-black/20"
                />
              )
            )}
          </div>
        ) : priorities.length ===
          0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/[0.08] bg-black/20 px-5 py-8 text-center">
            <p className="text-sm font-medium text-zinc-400">
              No active opportunities yet
            </p>

            <p className="mt-1 text-xs text-zinc-700">
              Add CRM leads and J10 AI
              will automatically prioritize
              them here.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {priorities.map(
              (contact) => (
                <PriorityCard
                  key={
                    contact.contactId
                  }
                  contact={
                    contact
                  }
                />
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Target;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-600">
          {label}
        </p>

        <Icon
          size={14}
          className="text-violet-400"
        />
      </div>

      <p className="mt-2 text-xl font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

function PriorityCard({
  contact,
}: {
  contact: IntelligenceContact;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-white">
            {contact.name}
          </p>

          <p className="mt-1 text-xs text-zinc-600">
            {contact.company ||
              contact.type}
          </p>
        </div>

        <PriorityBadge
          priority={
            contact.priority
          }
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-700">
            Priority Score
          </p>

          <p className="mt-1 text-lg font-semibold text-violet-400">
            {
              contact.priorityScore
            }
            /100
          </p>
        </div>

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-zinc-700">
            Opportunity
          </p>

          <p className="mt-1 text-sm font-medium text-zinc-300">
            {formatMoney(
              contact.estimatedValue
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <p className="text-[10px] uppercase tracking-wider text-zinc-700">
          Recommended Action
        </p>

        <p className="mt-2 text-sm leading-5 text-zinc-400">
          {
            contact.recommendedAction
          }
        </p>
      </div>
    </div>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: PriorityLevel;
}) {
  const styles: Record<
    PriorityLevel,
    string
  > = {
    Hot:
      "border-red-500/20 bg-red-500/10 text-red-400",

    High:
      "border-orange-500/20 bg-orange-500/10 text-orange-400",

    Medium:
      "border-violet-500/20 bg-violet-500/10 text-violet-400",

    Low:
      "border-zinc-500/20 bg-zinc-500/10 text-zinc-500",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }
  ).format(
    Number(value ?? 0)
  );
}