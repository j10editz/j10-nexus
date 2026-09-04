export type WorkforceStatus = "active" | "on_leave" | "remote";

export interface WorkforceMember {
  id: string;
  userId?: string;
  name: string;
  role: string;
  department: string;
  email: string;
  phone?: string | null;
  status: WorkforceStatus;
  assignedAgents: string[];
  monthlySalary?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkforceSummary {
  totalHumanStaff: number;
  activeAIAgents: number;
  totalHoursSavedThisMonth: number;
  laborSavingsDollars: number;
  hybridLeverageRatio: number;
  departmentCounts: Record<string, number>;
}
