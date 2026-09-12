import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, HelpCircle, ShieldCheck, Zap } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { PLANS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing Plans",
  description: "Straightforward J10 NEXUS plans for connected customer and revenue operations.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24 sm:pb-32">
        {/* Glow backdrop */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-[50rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(47,107,255,0.18),transparent_70%)] blur-3xl" />
        <div className="pointer-events-none absolute right-[10%] top-[30%] h-80 w-80 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.15),transparent_65%)] blur-3xl" />

        <div className="relative mx-auto max-w-[1240px] px-5 lg:px-8">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              J10 Commercial Plans
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Operating capacity built for your business.
            </h1>
            <p className="mt-5 text-base leading-7 text-[#a9b1c0] sm:text-lg">
              Every plan connects the same J10 revenue workflow. Scale your message volume and AI agent capacity as your customer demand grows.
            </p>
          </div>

          {/* Pricing Grid */}
          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => {
              const name = plan.id === "enterprise" ? "Scale" : plan.name;
              const isPopular = plan.popular;

              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col justify-between overflow-hidden rounded-[26px] p-6 sm:p-8 transition-all duration-300 ${
                    isPopular
                      ? "j10-surface-glow border-cyan-400/40 shadow-[0_24px_70px_rgba(47,107,255,0.28)]"
                      : "j10-surface border-white/[0.09]"
                  }`}
                >
                  {/* Top Popular Badge */}
                  {isPopular && (
                    <>
                      <div className="absolute inset-x-0 top-0 h-1.5 j10-gradient" />
                      <div className="mb-4 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/15 border border-cyan-400/30 px-3 py-1 text-[11px] font-bold text-cyan-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#00d9ff]" />
                          MOST POPULAR HERO PLAN
                        </span>
                      </div>
                    </>
                  )}

                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">{name}</h2>
                    <p className="mt-2 text-xs leading-5 text-[#8d96a8] min-h-10">
                      {plan.description}
                    </p>

                    <div className="mt-6 border-y border-white/[0.08] py-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold text-white">${plan.price}</span>
                        <span className="text-sm font-medium text-[#8d96a8]">/month</span>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-cyan-300">
                        {plan.messageLimit.toLocaleString()} automated messages / mo
                      </p>
                    </div>

                    <div className="mt-6">
                      <p className="text-xs font-bold uppercase tracking-wider text-white/70 mb-3">
                        Included Capabilities:
                      </p>
                      <ul className="space-y-3 text-xs leading-5 text-[#cbd3e3]">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5">
                            <Check size={15} className="mt-0.5 shrink-0 text-cyan-300" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-8">
                    <Link
                      href={`/login?intent=signup&plan=${plan.id}&trial=1`}
                      className={`block w-full rounded-xl py-3.5 text-center text-xs font-semibold transition-all ${
                        isPopular
                          ? "j10-gradient text-white shadow-[0_12px_28px_rgba(47,107,255,0.3)] hover:brightness-110"
                          : "border border-white/[0.15] bg-white/[0.04] text-white hover:bg-white/[0.08]"
                      }`}
                    >
                      Start Free 14-Day Trial
                    </Link>
                    <p className="mt-2.5 text-center text-[11px] text-[#5f697d]">
                      No card charged today · Instant activation
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Legal / Billing Note */}
          <div className="mx-auto mt-12 max-w-3xl rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center text-xs leading-relaxed text-[#8d96a8]">
            Plan availability, trial eligibility, and subscription activation are verified after workspace creation. You will not be charged from this page. Subscriptions are billed monthly and can be adjusted anytime in workspace settings.
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
