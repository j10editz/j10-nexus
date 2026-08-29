"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Workflow,
} from "lucide-react";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  trigger_type: string;
  total_executions: number;
  updated_at: string;
};

type AutomationsResponse = {
  success: boolean;
  error?: string;
  automations?: Automation[];
};

export default function J10FlowLibrary() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Untitled J10 Flow");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/automations", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json()) as AutomationsResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not load workflows.");
      }

      setAutomations(data.automations ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load workflows.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createWorkflow() {
    const workflowName = name.trim();

    if (!workflowName) {
      setError("Workflow name is required.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workflowName,
          description: "Built with the Day 16 J10 Flow visual workflow builder.",
          status: "draft",
          triggerType: "manual",
          triggerConfig: {},
          timezone: "UTC",
        }),
      });
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
        automation?: Automation;
      };

      if (!response.ok || !data.success || !data.automation) {
        throw new Error(data.error || "Could not create workflow.");
      }

      router.push(`/dashboard/automation/flow/${data.automation.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create workflow.");
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07070a] px-4 py-6 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/dashboard/automation"
              className="mb-4 inline-flex items-center gap-2 text-xs text-white/45 transition hover:text-white"
            >
              <ArrowLeft size={14} /> Automation operations
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-violet-400">
              Day 16 · J10 Flow
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Visual Workflow Builder
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/45">
              Build typed workflows, validate connections, publish immutable versions,
              inspect runs, and roll back safely on the existing J10 runtime.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        <section className="mb-8 grid gap-4 rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/45">
              New workflow name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !creating) {
                  void createWorkflow();
                }
              }}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none transition focus:border-violet-400/60"
            />
          </label>
          <button
            type="button"
            onClick={() => void createWorkflow()}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-5 py-3 text-sm font-bold shadow-lg shadow-violet-500/15 transition hover:brightness-110 disabled:opacity-50"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Create J10 Flow
          </button>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.025]">
            <Loader2 className="animate-spin text-violet-400" />
          </div>
        ) : automations.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] text-center">
            <Workflow size={30} className="mb-3 text-white/20" />
            <p className="font-semibold">No workflows yet</p>
            <p className="mt-1 text-sm text-white/40">Create your first typed J10 Flow above.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {automations.map((automation) => (
              <Link
                key={automation.id}
                href={`/dashboard/automation/flow/${automation.id}`}
                className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:-translate-y-0.5 hover:border-violet-400/35 hover:bg-violet-500/[0.05]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-300">
                    <GitBranch size={18} />
                  </div>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                    {automation.status}
                  </span>
                </div>
                <h2 className="mt-5 truncate text-base font-bold group-hover:text-violet-200">
                  {automation.name}
                </h2>
                <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-white/40">
                  {automation.description || "No description."}
                </p>
                <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[10px] uppercase tracking-wider text-white/30">
                  <span>{automation.trigger_type.replaceAll("_", " ")}</span>
                  <span>{Number(automation.total_executions ?? 0)} runs</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
