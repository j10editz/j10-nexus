"use client";

type FiltersProps = {
  status: string;
  department: string;
  onStatusChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
};

export default function Filters({
  status,
  department,
  onStatusChange,
  onDepartmentChange,
}: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-[#111216] px-4 py-3 text-sm text-zinc-300 outline-none"
      >
        <option value="All">All Statuses</option>
        <option value="Running">Running</option>
        <option value="Paused">Paused</option>
        <option value="Offline">Offline</option>
      </select>

      <select
        value={department}
        onChange={(e) => onDepartmentChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-[#111216] px-4 py-3 text-sm text-zinc-300 outline-none"
      >
        <option value="All">All Departments</option>
        <option value="Sales">Sales</option>
        <option value="Revenue">Revenue</option>
        <option value="Human Resources">Human Resources</option>
        <option value="HR">HR</option>
        <option value="Customer Support">Customer Support</option>
        <option value="Marketing">Marketing</option>
        <option value="Finance">Finance</option>
        <option value="Operations">Operations</option>
        <option value="Research">Research</option>
        <option value="Legal">Legal</option>
      </select>
    </div>
  );
}