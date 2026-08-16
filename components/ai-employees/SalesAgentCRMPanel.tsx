"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Flame,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserCheck,
  XCircle,
  Zap,
} from "lucide-react";

/*
============================================================
TYPES
============================================================
*/

type PriorityLevel =
  | "Hot"
  | "High"
  | "Medium"
  | "Low";

type ContactType =
  | "Lead"
  | "Prospect"
  | "Customer";

type ContactStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Interested"
  | "Won"
  | "Lost";

type SalesAgentAction =
  | "mark_contacted"
  | "qualify"
  | "move_interested"
  | "add_ai_note"
  | "recommend_follow_up"
  | "mark_won"
  | "mark_lost";

type ExecutableSalesAction =
  | "mark_contacted"
  | "qualify"
  | "move_interested";

type ClosingAction =
  | "mark_won"
  | "mark_lost";

type SalesAgent = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  model: string;
  tasksCompleted: number;
  lastActive: string | null;
};

type IntelligenceContact = {
  contactId: string;
  name: string;
  company: string | null;
  type: ContactType;
  status: ContactStatus;
  estimatedValue: number;
  priorityScore: number;
  priority: PriorityLevel;
  needsFollowUp: boolean;
  daysSinceLastContact:
    | number
    | null;
  recommendedAction: string;
  reasons: string[];
};

type J10AIExecution = {
  source?: string;
  executionMode?: string;
  simulated?: boolean;
  apiCalled?: boolean;
  targetModel?: string;
  displayModel?: string;
  status?: string;
  estimatedCostUSD?:
    | number
    | null;
  fallback?: boolean;
  text?: string;
};

type SalesAgentCRMResponse = {
  success: boolean;

  engine?: {
    name: string;
    version: string;
    mode: string;
  };

  binding?: {
    mode: string;
    employeeId: string;
    verified?: boolean;
  };

  salesAgent?:
    | SalesAgent
    | null;

  access?: {
    crmRead: boolean;
    analyze: boolean;
    markContacted: boolean;
    qualify: boolean;
    moveInterested: boolean;
    addAINote: boolean;
    markWon: boolean;
    markLost: boolean;
    humanClosing?: boolean;
  };

  summary?: {
    activeOpportunities: number;
    hotLeads: number;
    highPriority: number;
    followUps: number;
    pipelineValue: number;
  };

  priorityQueue?:
    IntelligenceContact[];

  followUpQueue?:
    IntelligenceContact[];

  executed?: boolean;

  humanApproved?: boolean;

  humanClosing?: boolean;

  action?: SalesAgentAction;

  message?: string;

  audit?: {
    humanApproved: boolean;
    recorded: boolean;
    humanClosing?: boolean;
    approvedBy: string | null;
    timestamp: string | null;
  };

  contact?: {
    id: string;
    status: ContactStatus;
    type: ContactType;
  };

  intelligence?:
    IntelligenceContact;

  j10AI?:
    J10AIExecution;

  error?: string;
};

type RecommendationState = {
  intelligence:
    IntelligenceContact;

  j10AI?:
    J10AIExecution;
};

type ClosingRequest = {
  contactId: string;
  contactName: string;
  value: number;
  action: ClosingAction;
};

type Props = {
  employeeId: string;

  onCRMChanged?: () => void;
};

/*
============================================================
MAIN
============================================================
*/

