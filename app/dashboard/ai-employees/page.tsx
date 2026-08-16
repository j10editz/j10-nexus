"use client";

import { useEffect, useMemo, useState } from "react";

import EmployeeHeader from "@/components/ai-employees/EmployeeHeader";
import EmployeeStats from "@/components/ai-employees/EmployeeStats";
import SearchBar from "@/components/ai-employees/SearchBar";
import Filters from "@/components/ai-employees/Filters";
import EmployeeGrid from "@/components/ai-employees/EmployeeGrid";
import CreateEmployeeModal from "@/components/ai-employees/CreateEmployeeModal";
import EmployeeDetailsModal from "@/components/ai-employees/EmployeeDetailsModal";

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

function mapEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    department: row.department,
    status: row.status,
    tasksCompleted: row.tasks_completed,
    revenueGenerated: Number(row.revenue_generated),
    lastActive: row.last_active,
    avatar: row.avatar,
    model: row.model,
  };
}

export default function AIEmployeesPage() {
  const [supabase] = useState(() => createClient());

  const [employeeList, setEmployeeList] =
    useState<Employee[]>([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [department, setDepartment] = useState("All");

  const [createOpen, setCreateOpen] = useState(false);

  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  const [loading, setLoading] = useState(true);

  async function logActivity({
    action,
    entityId,
    title,
    description,
    metadata = {},
  }: ActivityInput) {
    const { error } = await supabase
      .from("activity_logs")
      .insert({
        action,
        entity_type: "ai_employee",
        entity_id: entityId,
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

  useEffect(() => {
    async function loadEmployees() {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        window.location.href = "/login";
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
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "Failed to load employees:",
          error
        );

        setLoading(false);
        return;
      }

      setEmployeeList(
        (data as EmployeeRow[]).map(mapEmployee)
      );

      setLoading(false);
    }

    loadEmployees();
  }, [supabase]);

  const filteredEmployees = useMemo(() => {
    return employeeList.filter((employee) => {
      const searchValue =
        search.trim().toLowerCase();

      const matchesSearch =
        employee.name
          .toLowerCase()
          .includes(searchValue) ||
        employee.role
          .toLowerCase()
          .includes(searchValue) ||
        employee.department
          .toLowerCase()
          .includes(searchValue);

      const matchesStatus =
        status === "All" ||
        employee.status === status;

      const matchesDepartment =
        department === "All" ||
        employee.department === department;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesDepartment
      );
    });
  }, [
    employeeList,
    search,
    status,
    department,
  ]);

  async function createEmployee(
    employee: Employee
  ) {
    const { data, error } = await supabase
      .from("employees")
      .insert({
        name: employee.name,
        role: employee.role,
        department: employee.department,
        status: employee.status,
        tasks_completed:
          employee.tasksCompleted,
        revenue_generated:
          employee.revenueGenerated,
        last_active: employee.lastActive,
        avatar: employee.avatar,
        model: employee.model,
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

    const createdEmployee = mapEmployee(
      data as EmployeeRow
    );

    setEmployeeList((current) => [
      createdEmployee,
      ...current,
    ]);

    setCreateOpen(false);

    await logActivity({
      action: "ai_employee_created",
      entityId: createdEmployee.id,
      title: `${createdEmployee.name} created`,
      description:
        `${createdEmployee.name} was created and added to your AI workforce.`,
      metadata: {
        source: "ai_employees_page",
        role: createdEmployee.role,
        department:
          createdEmployee.department,
        model: createdEmployee.model,
      },
    });
  }

  async function pauseEmployee(
    employee: Employee
  ) {
    const { data, error } = await supabase
      .from("employees")
      .update({
        status: "Paused",
        last_active: "Just now",
      })
      .eq("id", employee.id)
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

    const updatedEmployee = mapEmployee(
      data as EmployeeRow
    );

    setEmployeeList((current) =>
      current.map((item) =>
        item.id === employee.id
          ? updatedEmployee
          : item
      )
    );

    setSelectedEmployee(updatedEmployee);

    await logActivity({
      action: "ai_employee_paused",
      entityId: updatedEmployee.id,
      title: `${updatedEmployee.name} paused`,
      description:
        `${updatedEmployee.name} was paused and is no longer executing tasks.`,
      metadata: {
        role: updatedEmployee.role,
        department:
          updatedEmployee.department,
        status: "Paused",
      },
    });
  }

  async function resumeEmployee(
    employee: Employee
  ) {
    const { data, error } = await supabase
      .from("employees")
      .update({
        status: "Running",
        last_active: "Just now",
      })
      .eq("id", employee.id)
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

    const updatedEmployee = mapEmployee(
      data as EmployeeRow
    );

    setEmployeeList((current) =>
      current.map((item) =>
        item.id === employee.id
          ? updatedEmployee
          : item
      )
    );

    setSelectedEmployee(updatedEmployee);

    await logActivity({
      action: "ai_employee_resumed",
      entityId: updatedEmployee.id,
      title: `${updatedEmployee.name} resumed`,
      description:
        `${updatedEmployee.name} resumed operations and is running again.`,
      metadata: {
        role: updatedEmployee.role,
        department:
          updatedEmployee.department,
        status: "Running",
      },
    });
  }

  async function updateEmployee(
    employee: Employee
  ) {
    const previousEmployee =
      employeeList.find(
        (item) => item.id === employee.id
      );

    const { data, error } = await supabase
      .from("employees")
      .update({
        name: employee.name,
        role: employee.role,
        department: employee.department,
        status: employee.status,
        tasks_completed:
          employee.tasksCompleted,
        revenue_generated:
          employee.revenueGenerated,
        last_active: "Just now",
        avatar: employee.avatar,
        model: employee.model,
      })
      .eq("id", employee.id)
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

    const updatedEmployee = mapEmployee(
      data as EmployeeRow
    );

    setEmployeeList((current) =>
      current.map((item) =>
        item.id === employee.id
          ? updatedEmployee
          : item
      )
    );

    setSelectedEmployee(updatedEmployee);

    await logActivity({
      action: "ai_employee_edited",
      entityId: updatedEmployee.id,
      title: `${updatedEmployee.name} edited`,
      description:
        `${updatedEmployee.name}'s configuration was updated.`,
      metadata: {
        previous_name:
          previousEmployee?.name ?? null,
        name: updatedEmployee.name,
        role: updatedEmployee.role,
        department:
          updatedEmployee.department,
        model: updatedEmployee.model,
      },
    });
  }

  async function deleteEmployee(
    employee: Employee
  ) {
    const confirmed = window.confirm(
      `Delete ${employee.name}?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("id", employee.id);

    if (error) {
      console.error(
        "Failed to delete employee:",
        error
      );

      return;
    }

    setEmployeeList((current) =>
      current.filter(
        (item) => item.id !== employee.id
      )
    );

    setSelectedEmployee(null);

    await logActivity({
      action: "ai_employee_deleted",
      entityId: employee.id,
      title: `${employee.name} deleted`,
      description:
        `${employee.name} was removed from your AI workforce.`,
      metadata: {
        role: employee.role,
        department:
          employee.department,
        model: employee.model,
      },
    });
  }

  return (
    <>
      <div className="space-y-8">
        <EmployeeHeader
          onCreateEmployee={() =>
            setCreateOpen(true)
          }
        />

        <EmployeeStats
          employees={employeeList}
        />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchBar
            value={search}
            onChange={setSearch}
          />

          <Filters
            status={status}
            department={department}
            onStatusChange={setStatus}
            onDepartmentChange={
              setDepartment
            }
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
            onEmployeeClick={
              setSelectedEmployee
            }
          />
        )}
      </div>

      <CreateEmployeeModal
        open={createOpen}
        onClose={() =>
          setCreateOpen(false)
        }
        onCreate={createEmployee}
      />

      <EmployeeDetailsModal
        employee={selectedEmployee}
        open={selectedEmployee !== null}
        onClose={() =>
          setSelectedEmployee(null)
        }
        onPause={pauseEmployee}
        onResume={resumeEmployee}
        onDelete={deleteEmployee}
        onUpdate={updateEmployee}
      />
    </>
  );
}