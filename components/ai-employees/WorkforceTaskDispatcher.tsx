"use client";

import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  Copy,
  Cpu,
  LoaderCircle,
  Play,
  Send,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import type { Employee } from "@/components/types/employee";

export type WorkforceTask = {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string;
  title: string;
  task_type: string;
  instructions: string;
  input_text: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  result_text: string | null;
  error_message: string | null;
  execution_mode: string;
  api_called: boolean;
  target_model: string | null;
  display_model: string | null;
  estimated_cost_usd: number | string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

interface WorkforceTaskDispatcherProps {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  initialEmployeeId?: string | null;
  onTaskCompleted?: (task: WorkforceTask) => void;
}

const TASK_PRESETS = [
  {
    type: "lead_outreach",
    label: "Lead Outreach & Personalization",
    defaultTitle: "Draft high-converting WhatsApp outreach",
    defaultInstructions:
      "Draft a direct, personalized WhatsApp message to convert this lead into booking a 15-minute product demonstration.",
    sampleInput:
      "Lead: David Miller\nCompany: Horizon Logistics (50 employees)\nPain Point: High support inquiry volume on WhatsApp during weekends\nBudget: $2,500/month",
  },
  {
    type: "research_analysis",
    label: "Market & Competitor Research",
    defaultTitle: "Competitive intelligence synthesis",
    defaultInstructions:
      "Analyze current AI Automation Agency offerings, key pricing models, and standard margin structures.",
    sampleInput:
      "Target Market: B2B Service Companies ($1M - $10M ARR)\nOffer: WhatsApp AI Lead Capture & CRM automation setup + monthly retainer.",
  },
  {
    type: "customer_support",
    label: "Support Ticket Resolution",
    defaultTitle: "Resolve customer inquiry with Knowledge Base",
    defaultInstructions:
      "Answer customer questions accurately, maintaining a confident, empathetic, and professional tone.",
    sampleInput:
      "Customer: 'We need to upgrade our account to Enterprise for custom webhooks, but want to make sure our existing flow connections won't experience downtime. What is the process?'",
  },
  {
    type: "ad_copywriting",
    label: "Ad & Social Copy Generation",
    defaultTitle: "Generate multi-angle viral ad variations",
    defaultInstructions:
      "Create 3 distinct high-converting ad copy angles (Pain-Point, Aspirational, and Contrarian) optimized for Meta and LinkedIn ads.",
    sampleInput:
      "Product: J10 NEXUS AI Operating System\nTarget: Business Owners scaling from 5 to 50 employees\nGoal: Free trial signups.",
  },
  {
    type: "financial_audit",
    label: "Financial & Ledger Audit",
    defaultTitle: "Audit monthly recurring revenue & invoice aging",
    defaultInstructions:
      "Calculate projected MRR growth, flag overdue client balances, and draft automated payment reminders.",
    sampleInput:
      "Active Clients: 18 ($1,500/mo)\nOverdue: 2 accounts (14 days past due, totaling $3,000)\nTarget: 98% on-time collection rate.",
  },
];

export default function WorkforceTaskDispatcher({
  open,
  onClose,
  employees,
  initialEmployeeId,
  onTaskCompleted,
}: WorkforceTaskDispatcherProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployeeId || (employees[0]?.id ?? "")
  );
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [title, setTitle] = useState(TASK_PRESETS[0].defaultTitle);
  const [instructions, setInstructions] = useState(TASK_PRESETS[0].defaultInstructions);
  const [inputText, setInputText] = useState(TASK_PRESETS[0].sampleInput);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<WorkforceTask | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const currentEmployee = employees.find((e) => e.id === selectedEmployeeId) ?? employees[0];

  function handleSelectPreset(idx: number) {
    setSelectedPresetIndex(idx);
    const p = TASK_PRESETS[idx];
    setTitle(p.defaultTitle);
    setInstructions(p.defaultInstructions);
    setInputText(p.sampleInput);
    setExecutionResult(null);
    setErrorMessage("");
  }

  async function handleExecuteTask() {
    if (!title.trim() || !instructions.trim()) {
      setErrorMessage("Please provide both a task title and detailed instructions.");
      return;
    }

    setIsExecuting(true);
    setErrorMessage("");
    setExecutionResult(null);

    try {
      // Step 1: Create task in backend
      const createRes = await fetch("/api/ai-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentEmployee?.id,
          title: title.trim(),
          taskType: TASK_PRESETS[selectedPresetIndex].type,
          instructions: instructions.trim(),
          inputText: inputText.trim() || null,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.success || !createData.task) {
        throw new Error(createData.error || "Failed to create task record.");
      }

      const createdTask: WorkforceTask = createData.task;

      // Step 2: Trigger immediate AI execution
      const runRes = await fetch(`/api/ai-tasks/${createdTask.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forceDevelopmentLiveAPI: true,
        }),
      });

      const runData = await runRes.json();
      if (!runRes.ok || !runData.success || !runData.task) {
        throw new Error(runData.error || "AI task execution encountered an error.");
      }

      const finishedTask: WorkforceTask = runData.task;
      setExecutionResult(finishedTask);
      onTaskCompleted?.(finishedTask);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Execution failed.");
    } finally {
      setIsExecuting(false);
    }
  }

  function copyResult() {
    if (executionResult?.result_text) {
      navigator.clipboard.writeText(executionResult.result_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0c0d12] p-5 sm:p-7 shadow-2xl text-white my-auto max-h-[92vh] flex flex-col">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-md shadow-violet-600/30">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-white">
                  Dispatch Autonomous Task
                </h2>
                <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                  Live AI Execution
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Execute instant operations across your specialized AI workforce.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* SCROLLABLE FORM BODY */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 text-xs">
          {/* ASSIGNED AGENT SELECTOR */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Assigned Specialist
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {employees.map((emp) => {
                const isSelected = emp.id === (currentEmployee?.id ?? "");
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(emp.id)}
                    className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                      isSelected
                        ? "border-violet-500/40 bg-violet-500/10 text-white shadow-sm"
                        : "border-white/[0.06] bg-black/30 text-zinc-400 hover:border-white/10 hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 text-white font-bold text-xs">
                      {emp.avatar || emp.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate text-xs">{emp.name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{emp.role}</p>
                    </div>
                    {isSelected && <CheckCircle2 size={14} className="text-violet-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TASK PRESETS */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Task Template Preset
            </label>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {TASK_PRESETS.map((p, idx) => (
                <button
                  key={p.type}
                  type="button"
                  onClick={() => handleSelectPreset(idx)}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                    selectedPresetIndex === idx
                      ? "bg-violet-600 text-white"
                      : "border border-white/[0.06] bg-white/[0.03] text-zinc-400 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* TASK TITLE */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Draft outreach sequence"
              className="w-full rounded-xl border border-white/10 bg-[#121319] px-3.5 py-2.5 text-xs text-white outline-none focus:border-violet-500 transition"
            />
          </div>

          {/* INSTRUCTIONS */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Agent Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              placeholder="Detailed instructions for the AI employee..."
              className="w-full rounded-xl border border-white/10 bg-[#121319] px-3.5 py-2.5 text-xs text-white outline-none focus:border-violet-500 transition leading-relaxed resize-none"
            />
          </div>

          {/* INPUT CONTEXT */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Input Context & Data
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={3}
              placeholder="Context, lead details, support ticket, or prompt data..."
              className="w-full rounded-xl border border-white/10 bg-[#121319] px-3.5 py-2.5 text-xs text-white outline-none focus:border-violet-500 transition font-mono leading-relaxed"
            />
          </div>

          {/* ERROR ALERT */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-red-400 text-xs">
              <TriangleAlert size={15} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* EXECUTION RESULT PREVIEW */}
          {executionResult && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                  <CheckCircle2 size={15} />
                  Task Completed Successfully ({executionResult.display_model || "AI Model"})
                </div>
                <button
                  type="button"
                  onClick={copyResult}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition"
                >
                  <Copy size={12} />
                  {copied ? "Copied!" : "Copy Output"}
                </button>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/40 p-3.5 text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {executionResult.result_text || "No output returned."}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400 pt-1">
                <span>⚡ Status: <strong className="text-emerald-400">Completed</strong></span>
                <span>🤖 Agent: <strong className="text-white">{executionResult.employee_name}</strong></span>
                <span>⏱️ Execution Mode: <strong className="text-violet-300">Live API</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-white/[0.08] pt-4 mt-auto">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <Cpu size={13} className="text-violet-400" />
            <span>Target: <strong>{currentEmployee?.model || "GPT-4o"}</strong></span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none rounded-xl border border-white/10 px-4 py-2.5 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleExecuteTask}
              disabled={isExecuting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 disabled:opacity-50"
            >
              {isExecuting ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" />
                  Executing Task...
                </>
              ) : (
                <>
                  <Play size={13} className="fill-white" />
                  Execute Task with AI
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
