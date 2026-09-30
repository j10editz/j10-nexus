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
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/bot/config");
      if (res.ok) {
        const json = await res.json();
        setConfig(json.config || null);
      }
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
    <div className="min-h-[calc(100dvh-56px)] bg-[#090B10] px-4 py-6 sm:px-6 lg:px-8 text-[#F5F7FA]">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Page Header */}
        <DashboardPageHeader
          title="J10 AI Operator"
          subtitle="Unified control center for J10 AI Receptionist, J10 Knowledge base, and J10 Automations."
          actions={
            <Link
              href="/dashboard/bot-setup?tab=simulator"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F7CFF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4F7CFF]/90"
            >
              <Bot size={13} />
              <span>Launch Simulator</span>
            </Link>
          }
        />

        {/* Tab Controls */}
        <div className="flex items-center gap-1 border-b border-[#242A35] pb-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("receptionist")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "receptionist"
                ? "bg-[#151922] text-[#F5F7FA] border border-[#242A35]"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            AI Receptionist
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("knowledge")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "knowledge"
                ? "bg-[#151922] text-[#F5F7FA] border border-[#242A35]"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Knowledge Base
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("automations")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeTab === "automations"
                ? "bg-[#151922] text-[#F5F7FA] border border-[#242A35]"
                : "text-[#98A2B3] hover:text-[#F5F7FA]"
            }`}
          >
            Automations Engine
          </button>
        </div>

        {/* Tab 1: AI Receptionist */}
        {activeTab === "receptionist" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-[#242A35] bg-[#101319] p-5 lg:col-span-2 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#F5F7FA]">Receptionist Configuration</h2>
                <p className="mt-0.5 text-xs text-[#98A2B3]">
                  Define how your 24/7 AI operator responds, quotes pricing, and books appointments.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-[#242A35] bg-[#151922] p-4">
                  <div className="text-xs font-semibold text-[#F5F7FA]">Business Profile & Services</div>
                  <p className="mt-1 text-xs text-[#98A2B3]">
                    {config?.business_name
                      ? `Configured for ${config.business_name} with ${(config.services || []).length} active services.`
                      : "Configure your business description, services, pricing tiers, and operating hours."}
                  </p>
                  <Link
                    href="/dashboard/bot-setup"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[#4F7CFF] hover:underline"
                  >
                    <span>Edit Business Profile & Services</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="rounded-lg border border-[#242A35] bg-[#151922] p-4">
                  <div className="text-xs font-semibold text-[#F5F7FA]">Tone & Qualification Rules</div>
                  <p className="mt-1 text-xs text-[#98A2B3]">
                    Control conversation personality (Professional, Friendly, Consultative) and required lead fields.
                  </p>
                  <Link
                    href="/dashboard/bot-setup?tab=advanced"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[#4F7CFF] hover:underline"
                  >
                    <span>Tune Tone & Rules</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="rounded-lg border border-[#242A35] bg-[#151922] p-4">
                  <div className="text-xs font-semibold text-[#F5F7FA]">Human Escalation Protocol</div>
                  <p className="mt-1 text-xs text-[#98A2B3]">
                    When a lead asks for custom quoting or requests an owner call, AI pauses and escalates into J10 Inbox.
                  </p>
                  <Link
                    href="/dashboard/inbox?filter=needs_human"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[#4F7CFF] hover:underline"
                  >
                    <span>View Handoff Queue in J10 Inbox</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick Testing Panel */}
            <div className="rounded-xl border border-[#242A35] bg-[#101319] p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#4F7CFF]">
                <Bot size={16} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F5F7FA]">Receptionist Testing</h3>
              </div>
              <p className="text-xs text-[#98A2B3]">
                Test your AI operator instantly before talking to live customers on WhatsApp or Telegram.
              </p>
              <Link
                href="/dashboard/bot-setup?tab=simulator"
                className="block text-center rounded-lg border border-[#242A35] bg-[#151922] px-4 py-2 text-xs font-medium text-[#F5F7FA] transition hover:bg-[#242A35]"
              >
                Open Full Simulator
              </Link>
            </div>
          </div>
        )}

        {/* Tab 2: Knowledge Base */}
        {activeTab === "knowledge" && (
          <div className="rounded-xl border border-[#242A35] bg-[#101319] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#F5F7FA]">Knowledge Hub</h2>
                <p className="mt-0.5 text-xs text-[#98A2B3]">
                  Upload business documents, policies, warranty details, and FAQs for high-precision retrieval.
                </p>
              </div>
              <Link
                href="/dashboard/knowledge"
                className="rounded-lg border border-[#242A35] bg-[#151922] px-3.5 py-1.5 text-xs font-medium text-[#F5F7FA] transition hover:bg-[#242A35]"
              >
                Manage Knowledge Documents
              </Link>
            </div>

            <div className="rounded-lg border border-[#242A35] bg-[#151922] p-4 text-xs text-[#98A2B3] space-y-2">
              <div className="flex items-center gap-2 text-[#F5F7FA] font-medium">
                <BookOpen size={14} className="text-[#4F7CFF]" />
                <span>Deterministic Grounding</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                J10 AI operator quotes exclusively from your verified documents to ensure accurate prices, policies, and service answers without hallucination.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Automations Engine */}
        {activeTab === "automations" && (
          <div className="rounded-xl border border-[#242A35] bg-[#101319] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#F5F7FA]">Automations Engine</h2>
                <p className="mt-0.5 text-xs text-[#98A2B3]">
                  Inspect automated workflows, execution triggers, approval gates, and run reliability.
                </p>
              </div>
              <Link
                href="/dashboard/automation"
                className="rounded-lg border border-[#242A35] bg-[#151922] px-3.5 py-1.5 text-xs font-medium text-[#F5F7FA] transition hover:bg-[#242A35]"
              >
                Open Automation Studio
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#242A35] bg-[#151922] p-4 text-xs">
                <div className="font-semibold text-[#F5F7FA]">Instant Lead Response</div>
                <p className="mt-1 text-[11px] text-[#98A2B3]">
                  Triggered on inbound message or form submission. Responds in &lt;11 seconds.
                </p>
              </div>
              <div className="rounded-lg border border-[#242A35] bg-[#151922] p-4 text-xs">
                <div className="font-semibold text-[#F5F7FA]">Appointment Follow-Up</div>
                <p className="mt-1 text-[11px] text-[#98A2B3]">
                  Triggered after consultation completes. Delivers proposal and payment link.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
