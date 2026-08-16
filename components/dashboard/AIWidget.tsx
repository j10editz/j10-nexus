"use client";

import { useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Database,
  Globe2,
  Megaphone,
  MessageSquare,
  Send,
  Sparkles,
  Workflow,
} from "lucide-react";

type PlanStep = {
  step: number;
  title: string;
  description: string;
};

type WorkflowAction = {
  order: number;
  type: string;
  label: string;
  config?: Record<string, unknown>;
};

type WorkflowBlueprint = {
  name: string;
  description: string;
  triggerType: string;
  triggerLabel: string;
  triggerConfig: Record<string, unknown>;
  actions: WorkflowAction[];
};

type J10AIResponse = {
  success: boolean;
  request: string;
  intent: string;
  response: string;
  recommendedTools: string[];
  workflowBlueprint: WorkflowBlueprint | null;
  plan: PlanStep[];
  executionReady: boolean;
  nextAction: string;
};

type BuildResponse = {
  success: boolean;
  message?: string;
  buildId?: string;
  status?: string;
  resourceType?: string;
  ownerId?: string;
  error?: string;
};

const suggestions = [
  {
    label: "Create an AI sales agent",
    icon: Bot,
    prompt:
      "Create an AI sales agent for my business that can qualify leads and follow up with prospects.",
  },
  {
    label: "Automate WhatsApp",
    icon: MessageSquare,
    prompt:
      "Automate my WhatsApp customer support, FAQs, lead capture and follow-ups.",
  },
  {
    label: "Build a workflow",
    icon: Workflow,
    prompt:
      "Build an automation workflow for one of my repetitive business processes.",
  },
  {
    label: "Create marketing",
    icon: Megaphone,
    prompt:
      "Create a marketing campaign for my business.",
  },
  {
    label: "Build a website",
    icon: Globe2,
    prompt:
      "Build a professional website for my business.",
  },
];

