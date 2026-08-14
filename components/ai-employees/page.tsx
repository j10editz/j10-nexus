"use client";

import { useMemo, useState } from "react";

import EmployeeHeader from "@/components/ai-employees/EmployeeHeader";
import EmployeeStats from "@/components/ai-employees/EmployeeStats";
import SearchBar from "@/components/ai-employees/SearchBar";
import Filters from "@/components/ai-employees/Filters";
import EmployeeGrid from "@/components/ai-employees/EmployeeGrid";
import CreateEmployeeModal from "@/components/ai-employees/CreateEmployeeModal";
import EmployeeDetailsModal from "@/components/ai-employees/EmployeeDetailsModal";

import { employees as initialEmployees } from "@/components/data/employees";
import type { Employee } from "@/components/types/employee";

export default function AIEmployeesPage() {
  const [employeeList, setEmployeeList] =
    useState<Employee[]>(initialEmployees);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [department, setDepartment] = useState("All");

  const [createOpen, setCreateOpen] = useState(false);

  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  const filteredEmployees = useMemo(() => {
    return employeeList.filter((employee) => {
      const searchValue = search.toLowerCase();

      const matchesSearch =
        employee.name.toLowerCase().includes(searchValue) ||
        employee.role.toLowerCase().includes(searchValue) ||
        employee.department.toLowerCase().includes(searchValue);

      const matchesStatus =
        status === "All" || employee.status === status;

      const matchesDepartment =
        department === "All" ||
        employee.department === department;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesDepartment
      );
    });
  }, [employeeList, search, status, department]);

  function createEmployee(employee: Employee) {
    setEmployeeList((current) => [
      employee,
      ...current,
    ]);
  }

  return (
    <>
      <div className="space-y-8">
        <EmployeeHeader
          onCreateEmployee={() => setCreateOpen(true)}
        />

        <EmployeeStats employees={employeeList} />

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
        onClose={() => setCreateOpen(false)}
        onCreate={createEmployee}
      />

      <EmployeeDetailsModal
        employee={selectedEmployee}
        open={selectedEmployee !== null}
        onClose={() => setSelectedEmployee(null)}
      />
    </>
  );
}