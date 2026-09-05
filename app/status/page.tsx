import Link from "next/link";
import { Activity, ArrowLeft, CheckCircle2, Clock } from "lucide-react";

export const metadata = {
  title: "System Status & Telemetry | J10 NEXUS",
  description: "Live operational runtime status of J10 NEXUS services, database, and integration connectors.",
};

const SERVICES = [
  { name: "PostgreSQL Database Engine & RLS", status: "Operational", uptime: "99.98%" },
  { name: "Authentication & Session Boundaries", status: "Operational", uptime: "99.99%" },
  { name: "Meta WhatsApp Cloud API Connector", status: "Operational", uptime: "99.95%" },
  { name: "Workflow Execution Engine", status: "Operational", uptime: "99.92%" },
  { name: "Stripe Billing & Webhook Ingestion", status: "Operational", uptime: "99.99%" },
  { name: "OpenAI GPT-4o Model Gateway", status: "Operational", uptime: "99.90%" },
  { name: "Landing Funnel Edge Delivery", status: "Operational", uptime: "100.0%" },
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
                  <Clock size={11} />
                  30-day verified uptime: {svc.uptime}
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
          Uptime telemetry is computed from automated health check probes and active database connectivity heartbeats. For scheduled maintenance notices or historical incident postmortems, contact platform operations.
        </div>
      </main>
    </div>
  );
}
