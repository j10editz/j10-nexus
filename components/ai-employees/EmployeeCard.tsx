"use client";

import { ArrowUpRight, Bot } from "lucide-react";
import { Employee } from "@/components/types/employee";

type EmployeeCardProps = {
  employee: Employee;
};

export default function EmployeeCard({
  employee,
}: EmployeeCardProps) {
  const statusColor =
    employee.status === "Running"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : employee.status === "Paused"
      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
      : "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";

  return (
    <button
      className="
        group
        rounded-2xl
        border border-white/[0.07]
        bg-[#111216]
        p-5
        text-left
        transition-all duration-300
        hover:-translate-y-1
        hover:border-blue-500/20
        hover:bg-[#14161b]
      "
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
            <Bot size={18} />
          </div>

          <div>
            <p className="font-semibold text-white">
              {employee.name}
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              {employee.role}
            </p>
          </div>
        </div>

        <ArrowUpRight
          size={16}
          className="text-zinc-700 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-400"
        />
      </div>

      <div className="mt-5">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusColor}`}
        >
          {employee.status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
          <p className="text-[10px] text-zinc-600">
            Tasks
          </p>

          <p className="mt-1 text-sm font-semibold">
            {employee.tasksCompleted.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
          <p className="text-[10px] text-zinc-600">
            Revenue
          </p>

          <p className="mt-1 text-sm font-semibold">
            ${employee.revenueGenerated.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4">
        <span className="text-xs text-zinc-600">
          {employee.model}
        </span>

        <span className="text-xs text-zinc-600">
          {employee.lastActive}
        </span>
      </div>
    </button>
  );
}