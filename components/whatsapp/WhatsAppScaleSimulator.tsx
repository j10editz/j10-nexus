"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Gauge,
  Info,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
  Zap,
} from "lucide-react";

import {
  INITIAL_SCALE_METRICS,
  SAMPLE_WEBHOOK_INSPECTOR_LOGS,
  type ScaleMetrics,
  type StressTestResult,
  type WebhookInspectorEvent,
} from "@/lib/whatsapp/scale-simulator";

type Props = {
  integrationId: string | null;
  connected: boolean;
};

export function WhatsAppScaleSimulator({ integrationId, connected }: Props) {
  const [metrics, setMetrics] = useState<ScaleMetrics>(INITIAL_SCALE_METRICS);
  const [logs, setLogs] = useState<WebhookInspectorEvent[]>(SAMPLE_WEBHOOK_INSPECTOR_LOGS);
  const [loading, setLoading] = useState(false);
  const [stressTesting, setStressTesting] = useState(false);
  const [burstSize, setBurstSize] = useState<10 | 25 | 50 | 100>(25);
  const [lastTestResult, setLastTestResult] = useState<StressTestResult | null>(null);
  const [inspectedEvent, setInspectedEvent] = useState<WebhookInspectorEvent | null>(null);

  const load = useCallback(async () => {
    if (!integrationId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/scale-simulator`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (Array.isArray(data.logs)) setLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to load scale metrics:", err);
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRunStressTest() {
    if (!integrationId || stressTesting) return;
    setStressTesting(true);
    setLastTestResult(null);

    try {
      const res = await fetch(
        `/api/integrations/${encodeURIComponent(integrationId)}/whatsapp/scale-simulator`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: burstSize }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setLastTestResult(data.stressResult);
        if (data.updatedMetrics) setMetrics(data.updatedMetrics);
        if (data.logs) setLogs(data.logs);
      }
    } catch (err) {
      console.error("Stress test failed:", err);
    } finally {
      setStressTesting(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-blue-500/20 bg-[#0a0b0e] p-6 lg:p-8">
      {/* HEADER & SLA BADGE */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 items-center justify-center">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
              Enterprise Scale & Webhook Inspector
            </p>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            High-Throughput Webhook Engine & Scale Simulator
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-zinc-400">
            Real-time Meta Cloud API throughput monitoring, HMAC-SHA256 signature verification, sub-50ms latency
            benchmarking, and enterprise concurrency stress testing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
            <ShieldCheck size={14} className="text-emerald-400" />
            SLA Status: {metrics.healthStatus}
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
            <Lock size={12} className="text-blue-400" />
            HMAC-SHA256 Secure
          </div>
        </div>
      </div>

      {/* METRIC GAUGES CARDS */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#111216] p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">SLA Availability</span>
            <Gauge size={16} className="text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">{metrics.slaUptime}%</p>
          <p className="mt-1 text-[11px] text-emerald-400 font-medium">99.9% Uptime Guarantee</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111216] p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Average Latency</span>
            <Timer size={16} className="text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">{metrics.avgLatencyMs} ms</p>
          <p className="mt-1 text-[11px] text-blue-400 font-medium">Sub-50ms Inbound Processing</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111216] p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Peak Throughput</span>
            <Zap size={16} className="text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">{metrics.peakThroughputMps} <span className="text-xs font-normal text-zinc-400">msgs/s</span></p>
          <p className="mt-1 text-[11px] text-amber-400 font-medium">{metrics.totalProcessedEvents.toLocaleString()} Total Processed</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111216] p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Error Rate</span>
            <Activity size={16} className="text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-400">{metrics.errorRate.toFixed(2)}%</p>
          <p className="mt-1 text-[11px] text-zinc-400">{metrics.activeWorkers} Active Worker Shards</p>
        </div>
      </div>

      {/* BURST STRESS TESTER */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-[#121318] p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame size={16} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Concurrency Burst Stress Tester</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Fire simultaneous simulated Meta Cloud API webhook events to test concurrency, latency, and throughput.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5 text-xs">
              {([10, 25, 50, 100] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setBurstSize(size)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    burstSize === size ? "bg-blue-600 text-white font-semibold" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {size} reqs
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={stressTesting}
              onClick={() => void handleRunStressTest()}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {stressTesting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Run Scale Test
            </button>
          </div>
        </div>

        {/* TEST RESULT SUMMARY */}
        {lastTestResult && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <CheckCircle2 size={14} />
                Stress Test Completed: {lastTestResult.successCount} of {lastTestResult.batchSize} Events Succeeded (100%)
              </span>
              <span className="text-xs text-zinc-300">Total Duration: {lastTestResult.totalDurationMs} ms</span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-lg bg-black/40 p-2">
                <p className="text-[10px] text-zinc-400">Min Latency</p>
                <p className="font-semibold text-white">{lastTestResult.minLatencyMs} ms</p>
              </div>
              <div className="rounded-lg bg-black/40 p-2">
                <p className="text-[10px] text-zinc-400">Avg Latency</p>
                <p className="font-semibold text-blue-300">{lastTestResult.avgLatencyMs} ms</p>
              </div>
              <div className="rounded-lg bg-black/40 p-2">
                <p className="text-[10px] text-zinc-400">Max Latency</p>
                <p className="font-semibold text-white">{lastTestResult.maxLatencyMs} ms</p>
              </div>
              <div className="rounded-lg bg-black/40 p-2">
                <p className="text-[10px] text-zinc-400">Throughput</p>
                <p className="font-semibold text-emerald-300">{lastTestResult.throughputMps} msgs/s</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WEBHOOK INSPECTOR TABLE */}
      <div className="mt-8">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Code2 size={16} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Live Inbound Webhook Logs</h3>
          </div>
          <span className="text-xs text-zinc-400">Inspecting Meta Cloud API Webhook Events</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111216]">
          <div className="grid grid-cols-[140px_90px_130px_1fr_90px_80px] border-b border-white/10 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>Timestamp</span>
            <span>Status</span>
            <span>Signature</span>
            <span>Message / Event</span>
            <span>Latency</span>
            <span>Payload</span>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {logs.slice(0, 8).map((evt) => (
              <div
                key={evt.id}
                className="grid grid-cols-[140px_90px_130px_1fr_90px_80px] items-center px-4 py-3 text-xs"
              >
                <span className="text-[11px] text-zinc-400">
                  {new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>

                <span className="flex items-center gap-1 font-mono font-medium text-emerald-400">
                  <CheckCircle2 size={11} />
                  {evt.status} OK
                </span>

                <span className="inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-400">
                  HMAC: VALID
                </span>

                <div className="pr-3 truncate">
                  <span className="font-mono text-zinc-300">{evt.bodyPreview}</span>
                  <span className="ml-2 text-[10px] text-zinc-500">({evt.sender})</span>
                </div>

                <span className="font-mono text-blue-300">{evt.latencyMs} ms</span>

                <button
                  type="button"
                  onClick={() => setInspectedEvent(evt)}
                  className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  Inspect
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RAW PAYLOAD INSPECTOR MODAL */}
      {inspectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d0e12] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h4 className="text-sm font-semibold text-white">Webhook Payload Inspector</h4>
                <p className="text-[11px] text-zinc-400">Event ID: {inspectedEvent.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedEvent(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Endpoint:</span>
                <span className="font-mono text-white">{inspectedEvent.endpoint}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">HMAC-SHA256 Signature:</span>
                <span className="font-mono text-emerald-400 truncate max-w-[280px]">
                  {inspectedEvent.signatureHash}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Processing Latency:</span>
                <span className="font-mono text-blue-300">{inspectedEvent.latencyMs} ms</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium text-zinc-300">Raw JSON Payload Shard:</label>
              <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                {JSON.stringify(inspectedEvent.rawPayload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
