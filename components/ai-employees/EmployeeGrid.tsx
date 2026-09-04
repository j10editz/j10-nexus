"use client";

import EmployeeCard from "./EmployeeCard";
import type { Employee } from "@/components/types/employee";

type EmployeeGridProps = {
  employees: Employee[];
  onEmployeeClick?: (employee: Employee) => void;
  onAssignTask?: (employee: Employee) => void;
};

export default function EmployeeGrid({
  employees,
  onEmployeeClick,
  onAssignTask,
}: EmployeeGridProps) {
  if (employees.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-12 text-center">
        <p className="text-sm font-medium text-zinc-300">
          No AI employees found.
        </p>

        <p className="mt-2 text-xs text-zinc-600">
          Try changing your search or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {employees.map((employee) => (
        <div
          key={employee.id}
          onClick={() => onEmployeeClick?.(employee)}
          className={onEmployeeClick ? "cursor-pointer" : ""}
        >
          <EmployeeCard
            employee={employee}
            onAssignTask={(emp) => onAssignTask?.(emp)}
          />
        </div>
      ))}
    </div>
  );
}