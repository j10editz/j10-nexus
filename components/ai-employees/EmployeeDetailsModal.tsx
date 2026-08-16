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
  CheckCircle2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import type { Employee } from "@/components/types/employee";

import SalesAgentCRMPanel from "@/components/ai-employees/SalesAgentCRMPanel";

import { createClient } from "@/lib/supabase";

/*
============================================================
PROPS
============================================================
*/

type Props = {
  employee: Employee | null;

  open: boolean;

  onClose: () => void;

  onPause: (
    employee: Employee
  ) => void;

  onResume: (
    employee: Employee
  ) => void;

  onDelete: (
    employee: Employee
  ) => void;

  onUpdate: (
    employee: Employee
  ) => void;
};

/*
============================================================
ACTIVITY TYPE
============================================================
*/

type ActivityItem = {
  id: string;

  action: string;

  entity_type: string;

  entity_id: string | null;

  title: string;

  description:
    | string
    | null;

  metadata: Record<
    string,
    unknown
  > | null;

  created_at: string;
};

/*
============================================================
MAIN COMPONENT
============================================================
*/

export default function EmployeeDetailsModal({
  employee,
  open,
  onClose,
  onPause,
  onResume,
  onDelete,
  onUpdate,
}: Props) {
  const [supabase] =
    useState(() =>
      createClient()
    );

  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    viewingActivity,
    setViewingActivity,
  ] = useState(false);

  const [
    name,
    setName,
  ] = useState("");

  const [
    role,
    setRole,
  ] = useState("");

  const [
    department,
    setDepartment,
  ] = useState("");

  const [
    model,
    setModel,
  ] = useState("");

  const [
    activity,
    setActivity,
  ] =
    useState<ActivityItem[]>(
      []
    );

  const [
    activityLoading,
    setActivityLoading,
  ] = useState(false);

  const [
    activityError,
    setActivityError,
  ] = useState("");

  const [
    activityRefreshKey,
    setActivityRefreshKey,
  ] = useState(0);

  /*
  ============================================================
  RESET EMPLOYEE STATE
  ============================================================
  */

  useEffect(() => {
    if (!employee) {
      return;
    }

    setName(
      employee.name
    );

    setRole(
      employee.role
    );

    setDepartment(
      employee.department
    );

    setModel(
      employee.model
    );

    setEditing(false);

    setViewingActivity(
      false
    );

    setActivity([]);

    setActivityError("");
  }, [employee]);

  /*
  ============================================================
  LOAD EMPLOYEE ACTIVITY
  ============================================================
  */

  useEffect(() => {
    if (
      !employee ||
      !viewingActivity
    ) {
      return;
    }

    let cancelled =
      false;

    async function loadActivity() {
      if (!employee) {
        return;
      }

      setActivityLoading(
        true
      );

      setActivityError("");

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            "activity_logs"
          )
          .select(
            `
            id,
            action,
            entity_type,
            entity_id,
            title,
            description,
            metadata,
            created_at
            `
          )
          .eq(
            "entity_id",
            employee.id
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            }
          )
          .limit(30);

        if (cancelled) {
          return;
        }

        if (error) {
          console.error(
            "Employee activity error:",
            error
          );

          setActivityError(
            "Could not load employee activity."
          );

          return;
        }

        setActivity(
          (data ??
            []) as ActivityItem[]
        );
      } catch (error) {
        console.error(
          "Employee activity error:",
          error
        );

        if (!cancelled) {
          setActivityError(
            "Could not load employee activity."
          );
        }
      } finally {
        if (!cancelled) {
          setActivityLoading(
            false
          );
        }
      }
    }

    void loadActivity();

    return () => {
      cancelled = true;
    };
  }, [
    employee,
    viewingActivity,
    activityRefreshKey,
    supabase,
  ]);

  /*
  ============================================================
  CLOSED
  ============================================================
  */

  if (
    !open ||
    !employee
  ) {
    return null;
  }

  /*
  ============================================================
  SALES AGENT DETECTION
  ============================================================
  */

  const employeeIdentity =
    `${employee.name} ${employee.role} ${employee.department}`
      .toLowerCase();

  const isSalesAgent =
    employeeIdentity.includes(
      "sales"
    );

  const isRunning =
    employee.status ===
    "Running";

  const isPaused =
    employee.status ===
    "Paused";

  /*
  ============================================================
  SAVE EMPLOYEE EDIT
  ============================================================
  */

  function saveChanges() {
    if (
      !employee ||
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

      lastActive:
        "Just now",

      avatar: name
        .trim()
        .charAt(0)
        .toUpperCase(),
    };

    onUpdate(
      updatedEmployee
    );

    setEditing(false);
  }

  /*
  ============================================================
  ACTIVITY VIEW
  ============================================================
  */

  if (viewingActivity) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
        <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">
          <div className="sticky top-0 z-20 flex items-start justify-between border-b border-white/10 bg-[#0b0b0e]/95 p-6 backdrop-blur">
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() =>
                  setViewingActivity(
                    false
                  )
                }
                className="mt-1 rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
              >
                <ArrowLeft
                  size={18}
                />
              </button>

              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-violet-400">
                  J10 NEXUS WORKFORCE
                </p>

                <h2 className="mt-2 text-2xl font-bold text-white">
                  Employee Activity
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {employee.name}
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

          <div className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">
                  Activity History
                </h3>

                <p className="mt-1 text-xs text-zinc-600">
                  Recorded actions performed by this employee.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setActivityRefreshKey(
                    (current) =>
                      current + 1
                  )
                }
                disabled={
                  activityLoading
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 transition hover:text-white disabled:opacity-40"
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
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                {activityError}
              </div>
            )}

            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(
                  (item) => (
                    <div
                      key={item}
                      className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
                    />
                  )
                )}
              </div>
            ) : activity.length ===
              0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] px-6 py-14 text-center">
                <Activity
                  size={22}
                  className="mx-auto text-zinc-700"
                />

                <p className="mt-4 text-sm text-zinc-500">
                  No activity recorded yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map(
                  (item) => (
                    <ActivityRow
                      key={item.id}
                      item={item}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /*
  ============================================================
  MAIN EMPLOYEE MODAL
  ============================================================
  */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl ${
          isSalesAgent
            ? "max-w-6xl"
            : "max-w-xl"
        }`}
      >
        <div className="sticky top-0 z-30 flex items-start justify-between border-b border-white/10 bg-[#0b0b0e]/95 p-6 backdrop-blur">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <Bot size={19} />
            </div>

            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-violet-400">
                J10 NEXUS WORKFORCE
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-white">
                  {employee.name}
                </h2>

                {isSalesAgent && (
                  <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-violet-400">
                    CRM Access
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-zinc-500">
                {employee.role}
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

        {editing ? (
          <div className="space-y-4 p-6">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Employee Name
              </label>

              <input
                value={name}
                onChange={(
                  event
                ) =>
                  setName(
                    event
                      .target
                      .value
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
                onChange={(
                  event
                ) =>
                  setRole(
                    event
                      .target
                      .value
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Department
                </label>

                <select
                  value={
                    department
                  }
                  onChange={(
                    event
                  ) =>
                    setDepartment(
                      event
                        .target
                        .value
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
                >
                  <option>
                    Sales
                  </option>

                  <option>
                    Revenue
                  </option>

                  <option>
                    Customer Support
                  </option>

                  <option>
                    Human Resources
                  </option>

                  <option>
                    HR
                  </option>

                  <option>
                    Marketing
                  </option>

                  <option>
                    Finance
                  </option>

                  <option>
                    Operations
                  </option>

                  <option>
                    Research
                  </option>

                  <option>
                    Legal
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  AI Model
                </label>

                <select
                  value={model}
                  onChange={(
                    event
                  ) =>
                    setModel(
                      event
                        .target
                        .value
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
                >
                  <option>
                    Automatic
                  </option>

                  <option>
                    GPT-5.6 Sol
                  </option>

                  <option>
                    GPT-5.6 Terra
                  </option>

                  <option>
                    GPT-5.6 Luna
                  </option>

                  <option>
                    GPT-5
                  </option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() =>
                  setEditing(
                    false
                  )
                }
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  saveChanges
                }
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
              >
                <Save size={16} />

                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`grid gap-4 p-6 ${
                isSalesAgent
                  ? "sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-2"
              }`}
            >
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

            <div className="border-t border-white/10 p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Employee Controls
              </p>

              <div
                className={`grid gap-3 ${
                  isSalesAgent
                    ? "sm:grid-cols-2 lg:grid-cols-4"
                    : "grid-cols-2"
                }`}
              >
                <ActionButton
                  icon={
                    <Pause
                      size={16}
                    />
                  }
                  label="Pause Employee"
                  disabled={
                    !isRunning
                  }
                  onClick={() =>
                    onPause(
                      employee
                    )
                  }
                />

                <ActionButton
                  icon={
                    <Play
                      size={16}
                    />
                  }
                  label="Resume Employee"
                  disabled={
                    !isPaused
                  }
                  onClick={() =>
                    onResume(
                      employee
                    )
                  }
                />

                <ActionButton
                  icon={
                    <Pencil
                      size={16}
                    />
                  }
                  label="Edit Employee"
                  onClick={() =>
                    setEditing(
                      true
                    )
                  }
                />

                <ActionButton
                  icon={
                    <Activity
                      size={16}
                    />
                  }
                  label="View Activity"
                  onClick={() =>
                    setViewingActivity(
                      true
                    )
                  }
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  onDelete(
                    employee
                  )
                }
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
              >
                <Trash2
                  size={16}
                />

                Delete Employee
              </button>
            </div>

            {isSalesAgent && (
              <div className="border-t border-white/[0.07] p-6">
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                    SALES INTELLIGENCE
                  </p>

                  <h3 className="mt-2 text-xl font-semibold text-white">
                    CRM Execution Workspace
                  </h3>

                  <p className="mt-1 text-sm text-zinc-600">
                    Controlled CRM access for this exact AI Sales Agent.
                  </p>
                </div>

                {/*
                ============================================================
                EXACT EMPLOYEE BINDING
                ============================================================

                This is the important fix.

                The CRM panel now receives the exact
                employee ID that is currently open.

                That employee ID is sent to the API,
                verified against the authenticated user,
                and used for every CRM action.
                */}

                <SalesAgentCRMPanel
                  employeeId={
                    employee.id
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/*
============================================================
INFO BOX
============================================================
*/

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

      <p className="mt-1 break-words font-medium text-white">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
ACTION BUTTON
============================================================
*/

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

/*
============================================================
ACTIVITY ROW
============================================================
*/

function ActivityRow({
  item,
}: {
  item: ActivityItem;
}) {
  const {
    icon,
    iconClass,
  } =
    getActivityAppearance(
      item.action
    );

  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] ${iconClass}`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">
          {item.title}
        </p>

        {item.description && (
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            {
              item.description
            }
          </p>
        )}

        <p className="mt-2 text-[10px] text-zinc-700">
          {formatRelativeTime(
            item.created_at
          )}
        </p>
      </div>
    </div>
  );
}

