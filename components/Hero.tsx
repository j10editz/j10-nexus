"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  Globe,
  Megaphone,
  MessageSquare,
  Send,
  Sparkles,
  Workflow,
} from "lucide-react";

const capabilities = [
  "AI Employees",
  "Automation",
  "WhatsApp AI",
  "AI Studio",
  "CRM",
  "Commerce",
];

const suggestions = [
  {
    label: "Create AI Sales Agent",
    icon: Bot,
    prompt:
      "Create an AI sales agent for my business that can qualify leads, follow up automatically and schedule appointments.",
  },
  {
    label: "Automate WhatsApp",
    icon: MessageSquare,
    prompt:
      "Automate my WhatsApp customer support, lead capture, FAQs and follow-ups.",
  },
  {
    label: "Build Website",
    icon: Globe,
    prompt:
      "Build a professional website for my business with lead capture and booking.",
  },
  {
    label: "Launch Marketing",
    icon: Megaphone,
    prompt:
      "Create a complete marketing campaign to help me get more customers.",
  },
];

export default function Hero() {
  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [showPlan, setShowPlan] = useState(false);

  function handleSubmit() {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) return;

    setSubmittedPrompt(cleanPrompt);
    setShowPlan(true);
  }

  function chooseSuggestion(value: string) {
    setPrompt(value);
    setShowPlan(false);
  }

  return (
    <section className="relative min-h-[calc(100vh-72px)] overflow-hidden bg-[#09090B] text-white">
      {/* BACKGROUND */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-180px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[120px]" />

        <div className="absolute left-[10%] top-[35%] h-[300px] w-[300px] rounded-full bg-violet-600/10 blur-[110px]" />

        <div className="absolute right-[5%] top-[45%] h-[320px] w-[320px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-6 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">

          {/* LEFT */}
          <div>
            {/* EYEBROW */}
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.07] px-3.5 py-2 text-xs font-medium text-blue-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
              </span>

              The AI operating system for business
            </div>

            {/* HEADLINE */}
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-[76px]">
              Your business.
              <br />

              <span className="bg-gradient-to-r from-white via-blue-200 to-violet-300 bg-clip-text text-transparent">
                Powered by intelligence.
              </span>
            </h1>

            {/* DESCRIPTION */}
            <p className="mt-7 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              Tell J10 AI what your business needs. It can design the AI
              employees, automations, workflows, marketing and systems needed
              to make it happen.
            </p>

            {/* PUBLIC J10 AI PROMPT */}
            <div className="mt-8 max-w-3xl">
              <div className="rounded-2xl border border-blue-500/20 bg-[#0d111c]/90 p-2 shadow-2xl shadow-blue-950/20 backdrop-blur-xl transition-all focus-within:border-blue-500/40">
                <div className="flex items-center gap-3 px-3 pb-1 pt-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
                    <Sparkles size={14} />
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-white">
                      J10 AI
                    </p>

                    <p className="text-[10px] text-zinc-600">
                      What do you want to build?
                    </p>
                  </div>

                  <div className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Online
                  </div>
                </div>

                <textarea
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setShowPlan(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  rows={3}
                  placeholder="Describe what you want J10 AI to create, automate or improve..."
                  className="mt-2 w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600"
                />

                <div className="flex items-center justify-between border-t border-white/[0.06] px-2 pt-2">
                  <p className="hidden px-2 text-[10px] text-zinc-600 sm:block">
                    Press Enter to ask J10 AI
                  </p>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!prompt.trim()}
                    className="ml-auto flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Ask J10 AI
                    <Send size={14} />
                  </button>
                </div>
              </div>

              {/* SUGGESTIONS */}
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => {
                  const Icon = suggestion.icon;

                  return (
                    <button
                      key={suggestion.label}
                      type="button"
                      onClick={() => chooseSuggestion(suggestion.prompt)}
                      className="group flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[11px] text-zinc-500 transition-all hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white"
                    >
                      <Icon
                        size={12}
                        className="transition-colors group-hover:text-blue-400"
                      />

                      {suggestion.label}
                    </button>
                  );
                })}
              </div>

              {/* AI RESPONSE PREVIEW */}
              {showPlan && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-blue-500/[0.07] via-violet-500/[0.05] to-transparent">
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                        <Sparkles size={15} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold">
                          J10 AI can build this.
                        </p>

                        <p className="text-[11px] text-zinc-500">
                          Proposed J10 NEXUS system
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
                        Your request
                      </p>

                      <p className="mt-2 text-sm leading-6 text-zinc-300">
                        “{submittedPrompt}”
                      </p>
                    </div>

                    <div className="mt-4 space-y-2">
                      {[
                        "Understand your business requirements",
                        "Configure the right J10 AI tools",
                        "Build the required agents and workflows",
                        "Connect your business channels and data",
                      ].map((step, index) => (
                        <div
                          key={step}
                          className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-3"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-[10px] font-medium text-blue-400">
                            0{index + 1}
                          </div>

                          <span className="text-xs text-zinc-400">
                            {step}
                          </span>

                          <Check
                            size={13}
                            className="ml-auto shrink-0 text-emerald-400"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-medium text-zinc-300">
                          Ready to continue?
                        </p>

                        <p className="mt-1 text-[11px] text-zinc-600">
                          Create your workspace to let J10 AI build and deploy
                          this system.
                        </p>
                      </div>

                      <a
                        href="/login"
                        className="group flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200"
                      >
                        Continue with J10 AI

                        <ArrowRight
                          size={14}
                          className="transition-transform group-hover:translate-x-0.5"
                        />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* CAPABILITIES */}
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-zinc-600">
                {capabilities.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Check size={12} className="text-emerald-400" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — J10 NEXUS PREVIEW */}
          <div className="relative">
            <div className="absolute -inset-8 rounded-[40px] bg-blue-600/10 blur-3xl" />

            <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[#0E1015] shadow-2xl shadow-black/50">

              {/* WINDOW BAR */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-1.5 text-[10px] text-zinc-600">
                  app.j10nexus.com
                </div>

                <div className="w-10" />
              </div>

              <div className="p-5 sm:p-7">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-blue-400">
                      J10 NEXUS
                    </p>

                    <h3 className="mt-1 text-lg font-semibold">
                      Business Operating System
                    </h3>
                  </div>

                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04]">
                    <Sparkles size={16} className="text-blue-400" />
                  </div>
                </div>

                {/* J10 AI */}
                <div className="rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.09] via-violet-500/[0.05] to-transparent p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                      <Sparkles size={16} />
                    </div>

                    <div>
                      <p className="text-xs font-semibold">
                        J10 AI
                      </p>

                      <p className="text-[10px] text-zinc-500">
                        Business Intelligence & Execution
                      </p>
                    </div>

                    <div className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Online
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                    <p className="text-[10px] text-zinc-600">
                      Business request
                    </p>

                    <p className="mt-2 text-xs leading-5 text-zinc-300">
                      “Create an AI sales system that finds leads, follows up
                      automatically and schedules qualified prospects.”
                    </p>
                  </div>

                  <div className="mt-3 space-y-2">
                    {[
                      ["AI Sales Agent", Bot],
                      ["Lead Follow-up Workflow", Workflow],
                      ["WhatsApp Automation", MessageSquare],
                    ].map(([label, Icon]) => {
                      const ItemIcon = Icon as typeof Bot;

                      return (
                        <div
                          key={label as string}
                          className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-3"
                        >
                          <ItemIcon
                            size={13}
                            className="text-blue-400"
                          />

                          <span className="text-xs text-zinc-400">
                            {label as string}
                          </span>

                          <Check
                            size={12}
                            className="ml-auto text-emerald-400"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* OPERATING SYSTEM MODULES */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <PreviewCard
                    label="AI Employees"
                    value="Ready"
                  />

                  <PreviewCard
                    label="Automation"
                    value="Connected"
                  />

                  <PreviewCard
                    label="CRM"
                    value="Synced"
                  />

                  <PreviewCard
                    label="Analytics"
                    value="Live"
                  />
                </div>
              </div>
            </div>

            {/* FLOATING STATUS */}
            <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-white/10 bg-[#111216]/95 px-4 py-3 shadow-xl backdrop-blur-xl sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Check size={15} className="text-emerald-400" />
                </div>

                <div>
                  <p className="text-xs font-medium">
                    One intelligent system
                  </p>

                  <p className="text-[10px] text-zinc-600">
                    J10 AI orchestrates everything.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM */}
        <div className="mt-24 border-t border-white/[0.06] pt-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <p className="text-sm text-zinc-600">
              Tell J10 AI what you need. J10 NEXUS makes it happen.
            </p>

            <div className="flex flex-wrap items-center gap-5 text-xs text-zinc-600">
              <span>AI Workforce</span>
              <span>Automation</span>
              <span>Business Intelligence</span>
              <span>Commerce</span>
              <span>Marketing</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
      <p className="text-[10px] text-zinc-600">
        {label}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {value}
        </p>

        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </div>
    </div>
  );
}