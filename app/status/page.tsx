import Link from "next/link";
import { Activity, ArrowLeft, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { probeDatabaseReachability } from "@/lib/health/probe";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Status & Telemetry | J10 NEXUS",
  description: "Live operational runtime status of J10 NEXUS services, database, and integration connectors.",
};

export default async function StatusPage() {
  const health = await probeDatabaseReachability();

  const services = [
    {
      name: "Database Server Connection",
      category: "Storage Infrastructure",
      probe: "Database reachable through server connection",
      status: health.status,
      isMonitored: true,
      operational: health.reachable,
    },
    {
      name: "Authentication & Workspace Boundaries",
      category: "Security & Identity",
      probe: "Supabase Auth Verification",
      status: "Not independently monitored",
      isMonitored: false,
      operational: false,
    },
    {
      name: "Workflow Execution Engine",
      category: "Automation Runtime",
      probe: "Internal Automation Trigger Engine",
      status: "Not independently monitored",
      isMonitored: false,
      operational: false,
    },
    {
      name: "Meta WhatsApp Cloud API Gateway",
      category: "External Integration",
      probe: "Webhook Ingestion Router",
      status: "Not independently monitored",
      isMonitored: false,
      operational: false,
    },
    {
      name: "Stripe Billing & Subscriptions",
      category: "External Financial",
      probe: "Stripe Webhook Verification",
      status: "Not independently monitored",
      isMonitored: false,
      operational: false,
    },
    {
      name: "OpenAI Model Gateway",
      category: "External AI Provider",
      probe: "J10 AI Runtime Routing",
      status: "Not independently monitored",
      isMonitored: false,
      operational: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-300">
      <header className="border-b border-zinc-800/80 bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-white tracking-wide">J10 NEXUS SYSTEM TELEMETRY</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                health.reachable ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span className="text-xs font-medium text-zinc-200">
              {health.reachable ? "Monitored Services Operational" : "Degraded Service Reachability"}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-8">
        <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">System Operational Health</h1>
            <p className="text-sm text-zinc-400">
              Live server connection health and component monitoring boundaries.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3.5 py-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-xs font-mono text-zinc-300">
              Latency: {health.latencyMs}ms
            </div>
            <div
              className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium ${
                health.reachable
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              }`}
            >
              {health.status}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Service Components</h2>
            <span className="text-xs text-zinc-500">Live Server Diagnostic Boundary</span>
          </div>
          <div className="divide-y divide-zinc-800/40">
            {services.map((svc) => (
              <div key={svc.name} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{svc.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/60 text-zinc-400 border border-zinc-700/40">
                      {svc.category}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">{svc.probe}</p>
                </div>
                <div className="flex items-center gap-2">
                  {svc.isMonitored ? (
                    svc.operational ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs text-emerald-400 font-medium">Operational</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span className="text-xs text-amber-400 font-medium">{svc.status}</span>
                      </>
                    )
                  ) : (
                    <>
                      <HelpCircle className="w-4 h-4 text-zinc-500" />
                      <span className="text-xs text-zinc-500 font-medium">Not independently monitored</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-500 space-y-1">
          <p className="font-medium text-zinc-400">Monitoring &amp; Telemetry Notice</p>
          <p>
            Database probe executes reachability verification through server connection pool. Non-monitored third-party external services depend on upstream provider availability.
          </p>
        </div>
      </main>
    </div>
  );
}
