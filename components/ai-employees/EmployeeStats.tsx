import {
  Bot,
  CirclePause,
  CircleX,
  CheckCircle2,
} from "lucide-react";

import { Employee } from "@/components/types/employee";

type EmployeeStatsProps = {
  employees: Employee[];
};

export default function EmployeeStats({
  employees,
}: EmployeeStatsProps) {
  const running = employees.filter(
    (employee) => employee.status === "Running"
  ).length;

  const paused = employees.filter(
    (employee) => employee.status === "Paused"
  ).length;

  const offline = employees.filter(
    (employee) => employee.status === "Offline"
  ).length;

  const tasks = employees.reduce(
    (total, employee) => total + employee.tasksCompleted,
    0
  );

  const stats = [
    {
      label: "Running",
      value: running,
      icon: CheckCircle2,
      className: "text-emerald-400",
    },
    {
      label: "Paused",
      value: paused,
      icon: CirclePause,
      className: "text-amber-400",
    },
    {
      label: "Offline",
      value: offline,
      icon: CircleX,
      className: "text-zinc-500",
    },
    {
      label: "Tasks Completed",
      value: tasks.toLocaleString(),
      icon: Bot,
      className: "text-blue-400",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {stat.label}
              </p>

              <Icon
                size={16}
                className={stat.className}
              />
            </div>

            <p className="mt-3 text-2xl font-semibold text-white">
              {stat.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}