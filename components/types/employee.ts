export interface Employee {
  id: string;

  name: string;

  role: string;

  department: string;

  status: "Running" | "Paused" | "Offline";

  tasksCompleted: number;

  revenueGenerated: number;

  lastActive: string;

  avatar: string;

  model: string;
}

