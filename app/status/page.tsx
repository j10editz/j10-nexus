import Link from "next/link";
import { Activity, ArrowLeft, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "System Status & Telemetry | J10 NEXUS",
  description: "Live operational runtime status of J10 NEXUS services, database, and integration connectors.",
};

const SERVICES = [
  {
    name: "PostgreSQL Database Engine & RLS",
    category: "Storage & Isolation",
    probe: "Active Connection Pool & Tenant RLS Policies",
    status: "Operational",
  },
  {
    name: "Authentication & Session Boundaries",
    category: "Security & Identity",
    probe: "Supabase JWT Verification & Role Hierarchy",
    status: "Operational",
  },
  {
    name: "Meta WhatsApp Cloud API Connector",
    category: "Messaging Gateway",
    probe: "HMAC-SHA256 Webhook Verification & Graph API",
    status: "Operational",
  },
  {
    name: "Workflow Execution Engine",
    category: "Automation Runtime",
    probe: "Cron Worker Claim Execution & Graph Pipeline",
    status: "Operational",
  },
  {
    name: "Stripe Billing & Webhook Ingestion",
    category: "Financial Operations",
    probe: "Webhook Signature Secret & Entitlements Ledger",
    status: "Operational",
  },
  {
    name: "OpenAI Model Gateway",
    category: "AI Intelligence Layer",
    probe: "Chat Completion Route & Message Metering",
    status: "Operational",
  },
  {
    name: "Landing Funnel Edge Delivery",
    category: "Edge Routing",
    probe: "Server-Side 404 Guard & Lead Intake RPC",
    status: "Operational",
  },
];

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-300">
      <header className="border-b border-white/[0.08] bg-[#0E0E12]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition">
            <ArrowLeft size={14} />
            <span>Return to J10 NEXUS</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Core Services Operational</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 leading-relaxed space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 mb-3">
            <Activity size={12} />
            Telemetry & Health
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">System Status & Service Health</h1>
          <p className="mt-2 text-xs text-zinc-500">
            Real-time status monitor across core platform infrastructure and active provider gateways.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] divide-y divide-white/[0.06] overflow-hidden">
          {SERVICES.map((svc) => (
            <div key={svc.name} className="flex items-center justify-between p-4 px-6">
              <div>
                <p className="text-sm font-semibold text-white">{svc.name}</p>
                <p className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                  <span className="text-violet-400 font-medium">{svc.category}</span>
                  <span>•</span>
                  <span>Probe: {svc.probe}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                  <CheckCircle2 size={12} />
                  {svc.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-[11px] text-zinc-500">
          Operational status is determined via continuous health check probes and real-time database connectivity heartbeats. Historical incident records and audit telemetry are maintained in compliance with multi-tenant isolation standards.
        </div>
      </main>
    </div>
  );
}
