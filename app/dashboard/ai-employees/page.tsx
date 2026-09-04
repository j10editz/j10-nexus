"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ArrowUpRight,
  Ban,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Cpu,
  FileText,
  Gauge,
  ListFilter,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import EmployeeHeader from "@/components/ai-employees/EmployeeHeader";
import EmployeeStats from "@/components/ai-employees/EmployeeStats";
import SearchBar from "@/components/ai-employees/SearchBar";
import Filters from "@/components/ai-employees/Filters";
import EmployeeGrid from "@/components/ai-employees/EmployeeGrid";
import CreateEmployeeModal from "@/components/ai-employees/CreateEmployeeModal";
import EmployeeDetailsModal from "@/components/ai-employees/EmployeeDetailsModal";
import SalesAgentCRMPanel from "@/components/ai-employees/SalesAgentCRMPanel";
import WorkforceTaskDispatcher from "@/components/ai-employees/WorkforceTaskDispatcher";

import { createClient } from "@/lib/supabase";

import type { Employee } from "@/components/types/employee";

type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: "Running" | "Paused" | "Offline";
  tasks_completed: number;
  revenue_generated: number;
  last_active: string;
  avatar: string;
  model: string;
};

type ActivityInput = {
  action: string;
  entityId: string | null;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
};

type WorkforceTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

type WorkforceTaskFilterStatus =
  | "all"
  | WorkforceTaskStatus;

type WorkforceTask = {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string;
  title: string;
  task_type: string;
  instructions: string;
  input_text: string | null;
  status: WorkforceTaskStatus;
  result_text: string | null;
  error_message: string | null;
  execution_mode: string;
  api_called: boolean;
  target_model: string | null;
  display_model: string | null;
  estimated_cost_usd: number | string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type WorkforceTaskSummary = {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
};

type WorkforceTasksResponse = {
  success: boolean;
  summary?: WorkforceTaskSummary;
  tasks?: WorkforceTask[];
  error?: string;
};

type ManageTaskAction =
  | "cancel"
  | "retry";

type ManageTaskResponse = {
  success: boolean;
  action?: ManageTaskAction;
  message?: string;
  task?: WorkforceTask;
  runEndpoint?: string;
  error?: string;
};

type RunTaskResponse = {
  success?: boolean;
  task?: WorkforceTask;
  error?: string;
};

type EmployeeTaskAnalytics = {
  id: string;
  name: string;
  total: number;
  completed: number;
  failed: number;
};

function mapEmployee(
  row: EmployeeRow
): Employee {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    department: row.department,
    status: row.status,
    tasksCompleted:
      row.tasks_completed,
    revenueGenerated:
      Number(
        row.revenue_generated
      ),
    lastActive:
      row.last_active,
    avatar:
      row.avatar,
    model:
      row.model,
  };
}

export default function AIEmployeesPage() {
  const [supabase] =
    useState(() =>
      createClient()
    );

  const [
    employeeList,
    setEmployeeList,
  ] =
    useState<Employee[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    workforceTasks,
    setWorkforceTasks,
  ] =
    useState<WorkforceTask[]>(
      []
    );

  const [
    workforceSummary,
    setWorkforceSummary,
  ] =
    useState<WorkforceTaskSummary>({
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    });

  const [
    workforceLoading,
    setWorkforceLoading,
  ] =
    useState(true);

  const [
    workforceError,
    setWorkforceError,
  ] =
    useState("");

  /*
  ============================================================
  WORKFORCE FILTERS
  ============================================================
  */

  const [
    workforceTaskSearch,
    setWorkforceTaskSearch,
  ] =
    useState("");

  const [
    workforceTaskStatus,
    setWorkforceTaskStatus,
  ] =
    useState<WorkforceTaskFilterStatus>(
      "all"
    );

  const [
    workforceEmployeeFilter,
    setWorkforceEmployeeFilter,
  ] =
    useState("all");

  /*
  ============================================================
  EMPLOYEE FILTERS
  ============================================================
  */

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    status,
    setStatus,
  ] =
    useState("All");

  const [
    department,
    setDepartment,
  ] =
    useState("All");

  /*
  ============================================================
  MODALS
  ============================================================
  */

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(false);

  const [
    selectedEmployee,
    setSelectedEmployee,
  ] =
    useState<Employee | null>(
      null
    );

  const [
    selectedTask,
    setSelectedTask,
  ] =
    useState<WorkforceTask | null>(
      null
    );

  const [activeTab, setActiveTab] =
    useState<
      "specialists" | "operations" | "intelligence" | "crm"
    >("specialists");

  const [taskDispatcherOpen, setTaskDispatcherOpen] =
    useState(false);

  const [dispatcherEmployeeId, setDispatcherEmployeeId] =
    useState<string | null>(null);

  function openDispatcherForEmployee(employee: Employee) {
    setDispatcherEmployeeId(employee.id);
    setTaskDispatcherOpen(true);
  }

  /*
  ============================================================
  TASK MANAGEMENT
  ============================================================
  */

  const [
    taskActionLoading,
    setTaskActionLoading,
  ] =
    useState<ManageTaskAction | null>(
      null
    );

  const [
    taskActionError,
    setTaskActionError,
  ] =
    useState("");

  const [
    taskActionMessage,
    setTaskActionMessage,
  ] =
    useState("");

  /*
  ============================================================
  ACTIVITY LOGGER
  ============================================================
  */

  async function logActivity({
    action,
    entityId,
    title,
    description,
    metadata = {},
  }: ActivityInput) {
    const {
      error,
    } =
      await supabase
        .from(
          "activity_logs"
        )
        .insert({
          action,
          entity_type:
            "ai_employee",
          entity_id:
            entityId,
          title,
          description,
          metadata,
        });

    if (error) {
      console.error(
        "Failed to create activity log:",
        error
      );
    }
  }

  /*
  ============================================================
  LOAD EMPLOYEES
  ============================================================
  */

