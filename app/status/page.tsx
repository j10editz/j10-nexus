import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Sliders,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  ComponentStatus,
  probeSystemHealth,
} from "@/lib/health/system-health";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Status & Telemetry",
  description:
    "Live operational runtime status of J10 NEXUS services, database, and integration connectors.",
  alternates: { canonical: "/status" },
};

function StatusBadge({ status }: { status: ComponentStatus }) {
  switch (status) {
    case "Operational":
      return (
        <span
          role="status"
          aria-label="Component status: Operational"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Operational</span>
        </span>
      );

    case "Configured":
      return (
        <span
          role="status"
          aria-label="Component status: Configured"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-400"
        >
          <Sliders className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Configured</span>
        </span>
      );

    case "Degraded":
      return (
        <span
          role="status"
          aria-label="Component status: Degraded"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Degraded</span>
        </span>
      );

    case "Outage":
      return (
        <span
          role="status"
          aria-label="Component status: Outage"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Outage</span>
        </span>
      );

    case "Unknown":
    default:
      return (
        <span
          role="status"
          aria-label="Component status: Unknown"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 border border-slate-500/30 text-slate-300"
        >
          <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Unknown</span>
        </span>
      );
  }
}

export default async function StatusPage() {
  const health = await probeSystemHealth();
  const dbComponent = health.components.find((c) => c.id === "database");
  const latency = dbComponent?.latencyMs ?? 0;

  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24 lg:px-8">
        {/* Header Telemetry Card */}
        <div className="j10-surface rounded-2xl p-6 sm:p-8 border border-white/[0.08] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-cyan-300" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                Live System Telemetry
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">
              Operational Health Overview
            </h1>
            <p className="mt-1 text-xs text-[#8d96a8]">
              Evidence-based status of 6 core infrastructure, automation, and
              gateway connectors.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {latency > 0 && (
              <div className="px-3.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs font-mono text-[#cbd3e3]">
                DB Latency: {latency}ms
              </div>
            )}
            <div
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold ${
                health.overallStatus === "Operational"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : health.overallStatus === "Degraded"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
            >
              Overall: {health.overallStatus}
            </div>
          </div>
        </div>

        {/* 6 Monitored Components Table / Grid */}
        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0b1020] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/80">
              Monitored Service Components ({health.components.length})
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-[#5f697d]">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Real-Time Probes</span>
            </div>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {health.components.map((svc) => (
              <div
                key={svc.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:bg-white/[0.01]"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {svc.name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.05] text-[#8d96a8] border border-white/[0.08]">
                      {svc.category}
                    </span>
                    {typeof svc.latencyMs === "number" && (
                      <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-800/30">
                        {svc.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8d96a8]">{svc.explanation}</p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-[10px] text-[#5f697d] font-mono">
                    Checked {new Date(svc.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <StatusBadge status={svc.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Informational Guidance Notice */}
        <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 text-xs text-[#8d96a8] space-y-1.5">
          <p className="font-semibold text-white/90">
            Telemetry &amp; Status Governance
          </p>
          <p>
            Statuses reflect genuine, isolated readiness probes executed with
            strict timeout limits and zero external side effects. A component is
            marked <strong className="text-emerald-400">Operational</strong> only
            when an active probe confirms reachability,{" "}
            <strong className="text-sky-400">Configured</strong> when credentials
            exist without active verification,{" "}
            <strong className="text-amber-400">Degraded</strong> when a probe
            encounters latency or warning thresholds, and{" "}
            <strong className="text-slate-300">Unknown</strong> when credentials
            are not provisioned in the current environment.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
