"use client";

import { ArrowUpRight, Bot, Cpu, Play, Sparkles, Zap } from "lucide-react";
import type { Employee } from "@/components/types/employee";

type EmployeeCardProps = {
  employee: Employee;
  onAssignTask?: (employee: Employee, e: React.MouseEvent) => void;
};

export default function EmployeeCard({
  employee,
  onAssignTask,
}: EmployeeCardProps) {
  const isRunning = employee.status === "Running";
  const isPaused = employee.status === "Paused";

  const statusBadge = isRunning ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Running 24/7
    </span>
  ) : isPaused ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Paused
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/25 bg-zinc-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
      Offline
    </span>
  );

  return (
    <div
      className="
        group
        relative
        flex flex-col
        rounded-2xl
        border border-white/[0.08]
        bg-[#111217]
        p-5
        text-left
        transition-all duration-200
        hover:border-violet-500/30
        hover:bg-[#14151c]
        hover:shadow-xl
        hover:shadow-violet-600/[0.04]
      "
    >
      {/* CARD TOP ROW */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white font-bold text-base shadow-md shadow-violet-600/20">
            {employee.avatar || employee.name.charAt(0)}
          </div>

          <div className="min-w-0">
            <h3 className="font-semibold text-white text-sm truncate group-hover:text-violet-200 transition">
              {employee.name}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400 truncate">
              {employee.role}
            </p>
          </div>
        </div>

        <span className="shrink-0 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-zinc-500 group-hover:border-violet-500/20 group-hover:text-violet-300 transition">
          <ArrowUpRight size={15} />
        </span>
      </div>

      {/* STATUS & DEPARTMENT PILLS */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {statusBadge}

        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-medium text-zinc-300">
          {employee.department || "Specialist"}
        </span>

        <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/40 px-2 py-0.5 text-[10px] text-zinc-400 font-mono">
          <Cpu size={10} className="text-violet-400" />
          {employee.model || "GPT-4o"}
        </span>
      </div>

      {/* METRICS GRID */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Tasks Done
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {employee.tasksCompleted?.toLocaleString() ?? 0}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Revenue Impact
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-400">
            ${employee.revenueGenerated?.toLocaleString() ?? 0}
          </p>
        </div>
      </div>

      {/* CARD FOOTER WITH ACTION BUTTONS */}
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
        <span className="text-[11px] text-zinc-500">
          Active: <strong className="text-zinc-400 font-normal">{employee.lastActive || "Recently"}</strong>
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAssignTask?.(employee, e);
          }}
          className="flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/20 active:scale-95"
        >
          <Play size={11} className="fill-violet-300" />
          Assign Task
        </button>
      </div>
    </div>
  );
}