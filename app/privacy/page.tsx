import type { Metadata } from "next";
import { Shield } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Enterprise SaaS privacy policy, tenant data boundaries, and data processing practices.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      <section className="mx-auto max-w-4xl px-5 py-16 sm:py-24 lg:px-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-xs font-semibold text-violet-300 mb-4">
            <Shield size={13} />
            Data Protection &amp; Trust
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-5xl">Privacy Policy</h1>
          <p className="mt-3 text-xs text-[#8d96a8]">Last updated: September 10, 2026</p>
        </div>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-[#cbd3e3]">
          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">1. Multi-Tenant Architectural Isolation</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              J10 NEXUS is an enterprise multi-tenant platform. All business records, customer conversation threads, CRM contacts, workforce automations, and payment ledgers are strictly partitioned using PostgreSQL Row Level Security (RLS) bound to cryptographic workspace identifiers. Data from one tenant is strictly inaccessible to users belonging to other workspaces.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">2. Data Ingestion &amp; Processing Boundaries</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              We process customer communications, contact records, integration credentials, and business documents solely to provide autonomous operations and AI assistance on behalf of your workspace. We do not sell your personal data or your customers&apos; communication logs.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">3. Third-Party Integrations &amp; Model Routing</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              When you connect integrations such as Meta WhatsApp Cloud API, Google Workspace, or OpenAI, data necessary to execute your configured workflows is transmitted securely using TLS 1.3 encryption. Integration credentials are encrypted at rest using industry-standard envelope encryption.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">4. Data Retention &amp; Deletion Rights</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              Workspace Owners retain full authority to export, archive, or delete their tenant records. Upon deletion of a workspace, associated database records and vector documents are permanently expunged in accordance with enterprise data retention standards.
            </p>
          </section>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs text-[#8d96a8]">
            Questions about privacy or account data can be sent to{" "}
            <a className="font-semibold text-cyan-300 hover:underline" href="mailto:contact@j10-nexus.com">
              contact@j10-nexus.com
            </a>
            . This page describes current product practices and is not a guarantee of service availability.
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
