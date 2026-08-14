"use client";

import { useEffect, useState } from "react";
import {
  X,
  Pause,
  Play,
  Pencil,
  Trash2,
  Activity,
  Save,
} from "lucide-react";

import type { Employee } from "@/components/types/employee";

type Props = {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onPause: (employee: Employee) => void;
  onResume: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
  onUpdate: (employee: Employee) => void;
};

export default function EmployeeDetailsModal({
  employee,
  open,
  onClose,
  onPause,
  onResume,
  onDelete,
  onUpdate,
}: Props) {
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    if (!employee) return;

    setName(employee.name);
    setRole(employee.role);
    setDepartment(employee.department);
    setModel(employee.model);
    setEditing(false);
  }, [employee]);

  if (!open || !employee) return null;

  const isRunning = employee.status === "Running";
  const isPaused = employee.status === "Paused";

  function saveChanges() {
    if (!employee) return;
    if (!name.trim() || !role.trim()) return;

    const updatedEmployee: Employee = {
      ...employee,
      name: name.trim(),
      role: role.trim(),
      department,
      model,
      lastActive: "Just now",
      avatar: name.trim().charAt(0).toUpperCase(),
    };

    onUpdate(updatedEmployee);
    setEditing(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">

        {/* HEADER */}
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-violet-400">
              J10 NEXUS WORKFORCE
            </p>

            <h2 className="mt-2 text-2xl font-bold text-white">
              {employee.name}
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              {employee.role}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* EDIT MODE */}
        {editing ? (
          <div className="space-y-4 p-6">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Employee Name
              </label>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Role
              </label>

              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Department
                </label>

                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
                >
                  <option>Sales</option>
                  <option>Revenue</option>
                  <option>Customer Support</option>
                  <option>Human Resources</option>
                  <option>HR</option>
                  <option>Marketing</option>
                  <option>Finance</option>
                  <option>Operations</option>
                  <option>Research</option>
                  <option>Legal</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  AI Model
                </label>

                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
                >
                  <option>GPT-5</option>
                  <option>Claude</option>
                  <option>Gemini</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveChanges}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
              >
                <Save size={16} />
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* INFO */}
            <div className="grid grid-cols-2 gap-4 p-6">
              <InfoBox
                label="Department"
                value={employee.department}
              />

              <InfoBox
                label="AI Model"
                value={employee.model}
              />

              <InfoBox
                label="Status"
                value={employee.status}
              />

              <InfoBox
                label="Tasks Completed"
                value={String(employee.tasksCompleted)}
              />

              <InfoBox
                label="Revenue"
                value={`$${employee.revenueGenerated.toLocaleString()}`}
              />

              <InfoBox
                label="Last Active"
                value={employee.lastActive}
              />
            </div>

            {/* CONTROLS */}
            <div className="border-t border-white/10 p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Employee Controls
              </p>

              <div className="grid grid-cols-2 gap-3">
                <ActionButton
                  icon={<Pause size={16} />}
                  label="Pause Employee"
                  disabled={!isRunning}
                  onClick={() => onPause(employee)}
                />

                <ActionButton
                  icon={<Play size={16} />}
                  label="Resume Employee"
                  disabled={!isPaused}
                  onClick={() => onResume(employee)}
                />

                <ActionButton
                  icon={<Pencil size={16} />}
                  label="Edit Employee"
                  onClick={() => setEditing(true)}
                />

                <ActionButton
                  icon={<Activity size={16} />}
                  label="View Activity"
                  onClick={() => {}}
                />
              </div>

              <button
                type="button"
                onClick={() => onDelete(employee)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
              >
                <Trash2 size={16} />
                Delete Employee
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-zinc-500">{label}</p>

      <p className="mt-1 font-medium text-white">
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {icon}
      {label}
    </button>
  );
}