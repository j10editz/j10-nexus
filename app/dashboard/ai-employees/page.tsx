"use client";

import { useEffect, useMemo, useState } from "react";

import EmployeeHeader from "@/components/ai-employees/EmployeeHeader";
import EmployeeStats from "@/components/ai-employees/EmployeeStats";
import SearchBar from "@/components/ai-employees/SearchBar";
import Filters from "@/components/ai-employees/Filters";
import EmployeeGrid from "@/components/ai-employees/EmployeeGrid";
import CreateEmployeeModal from "@/components/ai-employees/CreateEmployeeModal";
import EmployeeDetailsModal from "@/components/ai-employees/EmployeeDetailsModal";

import { employees as initialEmployees } from "@/components/data/employees";
import type { Employee } from "@/components/types/employee";

const STORAGE_KEY = "j10-nexus-employees";

export default function AIEmployeesPage() {
  const [employeeList, setEmployeeList] =
    useState<Employee[]>(initialEmployees);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [department, setDepartment] = useState("All");

  const [createOpen, setCreateOpen] = useState(false);

  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedEmployees = localStorage.getItem(STORAGE_KEY);

      if (savedEmployees) {
        const parsedEmployees = JSON.parse(savedEmployees);

        if (Array.isArray(parsedEmployees)) {
          setEmployeeList(parsedEmployees);
        }
      }
    } catch (error) {
      console.error("Failed to load saved employees:", error);
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(employeeList)
      );
    } catch (error) {
      console.error("Failed to save employees:", error);
    }
  }, [employeeList, storageLoaded]);

  const filteredEmployees = useMemo(() => {
    return employeeList.filter((employee) => {
      const searchValue = search.trim().toLowerCase();

      const matchesSearch =
        employee.name.toLowerCase().includes(searchValue) ||
        employee.role.toLowerCase().includes(searchValue) ||
        employee.department.toLowerCase().includes(searchValue);

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

  function createEmployee(employee: Employee) {
    setEmployeeList((current) => [
      employee,
      ...current,
    ]);
  }

  function pauseEmployee(employee: Employee) {
    const updatedEmployee: Employee = {
      ...employee,
      status: "Paused",
      lastActive: "Just now",
    };

    setEmployeeList((current) =>
      current.map((item) =>
        item.id === employee.id
          ? updatedEmployee
          : item
      )
    );

    setSelectedEmployee(updatedEmployee);
  }

  function resumeEmployee(employee: Employee) {
    const updatedEmployee: Employee = {
      ...employee,
      status: "Running",
      lastActive: "Just now",
    };

    setEmployeeList((current) =>
      current.map((item) =>
        item.id === employee.id
          ? updatedEmployee
          : item
      )
    );

    setSelectedEmployee(updatedEmployee);
  }

  function updateEmployee(employee: Employee) {
    const updatedEmployee: Employee = {
      ...employee,
      lastActive: "Just now",
    };

    setEmployeeList((current) =>
      current.map((item) =>
        item.id === employee.id
          ? updatedEmployee
          : item
      )
    );

    setSelectedEmployee(updatedEmployee);
  }

  function deleteEmployee(employee: Employee) {
    const confirmed = window.confirm(
      `Delete ${employee.name}?`
    );

    if (!confirmed) return;

    setEmployeeList((current) =>
      current.filter(
        (item) => item.id !== employee.id
      )
    );

    setSelectedEmployee(null);
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
            onDepartmentChange={setDepartment}
          />
        </div>

        <EmployeeGrid
          employees={filteredEmployees}
          onEmployeeClick={setSelectedEmployee}
        />
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