import type { Metadata } from "next";
import { FileText } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms and conditions governing use of the J10 NEXUS AI Operating System.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      <section className="mx-auto max-w-4xl px-5 py-16 sm:py-24 lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-xs font-semibold text-violet-300 mb-4">
            <FileText size={13} />
            Platform Agreement
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-5xl">Terms of Service</h1>
          <p className="mt-3 text-xs text-[#8d96a8]">Last updated: September 10, 2026</p>
        </div>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-[#cbd3e3]">
          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">1. Provision of SaaS Platform</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              J10 NEXUS provides multi-tenant AI operations software connecting customer conversations, CRM, autonomous workflows, and analytics. Access is granted on a per-workspace subscription basis subject to timely billing settlement and quota limits.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">2. Workspace Roles &amp; Administrator Authority</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              Each tenant workspace is governed by designated Owners and Admins. The Owner maintains exclusive authority over subscription billing, destructive deletion, and role allocations. Users agree not to attempt cross-tenant privilege escalation or bypass database authorization boundaries.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">3. Acceptable Use &amp; Messaging Compliance</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              Customers utilizing WhatsApp Cloud API or conversational automations must adhere to all applicable carrier regulations, Meta messaging policies, opt-in requirements, and local spam laws. Unsolicited commercial messaging or abusive automated scraping is strictly prohibited.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">4. Financial Terms &amp; Metering</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              Subscription tiers and message quotas are tracked atomically in PostgreSQL. Upgrades, plan transitions, and renewals are processed via verified Stripe billing webhooks. Overages and seat expansions are billed according to published rate schedules.
            </p>
          </section>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs text-[#8d96a8]">
            Questions about an account, plan, or billing can be sent to{" "}
            <a className="font-semibold text-cyan-300 hover:underline" href="mailto:contact@j10-nexus.com">
              contact@j10-nexus.com
            </a>
            . This page describes current product terms and responsibilities and is not a guarantee of service availability.
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