export default function AIWidget() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const [result, setResult] =
    useState<J10AIResponse | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [reviewOpen, setReviewOpen] =
    useState(false);

  async function handleSubmit() {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt || loading) {
      return;
    }

    setLoading(true);
    setResult(null);
    setReviewOpen(false);
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/j10-ai",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            prompt: cleanPrompt,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setErrorMessage(
          data.error ||
            "J10 AI could not process your request."
        );

        return;
      }

      setResult(data);
    } catch {
      setErrorMessage(
        "Could not connect to J10 AI. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (reviewOpen && result) {
    return (
      <SystemReview
        result={result}
        onBack={() =>
          setReviewOpen(false)
        }
      />
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-[#0d111c]">
      {/* BACKGROUND */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-600/15 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="relative p-6 lg:p-8">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
              <Sparkles size={20} />

              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0d111c] bg-emerald-400" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">
                  J10 AI
                </h2>

                <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-400">
                  Command Center
                </span>
              </div>

              <p className="mt-1 text-xs text-zinc-500">
                Your business intelligence and execution layer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            J10 AI Online
          </div>
        </div>

        {/* INTRO */}
        <div className="mx-auto mt-10 max-w-3xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-400">
            J10 AI Operating System
          </p>

          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            What do you want to build today?
          </h3>

          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Ask J10 AI to create, automate,
            analyze, manage, or grow anything
            in your business.
          </p>
        </div>

        {/* INPUT */}
        <div className="mx-auto mt-8 max-w-3xl">
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-2 shadow-xl shadow-black/20 transition-all focus-within:border-blue-500/30">
            <textarea
              value={prompt}
              onChange={(event) => {
                setPrompt(
                  event.target.value
                );

                setResult(null);
                setReviewOpen(false);
                setErrorMessage("");
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Ask J10 AI anything..."
              rows={4}
              className="w-full resize-none bg-transparent px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-zinc-600"
            />

            <div className="flex items-center justify-between border-t border-white/[0.06] px-2 pt-2">
              <p className="hidden px-2 text-[10px] text-zinc-600 sm:block">
                J10 AI can work across your
                entire business.
              </p>

              <button
                type="button"
                onClick={
                  handleSubmit
                }
                disabled={
                  !prompt.trim() ||
                  loading
                }
                className="ml-auto flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {loading
                  ? "Thinking..."
                  : "Send to J10 AI"}

                <Send size={14} />
              </button>
            </div>
          </div>

          {/* SUGGESTIONS */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map(
              (suggestion) => {
                const Icon =
                  suggestion.icon;

                return (
                  <button
                    key={
                      suggestion.label
                    }
                    type="button"
                    onClick={() => {
                      setPrompt(
                        suggestion.prompt
                      );

                      setResult(null);
                      setReviewOpen(false);
                      setErrorMessage("");
                    }}
                    className="group flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-zinc-400 transition-all hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white"
                  >
                    <Icon
                      size={13}
                      className="text-zinc-600 transition-colors group-hover:text-blue-400"
                    />

                    {suggestion.label}

                    <ArrowRight
                      size={12}
                      className="text-zinc-700 transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                );
              }
            )}
          </div>

          {/* ERROR */}
          {errorMessage && (
            <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {errorMessage}
            </div>
          )}

          {/* RESULT */}
          {result && (
            <div className="mt-6 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-blue-500/[0.06] via-violet-500/[0.05] to-transparent p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                  <Sparkles
                    size={15}
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold text-white">
                    J10 AI understands your
                    request.
                  </p>

                  <p className="text-xs text-zinc-500">
                    {result.response}
                  </p>
                </div>
              </div>

              {/* INTENT */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                  Detected
                </span>

                <IntentBadge
                  intent={
                    result.intent
                  }
                />
              </div>

              {/* WORKFLOW PREVIEW */}
              {result.intent ===
                "workflow" &&
                result.workflowBlueprint && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-400">
                      Automation Blueprint
                    </p>

                    <div className="mt-3 rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-4">
                      <p className="text-sm font-semibold text-white">
                        {
                          result
                            .workflowBlueprint
                            .name
                        }
                      </p>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        {
                          result
                            .workflowBlueprint
                            .description
                        }
                      </p>

                      <div className="mt-4 flex items-center gap-2 text-xs">
                        <span className="text-zinc-600">
                          Trigger
                        </span>

                        <span className="rounded-lg border border-blue-500/15 bg-blue-500/[0.07] px-2.5 py-1.5 text-blue-400">
                          {
                            result
                              .workflowBlueprint
                              .triggerLabel
                          }
                        </span>
                      </div>

                      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                        Actions
                      </p>

                      <div className="mt-2 space-y-2">
                        {result.workflowBlueprint.actions.map(
                          (action) => (
                            <div
                              key={
                                action.order
                              }
                              className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-black/20 p-3"
                            >
                              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10 text-[10px] font-semibold text-violet-400">
                                {String(
                                  action.order
                                ).padStart(
                                  2,
                                  "0"
                                )}
                              </div>

                              <p className="text-xs text-zinc-300">
                                {
                                  action.label
                                }
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}

              {/* TOOLS */}
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
                  Recommended J10 NEXUS
                  tools
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {result.recommendedTools.map(
                    (tool) => (
                      <span
                        key={tool}
                        className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-zinc-300"
                      >
                        {tool}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* PLAN */}
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-400">
                  Execution plan
                </p>

                <div className="mt-3 space-y-2">
                  {result.plan.map(
                    (item) => (
                      <div
                        key={
                          item.step
                        }
                        className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-4"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-semibold text-blue-400">
                          {String(
                            item.step
                          ).padStart(
                            2,
                            "0"
                          )}
                        </div>

                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {
                              item.title
                            }
                          </p>

                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            {
                              item.description
                            }
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* NEXT ACTION */}
              <div className="mt-5 flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-zinc-300">
                    Next action
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    {
                      result.nextAction
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setReviewOpen(
                      true
                    )
                  }
                  className="group flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200"
                >
                  Review System

                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SystemReview({
  result,
  onBack,
}: {
  result: J10AIResponse;
  onBack: () => void;
}) {
  const [building, setBuilding] =
    useState(false);

  const [buildError, setBuildError] =
    useState("");

  const [buildResult, setBuildResult] =
    useState<BuildResponse | null>(
      null
    );

  async function handleApproveBuild() {
    if (building) {
      return;
    }

    setBuilding(true);
    setBuildError("");
    setBuildResult(null);

    try {
      const response = await fetch(
        "/api/j10-ai/build",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            request:
              result.request,

            intent:
              result.intent,

            recommendedTools:
              result.recommendedTools,

            plan:
              result.plan,

            workflowBlueprint:
              result.workflowBlueprint,
          }),
        }
      );

      const data: BuildResponse =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        setBuildError(
          data.error ||
            "J10 AI could not build this system."
        );

        return;
      }

      setBuildResult(data);
    } catch {
      setBuildError(
        "Could not connect to the J10 AI build engine."
      );
    } finally {
      setBuilding(false);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-[#0d111c]">
      {/* BACKGROUND */}
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-600/15 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />

      <div className="relative p-6 lg:p-8">
        {/* BACK */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-white"
        >
          <ArrowLeft size={14} />

          Back to J10 AI
        </button>

        {/* HEADER */}
        <div className="mt-7 flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                <Sparkles
                  size={19}
                />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                  System Review
                </p>

                <h2 className="mt-1 text-2xl font-semibold text-white">
                  J10 AI Build Preview
                </h2>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
              Review exactly what J10 AI
              plans to create before
              anything is added to your
              workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <IntentBadge
              intent={
                result.intent
              }
            />

            <div className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-400">
              Review Required
            </div>
          </div>
        </div>

        {/* BUSINESS REQUEST */}
        <div className="mt-8 rounded-xl border border-white/[0.07] bg-black/20 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            Business Request
          </p>

          <p className="mt-2 text-sm leading-6 text-zinc-300">
            “{result.request}”
          </p>
        </div>

        {/* EXACT WORKFLOW BLUEPRINT */}
        {result.intent ===
          "workflow" &&
          result.workflowBlueprint && (
            <WorkflowBlueprintReview
              blueprint={
                result.workflowBlueprint
              }
            />
          )}

        {/* SYSTEM COMPONENTS */}
        <div className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
            System Components
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.recommendedTools.map(
              (
                tool,
                index
              ) => (
                <SystemComponent
                  key={tool}
                  name={tool}
                  index={index}
                />
              )
            )}
          </div>
        </div>

        {/* BUILD SEQUENCE */}
        <div className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
            Build Sequence
          </p>

          <div className="mt-3 space-y-2">
            {result.plan.map(
              (item) => (
                <div
                  key={item.step}
                  className="flex items-start gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-semibold text-violet-400">
                    {String(
                      item.step
                    ).padStart(
                      2,
                      "0"
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {
                        item.title
                      }
                    </p>

                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {
                        item.description
                      }
                    </p>
                  </div>

                  <CheckCircle2
                    size={16}
                    className="ml-auto shrink-0 text-emerald-400"
                  />
                </div>
              )
            )}
          </div>
        </div>

        {/* PLATFORM INFO */}
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          <ReviewInfoCard
            icon={Bot}
            title="AI Workforce"
            description="J10 AI can configure the required digital employees."
          />

          <ReviewInfoCard
            icon={Workflow}
            title="Automation"
            description="Approved workflows are stored and managed inside Automation Hub."
          />

          <ReviewInfoCard
            icon={Database}
            title="Business Data"
            description="Your workspace data stays connected to your account."
          />
        </div>

        {/* ERROR */}
        {buildError && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {buildError}
          </div>
        )}

        {/* SUCCESS */}
        {buildResult && (
          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <CheckCircle2
                  size={17}
                  className="text-emerald-400"
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-emerald-400">
                  {getBuildSuccessTitle(
                    buildResult.resourceType
                  )}
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  {buildResult.message ||
                    "J10 AI successfully created the approved system."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* APPROVE */}
        <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-violet-500/20 bg-gradient-to-r from-blue-500/[0.06] to-violet-500/[0.06] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">
              {buildResult
                ? "Build complete"
                : "Ready to build this system?"}
            </p>

            <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
              {buildResult
                ? getBuildCompleteDescription(
                    buildResult.resourceType
                  )
                : result.intent ===
                    "workflow"
                  ? "Approve this exact workflow blueprint and J10 AI will add it to Automation Hub."
                  : "Review this configuration and confirm when you want J10 AI to create it in your workspace."}
            </p>
          </div>

          <button
            type="button"
            onClick={
              handleApproveBuild
            }
            disabled={
              building ||
              Boolean(buildResult)
            }
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {buildResult ? (
              <>
                <CheckCircle2
                  size={15}
                />
                Built
              </>
            ) : building ? (
              <>
                <Sparkles
                  size={15}
                  className="animate-pulse"
                />
                Building...
              </>
            ) : (
              <>
                <Check size={15} />
                Approve & Build
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

function WorkflowBlueprintReview({
  blueprint,
}: {
  blueprint: WorkflowBlueprint;
}) {
  return (
    <div className="mt-7 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.07] to-blue-500/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
          <Workflow
            size={17}
            className="text-violet-400"
          />
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-400">
            Proposed Automation
          </p>

          <h3 className="mt-1 text-lg font-semibold text-white">
            {blueprint.name}
          </h3>

          <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
            {blueprint.description}
          </p>
        </div>
      </div>

      {/* TRIGGER */}
      <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
          Trigger
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-blue-500/15 bg-blue-500/[0.07] px-3 py-2 text-xs font-medium text-blue-400">
            {blueprint.triggerLabel}
          </span>

          <span className="text-[10px] text-zinc-600">
            {blueprint.triggerType}
          </span>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
          Workflow Actions
        </p>

        <div className="mt-3 space-y-2">
          {blueprint.actions.map(
            (action) => (
              <div
                key={action.order}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-semibold text-violet-400">
                  {String(
                    action.order
                  ).padStart(
                    2,
                    "0"
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {action.label}
                  </p>

                  <p className="mt-1 text-[10px] text-zinc-600">
                    {formatActionType(
                      action.type
                    )}
                  </p>
                </div>

                <Check
                  size={14}
                  className="ml-auto text-emerald-400"
                />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function IntentBadge({
  intent,
}: {
  intent: string;
}) {
  const formatted =
    formatIntent(intent);

  const isWorkflow =
    intent === "workflow" ||
    intent === "automation";

  const isEmployee =
    intent === "ai_employee";

  return (
    <div
      className={
        isWorkflow
          ? "flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium text-violet-400"
          : isEmployee
            ? "flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-[11px] font-medium text-blue-400"
            : "flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-zinc-400"
      }
    >
      {isWorkflow ? (
        <Workflow size={12} />
      ) : isEmployee ? (
        <Bot size={12} />
      ) : (
        <Sparkles size={12} />
      )}

      Intent: {formatted}
    </div>
  );
}

function SystemComponent({
  name,
  index,
}: {
  name: string;
  index: number;
}) {
  const icons = [
    Bot,
    Workflow,
    MessageSquare,
    Database,
    Sparkles,
    Globe2,
  ];

  const Icon =
    icons[
      index % icons.length
    ];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
          <Icon
            size={15}
            className="text-blue-400"
          />
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-200">
            {name}
          </p>

          <p className="mt-1 text-[10px] text-zinc-600">
            Included in build
          </p>
        </div>

        <Check
          size={14}
          className="ml-auto text-emerald-400"
        />
      </div>
    </div>
  );
}

function ReviewInfoCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111216] p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
        <Icon
          size={15}
          className="text-violet-400"
        />
      </div>

      <p className="mt-4 text-sm font-medium text-zinc-200">
        {title}
      </p>

      <p className="mt-1 text-xs leading-5 text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function formatIntent(
  intent: string
) {
  switch (intent) {
    case "ai_employee":
      return "AI Employee";

    case "workflow":
    case "automation":
      return "Workflow";

    case "website":
      return "Website";

    case "general_business_request":
      return "Business Request";

    default:
      return intent
        .replaceAll("_", " ")
        .replace(
          /\b\w/g,
          (letter) =>
            letter.toUpperCase()
        );
  }
}

function formatActionType(
  type: string
) {
  return type
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}

function getBuildSuccessTitle(
  resourceType?: string
) {
  switch (resourceType) {
    case "ai_employee":
      return "AI employee created";

    case "workflow":
    case "automation":
      return "Automation created";

    case "website":
      return "Website created";

    default:
      return "System build complete";
  }
}

function getBuildCompleteDescription(
  resourceType?: string
) {
  switch (resourceType) {
    case "ai_employee":
      return "The approved AI employee has been added to your J10 NEXUS workforce.";

    case "workflow":
    case "automation":
      return "The approved workflow has been added to Automation Hub and is ready for configuration or execution.";

    case "website":
      return "The approved website has been added to your J10 NEXUS workspace.";

    default:
      return "J10 AI successfully created the approved system in your workspace.";
  }
}