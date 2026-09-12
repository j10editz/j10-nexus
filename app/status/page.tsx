import Link from "next/link";
import { Activity, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { probeDatabaseReachability } from "@/lib/health/probe";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Status & Telemetry",
  description: "Live operational runtime status of J10 NEXUS services, database, and integration connectors.",
  alternates: { canonical: "/status" },
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
      name: "AI Model Gateway",
      category: "External AI Provider",
      probe: "J10 AI Runtime Routing",
      status: "Not independently monitored",
      isMonitored: false,
      operational: false,
    },
  ];

  return (
    <main className="j10-canvas min-h-screen text-white">
      <Navbar />

      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24 lg:px-8">
        <div className="j10-surface rounded-2xl p-6 sm:p-8 border border-white/[0.08] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-cyan-300" />
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                Live System Telemetry
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">Operational Health Overview</h1>
            <p className="mt-1 text-xs text-[#8d96a8]">
              Live server connection reachability and telemetry boundaries.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-xs font-mono text-[#cbd3e3]">
              Latency: {health.latencyMs}ms
            </div>
            <div
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold ${
                health.reachable
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              }`}
            >
              {health.status}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0b1020] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/80">
              Service Components
            </h2>
            <span className="text-xs text-[#5f697d]">Server Diagnostic Boundary</span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {services.map((svc) => (
              <div key={svc.name} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{svc.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.05] text-[#8d96a8] border border-white/[0.08]">
                      {svc.category}
                    </span>
                  </div>
                  <p className="text-xs text-[#8d96a8]">{svc.probe}</p>
                </div>
                <div className="flex items-center gap-2">
                  {svc.isMonitored ? (
                    svc.operational ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs text-emerald-400 font-semibold">Operational</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <span className="text-xs text-amber-400 font-semibold">{svc.status}</span>
                      </>
                    )
                  ) : (
                    <>
                      <HelpCircle className="w-4 h-4 text-[#5f697d]" />
                      <span className="text-xs text-[#5f697d] font-medium">Not independently monitored</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 text-xs text-[#8d96a8] space-y-1">
          <p className="font-semibold text-white/90">Monitoring &amp; Telemetry Notice</p>
          <p>
            Database probe executes reachability verification through server connection pool. Non-monitored third-party external services depend on upstream provider availability.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
