"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";
import type { Employee } from "@/components/types/employee";

interface CreateEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (employee: Employee) => void;
}

export default function CreateEmployeeModal({
  open,
  onClose,
  onCreate,
}: CreateEmployeeModalProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("Sales");
  const [model, setModel] = useState("GPT-5");

  if (!open) {
    return null;
  }

  function handleCreate() {
    if (!name.trim() || !role.trim()) {
      return;
    }

    const newEmployee: Employee = {
      id: crypto.randomUUID(),
      name: name.trim(),
      role: role.trim(),
      department,
      status: "Running",
      tasksCompleted: 0,
      revenueGenerated: 0,
      lastActive: "Just now",
      avatar: name.trim().charAt(0).toUpperCase(),
      model,
    };

    onCreate(newEmployee);

    setName("");
    setRole("");
    setDepartment("Sales");
    setModel("GPT-5");

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b0b0d] shadow-2xl">

        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600">
              <Bot size={22} className="text-white" />
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400">
                J10 Nexus Workforce
              </p>

              <h2 className="mt-1 text-xl font-semibold text-white">
                Create AI Employee
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Deploy an intelligent employee to your workspace.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* FORM */}
        <div className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Employee Name
            </label>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Example: J10 Sales Agent"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Role
            </label>

            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Example: Lead Qualification"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Department
              </label>

              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
              >
                <option value="Sales">Sales</option>
                <option value="Marketing">Marketing</option>
                <option value="Human Resources">
                  Human Resources
                </option>
                <option value="Customer Support">
                  Customer Support
                </option>
                <option value="Finance">Finance</option>
                <option value="Operations">Operations</option>
                <option value="Research">Research</option>
                <option value="Legal">Legal</option>
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
                <option value="GPT-5">GPT-5</option>
                <option value="Claude">Claude</option>
                <option value="Gemini">Gemini</option>
              </select>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || !role.trim()}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Deploy Employee
          </button>
        </div>
      </div>
    </div>
  );
}