export default function SalesAgentCRMPanel({
  employeeId,
  onCRMChanged,
}: Props) {
  const [
    data,
    setData,
  ] =
    useState<SalesAgentCRMResponse | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] =
    useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  const [
    recommendations,
    setRecommendations,
  ] =
    useState<
      Record<
        string,
        RecommendationState
      >
    >({});

  const [
    closingRequest,
    setClosingRequest,
  ] =
    useState<ClosingRequest | null>(
      null
    );

  /*
  ============================================================
  LOAD CRM
  ============================================================
  */

  const loadCRM =
    useCallback(
      async () => {
        if (!employeeId) {
          setLoading(false);

          setErrorMessage(
            "J10 NEXUS could not identify the selected AI Sales Agent."
          );

          return;
        }

        setLoading(true);
        setErrorMessage("");

        try {
          const response =
            await fetch(
              `/api/ai-employees/sales-agent/crm?employeeId=${encodeURIComponent(
                employeeId
              )}`,
              {
                method: "GET",
                cache: "no-store",
              }
            );

          const result =
            (await response.json()) as SalesAgentCRMResponse;

          if (
            !response.ok ||
            !result.success
          ) {
            throw new Error(
              result.error ||
                "Could not load Sales Agent CRM."
            );
          }

          if (
            result.salesAgent &&
            result.salesAgent.id !==
              employeeId
          ) {
            throw new Error(
              "J10 NEXUS detected an AI employee binding mismatch."
            );
          }

          setData(result);
        } catch (error) {
          console.error(
            "Sales Agent CRM load error:",
            error
          );

          setData(null);

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "J10 NEXUS could not load the Sales Agent CRM workspace."
          );
        } finally {
          setLoading(false);
        }
      },
      [employeeId]
    );

  useEffect(() => {
    void loadCRM();
  }, [loadCRM]);

  /*
  ============================================================
  EXECUTE ACTION
  ============================================================
  */

  async function executeAction(
    contactId: string,
    action: SalesAgentAction,
    humanApproved = false
  ) {
    if (
      actionLoading ||
      !employeeId
    ) {
      return;
    }

    const actionKey =
      `${contactId}:${action}`;

    setActionLoading(
      actionKey
    );

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response =
        await fetch(
          "/api/ai-employees/sales-agent/crm",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                employeeId,
                contactId,
                action,
                humanApproved,
              }),
          }
        );

      const result =
        (await response.json()) as SalesAgentCRMResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "J10 NEXUS could not execute this CRM action."
        );
      }

      if (
        result.salesAgent &&
        result.salesAgent.id !==
          employeeId
      ) {
        throw new Error(
          "J10 NEXUS blocked an employee execution mismatch."
        );
      }

      /*
      ==========================================================
      RECOMMENDATION
      ==========================================================
      */

      if (
        action ===
          "recommend_follow_up" &&
        result.intelligence
      ) {
        setRecommendations(
          (current) => ({
            ...current,

            [contactId]: {
              intelligence:
                result.intelligence!,

              j10AI:
                result.j10AI,
            },
          })
        );

        await loadCRM();

        onCRMChanged?.();

        return;
      }

      /*
      ==========================================================
      CLOSING SUCCESS
      ==========================================================
      */

      if (
        action === "mark_won"
      ) {
        setSuccessMessage(
          "Deal closed as Won. Revenue and CRM status have been updated."
        );
      } else if (
        action === "mark_lost"
      ) {
        setSuccessMessage(
          "Opportunity closed as Lost and recorded in the audit history."
        );
      } else if (
        humanApproved &&
        result.audit?.recorded
      ) {
        setSuccessMessage(
          "Human-approved J10 action executed and added to the audit history."
        );
      } else {
        setSuccessMessage(
          result.message ||
            "AI Sales Agent completed the CRM action."
        );
      }

      /*
      Recommendation is stale
      after execution.
      */

      setRecommendations(
        (current) => {
          const updated = {
            ...current,
          };

          delete updated[
            contactId
          ];

          return updated;
        }
      );

      await loadCRM();

      onCRMChanged?.();
    } catch (error) {
      console.error(
        "Sales Agent CRM action error:",
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The CRM action could not be completed."
      );
    } finally {
      setActionLoading("");
    }
  }

  /*
  ============================================================
  CLOSE CONFIRMATION
  ============================================================
  */

  async function confirmClosing() {
    if (!closingRequest) {
      return;
    }

    const request =
      closingRequest;

    await executeAction(
      request.contactId,
      request.action,
      true
    );

    setClosingRequest(null);
  }

  /*
  ============================================================
  DATA
  ============================================================
  */

  const agent =
    data?.salesAgent ??
    null;

  const summary =
    data?.summary;

  const queue =
    data?.priorityQueue ??
    [];

  const agentRunning =
    agent?.status ===
    "Running";

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-violet-500/15 bg-[#0c0c0f]">
        {/* HEADER */}

        <div className="border-b border-white/[0.07] p-6">
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
                  <h3 className="font-semibold text-white">
                    Sales Agent CRM
                  </h3>

                  <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-violet-400">
                    Exact Employee
                  </span>

                  {agent && (
                    <AgentStatus
                      status={
                        agent.status
                      }
                    />
                  )}
                </div>

                <p className="mt-1 text-sm text-zinc-600">
                  AI-assisted sales intelligence
                  with human-controlled closing.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadCRM()
              }
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

              Refresh
            </button>
          </div>
        </div>

        {/* AGENT */}

        {agent && (
          <div className="border-b border-white/[0.07] p-6">
            <div className="grid gap-3 md:grid-cols-4">
              <InfoBox
                label="Employee"
                value={agent.name}
              />

              <InfoBox
                label="Role"
                value={agent.role}
              />

              <InfoBox
                label="Model"
                value={agent.model}
              />

              <InfoBox
                label="Tasks Completed"
                value={String(
                  agent.tasksCompleted
                )}
              />
            </div>

            <div className="mt-3 rounded-xl border border-violet-500/10 bg-violet-500/[0.04] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-violet-400">
                Employee Binding
              </p>

              <p className="mt-1 break-all text-xs text-zinc-600">
                {agent.id}
              </p>
            </div>
          </div>
        )}

        {/* BODY */}

        <div className="p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Opportunities"
              value={
                summary?.activeOpportunities ??
                0
              }
              icon={Target}
            />

            <SummaryCard
              label="Hot Leads"
              value={
                summary?.hotLeads ??
                0
              }
              icon={Flame}
            />

            <SummaryCard
              label="Follow-Ups"
              value={
                summary?.followUps ??
                0
              }
              icon={UserCheck}
            />

            <SummaryCard
              label="Pipeline"
              value={formatMoney(
                summary?.pipelineValue ??
                  0
              )}
              icon={
                CircleDollarSign
              }
            />
          </div>

          {/* SAFETY */}

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-500/15 bg-blue-500/[0.05] p-4">
            <ShieldCheck
              size={17}
              className="mt-0.5 shrink-0 text-blue-400"
            />

            <div>
              <p className="text-sm font-medium text-blue-300">
                Human-controlled closing
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-600">
                J10 may analyze and advance
                opportunities, but Won and Lost
                are final human decisions.
                Closing actions require explicit
                confirmation and are permanently
                audited.
              </p>
            </div>
          </div>

          {agent &&
            !agentRunning && (
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-400">
                This AI Sales Agent is{" "}
                {agent.status}. Resume the
                employee before executing
                CRM actions.
              </div>
            )}

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
              <CheckCircle2
                size={15}
              />

              {successMessage}
            </div>
          )}

          {/* QUEUE */}

          <div className="mt-7">
            <div className="flex items-center gap-2">
              <Sparkles
                size={14}
                className="text-violet-400"
              />

              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Priority Queue
              </p>
            </div>

            {loading ? (
              <div className="mt-4 space-y-3">
                {[1, 2].map(
                  (item) => (
                    <div
                      key={item}
                      className="h-40 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
                    />
                  )
                )}
              </div>
            ) : queue.length ===
              0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/[0.08] px-5 py-10 text-center">
                <p className="text-sm text-zinc-500">
                  No active CRM opportunities.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {queue.map(
                  (contact) => (
                    <OpportunityCard
                      key={
                        contact.contactId
                      }
                      contact={
                        contact
                      }
                      recommendation={
                        recommendations[
                          contact.contactId
                        ] ?? null
                      }
                      actionLoading={
                        actionLoading
                      }
                      agentRunning={
                        agentRunning
                      }
                      onAction={
                        executeAction
                      }
                      onClosingRequest={(
                        action
                      ) =>
                        setClosingRequest({
                          contactId:
                            contact.contactId,

                          contactName:
                            contact.name,

                          value:
                            contact.estimatedValue,

                          action,
                        })
                      }
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FINAL CLOSING CONFIRMATION */}

      {closingRequest && (
        <ClosingConfirmation
          request={
            closingRequest
          }
          busy={
            actionLoading ===
            `${closingRequest.contactId}:${closingRequest.action}`
          }
          onCancel={() =>
            setClosingRequest(
              null
            )
          }
          onConfirm={() =>
            void confirmClosing()
          }
        />
      )}
    </>
  );
}

/*
============================================================
OPPORTUNITY CARD
============================================================
*/

function OpportunityCard({
  contact,
  recommendation,
  actionLoading,
  agentRunning,
  onAction,
  onClosingRequest,
}: {
  contact:
    IntelligenceContact;

  recommendation:
    RecommendationState | null;

  actionLoading:
    string;

  agentRunning:
    boolean;

  onAction: (
    contactId: string,
    action:
      SalesAgentAction,
    humanApproved?:
      boolean
  ) => Promise<void>;

  onClosingRequest: (
    action:
      ClosingAction
  ) => void;
}) {
  function isLoading(
    action:
      SalesAgentAction
  ) {
    return (
      actionLoading ===
      `${contact.contactId}:${action}`
    );
  }

  const busy =
    Boolean(
      actionLoading
    );

  const proposedAction =
    getProposedAction(
      contact.status
    );

  const readyForClosing =
    contact.status ===
    "Interested";

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
      {/* CONTACT */}

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">
              {contact.name}
            </p>

            <PriorityBadge
              priority={
                contact.priority
              }
            />
          </div>

          <p className="mt-1 text-xs text-zinc-600">
            {contact.company ||
              contact.type}
          </p>
        </div>

        <div className="text-left md:text-right">
          <p className="text-[10px] uppercase tracking-wider text-zinc-700">
            Opportunity
          </p>

          <p className="mt-1 font-semibold text-white">
            {formatMoney(
              contact.estimatedValue
            )}
          </p>
        </div>
      </div>

      {/* DETAILS */}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <InfoBox
          label="Status"
          value={contact.status}
        />

        <InfoBox
          label="Type"
          value={contact.type}
        />

        <InfoBox
          label="Priority Score"
          value={`${contact.priorityScore}/100`}
        />
      </div>

      {/* RECOMMENDED ACTION */}

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
        <p className="text-[10px] uppercase tracking-wider text-zinc-700">
          Recommended Action
        </p>

        <p className="mt-2 text-sm leading-5 text-zinc-400">
          {
            contact.recommendedAction
          }
        </p>
      </div>

      {/* CONTROLS */}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <AgentButton
          label="Contact"
          icon={
            <Send size={14} />
          }
          loading={isLoading(
            "mark_contacted"
          )}
          disabled={
            busy ||
            !agentRunning ||
            contact.status !==
              "New"
          }
          onClick={() =>
            void onAction(
              contact.contactId,
              "mark_contacted",
              false
            )
          }
        />

        <AgentButton
          label="Qualify"
          icon={
            <UserCheck
              size={14}
            />
          }
          loading={isLoading(
            "qualify"
          )}
          disabled={
            busy ||
            !agentRunning ||
            contact.status ===
              "Qualified" ||
            contact.status ===
              "Interested"
          }
          onClick={() =>
            void onAction(
              contact.contactId,
              "qualify",
              false
            )
          }
        />

        <AgentButton
          label="Interested"
          icon={
            <ChevronRight
              size={14}
            />
          }
          loading={isLoading(
            "move_interested"
          )}
          disabled={
            busy ||
            !agentRunning ||
            contact.status ===
              "Interested"
          }
          onClick={() =>
            void onAction(
              contact.contactId,
              "move_interested",
              false
            )
          }
        />

        <AgentButton
          label="AI Note"
          icon={
            <MessageSquareText
              size={14}
            />
          }
          loading={isLoading(
            "add_ai_note"
          )}
          disabled={
            busy ||
            !agentRunning
          }
          onClick={() =>
            void onAction(
              contact.contactId,
              "add_ai_note",
              false
            )
          }
        />

        <AgentButton
          label="Recommend"
          icon={
            <Sparkles
              size={14}
            />
          }
          loading={isLoading(
            "recommend_follow_up"
          )}
          disabled={
            busy ||
            !agentRunning
          }
          onClick={() =>
            void onAction(
              contact.contactId,
              "recommend_follow_up",
              false
            )
          }
        />
      </div>

      {/* AI RECOMMENDATION */}

      {recommendation && (
        <div className="mt-4 overflow-hidden rounded-xl border border-violet-500/25 bg-violet-500/[0.07]">
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles
                size={15}
                className="text-violet-400"
              />

              <p className="text-sm font-semibold text-white">
                J10 Sales Recommendation
              </p>

              <span className="ml-auto rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-violet-400">
                {readyForClosing
                  ? "Human Decision"
                  : "Awaiting Approval"}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {
                recommendation
                  .intelligence
                  .recommendedAction
              }
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <SmallBadge>
                Score{" "}
                {
                  recommendation
                    .intelligence
                    .priorityScore
                }
                /100
              </SmallBadge>

              <SmallBadge>
                {
                  recommendation
                    .intelligence
                    .priority
                }{" "}
                Priority
              </SmallBadge>

              <SmallBadge>
                {formatMoney(
                  recommendation
                    .intelligence
                    .estimatedValue
                )}
              </SmallBadge>
            </div>

            {recommendation
              .intelligence
              .reasons.length >
              0 && (
              <div className="mt-4 border-t border-violet-500/10 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                  Why J10 recommends this
                </p>

                <div className="mt-2 space-y-1.5">
                  {recommendation
                    .intelligence
                    .reasons.map(
                      (
                        reason,
                        index
                      ) => (
                        <p
                          key={`${reason}-${index}`}
                          className="text-xs leading-5 text-zinc-500"
                        >
                          • {reason}
                        </p>
                      )
                    )}
                </div>
              </div>
            )}

            {recommendation.j10AI && (
              <div className="mt-4 border-t border-violet-500/10 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                  J10 Intelligence Runtime
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <SmallBadge>
                    Mode:{" "}
                    {recommendation
                      .j10AI
                      .executionMode ??
                      "Unknown"}
                  </SmallBadge>

                  <SmallBadge>
                    API:{" "}
                    {recommendation
                      .j10AI
                      .apiCalled
                      ? "Called"
                      : "Not Called"}
                  </SmallBadge>

                  <SmallBadge>
                    Cost:{" "}
                    {recommendation
                      .j10AI
                      .estimatedCostUSD ===
                    0
                      ? "$0"
                      : "N/A"}
                  </SmallBadge>

                  <SmallBadge>
                    Target:{" "}
                    {recommendation
                      .j10AI
                      .displayModel ??
                      "J10 AI"}
                  </SmallBadge>
                </div>
              </div>
            )}
          </div>

          {!readyForClosing &&
            proposedAction && (
              <div className="border-t border-violet-500/15 bg-black/20 p-4">
                <div className="mb-3 flex items-start gap-3">
                  <ShieldCheck
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-400"
                  />

                  <div>
                    <p className="text-xs font-medium text-zinc-300">
                      Human approval required
                    </p>

                    <p className="mt-1 text-xs text-zinc-600">
                      Approving this action
                      creates a permanent audit record.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    busy ||
                    !agentRunning
                  }
                  onClick={() =>
                    void onAction(
                      contact.contactId,
                      proposedAction,
                      true
                    )
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/15 disabled:opacity-40"
                >
                  {isLoading(
                    proposedAction
                  ) ? (
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <Zap size={16} />
                  )}

                  {isLoading(
                    proposedAction
                  )
                    ? "Executing..."
                    : `Approve & Execute — ${getActionLabel(
                        proposedAction
                      )}`}
                </button>
              </div>
            )}
        </div>
      )}

      {/* FINAL HUMAN DECISION */}

      {readyForClosing && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-black/25">
          <div className="border-b border-white/[0.07] p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                size={17}
                className="mt-0.5 text-blue-400"
              />

              <div>
                <p className="text-sm font-semibold text-white">
                  Final Human Decision
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  J10 has reached its execution
                  boundary. Only you can decide
                  whether this opportunity is Won
                  or Lost.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <button
              type="button"
              disabled={
                busy ||
                !agentRunning
              }
              onClick={() =>
                onClosingRequest(
                  "mark_won"
                )
              }
              className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/15 disabled:opacity-40"
            >
              <Trophy size={16} />

              Mark Won
            </button>

            <button
              type="button"
              disabled={
                busy ||
                !agentRunning
              }
              onClick={() =>
                onClosingRequest(
                  "mark_lost"
                )
              }
              className="flex items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/15 disabled:opacity-40"
            >
              <XCircle size={16} />

              Mark Lost
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/*
============================================================
CLOSING CONFIRMATION
============================================================
*/

function ClosingConfirmation({
  request,
  busy,
  onCancel,
  onConfirm,
}: {
  request:
    ClosingRequest;

  busy:
    boolean;

  onCancel:
    () => void;

  onConfirm:
    () => void;
}) {
  const isWon =
    request.action ===
    "mark_won";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b0e] p-6 shadow-2xl">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${
            isWon
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {isWon ? (
            <Trophy size={21} />
          ) : (
            <AlertTriangle
              size={21}
            />
          )}
        </div>

        <h3 className="mt-5 text-xl font-semibold text-white">
          {isWon
            ? "Confirm Won Deal"
            : "Confirm Lost Opportunity"}
        </h3>

        <p className="mt-2 text-sm leading-6 text-zinc-500">
          You are about to mark{" "}
          <span className="font-medium text-white">
            {request.contactName}
          </span>{" "}
          as{" "}
          <span
            className={
              isWon
                ? "text-emerald-400"
                : "text-red-400"
            }
          >
            {isWon
              ? "Won"
              : "Lost"}
          </span>
          .
        </p>

        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-xs text-zinc-600">
            Opportunity Value
          </p>

          <p className="mt-1 text-lg font-semibold text-white">
            {formatMoney(
              request.value
            )}
          </p>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-4">
          <ShieldCheck
            size={16}
            className="mt-0.5 shrink-0 text-amber-400"
          />

          <p className="text-xs leading-5 text-zinc-500">
            This is a final human-controlled
            CRM decision. J10 will permanently
            record the action and approval
            history.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-40 ${
              isWon
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                : "border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/15"
            }`}
          >
            {busy ? (
              <RefreshCw
                size={15}
                className="animate-spin"
              />
            ) : isWon ? (
              <Trophy size={15} />
            ) : (
              <XCircle size={15} />
            )}

            {busy
              ? "Closing..."
              : isWon
                ? "Confirm Won"
                : "Confirm Lost"}
          </button>
        </div>
      </div>
    </div>
  );
}

/*
============================================================
PROPOSED ACTION
============================================================
*/

function getProposedAction(
  status: ContactStatus
): ExecutableSalesAction | null {
  switch (status) {
    case "New":
      return "mark_contacted";

    case "Contacted":
      return "qualify";

    case "Qualified":
      return "move_interested";

    case "Interested":
    case "Won":
    case "Lost":
      return null;

    default:
      return null;
  }
}

/*
============================================================
ACTION LABEL
============================================================
*/

function getActionLabel(
  action:
    ExecutableSalesAction
) {
  switch (action) {
    case "mark_contacted":
      return "Mark Contacted";

    case "qualify":
      return "Qualify Lead";

    case "move_interested":
      return "Move to Interested";
  }
}

/*
============================================================
BUTTON
============================================================
*/

function AgentButton({
  label,
  icon,
  loading,
  disabled,
  onClick,
}: {
  label: string;

  icon: ReactNode;

  loading: boolean;

  disabled: boolean;

  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {loading ? (
        <RefreshCw
          size={14}
          className="animate-spin"
        />
      ) : (
        icon
      )}

      {loading
        ? "Working..."
        : label}
    </button>
  );
}

/*
============================================================
SUMMARY
============================================================
*/

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;

  value:
    | string
    | number;

  icon:
    typeof Target;
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

/*
============================================================
INFO BOX
============================================================
*/

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <p className="text-[9px] uppercase tracking-wider text-zinc-700">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-medium text-zinc-300">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
STATUS
============================================================
*/

function AgentStatus({
  status,
}: {
  status: string;
}) {
  const running =
    status ===
    "Running";

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${
        running
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          : "border-zinc-500/20 bg-zinc-500/10 text-zinc-500"
      }`}
    >
      {status}
    </span>
  );
}

/*
============================================================
PRIORITY
============================================================
*/

function PriorityBadge({
  priority,
}: {
  priority:
    PriorityLevel;
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
      className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

/*
============================================================
BADGE
============================================================
*/

function SmallBadge({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-500">
      {children}
    </span>
  );
}

/*
============================================================
MONEY
============================================================
*/

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",

      maximumFractionDigits:
        0,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}