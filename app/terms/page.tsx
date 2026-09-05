import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Service | J10 NEXUS",
  description: "Terms and conditions governing use of the J10 NEXUS AI Operating System.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-300">
      <header className="border-b border-white/[0.08] bg-[#0E0E12]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition">
            <ArrowLeft size={14} />
            <span>Return to J10 NEXUS</span>
          </Link>
          <span className="text-xs font-mono text-zinc-500">Legal Notice: Draft subject to formal counsel review</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 leading-relaxed space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-400 mb-3">
            <FileText size={12} />
            Platform Agreement
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-xs text-zinc-500">Last updated: September 2026. Version 1.0.</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">1. Provision of SaaS Platform</h2>
          <p className="text-xs text-zinc-400">
            J10 NEXUS provides multi-tenant AI operations software connecting customer conversations, CRM, autonomous workflows, and analytics. Access is granted on a per-workspace subscription basis subject to timely billing settlement and quota limits.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">2. Workspace Roles & Administrator Authority</h2>
          <p className="text-xs text-zinc-400">
            Each tenant workspace is governed by designated Owners and Admins. The Owner maintains exclusive authority over subscription billing, destructive deletion, and role allocations. Users agree not to attempt cross-tenant privilege escalation or bypass database authorization boundaries.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">3. Acceptable Use & Messaging Compliance</h2>
          <p className="text-xs text-zinc-400">
            Customers utilizing WhatsApp Cloud API or conversational automations must adhere to all applicable carrier regulations, Meta messaging policies, opt-in requirements, and local spam laws. Unsolicited commercial messaging or abusive automated scraping is strictly prohibited.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">4. Financial Terms & Metering</h2>
          <p className="text-xs text-zinc-400">
            Subscription tiers and message quotas are tracked atomically in PostgreSQL. Upgrades, plan transitions, and renewals are processed via verified Stripe billing webhooks. Overages and seat expansions are billed according to published rate schedules.
          </p>
        </section>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-[11px] text-zinc-500">
          Note: This document constitutes an architectural draft of service terms and is designated as a pre-launch draft requiring professional legal counsel review prior to binding commercial engagement.
        </div>
      </main>
    </div>
  );
}
