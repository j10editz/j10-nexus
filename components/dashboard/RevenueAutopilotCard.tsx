"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  MessageSquare,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

import {
  buildWhatsAppBriefingDeepLink,
  buildWhatsAppMorningBriefingText,
  computeExecutiveDigest,
  type AutopilotAction,
  type ExecutiveDigest,
} from "@/lib/autopilot/service";

export default function RevenueAutopilotCard({
  founderName = "Founder",
}: {
  founderName?: string;
}) {
  const [digest, setDigest] = useState<ExecutiveDigest>(() =>
    computeExecutiveDigest(),
  );
  const [briefingModalOpen, setBriefingModalOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("+15556771423");
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [actionSuccessNotice, setActionSuccessNotice] = useState("");

  useState(() => {
    async function loadDigest() {
      try {
        const res = await fetch("/api/dashboard/autopilot");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.digest) {
            setDigest(data.digest);
          }
        }
      } catch {
        // Fall back gracefully
      }
    }
    void loadDigest();
  });

  async function handleRunAction(action: AutopilotAction) {
    setExecutingActionId(action.id);
    try {
      const res = await fetch("/api/dashboard/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id }),
      });

      if (res.ok) {
        const data = await res.json();
        setDigest((prev) => ({
          ...prev,
          autonomousActions: prev.autonomousActions.map((a) =>
            a.id === action.id ? { ...a, executed: true } : a,
          ),
        }));
        setActionSuccessNotice(data.message || `Autopilot recommendation staged: "${action.title}"`);
        setTimeout(() => setActionSuccessNotice(""), 4500);
      }
    } catch {
      setActionSuccessNotice("Failed to execute autopilot action");
    } finally {
      setExecutingActionId(null);
    }
  }

  const briefingText = buildWhatsAppMorningBriefingText(digest, founderName);
  const briefingDeepLink = buildWhatsAppBriefingDeepLink(
    phoneNumber,
    digest,
    founderName,
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-[#101320] via-[#0D0E15] to-[#0A0B0E] p-6 shadow-xl">
      {/* Subtle Glow Background */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-600/10 blur-3xl" />

      {/* Header */}
      <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-md shadow-blue-500/10">
            <Zap size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">
                Founder Revenue Autopilot
              </h2>
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                ACTIVE MONITOR
              </span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                SANDBOX / DEMO METRICS
              </span>
            </div>
            <p className="text-xs text-white/50">
              Autonomous cashflow velocity, pipeline risk defense, and WhatsApp executive briefing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setBriefingModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 shadow-sm transition hover:bg-emerald-500/25"
          >
            <MessageSquare size={14} />
            Morning WhatsApp Briefing
          </button>
        </div>
      </div>

      {actionSuccessNotice && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={14} />
            {actionSuccessNotice}
          </span>
          <button
            type="button"
            onClick={() => setActionSuccessNotice("")}
            className="text-white/40 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4-Stat Revenue & Risk Grid */}
      <div className="relative mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Stat 1: 24h Revenue */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              24h Verified Revenue <span className="ml-1 text-[9px] text-amber-400 font-mono">[Demo / Sandbox]</span>
            </span>
            <DollarSign size={14} className="text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            ${digest.revenue24h.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-emerald-400">
            Pacing towards ${digest.projectedMrr.toLocaleString()} MRR
          </p>
        </div>

        {/* Stat 2: Active Pipeline */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Active Pipeline Value <span className="ml-1 text-[9px] text-amber-400 font-mono">[Demo]</span>
            </span>
            <TrendingUp size={14} className="text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            ${digest.activePipelineValue.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-white/40">
            Across 14 qualified deals
          </p>
        </div>

        {/* Stat 3: Capital At Risk */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between text-amber-400/70">
            <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400">
              Pipeline At Risk
            </span>
            <AlertTriangle size={14} className="text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-300">
            ${digest.pipelineAtRisk.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-amber-400/80">
            {digest.staleLeadsCount} deals inactive &gt;48h
          </p>
        </div>

        {/* Stat 4: AI Workforce */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between text-white/40">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Autonomous AI Impact <span className="ml-1 text-[9px] text-amber-400 font-mono">[Demo]</span>
            </span>
            <Bot size={14} className="text-violet-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            {digest.aiTasksCompleted24h} Tasks
          </p>
          <p className="mt-1 text-[11px] text-violet-300">
            +${digest.aiAttributedRevenue.toLocaleString()} attributed
          </p>
        </div>
      </div>

      {/* Autonomous Actions Queue */}
      <div className="mt-5 border-t border-white/[0.06] pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-white">
              Recommended Autopilot Actions
            </span>
          </div>
          <span className="text-[11px] text-white/40">
            Click to execute without leaving command desk
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-3">
          {digest.autonomousActions.map((action) => {
            const isExecuting = executingActionId === action.id;

            return (
              <div
                key={action.id}
                className="flex flex-col justify-between rounded-xl border border-white/[0.07] bg-black/30 p-3.5 transition hover:border-white/[0.12]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">
                      {action.title}
                    </span>
                    {action.executed ? (
                      <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        <CheckCircle2 size={11} />
                        Active
                      </span>
                    ) : (
                      <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                        Queued
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-white/50 leading-relaxed">
                    {action.description}
                  </p>
                  <p className="mt-1 text-[10px] text-white/40">
                    Target: {action.target}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-white/[0.04] pt-2.5">
                  <span className="text-[11px] font-medium text-emerald-400">
                    {action.potentialImpact}
                  </span>

                  <button
                    type="button"
                    disabled={action.executed || isExecuting}
                    onClick={() => handleRunAction(action)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      action.executed
                        ? "cursor-default text-white/30"
                        : "bg-blue-600 text-white hover:bg-blue-500 shadow-sm"
                    }`}
                  >
                    <Play size={11} />
                    {isExecuting
                      ? "Executing..."
                      : action.executed
                        ? "Completed"
                        : "Run Now"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Morning Briefing Modal */}
      {briefingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#111216] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setBriefingModalOpen(false)}
              className="absolute right-4 top-4 text-white/40 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <MessageSquare size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Morning Executive WhatsApp Briefing
                </h3>
                <p className="text-xs text-white/50">
                  Formatted for 1-click dispatch directly to the founder's phone.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                Founder WhatsApp Number
              </label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+14155550199"
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="mt-4">
              <label className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                Executive Briefing Preview (Zero Emojis)
              </label>
              <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-white/80">
                {briefingText}
              </pre>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setBriefingModalOpen(false)}
                className="rounded-lg px-3 py-2 text-xs text-white/60 hover:text-white"
              >
                Close
              </button>

              <a
                href={briefingDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setBriefingModalOpen(false)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500"
              >
                <Send size={13} />
                Send Briefing to WhatsApp
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
