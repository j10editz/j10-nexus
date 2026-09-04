export type ContactType = "Lead" | "Prospect" | "Customer";

export type ContactStatus =
  | "New"
  | "Contacted"
  | "Qualified"
  | "Interested"
  | "Won"
  | "Lost";

export interface CRMContact {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  type: ContactType;
  status: ContactStatus;
  source: string;
  estimated_value: number;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CRMSummary {
  total: number;
  leads: number;
  prospects: number;
  customers: number;
  new: number;
  qualified: number;
  won: number;
  lost: number;
  pipelineValue: number;
  wonValue: number;
}

export interface KanbanColumn {
  stage: ContactStatus;
  label: string;
  contacts: CRMContact[];
  totalValue: number;
}
