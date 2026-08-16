"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  Activity,
  ArrowLeft,
  Bot,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import type { Employee } from "@/components/types/employee";

type ActivityItem = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  title: string;
  description: string | null;
  created_at: string;
};

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
  const [editing, setEditing] =
    useState(false);

  const [viewingActivity, setViewingActivity] =
    useState(false);

  const [activityLoading, setActivityLoading] =
    useState(false);

  const [employeeActivity, setEmployeeActivity] =
    useState<ActivityItem[]>([]);

  const [activityError, setActivityError] =
    useState("");

  const [name, setName] =
    useState("");

  const [role, setRole] =
    useState("");

  const [department, setDepartment] =
    useState("");

  const [model, setModel] =
    useState("");

  useEffect(() => {
    if (!employee) return;

    setName(employee.name);
    setRole(employee.role);
    setDepartment(employee.department);
    setModel(employee.model);

    setEditing(false);
    setViewingActivity(false);
    setEmployeeActivity([]);
    setActivityError("");
  }, [employee]);

  if (!open || !employee) {
    return null;
  }

  const isRunning =
    employee.status === "Running";

  const isPaused =
    employee.status === "Paused";

  function saveChanges() {
    if (!employee) return;

    if (
      !name.trim() ||
      !role.trim()
    ) {
      return;
    }

    const updatedEmployee: Employee = {
      ...employee,

      name: name.trim(),

      role: role.trim(),

      department,

      model,

      lastActive: "Just now",

      avatar:
        name
          .trim()
          .charAt(0)
          .toUpperCase() || "J",
    };

    onUpdate(updatedEmployee);

    setEditing(false);
  }

  async function loadEmployeeActivity() {
    if (!employee) return;

    setViewingActivity(true);
    setActivityLoading(true);
    setActivityError("");

    try {
      const response = await fetch(
        "/api/dashboard/activity",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not load activity."
        );
      }

      const allActivity =
        Array.isArray(data.activity)
          ? (data.activity as ActivityItem[])
          : [];

      const matchingActivity =
        allActivity.filter(
          (activity) =>
            activity.entity_type ===
              "ai_employee" &&
            activity.entity_id ===
              employee.id
        );

      setEmployeeActivity(
        matchingActivity
      );
    } catch (error) {
      console.error(
        "Employee activity error:",
        error
      );

      setActivityError(
        "Could not load employee activity."
      );
    } finally {
      setActivityLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">

        {/* HEADER */}
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div className="flex items-start gap-3">
            {viewingActivity && (
              <button
                type="button"
                onClick={() =>
                  setViewingActivity(false)
                }
                className="mt-1 rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
              >
                <ArrowLeft size={18} />
              </button>
            )}

            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-violet-400">
                J10 NEXUS WORKFORCE
              </p>

              <h2 className="mt-2 text-2xl font-bold text-white">
                {viewingActivity
                  ? "Employee Activity"
                  : employee.name}
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                {viewingActivity
                  ? employee.name
                  : employee.role}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* ACTIVITY MODE */}
        {viewingActivity ? (
          <div className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">
                  Activity History
                </p>

                <p className="mt-1 text-xs text-zinc-600">
                  Actions recorded for this AI employee.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  loadEmployeeActivity
                }
                disabled={
                  activityLoading
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-500 transition hover:text-white disabled:opacity-40"
              >
                <RefreshCw
                  size={15}
                  className={
                    activityLoading
                      ? "animate-spin"
                      : ""
                  }
                />
              </button>
            </div>

            {activityError && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {activityError}
              </div>
            )}

            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(
                  (item) => (
                    <div
                      key={item}
                      className="h-[72px] animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
                    />
                  )
                )}
              </div>
            ) : employeeActivity.length ===
              0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10">
                  <Activity
                    size={18}
                    className="text-violet-400"
                  />
                </div>

                <p className="mt-4 text-sm font-medium text-zinc-300">
                  No activity found
                </p>

                <p className="mt-1 text-xs text-zinc-600">
                  Future actions for this employee will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {employeeActivity.map(
                  (item) => {
                    const Icon =
                      getActivityIcon(
                        item.action
                      );

                    return (
                      <div
                        key={item.id}
                        className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
                          <Icon
                            size={15}
                            className={getActivityColor(
                              item.action
                            )}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-200">
                            {item.title}
                          </p>

                          {item.description && (
                            <p className="mt-1 text-xs leading-5 text-zinc-500">
                              {
                                item.description
                              }
                            </p>
                          )}

                          <p className="mt-2 text-[10px] text-zinc-700">
                            {formatActivityTime(
                              item.created_at
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>
        ) : editing ? (
          /* EDIT MODE */
          <div className="space-y-4 p-6">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Employee Name
              </label>

              <input
                value={name}
                onChange={(e) =>
                  setName(
                    e.target.value
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Role
              </label>

              <input
                value={role}
                onChange={(e) =>
                  setRole(
                    e.target.value
                  )
                }
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
                  onChange={(e) =>
                    setDepartment(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
                >
                  <option>Sales</option>
                  <option>Revenue</option>
                  <option>
                    Customer Support
                  </option>
                  <option>
                    Human Resources
                  </option>
                  <option>HR</option>
                  <option>
                    Marketing
                  </option>
                  <option>Finance</option>
                  <option>
                    Operations
                  </option>
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
                  onChange={(e) =>
                    setModel(
                      e.target.value
                    )
                  }
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
                onClick={() =>
                  setEditing(false)
                }
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
                value={
                  employee.department
                }
              />

              <InfoBox
                label="AI Model"
                value={
                  employee.model
                }
              />

              <InfoBox
                label="Status"
                value={
                  employee.status
                }
              />

              <InfoBox
                label="Tasks Completed"
                value={String(
                  employee.tasksCompleted
                )}
              />

              <InfoBox
                label="Revenue"
                value={`$${employee.revenueGenerated.toLocaleString()}`}
              />

              <InfoBox
                label="Last Active"
                value={
                  employee.lastActive
                }
              />
            </div>

            {/* CONTROLS */}
            <div className="border-t border-white/10 p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Employee Controls
              </p>

              <div className="grid grid-cols-2 gap-3">
                <ActionButton
                  icon={
                    <Pause size={16} />
                  }
                  label="Pause Employee"
                  disabled={!isRunning}
                  onClick={() =>
                    onPause(employee)
                  }
                />

                <ActionButton
                  icon={
                    <Play size={16} />
                  }
                  label="Resume Employee"
                  disabled={!isPaused}
                  onClick={() =>
                    onResume(employee)
                  }
                />

                <ActionButton
                  icon={
                    <Pencil size={16} />
                  }
                  label="Edit Employee"
                  onClick={() =>
                    setEditing(true)
                  }
                />

                <ActionButton
                  icon={
                    <Activity size={16} />
                  }
                  label="View Activity"
                  onClick={
                    loadEmployeeActivity
                  }
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  onDelete(employee)
                }
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
      <p className="text-xs text-zinc-500">
        {label}
      </p>

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
  icon: ReactNode;
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

function getActivityIcon(
  action: string
) {
  switch (action) {
    case "ai_employee_created":
      return Bot;

    case "ai_employee_paused":
      return Pause;

    case "ai_employee_resumed":
      return Play;

    case "ai_employee_edited":
      return Pencil;

    case "ai_employee_deleted":
      return Trash2;

    default:
      return Activity;
  }
}

function getActivityColor(
  action: string
) {
  switch (action) {
    case "ai_employee_created":
      return "text-blue-400";

    case "ai_employee_paused":
      return "text-amber-400";

    case "ai_employee_resumed":
      return "text-emerald-400";

    case "ai_employee_edited":
      return "text-violet-400";

    case "ai_employee_deleted":
      return "text-red-400";

    default:
      return "text-zinc-400";
  }
}

function formatActivityTime(
  createdAt: string
) {
  const created =
    new Date(createdAt).getTime();

  const difference =
    Math.max(
      0,
      Date.now() - created
    );

  const seconds =
    Math.floor(
      difference / 1000
    );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (minutes < 60) {
    return `${minutes} ${
      minutes === 1
        ? "minute"
        : "minutes"
    } ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `${hours} ${
      hours === 1
        ? "hour"
        : "hours"
    } ago`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  return `${days} ${
    days === 1
      ? "day"
      : "days"
  } ago`;
}