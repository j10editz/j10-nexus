"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PUBLIC_PLANS } from "@/lib/billing/plans";

export default function Pricing() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  return <div className="mx-auto max-w-[1320px] px-5 lg:px-8">
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-extrabold uppercase tracking-[.24em] text-[#efc76b]">Simple, transparent pricing</p>
      <h1 className="mt-5 text-4xl font-extrabold tracking-[-.045em] text-white sm:text-6xl">One price list. <span className="text-[#b77cff]">Everywhere.</span></h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/60">Choose the operating capacity that fits your business. Start small, then upgrade when you need more conversations, teammates, and AI employees.</p>
      <div className="mt-8 inline-flex rounded-xl border border-[#d9b85f]/20 bg-white/[.03] p-1">
        <button type="button" onClick={() => setInterval("month")} className={`rounded-lg px-5 py-2.5 text-sm font-bold ${interval === "month" ? "bg-[#d9b85f] text-[#130d05]" : "text-white/55"}`}>Monthly</button>
        <button type="button" onClick={() => setInterval("year")} className={`rounded-lg px-5 py-2.5 text-sm font-bold ${interval === "year" ? "bg-[#d9b85f] text-[#130d05]" : "text-white/55"}`}>Yearly · 2 months free</button>
      </div>
    </div>
    <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {PUBLIC_PLANS.map((plan) => {
        const enterprise = plan.quoteOnly;
        const monthly = interval === "year" && plan.annualPrice ? plan.annualPrice / 12 : plan.price;
        return <article key={plan.id} className={`relative flex min-h-[540px] flex-col rounded-[22px] border p-6 ${plan.popular ? "border-[#d9b85f]/55 bg-[linear-gradient(150deg,rgba(91,40,169,.38),rgba(16,11,24,.96))] shadow-[0_24px_70px_rgba(90,38,180,.22)]" : "border-[#d9b85f]/15 bg-[#0d0a13]/90"}`}>
          {plan.popular && <span className="absolute right-5 top-5 rounded-full border border-[#d9b85f]/35 bg-[#d9b85f]/10 px-3 py-1 text-[10px] font-extrabold tracking-wider text-[#efc76b]">MOST POPULAR</span>}
          <h2 className="text-xl font-bold text-white">{plan.name}</h2>
          <p className="mt-3 min-h-[60px] text-sm leading-6 text-white/48">{plan.description}</p>
          <div className="mt-6 border-y border-[#d9b85f]/12 py-5">
            <div className="flex items-end gap-1"><span className="text-4xl font-extrabold tracking-tight text-white">{enterprise ? `From $${plan.price}` : `$${monthly}`}</span><span className="pb-1 text-sm text-white/40">/mo</span></div>
            <p className="mt-2 text-xs text-[#efc76b]/80">{enterprise ? "Custom agreement" : interval === "year" ? `$${plan.annualPrice} billed annually` : "Billed monthly"}</p>
          </div>
          <ul className="mt-6 flex-1 space-y-3 text-sm leading-5 text-white/67">{plan.features.slice(1, 7).map((feature) => <li key={feature} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-[#efc76b]" /><span>{feature}</span></li>)}</ul>
          <Link href={enterprise ? "/contact?subject=enterprise" : `/login?intent=signup&plan=${plan.id}&interval=${interval}&trial=1`} className={`mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${plan.popular ? "bg-[linear-gradient(115deg,#5420ad,#8b4eea)] text-white" : "border border-[#d9b85f]/25 bg-white/[.03] text-white"}`}>{enterprise ? "Contact Sales" : "Start Free"}<ArrowRight size={16}/></Link>
        </article>;
      })}
    </div>
    <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-[#d9b85f]/12 bg-white/[.025] p-5 text-center text-xs leading-6 text-white/45">The 72-hour trial begins after Outcome Onboarding approval. Provider infrastructure and usage charges may be billed separately. Enterprise starts at $199/month and requires a custom agreement.</div>
  </div>;
}
