import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | J10 NEXUS",
  description: "Enterprise SaaS privacy policy, tenant data boundaries, and data processing practices.",
};

export default function PrivacyPage() {
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
            <Shield size={12} />
            Data Protection & Trust
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-xs text-zinc-500">Last updated: September 2026. Version 1.0.</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">1. Multi-Tenant Architectural Isolation</h2>
          <p className="text-xs text-zinc-400">
            J10 NEXUS is an enterprise multi-tenant platform. All business records, customer conversation threads, CRM contacts, workforce automations, and payment ledgers are strictly partitioned using PostgreSQL Row Level Security (RLS) bound to cryptographic workspace identifiers. Data from one tenant is strictly inaccessible to users belonging to other workspaces.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">2. Data Ingestion & Processing Boundaries</h2>
          <p className="text-xs text-zinc-400">
            We process customer communications, contact records, integration credentials, and business documents solely to provide autonomous operations and AI assistance on behalf of your workspace. We do not sell your personal data or your customers&apos; communication logs.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">3. Third-Party Integrations & Model Routing</h2>
          <p className="text-xs text-zinc-400">
            When you connect integrations such as Meta WhatsApp Cloud API, Google Workspace, or OpenAI, data necessary to execute your configured workflows is transmitted securely using TLS 1.3 encryption. Integration credentials are encrypted at rest using industry-standard envelope encryption.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">4. Data Retention & Deletion Rights</h2>
          <p className="text-xs text-zinc-400">
            Workspace Owners retain full authority to export, archive, or delete their tenant records. Upon deletion of a workspace, associated database records and vector documents are permanently expunged in accordance with enterprise data retention standards.
          </p>
        </section>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-[11px] text-zinc-500">
          Note: This document constitutes an architectural overview of data handling principles and is designated as a pre-launch legal draft requiring professional legal counsel review prior to binding commercial engagement.
        </div>
      </main>
    </div>
  );
}