const DEFAULT_SPECIALISTS: Employee[] = [
  {
    id: "ai-emp-1",
    name: "Sarah Chen",
    role: "Lead Sales & Deal Qualification Specialist",
    department: "Sales",
    status: "Running",
    tasksCompleted: 842,
    revenueGenerated: 42800,
    lastActive: "Just now",
    avatar: "SC",
    model: "GPT-4o",
  },
  {
    id: "ai-emp-2",
    name: "Alex Vance",
    role: "Autonomous Marketing & Campaign Agent",
    department: "Marketing",
    status: "Running",
    tasksCompleted: 1250,
    revenueGenerated: 28400,
    lastActive: "2m ago",
    avatar: "AV",
    model: "GPT-4o",
  },
  {
    id: "ai-emp-3",
    name: "Elena Rostova",
    role: "24/7 Customer Support & Triage Lead",
    department: "Support",
    status: "Running",
    tasksCompleted: 3410,
    revenueGenerated: 15600,
    lastActive: "Just now",
    avatar: "ER",
    model: "GPT-4o",
  },
  {
    id: "ai-emp-4",
    name: "Marcus Sterling",
    role: "Financial Auditor & Invoice Reconciler",
    department: "Finance",
    status: "Running",
    tasksCompleted: 420,
    revenueGenerated: 67200,
    lastActive: "15m ago",
    avatar: "MS",
    model: "GPT-4o",
  },
];

  async function loadEmployees() {
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setEmployeeList(DEFAULT_SPECIALISTS);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("employees")
        .select(
          `
          id,
          name,
          role,
          department,
          status,
          tasks_completed,
          revenue_generated,
          last_active,
          avatar,
          model
          `
        )
        .order("created_at", { ascending: false });

      if (error || !data || data.length === 0) {
        setEmployeeList(DEFAULT_SPECIALISTS);
      } else {
        setEmployeeList((data as EmployeeRow[]).map(mapEmployee));
      }
    } catch {
      setEmployeeList(DEFAULT_SPECIALISTS);
    } finally {
      setLoading(false);
    }
  }

  /*
  ============================================================
  LOAD WORKFORCE TASKS
  ============================================================
  */

  async function loadWorkforceTasks() {
    setWorkforceLoading(
      true
    );

    setWorkforceError(
      ""
    );

    try {
      const response =
        await fetch(
          "/api/ai-tasks",
          {
            method:
              "GET",
            cache:
              "no-store",
          }
        );

      const result =
        (await response.json()) as WorkforceTasksResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Could not load workforce tasks."
        );
      }

      const tasks =
        result.tasks ??
        [];

      setWorkforceTasks(
        tasks
      );

      setWorkforceSummary(
        result.summary ?? {
          total: 0,
          pending: 0,
          running: 0,
          completed: 0,
          failed: 0,
        }
      );

      setSelectedTask(
        (
          current
        ) => {
          if (!current) {
            return null;
          }

          return (
            tasks.find(
              (
                task
              ) =>
                task.id ===
                current.id
            ) ??
            current
          );
        }
      );
    } catch (error) {
      console.error(
        "Workforce task dashboard error:",
        error
      );

      setWorkforceError(
        error instanceof Error
          ? error.message
          : "Could not load workforce tasks."
      );
    } finally {
      setWorkforceLoading(
        false
      );
    }
  }

  /*
  ============================================================
  INITIAL LOAD
  ============================================================
  */

  useEffect(() => {
    void loadEmployees();

    void loadWorkforceTasks();
  }, []);

  /*
  ============================================================
  FILTER EMPLOYEES
  ============================================================
  */

  const filteredEmployees =
    useMemo(() => {
      return employeeList.filter(
        (
          employee
        ) => {
          const searchValue =
            search
              .trim()
              .toLowerCase();

          const matchesSearch =
            employee.name
              .toLowerCase()
              .includes(
                searchValue
              ) ||
            employee.role
              .toLowerCase()
              .includes(
                searchValue
              ) ||
            employee.department
              .toLowerCase()
              .includes(
                searchValue
              );

          const matchesStatus =
            status ===
              "All" ||
            employee.status ===
              status;

          const matchesDepartment =
            department ===
              "All" ||
            employee.department ===
              department;

          return (
            matchesSearch &&
            matchesStatus &&
            matchesDepartment
          );
        }
      );
    }, [
      employeeList,
      search,
      status,
      department,
    ]);

  /*
  ============================================================
  WORKFORCE EMPLOYEE OPTIONS
  ============================================================
  */

  const workforceEmployeeOptions =
    useMemo(() => {
      const employees =
        new Map<
          string,
          string
        >();

      workforceTasks.forEach(
        (
          task
        ) => {
          employees.set(
            task.employee_id,
            task.employee_name
          );
        }
      );

      return Array.from(
        employees.entries()
      )
        .map(
          ([
            id,
            name,
          ]) => ({
            id,
            name,
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            a.name.localeCompare(
              b.name
            )
        );
    }, [
      workforceTasks,
    ]);

  /*
  ============================================================
  STATUS COUNTS
  ============================================================
  */

  const taskStatusCounts =
    useMemo(() => {
      return {
        all:
          workforceTasks.length,

        pending:
          workforceTasks.filter(
            (
              task
            ) =>
              task.status ===
              "pending"
          ).length,

        running:
          workforceTasks.filter(
            (
              task
            ) =>
              task.status ===
              "running"
          ).length,

        completed:
          workforceTasks.filter(
            (
              task
            ) =>
              task.status ===
              "completed"
          ).length,

        failed:
          workforceTasks.filter(
            (
              task
            ) =>
              task.status ===
              "failed"
          ).length,

        cancelled:
          workforceTasks.filter(
            (
              task
            ) =>
              task.status ===
              "cancelled"
          ).length,
      };
    }, [
      workforceTasks,
    ]);

  /*
  ============================================================
  11L WORKFORCE ANALYTICS
  ============================================================
  */

  const workforceAnalytics =
    useMemo(() => {
      const completed =
        workforceTasks.filter(
          (
            task
          ) =>
            task.status ===
            "completed"
        ).length;

      const failed =
        workforceTasks.filter(
          (
            task
          ) =>
            task.status ===
            "failed"
        ).length;

      const finished =
        completed +
        failed;

      const completionRate =
        finished > 0
          ? Math.round(
              (
                completed /
                finished
              ) *
                100
            )
          : 0;

      const totalCost =
        workforceTasks.reduce(
          (
            total,
            task
          ) => {
            const value =
              Number(
                task.estimated_cost_usd ??
                  0
              );

            return (
              total +
              (
                Number.isFinite(
                  value
                )
                  ? value
                  : 0
              )
            );
          },
          0
        );

      const apiCalls =
        workforceTasks.filter(
          (
            task
          ) =>
            task.api_called
        ).length;

      const executedTasks =
        workforceTasks.filter(
          (
            task
          ) =>
            Boolean(
              task.started_at
            ) ||
            task.status ===
              "running" ||
            task.status ===
              "completed" ||
            task.status ===
              "failed"
        );

      const developmentExecutions =
        executedTasks.filter(
          (
            task
          ) =>
            task.execution_mode
              .toLowerCase() ===
            "development"
        ).length;

      const liveExecutions =
        executedTasks.filter(
          (
            task
          ) =>
            task.execution_mode
              .toLowerCase() ===
            "live"
        ).length;

      const employeeMap =
        new Map<
          string,
          EmployeeTaskAnalytics
        >();

      workforceTasks.forEach(
        (
          task
        ) => {
          const current =
            employeeMap.get(
              task.employee_id
            ) ?? {
              id:
                task.employee_id,

              name:
                task.employee_name,

              total: 0,

              completed: 0,

              failed: 0,
            };

          current.total +=
            1;

          if (
            task.status ===
            "completed"
          ) {
            current.completed +=
              1;
          }

          if (
            task.status ===
            "failed"
          ) {
            current.failed +=
              1;
          }

          employeeMap.set(
            task.employee_id,
            current
          );
        }
      );

      const employeeDistribution =
        Array.from(
          employeeMap.values()
        ).sort(
          (
            a,
            b
          ) =>
            b.total -
            a.total
        );

      const mostActiveEmployee =
        employeeDistribution[0] ??
        null;

      return {
        completionRate,

        totalCost,

        apiCalls,

        developmentExecutions,

        liveExecutions,

        executedCount:
          executedTasks.length,

        employeeDistribution,

        mostActiveEmployee,
      };
    }, [
      workforceTasks,
    ]);

  /*
  ============================================================
  FILTER WORKFORCE TASKS
  ============================================================
  */

  const filteredWorkforceTasks =
    useMemo(() => {
      const query =
        workforceTaskSearch
          .trim()
          .toLowerCase();

      return workforceTasks.filter(
        (
          task
        ) => {
          const matchesSearch =
            !query ||
            task.title
              .toLowerCase()
              .includes(
                query
              ) ||
            task.employee_name
              .toLowerCase()
              .includes(
                query
              ) ||
            task.task_type
              .toLowerCase()
              .includes(
                query
              ) ||
            task.instructions
              .toLowerCase()
              .includes(
                query
              ) ||
            (
              task.input_text ??
              ""
            )
              .toLowerCase()
              .includes(
                query
              ) ||
            (
              task.result_text ??
              ""
            )
              .toLowerCase()
              .includes(
                query
              );

          const matchesStatus =
            workforceTaskStatus ===
              "all" ||
            task.status ===
              workforceTaskStatus;

          const matchesEmployee =
            workforceEmployeeFilter ===
              "all" ||
            task.employee_id ===
              workforceEmployeeFilter;

          return (
            matchesSearch &&
            matchesStatus &&
            matchesEmployee
          );
        }
      );
    }, [
      workforceTasks,
      workforceTaskSearch,
      workforceTaskStatus,
      workforceEmployeeFilter,
    ]);

  const recentTasks =
    filteredWorkforceTasks.slice(
      0,
      10
    );

  const workforceFiltersActive =
    workforceTaskSearch.trim() !==
      "" ||
    workforceTaskStatus !==
      "all" ||
    workforceEmployeeFilter !==
      "all";

  function clearWorkforceFilters() {
    setWorkforceTaskSearch(
      ""
    );

    setWorkforceTaskStatus(
      "all"
    );

    setWorkforceEmployeeFilter(
      "all"
    );
  }

  /*
  ============================================================
  CREATE EMPLOYEE
  ============================================================
  */

  async function createEmployee(
    employee: Employee
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          "employees"
        )
        .insert({
          name:
            employee.name,

          role:
            employee.role,

          department:
            employee.department,

          status:
            employee.status,

          tasks_completed:
            employee.tasksCompleted,

          revenue_generated:
            employee.revenueGenerated,

          last_active:
            employee.lastActive,

          avatar:
            employee.avatar,

          model:
            employee.model,
        })
        .select(
          `
          id,
          name,
          role,
          department,
          status,
          tasks_completed,
          revenue_generated,
          last_active,
          avatar,
          model
          `
        )
        .single();

    if (error) {
      console.error(
        "Failed to create employee:",
        error
      );

      window.alert(
        "Could not create employee."
      );

      return;
    }

    const createdEmployee =
      mapEmployee(
        data as EmployeeRow
      );

    setEmployeeList(
      (
        current
      ) => [
        createdEmployee,
        ...current,
      ]
    );

    setCreateOpen(
      false
    );

    await logActivity({
      action:
        "ai_employee_created",

      entityId:
        createdEmployee.id,

      title:
        `${createdEmployee.name} created`,

      description:
        `${createdEmployee.name} was created and added to your AI workforce.`,

      metadata: {
        source:
          "ai_employees_page",

        role:
          createdEmployee.role,

        department:
          createdEmployee.department,

        model:
          createdEmployee.model,
      },
    });
  }

  /*
  ============================================================
  PAUSE EMPLOYEE
  ============================================================
  */

  async function pauseEmployee(
    employee: Employee
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          "employees"
        )
        .update({
          status:
            "Paused",

          last_active:
            "Just now",
        })
        .eq(
          "id",
          employee.id
        )
        .select(
          `
          id,
          name,
          role,
          department,
          status,
          tasks_completed,
          revenue_generated,
          last_active,
          avatar,
          model
          `
        )
        .single();

    if (error) {
      console.error(
        "Failed to pause employee:",
        error
      );

      return;
    }

    const updatedEmployee =
      mapEmployee(
        data as EmployeeRow
      );

    setEmployeeList(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            employee.id
              ? updatedEmployee
              : item
        )
    );

    setSelectedEmployee(
      updatedEmployee
    );

    await logActivity({
      action:
        "ai_employee_paused",

      entityId:
        updatedEmployee.id,

      title:
        `${updatedEmployee.name} paused`,

      description:
        `${updatedEmployee.name} was paused and is no longer executing tasks.`,

      metadata: {
        role:
          updatedEmployee.role,

        department:
          updatedEmployee.department,

        status:
          "Paused",
      },
    });
  }

  /*
  ============================================================
  RESUME EMPLOYEE
  ============================================================
  */

  async function resumeEmployee(
    employee: Employee
  ) {
    const {
      data,
      error,
    } =
      await supabase
        .from(
          "employees"
        )
        .update({
          status:
            "Running",

          last_active:
            "Just now",
        })
        .eq(
          "id",
          employee.id
        )
        .select(
          `
          id,
          name,
          role,
          department,
          status,
          tasks_completed,
          revenue_generated,
          last_active,
          avatar,
          model
          `
        )
        .single();

    if (error) {
      console.error(
        "Failed to resume employee:",
        error
      );

      return;
    }

    const updatedEmployee =
      mapEmployee(
        data as EmployeeRow
      );

    setEmployeeList(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            employee.id
              ? updatedEmployee
              : item
        )
    );

    setSelectedEmployee(
      updatedEmployee
    );

    await logActivity({
      action:
        "ai_employee_resumed",

      entityId:
        updatedEmployee.id,

      title:
        `${updatedEmployee.name} resumed`,

      description:
        `${updatedEmployee.name} resumed operations and is running again.`,

      metadata: {
        role:
          updatedEmployee.role,

        department:
          updatedEmployee.department,

        status:
          "Running",
      },
    });
  }

  /*
  ============================================================
  UPDATE EMPLOYEE
  ============================================================
  */

  async function updateEmployee(
    employee: Employee
  ) {
    const previousEmployee =
      employeeList.find(
        (
          item
        ) =>
          item.id ===
          employee.id
      );

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "employees"
        )
        .update({
          name:
            employee.name,

          role:
            employee.role,

          department:
            employee.department,

          status:
            employee.status,

          tasks_completed:
            employee.tasksCompleted,

          revenue_generated:
            employee.revenueGenerated,

          last_active:
            "Just now",

          avatar:
            employee.avatar,

          model:
            employee.model,
        })
        .eq(
          "id",
          employee.id
        )
        .select(
          `
          id,
          name,
          role,
          department,
          status,
          tasks_completed,
          revenue_generated,
          last_active,
          avatar,
          model
          `
        )
        .single();

    if (error) {
      console.error(
        "Failed to update employee:",
        error
      );

      return;
    }

    const updatedEmployee =
      mapEmployee(
        data as EmployeeRow
      );

    setEmployeeList(
      (
        current
      ) =>
        current.map(
          (
            item
          ) =>
            item.id ===
            employee.id
              ? updatedEmployee
              : item
        )
    );

    setSelectedEmployee(
      updatedEmployee
    );

    await logActivity({
      action:
        "ai_employee_edited",

      entityId:
        updatedEmployee.id,

      title:
        `${updatedEmployee.name} edited`,

      description:
        `${updatedEmployee.name}'s configuration was updated.`,

      metadata: {
        previous_name:
          previousEmployee?.name ??
          null,

        name:
          updatedEmployee.name,

        role:
          updatedEmployee.role,

        department:
          updatedEmployee.department,

        model:
          updatedEmployee.model,
      },
    });
  }

  /*
  ============================================================
  DELETE EMPLOYEE
  ============================================================
  */

  async function deleteEmployee(
    employee: Employee
  ) {
    const confirmed =
      window.confirm(
        `Delete ${employee.name}?`
      );

    if (!confirmed) {
      return;
    }

    const {
      error,
    } =
      await supabase
        .from(
          "employees"
        )
        .delete()
        .eq(
          "id",
          employee.id
        );

    if (error) {
      console.error(
        "Failed to delete employee:",
        error
      );

      return;
    }

    setEmployeeList(
      (
        current
      ) =>
        current.filter(
          (
            item
          ) =>
            item.id !==
            employee.id
        )
    );

    setSelectedEmployee(
      null
    );

    await logActivity({
      action:
        "ai_employee_deleted",

      entityId:
        employee.id,

      title:
        `${employee.name} deleted`,

      description:
        `${employee.name} was removed from your AI workforce.`,

      metadata: {
        role:
          employee.role,

        department:
          employee.department,

        model:
          employee.model,
      },
    });
  }

  /*
  ============================================================
  CLOSE EMPLOYEE MODAL
  ============================================================
  */

  async function closeEmployeeModal() {
    setSelectedEmployee(
      null
    );

    await Promise.all([
      loadEmployees(),
      loadWorkforceTasks(),
    ]);
  }

  /*
  ============================================================
  OPEN TASK
  ============================================================
  */

  function openTask(
    task: WorkforceTask
  ) {
    setTaskActionError(
      ""
    );

    setTaskActionMessage(
      ""
    );

    setSelectedTask(
      task
    );
  }

  /*
  ============================================================
  MANAGE TASK
  ============================================================
  */

  async function manageTask(
    action: ManageTaskAction
  ) {
    const task =
      selectedTask;

    if (
      !task ||
      taskActionLoading
    ) {
      return;
    }

    if (
      action ===
      "cancel"
    ) {
      const confirmed =
        window.confirm(
          `Cancel "${task.title}"? This task will not run unless a new task is created.`
        );

      if (!confirmed) {
        return;
      }
    }

    if (
      action ===
      "retry"
    ) {
      const confirmed =
        window.confirm(
          `Retry "${task.title}"? J10 will reset the failed execution and run it again.`
        );

      if (!confirmed) {
        return;
      }
    }

    setTaskActionLoading(
      action
    );

    setTaskActionError(
      ""
    );

    setTaskActionMessage(
      ""
    );

    try {
      const manageResponse =
        await fetch(
          `/api/ai-tasks/${task.id}/manage`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                action,
              }),
          }
        );

      const manageResult =
        (await manageResponse.json()) as ManageTaskResponse;

      if (
        !manageResponse.ok ||
        !manageResult.success
      ) {
        throw new Error(
          manageResult.error ||
            "Task management failed."
        );
      }

      if (
        manageResult.task
      ) {
        setSelectedTask(
          manageResult.task
        );
      }

      if (
        action ===
        "cancel"
      ) {
        setTaskActionMessage(
          manageResult.message ||
            "Task cancelled successfully."
        );

        await loadWorkforceTasks();

        return;
      }

      const runEndpoint =
        manageResult.runEndpoint ||
        `/api/ai-tasks/${task.id}/run`;

      const runResponse =
        await fetch(
          runEndpoint,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );

      const runResult =
        (await runResponse.json()) as RunTaskResponse;

      if (
        !runResponse.ok
      ) {
        await Promise.all([
          loadWorkforceTasks(),
          loadEmployees(),
        ]);

        throw new Error(
          runResult.error ||
            "The retry was queued, but task execution could not start."
        );
      }

      if (
        runResult.task
      ) {
        setSelectedTask(
          runResult.task
        );
      }

      setTaskActionMessage(
        "Task retried successfully."
      );

      await Promise.all([
        loadWorkforceTasks(),
        loadEmployees(),
      ]);
    } catch (error) {
      console.error(
        "Task management error:",
        error
      );

      setTaskActionError(
        error instanceof Error
          ? error.message
          : "J10 could not manage this task."
      );
    } finally {
      setTaskActionLoading(
        null
      );
    }
  }

  /*
  ============================================================
  UI
  ============================================================
  */

  return (
    <>
      <div className="space-y-6">
        {/* COMMAND HEADER */}
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">
                J10 AUTONOMOUS WORKFORCE
              </span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Real-Time Telemetry
              </span>
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white">
              AI Workforce Command
            </h1>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-zinc-400">
              Deploy, orchestrate, and observe autonomous AI specialists powering your business 24/7.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDispatcherEmployeeId(null);
                setTaskDispatcherOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:brightness-110 active:scale-95"
            >
              <Zap size={14} className="fill-white" />
              Dispatch Task
            </button>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/[0.08] active:scale-95"
            >
              <Plus size={14} />
              Deploy Specialist
            </button>

            <button
              type="button"
              onClick={() => {
                void loadEmployees();
                void loadWorkforceTasks();
              }}
              disabled={loading || workforceLoading}
              className="flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-zinc-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
              title="Refresh Telemetry"
            >
              <RefreshCw
                size={14}
                className={loading || workforceLoading ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        {/* EXECUTIVE KPI BAR (2x2 on mobile, 4-col on desktop) */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111217] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Active Specialists
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Bot size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-bold text-white">
                {employeeList.filter((e) => e.status === "Running").length}
              </p>
              <span className="text-[11px] text-zinc-500">
                of {employeeList.length} deployed
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111217] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Tasks Completed
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-bold text-white">
                {workforceSummary.completed.toLocaleString()}
              </p>
              <span className="text-[11px] text-emerald-400 font-medium">
                {workforceAnalytics.completionRate}% rate
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111217] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Revenue Impact
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <CircleDollarSign size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-bold text-emerald-400">
                $
                {employeeList
                  .reduce((sum, e) => sum + (e.revenueGenerated || 0), 0)
                  .toLocaleString()}
              </p>
              <span className="text-[11px] text-zinc-500">tracked ROI</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#111217] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Inference Engines
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Cpu size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-xl sm:text-2xl font-bold text-white">
                Multi-Model
              </p>
              <span className="text-[11px] text-violet-300 font-mono">
                GPT-4o / Claude / Gemini
              </span>
            </div>
          </div>
        </div>

        {/* 4-TAB NAVIGATION DESK */}
        <div className="border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => setActiveTab("specialists")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                activeTab === "specialists"
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                  : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Bot
                size={14}
                className={
                  activeTab === "specialists" ? "text-white" : "text-violet-400"
                }
              />
              AI Specialists
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {employeeList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("operations")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                activeTab === "operations"
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                  : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Zap
                size={14}
                className={
                  activeTab === "operations" ? "text-white" : "text-amber-400"
                }
              />
              Task Dispatch & Feed
              <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {workforceTasks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("intelligence")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                activeTab === "intelligence"
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                  : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <BarChart3
                size={14}
                className={
                  activeTab === "intelligence"
                    ? "text-white"
                    : "text-emerald-400"
                }
              />
              Workforce Intelligence & ROI
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("crm")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition shrink-0 ${
                activeTab === "crm"
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25"
                  : "border border-white/[0.08] bg-[#111216] text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <ShieldCheck
                size={14}
                className={activeTab === "crm" ? "text-white" : "text-cyan-400"}
              />
              Sales Agent & CRM Pipeline
            </button>
          </div>
        </div>

        {/* TAB 1: AI SPECIALISTS */}
        {activeTab === "specialists" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SearchBar value={search} onChange={setSearch} />
              <Filters
                status={status}
                department={department}
                onStatusChange={setStatus}
                onDepartmentChange={setDepartment}
              />
            </div>

            {loading ? (
              <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-12 text-center">
                <p className="text-sm text-zinc-500">
                  Loading AI employees...
                </p>
              </div>
            ) : (
              <EmployeeGrid
                employees={filteredEmployees}
                onEmployeeClick={setSelectedEmployee}
                onAssignTask={openDispatcherForEmployee}
              />
            )}
          </div>
        )}

        {/* TAB 2: TASK DISPATCH & FEED */}
        {activeTab === "operations" && (
          <div className="space-y-6">
            {/* QUICK DISPATCH LAUNCHER BANNER */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-600/10 via-indigo-600/5 to-transparent p-5 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-violet-300 font-semibold text-sm">
                  <Sparkles size={15} />
                  Instant Autonomous Task Execution
                </div>
                <p className="mt-1 text-xs text-zinc-400 max-w-xl leading-relaxed">
                  Dispatch tasks directly to specialized AI agents. Instructions are executed in real time using your connected OpenAI GPT-4o engine.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDispatcherEmployeeId(null);
                  setTaskDispatcherOpen(true);
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-500 active:scale-95 shrink-0"
              >
                <Play size={12} className="fill-white" />
                Dispatch Task Now
              </button>
            </div>

            {/* TASK STATUS COUNTERS */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <WorkforceStatCard
                label="Total Tasks"
                value={workforceSummary.total}
                icon={FileText}
              />
              <WorkforceStatCard
                label="Completed"
                value={workforceSummary.completed}
                icon={CheckCircle2}
              />
              <WorkforceStatCard
                label="Pending"
                value={workforceSummary.pending}
                icon={Clock3}
              />
              <WorkforceStatCard
                label="Running"
                value={workforceSummary.running}
                icon={LoaderCircle}
              />
              <WorkforceStatCard
                label="Failed"
                value={workforceSummary.failed}
                icon={TriangleAlert}
              />
            </div>

            {workforceError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {workforceError}
              </div>
            )}

            {/* WORKFORCE TASK FILTERS */}
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-violet-400">
                    <ListFilter size={15} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      Task Feed Filters
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      Search and isolate specific AI executions.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative min-w-[240px]">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                    />
                    <input
                      type="text"
                      value={workforceTaskSearch}
                      onChange={(event) =>
                        setWorkforceTaskSearch(event.target.value)
                      }
                      placeholder="Search tasks or results..."
                      className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#101116] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-500/30"
                    />
                  </div>

                  <select
                    value={workforceEmployeeFilter}
                    onChange={(event) =>
                      setWorkforceEmployeeFilter(event.target.value)
                    }
                    className="h-10 min-w-[200px] rounded-xl border border-white/[0.08] bg-[#101116] px-3 text-sm text-zinc-300 outline-none transition focus:border-violet-500/30"
                  >
                    <option value="all">All AI Specialists</option>
                    {workforceEmployeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>

                  {workforceFiltersActive && (
                    <button
                      type="button"
                      onClick={clearWorkforceFilters}
                      className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <X size={14} />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <TaskFilterButton
                  label="All"
                  count={taskStatusCounts.all}
                  active={workforceTaskStatus === "all"}
                  onClick={() => setWorkforceTaskStatus("all")}
                />
                <TaskFilterButton
                  label="Pending"
                  count={taskStatusCounts.pending}
                  active={workforceTaskStatus === "pending"}
                  onClick={() => setWorkforceTaskStatus("pending")}
                />
                <TaskFilterButton
                  label="Running"
                  count={taskStatusCounts.running}
                  active={workforceTaskStatus === "running"}
                  onClick={() => setWorkforceTaskStatus("running")}
                />
                <TaskFilterButton
                  label="Completed"
                  count={taskStatusCounts.completed}
                  active={workforceTaskStatus === "completed"}
                  onClick={() => setWorkforceTaskStatus("completed")}
                />
                <TaskFilterButton
                  label="Failed"
                  count={taskStatusCounts.failed}
                  active={workforceTaskStatus === "failed"}
                  onClick={() => setWorkforceTaskStatus("failed")}
                />
                <TaskFilterButton
                  label="Cancelled"
                  count={taskStatusCounts.cancelled}
                  active={workforceTaskStatus === "cancelled"}
                  onClick={() => setWorkforceTaskStatus("cancelled")}
                />
              </div>
            </div>

            {/* TASK LIST */}
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Execution Feed
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Live reasoning logs, inputs, and results. Click any task to inspect details.
                  </p>
                </div>

                {!workforceLoading && (
                  <div className="text-xs text-zinc-600">
                    Showing{" "}
                    <span className="font-medium text-zinc-400">
                      {Math.min(recentTasks.length, 10)}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium text-zinc-400">
                      {filteredWorkforceTasks.length}
                    </span>{" "}
                    tasks
                  </div>
                )}
              </div>

              {workforceLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="h-20 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
                    />
                  ))}
                </div>
              ) : recentTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/[0.08] px-6 py-10 text-center">
                  <Search size={21} className="mx-auto text-zinc-700" />
                  <p className="mt-3 text-sm font-medium text-zinc-400">
                    No matching tasks found
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Dispatch an instant task above or clear active filters.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentTasks.map((task) => (
                    <WorkforceTaskRow
                      key={task.id}
                      task={task}
                      onOpen={() => openTask(task)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: WORKFORCE INTELLIGENCE */}
        {activeTab === "intelligence" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.025] p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                  <BarChart3 size={17} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                    J10 WORKFORCE ANALYTICS
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-white">
                    Workforce Intelligence & Efficiency
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Live productivity analytics calculated from autonomous AI execution records.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AnalyticsMetricCard
                  icon={Gauge}
                  label="Completion Rate"
                  value={`${workforceAnalytics.completionRate}%`}
                  description="Completed vs finished runs"
                />
                <AnalyticsMetricCard
                  icon={CircleDollarSign}
                  label="Total AI Cost"
                  value={formatCost(workforceAnalytics.totalCost)}
                  description="Recorded workforce usage"
                />
                <AnalyticsMetricCard
                  icon={ShieldCheck}
                  label="API Calls"
                  value={String(workforceAnalytics.apiCalls)}
                  description="Tasks that called live API"
                />
                <AnalyticsMetricCard
                  icon={UsersRound}
                  label="Most Active Specialist"
                  value={
                    workforceAnalytics.mostActiveEmployee?.name ??
                    "No activity"
                  }
                  description={
                    workforceAnalytics.mostActiveEmployee
                      ? `${workforceAnalytics.mostActiveEmployee.total} assigned tasks`
                      : "No tasks executed yet"
                  }
                />
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {/* STATUS DISTRIBUTION */}
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Task Distribution
                    </p>
                    <h4 className="mt-1 text-sm font-semibold text-white">
                      Tasks by Status
                    </h4>
                  </div>
                  <div className="mt-5 space-y-4">
                    <AnalyticsBar
                      label="Completed"
                      value={taskStatusCounts.completed}
                      total={taskStatusCounts.all}
                    />
                    <AnalyticsBar
                      label="Pending"
                      value={taskStatusCounts.pending}
                      total={taskStatusCounts.all}
                    />
                    <AnalyticsBar
                      label="Running"
                      value={taskStatusCounts.running}
                      total={taskStatusCounts.all}
                    />
                    <AnalyticsBar
                      label="Failed"
                      value={taskStatusCounts.failed}
                      total={taskStatusCounts.all}
                    />
                    <AnalyticsBar
                      label="Cancelled"
                      value={taskStatusCounts.cancelled}
                      total={taskStatusCounts.all}
                    />
                  </div>
                </div>

                {/* EXECUTION ENVIRONMENT */}
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Runtime Distribution
                    </p>
                    <h4 className="mt-1 text-sm font-semibold text-white">
                      Execution Environment
                    </h4>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <RuntimeMetric
                      label="Development"
                      value={workforceAnalytics.developmentExecutions}
                    />
                    <RuntimeMetric
                      label="Live API"
                      value={workforceAnalytics.liveExecutions}
                    />
                    <RuntimeMetric
                      label="Executed"
                      value={workforceAnalytics.executedCount}
                    />
                  </div>
                  <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-start gap-3">
                      <Cpu
                        size={16}
                        className="mt-0.5 shrink-0 text-violet-400"
                      />
                      <div>
                        <p className="text-sm font-medium text-white">
                          Current Runtime Profile
                        </p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                          Live API calls run directly against OpenAI GPT-4o. Cost and API activity are tracked independently per task.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* EMPLOYEE TASK LOAD */}
              <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      AI Specialist Distribution
                    </p>
                    <h4 className="mt-1 text-sm font-semibold text-white">
                      Specialist Workload Breakdown
                    </h4>
                  </div>
                  <span className="text-xs text-zinc-600">
                    {workforceAnalytics.employeeDistribution.length} specialists with task history
                  </span>
                </div>

                {workforceAnalytics.employeeDistribution.length === 0 ? (
                  <div className="mt-5 rounded-xl border border-dashed border-white/[0.08] px-5 py-8 text-center">
                    <UsersRound size={20} className="mx-auto text-zinc-700" />
                    <p className="mt-3 text-sm text-zinc-500">
                      No specialist task analytics yet.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {workforceAnalytics.employeeDistribution.map((employee) => (
                      <EmployeeAnalyticsRow
                        key={employee.id}
                        employee={employee}
                        maxTasks={
                          workforceAnalytics.mostActiveEmployee?.total ?? 1
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SALES AGENT & CRM PIPELINE */}
        {activeTab === "crm" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0c0d12] p-4 sm:p-6">
              {employeeList.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">
                  Deploy an AI specialist to view live CRM pipeline intelligence.
                </div>
              ) : (
                <SalesAgentCRMPanel
                  employeeId={
                    employeeList.find((e) =>
                      e.department.toLowerCase().includes("sales")
                    )?.id ?? employeeList[0].id
                  }
                  onCRMChanged={() => {
                    void loadEmployees();
                    void loadWorkforceTasks();
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <CreateEmployeeModal
        open={
          createOpen
        }
        onClose={() =>
          setCreateOpen(
            false
          )
        }
        onCreate={
          createEmployee
        }
      />

      <EmployeeDetailsModal
        employee={
          selectedEmployee
        }
        open={
          selectedEmployee !==
          null
        }
        onClose={() =>
          void closeEmployeeModal()
        }
        onPause={
          pauseEmployee
        }
        onResume={
          resumeEmployee
        }
        onDelete={
          deleteEmployee
        }
        onUpdate={
          updateEmployee
        }
      />

      {selectedTask && (
        <TaskDetailsModal
          task={
            selectedTask
          }
          onClose={() => {
            if (
              taskActionLoading
            ) {
              return;
            }

            setSelectedTask(
              null
            );

            setTaskActionError(
              ""
            );

            setTaskActionMessage(
              ""
            );
          }}
          onRefresh={() =>
            void loadWorkforceTasks()
          }
          refreshing={
            workforceLoading
          }
          taskActionLoading={
            taskActionLoading
          }
          taskActionError={
            taskActionError
          }
          taskActionMessage={
            taskActionMessage
          }
          onCancel={() =>
            void manageTask(
              "cancel"
            )
          }
          onRetry={() =>
            void manageTask(
              "retry"
            )
          }
        />
      )}

      <WorkforceTaskDispatcher
        open={taskDispatcherOpen}
        onClose={() => setTaskDispatcherOpen(false)}
        employees={employeeList}
        initialEmployeeId={dispatcherEmployeeId}
        onTaskCompleted={() => {
          void loadWorkforceTasks();
          void loadEmployees();
        }}
      />
    </>
  );
}

/*
============================================================
11L ANALYTICS METRIC
============================================================
*/

function AnalyticsMetricCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon:
    LucideIcon;

  label:
    string;

  value:
    string;

  description:
    string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
          {label}
        </p>

        <Icon
          size={15}
          className="text-violet-400"
        />
      </div>

      <p className="mt-3 truncate text-xl font-semibold text-white">
        {value}
      </p>

      <p className="mt-1 text-xs text-zinc-700">
        {description}
      </p>
    </div>
  );
}

/*
============================================================
11L ANALYTICS BAR
============================================================
*/

function AnalyticsBar({
  label,
  value,
  total,
}: {
  label:
    string;

  value:
    number;

  total:
    number;
}) {
  const percentage =
    total > 0
      ? Math.round(
          (
            value /
            total
          ) *
            100
        )
      : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          {label}
        </p>

        <p className="text-xs font-medium text-zinc-400">
          {value}{" "}
          <span className="text-zinc-700">
            ({percentage}%)
          </span>
        </p>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-300"
          style={{
            width:
              `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

/*
============================================================
11L RUNTIME METRIC
============================================================
*/

function RuntimeMetric({
  label,
  value,
}: {
  label:
    string;

  value:
    number;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </p>

      <p className="mt-2 text-xl font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
11L EMPLOYEE ANALYTICS
============================================================
*/

function EmployeeAnalyticsRow({
  employee,
  maxTasks,
}: {
  employee:
    EmployeeTaskAnalytics;

  maxTasks:
    number;
}) {
  const percentage =
    maxTasks > 0
      ? Math.round(
          (
            employee.total /
            maxTasks
          ) *
            100
        )
      : 0;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {
              employee.name
            }
          </p>

          <p className="mt-1 text-xs text-zinc-700">
            {
              employee.completed
            }{" "}
            completed ·{" "}
            {
              employee.failed
            }{" "}
            failed
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-lg border border-violet-500/15 bg-violet-500/[0.06] px-2.5 py-1 text-xs font-medium text-violet-300">
            {
              employee.total
            }{" "}
            tasks
          </span>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-300"
          style={{
            width:
              `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

/*
============================================================
TASK FILTER BUTTON
============================================================
*/

function TaskFilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label:
    string;

  count:
    number;

  active:
    boolean;

  onClick:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={
        active
          ? "flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 transition"
          : "flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs font-medium text-zinc-500 transition hover:border-white/[0.12] hover:text-zinc-300"
      }
    >
      {label}

      <span
        className={
          active
            ? "rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300"
            : "rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-600"
        }
      >
        {count}
      </span>
    </button>
  );
}

/*
============================================================
WORKFORCE STAT CARD
============================================================
*/

function WorkforceStatCard({
  label,
  value,
  icon: Icon,
}: {
  label:
    string;

  value:
    number;

  icon:
    LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-600">
          {label}
        </p>

        <Icon
          size={14}
          className="text-violet-400"
        />
      </div>

      <p className="mt-3 text-2xl font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
WORKFORCE TASK ROW
============================================================
*/

function WorkforceTaskRow({
  task,
  onOpen,
}: {
  task:
    WorkforceTask;

  onOpen:
    () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onOpen
      }
      className="group w-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-left transition duration-200 hover:border-violet-500/20 hover:bg-violet-500/[0.04]"
    >
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">
              {
                task.title
              }
            </p>

            <WorkforceStatusBadge
              status={
                task.status
              }
            />
          </div>

          <p className="mt-1 text-xs text-zinc-600">
            {
              task.employee_name
            }{" "}
            ·{" "}
            <span className="capitalize">
              {
                task.task_type
              }
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[430px]">
            <MiniTaskMetric
              label="Mode"
              value={
                task.execution_mode
              }
            />

            <MiniTaskMetric
              label="API"
              value={
                task.api_called
                  ? "Called"
                  : "Not Called"
              }
            />

            <MiniTaskMetric
              label="Model"
              value={
                task.display_model ||
                "Not Run"
              }
            />

            <MiniTaskMetric
              label="Cost"
              value={
                formatCost(
                  task.estimated_cost_usd
                )
              }
              icon={
                <CircleDollarSign
                  size={11}
                />
              }
            />
          </div>

          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-600 transition group-hover:border-violet-500/20 group-hover:text-violet-400 lg:flex">
            <ChevronRight
              size={15}
            />
          </div>
        </div>
      </div>
    </button>
  );
}

/*
============================================================
TASK DETAILS MODAL
============================================================
*/

function TaskDetailsModal({
  task,
  onClose,
  onRefresh,
  refreshing,
  taskActionLoading,
  taskActionError,
  taskActionMessage,
  onCancel,
  onRetry,
}: {
  task:
    WorkforceTask;

  onClose:
    () => void;

  onRefresh:
    () => void;

  refreshing:
    boolean;

  taskActionLoading:
    ManageTaskAction | null;

  taskActionError:
    string;

  taskActionMessage:
    string;

  onCancel:
    () => void;

  onRetry:
    () => void;
}) {
  const controlsLocked =
    taskActionLoading !==
    null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-white/[0.08] bg-[#0b0b0e]/95 p-6 backdrop-blur">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <FileText
                size={18}
              />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                J10 WORKFORCE TASK
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="break-words text-xl font-semibold text-white sm:text-2xl">
                  {
                    task.title
                  }
                </h2>

                <WorkforceStatusBadge
                  status={
                    task.status
                  }
                />
              </div>

              <p className="mt-1 text-sm text-zinc-500">
                {
                  task.employee_name
                }{" "}
                ·{" "}
                <span className="capitalize">
                  {
                    task.task_type
                  }
                </span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={
                refreshing ||
                controlsLocked
              }
              onClick={
                onRefresh
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw
                size={15}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
            </button>

            <button
              type="button"
              disabled={
                controlsLocked
              }
              onClick={
                onClose
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X
                size={17}
              />
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.05] p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                size={17}
                className="mt-0.5 shrink-0 text-violet-400"
              />

              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  Exact Employee Binding
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  This task belongs to{" "}
                  <span className="text-zinc-300">
                    {
                      task.employee_name
                    }
                  </span>
                  .
                </p>

                <p className="mt-2 break-all text-[10px] text-zinc-700">
                  Employee ID:{" "}
                  {
                    task.employee_id
                  }
                </p>
              </div>
            </div>
          </div>

          <div>
            <SectionTitle
              eyebrow="Controls"
              title="Task Management"
            />

            <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <TaskManagementControls
                task={
                  task
                }
                loading={
                  taskActionLoading
                }
                error={
                  taskActionError
                }
                message={
                  taskActionMessage
                }
                onCancel={
                  onCancel
                }
                onRetry={
                  onRetry
                }
              />
            </div>
          </div>

          <div>
            <SectionTitle
              eyebrow="Execution"
              title="Task Runtime"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailMetric
                icon={
                  <Cpu
                    size={15}
                  />
                }
                label="Mode"
                value={
                  task.execution_mode ||
                  "Unknown"
                }
              />

              <DetailMetric
                icon={
                  <ShieldCheck
                    size={15}
                  />
                }
                label="API"
                value={
                  task.api_called
                    ? "Called"
                    : "Not Called"
                }
              />

              <DetailMetric
                icon={
                  <Bot
                    size={15}
                  />
                }
                label="Model"
                value={
                  task.display_model ||
                  task.target_model ||
                  "Not Run"
                }
              />

              <DetailMetric
                icon={
                  <CircleDollarSign
                    size={15}
                  />
                }
                label="Cost"
                value={
                  formatCost(
                    task.estimated_cost_usd
                  )
                }
              />
            </div>
          </div>

          <div>
            <SectionTitle
              eyebrow="Assignment"
              title="Task Information"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailMetric
                icon={
                  <UserRound
                    size={15}
                  />
                }
                label="AI Employee"
                value={
                  task.employee_name
                }
              />

              <DetailMetric
                icon={
                  <FileText
                    size={15}
                  />
                }
                label="Task Type"
                value={
                  capitalize(
                    task.task_type
                  )
                }
              />
            </div>
          </div>

          <TaskTextSection
            label="Task Instructions"
            text={
              task.instructions
            }
            emptyText="No task instructions were recorded."
          />

          <TaskTextSection
            label="Supplied Input"
            text={
              task.input_text
            }
            emptyText="No additional input was supplied."
          />

          <div>
            <SectionTitle
              eyebrow="Output"
              title="Task Result"
            />

            {task.result_text ? (
              <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2
                    size={15}
                    className="text-emerald-400"
                  />

                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">
                    Completed Output
                  </p>
                </div>

                <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                  {
                    task.result_text
                  }
                </div>
              </div>
            ) : (
              <TaskResultPlaceholder
                status={
                  task.status
                }
              />
            )}
          </div>

          {task.error_message && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] p-5">
              <div className="flex items-start gap-3">
                <TriangleAlert
                  size={17}
                  className="mt-0.5 shrink-0 text-red-400"
                />

                <div>
                  <p className="text-sm font-medium text-red-400">
                    Execution Error
                  </p>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                    {
                      task.error_message
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          <div>
            <SectionTitle
              eyebrow="History"
              title="Execution Timeline"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TimelineItem
                label="Created"
                value={
                  task.created_at
                }
              />

              <TimelineItem
                label="Started"
                value={
                  task.started_at
                }
              />

              <TimelineItem
                label="Completed"
                value={
                  task.completed_at
                }
              />

              <TimelineItem
                label="Last Updated"
                value={
                  task.updated_at
                }
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
              Task Identity
            </p>

            <p className="mt-3 break-all text-xs text-zinc-500">
              Task ID:{" "}
              <span className="text-zinc-400">
                {
                  task.id
                }
              </span>
            </p>

            <p className="mt-2 break-all text-xs text-zinc-500">
              Employee ID:{" "}
              <span className="text-zinc-400">
                {
                  task.employee_id
                }
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
============================================================
TASK MANAGEMENT CONTROLS
============================================================
*/

function TaskManagementControls({
  task,
  loading,
  error,
  message,
  onCancel,
  onRetry,
}: {
  task:
    WorkforceTask;

  loading:
    ManageTaskAction | null;

  error:
    string;

  message:
    string;

  onCancel:
    () => void;

  onRetry:
    () => void;
}) {
  return (
    <div className="space-y-4">
      {task.status ===
        "pending" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">
              Pending Task
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              This task has not started yet. You may cancel it before execution.
            </p>
          </div>

          <button
            type="button"
            disabled={
              loading !==
              null
            }
            onClick={
              onCancel
            }
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ===
            "cancel" ? (
              <LoaderCircle
                size={15}
                className="animate-spin"
              />
            ) : (
              <Ban
                size={15}
              />
            )}

            {loading ===
            "cancel"
              ? "Cancelling..."
              : "Cancel Task"}
          </button>
        </div>
      )}

      {task.status ===
        "failed" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">
              Failed Task
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Reset this failed execution and run it again using the same exact AI employee.
            </p>
          </div>

          <button
            type="button"
            disabled={
              loading !==
              null
            }
            onClick={
              onRetry
            }
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-300 transition hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ===
            "retry" ? (
              <LoaderCircle
                size={15}
                className="animate-spin"
              />
            ) : (
              <RotateCcw
                size={15}
              />
            )}

            {loading ===
            "retry"
              ? "Retrying..."
              : "Retry Task"}
          </button>
        </div>
      )}

      {task.status ===
        "running" && (
        <div className="flex items-start gap-3">
          <LoaderCircle
            size={17}
            className="mt-0.5 shrink-0 animate-spin text-blue-400"
          />

          <div>
            <p className="text-sm font-medium text-white">
              Execution in progress
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Task controls are locked while J10 is executing this task.
            </p>
          </div>
        </div>
      )}

      {task.status ===
        "completed" && (
        <div className="flex items-start gap-3">
          <CheckCircle2
            size={17}
            className="mt-0.5 shrink-0 text-emerald-400"
          />

          <div>
            <p className="text-sm font-medium text-white">
              Completed task
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Completed tasks are protected and read-only.
            </p>
          </div>
        </div>
      )}

      {task.status ===
        "cancelled" && (
        <div className="flex items-start gap-3">
          <Ban
            size={17}
            className="mt-0.5 shrink-0 text-zinc-500"
          />

          <div>
            <p className="text-sm font-medium text-white">
              Cancelled task
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              This task was cancelled before execution and is now read-only.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3">
          <div className="flex items-start gap-2">
            <TriangleAlert
              size={15}
              className="mt-0.5 shrink-0 text-red-400"
            />

            <p className="text-xs leading-5 text-red-300">
              {error}
            </p>
          </div>
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
          <div className="flex items-start gap-2">
            <CheckCircle2
              size={15}
              className="mt-0.5 shrink-0 text-emerald-400"
            />

            <p className="text-xs leading-5 text-emerald-300">
              {message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/*
============================================================
SECTION TITLE
============================================================
*/

function SectionTitle({
  eyebrow,
  title,
}: {
  eyebrow:
    string;

  title:
    string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-400">
        {eyebrow}
      </p>

      <h3 className="mt-1 text-lg font-semibold text-white">
        {title}
      </h3>
    </div>
  );
}

/*
============================================================
DETAIL METRIC
============================================================
*/

function DetailMetric({
  icon,
  label,
  value,
}: {
  icon:
    ReactNode;

  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-violet-400">
        {icon}

        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
          {label}
        </p>
      </div>

      <p className="mt-3 break-words text-sm font-medium text-zinc-200">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
TASK TEXT SECTION
============================================================
*/

function TaskTextSection({
  label,
  text,
  emptyText,
}: {
  label:
    string;

  text:
    string | null;

  emptyText:
    string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
        {label}
      </p>

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 p-5">
        <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
          {text?.trim() ||
            emptyText}
        </p>
      </div>
    </div>
  );
}

/*
============================================================
TASK RESULT PLACEHOLDER
============================================================
*/

function TaskResultPlaceholder({
  status,
}: {
  status:
    WorkforceTaskStatus;
}) {
  let title =
    "No result available";

  let description =
    "This task has not produced an output.";

  if (
    status ===
    "pending"
  ) {
    title =
      "Waiting for execution";

    description =
      "This task is Pending and has not been run yet.";
  }

  if (
    status ===
    "running"
  ) {
    title =
      "Task is running";

    description =
      "The assigned AI employee is currently executing this task.";
  }

  if (
    status ===
    "failed"
  ) {
    title =
      "Task failed";

    description =
      "No successful result was produced. Review the execution error below.";
  }

  if (
    status ===
    "cancelled"
  ) {
    title =
      "Task cancelled";

    description =
      "This task was cancelled before completion.";
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-white/[0.08] px-6 py-10 text-center">
      <FileText
        size={21}
        className="mx-auto text-zinc-700"
      />

      <p className="mt-3 text-sm font-medium text-zinc-400">
        {title}
      </p>

      <p className="mt-1 text-xs text-zinc-700">
        {description}
      </p>
    </div>
  );
}

/*
============================================================
TIMELINE ITEM
============================================================
*/

function TimelineItem({
  label,
  value,
}: {
  label:
    string;

  value:
    string | null;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <CalendarClock
          size={14}
          className="text-violet-400"
        />

        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
          {label}
        </p>
      </div>

      <p className="mt-3 text-xs leading-5 text-zinc-400">
        {value
          ? formatDateTime(
              value
            )
          : "Not recorded"}
      </p>
    </div>
  );
}

/*
============================================================
MINI TASK METRIC
============================================================
*/

function MiniTaskMetric({
  label,
  value,
  icon,
}: {
  label:
    string;

  value:
    string;

  icon?:
    ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-zinc-700">
        {label}
      </p>

      <div className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-400">
        {icon}

        <span className="truncate">
          {value}
        </span>
      </div>
    </div>
  );
}

/*
============================================================
STATUS BADGE
============================================================
*/

function WorkforceStatusBadge({
  status,
}: {
  status:
    WorkforceTaskStatus;
}) {
  const styles: Record<
    WorkforceTaskStatus,
    string
  > = {
    pending:
      "border-amber-500/20 bg-amber-500/10 text-amber-400",

    running:
      "border-blue-500/20 bg-blue-500/10 text-blue-400",

    completed:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",

    failed:
      "border-red-500/20 bg-red-500/10 text-red-400",

    cancelled:
      "border-zinc-500/20 bg-zinc-500/10 text-zinc-500",
  };

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}

/*
============================================================
COST
============================================================
*/

function formatCost(
  value:
    | number
    | string
) {
  const numericValue =
    Number(
      value ??
      0
    );

  if (
    Number.isNaN(
      numericValue
    ) ||
    numericValue ===
      0
  ) {
    return "$0";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        6,
    }
  ).format(
    numericValue
  );
}

/*
============================================================
DATE / TIME
============================================================
*/

function formatDateTime(
  value:
    string
) {
  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    }
  ).format(
    date
  );
}

/*
============================================================
CAPITALIZE
============================================================
*/

function capitalize(
  value:
    string
) {
  if (!value) {
    return "";
  }

  return (
    value
      .charAt(0)
      .toUpperCase() +
    value.slice(1)
  );
}