/*
============================================================
ACTIVITY ICON
============================================================
*/

function getActivityAppearance(
  action: string
) {
  const normalized =
    action.toLowerCase();

  if (
    normalized.includes(
      "paused"
    )
  ) {
    return {
      icon: (
        <Pause size={15} />
      ),

      iconClass:
        "text-amber-400",
    };
  }

  if (
    normalized.includes(
      "resumed"
    ) ||
    normalized.includes(
      "started"
    )
  ) {
    return {
      icon: (
        <Play size={15} />
      ),

      iconClass:
        "text-emerald-400",
    };
  }

  if (
    normalized.includes(
      "deleted"
    )
  ) {
    return {
      icon: (
        <Trash2
          size={15}
        />
      ),

      iconClass:
        "text-red-400",
    };
  }

  if (
    normalized.includes(
      "edited"
    ) ||
    normalized.includes(
      "updated"
    )
  ) {
    return {
      icon: (
        <Pencil
          size={15}
        />
      ),

      iconClass:
        "text-violet-400",
    };
  }

  if (
    normalized.includes(
      "sales"
    )
  ) {
    return {
      icon: (
        <CheckCircle2
          size={15}
        />
      ),

      iconClass:
        "text-blue-400",
    };
  }

  return {
    icon: (
      <Activity
        size={15}
      />
    ),

    iconClass:
      "text-zinc-400",
  };
}

/*
============================================================
RELATIVE TIME
============================================================
*/

function formatRelativeTime(
  value: string
) {
  const date =
    new Date(value);

  const difference =
    Date.now() -
    date.getTime();

  if (
    Number.isNaN(
      difference
    )
  ) {
    return "";
  }

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