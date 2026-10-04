"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import {
  DashboardPageHeader,
  DashboardButton,
} from "../../../components/dashboard/DashboardPrimitives";

export default function J10AiOperatorPage() {
  const [activeTab, setActiveTab] = useState<"receptionist" | "knowledge" | "automations">("receptionist");
  const [config, setConfig] = useState<any>(null);
  const [knowledgeSummary, setKnowledgeSummary] = useState<any>(null);
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const [configResponse, knowledgeResponse, automationsResponse] = await Promise.all([
        fetch("/api/bot/config", { cache: "no-store" }),
        fetch("/api/knowledge", { cache: "no-store" }),
        fetch("/api/automations", { cache: "no-store" }),
      ]);
      if (configResponse.ok) setConfig((await configResponse.json()).config || null);
      if (knowledgeResponse.ok) setKnowledgeSummary((await knowledgeResponse.json()).summary || null);
      if (automationsResponse.ok) setAutomations((await automationsResponse.json()).automations || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  return (
    <div className="min-h-[calc(100dvh-56px)] bg-[#F8F7FC] px-4 py-6 sm:px-6 lg:px-8 text-[#17151F]">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Page Header */}
        <DashboardPageHeader
          title="J10 AI Operator"
          subtitle="Configure what J10 may answer, automate, and escalate. Live behavior remains bounded by connected channels and published workflows."
          actions={
            <Link
              href="/dashboard/bot-setup?tab=simulator"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6347E8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5136D6]"
            >
              <Bot size={13} />
              <span>Launch Simulator</span>
            </Link>
          }
        />

        {/* Tab Controls */}
        <div className="flex items-center gap-1 border-b border-[#E2DEEA] pb-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("receptionist")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "receptionist"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            AI Receptionist
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("knowledge")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "knowledge"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            Knowledge Base
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("automations")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "automations"
                ? "bg-[#6347E8] text-white"
                : "text-[#6F687A] hover:text-[#17151F]"
            }`}
          >
            Automations Engine
          </button>
        </div>

        {/* Tab 1: AI Receptionist */}
        {activeTab === "receptionist" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-5 lg:col-span-2 space-y-4 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
              <div>
                <h2 className="text-sm font-semibold text-[#17151F]">Receptionist Configuration</h2>
                <p className="mt-0.5 text-xs text-[#6F687A]">
                  Define how J10 responds, uses approved business information, and hands work to a person.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4">
                  <div className="text-xs font-semibold text-[#17151F]">Business Profile & Services</div>
                  <p className="mt-1 text-xs text-[#6F687A]">
                    {config?.business_name
                      ? `Configured for ${config.business_name} with ${(config.services || []).length} active services.`
                      : "Configure your business description, services, pricing tiers, and operating hours."}
                  </p>
                  <Link
                    href="/dashboard/bot-setup"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[#6347E8] hover:underline"
                  >
                    <span>Edit Business Profile & Services</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4">
                  <div className="text-xs font-semibold text-[#17151F]">Tone & Qualification Rules</div>
                  <p className="mt-1 text-xs text-[#6F687A]">
                    Control conversation personality (Professional, Friendly, Consultative) and required lead fields.
                  </p>
                  <Link
                    href="/dashboard/bot-setup?tab=advanced"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[#6347E8] hover:underline"
                  >
                    <span>Tune Tone & Rules</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4">
                  <div className="text-xs font-semibold text-[#17151F]">Human Escalation Protocol</div>
                  <p className="mt-1 text-xs text-[#6F687A]">
                    {config?.escalation_instructions
                      ? config.escalation_instructions
                      : "No workspace-specific escalation instructions are configured yet."}
                  </p>
                  <Link
                    href="/dashboard/inbox?filter=needs_human"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[#6347E8] hover:underline"
                  >
                    <span>View Handoff Queue in J10 Inbox</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick Testing Panel */}
            <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-5 space-y-3 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
              <div className="flex items-center gap-2 text-[#6347E8]">
                <Bot size={16} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#17151F]">Receptionist Testing</h3>
              </div>
              <p className="text-xs text-[#6F687A]">
                Test responses in the isolated simulator before enabling J10 on a connected customer channel.
              </p>
              <Link
                href="/dashboard/bot-setup?tab=simulator"
                className="block text-center rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-4 py-2 text-xs font-medium text-[#17151F] transition hover:bg-[#F3F1F8]"
              >
                Open Full Simulator
              </Link>
            </div>
          </div>
        )}

        {/* Tab 2: Knowledge Base */}
        {activeTab === "knowledge" && (
          <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-5 space-y-4 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#17151F]">Knowledge Hub</h2>
                <p className="mt-0.5 text-xs text-[#6F687A]">
                  Manage the published documents J10 may use when answering customers.
                </p>
              </div>
              <Link
                href="/dashboard/knowledge"
                className="rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-medium text-[#17151F] transition hover:bg-[#F3F1F8]"
              >
                Manage Knowledge Documents
              </Link>
            </div>

            <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs text-[#6F687A] space-y-2">
              <div className="flex items-center gap-2 text-[#17151F] font-medium">
                <BookOpen size={14} className="text-[#6347E8]" />
                <span>Published grounding sources</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {knowledgeSummary
                  ? `${knowledgeSummary.totalDocuments || 0} document${knowledgeSummary.totalDocuments === 1 ? "" : "s"} available; ${knowledgeSummary.activeGroundingDocuments || 0} marked active for grounding.`
                  : "No knowledge summary is available. J10 will not claim document coverage until the backend confirms it."}
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Automations Engine */}
        {activeTab === "automations" && (
          <div className="rounded-xl border border-[#E2DEEA] bg-[#FFFFFF] p-5 space-y-4 shadow-[0_4px_16px_rgba(49,32,92,0.06)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#17151F]">Automations Engine</h2>
                <p className="mt-0.5 text-xs text-[#6F687A]">
                  Inspect automated workflows, execution triggers, approval gates, and run reliability.
                </p>
              </div>
              <Link
                href="/dashboard/automation"
                className="rounded-lg border border-[#E2DEEA] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-medium text-[#17151F] transition hover:bg-[#F3F1F8]"
              >
                Open Automation Studio
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {automations.length === 0 ? (
                <div className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs text-[#6F687A] sm:col-span-2">
                  No automations are recorded for this workspace. Nothing is presented as active.
                </div>
              ) : automations.slice(0, 6).map((automation) => (
                <div key={automation.id} className="rounded-lg border border-[#E2DEEA] bg-[#F8F7FC] p-4 text-xs">
                  <div className="flex items-center justify-between gap-3"><span className="font-semibold text-[#17151F]">{automation.name}</span><span className="rounded border border-[#E2DEEA] px-2 py-0.5 text-[10px] uppercase text-[#6F687A]">{automation.status}</span></div>
                  <p className="mt-1 text-[11px] text-[#6F687A]">{automation.description || `Trigger: ${automation.trigger_type || "not configured"}`}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
