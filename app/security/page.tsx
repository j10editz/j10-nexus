import Link from "next/link";
import { ShieldCheck, ArrowLeft, Lock, Database, Key, Server } from "lucide-react";

export const metadata = {
  title: "Security Architecture & Boundaries | J10 NEXUS",
  description: "PostgreSQL RLS isolation, envelope encryption, and verifiable tenant trust boundaries.",
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-300">
      <header className="border-b border-white/[0.08] bg-[#0E0E12]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition">
            <ArrowLeft size={14} />
            <span>Return to J10 NEXUS</span>
          </Link>
          <span className="text-xs font-mono text-zinc-500">Tier 0F Security Standard</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 leading-relaxed space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 mb-3">
            <ShieldCheck size={12} />
            Architecture & Compliance
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Security & Tenant Trust Boundaries</h1>
          <p className="mt-2 text-xs text-zinc-500">Formal technical disclosure of security controls and database isolation.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Database size={18} />
            </div>
            <h2 className="text-sm font-semibold text-white">PostgreSQL Row Level Security</h2>
            <p className="text-xs text-zinc-400">
              All multi-tenant tables enforce strict RLS policies bound to verified workspace memberships. Cross-tenant reads and mutations are denied at the database kernel layer.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Lock size={18} />
            </div>
            <h2 className="text-sm font-semibold text-white">Cryptographic Token Hashing</h2>
            <p className="text-xs text-zinc-400">
              Workspace invitation tokens are transmitted over TLS, hashed with SHA-256 before database storage, and locked using atomic PostgreSQL row transactions during acceptance.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Key size={18} />
            </div>
            <h2 className="text-sm font-semibold text-white">Credential Envelope Encryption</h2>
            <p className="text-xs text-zinc-400">
              Provider access tokens, client secrets, and webhook signing keys are encrypted at rest with AES-GCM and strict separation between client publishable and server secret keys.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-5 space-y-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Server size={18} />
            </div>
            <h2 className="text-sm font-semibold text-white">Fail-Closed Admin Boundaries</h2>
            <p className="text-xs text-zinc-400">
              Administrative functions fail closed if valid server secrets are absent. Fallback to publishable keys in administrative contexts is strictly forbidden.
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Vulnerability Reporting</h2>
          <p className="text-xs text-zinc-400">
            We appreciate responsible disclosure from security researchers. Suspected vulnerabilities should be reported directly to our platform security team at{" "}
            <a href="mailto:contact.j10editz@gmail.com" className="text-violet-400 font-mono underline">
              contact.j10editz@gmail.com
            </a>
            . Reports are acknowledged within 24 hours.
          </p>
        </section>
      </main>
    </div>
  );
}
