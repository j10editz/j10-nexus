"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, Building2, ShieldCheck, Zap } from "lucide-react";
import { PUBLIC_PLANS, type PlanDefinition } from "@/lib/billing/plans";

export default function Pricing() {
  const [interval, setInterval] = useState<"month" | "year">("month");

  return (
    <div className="relative mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
          J10 Commercial Plans
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          Operating capacity built for your business.
        </h1>
        <p className="mt-5 text-base leading-7 text-[#a9b1c0] sm:text-lg">
          Every plan connects the same unified J10 revenue workflow. Scale your message volume and AI agent capacity as your customer demand grows.
        </p>

        {/* Monthly / Annual Toggle */}
        <div className="mt-10 flex items-center justify-center">
          <div className="inline-flex items-center rounded-full border border-white/[0.12] bg-white/[0.04] p-1 backdrop-blur-md">
            <button
              type="button"
              id="billing-interval-monthly"
              onClick={() => setInterval("month")}
              className={`rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 ${
                interval === "month"
                  ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                  : "text-[#a9b1c0] hover:text-white"
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              id="billing-interval-annual"
              onClick={() => setInterval("year")}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 ${
                interval === "year"
                  ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                  : "text-[#a9b1c0] hover:text-white"
              }`}
            >
              <span>Annual Billing</span>
              <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-bold text-cyan-200 border border-cyan-400/30">
                2 Months Free
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Grid */}
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PUBLIC_PLANS.map((plan: PlanDefinition) => {
          const isPopular = plan.popular;
          const isEnterprise = plan.quoteOnly || plan.id === "enterprise";

          // Calculate displayed price
          let displayAmount = plan.price;
          let subText = "/month";
          let billingNote = "Billed monthly";

          if (isEnterprise) {
            displayAmount = plan.price;
            subText = "/month";
            billingNote = "Starting from $199 · Custom quote";
          } else if (interval === "year" && plan.annualPrice) {
            displayAmount = Math.round(plan.annualPrice / 12);
            subText = "/month";
            billingNote = `$${plan.annualPrice} billed annually (10x monthly)`;
          }

          return (
            <article
              key={plan.id}
              id={`pricing-card-${plan.id}`}
              className={`relative flex flex-col justify-between overflow-hidden rounded-[24px] p-6 sm:p-7 transition-all duration-300 ${
                isPopular
                  ? "j10-surface-glow border-cyan-400/50 shadow-[0_20px_60px_rgba(47,107,255,0.25)] bg-[#0d1629]/90"
                  : "j10-surface border-white/[0.09] bg-[#090e1c]/80 hover:border-white/[0.18]"
              }`}
            >
              {/* Popular Hero Badge */}
              {isPopular && (
                <>
                  <div className="absolute inset-x-0 top-0 h-1.5 j10-gradient" />
                  <div className="mb-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/15 border border-cyan-400/30 px-3 py-1 text-[10px] font-bold text-cyan-200">
                      <Sparkles size={12} className="text-cyan-300" />
                      MOST POPULAR HERO PLAN
                    </span>
                  </div>
                </>
              )}

              {/* Quote Only Badge */}
              {isEnterprise && (
                <div className="mb-4 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 px-3 py-1 text-[10px] font-bold text-purple-200">
                    <Building2 size={12} className="text-purple-300" />
                    QUOTE-BASED CUSTOM SLA
                  </span>
                </div>
              )}

              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">{plan.name}</h2>
                <p className="mt-2 text-xs leading-5 text-[#8d96a8] min-h-[40px]">
                  {plan.description}
                </p>

                {/* Price Display */}
                <div className="mt-5 border-y border-white/[0.08] py-4">
                  <div className="flex items-baseline gap-1">
                    {isEnterprise && (
                      <span className="text-xs font-semibold uppercase text-purple-300 mr-1">From</span>
                    )}
                    <span className="text-4xl font-extrabold text-white">${displayAmount}</span>
                    <span className="text-xs font-medium text-[#8d96a8]">{subText}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-cyan-300/80">
                    {billingNote}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-white/90">
                    {plan.messageLimit.toLocaleString()} automated messages / mo
                  </p>
                </div>

                {/* Capabilities */}
                <div className="mt-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/60 mb-2.5">
                    Included Capabilities:
                  </p>
                  <ul className="space-y-2.5 text-xs leading-5 text-[#cbd3e3]">
                    {plan.features.map((feature: string) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check size={14} className="mt-0.5 shrink-0 text-cyan-300" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* CTA Action */}
              <div className="mt-8 pt-4 border-t border-white/[0.06]">
                {isEnterprise ? (
                  <Link
                    href="mailto:sales@j10nexus.com?subject=J10%20NEXUS%20Enterprise%20Inquiry"
                    id={`cta-${plan.id}`}
                    className="block w-full rounded-xl py-3 text-center text-xs font-semibold transition-all border border-purple-400/40 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 hover:border-purple-400/60"
                  >
                    Contact Sales
                  </Link>
                ) : (
                  <Link
                    href={`/login?intent=signup&plan=${plan.id}&interval=${interval}&trial=1`}
                    id={`cta-${plan.id}`}
                    className={`block w-full rounded-xl py-3 text-center text-xs font-semibold transition-all ${
                      isPopular
                        ? "j10-gradient text-white shadow-[0_12px_28px_rgba(47,107,255,0.3)] hover:brightness-110"
                        : "border border-white/[0.15] bg-white/[0.04] text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    Start 72-Hour Free Trial
                  </Link>
                )}
                <p className="mt-2 text-center text-[10px] text-[#6b768a]">
                  {isEnterprise
                    ? "Tailored SLA · Dedicated onboarding"
                    : "Your 72-hour free trial starts after you complete and approve Outcome Onboarding."}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {/* Disclosures & Legal Notes */}
      <div className="mx-auto mt-12 max-w-4xl space-y-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center text-xs leading-relaxed text-[#8d96a8]">
          <strong className="text-white">Provider Usage Disclosures:</strong> Third-party provider infrastructure fees (including Meta WhatsApp Cloud API conversation charges, AI model compute, and telephony carriers) are billed separately based on direct provider consumption.
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center text-[11px] leading-relaxed text-[#758197]">
          Your 72-hour free trial starts after you complete and approve Outcome Onboarding. Enterprise tier requires a custom sales agreement. Subscriptions can be modified or canceled anytime directly in workspace billing settings.
        </div>
      </div>
    </div>
  );
}
