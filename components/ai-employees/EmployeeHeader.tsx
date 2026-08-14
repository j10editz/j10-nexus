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
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600">
          <Bot size={22} className="text-white" />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-violet-400">
            Digital Workforce
          </p>

          <h1 className="text-2xl font-semibold tracking-tight text-white">
            AI Employees
          </h1>

          <p className="mt-1 text-sm text-zinc-500">
            Create, manage, train and monitor intelligent employees.
          </p>
        </div>
      </div>

      <CreateEmployeeButton onClick={onCreateEmployee} />
    </div>
  );
}