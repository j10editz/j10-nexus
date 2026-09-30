"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Brain,
  Workflow,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Sliders,
  BookOpen,
  Zap,
} from "lucide-react";

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
    <div className="min-h-[calc(100dvh-72px)] bg-[#07090f] p-4 sm:p-6 lg:p-8 text-white">
      <div className="mx-auto max-w-[1360px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-400">
              <span>J10 NEXUS</span>
              <span className="text-white/20">/</span>
              <span className="text-[#8d96a8]">Autonomous Intelligence</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              J10 AI Operator
            </h1>
            <p className="mt-1 text-xs text-[#8d96a8]">
              Unified control center for J10 AI Receptionist, J10 Knowledge base, and J10 Automations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/bot-setup?tab=simulator"
              className="flex items-center gap-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-3.5 py-2 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/15"
            >
              <Bot size={14} />
              <span>Launch Live Simulator</span>
            </Link>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("receptionist")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "receptionist"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            J10 AI Receptionist
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("knowledge")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "knowledge"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            J10 Knowledge
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("automations")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === "automations"
                ? "bg-white/10 text-white"
                : "text-[#8d96a8] hover:text-white"
            }`}
          >
            J10 Automations
          </button>
        </div>

        {/* Tab 1: AI Receptionist */}
        {activeTab === "receptionist" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 lg:col-span-2 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-white">Receptionist Configuration</h2>
                <p className="mt-0.5 text-xs text-[#8d96a8]">
                  Define how your 24/7 AI operator responds, quotes pricing, and books appointments.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-semibold text-white">Business Profile & Services</div>
                  <p className="mt-1 text-xs text-[#8d96a8]">
                    {config?.business_name
                      ? `Configured for ${config.business_name} with ${(config.services || []).length} active services.`
                      : "Configure your business description, services, pricing tiers, and operating hours."}
                  </p>
                  <Link
                    href="/dashboard/bot-setup"
                    className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    <span>Edit Business Profile & Services</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-semibold text-white">Tone & Qualification Rules</div>
                  <p className="mt-1 text-xs text-[#8d96a8]">
                    Control conversation personality (Professional, Friendly, Consultative) and required lead fields.
                  </p>
                  <Link
                    href="/dashboard/bot-setup?tab=advanced"
                    className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    <span>Tune Tone & Rules</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-semibold text-white">Human Escalation Protocol</div>
                  <p className="mt-1 text-xs text-[#8d96a8]">
                    When a lead asks for custom quoting or requests an owner call, AI pauses and escalates into J10 Inbox.
                  </p>
                  <Link
                    href="/dashboard/inbox?filter=needs_human"
                    className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    <span>View Handoff Queue in J10 Inbox</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Sidebar quick simulator */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-4">
              <div className="flex items-center gap-2 text-cyan-400">
                <Bot size={18} />
                <h3 className="text-sm font-semibold text-white">Receptionist Testing</h3>
              </div>
              <p className="text-xs text-[#8d96a8]">
                Test your AI operator instantly before talking to live customers on WhatsApp or Telegram.
              </p>
              <Link
                href="/dashboard/bot-setup?tab=simulator"
                className="block text-center rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                Open Full Simulator
              </Link>
            </div>
          </div>
        )}

        {/* Tab 2: J10 Knowledge */}
        {activeTab === "knowledge" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">J10 Knowledge Hub</h2>
                <p className="mt-0.5 text-xs text-[#8d96a8]">
                  Upload business documents, policies, warranty details, and FAQs for high-precision retrieval.
                </p>
              </div>
              <Link
                href="/dashboard/knowledge"
                className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                Manage Knowledge Documents
              </Link>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-xs text-[#8d96a8] space-y-2">
              <div className="flex items-center gap-2 text-white font-medium">
                <BookOpen size={16} className="text-cyan-400" />
                <span>Deterministic Grounding</span>
              </div>
              <p>
                J10 AI operator quotes exclusively from your verified documents to ensure accurate prices, policies, and service answers without hallucination.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: J10 Automations */}
        {activeTab === "automations" && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">J10 Automations Engine</h2>
                <p className="mt-0.5 text-xs text-[#8d96a8]">
                  Inspect automated workflows, execution triggers, approval gates, and run reliability.
                </p>
              </div>
              <Link
                href="/dashboard/automation"
                className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
              >
                Open Automation Studio
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs">
                <div className="font-semibold text-white">Instant Lead Response</div>
                <p className="mt-1 text-[#8d96a8]">
                  Triggered on inbound message or form submission. Responds in &lt;11 seconds.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs">
                <div className="font-semibold text-white">Appointment Follow-Up</div>
                <p className="mt-1 text-[#8d96a8]">
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
