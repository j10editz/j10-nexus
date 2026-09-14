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
          <p className="mt-3 text-xs text-[#8d96a8]">Last updated: September 14, 2026</p>
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
              We process customer communications, contact records, integration credentials, and business documents solely to provide autonomous operations and AI assistance on behalf of your workspace. We do not sell your personal data. Messages and inquiries submitted through communication channels are processed by our configured AI subprocessor (Google Gemini) to deliver automated conversational assistance and receptionist workflows.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">3. Subprocessors &amp; AI Model Routing</h2>
            <p className="text-xs text-[#8d96a8] leading-6 mb-3">
              To operate our 24/7 AI Receptionist and omnichannel workflows, J10 NEXUS transmits necessary data to vetted enterprise subprocessors over encrypted TLS 1.3 connections:
            </p>
            <ul className="list-disc list-inside text-xs text-[#8d96a8] space-y-2 mb-3">
              <li><strong className="text-white">Google Cloud / Google Gemini:</strong> AI language model provider utilized for real-time customer query interpretation, appointment scheduling intake, and assistant replies.</li>
              <li><strong className="text-white">Telegram Bot API &amp; Meta WhatsApp:</strong> Message transport networks used to receive inbound customer inquiries and deliver assistant responses.</li>
              <li><strong className="text-white">Supabase / AWS:</strong> Encrypted database infrastructure with PostgreSQL Row Level Security for tenant data persistence.</li>
              <li><strong className="text-white">Stripe:</strong> Payment processing and invoice generation.</li>
            </ul>
            <p className="text-xs text-[#8d96a8] leading-6">
              Sensitive PII—including customer phone numbers, email addresses, and payment card details—is automatically redacted or excluded before prompt transmission to AI providers.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">4. AI Tier Policy &amp; Training Boundaries</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              Free Gemini API tiers are permitted strictly for internal J10 system testing and non-sensitive demonstrations. All paid client production conversations require and utilize paid API tiers, because Google terms specify that free-tier API inputs may be reviewed by human reviewers and used to improve Google products. Paid enterprise tiers ensure your customer conversations are not used to train upstream AI models.
            </p>
          </section>

          <section className="j10-surface rounded-2xl p-6 sm:p-7 border border-white/[0.08]">
            <h2 className="text-base font-bold text-white mb-2">5. Data Retention &amp; Deletion Rights</h2>
            <p className="text-xs text-[#8d96a8] leading-6">
              Workspace Owners retain full authority to export, archive, or delete their tenant records. Customers interacting with our bots can request immediate human assistance with <code className="text-cyan-300">/human</code> or complete deletion of their conversation history at any time.
            </p>
          </section>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs text-[#8d96a8]">
            Questions about privacy, subprocessors, or account data can be sent to{" "}
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
