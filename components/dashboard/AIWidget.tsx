"use client";

import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

const insights = [
  {
    label: "Revenue",
    value: "+18.4%",
    status: "up",
    icon: TrendingUp,
  },
  {
    label: "Leads",
    value: "+12.7%",
    status: "up",
    icon: TrendingUp,
  },
  {
    label: "Conversions",
    value: "-4.2%",
    status: "down",
    icon: TrendingDown,
  },
];

const recommendations = [
  {
    title: "Follow up with abandoned carts",
    description: "14 customers are ready for a follow-up.",
  },
  {
    title: "Reactivate inactive customers",
    description: "23 customers haven't purchased recently.",
  },
  {
    title: "Review declining campaign",
    description: "One campaign dropped 11% this week.",
  },
];

export default function AIWidget() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-[#0d111c]">

      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-600/15 blur-3xl" />

      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="relative p-6 lg:p-7">

        {/* HEADER */}
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">

          <div className="flex items-center gap-3">

            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">

              <Sparkles size={20} />

              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0d111c] bg-emerald-400" />

            </div>

            <div>
              <div className="flex items-center gap-2">

                <h2 className="text-sm font-semibold">
                  J10 AI
                </h2>

                <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-400">
                  Intelligence
                </span>

              </div>

              <p className="mt-1 text-xs text-zinc-500">
                Your business intelligence layer
              </p>
            </div>

          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">

            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />

            J10 AI Online

          </div>

        </div>

        {/* INTRO */}
        <div className="mt-8">

          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400">
            Business Intelligence
          </p>

          <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Good morning, John.
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            I&apos;ve analyzed your recent business activity. Your overall
            performance is strong, but I found a few opportunities that could
            improve revenue and customer conversion.
          </p>

        </div>

        {/* METRICS */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">

          {insights.map((insight) => {

            const Icon = insight.icon;
            const isDown = insight.status === "down";

            return (
              <div
                key={insight.label}
                className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]"
              >

                <div className="flex items-center justify-between">

                  <span className="text-xs text-zinc-500">
                    {insight.label}
                  </span>

                  <Icon
                    size={14}
                    className={
                      isDown
                        ? "text-red-400"
                        : "text-emerald-400"
                    }
                  />

                </div>

                <div className="mt-2 flex items-center gap-2">

                  <span className="text-lg font-semibold">
                    {insight.value}
                  </span>

                  <span
                    className={
                      isDown
                        ? "text-[10px] text-red-400"
                        : "text-[10px] text-emerald-400"
                    }
                  >
                    vs. previous period
                  </span>

                </div>

              </div>
            );
          })}

        </div>

        {/* RECOMMENDATIONS */}
        <div className="mt-7">

          <div className="mb-3 flex items-center justify-between">

            <div>

              <p className="text-sm font-semibold">
                Recommended actions
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                Actions J10 AI believes can improve your business.
              </p>

            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400">

              <Zap size={11} />

              3 opportunities

            </div>

          </div>

          <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06] bg-black/10">

            {recommendations.map((recommendation, index) => (

              <button
                key={recommendation.title}
                className="group flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-white/[0.025]"
              >

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-xs font-semibold text-zinc-500">

                  {String(index + 1).padStart(2, "0")}

                </div>

                <div className="min-w-0 flex-1">

                  <p className="text-sm font-medium text-zinc-300 transition-colors group-hover:text-white">
                    {recommendation.title}
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    {recommendation.description}
                  </p>

                </div>

                <ChevronRight
                  size={16}
                  className="shrink-0 text-zinc-700 transition-all group-hover:translate-x-1 group-hover:text-blue-400"
                />

              </button>

            ))}

          </div>

        </div>

        {/* ACTIONS */}
        <div className="mt-6 flex flex-wrap gap-3">

          <button className="group flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200">

            <CheckCircle2 size={15} />

            Execute with J10 AI

            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />

          </button>

          <button className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.08] hover:text-white">

            Ask J10 AI

            <ArrowRight size={14} />

          </button>

        </div>

      </div>
    </section>
  );
}