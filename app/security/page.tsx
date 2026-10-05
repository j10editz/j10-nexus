import type { Metadata } from "next";
import Link from "next/link";
import { Database, KeyRound, LockKeyhole, ShieldCheck, UserRoundCheck } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Security Architecture",
  description: "An overview of current J10 NEXUS tenant boundaries and operational controls.",
  alternates: { canonical: "/security" },
};

const controls = [
  {
    title: "Multi-Tenant Isolation",
    description: "Every workspace operates inside strict database row-level security (RLS) policies and workspace-isolated composite foreign keys.",
    icon: Database,
  },
  {
    title: "Governed AI Agent Execution",
    description: "Agent permissions, spend budgets, execution approval gates, and step-by-step traces are enforced strictly within tenant boundaries.",
    icon: ShieldCheck,
  },
  {
    title: "Protected Server-Side Credentials",
    description: "Provider secrets, WhatsApp Cloud API keys, and webhook signing secrets are stored server-side and never exposed to client browsers.",
    icon: KeyRound,
  },
  {
    title: "RBAC & Action Approvals",
    description: "Workspace roles (Owner, Admin, Manager, Agent, Viewer) dictate access rights, preventing unauthorized actions across team members.",
    icon: UserRoundCheck,
  },
] as const;

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-[#05030a] text-white">
      <Navbar />

      <section className="relative mx-auto max-w-[1240px] px-5 py-16 sm:py-24 lg:px-8">
        {/* Header Grid */}
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d9b85f]/25 bg-[#d9b85f]/[0.08] px-3.5 py-1.5 text-xs font-semibold text-[#efc76b]">
              <ShieldCheck size={14} />
              Trust &amp; Governance Architecture
            </div>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Trust is part of the operating system.
            </h1>

            <p className="mt-6 text-base leading-7 text-[#a9b1c0] sm:text-lg">
              J10 NEXUS is architected around robust tenant isolation, governed operational paths, granular permissions, approvals, and protected server-side credentials.
            </p>

            <p className="mt-4 text-xs text-[#5f697d]">
              Current product security overview · Updated September 2026
            </p>
          </div>

          {/* Trust Boundaries Panel */}
          <div className="relative overflow-hidden rounded-[26px] border border-[#d9b85f]/15 bg-[#0d0a13] p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-16 h-60 w-60 rounded-full bg-[#7c3aed]/[0.2] blur-3xl" />

            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-wider text-[#efc76b]">
                J10 Tenant Security Boundaries
              </p>

              <div className="mt-6 space-y-4">
                {[
                  { name: "Inbound Customer Channels", detail: "Workspace-scoped webhooks & cryptographic signature validation" },
                  { name: "J10 Intelligence Core", detail: "Role-based authorization & budget-capped execution traces" },
                  { name: "Revenue & Ledger Operations", detail: "Atomic quota reservations & workspace-isolated idempotency" },
                ].map((boundary, index) => (
                  <div key={boundary.name} className="flex items-start gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#d9b85f,#8e6721)] text-xs font-bold text-[#160f05] shadow-sm">
                      0{index + 1}
                    </span>
                    <div className="flex-1 border-b border-white/[0.08] pb-4">
                      <p className="text-sm font-bold text-white">{boundary.name}</p>
                      <p className="mt-0.5 text-xs text-[#8d96a8]">{boundary.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Controls Grid */}
        <div className="mt-16 grid gap-5 sm:grid-cols-2">
          {controls.map((control) => {
            const Icon = control.icon;
            return (
              <article
                key={control.title}
                className="rounded-2xl border border-[#d9b85f]/15 bg-[#0d0a13] p-6 transition hover:border-[#d9b85f]/35"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d9b85f]/10 text-[#efc76b]">
                  <Icon size={20} />
                </div>
                <h2 className="mt-5 text-base font-bold text-white">{control.title}</h2>
                <p className="mt-2 text-xs leading-5 text-[#8d96a8]">{control.description}</p>
              </article>
            );
          })}
        </div>

        {/* Responsible Disclosure */}
        <section id="disclosure" className="mt-8 rounded-2xl border border-[#d9b85f]/15 bg-[#0d0a13] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d9b85f]/10 text-[#efc76b]">
              <LockKeyhole size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Responsible Disclosure Policy</h2>
              <p className="mt-2 text-xs leading-6 text-[#8d96a8]">
                If you believe you have identified a security vulnerability or trust issue, please email our engineering team directly at{" "}
                <a
                  href="mailto:contact@j10-nexus.com?subject=Security%20Vulnerability%20Report"
                  className="font-semibold text-[#efc76b] hover:underline"
                >
                  contact@j10-nexus.com
                </a>
                . Please include concise reproduction steps. This page outlines our current product safeguards; it is not a compliance or third-party certification claim.
              </p>
            </div>
          </div>
        </section>
      </section>

      <Footer />
    </main>
  );
}
