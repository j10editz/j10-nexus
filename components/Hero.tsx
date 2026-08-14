"use client";

import {
  ArrowRight,
  Bot,
  Check,
  Play,
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

export default function Hero() {
  return (
    <section className="relative min-h-[calc(100vh-72px)] overflow-hidden bg-[#09090B] text-white">
      {/* Background atmosphere */}
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
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_.95fr]">
          {/* LEFT */}
          <div>
            {/* Eyebrow */}
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.07] px-3.5 py-2 text-xs font-medium text-blue-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
              </span>

              The AI operating system for business
            </div>

            {/* Headline */}
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-[76px]">
              Your business.
              <br />

              <span className="bg-gradient-to-r from-white via-blue-200 to-violet-300 bg-clip-text text-transparent">
                Powered by intelligence.
              </span>
            </h1>

            {/* Description */}
            <p className="mt-7 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              J10 NEXUS brings AI employees, automation, content creation,
              customer management, commerce, and business intelligence into
              one powerful platform.
            </p>

            {/* CTA */}
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-black transition-all duration-300 hover:-translate-y-0.5 hover:bg-zinc-200">
                Start Building Free

                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </button>

              <button className="group inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]">
                <Play
                  size={15}
                  className="fill-current"
                />

                Explore J10 NEXUS
              </button>
            </div>

            {/* Trust */}
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-zinc-600">
              {capabilities.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <Check size={13} className="text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — PRODUCT PREVIEW */}
          <div className="relative">
            <div className="absolute -inset-8 rounded-[40px] bg-blue-600/10 blur-3xl" />

            <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[#0E1015] shadow-2xl shadow-black/50">
              {/* Window bar */}
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

              {/* Mini dashboard */}
              <div className="p-5 sm:p-7">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-blue-400">
                      J10 NEXUS
                    </p>

                    <h3 className="mt-1 text-lg font-semibold">
                      Business Overview
                    </h3>
                  </div>

                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04]">
                    <Sparkles size={16} className="text-blue-400" />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <PreviewCard
                    label="Revenue"
                    value="$24,500"
                    change="+18.4%"
                  />

                  <PreviewCard
                    label="AI Employees"
                    value="12"
                    change="Running"
                  />

                  <PreviewCard
                    label="Automations"
                    value="48"
                    change="Active"
                  />

                  <PreviewCard
                    label="Marketplace"
                    value="$8,320"
                    change="+24.8%"
                  />
                </div>

                {/* Intelligence */}
                <div className="mt-3 rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.09] via-violet-500/[0.05] to-transparent p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                      <Sparkles size={16} />
                    </div>

                    <div>
                      <p className="text-xs font-semibold">J10 AI</p>
                      <p className="text-[10px] text-zinc-500">
                        Business Intelligence
                      </p>
                    </div>

                    <div className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Online
                    </div>
                  </div>

                  <p className="mt-5 text-sm font-medium">
                    Your revenue opportunity is growing.
                  </p>

                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    J10 AI detected 14 abandoned carts and recommends a
                    targeted follow-up campaign.
                  </p>

                  <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black">
                    Review opportunity
                    <ArrowRight size={13} />
                  </button>
                </div>

                {/* Bottom activity */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2">
                      <Bot size={14} className="text-blue-400" />
                      <span className="text-[10px] text-zinc-500">
                        AI Operations
                      </span>
                    </div>

                    <p className="mt-3 text-sm font-medium">
                      12 employees working
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <div className="flex items-center gap-2">
                      <Workflow size={14} className="text-violet-400" />
                      <span className="text-[10px] text-zinc-500">
                        Automations
                      </span>
                    </div>

                    <p className="mt-3 text-sm font-medium">
                      48 workflows running
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating status */}
            <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-white/10 bg-[#111216]/95 px-4 py-3 shadow-xl backdrop-blur-xl sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Check size={15} className="text-emerald-400" />
                </div>

                <div>
                  <p className="text-xs font-medium">Everything connected</p>
                  <p className="text-[10px] text-zinc-600">
                    Your business runs smarter.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom statement */}
        <div className="mt-24 border-t border-white/[0.06] pt-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <p className="text-sm text-zinc-600">
              One platform. One intelligent workspace.
            </p>

            <div className="flex items-center gap-5 text-xs text-zinc-600">
              <span>AI</span>
              <span>Automation</span>
              <span>Business Intelligence</span>
              <span>Commerce</span>
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
  change,
}: {
  label: string;
  value: string;
  change: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
      <p className="text-[10px] text-zinc-600">{label}</p>

      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-lg font-semibold tracking-tight">{value}</p>

        <span className="text-[9px] font-medium text-emerald-400">
          {change}
        </span>
      </div>
    </div>
  );
}