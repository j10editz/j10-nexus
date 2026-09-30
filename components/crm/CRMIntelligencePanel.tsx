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
        setLastAnalyzed(new Date());
      } catch (err: any) {
        setErrorMessage(err?.message || "Could not load CRM intelligence.");
        setData(null);
      } finally {
        setLoading(false);
      }
    }, []);

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
    <section className="rounded-xl border border-[#242A35] bg-[#101319] p-5">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#F5F7FA]">
              CRM Opportunities
            </h2>
            <span className="rounded border border-[#242A35] bg-[#151922] px-2 py-0.5 text-[10px] font-medium text-[#98A2B3]">
              Prioritized by Deal Value & Recency
            </span>
          </div>
          <p className="mt-1 text-xs text-[#98A2B3]">
            Opportunities identified for direct follow-up and pipeline progression.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastAnalyzed && (
            <span className="text-[11px] text-[#667085]">
              Updated {lastAnalyzed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              void loadIntelligence();
            }}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#242A35] bg-[#151922] px-3 text-xs font-medium text-[#98A2B3] transition hover:bg-[#242A35] hover:text-[#F5F7FA] disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>{loading ? "Analyzing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-400">
          {errorMessage}
        </div>
      )}

      {/* SUMMARY BADGES */}
      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-[#242A35] bg-[#151922] p-3">
            <span className="text-[11px] text-[#98A2B3]">Opportunities</span>
            <p className="mt-1 text-base font-semibold text-[#F5F7FA]">{summary.activeOpportunities ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[#242A35] bg-[#151922] p-3">
            <span className="text-[11px] text-[#98A2B3]">High Priority</span>
            <p className="mt-1 text-base font-semibold text-[#F5F7FA]">{summary.hotLeads ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[#242A35] bg-[#151922] p-3">
            <span className="text-[11px] text-[#98A2B3]">Needs Follow-Up</span>
            <p className="mt-1 text-base font-semibold text-[#F5F7FA]">{summary.requiresFollowUp ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[#242A35] bg-[#151922] p-3">
            <span className="text-[11px] text-[#98A2B3]">Pipeline Value</span>
            <p className="mt-1 text-base font-semibold text-[#F5F7FA]">{formatMoney(summary.pipelineValue ?? 0)}</p>
          </div>
        </div>
      )}

      {/* PRIORITIES */}
      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((item) => (
              <div
                key={item}
                className="h-[76px] animate-pulse rounded-lg border border-[#242A35] bg-[#151922]"
              />
            ))}
          </div>
        ) : priorities.length === 0 ? (
          <div className="rounded-lg border border-[#242A35] bg-[#151922] px-4 py-6 text-center">
            <p className="text-xs font-medium text-[#98A2B3]">
              No active priority opportunities
            </p>
            <p className="mt-1 text-[11px] text-[#667085]">
              As new leads enter your pipeline, prioritized follow-ups will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {priorities.map((contact) => (
              <PriorityCard
                key={contact.contactId}
                contact={contact}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PriorityCard({
  contact,
}: {
  contact: IntelligenceContact;
}) {
  return (
    <div className="rounded-lg border border-[#242A35] bg-[#151922] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#F5F7FA]">
            {contact.name}
          </p>
          <p className="mt-0.5 text-[11px] text-[#98A2B3]">
            {contact.company || contact.type}
          </p>
        </div>

        <PriorityBadge priority={contact.priority} />
      </div>

      <div className="mt-2.5 flex items-center justify-between text-xs">
        <span className="text-[11px] text-[#667085]">
          Score: <strong className="font-semibold text-[#F5F7FA]">{contact.priorityScore}/100</strong>
        </span>
        <span className="text-[11px] font-semibold text-[#F5F7FA]">
          {formatMoney(contact.estimatedValue)}
        </span>
      </div>

      {contact.recommendedAction && (
        <div className="mt-2 border-t border-[#242A35] pt-2">
          <p className="text-[11px] leading-relaxed text-[#98A2B3]">
            {contact.recommendedAction}
          </p>
        </div>
      )}
    </div>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: PriorityLevel;
}) {
  const styles: Record<PriorityLevel, string> = {
    Hot: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    High: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    Medium: "border-[#4F7CFF]/30 bg-[#4F7CFF]/10 text-[#4F7CFF]",
    Low: "border-[#242A35] bg-[#151922] text-[#98A2B3]",
  };

  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}