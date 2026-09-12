import { Bot } from "lucide-react";
import CreateEmployeeButton from "./CreateEmployeeButton";

interface EmployeeHeaderProps {
  onCreateEmployee: () => void;
}

export default function EmployeeHeader({
  onCreateEmployee,
}: EmployeeHeaderProps) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="j10-gradient flex h-12 w-12 items-center justify-center rounded-2xl shadow-[0_0_20px_rgba(0,217,255,0.25)]">
          <Bot size={22} className="text-white" />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Autonomous Workforce
          </p>

          <h1 className="text-2xl font-bold tracking-tight text-white">
            J10 Agents
          </h1>

          <p className="mt-1 text-sm text-[#8d96a8]">
            Configure, activate, and operate your autonomous revenue and customer agents.
          </p>
        </div>
      </div>

      <CreateEmployeeButton onClick={onCreateEmployee} />
    </div>
  );
}